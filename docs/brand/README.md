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
- PNG hero: `docs/brand/learn-hero.png` is rendered by the shared Project Telos brand renderer
  `project-telos.brand-render/v2` (`telos/tools/render_flagship_heroes.py`, Pillow), the same
  pipeline that produces the gather, crucible, index, forum, and telos heroes, using the
  operator-owned Kilon (display) and Conso (mono) font packages rendered locally. The public
  repository carries only the exported PNG, not the purchased font files. The `learn` brand entry
  lives in `docs/brand/brand-config.json` in this repo; regenerate from a telos checkout with
  `python ../telos/tools/render_flagship_heroes.py --render --config ../learn/docs/brand/brand-config.json --public-root ..`
  (the same renderer and Kilon/Conso font packages the other flagship heroes use).
- Accessibility floor: both SVGs carry `role="img"`, an `aria-label`, a `<title>`, and a `<desc>`,
  each stating the same plain-language summary of the tool. High-contrast foreground text sits on
  a solid, texture-free background, and status/role information (the eyebrow line, the tagline
  strip) never depends on color alone. `learn-hero.png` is the static fallback for GitHub's README
  renderer and any host that does not render inline SVG.
- Provenance boundary: no third-party image, template, or generated-art source was used. The
  motif, the wordmark, and the copy are original to this repository.
