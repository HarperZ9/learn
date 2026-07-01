// Zero-dependency PNG rasterizer for the learn brand assets.
//
// This is NOT a general SVG rasterizer (that needs a real rendering engine or a font-shaping
// dependency, and learn stays zero-dep). It is a small, honest, purpose-built renderer that draws
// the SAME composition as docs/brand/learn-hero.svg (background, rule lines, a 5x7 bitmap-font
// wordmark + tagline, and the book+checkmark motif) directly to RGB pixels, then encodes those
// pixels as a PNG using only node:zlib (deflate) and node:fs. No canvas, no external font, no
// third-party PNG/image library.
//
// Usage: node docs/brand/render-hero-png.mjs
// Regenerates docs/brand/learn-hero.png (1600x640, a 1.25x raster of the 1280x520 SVG viewBox,
// matching the other Project Telos flagships' hero PNG scale).
import { writeFileSync } from "node:fs";
import { deflateSync, crc32 as zlibCrc32 } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCALE = 1.25; // matches the other flagships' SVG-viewBox -> PNG scale factor
const W = Math.round(1280 * SCALE);
const H = Math.round(520 * SCALE);

const BG = [0xf4, 0xf3, 0xef];
const INK = [0x0b, 0x0c, 0x0e];
const INK_SOFT = [0x58, 0x5c, 0x64];
const IRIS = [0x3a, 0x2b, 0xd6];

// --- pixel buffer ------------------------------------------------------------------------------
function makeCanvas(w, h, bg) {
  const px = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    px[i * 3] = bg[0]; px[i * 3 + 1] = bg[1]; px[i * 3 + 2] = bg[2];
  }
  return px;
}

function setPixel(px, w, h, x, y, color, alpha = 1) {
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  const i = (y * w + x) * 3;
  if (alpha >= 1) {
    px[i] = color[0]; px[i + 1] = color[1]; px[i + 2] = color[2];
  } else {
    px[i] = Math.round(px[i] * (1 - alpha) + color[0] * alpha);
    px[i + 1] = Math.round(px[i + 1] * (1 - alpha) + color[1] * alpha);
    px[i + 2] = Math.round(px[i + 2] * (1 - alpha) + color[2] * alpha);
  }
}

function fillRect(px, w, h, x0, y0, x1, y1, color, alpha = 1) {
  const yStart = Math.max(0, Math.floor(y0));
  const yEnd = Math.min(h, Math.ceil(y1));
  const xStart = Math.max(0, Math.floor(x0));
  const xEnd = Math.min(w, Math.ceil(x1));
  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) setPixel(px, w, h, x, y, color, alpha);
  }
}

function strokeRoundedRect(px, w, h, x0, y0, x1, y1, radius, color, thickness) {
  // approximate: draw a filled rounded-rect outline by filling the border band
  fillRect(px, w, h, x0, y0, x1, y0 + thickness, color);
  fillRect(px, w, h, x0, y1 - thickness, x1, y1, color);
  fillRect(px, w, h, x0, y0, x0 + thickness, y1, color);
  fillRect(px, w, h, x1 - thickness, y0, x1, y1, color);
}

function drawLine(px, w, h, x0, y0, x1, y1, color, thickness = 2, alpha = 1) {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + (dx * i) / steps);
    const y = Math.round(y0 + (dy * i) / steps);
    const t = Math.max(1, Math.round(thickness / 2));
    for (let ox = -t; ox <= t; ox++) {
      for (let oy = -t; oy <= t; oy++) {
        if (ox * ox + oy * oy <= t * t + 1) setPixel(px, w, h, x + ox, y + oy, color, alpha);
      }
    }
  }
}

// --- tiny 5x7 bitmap font (uppercase + digits + a few punctuation marks used in the copy) ------
const FONT = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "11110", "10001", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11100", "10010", "10001", "10001", "10001", "10010", "11100"],
  E: ["11111", "10000", "11110", "10000", "10000", "10000", "11111"],
  F: ["11111", "10000", "11110", "10000", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "11111", "10001", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10101", "10011", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  0: ["01110", "10011", "10101", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11110", "00001", "00001", "00110", "00001", "00001", "11110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ",": ["00000", "00000", "00000", "00000", "00000", "00100", "01000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00000", "00100"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "'": ["00100", "00100", "00000", "00000", "00000", "00000", "00000"],
};

function drawText(px, w, h, text, x, y, size, color, alpha = 1, letterSpacing = 1) {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const glyph = FONT[ch] || FONT[" "];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] === "1") {
          fillRect(px, w, h, cx + col * size, y + row * size, cx + (col + 1) * size, y + (row + 1) * size, color, alpha);
        }
      }
    }
    cx += (5 + letterSpacing) * size;
  }
  return cx;
}

