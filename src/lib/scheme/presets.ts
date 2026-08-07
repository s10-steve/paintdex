/**
 * Curated example schemes, shown on the homepage carousel and loadable into the
 * visualiser via `/visualiser?preset=<slug>`.
 *
 * **Presets reference catalogue ids, never hex values.** A preset stores the
 * paint's id plus the one thing the catalogue can't tell us — its `SchemeRole`,
 * which is a hand-made decision (the catalogue's `range`/`type` vocabulary is
 * unrelated: "Shade" is a product line, "wash" is how the paint reads in a bar).
 * Hexes are resolved by the caller through a `PaintLookup`, so a hex correction
 * in `data/paints/` flows through to the homepage for free, and `test/presets`
 * fails the build if an id ever disappears.
 *
 * That's also why this module **must not import `@/lib/paints/load`**: the lookup
 * is a parameter so the client bundle can never pull in the ~4,900-paint
 * catalogue. The homepage passes `getPaintById` at build time; the visualiser
 * passes a map over the browse index it already fetched for the paint picker.
 *
 * No React, no DOM — pure data plus one resolver, unit-tested in node.
 */
import type { Scheme, SchemeElement, SchemePaint, SchemeRole } from "./types";

/** The catalogue fields a preset needs back from a lookup. */
export interface PresetPaintData {
  name: string;
  brand: string;
  range: string;
  hex: string;
}

/** Resolves a catalogue id to its paint, or `undefined` if it's gone. */
export type PaintLookup = (id: string) => PresetPaintData | undefined;

export interface PresetPaintRef {
  /** Catalogue id, e.g. "citadel-macragge-blue-base". */
  id: string;
  /** Hand-picked: how this paint reads in the bar. */
  role: SchemeRole;
  /**
   * Used verbatim only if `id` has left the catalogue. Keeps a preset rendering
   * something sensible in a degraded state; the drift test is what stops us
   * relying on it.
   */
  fallback: PresetPaintData;
  /**
   * Deliberate deviation from the catalogue hex. Only for cases where the
   * scheme's author painted a visibly different value than the pot (a heavily
   * diluted wash, say) — comment the reason at every use site, because this
   * reintroduces exactly the drift the id-based design exists to avoid.
   */
  hexOverride?: string;
}

export interface PresetElementSpec {
  name: string;
  paints: PresetPaintRef[];
}

export interface PresetSpec {
  /** URL slug — the `?preset=` value. Stable; renaming breaks shared links. */
  slug: string;
  title: string;
  /** Largest-area element first: bar width follows list order (`elementSize`). */
  elements: PresetElementSpec[];
}

export type ResolvedPreset = Scheme & { slug: string };

/**
 * Resolve one preset against a paint source.
 *
 * Ids are derived from the slug and position rather than `uid()`, which is a
 * per-session counter — server and client would disagree on it, and React keys
 * would collide between carousel slides.
 */
export function resolvePreset(spec: PresetSpec, lookup: PaintLookup): ResolvedPreset {
  const elements: SchemeElement[] = spec.elements.map((el, i) => ({
    id: `${spec.slug}-e${i}`,
    name: el.name,
    paints: el.paints.map((ref, j): SchemePaint => {
      const found = lookup(ref.id) ?? ref.fallback;
      return {
        id: `${spec.slug}-e${i}-p${j}`,
        name: found.name,
        brand: found.brand,
        range: found.range,
        hex: (ref.hexOverride ?? found.hex).toUpperCase(),
        role: ref.role,
      };
    }),
  }));
  return { slug: spec.slug, title: spec.title, elements };
}

export function resolvePresets(lookup: PaintLookup): ResolvedPreset[] {
  return SCHEME_PRESETS.map((spec) => resolvePreset(spec, lookup));
}

export function findPreset(slug: string): PresetSpec | undefined {
  return SCHEME_PRESETS.find((p) => p.slug === slug);
}

/* -------------------------------------------------------------------------- */

