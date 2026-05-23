import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import config from '../tailwind.config';
import { SVGDefs } from '../src/components/ui/SVGDefs';

describe('design tokens', () => {
  it('exposes CC storybook palette', () => {
    const colors = (config.theme?.extend?.colors ?? {}) as Record<string, string>;
    expect(colors.paper).toBe('#FBF5E6');
    expect(colors.paperDeep).toBe('#F4EAD0');
    expect(colors.paperShadow).toBe('#E8DDC0');
    expect(colors.ink).toBe('#3D3326');
    expect(colors.inkSoft).toBe('#6B5D4A');
    expect(colors.inkPale).toBe('#A89A82');
    expect(colors.rose).toBe('#F2C7C1');
    expect(colors.roseDeep).toBe('#D89991');
    expect(colors.butter).toBe('#F4DFA5');
    expect(colors.butterDeep).toBe('#D9B863');
    expect(colors.mint).toBe('#C9DFC8');
    expect(colors.mintDeep).toBe('#7FA77E');
    expect(colors.sky).toBe('#C8D8E4');
    expect(colors.skyDeep).toBe('#6E92A8');
    expect(colors.lilac).toBe('#D8CCE0');
    expect(colors.lilacDeep).toBe('#A187B5');
    expect(colors.peach).toBe('#F4D2B5');
    expect(colors.peachDeep).toBe('#D49A6A');
    expect(colors.catFur).toBe('#FAF6EE');
    expect(colors.catShadow).toBe('#E2D9C8');
    expect(colors.catGray).toBe('#9E9586');
    expect(colors.catGrayDeep).toBe('#6E665A');
    expect(colors.catPink).toBe('#E4ADA8');
    expect(colors.ember).toBe('#E47B5A');
  });

  it('exposes paper radii and shadows', () => {
    const radii = (config.theme?.extend?.borderRadius ?? {}) as Record<string, string>;
    const shadows = (config.theme?.extend?.boxShadow ?? {}) as Record<string, string>;
    expect(radii['paper-sm']).toBe('10px');
    expect(radii['paper-md']).toBe('18px');
    expect(radii['paper-lg']).toBe('28px');
    expect(radii['paper-pill']).toBe('9999px');
    expect(shadows.paper).toBe('3px 4px 0 #E8DDC0');
    expect(shadows['paper-hero']).toBe('6px 7px 0 #E8DDC0');
    expect(shadows['state-mint']).toBe('0 0 0 6px rgba(201, 223, 200, 0.53)');
    expect(shadows['state-peach']).toBe('0 0 0 6px rgba(244, 210, 181, 0.53)');
    expect(shadows['state-sky']).toBe('0 0 0 4px rgba(200, 216, 228, 0.67)');
  });

  it('exposes CC font families', () => {
    const fontFamily = (config.theme?.extend?.fontFamily ?? {}) as Record<string, string[]>;
    expect(fontFamily.zh).toEqual(['var(--font-zh)']);
    expect(fontFamily.display).toEqual(['var(--font-display)']);
    expect(fontFamily.en).toEqual(['var(--font-en)']);
    expect(fontFamily['en-script']).toEqual(['var(--font-en-script)']);
    expect(fontFamily.mono).toEqual(['var(--font-mono)']);
  });

  it('defines global web fonts and CSS font variables', () => {
    const globals = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    const layout = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8');
    // All 5 fonts loaded via next/font/local with self-hosted woff2 files
    expect(layout).toContain("from 'next/font/local'");
    expect(layout).toContain('ZCOOLKuaiLe');
    expect(layout).toContain('Fredoka');
    expect(layout).toContain('Caveat');
    expect(layout).toContain('JetBrainsMono');
    expect(layout).toContain('LXGWWenKaiTC');
    // globals.css should NOT have the render-blocking @import
    expect(globals).not.toContain('@import url(');
    // CSS variables still declared in globals.css
    expect(globals).toContain('--font-zh:');
    expect(globals).toContain('--font-display:');
    expect(globals).toContain('--font-en:');
    expect(globals).toContain('--font-en-script:');
    expect(globals).toContain('--font-mono:');
  });


  it('disables sparkle motion for reduced-motion users', () => {
    const globals = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    expect(globals).toContain('@media (prefers-reduced-motion: reduce)');
    expect(globals).toContain('.magic-sparkle');
    expect(globals).toContain('animation: none !important');
    expect(globals).toContain('transform: none !important');
  });

  it('renders and mounts shared SVG defs', () => {
    const markup = renderToStaticMarkup(createElement(SVGDefs));
    const layout = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8');
    for (const id of ['paperGrain', 'watercolor', 'wobble', 'softShadow', 'bleed', 'hatch', 'dots', 'paperVignette']) {
      expect(markup).toContain(`id="${id}"`);
    }
    expect(layout).toContain('import { SVGDefs }');
    expect(layout).toContain('<SVGDefs />');
  });
});
