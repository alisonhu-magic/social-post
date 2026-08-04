const { test, expect } = require('@playwright/test');
const { open, settle, expandAll, pickSeg, state } = require('./helpers');

test.beforeEach(async ({ page }) => { await open(page); await expandAll(page); });

test.describe('copy', () => {
  test('typing renders into the frame', async ({ page }) => {
    await page.fill('#tiHead', 'Hello world');
    await settle(page);
    expect(await page.textContent('#tHead')).toContain('Hello world');
    expect((await state(page)).text.head).toBe('Hello world');
  });

  test('*asterisks* become italic runs, not literal characters', async ({ page }) => {
    await page.fill('#tiHead', 'plain *slanted* plain');
    await settle(page);
    const html = await page.innerHTML('#tHead');
    expect(html).toMatch(/<em|italic/i);
    expect(await page.textContent('#tHead')).not.toContain('*');
  });

  test('newlines produce line breaks', async ({ page }) => {
    await page.fill('#tiHead', 'one\ntwo');
    await settle(page);
    const text = await page.textContent('#tHead');
    expect(text).toContain('one');
    expect(text).toContain('two');
    expect(await page.evaluate(() => document.querySelectorAll('#tHead br').length)).toBeGreaterThan(0);
  });

  test('an empty role collapses instead of leaving a gap', async ({ page }) => {
    await page.fill('#tiEyebrow', '');
    await page.fill('#tiBody', '');
    await settle(page);
    const shown = await page.evaluate(() => ['tEyebrow', 'tBody'].map(id => getComputedStyle(document.getElementById(id)).display));
    expect(shown).toEqual(['none', 'none']);
  });

  test('clearing every role hides the text block entirely', async ({ page }) => {
    for (const id of ['tiEyebrow', 'tiHead', 'tiBody']) await page.fill('#' + id, '');
    await settle(page);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('txt')).display)).toBe('none');
  });

  test('the text switch removes the overlay without discarding the copy', async ({ page }) => {
    const head = await page.inputValue('#tiHead');
    await page.click('#textOn');
    await settle(page);
    expect(await page.getAttribute('#textOn', 'aria-checked')).toBe('false');
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('txt')).display)).toBe('none');

    await page.click('#textOn');
    await settle(page);
    expect(await page.inputValue('#tiHead')).toBe(head);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('txt')).display)).not.toBe('none');
  });

  test('the size select changes the rendered type scale', async ({ page }) => {
    const before = await page.evaluate(() => getComputedStyle(document.getElementById('tHead')).fontSize);
    const current = await page.inputValue('#szHead');
    const other = await page.evaluate(cur =>
      [...document.getElementById('szHead').options].map(o => o.value).find(v => v !== cur), current);
    await page.selectOption('#szHead', other);
    await settle(page);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('tHead')).fontSize)).not.toBe(before);
  });

  test('alignment moves the block and is mirrored in state', async ({ page }) => {
    await pickSeg(page, 'tAlign', 'right');
    await settle(page);
    expect((await state(page)).text.align).toBe('right');
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('txtInner')).textAlign)).toBe('right');
    expect(await page.getAttribute('#tAlign button[data-v="right"]', 'aria-pressed')).toBe('true');
    expect(await page.getAttribute('#tAlign button[data-v="left"]', 'aria-pressed')).toBe('false');
  });

  test('vertical placement is applied', async ({ page }) => {
    for (const v of ['top', 'middle', 'bottom']) {
      await pickSeg(page, 'tVAlign', v);
      await settle(page);
      expect((await state(page)).text.vAlign).toBe(v);
    }
  });

  test('measure is capped by the grid column count', async ({ page }) => {
    await pickSeg(page, 'gCols_seg', '6');
    await settle(page);
    expect(await page.getAttribute('#tMeasure', 'max')).toBe('6');
    expect(Number(await page.inputValue('#tMeasure'))).toBeLessThanOrEqual(6);
    expect(await page.textContent('#tMeasure_v')).toContain('of 6');
  });

  test('a measure narrowed by fewer columns is not lost when columns grow back', async ({ page }) => {
    await pickSeg(page, 'gCols_seg', '6');
    await settle(page);
    const narrowed = Number(await page.inputValue('#tMeasure'));
    await pickSeg(page, 'gCols_seg', '12');
    await settle(page);
    expect(await page.getAttribute('#tMeasure', 'max')).toBe('12');
    expect(Number(await page.inputValue('#tMeasure'))).toBeGreaterThanOrEqual(narrowed);
  });

  test('the colour select names each colour instead of numbering slots', async ({ page }) => {
    const opts = await page.evaluate(() => [...document.getElementById('cHead').options].map(o => o.textContent));
    const s = await state(page);
    expect(opts).toHaveLength(s.colors.length);
    expect(opts.some(o => /^Mark \d/.test(o))).toBe(false);
    // every option carries a brand name from the live palette
    const names = await page.evaluate(() =>
      window.__NF.S.colors.map(hex => window.__NF.colorName(hex)));
    names.forEach((name, i) => expect(opts[i]).toContain(name));
  });

  test('the ground option is flagged so copy is not set invisible by accident', async ({ page }) => {
    const first = await page.evaluate(() => document.getElementById('cHead').options[0].textContent);
    expect(first).toMatch(/\(bg\)$/);
    const rest = await page.evaluate(() =>
      [...document.getElementById('cHead').options].slice(1).map(o => o.textContent));
    expect(rest.every(o => !/\(bg\)/.test(o))).toBe(true);
  });

  test('the option names follow the palette when it changes', async ({ page }) => {
    await page.evaluate(() => {
      const hexes = [...document.querySelectorAll('#brandSwatches .sw-hex')].map(e => e.textContent.toLowerCase());
      document.querySelectorAll('#brandSwatches .sw-main')[hexes.indexOf('#cbc28f')].click();   // Gold
    });
    await settle(page);
    const opts = await page.evaluate(() => [...document.getElementById('cHead').options].map(o => o.textContent));
    expect(opts.some(o => o.includes('Gold'))).toBe(true);
  });

  test('promoting a colour to ground moves the (bg) flag with it', async ({ page }) => {
    await page.evaluate(() => {
      const gs = [...document.querySelectorAll('#brandSwatches .sw-ground')];
      gs.find(g => g.getAttribute('aria-pressed') === 'false').click();
    });
    await settle(page);
    const opts = await page.evaluate(() => [...document.getElementById('cHead').options].map(o => o.textContent));
    const ground = await page.evaluate(() => window.__NF.colorName(window.__NF.S.colors[0]));
    expect(opts[0]).toBe(ground + ' (bg)');
    expect(opts.filter(o => /\(bg\)/.test(o))).toHaveLength(1);
  });

  test('the colour select drives the rendered text colour', async ({ page }) => {
    const current = await page.inputValue('#cHead');
    const opts = await page.evaluate(() => [...document.getElementById('cHead').options].map(o => o.value));
    expect(opts.length).toBeGreaterThan(1);
    const before = await page.evaluate(() => getComputedStyle(document.getElementById('tHead')).color);
    await page.selectOption('#cHead', opts.find(o => o !== current));
    await settle(page);
    const after = await page.evaluate(() => getComputedStyle(document.getElementById('tHead')).color);
    expect(after).not.toBe(before);
  });

  test('very long unbroken copy stays inside the frame', async ({ page }) => {
    await page.fill('#tiHead', 'A'.repeat(400));
    await settle(page);
    const r = await page.evaluate(() => {
      const t = document.getElementById('txt').getBoundingClientRect();
      const f = document.getElementById('frame').getBoundingClientRect();
      return { overflowsRight: t.right - f.right > 1, overflowsLeft: f.left - t.left > 1 };
    });
    expect(r).toEqual({ overflowsRight: false, overflowsLeft: false });
  });

  test('markup characters in the copy are not injected as HTML', async ({ page }) => {
    await page.fill('#tiHead', '<img src=x onerror="window.__pwned=1">');
    await settle(page);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
    expect(await page.evaluate(() => document.querySelectorAll('#tHead img').length)).toBe(0);
    expect(await page.textContent('#tHead')).toContain('<img');
  });
});
