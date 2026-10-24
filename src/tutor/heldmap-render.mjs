// Render a held map for the one who receives it: the eye (an SVG), a reader (plain sentences in
// derivation order), a screen reader (a short alt and a long description), an agent (JSON), or the
// ear (a timed event list in the superframe `events` shape, which superframe can voice). Every
// rendering comes from the same derived states, so no medium can say something another does not.
//
// Eye layout: reasoning depth runs up the page, foundations at the bottom, so every argument flows
// upward. Colour is verdict-only: held reads as verified, shaky as drift, unseen and forming as
// unverifiable, on an ink-and-paper ground. A loose proposition is drawn hollow: held, but not yet
// held up by anything. The one hot mark is a ring on the next step.
//
// INTEGRITY: renderers read states; they never compute or alter one. check() tests each rendering
// is perceptible to its recipient before it is handed over. Browser-safe.
import { validateMap, nextStep } from "./heldmap.mjs";

export const RECIPIENTS = Object.freeze(["eye", "reader", "screenreader", "agent", "ear"]);
export const TOKENS = Object.freeze({ ground: "#f7f5f0", ink: "#1b1b1b", verified: "#1d6b45", drift: "#a4281f", unverifiable: "#6b6b6b" });

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const colourOf = (s) => (s.evidence === "held" ? TOKENS.verified : s.evidence === "shaky" ? TOKENS.drift : TOKENS.unverifiable);
const WORD = { unseen: "not yet seen", shaky: "shaky", forming: "forming", held: "held" };

function layout(m, states) {
  const rows = new Map();
  for (const id of m.props.keys()) {
    const d = states[id].depth;
    if (!rows.has(d)) rows.set(d, []);
    rows.get(d).push(id);
  }
  const maxDepth = Math.max(...rows.keys());
  const widest = Math.max(...[...rows.values()].map((r) => r.length));
  const W = Math.max(320, widest * 160), H = maxDepth * 110 + 100;
  // Foundations in id order; each higher row ordered by the mean x of its premises, which keeps
  // most reasoning lines from crossing.
  const pos = new Map();
  const meanX = (id) => {
    const xs = m.into.get(id).flatMap((c) => c.premises).map((q) => pos.get(q)).filter(Boolean).map((q) => q.x);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  };
  for (const d of [...rows.keys()].sort((a, b) => a - b)) {
    const ids = rows.get(d).sort((a, b) => (d ? meanX(a) - meanX(b) : 0) || (a < b ? -1 : 1));
    ids.forEach((id, i) => pos.set(id, { x: Math.round(((i + 0.5) * W) / ids.length), y: H - 50 - d * 110 }));
  }
  return { W, H, pos };
}

function svg(m, states, next) {
  const { W, H, pos } = layout(m, states);
  const edges = m.chains.flatMap((c) => c.premises.map((p) => {
    const a = pos.get(p), b = pos.get(c.conclusion);
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${TOKENS.ink}" stroke-opacity="0.35" stroke-width="1.2"/>`;
  }));
  const nodes = [...m.props.values()].map((p) => {
    const s = states[p.id], { x, y } = pos.get(p.id), c = colourOf(s);
    const fill = s.structure === "loose" ? TOKENS.ground : c;
    const ring = next && next.id === p.id ? `<circle cx="${x}" cy="${y}" r="15" fill="none" stroke="${TOKENS.drift}" stroke-width="2"/>` : "";
    return `${ring}<circle cx="${x}" cy="${y}" r="8" fill="${fill}" stroke="${c}" stroke-width="2.5"><title>${esc(p.statement)}</title></circle>` +
      `<text x="${x}" y="${y + 26}" text-anchor="middle" font-family="Hanken Grotesk, sans-serif" font-size="13" fill="${TOKENS.ink}" stroke="${TOKENS.ground}" stroke-width="4" paint-order="stroke">${esc(p.name)}</text>`;
  });
  const label = esc(alt(m, states, next));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">` +
    `<rect width="${W}" height="${H}" fill="${TOKENS.ground}"/>${edges.join("")}${nodes.join("")}</svg>`;
}

