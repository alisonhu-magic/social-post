# Social Post — Newton Field Generator

An interactive tool for generating Newton-branded background patterns and motion,
ready to drop into social posts and other marketing surfaces.

## View it

**Live link:** https://alisonhu-magic.github.io/social-post/

It's a single self-contained HTML file (fonts, patterns, and logo are embedded), so it
also works offline — just open `index.html` in any modern browser.

## How to interact

- Pick a **field** / pattern direction and tune the controls in the right-hand panel.
- **Move the pointer** over the canvas — the interaction is baked into the HTML and React exports.
- Keyboard shortcuts: `Space` = pause · `R` = reseed · `E` = export.

## Exports

- **Export PNG** — flat image at the chosen canvas size (great for social posts).
- **Export HTML** — a standalone, self-contained animated page.
- **Export .json** — save a setup to share with the team or move between machines.

## Updating

Edit `index.html` and push to `main`; GitHub Pages redeploys automatically (usually within a minute).
