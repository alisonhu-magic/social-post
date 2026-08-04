const { test, expect } = require('@playwright/test');
const { open, settle, expandAll, state } = require('./helpers');

/* S.colors[0] is the ground; the rest are marks. S.weights is index-aligned and
   weights[0] is always 0 because the ground has no mark density. */

const mains = page => page.locator('#brandSwatches .sw-main');
const grounds = page => page.locator('#brandSwatches .sw-ground');
const toast = page => page.textContent('#toast');
const clickBrand = (page, hex) => page.evaluate(h => {
  const hexes = [...document.querySelectorAll('#brandSwatches .sw-hex')].map(e => e.textContent.toLowerCase());
  const i = hexes.indexOf(h.toLowerCase());
  if (i < 0) throw new Error('no brand swatch for ' + h);
  document.querySelectorAll('#brandSwatches .sw-main')[i].click();
}, hex);
const brandHexes = page => page.evaluate(() =>
  [...document.querySelectorAll('#brandSwatches .sw-hex')].map(e => e.textContent));

test.beforeEach(async ({ page }) => { await open(page); await expandAll(page); });

test.describe('palette', () => {
  test('opens with a ground plus marks and exactly one ground toggle set', async ({ page }) => {
    const s = await state(page);
    expect(s.colors.length).toBeGreaterThanOrEqual(2);
    expect(s.weights).toHaveLength(s.colors.length);
    expect(s.weights[0]).toBe(0);
    expect(await grounds(page).count()).toBe(s.colors.length);
    expect(await page.locator('#brandSwatches .sw-ground[aria-pressed="true"]').count()).toBe(1);
  });

  test('a swatch adds and removes its colour', async ({ page }) => {
    const before = (await state(page)).colors.length;
    await clickBrand(page, '#CBC28F');                 // Gold, not in the default set
    await settle(page);
    expect((await state(page)).colors).toContain('#CBC28F');
    expect((await state(page)).colors.length).toBe(before + 1);

    await clickBrand(page, '#CBC28F');
    await settle(page);
    expect((await state(page)).colors).not.toContain('#CBC28F');
    expect((await state(page)).colors.length).toBe(before);
  });

  test('a new mark starts at the default density', async ({ page }) => {
    await clickBrand(page, '#CBC28F');
    await settle(page);
    const s = await state(page);
    expect(s.weights[s.colors.indexOf('#CBC28F')]).toBe(50);
  });

  test('refuses to drop below two colours and explains why', async ({ page }) => {
    // strip marks off the end until the floor is reached
    for (let guard = 0; guard < 12; guard++) {
      const colors = (await state(page)).colors;
      if (colors.length <= 2) break;
      await clickBrand(page, colors[colors.length - 1]);
    }
    expect((await state(page)).colors.length).toBe(2);

    await clickBrand(page, (await state(page)).colors[1]);
    await settle(page);
    expect((await state(page)).colors.length).toBe(2);
    expect(await toast(page)).toMatch(/at least 2/i);
  });

  test('caps the palette at eight colours and explains the limit', async ({ page }) => {
    const hexes = await brandHexes(page);   // 10 brand colours, only 8 can be active
    for (const hex of hexes) {
      const colors = (await state(page)).colors.map(c => c.toLowerCase());
      if (colors.length >= 8) break;
      if (!colors.includes(hex.toLowerCase())) await clickBrand(page, hex);
    }
    expect((await state(page)).colors.length).toBe(8);

    const colors = (await state(page)).colors.map(c => c.toLowerCase());
    const spare = hexes.find(h => !colors.includes(h.toLowerCase()));
    await clickBrand(page, spare);
    await settle(page);
    expect((await state(page)).colors.length).toBe(8);
    expect((await state(page)).colors.map(c => c.toLowerCase())).not.toContain(spare.toLowerCase());
    expect(await toast(page)).toMatch(/up to 8/i);
  });

  test('promoting a mark to ground moves it to index 0 and frees the old ground', async ({ page }) => {
    const before = (await state(page)).colors.slice();
    await page.evaluate(() => {
      const gs = [...document.querySelectorAll('#brandSwatches .sw-ground')];
      gs.find(g => g.getAttribute('aria-pressed') === 'false').click();
    });
    await settle(page);
    const after = (await state(page)).colors;
    expect(after[0]).not.toBe(before[0]);
    expect(after).toContain(before[0]);
    expect(after.length).toBe(before.length);
    expect(await page.locator('#brandSwatches .sw-ground[aria-pressed="true"]').count()).toBe(1);
  });

  test('the demoted ground rejoins the marks with a visible density', async ({ page }) => {
    const oldGround = (await state(page)).colors[0];
    await page.evaluate(() => {
      const gs = [...document.querySelectorAll('#brandSwatches .sw-ground')];
      gs.find(g => g.getAttribute('aria-pressed') === 'false').click();
    });
    await settle(page);
    const s = await state(page);
    expect(s.weights[0]).toBe(0);
    expect(s.weights[s.colors.indexOf(oldGround)]).toBeGreaterThan(0);
  });

  test('removing the ground promotes the next colour', async ({ page }) => {
    const before = (await state(page)).colors.slice();
    await clickBrand(page, before[0]);
    await settle(page);
    const s = await state(page);
    expect(s.colors[0]).toBe(before[1]);
    expect(s.colors).not.toContain(before[0]);
    expect(await page.locator('#brandSwatches .sw-ground[aria-pressed="true"]').count()).toBe(1);
  });

  test('each mark gets a density slider and a contrast badge', async ({ page }) => {
    const marks = (await state(page)).colors.length - 1;
    expect(await page.locator('#palRoles input[type=range]').count()).toBe(marks);
    expect(await page.locator('#palRoles .aa').count()).toBe(marks);
  });

  test('the contrast badge reflects the ground it is compared against', async ({ page }) => {
    const shown = await page.locator('#palRoles .aa').first().textContent();
    const expected = await page.evaluate(() =>
      window.__NF.contrastRatio(window.__NF.S.colors[1], window.__NF.S.colors[0]).toFixed(1) + ':1');
    expect(shown).toBe(expected);
  });

  test('a density slider writes through to the shader weights', async ({ page }) => {
    await page.evaluate(() => {
      const el = document.querySelector('#palRoles input[type=range]');
      el.value = '0'; el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settle(page);
    expect((await state(page)).weights[1]).toBe(0);
  });

  test('zeroing every density leaves the ground visible rather than a black frame', async ({ page }) => {
    await page.evaluate(() => {
      document.querySelectorAll('#palRoles input[type=range]').forEach(el => {
        el.value = '0'; el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
    await settle(page);
    const px = await page.evaluate(() => {
      const c = document.getElementById('gl');
      const g = c.getContext('webgl2');
      const buf = new Uint8Array(4);
      g.readPixels(c.width >> 1, c.height >> 1, 1, 1, g.RGBA, g.UNSIGNED_BYTE, buf);
      return [...buf];
    });
    expect(px.slice(0, 3).some(v => v > 8)).toBe(true);
  });

  test('reseed changes the layout but not the palette', async ({ page }) => {
    const before = await page.evaluate(() => ({ seed: window.__NF.S.seed, colors: window.__NF.S.colors.join() }));
    await page.hover('.canvas-wrap');   // the stage toolbar is hover-revealed
    await page.locator('#reseed').click();
    await settle(page);
    const after = await page.evaluate(() => ({ seed: window.__NF.S.seed, colors: window.__NF.S.colors.join() }));
    expect(after.seed).not.toBe(before.seed);
    expect(after.colors).toBe(before.colors);
  });

  test('invert flips the field without touching the palette', async ({ page }) => {
    const before = (await state(page)).colors.join();
    await page.locator('#invert').scrollIntoViewIfNeeded();
    await page.locator('#invert').click();
    await settle(page);
    const s = await state(page);
    expect(s.invert).toBeTruthy();
    expect(s.colors.join()).toBe(before);
  });
});
