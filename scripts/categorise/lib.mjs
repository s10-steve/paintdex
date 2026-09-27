/**
 * The paint-categorisation migration's logic, shared by `propose.mjs` (the
 * review CSVs) and `migrate.mjs` (which writes `data/`). See the README
 * roadmap item and CHANGELOG for what changed and why.
 *
 * Order of precedence for a paint's new `type`, most trusted first:
 *   1. A per-paint override from the research (range-defaults.mjs).
 *   2. A name rule — they only ever *propose*, and flag the row for review,
 *      because names lie ("Medium Blue", "Basic Skin Tone", "Bronze Green").
 *   3. A current type that already says what the paint does (wash, ink, …).
 *   4. The range's default.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { OVERRIDES, RANGES, RANGE_FIXES, lineOf } from "./range-defaults.mjs";

export const DATA_DIR = "data/paints";

export const slug = (x) => x.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Every paint file, as `{ file, paints }`. */
export function loadFiles() {
  return readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => ({ file, paints: JSON.parse(readFileSync(join(DATA_DIR, file), "utf8")) }));
}

/**
 * The source's one "Game Air" heading holds two formulas: the original
 * (72.7xx) and the 2024 reformulation (76.xxx, colours identical to Game
 * Color). They're different bottles, so the old one becomes its own range. A
 * Game Air heading merged onto a Game Color record is the new formula (same
 * hex as Game Color), unless the record's own code is 72.7xx.
 */
export const OLD_GAME_AIR = "Game Air (old formula)";

/** Moves paints to the range they belong in. Mutates; returns what moved. */
export function applyReranges(paints) {
  const moved = [];
  for (const p of paints) {
    if (p.brand === "Vallejo" && /^72\.7/.test(p.code ?? "")) {
      if (p.range === "Game Air") {
        p.range = OLD_GAME_AIR;
        moved.push({ id: p.id, code: p.code, from: "Game Air", to: OLD_GAME_AIR });
      }
      if (p.ranges?.includes("Game Air")) p.ranges = p.ranges.map((r) => (r === "Game Air" ? OLD_GAME_AIR : r)).sort();
    }
    const fix = RANGE_FIXES[p.id];
    if (fix && p.range !== fix.range) {
      moved.push({ id: p.id, code: p.code, from: p.range, to: fix.range, reason: fix.reason });
      if (p.ranges) p.ranges = [...new Set(p.ranges.map((r) => (r === p.range ? fix.range : r)))].sort();
      p.range = fix.range;
    }
  }
  return moved;
}

const lcp = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i; };

/**
 * Plans one record per product line for every record whose `ranges[]` spans
 * lines. Pure: returns the plan, touches nothing.
 *
 * The existing id stays with the range its page shows (`p.range`), because
 * that's what someone who added it to a collection was reading. Not with the
 * code: the importer kept whichever code it met first, so
 * `vallejo-abyssal-turquoise` read "Game Color" while carrying Game Air's
 * 76.120. The code moves to the record it belongs to, judged by which range's
 * other codes share the longest prefix with it ("TS-15" sits with Tamiya
 * Spray's "TS-…", not Mini Gloss's "X-…").
 */
export function planSplits(paints) {
  const ids = new Set(paints.map((p) => p.id));
  const codesByRange = new Map();
  for (const p of paints) {
    if (!p.code || p.ranges) continue;
    const k = `${p.brand}|${p.range}`;
    codesByRange.set(k, [...(codesByRange.get(k) ?? []), p.code]);
  }
  const codeRange = (p) => {
    if (!p.code) return null;
    let best = null, bestLen = 1, tie = false;
    for (const r of p.ranges) {
      const len = Math.max(0, ...(codesByRange.get(`${p.brand}|${r}`) ?? []).map((c) => lcp(c, p.code)));
      if (len > bestLen) { best = r; bestLen = len; tie = false; } else if (len === bestLen && best) tie = true;
    }
    return tie ? null : best;
  };

  const plans = [];
  for (const p of paints) {
    if (!p.ranges || new Set(p.ranges.map((r) => lineOf(p.brand, r))).size < 2) continue;
    const groups = new Map();
    for (const r of p.ranges) {
      const l = lineOf(p.brand, r);
      groups.set(l, [...(groups.get(l) ?? []), r]);
    }
    const ownerRange = codeRange(p);
    const keepLine = lineOf(p.brand, p.range);
    const codeLine = ownerRange ? lineOf(p.brand, ownerRange) : keepLine;
    const pick = (rs) => (rs.includes(p.range) ? p.range : rs.includes(ownerRange) ? ownerRange : [...rs].sort()[0]);
    const shape = (rs, id, code) => {
      const rec = { id, range: pick(rs), code };
      if (rs.length > 1) rec.ranges = [...rs].sort();
      return rec;
    };
    const plan = {
      id: p.id, name: p.name, brand: p.brand, hex: p.hex,
      was: { range: p.range, ranges: p.ranges, code: p.code },
      codeBelongsTo: ownerRange ?? `unknown (kept on primary range ${p.range})`,
      keep: shape(groups.get(keepLine), p.id, codeLine === keepLine ? p.code : null),
      create: [],
      dropHeadings: [],
    };
    for (const [l, rs] of groups) {
      if (l === keepLine) continue;
      const range = pick(rs);
      // An existing record already *is* this line's product (kept apart only
      // because its hex differed slightly); don't mint a duplicate.
      const sibling = paints.find((q) => q !== p && q.brand === p.brand && q.name.toLowerCase() === p.name.toLowerCase() && rs.includes(q.range));
      if (sibling) { plan.dropHeadings.push({ ranges: rs, alreadyAt: sibling.id }); continue; }
      // `<base>-<range>`, stripping the record's own range suffix first so
      // "vallejo-bloody-red-game-color" doesn't become "…-game-color-game-air".
      // On a clash, the importer's own rule: -2, -3, … (the old-formula Game
      // Air bottles already hold most "-game-air" ids).
      const base = p.id.endsWith(`-${slug(p.range)}`) ? p.id.slice(0, -slug(p.range).length - 1) : p.id;
      let id = `${base}-${slug(range)}`;
      for (let n = 2; ids.has(id); n++) id = `${base}-${slug(range)}-${n}`;
      ids.add(id);
      plan.create.push(shape(rs, id, l === codeLine ? p.code : null));
    }
    plans.push(plan);
  }
  return plans;
}

