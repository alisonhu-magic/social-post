const { test, expect } = require('@playwright/test');
const { open, settle, commitInput, expandAll, pickSeg, state, captureExport } = require('./helpers');

test.beforeEach(async ({ page }) => { await open(page); await expandAll(page); });

test.describe('export', () => {
  test('the button label follows the chosen format', async ({ page }) => {
    for (const [fmt, label] of [['png', /PNG/i], ['svg', /SVG/i], ['mp4', /MP4|video/i]]) {
      await pickSeg(page, 'expFmt', fmt);
      await settle(page);
      expect(await page.textContent('#exportBtn'), `format ${fmt}`).toMatch(label);
    }
  });

  test('video options only appear for the video format', async ({ page }) => {
    await pickSeg(page, 'expFmt', 'png');
    await settle(page);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('vidOpts')).display)).toBe('none');
    await pickSeg(page, 'expFmt', 'mp4');
    await settle(page);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('vidOpts')).display)).not.toBe('none');
  });

  test('PNG export produces a non-trivial image', async ({ page }) => {
    await pickSeg(page, 'expFmt', 'png');
    const r = await captureExport(page);
    expect(r.blob).not.toBeNull();
    expect(r.blob.type).toBe('image/png');
    expect(r.blob.size).toBeGreaterThan(10_000);
    expect(r.exporting).toBe(false);
  });

  test('the exported PNG is not a blank frame', async ({ page }) => {
    const px = await page.evaluate(async () => {
      const out = await window.__NF.composite(600, 400);
      const d = out.getContext('2d').getImageData(0, 0, 600, 400).data;
      const seen = new Set();
      for (let i = 0; i < d.length; i += 4 * 997) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
      return { unique: seen.size, allBlack: [...seen].every(s => s === '0,0,0') };
    });
    expect(px.allBlack).toBe(false);
    expect(px.unique).toBeGreaterThan(1);
  });

  test('SVG export produces a document with the field embedded', async ({ page }) => {
    await pickSeg(page, 'expFmt', 'svg');
    const r = await page.evaluate(async () => {
      let text = null;
      const orig = URL.createObjectURL;
      const done = new Promise(res => {
        URL.createObjectURL = function (b) { b.text().then(t => { text = t; res(); }); return orig.call(URL, b); };
      });
      document.getElementById('exportBtn').click();
      await Promise.race([done, new Promise(z => setTimeout(z, 30000))]);
      URL.createObjectURL = orig;
      return { text, toast: document.getElementById('toast').textContent };
    });
    expect(r.text, 'no svg produced: ' + r.toast).not.toBeNull();
    expect(r.text).toContain('<svg');
    expect(r.text).toContain('</svg>');
    expect(r.text).toContain('data:image/png;base64,');   // the rasterised field
    const dims = await state(page);
    expect(r.text).toContain('viewBox="0 0 ' + dims.canvasW + ' ' + dims.canvasH + '"');
  });

  test('a size that exceeds the single-pass budget is rendered in tiles', async ({ page }) => {
    await commitInput(page, 'cw', 8192);
    await commitInput(page, 'ch', 4096);
    await settle(page);
    const plan = await page.evaluate(() => window.__NF.tilePlan(8192, 4096));
    expect(plan.cols * plan.rows).toBeGreaterThan(1);

    const r = await page.evaluate(async () => {
      const out = await window.__NF.composite(8192, 4096);
      const ctx = out.getContext('2d');
      // sample a row inside every tile so a dead tile cannot hide
      const rows = [1, 1024, 2048, 3072, 4095].map(y => {
        const d = ctx.getImageData(0, y, 8192, 1).data;
        let nonBlack = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) nonBlack++;
        return nonBlack;
      });
      return { w: out.width, h: out.height, rows, lost: window.__NF.isContextLost() };
    });
    expect(r).toMatchObject({ w: 8192, h: 4096, lost: false });
    for (const nonBlack of r.rows) expect(nonBlack).toBeGreaterThan(8000);
  });

  test('a tiled render is pixel-identical to a single-pass render', async ({ page }) => {
    const diff = await page.evaluate(() => {
      const N = window.__NF, W = 800, H = 600;
      const draw = plan => {
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        N.paintField(ctx, W, H, plan);
        return ctx.getImageData(0, 0, W, H).data;
      };
      const one = draw({ tw: W, th: H, cols: 1, rows: 1 });
      const many = draw({ tw: 300, th: 250, cols: 3, rows: 3 });   // deliberately partial edge tiles
      let n = 0;
      for (let i = 0; i < one.length; i++) if (one[i] !== many[i]) n++;
      return n;
    });
    expect(diff).toBe(0);
  });

  test('rapid clicks cannot start overlapping exports', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const btn = document.getElementById('exportBtn');
      btn.click();
      // synchronously re-entrant: the guard has to be set before the first await
      const guardedAt = { exporting: window.__NF.isExporting(), disabled: btn.disabled };
      btn.click(); btn.click();
      let blobs = 0;
      const orig = URL.createObjectURL;
      URL.createObjectURL = function (b) { blobs++; return orig.call(URL, b); };
      for (let i = 0; i < 200 && window.__NF.isExporting(); i++) await new Promise(z => setTimeout(z, 100));
      await new Promise(z => setTimeout(z, 500));
      URL.createObjectURL = orig;
      return { guardedAt, blobs, exporting: window.__NF.isExporting() };
    });
    expect(r.guardedAt).toEqual({ exporting: true, disabled: true });
    expect(r.blobs).toBeLessThanOrEqual(1);
    expect(r.exporting).toBe(false);
  });

  test('the button is disabled while exporting and restored afterwards', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const btn = document.getElementById('exportBtn');
      const label = btn.textContent;
      btn.click();
      const during = { disabled: btn.disabled, text: btn.textContent };
      for (let i = 0; i < 200 && window.__NF.isExporting(); i++) await new Promise(z => setTimeout(z, 100));
      return { during, after: { disabled: btn.disabled, text: btn.textContent }, label };
    });
    expect(r.during.disabled).toBe(true);
    expect(r.after.disabled).toBe(false);
    expect(r.after.text).toBe(r.label);
  });

  test('a failing export unblocks the preview and says what happened', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const N = window.__NF;
      const orig = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = () => { throw new Error('synthetic failure'); };
      document.getElementById('exportBtn').click();
      for (let i = 0; i < 60 && N.isExporting(); i++) await new Promise(z => setTimeout(z, 100));
      const btn = document.getElementById('exportBtn');
      const out = {
        exporting: N.isExporting(),
        disabled: btn.disabled,
        label: btn.textContent,
        toast: document.getElementById('toast').textContent,
      };
      HTMLCanvasElement.prototype.toBlob = orig;
      return out;
    });
    expect(r.exporting).toBe(false);
    expect(r.disabled).toBe(false);
    expect(r.label).toMatch(/export/i);
    expect(r.toast).toMatch(/could not|fail/i);
  });

  test('the animation resumes after an export finishes', async ({ page }) => {
    await page.evaluate(async () => {
      document.getElementById('exportBtn').click();
      for (let i = 0; i < 200 && window.__NF.isExporting(); i++) await new Promise(z => setTimeout(z, 100));
    });
    const moved = await page.evaluate(async () => {
      const a = window.__NF.getClock();
      await new Promise(r => setTimeout(r, 400));
      return window.__NF.getClock() !== a;
    });
    expect(moved).toBe(true);
  });

  test('the footer reports the size that will be exported', async ({ page }) => {
    await commitInput(page, 'cw', 1500);
    await commitInput(page, 'ch', 500);
    await settle(page);
    const shown = await page.textContent('#exportSize');
    expect(shown).toContain('1500');
    expect(shown).toContain('500');
  });

  test('changing format mid-export leaves the button label correct', async ({ page }) => {
    const label = await page.evaluate(async () => {
      const btn = document.getElementById('exportBtn');
      btn.click();
      document.querySelector('#expFmt button[data-v="svg"]').click();
      for (let i = 0; i < 200 && window.__NF.isExporting(); i++) await new Promise(z => setTimeout(z, 100));
      return btn.textContent;
    });
    expect(label).toMatch(/SVG/i);
  });

  test('video export records a playable file', async ({ page }) => {
    await pickSeg(page, 'expFmt', 'mp4');
    await page.evaluate(() => {
      const d = document.getElementById('vidDur');
      d.value = d.min || '2';
      d.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await commitInput(page, 'cw', 480);
    await commitInput(page, 'ch', 480);
    await settle(page);
    const r = await captureExport(page, 60_000);
    expect(r.blob, 'no video produced: ' + r.toast).not.toBeNull();
    expect(r.blob.size).toBeGreaterThan(1000);
    expect(r.blob.type).toMatch(/video|mp4|webm/);
  });
});
