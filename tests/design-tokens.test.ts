import { describe, it, expect } from 'vitest';
import config from '../tailwind.config';

describe('design tokens', () => {
  it('exposes bunny palette', () => {
    const colors = (config.theme?.extend?.colors ?? {}) as Record<string, string>;
    expect(colors['bunny-bg-cream']).toBe('#FFF8EE');
    expect(colors['bunny-grass']).toBe('#B9D7A0');
    expect(colors['bunny-pink']).toBe('#F4B5B0');
    expect(colors['bunny-ink']).toBe('#4B3F35');
    expect(colors['bunny-bg-night']).toBe('#2B2540');
  });

  it('exposes bunny radii', () => {
    const radii = (config.theme?.extend?.borderRadius ?? {}) as Record<string, string>;
    expect(radii['bunny-lg']).toBe('28px');
    expect(radii['bunny-md']).toBe('20px');
  });

  it('exposes bunny shadows', () => {
    const shadows = (config.theme?.extend?.boxShadow ?? {}) as Record<string, string>;
    expect(shadows['soft']).toMatch(/rgba\(75, 63, 53, 0\.08\)/);
    expect(shadows['bunny']).toMatch(/rgba\(244, 181, 176/);
  });
});
