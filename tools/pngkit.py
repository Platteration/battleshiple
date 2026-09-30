"""Shared helpers for Battleshiple's procedural asset generators.

No image libraries are available where these tools were written, so PNGs are
written directly (zlib is stdlib) and shapes are antialiased by evaluating
signed distance fields per pixel. Used by generate-icons.py and
generate-textures.py.
"""
import math, struct, zlib

# ---------- PNG output ----------
# PNG colour types: 6 = RGBA (4 bytes/pixel), 4 = grey + alpha (2 bytes/pixel).
COLOR_RGBA = 6
COLOR_GREY_ALPHA = 4
_CHANNELS = {COLOR_RGBA: 4, COLOR_GREY_ALPHA: 2}

def write_png(path, w, h, pixels, color_type=COLOR_RGBA):
    """pixels: flat bytearray of rows, 4 bytes/pixel for RGBA or 2 for grey+alpha."""
    raw = bytearray()
    stride = w * _CHANNELS[color_type]
    for y in range(h):
        raw.append(0)                       # filter type 0
        raw += pixels[y * stride:(y + 1) * stride]
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, color_type, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)

# ---------- helpers ----------
def hexrgb(s):
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))

def clamp(v, lo=0.0, hi=1.0):
    return lo if v < lo else hi if v > hi else v

def smoothstep(e0, e1, x):
    t = clamp((x - e0) / (e1 - e0))
    return t * t * (3 - 2 * t)

def cover(d, aa):
    """Coverage from a signed distance (negative = inside)."""
    return 1.0 - smoothstep(-aa, aa, d)

def over(dst, src, a):
    """Alpha-composite src over dst, both (r,g,b), a in 0..1."""
    return (dst[0] + (src[0] - dst[0]) * a,
            dst[1] + (src[1] - dst[1]) * a,
            dst[2] + (src[2] - dst[2]) * a)

# ---------- signed distance fields (units: fraction of image size) ----------
def sd_circle(px, py, cx, cy, r):
    return math.hypot(px - cx, py - cy) - r

def sd_ring(px, py, cx, cy, r, half_w):
    return abs(math.hypot(px - cx, py - cy) - r) - half_w

def sd_round_box(px, py, cx, cy, hw, hh, r, ang):
    """Rounded box centred at (cx,cy), half-extents hw/hh, corner radius r, rotated by ang."""
    dx, dy = px - cx, py - cy
    ca, sa = math.cos(-ang), math.sin(-ang)
    lx, ly = dx * ca - dy * sa, dx * sa + dy * ca
    qx, qy = abs(lx) - (hw - r), abs(ly) - (hh - r)
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r

def _beam_at(t, half_beam):
    """Local beam at fore-aft position t in [-1, 1] (1 = bow).

    A warship seen from above has a long parallel midbody, a fine bow and a
    blunt, slightly rounded stern. Tapering from amidships (the obvious thing)
    reads as a leaf instead of a hull.
    """
    if t >= 0.30:                                  # forward third: taper to a point
        u = (t - 0.30) / 0.70
        return half_beam * max(0.0, 1.0 - u ** 1.9) ** 0.62
    if t <= -0.80:                                 # round off the transom
        u = (-t - 0.80) / 0.20
        return half_beam * (0.04 + 0.96 * math.sqrt(max(0.0, 1.0 - u * u)))
    return half_beam                               # parallel midbody

def to_local(px, py, cx, cy, ang):
    dx, dy = px - cx, py - cy
    ca, sa = math.cos(-ang), math.sin(-ang)
    return dx * ca - dy * sa, dx * sa + dy * ca

def sd_hull_local(lx, ly, half_len, half_beam):
    """Approximate SDF for the hull, in hull-local coordinates."""
    t = clamp(ly / half_len, -1.0, 1.0)
    beam = max(_beam_at(t, half_beam), 1e-5)
    return max(abs(lx) - beam, abs(ly) - half_len)

