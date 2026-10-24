// The held map: a reasoning graph with the learner's evidence laid on it. Propositions are single
// true statements; a chain is a set of premises that jointly give a conclusion. Every state on the
// map is derived from evidence attempts tagged with proposition ids (evidence.mjs), so the map
// says what the learner holds, how firmly, and whether it is held because it follows.
//
// Evidence state of one proposition (from its tagged, graded, non-prediction attempts):
//   unseen    no evidence yet
//   shaky     the latest attempt missed, or was "I don't know"
//   forming   the latest attempt was right, but too few confident hits to call it held
//   held      the latest attempt was right, with at least `minEvidence` hits at `heldAt` confidence
// Structure of a held proposition:
//   foundation  nothing on the map concludes it; it is taken as given
//   generated   some chain concluding it has every premise held: it follows from what is held
//   loose       held, but no chain to it is fully held: known as "that's just how it is"
// A loose proposition turning generated is the moment the learner sees why. clicks() reports it.
//
// INTEGRITY: states are recomputed from attempts on every call. Nothing on the map can be set by
// hand, and predictions (guesses about untaught steps) never count. Browser-safe.
import { gradedEvidence } from "./evidence.mjs";

const ID = /^[A-Za-z0-9._:-]{1,64}$/;

function fail(why) {
  throw new Error(`heldmap: ${why}`);
}

function checkProps(propositions) {
  if (!Array.isArray(propositions) || !propositions.length) fail("needs at least one proposition");
  const byId = new Map();
  for (const p of propositions) {
    if (!p || !ID.test(String(p.id || ""))) fail(`proposition id ${JSON.stringify(p && p.id)} is not valid`);
    if (byId.has(p.id)) fail(`proposition ${p.id} appears twice`);
    if (typeof p.statement !== "string" || !p.statement.trim()) fail(`proposition ${p.id} has no statement`);
    byId.set(p.id, { id: p.id, name: p.name || p.id, statement: p.statement });
  }
  return byId;
}

function checkChains(chains, byId) {
  const ids = new Set();
  return (chains || []).map((c) => {
    if (!c || !ID.test(String(c.id || ""))) fail(`chain id ${JSON.stringify(c && c.id)} is not valid`);
    if (ids.has(c.id) || byId.has(c.id)) fail(`chain id ${c.id} is used twice`);
    ids.add(c.id);
    if (!Array.isArray(c.premises) || !c.premises.length) fail(`chain ${c.id} needs at least one premise`);
    for (const p of [...c.premises, c.conclusion]) if (!byId.has(p)) fail(`chain ${c.id} names unknown proposition ${p}`);
    if (c.premises.includes(c.conclusion)) fail(`chain ${c.id} uses its conclusion as a premise`);
    return { id: c.id, premises: [...new Set(c.premises)], conclusion: c.conclusion };
  });
}

function checkAcyclic(byId, chains) {
  const out = new Map([...byId.keys()].map((k) => [k, []]));
  for (const c of chains) for (const p of c.premises) out.get(p).push(c.conclusion);
  const state = new Map();
  const visit = (id, path) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) fail(`reasoning cycle: ${[...path, id].join(" -> ")}`);
    state.set(id, 1);
    for (const n of out.get(id)) visit(n, [...path, id]);
    state.set(id, 2);
  };
  for (const id of byId.keys()) visit(id, []);
}

// validateMap({propositions, chains}) -> {props: Map, chains, into: Map(id -> chains concluding it)}
export function validateMap(map) {
  const props = checkProps(map && map.propositions);
  const chains = checkChains(map.chains, props);
  checkAcyclic(props, chains);
  const into = new Map([...props.keys()].map((k) => [k, []]));
  for (const c of chains) into.get(c.conclusion).push(c);
  return { props, chains, into };
}

// depths(m) -> Map(id -> shortest derivation depth). Foundations are 0; a conclusion sits one
// above the deepest premise of its shallowest chain.
export function depths(m) {
  const memo = new Map();
  const depth = (id) => {
    if (memo.has(id)) return memo.get(id);
    const chains = m.into.get(id);
    const d = chains.length ? Math.min(...chains.map((c) => 1 + Math.max(...c.premises.map(depth)))) : 0;
    memo.set(id, d);
    return d;
  };
  for (const id of m.props.keys()) depth(id);
  return memo;
}

function evidenceState(rows, { heldAt, minEvidence }) {
  if (!rows.length) return "unseen";
  const last = rows[rows.length - 1];
  if (!last.correct) return "shaky";
  const confident = rows.filter((a) => a.correct && typeof a.confidence === "number" && a.confidence >= heldAt).length;
  return confident >= minEvidence ? "held" : "forming";
}

