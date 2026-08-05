/* Renders the banner across a spread of aspect ratios and writes a contact
   sheet plus the proportions each ratio lands on.

     node tools/ratios.js                     # default copy, current logo
     node tools/ratios.js --copy long         # stress wrapping
     node tools/ratios.js --logo mark         # square-ish artwork instead
     node tools/ratios.js --only 3:1          # just the baseline

   The approved 3:1 banner is the visual baseline, so every other ratio is read
   as a deviation from it: the table reports each ratio's headline-to-logo
   relationship, its logo width as a share of the canvas, and its measure, all
   of which should hold steady if the scaling system is working.

   This drives the real page over http, so it always reflects whatever is
   currently in index.html — no numbers are duplicated here. */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'ratios');

/* Representative shapes, widest to tallest. Sizes are real export sizes so the
   reported pixel figures are the ones a designer would actually ship. */
const RATIOS = [
  { id: '6:1',  name: 'Ultra-wide',    w: 2400, h: 400,  edge: true },
  { id: '3:1',  name: 'Banner',        w: 1920, h: 640,  baseline: true },
  { id: '2:1',  name: 'Wide',          w: 1920, h: 960 },
  { id: '16:9', name: 'Widescreen',    w: 1920, h: 1080 },
  { id: '4:3',  name: 'Classic',       w: 1440, h: 1080 },
  { id: '1:1',  name: 'Square',        w: 1080, h: 1080 },
  { id: '4:5',  name: 'Portrait',      w: 1080, h: 1350 },
  { id: '9:16', name: 'Story',         w: 1080, h: 1920 },
  { id: '1:3',  name: 'Ultra-tall',    w: 640,  h: 1920, edge: true },
];

const COPY = {
  default: null,   // leave whatever the page ships with
  short:   { eyebrow: 'Security', head: 'Ship faster.', body: '' },
  long:    {
    eyebrow: 'Authorization layer',
    head: 'Policy, enforced *before* the transaction exists, across every service you run.',
    body: 'Newton evaluates each request against your rules at the edge, so nothing reaches the ledger unchecked.',
  },
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };

