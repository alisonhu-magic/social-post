const { test, expect } = require('@playwright/test');
const { open, settle, setInput, commitInput, pickSeg, expandAll, state } = require('./helpers');

const FORMATS = [
  ['0', 'banner 3:1'],
  ['1', 'widescreen 16:9'],
  ['2', 'square 1:1'],
  ['3', 'portrait 4:5'],
  ['4', 'story 9:16'],
];

test.describe('canvas size and framing', () => {
  test('every preset keeps the frame inside the stage', async ({ page }) => {
    await open(page);
    for (const [value, name] of FORMATS) {
      await page.selectOption('#format', value);
      await settle(page);
      const box = await page.evaluate(() => {
        const f = document.getElementById('frame').getBoundingClientRect();
        const w = document.querySelector('.canvas-wrap').getBoundingClientRect();
        return {
          overflowsX: f.width - w.width > 1,
          overflowsY: f.height - w.height > 1,
          pageScrolls: document.documentElement.scrollHeight - window.innerHeight > 1,
          offTop: f.top < -1,
          offBottom: f.bottom - window.innerHeight > 1,
        };
      });
      expect(box, `format ${name}`).toEqual({
        overflowsX: false, overflowsY: false, pageScrolls: false, offTop: false, offBottom: false,
      });
    }
  });

  test('frame aspect matches the requested dimensions', async ({ page }) => {
    await open(page);
    for (const [value] of FORMATS) {
      await page.selectOption('#format', value);
      await settle(page);
      const r = await page.evaluate(() => {
        const S = window.__NF.S;
        const f = document.getElementById('frame').getBoundingClientRect();
        return { want: S.canvasW / S.canvasH, got: f.width / f.height };
      });
      expect(r.got).toBeCloseTo(r.want, 1);
    }
  });

  test('the stage footer stays on screen for the tallest format', async ({ page }) => {
    await open(page);
    await page.selectOption('#format', '4');   // story 9:16, the tallest preset
    await settle(page);
    const r = await page.evaluate(() => {
      const f = document.querySelector('.stagefoot').getBoundingClientRect();
      return { top: f.top, bottom: f.bottom, height: f.height, vh: window.innerHeight };
    });
    expect(r.height).toBeGreaterThan(0);
    expect(r.top).toBeGreaterThanOrEqual(-1);
    expect(r.bottom).toBeLessThanOrEqual(r.vh + 1);
  });

  test('the export button is reachable by scrolling the rail, not the page', async ({ page }) => {
    await open(page);
    await page.selectOption('#format', '4');
    await settle(page);
    await page.locator('#exportBtn').scrollIntoViewIfNeeded();
    await expect(page.locator('#exportBtn')).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('typing a custom size switches the preset to Custom', async ({ page }) => {
    await open(page);
    await setInput(page, 'cw', 1234);
    await settle(page);
    expect(await page.inputValue('#format')).toBe('custom');
    expect((await state(page)).canvasW).toBe(1234);
  });

  test('out-of-range dimensions are clamped and written back to the field', async ({ page }) => {
    await open(page);
    for (const [raw, want] of [['99999', 8192], ['0', 16], ['-40', 16]]) {
      await commitInput(page, 'cw', raw);
      await settle(page);
      expect((await state(page)).canvasW, `input ${raw}`).toBe(want);
      expect(await page.inputValue('#cw'), `field after ${raw}`).toBe(String(want));
    }
  });

  test('a blank dimension field is restored on blur instead of breaking the render', async ({ page }) => {
    await open(page);
    const before = (await state(page)).canvasW;
    await page.fill('#cw', '');
    await page.dispatchEvent('#cw', 'input');
    await page.dispatchEvent('#cw', 'blur');
    await settle(page);
    expect((await state(page)).canvasW).toBe(before);
    expect(await page.inputValue('#cw')).toBe(String(before));
    expect(await page.evaluate(() => document.getElementById('gl').width)).toBeGreaterThan(0);
  });

  test('the footer readout follows the current size', async ({ page }) => {
    await open(page);
    await commitInput(page, 'cw', 1200);
    await commitInput(page, 'ch', 900);
    await settle(page);
    expect(await page.textContent('#pngSize')).toContain('1200');
    expect(await page.textContent('#pngSize')).toContain('900');
  });

  test('a frame past the pixel budget is capped, and the cap is explained', async ({ page }) => {
    await open(page);
    await commitInput(page, 'cw', 8192);
    await commitInput(page, 'ch', 8192);
    await settle(page);
    const s = await state(page);
    const { areaMax } = await page.evaluate(() => window.__NF.limits());
    expect(s.canvasW * s.canvasH).toBeLessThanOrEqual(areaMax);
    expect(await page.textContent('#toast')).toMatch(/megapixel/i);
    // the field the user did not touch keeps what they asked for
    expect(s.canvasW).toBe(8192);
    expect(Number(await page.inputValue('#ch'))).toBe(s.canvasH);
  });

  test('the cap trims whichever side was just edited', async ({ page }) => {
    await open(page);
    await commitInput(page, 'ch', 8192);
    await commitInput(page, 'cw', 8192);
    await settle(page);
    const s = await state(page);
    expect(s.canvasH).toBe(8192);
    expect(s.canvasW).toBeLessThan(8192);
    expect(Number(await page.inputValue('#cw'))).toBe(s.canvasW);
  });

  test('every preset stays within the pixel budget', async ({ page }) => {
    await open(page);
    const { areaMax } = await page.evaluate(() => window.__NF.limits());
    for (const [value, name] of FORMATS) {
      await page.selectOption('#format', value);
      await settle(page);
      const s = await state(page);
      expect(s.canvasW * s.canvasH, `format ${name}`).toBeLessThanOrEqual(areaMax);
    }
  });

  test('the drawing buffer never exceeds the WebGL viewport limit', async ({ page }) => {
    await open(page);
    await commitInput(page, 'cw', 8192);
    await commitInput(page, 'ch', 8192);
    await settle(page);
    const ok = await page.evaluate(() => {
      const c = document.getElementById('gl');
      const gl = c.getContext('webgl2');
      const [mw, mh] = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
      return c.width <= mw && c.height <= mh;
    });
    expect(ok).toBe(true);
  });
});

test.describe('preview zoom', () => {
  const frameW = page => page.evaluate(() => document.getElementById('frame').getBoundingClientRect().width);

  test('defaults to fit, and the footer reports the scale', async ({ page }) => {
    await open(page);
    await settle(page);
    expect((await state(page)).zoom).toBe('fit');
    const s = await state(page);
    const pct = Math.round((await frameW(page)) / s.canvasW * 100);
    expect(await page.textContent('#zoomOut')).toBe(`${pct}%`);
    expect(pct).toBeLessThan(100);   // 1920 wide never fits the stage 1:1
  });

  test('100% pins one preview pixel to one export pixel', async ({ page }) => {
    await open(page);
    await pickSeg(page, 'zoomSeg', '1');
    await settle(page);
    const s = await state(page);
    expect(s.zoom).toBe('1');
    expect(await frameW(page)).toBeCloseTo(s.canvasW, 0);
    expect(await page.textContent('#zoomOut')).toBe('100%');
  });

  test('copy renders at its export size when zoomed to 100%', async ({ page }) => {
    await open(page);
    await pickSeg(page, 'zoomSeg', '1');
    await settle(page);
    const r = await page.evaluate(() => {
      const { S, roleSize } = window.__NF;
      const px = id => parseFloat(getComputedStyle(document.getElementById(id)).fontSize);
      return {
        eyebrow: px('tEyebrow'),
        head: px('tHead'),
        wantEyebrow: roleSize(S.text.eyebrowStep, { scale: 1.1 }) / 100 * S.canvasW,
        wantHead: roleSize(S.text.headStep, { scale: 1 }) / 100 * S.canvasW,
      };
    });
    expect(r.eyebrow).toBeCloseTo(r.wantEyebrow, 0);
    expect(r.head).toBeCloseTo(r.wantHead, 0);
  });

  test('the oversized frame scrolls the stage, not the page', async ({ page }) => {
    await open(page);
    await pickSeg(page, 'zoomSeg', '1');
    await settle(page);
    const r = await page.evaluate(() => {
      const w = document.querySelector('.canvas-wrap');
      return {
        scrollable: w.scrollWidth - w.clientWidth > 1,
        centred: Math.abs(w.scrollLeft - (w.scrollWidth - w.clientWidth) / 2) <= 1,
        pageScrollsX: document.documentElement.scrollWidth - window.innerWidth > 1,
        pageScrollsY: document.documentElement.scrollHeight - window.innerHeight > 1,
      };
    });
    expect(r).toEqual({ scrollable: true, centred: true, pageScrollsX: false, pageScrollsY: false });
  });

  test('switching back to fit restores the contained frame', async ({ page }) => {
    await open(page);
    await pickSeg(page, 'zoomSeg', '1');
    await settle(page);
    await pickSeg(page, 'zoomSeg', 'fit');
    await settle(page);
    const r = await page.evaluate(() => {
      const f = document.getElementById('frame').getBoundingClientRect();
      const w = document.querySelector('.canvas-wrap');
      return { overflowsX: f.width - w.clientWidth > 1, scrollable: w.scrollWidth - w.clientWidth > 1 };
    });
    expect(r).toEqual({ overflowsX: false, scrollable: false });
  });

  test('the drawing buffer stays inside the driver limits at 100% on a huge frame', async ({ page }) => {
    await open(page);
    await commitInput(page, 'cw', 8192);
    await pickSeg(page, 'zoomSeg', '1');
    await settle(page);
    const ok = await page.evaluate(() => {
      const c = document.getElementById('gl');
      const gl = c.getContext('webgl2');
      const [mw, mh] = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
      return c.width > 0 && c.height > 0 && c.width <= mw && c.height <= mh;
    });
    expect(ok).toBe(true);
  });
});

test.describe('grid overlay', () => {
  test('toggles on and draws the configured number of columns', async ({ page }) => {
    await open(page);
    await expandAll(page);
    await page.click('#gShow');
    await settle(page);
    expect(await page.getAttribute('#gShow', 'aria-checked')).toBe('true');
    const shown = await page.evaluate(() => {
      const ov = document.getElementById('gridOv');
      return { on: ov.classList.contains('on'), cols: document.getElementById('gCols').children.length };
    });
    expect(shown.on).toBe(true);
    expect(shown.cols).toBe((await state(page)).grid.cols);

    await page.click('#gShow');
    await settle(page);
    expect(await page.getAttribute('#gShow', 'aria-checked')).toBe('false');
    expect(await page.evaluate(() => document.getElementById('gridOv').classList.contains('on'))).toBe(false);
  });
});
