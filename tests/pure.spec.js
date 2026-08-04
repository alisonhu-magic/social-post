/* Unit coverage for the pure helpers the tool exposes on window.__NF. These run
   in-page but touch no DOM, so they're fast and precise about edge cases. */
const { test, expect } = require('@playwright/test');
const { open } = require('./helpers');

test.beforeEach(async ({ page }) => { await open(page); });

const call = (page, fn, args) => page.evaluate(([f, a]) => window.__NF[f](...a), [fn, args]);

test.describe('fitFrameWidth', () => {
  test('is limited by width when the box is wide', async ({ page }) => {
    // 3:1 in a 1000x1000 box -> width wins
    expect(await call(page, 'fitFrameWidth', [1000, 1000, 1100, 3])).toBe(1000);
  });

  test('is limited by height for tall ratios', async ({ page }) => {
    // 9:16 (0.5625) in a 1000x756 box -> 756*0.5625 = 425.25 -> 425
    expect(await call(page, 'fitFrameWidth', [1000, 756, 1100, 0.5625])).toBe(425);
  });

  test('is limited by the max width cap', async ({ page }) => {
    expect(await call(page, 'fitFrameWidth', [4000, 4000, 1100, 3])).toBe(1100);
  });

  test('never returns a non-positive width', async ({ page }) => {
    expect(await call(page, 'fitFrameWidth', [0, 0, 1100, 3])).toBe(1);
    expect(await call(page, 'fitFrameWidth', [-50, -50, 1100, 1])).toBe(1);
  });

  test('treats an unbounded height as width-limited', async ({ page }) => {
    expect(await call(page, 'fitFrameWidth', [820, Infinity, 1100, 0.5625])).toBe(820);
  });
});

test.describe('tilePlan', () => {
  test('uses a single tile when the frame fits the budget', async ({ page }) => {
    expect(await call(page, 'tilePlan', [1920, 640])).toEqual({ tw: 1920, th: 640, cols: 1, rows: 1 });
  });

  test('splits a frame that exceeds the area budget', async ({ page }) => {
    const plan = await call(page, 'tilePlan', [8192, 8192]);
    expect(plan.cols * plan.rows).toBeGreaterThan(1);
    expect(plan.tw * plan.th).toBeLessThanOrEqual(16 * 1024 * 1024);
    // tiles must cover the frame
    expect(plan.cols * plan.tw).toBeGreaterThanOrEqual(8192);
    expect(plan.rows * plan.th).toBeGreaterThanOrEqual(8192);
  });

  test('respects a max dimension smaller than the frame', async ({ page }) => {
    const plan = await call(page, 'tilePlan', [4000, 4000, 1024, 16 * 1024 * 1024]);
    expect(plan.tw).toBeLessThanOrEqual(1024);
    expect(plan.th).toBeLessThanOrEqual(1024);
    expect(plan.cols).toBe(4);
    expect(plan.rows).toBe(4);
  });

  test('covers frames whose size is not a tile multiple', async ({ page }) => {
    const plan = await call(page, 'tilePlan', [1000, 1000, 300, 9e9]);
    expect(plan).toMatchObject({ tw: 300, th: 300, cols: 4, rows: 4 });
  });
});

test.describe('clampDim', () => {
  const cases = [
    ['1920', 640, 1920],
    ['0', 640, 16],        // below min clamps up rather than silently reverting
    ['-5', 640, 16],
    ['99999', 640, 8192],
    ['', 640, 640],        // mid-edit empty keeps the previous size
    ['abc', 640, 640],
    ['1920.7', 640, 1920],
  ];
  for (const [raw, prev, want] of cases) {
    test(`"${raw}" -> ${want}`, async ({ page }) => {
      expect(await call(page, 'clampDim', [raw, prev])).toBe(want);
    });
  }
});

test.describe('axisMax', () => {
  test('leaves room for the full pixel budget on the other axis', async ({ page }) => {
    const { areaMax } = await page.evaluate(() => window.__NF.limits());
    for (const other of [640, 1080, 4096, 8192]) {
      const max = await call(page, 'axisMax', [other]);
      expect(max * other, `other ${other}`).toBeLessThanOrEqual(areaMax);
    }
  });

  test('never exceeds the per-side limit for small frames', async ({ page }) => {
    expect(await call(page, 'axisMax', [16])).toBe(8192);
  });

  test('never returns less than the minimum side', async ({ page }) => {
    expect(await call(page, 'axisMax', [1e9])).toBe(16);
    expect(await call(page, 'axisMax', [0])).toBe(8192);
  });
});