/* A tiny static server keeps this script free of npx/port juggling. */
function serve(root) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.join(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end('not found');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

/* Let the rAF loop run so sizeCanvas()/fitFrame() settle — headless throttles
   rAF while the page sits idle. */
const settle = page => page.evaluate(() => new Promise(res => {
  let i = 0;
  (function f() { i++; if (i < 12) requestAnimationFrame(f); else res(); })();
}));

/* Everything the contact sheet reports, measured off the live DOM. Ratios are
   read from the preview frame, then converted to export pixels so the numbers
   match what ships. */
function measure() {
  const px = v => parseFloat(v) || 0;
  const frame = document.getElementById('frame').getBoundingClientRect();
  const S = window.__NF.S;
  const toExport = S.canvasW / frame.width;   // preview is fitted, so rescale

  const plate = document.querySelector('#logoLayer .plate');
  const logo = plate ? plate.getBoundingClientRect() : null;
  const svg = plate ? plate.querySelector('svg') : null;
  const svgBox = svg ? svg.getBoundingClientRect() : null;

  const inner = document.getElementById('txtInner');
  const innerBox = inner.getBoundingClientRect();
  const blocks = ['tEyebrow', 'tHead', 'tBody'].map(id => {
    const el = document.getElementById(id);
    if (!el || getComputedStyle(el).display === 'none') return null;
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const size = px(cs.fontSize);
    const lead = px(cs.lineHeight) || size * 1.2;
    return {
      id, size: size * toExport,
      lines: Math.max(1, Math.round(box.height / lead)),
      widthPct: box.width / frame.width * 100,
    };
  }).filter(Boolean);

  const head = blocks.find(b => b.id === 'tHead');
  const logoH = logo ? logo.height * toExport : 0;
  const logoW = logo ? logo.width * toExport : 0;

  return {
    w: Math.round(S.canvasW), h: Math.round(S.canvasH),
    logo: logo ? {
      hPx: logoH, wPx: logoW,
      hPctH: logo.height / frame.height * 100,
      wPctW: logo.width / frame.width * 100,
      /* the drawn artwork, so a stretched logo shows up as a changed ratio */
      ar: svgBox && svgBox.height ? svgBox.width / svgBox.height : null,
    } : null,
    head: head ? {
      px: head.size,
      pctW: head.size / S.canvasW * 100,
      pctH: head.size / S.canvasH * 100,
      lines: head.lines,
    } : null,
    headToLogo: head && logoH ? head.size / logoH : null,
    measurePctW: innerBox.width / frame.width * 100,
    blocks,
    /* nothing may spill outside the frame */
    overflow: {
      text: innerBox.left < frame.left - 1 || innerBox.right > frame.right + 1 ||
            innerBox.top < frame.top - 1 || innerBox.bottom > frame.bottom + 1,
      logo: logo ? (logo.left < frame.left - 1 || logo.right > frame.right + 1 ||
            logo.top < frame.top - 1 || logo.bottom > frame.bottom + 1) : false,
    },
  };
}

(async () => {
  const copyKey = arg('--copy', 'default');
  const logoType = arg('--logo', null);
  const only = arg('--only', null);
  const list = only ? RATIOS.filter(r => r.id === only) : RATIOS;
  if (!list.length) { console.error(`no ratio matching "${only}"`); process.exit(1); }

  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve(ROOT);
  const port = server.address().port;

  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForSelector('#gl.ready', { timeout: 20_000 });

  if (COPY[copyKey]) {
    await page.evaluate(c => {
      Object.assign(window.__NF.S.text, c);
      document.getElementById('tiEyebrow').value = c.eyebrow;
      document.getElementById('tiHead').value = c.head;
      document.getElementById('tiBody').value = c.body;
      document.getElementById('tiHead').dispatchEvent(new Event('input', { bubbles: true }));
    }, COPY[copyKey]);
  }
  if (logoType) await page.click(`#lType button[data-v="${logoType}"]`);

  const rows = [];
  for (const r of list) {
    await page.evaluate(([w, h]) => {
      for (const [id, v] of [['cw', w], ['ch', h]]) {
        const el = document.getElementById(id);
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, [r.w, r.h]);
    await settle(page);

    const file = `${r.id.replace(':', '-')}.png`;
    await page.locator('#frame').screenshot({ path: path.join(OUT, file) });
    rows.push({ ...r, file, m: await page.evaluate(measure) });
  }

  await browser.close();
  server.close();

  report(rows, { copyKey, logoType });
  writeSheet(rows, { copyKey, logoType });
})();

function report(rows, opts) {
  const base = rows.find(r => r.baseline);
  const n = (v, d = 1) => v == null ? '   —' : v.toFixed(d).padStart(5);

  console.log(`\ncopy: ${opts.copyKey}   logo: ${opts.logoType || 'as configured'}\n`);
  console.log('ratio  size          head px  %W    %H    lines  head/logo  logo %W  measure %W  overflow');
  console.log('─'.repeat(94));
  for (const r of rows) {
    const m = r.m;
    const over = [m.overflow.text && 'text', m.overflow.logo && 'logo'].filter(Boolean).join('+') || '–';
    console.log(
      `${r.id.padEnd(6)} ${String(m.w + '×' + m.h).padEnd(13)}` +
      `${n(m.head && m.head.px, 0)}  ${n(m.head && m.head.pctW, 2)} ${n(m.head && m.head.pctH, 2)}` +
      `   ${String(m.head ? m.head.lines : '—').padStart(4)}   ${n(m.headToLogo, 2)}    ` +
      `${n(m.logo && m.logo.wPctW, 1)}      ${n(m.measurePctW, 1)}      ${over}${r.baseline ? '   ← baseline' : ''}`
    );
  }

  if (base) {
    const b = base.m;
    console.log(`\n3:1 baseline proportions (${b.w}×${b.h})`);
    console.log('─'.repeat(46));
    const put = (k, v) => console.log(`  ${k.padEnd(30)} ${v}`);
    if (b.logo) {
      put('logo height', `${b.logo.hPx.toFixed(1)}px  (${b.logo.hPctH.toFixed(2)}% of H)`);
      put('logo width', `${b.logo.wPx.toFixed(1)}px  (${b.logo.wPctW.toFixed(2)}% of W)`);
      put('logo aspect ratio', b.logo.ar ? b.logo.ar.toFixed(4) : '—');
    }
    if (b.head) {
      put('headline', `${b.head.px.toFixed(1)}px  (${b.head.pctW.toFixed(2)}% W / ${b.head.pctH.toFixed(2)}% H)`);
      put('headline lines', b.head.lines);
    }
    if (b.headToLogo) put('headline ÷ logo height', b.headToLogo.toFixed(3));
    put('measure', `${b.measurePctW.toFixed(2)}% of W`);
    for (const blk of b.blocks) {
      put(`${blk.id.replace('t', '').toLowerCase()} size`, `${blk.size.toFixed(1)}px`);
    }
    console.log('\nAnything that should hold across ratios is a column above:');
    console.log('head/logo, logo %W and measure %W drift as the shape changes.\n');
  }
  console.log(`contact sheet → ${path.relative(ROOT, path.join(OUT, 'index.html'))}\n`);
}

function writeSheet(rows, opts) {
  const card = r => {
    const m = r.m;
    const stat = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
    return `<figure class="${r.baseline ? 'baseline' : ''}${r.edge ? ' edge' : ''}">
      <div class="shot" style="--ar:${(m.w / m.h).toFixed(4)}"><img src="${r.file}" alt="${r.name} at ${r.id}"></div>
      <figcaption>
        <h2>${r.id} <small>${r.name} · ${m.w}×${m.h}</small>${r.baseline ? '<b>baseline</b>' : ''}</h2>
        <dl>
          ${stat('head', m.head ? `${m.head.px.toFixed(0)}px` : '—')}
          ${stat('head ÷ logo', m.headToLogo ? m.headToLogo.toFixed(2) : '—')}
          ${stat('logo % W', m.logo ? `${m.logo.wPctW.toFixed(1)}%` : '—')}
          ${stat('measure % W', `${m.measurePctW.toFixed(1)}%`)}
          ${stat('lines', m.head ? m.head.lines : '—')}
          ${stat('overflow', [m.overflow.text && 'text', m.overflow.logo && 'logo'].filter(Boolean).join(', ') || 'none')}
        </dl>
      </figcaption>
    </figure>`;
  };

  const html = `<!doctype html>
<meta charset="utf-8">
<title>Banner ratios — contact sheet</title>
<style>
  :root{color-scheme:light}
  body{margin:0;padding:32px;background:#F9FAFB;color:#101828;
       font:14px/1.5 Inter,-apple-system,system-ui,sans-serif}
  header{max-width:820px;margin:0 0 28px}
  h1{font-size:20px;margin:0 0 6px;letter-spacing:-.01em}
  header p{margin:0;color:#475467}
  .grid{display:grid;gap:24px;grid-template-columns:repeat(auto-fill,minmax(360px,1fr))}
  figure{margin:0;background:#fff;border:1px solid #EAECF0;border-radius:12px;overflow:hidden;
         box-shadow:0 1px 2px rgba(16,24,40,.06)}
  figure.baseline{border-color:#3D6FE8;box-shadow:0 0 0 3px rgba(61,111,232,.14)}
  figure.edge{border-style:dashed}
  .shot{display:grid;place-items:center;padding:16px;background:#F2F4F7;min-height:180px}
  .shot img{max-width:100%;max-height:260px;display:block;
            box-shadow:0 1px 3px rgba(16,24,40,.2)}
  figcaption{padding:14px 16px 16px;border-top:1px solid #EAECF0}
  h2{font-size:14px;margin:0 0 10px;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
  h2 small{font-weight:400;color:#667085}
  h2 b{margin-left:auto;font-size:11px;text-transform:uppercase;letter-spacing:.06em;
       color:#3D6FE8;background:#EEF3FF;padding:2px 7px;border-radius:999px}
  dl{margin:0;display:grid;grid-template-columns:repeat(3,1fr);gap:8px 12px}
  dt{font-size:11px;color:#667085;text-transform:uppercase;letter-spacing:.04em}
  dd{margin:2px 0 0;font-variant-numeric:tabular-nums;font-weight:500}
</style>
<header>
  <h1>Banner ratios</h1>
  <p>The 3:1 banner is the approved baseline. <b>head ÷ logo</b>, <b>logo % W</b> and
  <b>measure % W</b> should stay close to their baseline values if the composition is
  holding; drift in those columns is what the scaling work has to fix.
  Copy set: <b>${opts.copyKey}</b>. Dashed cards are edge cases.</p>
</header>
<div class="grid">${rows.map(card).join('')}</div>
`;
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
}