function sentence(m, id, s) {
  const p = m.props.get(id);
  const via = m.into.get(id).map((c) => c.premises.map((q) => m.props.get(q).name).join(" and "));
  const base = via.length ? `${p.name} follows from ${via.join(", or from ")}.` : `${p.name} is taken as given.`;
  const how = s.structure === "generated" ? " Held, and it follows from what is held." : s.structure === "loose" ? " Held on its own: its reasons are not yet held." : ` ${WORD[s.evidence][0].toUpperCase()}${WORD[s.evidence].slice(1)}.`;
  return `${base} ${p.statement}${how}`;
}

function reader(m, states, next) {
  const order = Object.keys(states);
  const lines = order.map((id) => sentence(m, id, states[id]));
  if (next) lines.push(`Next: ${m.props.get(next.id).name} (${next.reason === "repair" ? "repair before building on it" : "one step from what is held"}).`);
  return lines.join("\n");
}

function alt(m, states, next) {
  const held = Object.values(states).filter((s) => s.evidence === "held").length;
  const nextName = next ? `; next: ${m.props.get(next.id).name}` : "";
  return `Reasoning map: ${held} of ${m.props.size} propositions held${nextName}.`;
}

function ear(m, states) {
  const order = Object.keys(states);
  const events = order.map((id, i) => {
    const s = states[id];
    const vel = s.evidence === "held" ? 0.7 : s.evidence === "shaky" ? 0.45 : 0.2;
    return { t: +(i * 0.4).toFixed(4), voice: s.evidence === "shaky" ? "pluck" : "bell", role: s.structure || s.evidence, args: { note: 48 + s.depth * 5, dur: 0.35, vel } };
  });
  return { duration: +(order.length * 0.4).toFixed(4), events };
}

// render(map, states, recipient) -> the rendering for that recipient.
export function render(map, states, recipient) {
  if (!RECIPIENTS.includes(recipient)) throw new Error(`render: recipient must be one of ${RECIPIENTS.join(", ")}`);
  const m = validateMap(map);
  const { next } = nextStep(map, states);
  if (recipient === "eye") return svg(m, states, next);
  if (recipient === "reader") return reader(m, states, next);
  if (recipient === "screenreader") return { alt: alt(m, states, next), long: reader(m, states, next) };
  if (recipient === "ear") return ear(m, states);
  return { schema: "learn.heldmap/1", states, next, propositions: [...m.props.values()], chains: m.chains };
}

function luminance(hex) {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

// contrast(a, b) -> WCAG contrast ratio of two #rrggbb colours.
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// check(recipient, output, map) -> list of problems; empty means perceptible to that recipient.
export function check(recipient, output, map) {
  const m = validateMap(map);
  const problems = [];
  if (recipient === "eye") {
    for (const k of ["ink", "verified", "drift", "unverifiable"]) if (contrast(TOKENS[k], TOKENS.ground) < 3) problems.push(`${k} under 3:1 against the ground`);
    if ((output.match(/<circle /g) || []).length < m.props.size) problems.push("a proposition has no mark");
    if (!/aria-label="[^"]+"/.test(output)) problems.push("no accessible name");
  } else if (recipient === "reader" || recipient === "screenreader") {
    const text = recipient === "reader" ? output : `${output.alt}\n${output.long}`;
    for (const p of m.props.values()) if (!text.includes(p.name)) problems.push(`${p.name} is never named`);
  } else if (recipient === "ear") {
    if (output.events.length !== m.props.size) problems.push("not one event per proposition");
    if (output.events.some((e) => e.args.note < 21 || e.args.note > 108)) problems.push("a note is outside the piano range");
  } else if (recipient === "agent" && output.schema !== "learn.heldmap/1") problems.push("wrong schema");
  return problems;
}