test.describe('maskStops', () => {
  test('edge fade runs solid then fades to the far edge', async ({ page }) => {
    await page.evaluate(() => { Object.assign(window.__NF.S, { maskDir: 'to right', maskSolid: 30, maskFade: 70 }); });
    expect(await call(page, 'maskStops', [])).toEqual([[0, 1], [30, 1], [70, 0], [100, 0]]);
  });

  test('centre fade is symmetric around the middle', async ({ page }) => {
    await page.evaluate(() => { Object.assign(window.__NF.S, { maskDir: 'center', maskSolid: 30, maskFade: 70 }); });
    expect(await call(page, 'maskStops', [])).toEqual([[15, 0], [35, 1], [65, 1], [85, 0]]);
  });

  test('stops stay monotonic even if fade end is below the solid stop', async ({ page }) => {
    await page.evaluate(() => { Object.assign(window.__NF.S, { maskDir: 'to right', maskSolid: 80, maskFade: 10 }); });
    const stops = await call(page, 'maskStops', []);
    const offs = stops.map(s => s[0]);
    expect(offs).toEqual([...offs].sort((a, b) => a - b));
  });
});

test.describe('contrastRatio', () => {
  test('matches known WCAG values', async ({ page }) => {
    expect(await call(page, 'contrastRatio', ['#FFFFFF', '#000000'])).toBeCloseTo(21, 2);
    expect(await call(page, 'contrastRatio', ['#FFFFFF', '#FFFFFF'])).toBeCloseTo(1, 5);
  });

  test('is symmetric', async ({ page }) => {
    const a = await call(page, 'contrastRatio', ['#3D6FE8', '#E7E4DB']);
    const b = await call(page, 'contrastRatio', ['#E7E4DB', '#3D6FE8']);
    expect(a).toBeCloseTo(b, 10);
  });

  test('badge class follows the AA thresholds', async ({ page }) => {
    const cls = r => page.evaluate(x => window.__NF.aaBadge(x).match(/aa (\w+)/)[1], r);
    expect(await cls(4.5)).toBe('pass');
    expect(await cls(4.49)).toBe('warn');
    expect(await cls(3)).toBe('warn');
    expect(await cls(2.99)).toBe('fail');
  });
});

test.describe('stepPct', () => {
  test('maps the four type steps', async ({ page }) => {
    expect(await call(page, 'stepPct', [0])).toBe(1.2);
    expect(await call(page, 'stepPct', [3])).toBe(5.0);
  });

  test('clamps indices from older 8-step setups', async ({ page }) => {
    expect(await call(page, 'stepPct', [7])).toBe(5.0);
    expect(await call(page, 'stepPct', [-3])).toBe(1.2);
  });
});

test.describe('tokenize', () => {
  test('splits words and flags *italic* runs', async ({ page }) => {
    expect(await call(page, 'tokenize', ['a *b c* d', false])).toEqual([
      { text: 'a', italic: false },
      { text: 'b', italic: true },
      { text: 'c', italic: true },
      { text: 'd', italic: false },
    ]);
  });

  test('turns newlines into explicit breaks', async ({ page }) => {
    expect(await call(page, 'tokenize', ['a\nb', false])).toEqual([
      { text: 'a', italic: false }, { br: true }, { text: 'b', italic: false },
    ]);
  });

  test('uppercases when the role asks for it', async ({ page }) => {
    expect(await call(page, 'tokenize', ['ab', true])).toEqual([{ text: 'AB', italic: false }]);
  });

  test('leaves an unmatched asterisk as literal text', async ({ page }) => {
    expect(await call(page, 'tokenize', ['a *b', false])).toEqual([
      { text: 'a', italic: false }, { text: '*b', italic: false },
    ]);
  });

  test('collapses runs of whitespace', async ({ page }) => {
    expect(await call(page, 'tokenize', ['  a   b  ', false])).toEqual([
      { text: 'a', italic: false }, { text: 'b', italic: false },
    ]);
  });
});

test.describe('videoClock', () => {
  test('advances linearly when loop is off', async ({ page }) => {
    expect(await call(page, 'videoClock', [0, 0, 1, 4, false])).toBe(0);
    expect(await call(page, 'videoClock', [0, 1, 1, 4, false])).toBe(4);
  });

  test('ping-pongs back to the start when loop is on', async ({ page }) => {
    expect(await call(page, 'videoClock', [5, 0, 1, 4, true])).toBe(5);
    expect(await call(page, 'videoClock', [5, 0.5, 1, 4, true])).toBe(7);   // peak
    expect(await call(page, 'videoClock', [5, 1, 1, 4, true])).toBe(5);     // seamless
  });
});

test.describe('grid geometry', () => {
  test('column spans add up to the content width', async ({ page }) => {
    const r = await page.evaluate(() => {
      const N = window.__NF;
      N.S.grid.cols = 12; N.S.grid.margin = 6; N.S.grid.gutter = 1.5;
      const W = 1920, H = 640;
      return { full: N.spanPx(W, H, 12), content: W - 2 * (6 / 100 * Math.min(W, H)) };
    });
    expect(r.full).toBeCloseTo(r.content, 6);
  });

  test('span is clamped to the available columns', async ({ page }) => {
    const r = await page.evaluate(() => {
      const N = window.__NF;
      N.S.grid.cols = 12;
      return [N.spanPx(1920, 640, 99), N.spanPx(1920, 640, 12), N.spanPx(1920, 640, 0), N.spanPx(1920, 640, 1)];
    });
    expect(r[0]).toBeCloseTo(r[1], 6);
    expect(r[2]).toBeCloseTo(r[3], 6);
  });
});
