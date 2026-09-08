"""Render Battleshiple's app icons procedurally.

No image libraries are available in this environment, so this writes PNGs directly
(zlib is stdlib) and antialiases by evaluating signed distance fields per pixel.
"""
import math, struct, zlib

# ---------- PNG output ----------
def write_png(path, w, h, pixels):
    """pixels: flat bytearray of RGBA rows."""
    raw = bytearray()
    stride = w * 4
    for y in range(h):
        raw.append(0)                       # filter type 0
        raw += pixels[y * stride:(y + 1) * stride]
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
           + chunk(b'IEND', b''))
    open(path, 'wb').write(png)

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

# ---------- palette ----------
BG        = hexrgb('#061a2b')
BG_DEEP   = hexrgb('#03101c')
GRID      = hexrgb('#164466')
RIPPLE    = hexrgb('#9be0ff')
SHIP      = hexrgb('#ffd166')
SHIP_DARK = hexrgb('#c99a3f')
WHITE     = (255, 255, 255)

# local +y is forward and screen y points down, so the bow direction is
# (-sin a, cos a); -148 deg aims it up and to the right.
SHIP_ANGLE = math.radians(-148)
SHIP_CX, SHIP_CY = 0.50, 0.50
HALF_LEN, HALF_BEAM = 0.200, 0.0525
RINGS = ((0.262, 0.0105, 0.95), (0.335, 0.0085, 0.60), (0.408, 0.0068, 0.32))

def render(size, *, background=True, grid=True, ripples=True, ship=True,
           mono=False, scale=1.0, max_rings=3):
    """Render one icon. `scale` shrinks artwork (Android adaptive safe zone)."""
    aa = 0.7 / size
    px_buf = bytearray(size * size * 4)
    cx, cy = 0.5, 0.5

    def S(v):
        return v * scale

    for yi in range(size):
        py = (yi + 0.5) / size
        row = yi * size * 4
        for xi in range(size):
            px = (xi + 0.5) / size
            col = BG
            alpha = 0.0

            if background:
                # Vignette: lighter at the centre, deepening towards the corners.
                d = math.hypot(px - cx, py - cy) / 0.7071
                col = over(BG, BG_DEEP, clamp(d * 0.95))
                alpha = 1.0

            # Local coords relative to the artwork centre, so `scale` shrinks everything.
            lx = cx + (px - cx) / scale
            ly = cy + (py - cy) / scale
            laa = aa / scale

            if grid:
                # Faint battleship grid.
                for i in range(1, 5):
                    g = i / 5.0 * 0.66 + 0.17
                    for dd in (abs(lx - g), abs(ly - g)):
                        c = cover(dd - 0.0016, laa)
                        if c > 0:
                            col = over(col, GRID, c * 0.55)

            if ripples:
                # Concentric splash rings centred on the hull.
                for r, w, a in RINGS[:max_rings]:
                    d = sd_ring(lx, ly, SHIP_CX, SHIP_CY, r, w)
                    c = cover(d, laa)
                    if c > 0:
                        tint = WHITE if mono else RIPPLE
                        col = over(col, tint, c * a)
                        alpha = max(alpha, c * a)

            if ship:
                hx, hy = to_local(lx, ly, SHIP_CX, SHIP_CY, SHIP_ANGLE)
                d = sd_hull_local(hx, hy, HALF_LEN, HALF_BEAM)
                c = cover(d, laa)
                if c > 0:
                    col = over(col, WHITE if mono else SHIP, c)
                    alpha = max(alpha, c)
                if not mono and c > 0:
                    # Bridge amidships plus a turret fore and aft. Kept sparse:
                    # at 48px anything finer turns to mud.
                    db = sd_round_box(hx, hy, 0, -0.008, 0.020, 0.040, 0.010, 0)
                    cb = cover(db, laa)
                    if cb > 0:
                        col = over(col, SHIP_DARK, cb)
                    for ty in (0.072, -0.092):
                        ct = cover(sd_circle(hx, hy, 0, ty, 0.0165), laa)
                        if ct > 0:
                            col = over(col, SHIP_DARK, ct)

            o = row + xi * 4
            px_buf[o] = int(clamp(col[0] / 255) * 255 + 0.5)
            px_buf[o + 1] = int(clamp(col[1] / 255) * 255 + 0.5)
            px_buf[o + 2] = int(clamp(col[2] / 255) * 255 + 0.5)
            px_buf[o + 3] = int(clamp(alpha) * 255 + 0.5)
    return px_buf

import sys
out = sys.argv[1]
jobs = [
    # Full icon: everything, opaque.
    ('icon.png', 1024, dict()),
    # At 48px the full composition turns to mud, so the favicon gets a bigger
    # hull, one ring and no grid.
    ('favicon.png', 48, dict(grid=False, max_rings=1, scale=1.55)),
    # Splash: artwork only on a transparent field (app.json paints the background).
    ('splash-icon.png', 1024, dict(background=False, grid=False, scale=0.72)),
    # Android adaptive icon: background and foreground are separate layers.
    ('android-icon-background.png', 512, dict(ripples=False, ship=False)),
    ('android-icon-foreground.png', 512, dict(background=False, grid=False, scale=0.75)),
    ('android-icon-monochrome.png', 432, dict(background=False, grid=False, mono=True, scale=0.75)),
]
for name, size, kw in jobs:
    buf = render(size, **kw)
    write_png(f'{out}/{name}', size, size, buf)
    print(f'  {name:34s} {size}x{size}')
