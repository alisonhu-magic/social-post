const { test, expect } = require('@playwright/test');
const { open, settle } = require('./helpers');

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'laptop', width: 1440, height: 900 },
  { name: 'wide', width: 1920, height: 1080 },
  { name: 'short laptop', width: 1280, height: 620 },
];

const FORMATS = ['0', '2', '4'];   // widest, square, tallest

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('never scrolls horizontally', async ({ page }) => {
      await open(page);
      await settle(page);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });

    test('keeps the frame inside its container for every format', async ({ page }) => {
      await open(page);
      for (const fmt of FORMATS) {
        await page.selectOption('#format', fmt);
        await settle(page);
        const r = await page.evaluate(() => {
          const f = document.getElementById('frame').getBoundingClientRect();
          const w = document.querySelector('.canvas-wrap').getBoundingClientRect();
          return { dw: f.width - w.width, dh: f.height - w.height, w: f.width, h: f.height };
        });
        expect(r.dw, `format ${fmt} width`).toBeLessThanOrEqual(1);
        expect(r.dh, `format ${fmt} height`).toBeLessThanOrEqual(1);
        expect(r.w).toBeGreaterThan(0);
        expect(r.h).toBeGreaterThan(0);
      }
    });

    test('renders a drawing buffer matching the frame at this DPR', async ({ page }) => {
      await open(page);
      await settle(page);
      const r = await page.evaluate(() => {
        const c = document.getElementById('gl');
        const box = c.getBoundingClientRect();
        return { bufW: c.width, cssW: box.width, dpr: devicePixelRatio };
      });
      expect(r.bufW).toBeGreaterThan(0);
      expect(Math.abs(r.bufW - Math.round(r.cssW * Math.min(r.dpr, 2)))).toBeLessThanOrEqual(2);
    });

    test('the controls remain reachable', async ({ page }) => {
      await open(page);
      await settle(page);
      await page.locator('#exportBtn').scrollIntoViewIfNeeded();
      await expect(page.locator('#exportBtn')).toBeVisible();
      await expect(page.locator('#format')).toBeVisible();
    });
  });
}

test.describe('resize', () => {
  test('refits the frame when the window changes size', async ({ page }) => {
    await open(page);
    await page.selectOption('#format', '4');   // tallest
    await settle(page);
    const tall = await page.evaluate(() => document.getElementById('frame').getBoundingClientRect().height);

    await page.setViewportSize({ width: 1440, height: 520 });
    await settle(page, 20);
    const short = await page.evaluate(() => {
      const f = document.getElementById('frame').getBoundingClientRect();
      const w = document.querySelector('.canvas-wrap').getBoundingClientRect();
      return { h: f.height, fits: f.height - w.height <= 1 };
    });
    expect(short.h).toBeLessThan(tall);
    expect(short.fits).toBe(true);
  });
});
