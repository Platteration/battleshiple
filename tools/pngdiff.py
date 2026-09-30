"""Compare two trees of screenshots pixel by pixel.

    python3 tools/pngdiff.py BEFORE_DIR AFTER_DIR [--tolerance N]

Prints, per image present in both trees, how many pixels differ by more than
the tolerance in any channel. Exits non-zero if any image differs, so a
"pixel-identical" refactor can be asserted rather than eyeballed.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pngkit import read_png  # noqa: E402


def compare(a_path, b_path, tolerance):
    # Chromium encodes identical pixels to identical bytes, so the common case —
    # nothing changed — needs no decoding, which is slow in pure Python.
    with open(a_path, 'rb') as fa, open(b_path, 'rb') as fb:
        if fa.read() == fb.read():
            return 0, 1
    wa, ha, ca, a = read_png(a_path)
    wb, hb, cb, b = read_png(b_path)
    if (wa, ha, ca) != (wb, hb, cb):
        return None
    diff = 0
    for px in range(wa * ha):
        o = px * ca
        for ch in range(ca):
            if abs(a[o + ch] - b[o + ch]) > tolerance:
                diff += 1
                break
    return diff, wa * ha


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    before, after = argv[0], argv[1]
    tolerance = int(argv[argv.index('--tolerance') + 1]) if '--tolerance' in argv else 0
    worst = 0
    for root, _, files in sorted(os.walk(before)):
        for name in sorted(files):
            if not name.endswith('.png'):
                continue
            rel = os.path.relpath(os.path.join(root, name), before)
            other = os.path.join(after, rel)
            if not os.path.exists(other):
                print(f'  missing     {rel}')
                worst = max(worst, 1)
                continue
            result = compare(os.path.join(root, name), other, tolerance)
            if result is None:
                print(f'  SIZE DIFF   {rel}')
                worst = 1
                continue
            diff, total = result
            status = 'identical' if diff == 0 else f'{diff} px ({100 * diff / total:.3f}%)'
            print(f'  {status:<22}{rel}')
            if diff:
                worst = 1
    return worst


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
