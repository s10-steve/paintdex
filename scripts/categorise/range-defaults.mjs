/**
 * Draft range metadata for the paint-categorisation work (see the README
 * roadmap). One entry per `brand|range`: how the line is delivered, what binds
 * it, and the type most of its paints are — the default the migration applies
 * to `other` paints before anything is hand-checked. `note` marks the calls
 * that want a painter's eye before they're trusted.
 */
const A = "acrylic";
const r = (format, binder, defaultType, extra = {}) => ({ format, binder, defaultType, ...extra });

/**
 * A product line is what a bottle *is*; a range is a heading it's listed
 * under. AK prints one Real Colors bottle under both "Air" and "WWII", and
 * that's the only thing `ranges[]` may mean — the same product under several
 * headings. Two ranges on different lines are different products, even with
 * the same name and hex, and a collection has to be able to tell them apart.
 * Ranges not named here are a line of their own (`lineOf`).
 */
const LINES = {
  "real-colors": [/^AK Interactive\|Real Colors - /],
  "3rd-gen": [/^AK Interactive\|.* \(3rd Gen\)$/],
  "2nd-gen": [/^AK Interactive\|(AFV|Air|General|Naval|Figures)$/],
};

export const RANGES = {
  "AK Interactive|AFV": r("brush", A, "opaque"),
  "AK Interactive|AFV (3rd Gen)": r("brush", A, "opaque"),
  "AK Interactive|Air": r("brush", A, "opaque", { note: "Aircraft colours, not airbrush paints" }),
  "AK Interactive|Air (3rd Gen)": r("brush", A, "opaque", { note: "Aircraft colours, not airbrush paints" }),
  "AK Interactive|Auxiliary (3rd Gen)": r("brush", A, "medium", { note: "Mediums; Crackle Medium is technical" }),
  "AK Interactive|Color Punch (3rd Gen)": r("brush", A, "opaque", { note: "Saturated opaques, explicitly not a one-coat paint (Tale of Painters)" }),
  "AK Interactive|Effects": r("brush", "enamel", "wash"),
  "AK Interactive|Figures": r("brush", A, "opaque"),
  "AK Interactive|Figures (3rd Gen)": r("brush", A, "opaque"),
  "AK Interactive|General": r("brush", A, "opaque"),
  "AK Interactive|Ink (3rd Gen)": r("brush", A, "ink"),
  "AK Interactive|Intense (3rd Gen)": r("brush", A, "opaque"),
  "AK Interactive|Metallic (3rd Gen)": r("brush", A, "opaque", { metallic: true }),
  "AK Interactive|Naval": r("brush", A, "opaque"),
  "AK Interactive|Pastel (3rd Gen)": r("brush", A, "opaque"),
  "AK Interactive|Primer (3rd Gen)": r("brush", A, "primer"),
  "AK Interactive|Real Colors - AFV": r("brush", "lacquer", "opaque", { note: "Marketed for airbrush but needs thinning, so brush; clears live in Standard/Modern too" }),
  "AK Interactive|Real Colors - Air": r("brush", "lacquer", "opaque", { note: "Aircraft colours, not airbrush paints" }),
  "AK Interactive|Real Colors - Clear": r("brush", "lacquer", "glaze"),
  "AK Interactive|Real Colors - Modern": r("brush", "lacquer", "opaque"),
  "AK Interactive|Real Colors - Standard": r("brush", "lacquer", "opaque"),
  "AK Interactive|Real Colors - WWII": r("brush", "lacquer", "opaque"),
  "AK Interactive|Standard (3rd Gen)": r("brush", A, "opaque"),

  "Army Painter|D&D Nolzur's Marvelous Pigments": r("brush", A, "opaque"),
  "Army Painter|D&D Nolzur's Marvelous Pigments Primer": r("brush", A, "primer"),
  "Army Painter|D&D Nolzur's Marvelous Pigments Wash": r("brush", A, "wash"),
  "Army Painter|D&D Undead Set": r("brush", A, "opaque"),
  "Army Painter|D&D Underdark Set": r("brush", A, "opaque"),
  "Army Painter|John Blanche Masterclass": r("brush", A, "opaque"),
  "Army Painter|Metallic Colours Paint Set": r("brush", A, "opaque", { metallic: true }),
  "Army Painter|Quickshade Washes Set": r("brush", A, "wash"),
  "Army Painter|Skin Tones Paint Set": r("brush", A, "opaque"),
  "Army Painter|Skin Tones Paint Set - Washes": r("brush", A, "wash"),
  "Army Painter|Speedpaint Set": r("brush", A, "contrast"),
  "Army Painter|Speedpaint Set 2.0": r("brush", A, "contrast"),
  "Army Painter|Warpaints": r("brush", A, "opaque"),
  "Army Painter|Warpaints Air": r("airbrush", A, "opaque"),
  "Army Painter|Warpaints Fanatic": r("brush", A, "opaque"),
  "Army Painter|Warpaints Fanatic Wash": r("brush", A, "wash"),
  "Army Painter|Warpaints Primer": r("spray", A, "primer", { note: "Colour Primer aerosols (WP1472, a pot, moves to Warpaints)" }),
  "Army Painter|Warpaints Tone": r("brush", A, "wash"),
  "Army Painter|Warpaints Wash": r("brush", A, "wash"),

  "Duncan Rhodes|Wave 1": r("brush", A, "opaque"),
  "Duncan Rhodes|Wave 2": r("brush", A, "opaque"),
  "Duncan Rhodes|Wave 3": r("brush", A, "opaque"),

  "Green Stuff World|Acrylic Colors": r("brush", A, "opaque"),
  "Green Stuff World|Candy Ink Metallic": r("brush", A, "ink", { note: "Transparent gloss inks for over metals; not metallic themselves" }),
  "Green Stuff World|Chameleon Colorshift Metallic": r("brush", A, "opaque", { metallic: true }),
  "Green Stuff World|Dipping Inks": r("brush", A, "contrast", { note: "GSW files them under Contrast paints; one-coat over white" }),
  "Green Stuff World|Fluor Metallic": r("brush", A, "opaque", { metallic: false, note: "Fluorescents, not metallic, despite the range name (confirmed by Steve)" }),
  "Green Stuff World|Gloss Surface": r("brush", A, "primer"),
  "Green Stuff World|Intensity Ink": r("brush", A, "ink"),
  "Green Stuff World|Matt Surface": r("brush", A, "primer"),
  "Green Stuff World|Metallic Colors": r("brush", A, "opaque", { metallic: true }),
  "Green Stuff World|Wash Ink": r("brush", A, "wash"),

  "Liquitex|Liquitex Heavy Body Acrylix": r("brush", A, "opaque"),

  "Mig|Acrylics": r("brush", A, "opaque"),
  "Mig|Oilbrusher": r("brush", "oil", "opaque"),
  "Mig|Primers": r("airbrush", A, "primer", { note: "One Shot is sold ready to spray, no thinner" }),
  "Mig|Washes": r("brush", "enamel", "wash"),

  "P3|Privateer Press Formula P3": r("brush", A, "opaque"),
  "P3|Privateer Press Formula P3 Wash": r("brush", A, "wash"),

  "Scale 75|Artist Range": r("brush", A, "opaque"),
  "Scale 75|FX Range": r("brush", A, "opaque", { note: "UV fluorescents, slightly transparent" }),
  "Scale 75|Fantasy & Games Range": r("brush", A, "opaque"),
  "Scale 75|Inktensity Range": r("brush", A, "ink"),
  "Scale 75|Instant Colors Range": r("brush", A, "contrast"),
  "Scale 75|Metal N Alchemy Range": r("brush", A, "opaque", { metallic: "per-paint", note: "The Alchemy colours are non-metallic tone modifiers" }),
  "Scale 75|Primers": r("brush", A, "primer"),
  "Scale 75|Scale Color Range": r("brush", A, "opaque"),
  "Scale 75|Soil Works": r("brush", A, "technical", { note: "Mixed: acrylic pastes, pigments and oil washes (see overrides)" }),
  "Scale 75|Warfront  Range": r("brush", A, "opaque", { note: "Range name has a double space in the data" }),

  "Tamiya|Acrylics Mini Flat": r("brush", A, "opaque"),
  "Tamiya|Acrylics Mini Gloss": r("brush", A, "opaque"),
  "Tamiya|Aircraft Spray": r("spray", "lacquer", "opaque"),
  "Tamiya|Lacquer Paint": r("brush", "lacquer", "opaque"),
  "Tamiya|Tamiya Spray": r("spray", "lacquer", "opaque"),
  "Tamiya|Weathering & Accents": r("brush", "enamel", "wash"),

  "Vallejo|Arte Deco": r("brush", A, "opaque"),
  "Vallejo|Arte Deco Colores Fluoresecents": r("brush", A, "opaque"),
  "Vallejo|Game Air": r("airbrush", A, "opaque", { note: "The 2024 formula, 76.xxx; colours match Game Color" }),
  "Vallejo|Game Air (old formula)": r("airbrush", A, "opaque", { discontinued: true, note: "72.7xx, replaced by the 2024 formula. Retailers list it as discontinued; the metallics had no successor, Vallejo points airbrushers to Game Color metallics" }),
  "Vallejo|Game Color": r("brush", A, "opaque"),
  "Vallejo|Game Color Special FX": r("brush", A, "technical"),
  "Vallejo|Game Color Wash": r("brush", A, "wash"),
  "Vallejo|Hobby Paint": r("spray", A, "primer", { note: "400ml aerosols; some records carry other lines' codes" }),
  "Vallejo|Liquid Gold": r("brush", "lacquer", "opaque", { metallic: true, note: "Alcohol-based with real metal; lacquer is the nearest binder" }),
  "Vallejo|Mecha Color": r("airbrush", A, "opaque", { note: "Especially designed for airbrushing" }),
  "Vallejo|Metal Color": r("airbrush", A, "opaque", { metallic: true, note: "Sold for airbrushing, usable from the bottle" }),
  "Vallejo|Model Air": r("airbrush", A, "opaque"),
  "Vallejo|Model Color": r("brush", A, "opaque"),
  "Vallejo|Nocturna Models": r("brush", A, "opaque"),
  "Vallejo|Panzer Aces": r("brush", A, "opaque"),
  "Vallejo|Premium Airbrush Color": r("airbrush", A, "opaque"),
  "Vallejo|Surface Primer": r("airbrush", A, "primer", { note: "Sprays unthinned; brushable too" }),
  "Vallejo|Wash FX": r("brush", A, "wash"),
  "Vallejo|Weathering FX": r("brush", A, "technical"),
  "Vallejo|Xpress Color": r("brush", A, "contrast"),
  "Vallejo|Xpress Color Intense": r("brush", A, "contrast"),

  "Warhammer|Air": r("airbrush", A, "opaque"),
  "Warhammer|Base": r("brush", A, "opaque"),
  "Warhammer|Contrast": r("brush", A, "contrast"),
  "Warhammer|Dry": r("brush", A, "opaque"),
  "Warhammer|Foundation": r("brush", A, "opaque", { discontinued: true, note: "Holds all old Citadel colours, not only Foundation paints" }),
  "Warhammer|Foundation Primer": r("brush", A, "primer", { discontinued: true }),
  "Warhammer|Foundation Wash": r("brush", A, "wash", { discontinued: true }),
  "Warhammer|Glaze": r("brush", A, "glaze"),
  "Warhammer|Layer": r("brush", A, "opaque"),
  "Warhammer|Shade": r("brush", A, "wash"),
  "Warhammer|Spray": r("spray", A, "primer"),
  "Warhammer|Technical": r("brush", A, "technical"),
  "Warhammer|Tone Pro": r("brush", A, "opaque"),
};

