const { test, expect } = require('@playwright/test');
const { open } = require('./helpers');

test.describe('boot', () => {
  test('renders a first frame with no console errors', async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));

    await open(page);

    const info = await page.evaluate(() => {
      const c = document.getElementById('gl');
      return { hasGl: !!c.getContext('webgl2'), w: c.width, h: c.height, api: typeof window.__NF };
    });
    expect(info.hasGl).toBe(true);
    expect(info.w).toBeGreaterThan(0);
    expect(info.h).toBeGreaterThan(0);
    expect(info.api).toBe('object');
    expect(errors).toEqual([]);
  });

  test('bakes a real shader thumbnail for every field', async ({ page }) => {
    await open(page);
    const thumbs = await page.evaluate(() =>
      [...document.querySelectorAll('#field .thumb')].map(t => t.style.backgroundImage.startsWith('url("data:image/png')));
    expect(thumbs).toHaveLength(10);
    expect(thumbs.every(Boolean)).toBe(true);
  });

  test('restores the drawing buffer size after baking thumbnails', async ({ page }) => {
    await open(page);
    const { bufW, cssW } = await page.evaluate(() => {
      const c = document.getElementById('gl');
      return { bufW: c.width, cssW: Math.round(c.getBoundingClientRect().width) };
    });
    // 300 is the thumbnail width; a leaked size would leave the canvas there
    expect(bufW).not.toBe(300);
    expect(Math.abs(bufW - cssW)).toBeLessThanOrEqual(2);
  });

  test('exposes no leftover controls from the removed sections', async ({ page }) => {
    await open(page);
    const orphans = await page.evaluate(() =>
      ['presets', 'ratio', 'mouseMode', 'html', 'copyReact', 'copyGlsl', 'setups']
        .filter(id => document.getElementById(id)));
    expect(orphans).toEqual([]);
  });
});
