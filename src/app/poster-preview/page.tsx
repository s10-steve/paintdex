"use client";

/**
 * TEMPORARY design-review harness for the poster renderer. Not linked from
 * anywhere, and to be deleted before this branch merges — it exists so the
 * poster can be iterated on as a real PNG rather than as a description, before
 * any of the studio UI is built.
 *
 * Drop a photo at `public/__model.jpg` (gitignored) and open
 * `/poster-preview?zoom=1.2&oy=-40&roles=1&light=1`.
 */
import { useEffect, useRef } from "react";
import { layoutPoster, POSTER_SIZE, type PosterAnchors, type PosterOptions } from "@/lib/scheme/poster";
import { drawPoster, resolveFontFamily, type PosterPhoto } from "@/lib/scheme/poster-draw";
import type { Scheme, SchemePaint, SchemeRole } from "@/lib/scheme/types";

let n = 0;
const p = (name: string, hex: string, role: SchemeRole): SchemePaint => ({
  id: `p${++n}`,
  name,
  brand: "Citadel",
  range: "Base",
  hex,
  role,
});

const SAMPLE: Scheme = {
  title: "Death Guard Contemptor",
  elements: [
    {
      id: "e1",
      name: "Armour Plate",
      paints: [
        p("Rakarth Flesh", "#9C9083", "base"),
        p("Screaming Skull", "#D6D2AC", "layer"),
        p("Pallid Wych Flesh", "#E8E5D0", "highlight"),
        p("Agrax Earthshade", "#5B4A38", "wash"),
      ],
    },
    {
      id: "e2",
      name: "Shoulder Pads",
      paints: [
        p("Death Guard Green", "#7A8B5A", "base"),
        p("Ogryn Camo", "#9BAA6B", "layer"),
        p("Nurgling Green", "#C2CE9A", "highlight"),
        p("Athonian Camoshade", "#5F6B34", "wash"),
      ],
    },
    {
      id: "e3",
      name: "Metal Trim",
      paints: [
        p("Leadbelcher", "#6E7477", "base"),
        p("Ironbreaker", "#9AA0A3", "layer"),
        p("Nuln Oil", "#1B1B1D", "wash"),
      ],
    },
    {
      id: "e4",
      name: "Gun Barrels",
      paints: [
        p("Leadbelcher", "#6E7477", "base"),
        p("Ironbreaker", "#9AA0A3", "highlight"),
        p("Ryza Rust", "#C4622B", "weathering"),
      ],
    },
    {
      id: "e5",
      name: "Eye Lenses",
      paints: [
        p("Screamer Pink", "#7C1A3C", "base"),
        p("Pink Horror", "#C0407A", "layer"),
        p("Emperor's Children", "#E27BAE", "highlight"),
      ],
    },
    {
      id: "e6",
      name: "Base",
      paints: [
        p("Rhinox Hide", "#4A3536", "base"),
        p("Mournfang Brown", "#7A4A28", "layer"),
        p("Karak Stone", "#B9A176", "drybrush"),
      ],
    },
  ],
};

/** Normalised against the source photo, so they survive re-framing. */
const ANCHORS: PosterAnchors = {
  0: { x: 0.5, y: 0.45 },
  1: { x: 0.62, y: 0.35 },
  2: { x: 0.31, y: 0.45 },
  3: { x: 0.21, y: 0.56 },
  4: { x: 0.492, y: 0.357, side: "left" },
  5: { x: 0.5, y: 0.76 },
};

const SCALE = 2;

const q = (k: string, d: number) =>
  typeof window === "undefined" ? d : Number(new URLSearchParams(location.search).get(k) ?? d);

export default function PosterPreviewPage() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;
    (async () => {
      await document.fonts.ready;
      const img = new Image();
      img.src = typeof window === "undefined" ? "" : new URLSearchParams(location.search).get("src") ?? "/__model.jpg";
      await img.decode();
      if (cancelled) return;

      const photo: PosterPhoto = {
        image: img,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        zoom: q("zoom", 1),
        offsetX: q("ox", 0),
        offsetY: q("oy", 0),
      };
      const options: PosterOptions = {
        handle: "s10_steve",
        showRoles: q("roles", 0) === 1,
        theme: q("light", 0) === 1 ? "light" : "dark",
      };

      canvas.width = POSTER_SIZE.width * SCALE;
      canvas.height = POSTER_SIZE.height * SCALE;
      const layout = layoutPoster({ elements: SAMPLE.elements, anchors: ANCHORS, photo });
      drawPoster(ctx, {
        layout,
        options,
        photo,
        fontFamily: resolveFontFamily(),
        scale: SCALE,
      });
      document.body.dataset.posterReady = "1";
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return <canvas ref={ref} id="poster" style={{ width: 540, height: 675, display: "block" }} />;
}