/**
 * Old types that already describe function carry straight across, and so do
 * the new ones — which is what makes a second run of the migration a no-op.
 */
const KEEP = {
  wash: "wash", shade: "wash", glaze: "glaze", ink: "ink", contrast: "contrast", primer: "primer", technical: "technical",
  opaque: "opaque", varnish: "varnish", medium: "medium",
};

const NAME_RULES = [
  ["varnish", /\bvarnish\b|\bardcoat\b|^(flat |semi[- ]gloss |pearl )?clear$/i],
  ["technical", /\bcrackle\b|\btexture\b|blood for the blood god|\bdebris\b|\bthick mud\b|\bsplash mud\b|\bcrushed grass\b/i],
  ["medium", /^(lahmian|contrast|glaze|matte?|gloss|metal|technical|satin) medium$|\bretarder\b|\breducer\b|\bthinner\b|\bflow improver\b/i],
  ["wash", /\bwash\b|\bshader?\b|^(blue|dark|green|light|purple|red|soft|strong|flesh) tone$/i],
  ["glaze", /^clear\b|\btransparent\b/i],
];
const METAL = /\b(iridescent|gold|silver|bronze|copper|brass|steel|gunmetal|chainmail|iron|chrome|alumini?um|titanium|pewter|metal)\b/i;
const NOT_METAL = /\b(bronze green|bronze brown|bronze flesh|silver grey|silver gray|steel grey|steel gray|steel blue|gold yellow|gold brown|golden|iron oxide|brass yellow|titanium white|unbleached titanium|chrome (yellow|green|oxide|orange)|metal primer)\b/i;

/**
 * The new type, metallic flag, format and binder for one paint (with its
 * range already corrected), plus why — and whether a person should look.
 */
export function classify(p) {
  const range = RANGES[`${p.brand}|${p.range}`];
  if (!range) throw new Error(`No range entry for ${p.brand}|${p.range} (${p.id})`);

  let type = KEEP[p.type] ?? range.defaultType;
  let source = KEEP[p.type] ? `kept (${p.type})` : "range default";
  let review = false;
  const reasons = [];

  // The first rule that matches decides, even when it agrees with the type
  // already held: "Clear" is a varnish, and must not fall through to the
  // glaze rule's `^clear` on a second run.
  const rule = NAME_RULES.find(([, rx]) => rx.test(p.name));
  if (rule && rule[0] !== type) {
    reasons.push(`name suggests ${rule[0]} (was ${type} from ${source})`);
    type = rule[0];
    source = `name rule: ${rule[0]}`;
    review = true;
  }

  // "per-paint": the range holds metallics and non-metallics, so the old
  // `metallic` type says nothing and only the name decides. `false`
  // overrides a misleading old `metallic` type.
  const ignoreOld = range.metallic === "per-paint" || range.metallic === false;
  let metallic = ignoreOld ? false : Boolean(p.metallic) || p.type === "metallic" || range.metallic === true;
  if (!metallic && range.metallic !== false && METAL.test(p.name) && !NOT_METAL.test(p.name)) {
    metallic = true;
    review = true;
    reasons.push("name suggests metallic");
  }

  let { format, binder } = range;
  const o = OVERRIDES[p.id];
  if (o) {
    type = o.type ?? type;
    format = o.format ?? format;
    binder = o.binder ?? binder;
    source = `override: ${o.reason}`;
    review = false;
    reasons.length = 0;
  }

  return { type, metallic, format, binder, discontinued: Boolean(p.discontinued || range.discontinued), source, review, reasons };
}
