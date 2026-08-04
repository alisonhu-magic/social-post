const { test, expect } = require('@playwright/test');
const { open, settle, setInput, expandAll, pickSeg, state } = require('./helpers');

const maskBg = page => page.evaluate(() => getComputedStyle(document.getElementById('mask')).backgroundImage);

test.beforeEach(async ({ page }) => { await open(page); await expandAll(page); });

test.describe('fade mask', () => {
  test('is on by default and paints a gradient', async ({ page }) => {
    expect((await state(page)).maskOn).toBe(true);
    expect(await maskBg(page)).toContain('linear-gradient');
  });

  test('the switch turns it off and back on', async ({ page }) => {
    await page.click('#maskToggle');
    await settle(page);
    expect((await state(page)).maskOn).toBe(false);
    expect(await page.getAttribute('#maskToggle', 'aria-checked')).toBe('false');
    expect(await maskBg(page)).toBe('none');

    await page.click('#maskToggle');
    await settle(page);
    expect((await state(page)).maskOn).toBe(true);
    expect(await maskBg(page)).toContain('linear-gradient');
  });

  test('direction follows the text alignment', async ({ page }) => {
    const cases = { left: 'to right', right: 'to left', center: 'center' };
    for (const [align, dir] of Object.entries(cases)) {
      await pickSeg(page, 'tAlign', align);
      await settle(page);
      expect((await state(page)).maskDir, `align ${align}`).toBe(dir);
    }
  });

  test('a centred mask fades on both sides', async ({ page }) => {
    await pickSeg(page, 'tAlign', 'center');
    await settle(page);
    const bg = await maskBg(page);
    // transparent at both ends, opaque in the middle
    expect(bg.match(/rgba\([^)]*, 0\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  test('the solid stop moves the gradient', async ({ page }) => {
    const before = await maskBg(page);
    await setInput(page, 'maskSolid', 55);
    await settle(page);
    expect(await maskBg(page)).not.toBe(before);
    expect((await state(page)).maskSolid).toBe(55);
  });

  test('pushing the solid stop past the fade end carries the fade with it', async ({ page }) => {
    await setInput(page, 'maskFade', 40);
    await setInput(page, 'maskSolid', 80);
    await settle(page);
    const s = await state(page);
    expect(s.maskSolid).toBe(80);
    expect(s.maskFade).toBeGreaterThan(s.maskSolid);
    // the slider must show the value that is actually rendered
    expect(Number(await page.inputValue('#maskFade'))).toBe(s.maskFade);
    expect(await page.inputValue('#maskFade_v')).toContain(String(s.maskFade));
  });

  test('pulling the fade end below the solid stop carries the solid stop with it', async ({ page }) => {
    await setInput(page, 'maskSolid', 60);
    await setInput(page, 'maskFade', 20);
    await settle(page);
    const s = await state(page);
    expect(s.maskFade).toBe(20);
    expect(s.maskSolid).toBeLessThan(s.maskFade);
    expect(Number(await page.inputValue('#maskSolid'))).toBe(s.maskSolid);
  });

  test('gradient stops stay in ascending order for every slider combination', async ({ page }) => {
    for (const [solid, fade] of [[0, 10], [30, 70], [80, 100], [80, 10], [10, 100]]) {
      const offs = await page.evaluate(([s, f]) => {
        Object.assign(window.__NF.S, { maskSolid: s, maskFade: f });
        return window.__NF.maskStops().map(x => x[0]);
      }, [solid, fade]);
      expect(offs, `solid ${solid} fade ${fade}`).toEqual([...offs].sort((a, b) => a - b));
    }
  });
});