function textWidth(text, size, letterSpacing = 1) {
  return text.length * (5 + letterSpacing) * size - letterSpacing * size;
}

// --- compose the hero, mirroring docs/brand/learn-hero.svg -------------------------------------
function renderHero() {
  const px = makeCanvas(W, H, BG);
  const s = SCALE;

  // rule lines
  drawLine(px, W, H, 80 * s, 96 * s, 1200 * s, 96 * s, INK, 2, 0.14);
  drawLine(px, W, H, 80 * s, 424 * s, 1200 * s, 424 * s, INK, 2, 0.14);

  // eyebrow label
  drawText(px, W, H, "PROJECT TELOS / ACCOUNTABLE LEARNING ENGINE", 80 * s, 74 * s, 2.6 * s, INK_SOFT, 1, 2);

  // ghost wordmark (kept clear of the headline/tagline rows below it)
  drawText(px, W, H, "LEARN", 76 * s, 360 * s, 15 * s, INK, 0.07, 3);

  // headline (two short lines, sized to stay clear of the motif at x ~= 1098*s)
  drawText(px, W, H, "STUDY SMARTER,", 84 * s, 150 * s, 6.4 * s, INK, 1, 1);
  drawText(px, W, H, "PROVE IT HONESTLY.", 84 * s, 208 * s, 6.4 * s, INK, 1, 1);

  // tagline strip
  drawText(px, W, H, "PLAN / PRACTICE / MASTERY-GATE / RECEIPT", 86 * s, 290 * s, 2.8 * s, [0x2f, 0x32, 0x38], 1, 2);

  // motif: open book + checkmark, translated/scaled to roughly (878,78) scale .70 like the SVG
  const ox = 878 * s, oy = 78 * s, ms_ = 0.70 * s;
  const bookPts = (x, y) => [ox + x * ms_, oy + y * ms_];
  // spine
  drawLine(px, W, H, ...bookPts(260, 108), ...bookPts(260, 326), INK, 5, 1);
  // left cover (approximate the curve with a polyline)
  const leftCover = [[260, 108], [196, 78], [132, 78], [88, 100], [88, 318], [132, 296], [196, 296], [260, 326]];
  for (let i = 0; i < leftCover.length - 1; i++) {
    drawLine(px, W, H, ...bookPts(...leftCover[i]), ...bookPts(...leftCover[i + 1]), INK, 5, 1);
  }
  const rightCover = [[260, 108], [324, 78], [388, 78], [432, 100], [432, 318], [388, 296], [324, 296], [260, 326]];
  for (let i = 0; i < rightCover.length - 1; i++) {
    drawLine(px, W, H, ...bookPts(...rightCover[i]), ...bookPts(...rightCover[i + 1]), INK, 5, 1);
  }
  // page lines
  drawLine(px, W, H, ...bookPts(136, 154), ...bookPts(228, 154), INK, 3, 0.45);
  drawLine(px, W, H, ...bookPts(136, 196), ...bookPts(228, 196), INK, 3, 0.45);
  drawLine(px, W, H, ...bookPts(292, 154), ...bookPts(384, 154), INK, 3, 0.45);
  drawLine(px, W, H, ...bookPts(292, 196), ...bookPts(384, 196), INK, 3, 0.45);
  // checkmark, iris accent
  drawLine(px, W, H, ...bookPts(172, 258), ...bookPts(228, 300), IRIS, 6, 1);
  drawLine(px, W, H, ...bookPts(228, 300), ...bookPts(344, 216), IRIS, 6, 1);

  return px;
}

// --- minimal PNG encoder (RGB8, zero-dep via node:zlib deflate) ---------------------------------
let _crc32Table = null;
function crc32(buf) {
  // Prefer zlib's built-in crc32 (Node >= 20.12); fall back to a pure-JS table for older Node 20.
  if (typeof zlibCrc32 === "function") return zlibCrc32(buf) >>> 0;
  if (!_crc32Table) {
    _crc32Table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      _crc32Table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = _crc32Table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(px, w, h) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // raw scanlines, each prefixed with filter type 0 (none)
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const rowStart = y * (w * 3 + 1);
    raw[rowStart] = 0; // filter: none
    for (let i = 0; i < w * 3; i++) raw[rowStart + 1 + i] = px[y * w * 3 + i];
  }

  const idatData = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idatData),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const heroPx = renderHero();
  const png = encodePNG(heroPx, W, H);
  const outPath = path.join(here, "learn-hero.png");
  writeFileSync(outPath, png);
  console.log(`wrote ${outPath} (${W}x${H}, ${png.length} bytes)`);
}

main();
