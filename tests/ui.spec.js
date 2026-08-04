const { test, expect } = require('@playwright/test');
const { open, settle, setInput, expandAll, state } = require('./helpers');

test.describe('rail sections', () => {
  test('each header toggles its section and reports the state', async ({ page }) => {
    await open(page);
    const head = page.locator('.rail .group > h2 .ghead').first();
    const before = await head.getAttribute('aria-expanded');
    await head.click();
    await settle(page);
    expect(await head.getAttribute('aria-expanded')).not.toBe(before);
    await head.click();
    expect(await head.getAttribute('aria-expanded')).toBe(before);
  });

  test('headers are reachable and operable from the keyboard', async ({ page }) => {
    await open(page);
    const head = page.locator('.rail .group > h2 .ghead').first();
    const before = await head.getAttribute('aria-expanded');
    await head.focus();
    await page.keyboard.press('Enter');
    await settle(page);
    expect(await head.getAttribute('aria-expanded')).not.toBe(before);
    await page.keyboard.press(' ');
    await settle(page);
    expect(await head.getAttribute('aria-expanded')).toBe(before);
  });

  test('the lock button inside a header does not toggle the section', async ({ page }) => {
    await open(page);
    const head = page.locator('#marksGroup > h2 .ghead');
    const expanded = await head.getAttribute('aria-expanded');
    await page.click('#marksLock');
    await settle(page);
    expect(await head.getAttribute('aria-expanded')).toBe(expanded);
  });
});

test.describe('marks lock', () => {
  test('starts locked with the sliders disabled', async ({ page }) => {
    await open(page);
    expect(await page.getAttribute('#marksLock', 'aria-pressed')).toBe('true');
    const disabled = await page.evaluate(() =>
      [...document.querySelectorAll('#marksGroup input[type=range]')].every(i => i.disabled));
    expect(disabled).toBe(true);
  });

  test('unlocking enables the sliders and locking again disables them', async ({ page }) => {
    await open(page);
    await page.click('#marksLock');
    await settle(page);
    expect(await page.getAttribute('#marksLock', 'aria-pressed')).toBe('false');
    expect(await page.evaluate(() =>
      [...document.querySelectorAll('#marksGroup input[type=range]')].some(i => !i.disabled))).toBe(true);

    await page.click('#marksLock');
    await settle(page);
    expect(await page.getAttribute('#marksLock', 'aria-pressed')).toBe('true');
    expect(await page.evaluate(() =>
      [...document.querySelectorAll('#marksGroup input[type=range]')].every(i => i.disabled))).toBe(true);
  });

  test('a locked slider is unreachable by keyboard or pointer', async ({ page }) => {
    await open(page);
    await expandAll(page);
    const before = (await state(page)).cols;
    await expect(page.locator('#cols')).toBeDisabled();
    await page.locator('#cols').focus();          // a no-op while disabled
    await page.keyboard.press('ArrowRight');
    await settle(page);
    expect((await state(page)).cols).toBe(before);
  });

  test('unlocking then moving a slider does change the render', async ({ page }) => {
    await open(page);
    await expandAll(page);
    await page.click('#marksLock');
    await settle(page);
    const before = (await state(page)).cols;
    await setInput(page, 'cols', 20);
    await settle(page);
    expect((await state(page)).cols).toBe(20);
    expect((await state(page)).cols).not.toBe(before);
  });
});

test.describe('playback', () => {
  test('pause stops the clock and play resumes it', async ({ page }) => {
    await open(page);
    await page.hover('.canvas-wrap');
    await page.click('#pause');
    await settle(page);
    expect((await state(page)).paused).toBe(true);
    expect(await page.getAttribute('#pause', 'aria-pressed')).toBe('true');

    const frozen = await page.evaluate(async () => {
      const a = window.__NF.getClock();
      await new Promise(r => setTimeout(r, 300));
      return window.__NF.getClock() === a;
    });
    expect(frozen).toBe(true);

    await page.click('#pause');
    await settle(page);
    expect((await state(page)).paused).toBe(false);
    const moving = await page.evaluate(async () => {
      const a = window.__NF.getClock();
      await new Promise(r => setTimeout(r, 300));
      return window.__NF.getClock() !== a;
    });
    expect(moving).toBe(true);
  });

  test('zero speed holds a still frame without pausing', async ({ page }) => {
    await open(page);
    await expandAll(page);
    await setInput(page, 'speed', 0);
    const still = await page.evaluate(async () => {
      const a = window.__NF.getClock();
      await new Promise(r => setTimeout(r, 300));
      return window.__NF.getClock() === a;
    });
    expect(still).toBe(true);
    expect((await state(page)).paused).toBe(false);
  });
});

