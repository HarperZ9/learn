# learn Brand Assets

The README hero image and mark in this folder were authored on 2026-06-30 as part of bringing
`learn` to flagship parity with the rest of Project Telos (gather, crucible, forum, index, telos).

## Rendering Receipt

- Source: `docs/brand/learn-hero.svg` and `docs/brand/learn-mark.svg`, hand-authored SVG (SVG is
  text; no external renderer or design tool produced them).
- Product role: accountable credential and coursework engine; the teach-you learning loop.
- Tool-specific motif: an open book with a checkmark drawn in the iris accent, standing in for
  "study, then prove it yourself."
- Iris accent: `#3a2bd6`, matching the other flagships' single accent color discipline.
- Typography: the SVG wordmark and headline use system font stacks (`Arial, Helvetica, sans-serif`
  for the headline; `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` for the eyebrow and
  tagline rows), the same stack choice as gather/crucible/forum/index/telos. No purchased or
  bundled font file is required or shipped.
- PNG fallback: `docs/brand/learn-hero.png` is rasterized by `docs/brand/render-hero-png.mjs`, a
  small zero-dependency Node script (only `node:zlib` for deflate and `node:fs`/`node:path` for
  I/O; no canvas library, no image package, no external renderer). It draws the same composition
  as the SVG (background, rule lines, the book+checkmark motif, and a ghost wordmark) directly to
  RGB pixels and encodes them as a PNG by hand. Because a true SVG-to-raster pipeline needs a real
  rendering engine or a font-shaping dependency, and `learn` stays zero-dependency, the PNG's text
  is drawn with a small hand-authored 5x7 bitmap font rather than the SVG's actual font glyphs.
  This is an honest, purpose-built rasterizer for this one composition, not a general SVG renderer.
  Regenerate it with `node docs/brand/render-hero-png.mjs` from the repo root.
- Accessibility floor: both SVGs carry `role="img"`, an `aria-label`, a `<title>`, and a `<desc>`,
  each stating the same plain-language summary of the tool. High-contrast foreground text sits on
  a solid, texture-free background, and status/role information (the eyebrow line, the tagline
  strip) never depends on color alone. `learn-hero.png` is the static fallback for GitHub's README
  renderer and any host that does not render inline SVG.
- Provenance boundary: no third-party image, template, or generated-art source was used. The
  motif, the wordmark, and the copy are original to this repository.
