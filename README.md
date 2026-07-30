# Social Post — Newton Field Generator

An interactive tool for generating Newton-branded background patterns and motion,
ready to drop into social posts, banners, and other marketing surfaces.

![The Field Generator — animated canvas on the left, editor panel on the right](docs/hero.png)

## View it

**Live link:** https://alisonhu-magic.github.io/social-post/

It's a single self-contained HTML file (fonts, shaders, and logo are embedded), so it
also works offline — just open `index.html` in any modern browser.

## Quick start

1. Open the live link (or `index.html`).
2. Pick a **canvas format** at the top of the panel (Banner, Square, Story…).
3. Choose a **Field** pattern and adjust colors, text, and logo.
4. Hit **Export** to save a PNG, SVG, or MP4.

Hover the canvas to reveal a small toolbar with **pause** and **reseed**.

## The editor

The right-hand panel is organized into task-ordered, collapsible groups so you can
work top to bottom: **Canvas → Background → Content → Guides → Export**.

<table>
<tr>
<td width="33%" valign="top">

**Canvas & Field**

Start with a format preset (or type exact dimensions), then choose one of ten
procedural fields. Each field shows a live micro-render thumbnail so you can see the
outcome before selecting it.

</td>
<td width="33%" valign="top">

**Colors**

A fixed marketing palette — tap a color to add it, then pick its **Ground** dot to
use it as the background; everything else becomes marks. Per-color **density** sliders
control how often each color appears, and **AA badges** rate each mark's contrast
against the ground.

</td>
<td width="33%" valign="top">

**Export**

Save a flat **PNG**, an **SVG** (frame embedded as a raster), or an **MP4** with an
editable duration. Turn on **Seamless loop** and the clip ping-pongs so it repeats
without a visible seam.

</td>
</tr>
<tr>
<td valign="top"><img src="docs/panel.png" alt="Canvas format presets and field pattern thumbnails" /></td>
<td valign="top"><img src="docs/colors.png" alt="Brand palette with ground selection, density sliders, and AA contrast badges" /></td>
<td valign="top"><img src="docs/export.png" alt="Export options: PNG, SVG, and MP4 with duration and seamless loop" /></td>
</tr>
</table>

Other controls:

- **Content → Text** — eyebrow, headline, and body copy, each with its own color and
  one of four sizes (S–XL, a 1.61 scale set as a share of canvas width so the
  proportion survives any export size). Wrap words in `*asterisks*` for italic.
- **Content → Logo** — mark or full lockup, placed on a 3×3 grid at a single fixed
  size. Turn on the **Scrim** backing to wash a soft halo of the background color
  behind the mark so it stays legible over a dense pattern.
- **Canvas → Fade mask** — on by default. Its direction follows your text alignment:
  left- or right-aligned copy fades in from that edge, and centered copy gets a
  symmetric band that clears the middle while the pattern still reads at both sides.
  **Solid stop** and **Fade end** control how far the clear area extends.
- **Marks** — the pattern's density, weight, and jitter. This is locked to the
  designer's default; click the lock icon to unlock and edit.
- **Guides** — a red grid overlay (margin + gutter) to help you align copy.

What you see in the canvas is what you get: the PNG, MP4, HTML, and React outputs all
share one set of layout and gradient definitions with the live preview.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Pause / resume the animation |
| `R` | Reseed (new random variation) |
| `E` | Export using the current format |

## Brand palette

Colors are sourced from the Newton design-system primitives — no custom colors.

| Name | Hex | Use |
| --- | --- | --- |
| Navy | `#203C7F` | Deep grounds, high-contrast marks |
| Cornflower | `#3D6FE8` | Primary marketing blue |
| Periwinkle | `#BACCF8` | Light accents, gradients |
| Sky | `#EEF3FF` | Subtle light grounds |
| Ink | `#0E0E0F` | Near-black grounds and marks |
| Slate | `#71727A` | Muted neutral marks |
| Mist | `#E4E4E7` | Soft neutral grounds |
| Paper | `#FBFCFE` | Bright white grounds |
| Gold | `#CBC28F` | Editorial headline blocks |
| Cream | `#E7E4DB` | Paper-tone grounds |

Up to 8 colors can be active at once.

## Updating

Edit `index.html` and push to `main`; GitHub Pages redeploys automatically (usually
within a minute).

The screenshots in `docs/` are generated with Playwright — re-run the capture script
after significant UI changes to keep this README in sync.
