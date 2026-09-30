import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { getTheme, legacy } from '../src/ui/theme';

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
  test('one stable theme object per palette, so style caches can key on identity', () => {
    expect(getTheme('legacy')).toBe(getTheme('legacy'));
    expect(getTheme('legacy').palette).toBe(legacy);
    expect(Object.isFrozen(getTheme('legacy'))).toBe(true);
  });

  test('every ship class has a token colour', () => {
    const classes = ['carrier', 'battleship', 'destroyer', 'submarine', 'patrol'] as const;
    for (const c of classes) expect(legacy.token.fill[c]).toMatch(/^#|^rgba/);
  });
});