test.describe('background image', () => {
  const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

  test('an uploaded image switches the field to image mode and can be cleared', async ({ page }) => {
    await open(page);
    await expandAll(page);
    await page.setInputFiles('#file', {
      name: 'dot.png', mimeType: 'image/png',
      buffer: Buffer.from(PNG_1PX.split(',')[1], 'base64'),
    });
    await expect.poll(async () => (await state(page)).useImg, { timeout: 10_000 }).toBeTruthy();
    expect(await page.textContent('#dropLabel')).toMatch(/dot\.png|change|replace/i);

    await page.click('#clearImg');
    await settle(page);
    expect((await state(page)).useImg).toBeFalsy();
  });

  test('invert is available and applies to the field', async ({ page }) => {
    await open(page);
    await expandAll(page);
    await page.click('#invert');
    await settle(page);
    expect((await state(page)).invert).toBeTruthy();
    expect(await page.getAttribute('#invert', 'aria-checked')).toBe('true');
  });
});

test.describe('accessibility structure', () => {
  test('the preview canvas has a name and an image role', async ({ page }) => {
    await open(page);
    expect(await page.getAttribute('#gl', 'role')).toBe('img');
    expect((await page.getAttribute('#gl', 'aria-label') || '').length).toBeGreaterThan(5);
  });

  test('status messages go through a polite live region', async ({ page }) => {
    await open(page);
    expect(await page.getAttribute('#toast', 'role')).toBe('status');
    expect(await page.getAttribute('#toast', 'aria-live')).toBe('polite');
  });

  test('every editable value field carries its own name', async ({ page }) => {
    await open(page);
    await expandAll(page);
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll('input.val')]
        .filter(i => !i.getAttribute('aria-label') && !i.labels?.length)
        .map(i => i.id || i.className));
    expect(unnamed).toEqual([]);
  });

  test('every range input is labelled', async ({ page }) => {
    await open(page);
    await expandAll(page);
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll('input[type=range]')]
        .filter(i => !i.getAttribute('aria-label') && !i.labels?.length)
        .map(i => i.id || i.outerHTML.slice(0, 60)));
    expect(unnamed).toEqual([]);
  });

  test('segmented controls are exposed as named groups', async ({ page }) => {
    await open(page);
    const bad = await page.evaluate(() =>
      [...document.querySelectorAll('.seg, .fieldpick')]
        .filter(g => g.getAttribute('role') !== 'group' || !g.getAttribute('aria-label'))
        .map(g => g.id));
    expect(bad).toEqual([]);
  });

  test('no button is nested inside another button', async ({ page }) => {
    await open(page);
    const nested = await page.evaluate(() =>
      [...document.querySelectorAll('button, [role=button]')]
        .filter(b => b.parentElement.closest('button, [role=button]'))
        .map(b => b.id || b.className));
    expect(nested).toEqual([]);
  });

  test('icon-only controls have accessible names', async ({ page }) => {
    await open(page);
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll('#lPos button, .tbtn, #marksLock')]
        .filter(b => !(b.getAttribute('aria-label') || '').trim())
        .map(b => b.id || b.dataset.v));
    expect(unnamed).toEqual([]);
  });

  test('toggle switches expose their checked state', async ({ page }) => {
    await open(page);
    const bad = await page.evaluate(() =>
      [...document.querySelectorAll('[role=switch]')]
        .filter(s => !['true', 'false'].includes(s.getAttribute('aria-checked')))
        .map(s => s.id));
    expect(bad).toEqual([]);
  });

  /* The field animates regardless of the reduced-motion preference, by product
     decision: motion is the artefact being designed. Pause is always one click
     away in the canvas toolbar. */
  test('the animation runs under reduced motion and pause still stops it', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await open(page);
    const moving = await page.evaluate(async () => {
      const a = window.__NF.getClock();
      await new Promise(r => setTimeout(r, 400));
      return window.__NF.getClock() !== a;
    });
    expect(moving).toBe(true);

    await page.hover('.canvas-wrap');
    await page.click('#pause');
    const held = await page.evaluate(async () => {
      const a = window.__NF.getClock();
      await new Promise(r => setTimeout(r, 300));
      return window.__NF.getClock() === a;
    });
    await ctx.close();
    expect(held).toBe(true);
  });
});