/**
 * Per-paint exceptions the research turned up, where a paint doesn't do what
 * its range does. Each says why, so it can be checked again later.
 */
const why = (reason, fields) => ({ ...fields, reason });
const MIG_RED_PRIMERS = ["base", "dark-base", "light-base", "high-lights", "shine", "shadow"].map((s) => `mig-red-primer-${s}`);

/** Paints filed under the wrong range heading, and where they belong. */
export const RANGE_FIXES = {
  "army-painter-brush-on-primer-warpaints-primer": { range: "Warpaints", reason: "An 18ml pot, filed among the Colour Primer aerosols" },
  ...Object.fromEntries(MIG_RED_PRIMERS.map((id) => [id, { range: "Acrylics", reason: "AMIG09xx acrylic colours, filed under Primers" }])),
};
export const OVERRIDES = {
  ...Object.fromEntries(MIG_RED_PRIMERS.map((id) => [id, why("A colour for painting red-oxide primer, not a primer", { type: "opaque" })])),
  "ak-interactive-varnish-gloss": why("Filed under primers; it's a varnish", { type: "varnish" }),
  "ak-interactive-varnish-matt": why("Filed under primers; it's a varnish", { type: "varnish" }),
  "ak-interactive-varnish-satin": why("Filed under primers; it's a varnish", { type: "varnish" }),
  "ak-interactive-fresh-mud": why("Texture/accumulation product", { type: "technical" }),
  "ak-interactive-earth-effects": why("Texture/accumulation product", { type: "technical" }),
  "army-painter-wash-medium": why("A medium", { type: "medium" }),
  "army-painter-quickshade-wash-mixing-medium": why("A medium", { type: "medium" }),
  "army-painter-speedpaint-medium": why("A medium", { type: "medium" }),
  "army-painter-speedpaint-medium-speedpaint-set-2-0": why("A medium", { type: "medium" }),
  "army-painter-warpaints-mixing-medium": why("A medium", { type: "medium" }),
  "army-painter-warpaints-mixing-medium-warpaints": why("A medium", { type: "medium" }),
  "scale-75-dark-stains": why("Soil Works oil wash (agreed)", { type: "wash", binder: "oil" }),
  "scale-75-fuel-and-grease": why("Soil Works oil wash (agreed)", { type: "wash", binder: "oil" }),
  "scale-75-grease": why("Soil Works oil wash (agreed)", { type: "wash", binder: "oil" }),
  "scale-75-odorless-thinner": why("Thinner for the oil washes", { type: "medium", binder: "oil" }),
  "tamiya-flat-base": why("Flattening agent", { type: "medium" }),
  "tamiya-flat-base-acrylics-mini-gloss": why("Flattening agent", { type: "medium" }),
};

const slug = (x) => x.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** The product line a `brand|range` belongs to. */
export function lineOf(brand, range) {
  const key = `${brand}|${range}`;
  for (const [line, rxs] of Object.entries(LINES)) if (rxs.some((rx) => rx.test(key))) return `${slug(brand)}/${line}`;
  return `${slug(brand)}/${slug(range)}`;
}

for (const [key, v] of Object.entries(RANGES)) {
  const [brand, range] = key.split("|");
  v.line = lineOf(brand, range);
}

