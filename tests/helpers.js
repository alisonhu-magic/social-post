const { expect } = require('@playwright/test');

/* Pinning Math.random fixes the seed; pinning performance.now and the rAF
   timestamp makes dt exactly 0 so `clock` never advances. Together they make
   every render reproducible. */
const FREEZE = () => {
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => raf(() => cb(1000));
  performance.now = () => 1000;
  Math.random = () => 0.42;
};

/** Load the tool and wait for the first rendered frame. */
async function open(page, { freeze = false } = {}) {
  if (freeze) await page.addInitScript(FREEZE);
  await page.goto('/index.html');
  await expect(page.locator('#gl')).toHaveClass(/ready/, { timeout: 15_000 });
  return page;
}

/** Let the rAF loop run a few frames so sizeCanvas()/fitFrame() settle.
    Needed because headless throttles rAF while the page sits idle. */
const settle = (page, frames = 10) => page.evaluate(n => new Promise(res => {
  let i = 0;
  (function f() { i++; if (i < n) requestAnimationFrame(f); else res(); })();
}), frames);

/** Set a range/number input and fire the `input` event the UI listens for. */
const setInput = (page, id, value) => page.evaluate(([i, v]) => {
  const el = document.getElementById(i);
  el.value = String(v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, [id, value]);

/** Commit a text field the way a blur/Enter would. */
const commitInput = (page, id, value) => page.evaluate(([i, v]) => {
  const el = document.getElementById(i);
  el.value = String(v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, [id, value]);

/** Click a button inside a segmented control by its data-v value. */
const pickSeg = (page, groupId, value) =>
  page.click(`#${groupId} button[data-v="${value}"]`);

/** Sections in the rail start collapsed; open them all so controls are clickable. */
const expandAll = page => page.evaluate(() => {
  document.querySelectorAll('.rail .group.collapsed > h2 .ghead').forEach(h => h.click());
});

/** Read the app state snapshot exposed for tests. */
const state = page => page.evaluate(() => JSON.parse(JSON.stringify(window.__NF.S)));

/** Run an export and capture the resulting blob's size/type without downloading. */
const captureExport = (page, timeoutMs = 30_000) => page.evaluate(async ms => {
  const orig = URL.createObjectURL;
  let got = null;
  const done = new Promise(res => {
    URL.createObjectURL = function (b) { got = { size: b.size, type: b.type }; res(); return orig.call(URL, b); };
  });
  document.getElementById('exportBtn').click();
  await Promise.race([done, new Promise(r => setTimeout(r, ms))]);
  URL.createObjectURL = orig;
  const t = document.getElementById('toast');
  return { blob: got, toast: t.textContent, exporting: window.__NF.isExporting() };
}, timeoutMs);

module.exports = { FREEZE, open, settle, setInput, commitInput, pickSeg, expandAll, state, captureExport };
