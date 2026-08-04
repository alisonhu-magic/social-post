const { test, expect } = require('@playwright/test');
const { open, settle, expandAll, pickSeg, state } = require('./helpers');

test.beforeEach(async ({ page }) => { await open(page); await expandAll(page); });

test.describe('logo', () => {
  test('renders a mark in the frame by default', async ({ page }) => {
    expect(await page.locator('#logoLayer svg').count()).toBeGreaterThan(0);
  });

  test('each type swaps the artwork', async ({ page }) => {
    const seen = new Set();
    for (const type of ['lockup', 'mark', 'none']) {
      await pickSeg(page, 'lType', type);
      await settle(page);
      expect((await state(page)).logo.type).toBe(type);
      seen.add(await page.innerHTML('#logoLayer'));
    }
    expect(seen.size).toBe(3);
  });

  test('"none" clears the layer', async ({ page }) => {
    await pickSeg(page, 'lType', 'none');
    await settle(page);
    expect(await page.locator('#logoLayer svg').count()).toBe(0);
  });

  test('all six placements land inside the frame', async ({ page }) => {
    await pickSeg(page, 'lType', 'lockup');
    for (const pos of ['tl', 'tc', 'tr', 'bl', 'bc', 'br']) {
      await pickSeg(page, 'lPos', pos);
      await settle(page);
      expect((await state(page)).logo.pos).toBe(pos);
      const inside = await page.evaluate(() => {
        const l = document.querySelector('#logoLayer .plate').getBoundingClientRect();
        const f = document.getElementById('frame').getBoundingClientRect();
        return l.left >= f.left - 1 && l.right <= f.right + 1 && l.top >= f.top - 1 && l.bottom <= f.bottom + 1;
      });
      expect(inside, `placement ${pos}`).toBe(true);
    }
  });

  test('top placements sit above centre and bottom placements below', async ({ page }) => {
    const centreOf = async pos => {
      await pickSeg(page, 'lPos', pos);
      await settle(page);
      return page.evaluate(() => {
        const l = document.querySelector('#logoLayer .plate').getBoundingClientRect();
        const f = document.getElementById('frame').getBoundingClientRect();
        return (l.top + l.bottom) / 2 - (f.top + f.bottom) / 2;
      });
    };
    expect(await centreOf('tl')).toBeLessThan(0);
    expect(await centreOf('br')).toBeGreaterThan(0);
  });

  test('each colour choice changes the rendered fill', async ({ page }) => {
    await pickSeg(page, 'lType', 'mark');
    const seen = {};
    for (const c of ['black', 'white', 'blue']) {
      await pickSeg(page, 'lColor', c);
      await settle(page);
      expect((await state(page)).logo.color).toBe(c);
      seen[c] = await page.evaluate(() => getComputedStyle(document.getElementById('logoLayer')).color);
    }
    expect(new Set(Object.values(seen)).size).toBe(3);
  });

  test('the scrim backing is added behind the mark and removed again', async ({ page }) => {
    await pickSeg(page, 'lType', 'mark');
    const plateBg = () => page.evaluate(() => getComputedStyle(document.querySelector('#logoLayer .plate')).backgroundImage);

    await pickSeg(page, 'lPlate', 'none');
    await settle(page);
    expect(await plateBg()).toBe('none');

    await pickSeg(page, 'lPlate', 'scrim');
    await settle(page);
    expect((await state(page)).logo.plate).toBe('scrim');
    expect(await plateBg()).toContain('gradient');

    await pickSeg(page, 'lPlate', 'none');
    await settle(page);
    expect(await plateBg()).toBe('none');
  });

  test('the scrim fades through the ground colour, never through black', async ({ page }) => {
    await pickSeg(page, 'lType', 'mark');
    await pickSeg(page, 'lPlate', 'scrim');
    await settle(page);
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('#logoLayer .plate')).backgroundImage);
    // the transparent end must carry the ground's own channels, not 0,0,0
    const transparentStop = bg.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*0\)/);
    expect(transparentStop).not.toBeNull();
    expect(transparentStop.slice(1, 4).map(Number).some(v => v > 0)).toBe(true);
  });

  test('the logo scales with the frame instead of staying a fixed pixel size', async ({ page }) => {
    await pickSeg(page, 'lType', 'lockup');
    // height is set in cqmin, so it tracks the frame's shorter side
    const ratio = async format => {
      await page.selectOption('#format', format);
      await settle(page);
      return page.evaluate(() => {
        const l = document.querySelector('#logoLayer .plate').getBoundingClientRect();
        const f = document.getElementById('frame').getBoundingClientRect();
        return l.height / Math.min(f.width, f.height);
      });
    };
    const banner = await ratio('0');
    const square = await ratio('2');
    const story = await ratio('4');
    expect(Math.abs(banner - square)).toBeLessThan(0.01);
    expect(Math.abs(banner - story)).toBeLessThan(0.01);
  });
});