function structureOf(m, order, held) {
  const out = new Map();
  for (const id of order) {
    if (!held.has(id)) out.set(id, null);
    else if (!m.into.get(id).length) out.set(id, "foundation");
    else out.set(id, m.into.get(id).some((c) => c.premises.every((p) => held.has(p))) ? "generated" : "loose");
  }
  return out;
}

// heldStates(map, session, {heldAt, minEvidence}) -> {id: {evidence, structure, depth, attempts}}
export function heldStates(map, session, { heldAt = 70, minEvidence = 2 } = {}) {
  const m = validateMap(map);
  const d = depths(m);
  const graded = gradedEvidence(session).filter((a) => Array.isArray(a.propositions));
  const ev = new Map();
  for (const id of m.props.keys()) ev.set(id, evidenceState(graded.filter((a) => a.propositions.includes(id)), { heldAt, minEvidence }));
  const held = new Set([...ev].filter(([, s]) => s === "held").map(([id]) => id));
  const order = [...m.props.keys()].sort((a, b) => d.get(a) - d.get(b) || (a < b ? -1 : 1));
  const st = structureOf(m, order, held);
  const out = {};
  for (const id of order) {
    out[id] = { evidence: ev.get(id), structure: st.get(id), depth: d.get(id), attempts: graded.filter((a) => a.propositions.includes(id)).length };
  }
  return out;
}

// clicks(before, after) -> ids that were loose and are now generated.
export function clicks(before, after) {
  return Object.keys(after).filter((id) => before[id] && before[id].structure === "loose" && after[id].structure === "generated");
}

const isHeld = (s) => s && s.evidence === "held";

// nextStep(map, states, {goal}) -> {repairs, frontier, next}. Repairs are shaky propositions that
// a conclusion not yet generated depends on: never build on what is not held. The frontier is every
// unheld proposition one reasoning step from what is held. With a goal, both lists keep only the
// propositions on minimalTree() toward it, so nothing off the path is taught. next is the first
// repair, else the shallowest frontier item, else null.
export function nextStep(map, states, { goal } = {}) {
  const m = validateMap(map);
  const onPath = goal === undefined ? null : new Set(minimalTree(map, states, goal).map((t) => t.id));
  const keep = (x) => onPath === null || onPath.has(x.id);
  const byDepth = (a, b) => states[a.id].depth - states[b.id].depth || (a.id < b.id ? -1 : 1);
  const needed = new Set(m.chains.filter((c) => states[c.conclusion].structure !== "generated").flatMap((c) => c.premises));
  const repairs = [...needed].filter((id) => states[id].evidence === "shaky").map((id) => ({ id })).filter(keep).sort(byDepth);
  let frontier = [];
  for (const [id, chains] of m.into) {
    if (isHeld(states[id])) continue;
    const via = chains.find((c) => c.premises.every((p) => isHeld(states[p])));
    if (via) frontier.push({ id, via: via.id });
    else if (!chains.length && states[id].evidence !== "shaky") frontier.push({ id, via: null });
  }
  frontier = frontier.filter(keep).sort(byDepth);
  const next = repairs[0] ? { ...repairs[0], reason: "repair" } : frontier[0] ? { ...frontier[0], reason: "step" } : null;
  return { repairs, frontier, next };
}

// minimalTree(map, states, goal) -> [{id, via}] in teaching order, ending at the goal. The target
// is the goal held because it follows, so a goal that is held but loose still gets the premises of
// its cheapest chain and then the derivation step itself. Each unheld proposition is reached
// through the chain whose unheld premises cost least; a foundation costs one. Greedy: when chains
// share premises the sum can over-count, so the tree is small, and not proven minimal.
export function minimalTree(map, states, goal) {
  const m = validateMap(map);
  if (!m.props.has(goal)) fail(`unknown goal ${goal}`);
  const memo = new Map();
  const cheapest = (id) => m.into.get(id)
    .map((c) => ({ cost: 1 + c.premises.reduce((sum, p) => sum + cost(p).cost, 0), via: c }))
    .sort((a, b) => a.cost - b.cost || (a.via.id < b.via.id ? -1 : 1))[0];
  const cost = (id) => {
    if (!memo.has(id)) {
      const unheldDerived = !isHeld(states[id]) && m.into.get(id).length;
      memo.set(id, unheldDerived ? cheapest(id) : { cost: isHeld(states[id]) ? 0 : 1, via: null });
    }
    return memo.get(id);
  };
  const order = [];
  const seen = new Set();
  const walk = (id) => {
    if (seen.has(id) || isHeld(states[id])) return;
    seen.add(id);
    const { via } = cost(id);
    if (via) via.premises.forEach(walk);
    order.push({ id, via: via ? via.id : null });
  };
  if (isHeld(states[goal]) && states[goal].structure === "loose") {
    const { via } = cheapest(goal);
    via.premises.forEach(walk);
    order.push({ id: goal, via: via.id });
    return order;
  }
  walk(goal);
  return order;
}
