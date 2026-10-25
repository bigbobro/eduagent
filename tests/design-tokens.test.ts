import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import config from '../tailwind.config';

describe('design tokens', () => {
  it('exposes G shell colors', () => {
    const colors = (config.theme?.extend?.colors ?? {}) as Record<string, { DEFAULT?: string } | string>;
    expect(colors.primary).toMatchObject({ DEFAULT: '#6842FF' });
    expect(colors.success).toMatchObject({ DEFAULT: '#2DD4BF' });
    expect(colors.accent).toMatchObject({ DEFAULT: '#FF9F2E' });
    expect(colors.text).toMatchObject({ DEFAULT: '#1E293B' });
    expect(colors.glass).toBe('rgba(255,255,255,.55)');
    expect(colors).not.toHaveProperty('paper');
    expect(colors).not.toHaveProperty('butter');
    expect(colors).not.toHaveProperty('ink');
  });

  it('exposes G radii and shadows', () => {
    const radii = (config.theme?.extend?.borderRadius ?? {}) as Record<string, string>;
    const shadows = (config.theme?.extend?.boxShadow ?? {}) as Record<string, string>;
    expect(radii.control).toBe('10px');
    expect(radii.panel).toBe('16px');
    expect(radii.card).toBe('24px');
    expect(radii).not.toHaveProperty('paper-md');
    expect(shadows.rim).toContain('inset 0 1px 0');
    expect(shadows.lift).toContain('rgba(104,66,255');
    expect(shadows).not.toHaveProperty('paper');
  });

  it('keeps system Chinese and Fredoka English families', () => {
    const fontFamily = (config.theme?.extend?.fontFamily ?? {}) as Record<string, string[]>;
    expect(fontFamily.zh).toEqual(['var(--font-zh)']);
    expect(fontFamily.en).toEqual(['var(--font-en)']);
    expect(fontFamily).not.toHaveProperty('display');
    expect(fontFamily).not.toHaveProperty('en-script');
    expect(fontFamily).not.toHaveProperty('mono');
  });

  it('loads only Fredoka and keeps reduced motion', () => {
    const globals = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    const layout = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8');
    expect(layout).toContain("from 'next/font/local'");
    expect(layout).toContain('Fredoka');
    expect(layout).not.toContain('SVGDefs');
    expect(globals).toContain('--font-zh: -apple-system, BlinkMacSystemFont');
    expect(globals).toContain('--font-mono:');
    expect(globals).not.toContain('--font-display');
    expect(globals).not.toContain('--font-en-script');
    expect(globals).not.toContain('.paper-bg');
    expect(globals).not.toContain('@import url(');
    expect(globals).toContain('@media (prefers-reduced-motion: reduce)');
    expect(globals).toContain('animation-duration: 0.01ms !important');
  });
});
