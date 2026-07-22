/**
 * Generated OpenGraph preview for a shared scheme: the scheme's colour bars as
 * a 1200×630 image, so a pasted link on Reddit/Instagram/etc. shows the actual
 * palette rather than a generic card. Rendered with `next/og` (Satori), which
 * supports flexbox + solid backgrounds but not CSS gradients — so we draw
 * **banded** solid blocks (one per solid paint), which is exactly what we want
 * at thumbnail size.
 */
import { ImageResponse } from "next/og";
import { getPublicSchemeBySlug } from "@/lib/supabase/server";
import { importSchemeObject } from "@/lib/scheme/io";
import { barModel } from "@/lib/scheme/bars";

export const alt = "A miniature paint scheme shared from Paintdex";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0c0a09";
const FG = "#fafaf9";
const MUTED = "#a8a29e";

export default async function OgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const row = await getPublicSchemeBySlug(slug);

  let n = 0;
  const scheme = row ? importSchemeObject(row.data, () => `o${n++}`) : null;
  const title = scheme?.title || "A Paintdex colour scheme";
  // Cap the number of bars so a huge scheme still fits the frame.
  const elements = (scheme?.elements ?? []).filter((e) => e.paints.length > 0).slice(0, 8);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: BG,
          color: FG,
          padding: "56px 64px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, color: MUTED, fontSize: 30 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "#7c3aed",
              color: FG,
              fontWeight: 700,
            }}
          >
            P
          </div>
          <div style={{ display: "flex" }}>Paintdex · paint scheme</div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: title.length > 40 ? 56 : 72,
            fontWeight: 800,
            marginTop: 20,
            lineHeight: 1.05,
            maxWidth: 1000,
          }}
        >
          {title}
        </div>

        {/* Bars */}
        <div style={{ display: "flex", flex: 1, alignItems: "flex-end", gap: 20, marginTop: 36 }}>
          {elements.length === 0 ? (
            <div style={{ display: "flex", color: MUTED, fontSize: 34 }}>
              See the colours and the full paint recipe →
            </div>
          ) : (
            elements.map((element, i) => {
              const { segs } = barModel(element.paints);
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    flex: 1,
                    height: "100%",
                    justifyContent: "flex-end",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column-reverse",
                      width: "100%",
                      height: 300,
                      borderRadius: 12,
                      overflow: "hidden",
                      border: "1px solid rgba(255,255,255,0.12)",
                    }}
                  >
                    {segs.map((s, j) => (
                      <div
                        key={j}
                        style={{ display: "flex", flexGrow: s.frac, background: s.paint.hex }}
                      />
                    ))}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      color: MUTED,
                      fontSize: 22,
                      marginTop: 12,
                      textAlign: "center",
                      width: "100%",
                      overflow: "hidden",
                    }}
                  >
                    {element.name.length > 16 ? element.name.slice(0, 15) + "…" : element.name}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    ),
    size,
  );
}
