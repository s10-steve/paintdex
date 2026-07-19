/**
 * The built-in example scheme — Steve's White Templars.
 *
 * Hexes are the real database values where the paint exists in Paintdex, and
 * hand-picked otherwise (primers, mixes, panel liner, OSL glow — flagged
 * `custom`). Weights and roles are tuned so the bars read like a painted mini:
 * chunky bases, thin highlights, washes/glazes/weathering as overlay passes.
 */
import type { Scheme, SchemePaint, SchemeRole } from "./types";

/** Build the example with fresh, unique ids each call. */
export function whiteTemplars(): Scheme {
  let n = 0;
  const id = () => `seed-${n++}`;
  const p = (
    name: string,
    brand: string,
    range: string,
    hex: string,
    role: SchemeRole,
    extra: { custom?: boolean; weight?: number } = {},
  ): SchemePaint => ({ id: id(), name, brand, range, hex, role, custom: extra.custom, weight: extra.weight });

  return {
    title: "White Templars",
    elements: [
      {
        id: id(),
        name: "White Armour",
        weight: 3,
        paints: [
          p("IDF Sand Grey (primer)", "Vallejo", "Surface Primer", "#C7BDA4", "base", { custom: true }),
          p("Deck Tan", "Vallejo", "Model Color", "#ABA390", "layer", { weight: 1.1 }),
          p("Ivory", "Vallejo", "Model Color", "#EBE2D1", "layer"),
          p("Panel Liner (black + brown)", "Tamiya", "50:50 mix", "#221C18", "wash", { custom: true, weight: 1.1 }),
          p("Ivory (relayer)", "Vallejo", "Model Color", "#EBE2D1", "layer", { weight: 0.9 }),
          p("Off-White", "Vallejo", "Game Color", "#FEF3DD", "layer", { weight: 0.8 }),
          p("Camo Black Brown (chips)", "Vallejo", "Model Color", "#403436", "weathering", { weight: 0.6 }),
          p("AK White (final highlight)", "AK Interactive", "custom", "#FCFBF7", "highlight", { custom: true, weight: 0.45 }),
        ],
      },
      {
        id: id(),
        name: "Black Armour & Trim",
        weight: 1.4,
        paints: [
          p("Black Purple", "AK Interactive", "custom", "#191320", "base", { custom: true, weight: 1.5 }),
          p("Graphite + Black Purple", "AK Interactive", "50:50 mix", "#3B3540", "layer", { custom: true }),
          p("Graphite (edge highlight)", "AK Interactive", "Standard", "#6C6E60", "highlight", { weight: 0.5 }),
        ],
      },
      {
        id: id(),
        name: "Red Robes",
        weight: 2,
        paints: [
          p("Black Purple", "AK Interactive", "custom", "#191320", "base", { custom: true, weight: 1.3 }),
          p("Wine Red", "AK Interactive", "Standard", "#69140D", "layer", { weight: 1.2 }),
          p("Pastel Peach (highlight)", "AK Interactive", "Pastel", "#F59A54", "highlight", { weight: 0.5 }),
          p("Wine Red (glaze back)", "AK Interactive", "Standard", "#69140D", "glaze", { weight: 1.2 }),
        ],
      },
      {
        id: id(),
        name: "Silver Metal",
        weight: 1,
        paints: [
          p("Exhaust Manifold", "Vallejo", "Metal Color", "#7D7D7B", "base", { weight: 1.3 }),
          p("Heavy Metal", "Scale 75", "Metal n' Alchemy", "#9C9DA1", "layer"),
          p("Speed Metal (highlight)", "Scale 75", "Metal n' Alchemy", "#D4D4D6", "highlight", { weight: 0.6 }),
          p("Rust Streaks", "AK Interactive", "custom", "#7A4327", "weathering", { custom: true, weight: 0.7 }),
        ],
      },
      {
        id: id(),
        name: "Dark Brown Leather",
        weight: 0.9,
        paints: [
          p("Rhinox Hide", "Citadel", "Base", "#462F30", "base", { weight: 1.3 }),
          p("Doombull Brown", "Citadel", "Layer", "#570003", "layer", { weight: 1.1 }),
          p("Skrag Brown (highlight)", "Citadel", "Layer", "#8B4806", "highlight", { weight: 0.6 }),
        ],
      },
      {
        id: id(),
        name: "Power Sword",
        weight: 0.7,
        paints: [
          p("Andrea Blue", "Vallejo", "Model Color", "#0270AF", "base", { weight: 1.2 }),
          p("Deep Sky Blue", "Vallejo", "Model Color", "#4D95C5", "layer"),
          p("Sky Blue (highlight)", "Vallejo", "Model Color", "#74B8CF", "highlight", { weight: 0.7 }),
        ],
      },
      {
        id: id(),
        name: "Purity Seals",
        weight: 0.6,
        paints: [
          p("Zandri Dust", "Citadel", "Base", "#988E56", "base", { weight: 1.2 }),
          p("Ushabti Bone", "Citadel", "Layer", "#ABA173", "layer"),
          p("Screaming Skull (highlight)", "Citadel", "Layer", "#B9C099", "highlight", { weight: 0.6 }),
        ],
      },
      {
        id: id(),
        name: "Eye Lenses",
        weight: 0.4,
        paints: [
          p("Recess shade (cold blue)", "custom", "custom", "#142A4A", "base", { custom: true }),
          p("Deep glow", "custom", "custom", "#5A0E2E", "layer", { custom: true }),
          p("Magenta glow", "custom", "custom", "#B0246A", "layer", { custom: true }),
          p("Bright glow", "custom", "custom", "#E86AA6", "highlight", { custom: true, weight: 0.7 }),
          p("White dot", "custom", "custom", "#FFFFFF", "highlight", { custom: true, weight: 0.3 }),
        ],
      },
    ],
  };
}
