/* The composition is designed once, on the 3:1 banner, and scaled from there.
   These tests pin the proportions that have to survive every other shape:
   the headline-to-logo relationship, the logo's own aspect ratio, and the
   promise that nothing spills outside the frame. */
const { test, expect } = require('@playwright/test');
const { open, settle, expandAll, commitInput, pickSeg } = require('./helpers');

/* baseline first, then wider, then progressively taller */
const RATIOS = [
  ['3:1  banner',    1920, 640],
  ['6:1  ultrawide', 2400, 400],
  ['2:1  wide',      1920, 960],
  ['16:9 widescreen', 1920, 1080],
  ['4:3  classic',   1440, 1080],
  ['1:1  square',    1080, 1080],
  ['4:5  portrait',  1080, 1350],
  ['9:16 story',     1080, 1920],
  ['1:3  ultratall', 640, 1920],
];

const LONG_HEAD = 'Policy, enforced before the transaction exists, across every single service that you happen to run today.';

/* Everything is read off the live preview and expressed as a share of the
   frame, so the fitted preview size never enters the assertions. */
const measure = () => ({
  frame: (() => {
    const f = document.getElementById('frame').getBoundingClientRect();
    return { w: f.width, h: f.height, left: f.left, right: f.right, top: f.top, bottom: f.bottom };
  })(),
  logo: (() => {
    const plate = document.querySelector('#logoLayer .plate');
    if (!plate) return null;
    const box = plate.getBoundingClientRect();
    const svg = plate.querySelector('svg').getBoundingClientRect();
    return { w: box.w, h: box.height, box, drawnAR: svg.width / svg.height };
  })(),
  head: (() => {
    const el = document.getElementById('tHead');
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const size = parseFloat(cs.fontSize);
    return { size, lines: Math.max(1, Math.round(box.height / (parseFloat(cs.lineHeight) || size * 1.2))) };
  })(),
  inner: document.getElementById('txtInner').getBoundingClientRect(),
});

/** Set the canvas to an exact size and let the frame refit. */
async function useRatio(page, w, h) {
  await commitInput(page, 'cw', w);
  await commitInput(page, 'ch', h);
  await settle(page);
  return page.evaluate(measure);
}

test.beforeEach(async ({ page }) => {
  await open(page);
  await expandAll(page);
  await pickSeg(page, 'lType', 'lockup');
});

test.describe('scaling across aspect ratios', () => {
  test('the headline keeps its size relationship to the logo', async ({ page }) => {
    const seen = [];
    for (const [name, w, h] of RATIOS) {
      const m = await useRatio(page, w, h);
      seen.push([name, m.head.size / m.logo.h]);
    }
    const baseline = seen[0][1];
    for (const [name, ratio] of seen) {
      // a couple of percent of slack absorbs sub-pixel rounding in the frame fit
      expect(ratio / baseline, `${name} headline ÷ logo`).toBeGreaterThan(0.97);
      expect(ratio / baseline, `${name} headline ÷ logo`).toBeLessThan(1.03);
    }
  });

  test('the logo is never stretched', async ({ page }) => {
    const artwork = await page.evaluate(() => window.__NF.logoAR());
    for (const [name, w, h] of RATIOS) {
      const m = await useRatio(page, w, h);
      expect(m.logo.drawnAR / artwork, `${name} logo aspect ratio`).toBeCloseTo(1, 1);
    }
  });

  test('the logo and the copy stay inside the frame', async ({ page }) => {
    for (const [name, w, h] of RATIOS) {
      const m = await useRatio(page, w, h);
      for (const [what, box] of [['logo', m.logo.box], ['copy', m.inner]]) {
        expect(box.left, `${name} ${what} left`).toBeGreaterThanOrEqual(m.frame.left - 1);
        expect(box.right, `${name} ${what} right`).toBeLessThanOrEqual(m.frame.right + 1);
        expect(box.top, `${name} ${what} top`).toBeGreaterThanOrEqual(m.frame.top - 1);
        expect(box.bottom, `${name} ${what} bottom`).toBeLessThanOrEqual(m.frame.bottom + 1);
      }
    }
  });

  test('the headline stays legible against the canvas it sits on', async ({ page }) => {
    for (const [name, w, h] of RATIOS) {
      const m = await useRatio(page, w, h);
      const shortSide = Math.min(m.frame.w, m.frame.h);
      // never so small it disappears, never so large it crowds the frame
      expect(m.head.size / shortSide, `${name} headline ÷ short side`).toBeGreaterThan(0.02);
      expect(m.head.size / m.frame.h, `${name} headline ÷ height`).toBeLessThan(0.25);
    }
  });

  test('long copy still wraps to a readable number of lines', async ({ page }) => {
    await commitInput(page, 'tiHead', LONG_HEAD);
    for (const [name, w, h] of RATIOS) {
      const m = await useRatio(page, w, h);
      expect(m.head.lines, `${name} headline lines`).toBeLessThanOrEqual(8);
      expect(m.inner.bottom, `${name} copy overflows`).toBeLessThanOrEqual(m.frame.bottom + 1);
    }
  });
});

test.describe('layout tokens', () => {
  test('type and logo resolve to their baseline sizes on the 3:1 banner', async ({ page }) => {
    const got = await page.evaluate(() => {
      const N = window.__NF;
      const { w, h } = N.BASELINE;
      return {
        head: N.typePx(3, { scale: 1 }, w, h),
        logo: N.logoHeightPx(w, h),
        headPctW: N.typePx(3, { scale: 1 }, w, h) / w * 100,
        logoPctH: N.logoHeightPx(w, h) / h * 100,
      };
    });
    expect(got.headPctW).toBeCloseTo(5.0, 6);
    expect(got.logoPctH).toBeCloseTo(5.76, 6);
  });

  test('a fit-based share scales by the smaller of the two axes', async ({ page }) => {
    const got = await page.evaluate(() => {
      const N = window.__NF;
      const { w, h } = N.BASELINE;
      const at = (W, H) => N.tokenPx(100, 'fitw', W, H) / w;
      return { base: at(w, h), half: at(w / 2, h), tall: at(w, h * 4), wide: at(w * 4, h) };
    });
    expect(got.base).toBeCloseTo(1, 6);
    expect(got.half).toBeCloseTo(0.5, 6);   // width is the binding axis
    expect(got.tall).toBeCloseTo(1, 6);     // extra height buys nothing
    expect(got.wide).toBeCloseTo(1, 6);     // extra width buys nothing
  });
});
