import { z } from "zod";
import { PAINT_TYPES } from "./types";

/**
 * Zod schema for a single paint record in `data/paints/*.json`.
 * Used by the data validation script and can be reused at load time.
 */
export const paintSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "id must be a lowercase slug (a-z, 0-9, -)"),
  name: z.string().min(1),
  brand: z.string().min(1),
  range: z.string().min(1),
  ranges: z.array(z.string().min(1)).optional(),
  type: z.enum(PAINT_TYPES),
  hex: z.string().regex(/^#[0-9A-F]{6}$/, "hex must be uppercase #RRGGBB"),
  code: z.string().min(1).nullable().optional(),
  discontinued: z.boolean(),
  /**
   * Whether the paint has a metallic finish. Independent of `type`: brands
   * classify metallics inconsistently (some as `type: "metallic"`, others under
   * a colour/finish line like Citadel's "layer"), so this is a separate,
   * hand-correctable flag. Absent is treated as false.
   */
  metallic: z.boolean().optional(),
});

export const paintsFileSchema = z.array(paintSchema);

export type PaintInput = z.infer<typeof paintSchema>;