/** Shorthand: the `fallback` blocks are noise inline, so build them here. */
const ref = (
  id: string,
  role: SchemeRole,
  fallback: PresetPaintData,
  extra?: { hexOverride?: string },
): PresetPaintRef => ({ id, role, fallback, ...extra });

/**
 * The examples. Faction names are used deliberately — they're what people
 * search for — and the footer disclaimer in `src/app/layout.tsx` carries the
 * trademark notice for them. Element names stay descriptive.
 */
export const SCHEME_PRESETS: PresetSpec[] = [
  {
    // Contributed by @s10-steve. Note "Gold trim" opens on a layer rather than a
    // base — metallics are often laid straight over a dark undercoat.
    slug: "ultramarines",
    title: "Ultramarines",
    elements: [
      {
        name: "Armour plates",
        paints: [
          ref("citadel-macragge-blue-base", "base", { name: "Macragge Blue", brand: "Citadel", range: "Base", hex: "#0F3D7C" }),
          ref("citadel-nuln-oil", "wash", { name: "Nuln Oil", brand: "Citadel", range: "Shade", hex: "#393944" }),
          ref("citadel-calgar-blue", "layer", { name: "Calgar Blue", brand: "Citadel", range: "Layer", hex: "#2A497F" }),
          ref("citadel-fenrisian-grey", "highlight", { name: "Fenrisian Grey", brand: "Citadel", range: "Layer", hex: "#6D94B3" }),
        ],
      },
      {
        name: "Gold trim",
        paints: [
          ref("citadel-retributor-armour", "layer", { name: "Retributor Armour", brand: "Citadel", range: "Base", hex: "#EDC169" }),
          ref("citadel-reikland-fleshshade", "wash", { name: "Reikland Fleshshade", brand: "Citadel", range: "Shade", hex: "#7E3226" }),
          ref("citadel-auric-armour-gold", "layer", { name: "Auric Armour Gold", brand: "Citadel", range: "Layer", hex: "#FFC451" }),
          ref("citadel-stormhost-silver", "highlight", { name: "Stormhost Silver", brand: "Citadel", range: "Layer", hex: "#DADDDF" }),
        ],
      },
      {
        name: "Bare steel",
        paints: [
          ref("citadel-leadbelcher-base", "base", { name: "Leadbelcher", brand: "Citadel", range: "Base", hex: "#969696" }),
          ref("citadel-nuln-oil", "wash", { name: "Nuln Oil", brand: "Citadel", range: "Shade", hex: "#393944" }),
          ref("citadel-runefang-steel", "drybrush", { name: "Runefang Steel", brand: "Citadel", range: "Layer", hex: "#C2C8CC" }),
        ],
      },
      {
        name: "Black rubber",
        paints: [
          ref("citadel-abaddon-black", "base", { name: "Abaddon Black", brand: "Citadel", range: "Base", hex: "#000000" }),
          ref("citadel-nuln-oil", "wash", { name: "Nuln Oil", brand: "Citadel", range: "Shade", hex: "#393944" }),
          ref("citadel-dawnstone", "layer", { name: "Dawnstone", brand: "Citadel", range: "Layer", hex: "#697068" }),
        ],
      },
      {
        name: "Warm leather",
        paints: [
          ref("citadel-doombull-brown", "base", { name: "Doombull Brown", brand: "Citadel", range: "Layer", hex: "#570003" }),
          ref("citadel-agrax-earthshade", "wash", { name: "Agrax Earthshade", brand: "Citadel", range: "Shade", hex: "#3C3C28" }),
          ref("citadel-wazdakka-red", "layer", { name: "Wazdakka Red", brand: "Citadel", range: "Layer", hex: "#880804" }),
          ref("citadel-squig-orange", "highlight", { name: "Squig Orange", brand: "Citadel", range: "Layer", hex: "#A74D42" }),
        ],
      },
      {
        name: "Purity seals",
        paints: [
          ref("citadel-zandri-dust", "base", { name: "Zandri Dust", brand: "Citadel", range: "Base", hex: "#988E56" }),
          ref("citadel-agrax-earthshade", "wash", { name: "Agrax Earthshade", brand: "Citadel", range: "Shade", hex: "#3C3C28" }),
          ref("citadel-ushabti-bone", "layer", { name: "Ushabti Bone", brand: "Citadel", range: "Layer", hex: "#ABA173" }),
          ref("citadel-screaming-skull", "highlight", { name: "Screaming Skull", brand: "Citadel", range: "Layer", hex: "#B9C099" }),
        ],
      },
      {
        name: "Eye lenses",
        paints: [
          ref("citadel-mephiston-red", "base", { name: "Mephiston Red", brand: "Citadel", range: "Base", hex: "#960C09" }),
          ref("citadel-evil-sunz-scarlet", "layer", { name: "Evil Sunz Scarlet", brand: "Citadel", range: "Layer", hex: "#C01411" }),
          ref("citadel-yriel-yellow", "highlight", { name: "Yriel Yellow", brand: "Citadel", range: "Layer", hex: "#FFD900" }),
          ref("citadel-white-scar", "highlight", { name: "White Scar", brand: "Citadel", range: "Layer", hex: "#FFFFFF" }),
        ],
      },
    ],
  },
  {
    // Contributed by @s10-steve. Ten elements — the widest preset, and the one to
    // check first if the carousel's bar row ever needs to fit more.
    slug: "death-guard",
    title: "Death Guard",
    elements: [
      {
        name: "Green armour",
        paints: [
          ref("citadel-death-guard-green", "base", { name: "Death Guard Green", brand: "Citadel", range: "Spray", hex: "#556229" }),
          ref("citadel-agrax-earthshade", "wash", { name: "Agrax Earthshade", brand: "Citadel", range: "Shade", hex: "#3C3C28" }),
          ref("citadel-elysian-green", "layer", { name: "Elysian Green", brand: "Citadel", range: "Layer", hex: "#6B8C37" }),
          ref("citadel-ogryn-camo", "highlight", { name: "Ogryn Camo", brand: "Citadel", range: "Layer", hex: "#96A648" }),
          ref("ak-interactive-rust-streaks", "weathering", { name: "Rust Streaks", brand: "AK Interactive", range: "Effects", hex: "#7B532A" }),
        ],
      },
      {
        name: "Brass",
        paints: [
          ref("scale-75-decayed-metal", "base", { name: "Decayed Metal", brand: "Scale 75", range: "Metal N Alchemy Range", hex: "#5D4038" }),
          ref("citadel-agrax-earthshade", "wash", { name: "Agrax Earthshade", brand: "Citadel", range: "Shade", hex: "#3C3C28" }),
          ref("scale-75-old-copper", "layer", { name: "Old Copper", brand: "Scale 75", range: "Metal N Alchemy Range", hex: "#97604C" }),
          ref("citadel-nihilakh-oxide", "layer", { name: "Nihilakh Oxide", brand: "Citadel", range: "Technical", hex: "#66B39A" }),
        ],
      },
      {
        name: "Cloth",
        paints: [
          ref("citadel-screamer-pink", "base", { name: "Screamer Pink", brand: "Citadel", range: "Base", hex: "#7A0E44" }),
          ref("citadel-carroburg-crimson", "wash", { name: "Carroburg Crimson", brand: "Citadel", range: "Shade", hex: "#752455" }),
          ref("citadel-pink-horror", "layer", { name: "Pink Horror", brand: "Citadel", range: "Layer", hex: "#8E2757" }),
          ref("citadel-slaanesh-grey", "highlight", { name: "Slaanesh Grey", brand: "Citadel", range: "Layer", hex: "#8B8893" }),
        ],
      },
      {
        name: "Silver",
        paints: [
          ref("citadel-leadbelcher-base", "base", { name: "Leadbelcher", brand: "Citadel", range: "Base", hex: "#969696" }),
          ref("citadel-agrax-earthshade", "wash", { name: "Agrax Earthshade", brand: "Citadel", range: "Shade", hex: "#3C3C28" }),
          ref("citadel-stormhost-silver", "highlight", { name: "Stormhost Silver", brand: "Citadel", range: "Layer", hex: "#DADDDF" }),
          ref("ak-interactive-rust-streaks", "weathering", { name: "Rust Streaks", brand: "AK Interactive", range: "Effects", hex: "#7B532A" }),
        ],
      },
      {
        name: "Leather",
        paints: [
          ref("citadel-rhinox-hide", "base", { name: "Rhinox Hide", brand: "Citadel", range: "Base", hex: "#462F30" }),
          ref("citadel-agrax-earthshade", "wash", { name: "Agrax Earthshade", brand: "Citadel", range: "Shade", hex: "#3C3C28" }),
          ref("citadel-doombull-brown", "layer", { name: "Doombull Brown", brand: "Citadel", range: "Layer", hex: "#570003" }),
          ref("citadel-skrag-brown", "layer", { name: "Skrag Brown", brand: "Citadel", range: "Layer", hex: "#8B4806" }),
        ],
      },
      {
        name: "Bone",
        paints: [
          ref("citadel-zandri-dust", "base", { name: "Zandri Dust", brand: "Citadel", range: "Base", hex: "#988E56" }),
          ref("citadel-agrax-earthshade", "wash", { name: "Agrax Earthshade", brand: "Citadel", range: "Shade", hex: "#3C3C28" }),
          ref("citadel-ushabti-bone", "layer", { name: "Ushabti Bone", brand: "Citadel", range: "Layer", hex: "#ABA173" }),
          ref("citadel-screaming-skull", "layer", { name: "Screaming Skull", brand: "Citadel", range: "Layer", hex: "#B9C099" }),
        ],
      },
      {
        name: "Wood",
        paints: [
          ref("citadel-dryad-bark", "base", { name: "Dryad Bark", brand: "Citadel", range: "Base", hex: "#2B2A24" }),
          ref("citadel-agrax-earthshade", "wash", { name: "Agrax Earthshade", brand: "Citadel", range: "Shade", hex: "#3C3C28" }),
          ref("citadel-gorthor-brown", "layer", { name: "Gorthor Brown", brand: "Citadel", range: "Layer", hex: "#5F463F" }),
        ],
      },
      {
        name: "Smoke",
        paints: [
          ref("citadel-celestra-grey", "base", { name: "Celestra Grey", brand: "Citadel", range: "Base", hex: "#8BA3A3" }),
          ref("citadel-coelia-greenshade", "wash", { name: "Coelia Greenshade", brand: "Citadel", range: "Shade", hex: "#2B5D58" }),
          ref("citadel-ulthuan-grey", "layer", { name: "Ulthuan Grey", brand: "Citadel", range: "Layer", hex: "#C4DDD5" }),
          ref("citadel-white-scar", "layer", { name: "White Scar", brand: "Citadel", range: "Layer", hex: "#FFFFFF" }),
        ],
      },
      {
        name: "Tentacles",
        paints: [
          ref("citadel-screamer-pink", "base", { name: "Screamer Pink", brand: "Citadel", range: "Base", hex: "#7A0E44" }),
          ref("citadel-carroburg-crimson", "wash", { name: "Carroburg Crimson", brand: "Citadel", range: "Shade", hex: "#752455" }),
          ref("citadel-emperor-children", "layer", { name: "Emperor Children", brand: "Citadel", range: "Layer", hex: "#B74073" }),
        ],
      },
      {
        name: "Lenses",
        paints: [
          ref("citadel-jokaero-orange", "base", { name: "Jokaero Orange", brand: "Citadel", range: "Base", hex: "#ED3814" }),
          ref("citadel-troll-slayer-orange", "layer", { name: "Troll Slayer Orange", brand: "Citadel", range: "Layer", hex: "#F16C23" }),
          ref("citadel-fire-dragon-bright", "layer", { name: "Fire Dragon Bright", brand: "Citadel", range: "Layer", hex: "#F4874E" }),
          ref("citadel-white-scar", "highlight", { name: "White Scar", brand: "Citadel", range: "Layer", hex: "#FFFFFF" }),
        ],
      },
    ],
  },
  {
    // Three reds stacked into a bright crimson ramp, with green lenses for contrast.
    slug: "blood-angels",
    title: "Blood Angels",
    elements: [
      {
        name: "Armour plates",
        paints: [
          ref("citadel-mephiston-red", "base", { name: "Mephiston Red", brand: "Citadel", range: "Base", hex: "#960C09" }),
          ref("citadel-carroburg-crimson", "wash", { name: "Carroburg Crimson", brand: "Citadel", range: "Shade", hex: "#752455" }),
          ref("citadel-evil-sunz-scarlet", "layer", { name: "Evil Sunz Scarlet", brand: "Citadel", range: "Layer", hex: "#C01411" }),
          ref("citadel-wild-rider-red", "highlight", { name: "Wild Rider Red", brand: "Citadel", range: "Layer", hex: "#E82E1B" }),
        ],
      },
      {
        name: "Gold trim",
        paints: [
          ref("citadel-retributor-armour", "base", { name: "Retributor Armour", brand: "Citadel", range: "Base", hex: "#EDC169" }),
          ref("citadel-reikland-fleshshade", "wash", { name: "Reikland Fleshshade", brand: "Citadel", range: "Shade", hex: "#7E3226" }),
          ref("citadel-auric-armour-gold", "layer", { name: "Auric Armour Gold", brand: "Citadel", range: "Layer", hex: "#FFC451" }),
          ref("citadel-stormhost-silver", "highlight", { name: "Stormhost Silver", brand: "Citadel", range: "Layer", hex: "#DADDDF" }),
        ],
      },
      {
        name: "Weapon casings",
        paints: [
          ref("citadel-abaddon-black", "base", { name: "Abaddon Black", brand: "Citadel", range: "Base", hex: "#000000" }),
          ref("citadel-nuln-oil", "wash", { name: "Nuln Oil", brand: "Citadel", range: "Shade", hex: "#393944" }),
          ref("citadel-eshin-grey", "layer", { name: "Eshin Grey", brand: "Citadel", range: "Layer", hex: "#484B4E" }),
          ref("citadel-dawnstone", "highlight", { name: "Dawnstone", brand: "Citadel", range: "Layer", hex: "#697068" }),
        ],
      },
      {
        name: "Bare steel",
        paints: [
          ref("citadel-leadbelcher-base", "base", { name: "Leadbelcher", brand: "Citadel", range: "Base", hex: "#969696" }),
          ref("citadel-nuln-oil", "wash", { name: "Nuln Oil", brand: "Citadel", range: "Shade", hex: "#393944" }),
          ref("citadel-runefang-steel", "drybrush", { name: "Runefang Steel", brand: "Citadel", range: "Layer", hex: "#C2C8CC" }),
        ],
      },
      {
        name: "Parchment",
        paints: [
          ref("citadel-zandri-dust", "base", { name: "Zandri Dust", brand: "Citadel", range: "Base", hex: "#988E56" }),
          ref("citadel-agrax-earthshade", "wash", { name: "Agrax Earthshade", brand: "Citadel", range: "Shade", hex: "#3C3C28" }),
          ref("citadel-ushabti-bone", "layer", { name: "Ushabti Bone", brand: "Citadel", range: "Layer", hex: "#ABA173" }),
          ref("citadel-screaming-skull", "highlight", { name: "Screaming Skull", brand: "Citadel", range: "Layer", hex: "#B9C099" }),
        ],
      },
      {
        name: "Bone insignia",
        paints: [
          ref("citadel-rakarth-flesh", "base", { name: "Rakarth Flesh", brand: "Citadel", range: "Base", hex: "#9C998D" }),
          ref("citadel-agrax-earthshade", "wash", { name: "Agrax Earthshade", brand: "Citadel", range: "Shade", hex: "#3C3C28" }),
          ref("citadel-pallid-wych-flesh", "layer", { name: "Pallid Wych Flesh", brand: "Citadel", range: "Layer", hex: "#CACCBB" }),
          ref("citadel-white-scar", "highlight", { name: "White Scar", brand: "Citadel", range: "Layer", hex: "#FFFFFF" }),
        ],
      },
      {
        name: "Eye lenses",
        paints: [
          ref("citadel-caliban-green", "base", { name: "Caliban Green", brand: "Citadel", range: "Base", hex: "#003D15" }),
          ref("citadel-warpstone-glow", "layer", { name: "Warpstone Glow", brand: "Citadel", range: "Layer", hex: "#0F702A" }),
          ref("citadel-moot-green", "layer", { name: "Moot Green", brand: "Citadel", range: "Layer", hex: "#3DAF44" }),
          ref("citadel-white-scar", "highlight", { name: "White Scar", brand: "Citadel", range: "Layer", hex: "#FFFFFF" }),
        ],
      },
    ],
  },
  {
    // Almost entirely shades, drybrushes and weathering over metal — the scheme that
    // best shows what the overlay roles do to a bar.
    slug: "necrons",
    title: "Necrons",
    elements: [
      {
        name: "Metal body",
        paints: [
          ref("citadel-leadbelcher-base", "base", { name: "Leadbelcher", brand: "Citadel", range: "Base", hex: "#969696" }),
          ref("citadel-nuln-oil", "wash", { name: "Nuln Oil", brand: "Citadel", range: "Shade", hex: "#393944" }),
          ref("citadel-ironbreaker", "layer", { name: "Ironbreaker", brand: "Citadel", range: "Layer", hex: "#899092" }),
          ref("citadel-runefang-steel", "drybrush", { name: "Runefang Steel", brand: "Citadel", range: "Layer", hex: "#C2C8CC" }),
        ],
      },
      {
        name: "Rusted plating",
        paints: [
          ref("citadel-leadbelcher-base", "base", { name: "Leadbelcher", brand: "Citadel", range: "Base", hex: "#969696" }),
          ref("citadel-agrax-earthshade", "wash", { name: "Agrax Earthshade", brand: "Citadel", range: "Shade", hex: "#3C3C28" }),
          ref("citadel-ryza-rust", "drybrush", { name: "Ryza Rust", brand: "Citadel", range: "Dry", hex: "#F16C23" }),
          ref("ak-interactive-rust-streaks", "weathering", { name: "Rust Streaks", brand: "AK Interactive", range: "Effects", hex: "#7B532A" }),
        ],
      },
      {
        name: "Tarnished brass",
        paints: [
          ref("citadel-balthasar-gold", "base", { name: "Balthasar Gold", brand: "Citadel", range: "Base", hex: "#A77353" }),
          ref("citadel-agrax-earthshade", "wash", { name: "Agrax Earthshade", brand: "Citadel", range: "Shade", hex: "#3C3C28" }),
          ref("scale-75-old-copper", "layer", { name: "Old Copper", brand: "Scale 75", range: "Metal N Alchemy Range", hex: "#97604C" }),
          ref("citadel-nihilakh-oxide", "weathering", { name: "Nihilakh Oxide", brand: "Citadel", range: "Technical", hex: "#66B39A" }),
        ],
      },
      {
        name: "Cabling",
        paints: [
          ref("citadel-abaddon-black", "base", { name: "Abaddon Black", brand: "Citadel", range: "Base", hex: "#000000" }),
          ref("citadel-nuln-oil", "wash", { name: "Nuln Oil", brand: "Citadel", range: "Shade", hex: "#393944" }),
          ref("citadel-skavenblight-dinge", "layer", { name: "Skavenblight Dinge", brand: "Citadel", range: "Layer", hex: "#45413B" }),
          ref("citadel-dawnstone", "highlight", { name: "Dawnstone", brand: "Citadel", range: "Layer", hex: "#697068" }),
        ],
      },
      {
        name: "Sand and rubble",
        paints: [
          ref("citadel-zandri-dust", "base", { name: "Zandri Dust", brand: "Citadel", range: "Base", hex: "#988E56" }),
          ref("citadel-agrax-earthshade", "wash", { name: "Agrax Earthshade", brand: "Citadel", range: "Shade", hex: "#3C3C28" }),
          ref("citadel-karak-stone", "layer", { name: "Karak Stone", brand: "Citadel", range: "Layer", hex: "#B7945C" }),
          ref("citadel-screaming-skull", "drybrush", { name: "Screaming Skull", brand: "Citadel", range: "Layer", hex: "#B9C099" }),
        ],
      },
      {
        name: "Gauss glow",
        paints: [
          ref("citadel-caliban-green", "base", { name: "Caliban Green", brand: "Citadel", range: "Base", hex: "#003D15" }),
          ref("citadel-warpstone-glow", "layer", { name: "Warpstone Glow", brand: "Citadel", range: "Layer", hex: "#0F702A" }),
          ref("citadel-moot-green", "layer", { name: "Moot Green", brand: "Citadel", range: "Layer", hex: "#3DAF44" }),
          ref("citadel-flash-gitz-yellow", "highlight", { name: "Flash Gitz Yellow", brand: "Citadel", range: "Layer", hex: "#FFF300" }),
        ],
      },
      {
        name: "Eye lenses",
        paints: [
          ref("citadel-warpstone-glow", "base", { name: "Warpstone Glow", brand: "Citadel", range: "Layer", hex: "#0F702A" }),
          ref("citadel-moot-green", "layer", { name: "Moot Green", brand: "Citadel", range: "Layer", hex: "#3DAF44" }),
          ref("citadel-white-scar", "highlight", { name: "White Scar", brand: "Citadel", range: "Layer", hex: "#FFFFFF" }),
        ],
      },
    ],
  },
  {
    // Contributed by @kasperhawser, and the scheme in the sample share image on the
    // homepage — the poster section links to this slug, so keep the two together.
    slug: "death-guard-30k",
    title: "Death Guard (30K)",
    elements: [
      {
        name: "Bone armour",
        paints: [
          ref("vallejo-sand-yellow", "base", { name: "Sand Yellow", brand: "Vallejo", range: "Model Air", hex: "#A48D6E" }),
          ref("vallejo-pale-sand", "layer", { name: "Pale Sand", brand: "Vallejo", range: "Model Color", hex: "#E3C28F" }),
          ref("ak-interactive-winter-streaking-grime", "wash", { name: "Winter Streaking Grime", brand: "AK Interactive", range: "Effects", hex: "#3A3A2B" }),
          ref("vallejo-aged-white", "layer", { name: "Aged White", brand: "Vallejo", range: "Model Air", hex: "#E3D3AF" }),
          ref("ak-interactive-off-white", "highlight", { name: "Off White", brand: "AK Interactive", range: "Real Colors - Modern", hex: "#E1D6BA" }),
          ref("ak-interactive-rust-streaks", "weathering", { name: "Rust Streaks", brand: "AK Interactive", range: "Effects", hex: "#7B532A" }),
        ],
      },
      {
        name: "Green armour",
        paints: [
          ref("vallejo-russian-green-4bo-model-air", "base", { name: "Russian Green 4BO", brand: "Vallejo", range: "Model Air", hex: "#52543F" }),
          ref("ak-interactive-winter-streaking-grime", "wash", { name: "Winter Streaking Grime", brand: "AK Interactive", range: "Effects", hex: "#3A3A2B" }),
          ref("citadel-elysian-green", "layer", { name: "Elysian Green", brand: "Citadel", range: "Layer", hex: "#6B8C37" }),
          ref("citadel-ogryn-camo", "layer", { name: "Ogryn Camo", brand: "Citadel", range: "Layer", hex: "#96A648" }),
          ref("ak-interactive-rust-streaks", "weathering", { name: "Rust Streaks", brand: "AK Interactive", range: "Effects", hex: "#7B532A" }),
        ],
      },
      {
        name: "Black rubber & metal",
        paints: [
          ref("vallejo-camouflage-black-brown", "base", { name: "Camouflage Black Brown", brand: "Vallejo", range: "Model Color", hex: "#403436" }),
          ref("vallejo-black-grey", "layer", { name: "Black Grey", brand: "Vallejo", range: "Model Color", hex: "#302722" }),
          ref("vallejo-basalt-grey", "layer", { name: "Basalt Grey", brand: "Vallejo", range: "Model Color", hex: "#5C5A5D" }),
        ],
      },
      {
        name: "Bronze metallics",
        paints: [
          ref("scale-75-decayed-metal", "base", { name: "Decayed Metal", brand: "Scale 75", range: "Metal N Alchemy Range", hex: "#5D4038" }),
          ref("ak-interactive-winter-streaking-grime", "wash", { name: "Winter Streaking Grime", brand: "AK Interactive", range: "Effects", hex: "#3A3A2B" }),
          ref("scale-75-victorian-brass", "layer", { name: "Victorian Brass", brand: "Scale 75", range: "Metal N Alchemy Range", hex: "#B6843B" }),
        ],
      },
      {
        name: "Silver metallics",
        paints: [
          ref("vallejo-exhaust-manifold", "base", { name: "Exhaust Manifold", brand: "Vallejo", range: "Metal Color", hex: "#7D7D7B" }),
          ref("ak-interactive-winter-streaking-grime", "wash", { name: "Winter Streaking Grime", brand: "AK Interactive", range: "Effects", hex: "#3A3A2B" }),
          ref("scale-75-heavy-metal", "layer", { name: "Heavy Metal", brand: "Scale 75", range: "Metal N Alchemy Range", hex: "#9C9DA1" }),
          ref("ak-interactive-rust-streaks", "weathering", { name: "Rust Streaks", brand: "AK Interactive", range: "Effects", hex: "#7B532A" }),
        ],
      },
      {
        name: "Pale skin",
        paints: [
          ref("citadel-rakarth-flesh", "base", { name: "Rakarth Flesh", brand: "Citadel", range: "Base", hex: "#9C998D" }),
          ref("citadel-reikland-fleshshade", "wash", { name: "Reikland Fleshshade", brand: "Citadel", range: "Shade", hex: "#7E3226" }),
          ref("citadel-pallid-wych-flesh", "layer", { name: "Pallid Wych Flesh", brand: "Citadel", range: "Layer", hex: "#CACCBB" }),
          ref("citadel-carroburg-crimson", "glaze", { name: "Carroburg Crimson", brand: "Citadel", range: "Shade", hex: "#752455" }),
        ],
      },
      {
        name: "Plasma and lenses",
        paints: [
          ref("citadel-khorne-red", "base", { name: "Khorne Red", brand: "Citadel", range: "Base", hex: "#650001" }),
          ref("citadel-wild-rider-red", "layer", { name: "Wild Rider Red", brand: "Citadel", range: "Layer", hex: "#E82E1B" }),
          ref("vallejo-brown-rose", "layer", { name: "Brown Rose", brand: "Vallejo", range: "Model Color", hex: "#AC8786" }),
          ref("citadel-white-scar", "layer", { name: "White Scar", brand: "Citadel", range: "Layer", hex: "#FFFFFF" }),
        ],
      },
    ],
  },
];
