"""Render Battleshiple's app icons procedurally.

No image libraries are available in this environment, so this writes PNGs directly
(zlib is stdlib) and antialiases by evaluating signed distance fields per pixel.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pngkit import (  # noqa: E402
    _beam_at, clamp, cover, hexrgb, over, sd_circle, sd_hull_local, sd_ring,
    sd_round_box, smoothstep, to_local, write_png,
)


# ---------- palette ----------
# The shared illustrated-tabletop palette (VISUAL_STYLE.md / src/ui/theme):
# deep ink ground, a muted sea-glass grid, the in-game splash colour for the
# rings, and the amber accent for the hull.
BG        = hexrgb('#19232d')   # deep ink: surface.base (dark)
BG_DEEP   = hexrgb('#111920')   # vignette corners
GRID      = hexrgb('#526674')   # surface.border (dark)
RIPPLE    = hexrgb('#9be0ff')   # intel.stroke (dark): the splash
SHIP      = hexrgb('#e8bd70')   # accent.fill: amber
SHIP_DARK = hexrgb('#b58a3e')   # darker amber for deck details
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

if __name__ == "__main__":
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
