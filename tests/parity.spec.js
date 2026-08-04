/* Render regression guard.
 *
 * Hashes the pixels of every field preset and of several export sizes, then
 * compares them against tests/render-baseline.json. Any change to the shader,
 * the compositor or the export path that alters output will fail here.
 *
 * To accept a deliberate visual change: npm run test:parity:update
 */
const { test, expect } = require('@playwright/test');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BASELINE = path.join(__dirname, 'render-baseline.json');

/* Pinning Math.random fixes the seed; pinning performance.now and the rAF
   timestamp makes dt exactly 0, so `clock` never advances and every frame is
   byte-reproducible. */
const FREEZE = () => {
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => raf(() => cb(1000));
  performance.now = () => 1000;
  Math.random = () => 0.42;
};

const nFrames = n => new Promise(res => {
  let i = 0; (function f() { i++; if (i < n) requestAnimationFrame(f); else res(); })();
});

const FIELD_COUNT = 10;
// the last one is past the single-pass budget, so it exercises the tiled path
const EXPORT_SIZES = [[1920, 640], [1080, 1350], [3000, 1000], [6144, 4096]];

test('render output matches the committed baseline', async ({ page }) => {
  test.slow();
  await page.addInitScript(FREEZE);
  await page.goto(process.env.TARGET || '/index.html');
  await expect(page.locator('#gl')).toHaveClass(/ready/, { timeout: 15_000 });
  await page.evaluate(nFrames, 10);

  const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
  const hashes = {};

  for (let field = 0; field < FIELD_COUNT; field++) {
    const url = await page.evaluate(async f => {
      document.querySelector(`#field button[data-v="${f}"]`).click();
      await new Promise(res => { let i = 0; (function g() { i++; if (i < 4) requestAnimationFrame(g); else res(); })(); });
      return document.getElementById('gl').toDataURL();
    }, field);
    hashes['field' + field] = hash(url);
  }

  // full composite (field + mask + copy + logo) through the real export path
  for (const [w, h] of EXPORT_SIZES) {
    const url = await page.evaluate(async ([W, H]) => {
      const set = (id, v) => {
        const el = document.getElementById(id);
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      set('cw', W); set('ch', H);
      await new Promise(res => { let i = 0; (function g() { i++; if (i < 6) requestAnimationFrame(g); else res(); })(); });

      let data = null;
      const orig = HTMLCanvasElement.prototype.toBlob;
      const done = new Promise(res => {
        HTMLCanvasElement.prototype.toBlob = function (cb, ...a) {
          data = this.toDataURL();
          res();
          return orig.call(this, cb, ...a);   // forward cb or the export never settles
        };
      });
      document.getElementById('exportBtn').click();
      await Promise.race([done, new Promise(z => setTimeout(z, 60_000))]);
      HTMLCanvasElement.prototype.toBlob = orig;
      return data;
    }, [w, h]);
    hashes[`export-${w}x${h}`] = url ? hash(url) : 'NULL';
  }

  expect(Object.values(hashes)).not.toContain('NULL');

  if (process.env.UPDATE_BASELINE) {
    fs.writeFileSync(BASELINE, JSON.stringify(hashes, null, 2) + '\n');
    test.info().annotations.push({ type: 'baseline', description: 'rewritten' });
    return;
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  expect(hashes).toEqual(baseline);
});
