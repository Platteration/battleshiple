import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { contrast, day, getTheme, GRAPHIC_MIN, night, Palette, resolveLamp, TEXT_MIN } from '../src/ui/theme';

const ROOT = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(full) ? [full] : [];
  });
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('theme discipline', () => {
  // A colour hard-coded in a component silently ignores the night palette, and
  // the restyle cannot be switched on until every one is gone.
  const uiFiles = [...sourceFiles(join(ROOT, 'src', 'ui')), join(ROOT, 'App.tsx')].filter(
    (f) => !f.includes(join('src', 'ui', 'theme')),
  );

  test('no component or screen contains a colour literal', () => {
    const offenders = uiFiles.filter((f) =>
      /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(stripComments(readFileSync(f, 'utf8'))),
    );
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });

  test('nothing imports the removed raw colour constants', () => {
    const offenders = uiFiles.filter((f) => /\b(colors|shipColors)\b/.test(stripComments(readFileSync(f, 'utf8'))));
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });
});

describe('theme objects', () => {
  test('one stable theme per (palette, fonts), so style caches can key on identity', () => {
    expect(getTheme('day')).toBe(getTheme('day'));
    expect(getTheme('day', true)).toBe(getTheme('day', true));
    expect(getTheme('day', true)).not.toBe(getTheme('day', false));
    expect(getTheme('night').palette).toBe(night);
    expect(Object.isFrozen(getTheme('day'))).toBe(true);
  });

  test('type falls back to system weights until fonts load, then uses per-weight families', () => {
    const before = getTheme('day', false).type;
    const after = getTheme('day', true).type;
    expect(before.display.fontFamily).toBeUndefined();
    expect(before.display.fontWeight).toBeDefined();
    // Android does not synthesise weight on a custom face, so a loaded family
    // must carry its weight in its name and set no fontWeight.
    expect(after.display.fontFamily).toBe('Stencil-Bold');
    expect(after.display.fontWeight).toBeUndefined();
    expect(after.teletype.fontFamily).toBe('Mono-Regular');
  });

  test('the lamp follows the device only when set to auto', () => {
    expect(resolveLamp('auto', 'dark')).toBe('night');
    expect(resolveLamp('auto', 'light')).toBe('day');
    expect(resolveLamp('auto', null)).toBe('day');
    expect(resolveLamp('day', 'dark')).toBe('day');
    expect(resolveLamp('night', 'light')).toBe('night');
  });
});

/**
 * Every pairing the UI actually draws, with the WCAG floor it must clear:
 * 4.5:1 for text, 3:1 for marks, lines and outlines. Checked in both
 * palettes, because night mode is red-monochrome and easy to get wrong.
 */
function pairings(p: Palette): [string, string, string, number][] {
  const rows: [string, string, string, number][] = [
    ['primary ink on paper', p.ink.primary, p.surface.base, TEXT_MIN],
    ['primary ink on cards', p.ink.primary, p.surface.raised, TEXT_MIN],
    ['primary ink on water', p.ink.primary, p.board.water, TEXT_MIN],
    ['secondary ink on paper', p.ink.secondary, p.surface.base, TEXT_MIN],
    ['secondary ink on cards', p.ink.secondary, p.surface.raised, TEXT_MIN],
    ['text on the primary action', p.ink.onAccent, p.accent.fill, TEXT_MIN],
    ['accent text on paper', p.accent.text, p.surface.base, TEXT_MIN],
    ['danger text on paper', p.signal.danger, p.surface.base, TEXT_MIN],
    ['ready text on cards', p.signal.success, p.surface.raised, TEXT_MIN],
    ['coordinates on paper', p.board.label, p.surface.base, TEXT_MIN],
    ['grid on water', p.board.grid, p.board.water, GRAPHIC_MIN],
    ['quadrant dividers on water', p.board.sectorLine, p.board.water, GRAPHIC_MIN],
    ['sector labels on water', p.board.sectorLabel, p.board.water, GRAPHIC_MIN],
    ['hit mark on water', p.pencil.hit, p.board.water, GRAPHIC_MIN],
    ['miss mark on water', p.pencil.miss, p.board.water, GRAPHIC_MIN],
    ['aged mark on water', p.pencil.aged, p.board.water, GRAPHIC_MIN],
    ['target on water', p.pencil.target, p.board.water, GRAPHIC_MIN],
    ['hit mark on its halo', p.pencil.hit, p.pencil.hitHalo, GRAPHIC_MIN],
    ['contact report on water', p.intel.stroke, p.board.water, GRAPHIC_MIN],
    ['selection on water', p.selected, p.board.water, GRAPHIC_MIN],
    ['stamp on paper', p.stamp.ink, p.surface.base, GRAPHIC_MIN],
    ['legal preview outline', p.preview.okStroke, p.board.water, GRAPHIC_MIN],
    ['illegal preview outline', p.preview.badStroke, p.board.water, GRAPHIC_MIN],
    ['token outline on water', p.token.stroke, p.board.water, GRAPHIC_MIN],
  ];
  for (const [cls, fill] of Object.entries(p.token.fill)) {
    rows.push([`token outline on ${cls}`, p.token.stroke, fill, GRAPHIC_MIN]);
    rows.push([`token detail on ${cls}`, p.token.mark, fill, GRAPHIC_MIN]);
  }
  return rows;
}

describe.each([
  ['day', day],
  ['night', night],
])('%s palette contrast', (_name, palette) => {
  test.each(pairings(palette))('%s', (_label, fg, bg, min) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min);
  });
});

describe('contrast helper', () => {
  test('matches known WCAG values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrast('#1B2A41', '#EFE6D2')).toBeCloseTo(11.64, 1);
  });

  test('refuses translucent colours rather than guessing', () => {
    expect(() => contrast('rgba(0,0,0,0.5)', '#ffffff')).toThrow();
  });
});
