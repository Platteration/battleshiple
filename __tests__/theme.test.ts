import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { contrast, dark, getTheme, GRAPHIC_MIN, light, Palette, resolveTheme, TEXT_MIN, typeScale } from '../src/ui/theme';

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
  test('one stable theme per palette, so style caches can key on identity', () => {
    expect(getTheme('light')).toBe(getTheme('light'));
    expect(getTheme('dark')).toBe(getTheme('dark'));
    expect(getTheme('dark').palette).toBe(dark);
    expect(Object.isFrozen(getTheme('light'))).toBe(true);
  });

  test('text stays in the platform sans-serif, as VISUAL_STYLE.md requires', () => {
    // Weight establishes hierarchy; no style in the scale may name a typeface.
    for (const [role, style] of Object.entries(typeScale)) {
      expect({ role, fontFamily: style.fontFamily }).toEqual({ role, fontFamily: undefined });
    }
  });

  test('the theme follows the device only when set to system', () => {
    expect(resolveTheme('system', 'dark')).toBe('dark');
    expect(resolveTheme('system', 'light')).toBe('light');
    expect(resolveTheme('light', 'dark')).toBe('light');
    expect(resolveTheme('dark', 'light')).toBe('dark');
  });

  test('a device that reports no scheme gets dark, as CONVENTIONS.md decides', () => {
    // `system === 'light' ? 'light' : 'dark'`: anything but an explicit light is dark.
    expect(resolveTheme('system', null)).toBe('dark');
    expect(resolveTheme('system', undefined)).toBe('dark');
    expect(resolveTheme('system', 'unspecified')).toBe('dark');
  });
});

/**
 * Every pairing the UI actually draws, with the WCAG floor it must clear:
 * 4.5:1 for text, 3:1 for marks, lines and outlines — and, per AGENTS.md
 * section 6, a piece must be distinguishable from the board it sits on.
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
    // Text (NW, NE, SW, SE), so the text floor, not the graphic one.
    ['sector labels on water', p.board.sectorLabel, p.board.water, TEXT_MIN],
    ['hit mark on water', p.pencil.hit, p.board.water, GRAPHIC_MIN],
    ['miss mark on water', p.pencil.miss, p.board.water, GRAPHIC_MIN],
    ['aged mark on water', p.pencil.aged, p.board.water, GRAPHIC_MIN],
    ['target on water', p.pencil.target, p.board.water, GRAPHIC_MIN],
    ['hit mark on its halo', p.pencil.hit, p.pencil.hitHalo, GRAPHIC_MIN],
    ['contact report on water', p.intel.stroke, p.board.water, GRAPHIC_MIN],
    ['selection on water', p.selected, p.board.water, GRAPHIC_MIN],
    ['stamp on paper', p.stamp.ink, p.surface.base, GRAPHIC_MIN],
    ['SUNK badge text on its badge', p.stamp.ink, p.surface.base, TEXT_MIN],
    ['legal preview outline', p.preview.okStroke, p.board.water, GRAPHIC_MIN],
    ['illegal preview outline', p.preview.badStroke, p.board.water, GRAPHIC_MIN],
    ['token outline on water', p.token.stroke, p.board.water, GRAPHIC_MIN],
    ['switch track (on) on cards', p.control.trackOn, p.surface.raised, GRAPHIC_MIN],
    ['switch track (off) on cards', p.control.trackOff, p.surface.raised, GRAPHIC_MIN],
    ['switch thumb on its track (on)', p.control.thumb, p.control.trackOn, GRAPHIC_MIN],
    ['switch thumb on its track (off)', p.control.thumb, p.control.trackOff, GRAPHIC_MIN],
  ];
  // The crisp outline is what separates a piece from the board ('token
  // outline on water' above); the fill sits inside it. What must read on the
  // fill itself is the detail drawn there: the bow marker.
  for (const cls of Object.keys(p.token.fill) as (keyof Palette['token']['fill'])[]) {
    rows.push([`bow marker on ${cls}`, p.token.mark[cls], p.token.fill[cls], GRAPHIC_MIN]);
  }
  return rows;
}

describe.each([
  ['light', light],
  ['dark', dark],
])('%s palette contrast', (_name, palette) => {
  test.each(pairings(palette))('%s', (_label, fg, bg, min) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min);
  });
});

describe('contrast helper', () => {
  test('matches known WCAG values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrast('#19232d', '#f5f0e6')).toBeCloseTo(14.3, 0);
  });

  test('refuses translucent colours rather than guessing', () => {
    expect(() => contrast('rgba(0,0,0,0.5)', '#ffffff')).toThrow();
  });
});
