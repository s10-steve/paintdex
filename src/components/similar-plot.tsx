"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { matchLabel } from "@/lib/paints/filter";
import {
  AXIS_ENDS,
  axisUnit,
  describePoint,
  layoutScatter,
  TARGET_RING,
  type ScatterAxis,
  type ScatterCandidate,
  type ScatterLayout,
} from "@/lib/paints/scatter";
import { useElementWidth } from "@/hooks/use-element-width";
import { MatchBadge } from "./match-badge";

interface SimilarPlotProps {
  targetName: string;
  targetHex: string;
  targetLab: readonly [number, number, number];
  candidates: ScatterCandidate[];
  axis: ScatterAxis;
  /** Null while the axis is still following the reference paint's chroma. */
  axisOverridden: boolean;
  onAxisChange: (axis: ScatterAxis | null) => void;
  /** True when the reference paint is too neutral for its hue angle to mean much. */
  targetIsNeutral: boolean;
}

/** Narrow screens get bigger marks: 2 × 12px clears the WCAG 2.5.8 target size. */
const sizeFor = (measured: number) => {
  const width = Math.min(720, Math.max(280, measured));
  const narrow = width < 480;
  return {
    width,
    height: narrow ? 380 : 440,
    markR: narrow ? 12 : 9,
    gutterLeft: narrow ? 34 : 44,
    gutterRight: 12,
    gutterTop: 12,
    gutterBottom: narrow ? 52 : 44,
  };
};

const fmtSigned = (n: number, unit: string) =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n))}${unit}`;

export function SimilarPlot({
  targetName,
  targetHex,
  targetLab,
  candidates,
  axis,
  axisOverridden,
  onAxisChange,
  targetIsNeutral,
}: SimilarPlotProps) {
  const [boxRef, measured] = useElementWidth<HTMLDivElement>();
  // Roving tabindex: one tab stop for the whole plot, arrows move between marks.
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const markRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  const size = useMemo(() => sizeFor(measured), [measured]);

  const layout = useMemo<ScatterLayout | null>(
    () =>
      measured > 0
        ? layoutScatter({ lab: targetLab }, candidates, { size, axis })
        : null,
    [measured, targetLab, candidates, size, axis],
  );

  // Memoized so the empty-array fallback doesn't get a fresh identity each render
  // and invalidate the axis-extreme memo below.
  const points = useMemo(() => layout?.points ?? [], [layout]);
  const activeIndex = Math.min(active, Math.max(0, points.length - 1));
  const shown = hovered ?? activeIndex;
  const detail = points[shown];

  const focusMark = useCallback((i: number) => {
    setActive(i);
    markRefs.current[i]?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!points.length) return;
    // Both axis pairs step through the ΔE ranking rather than moving spatially:
    // "next closest match" is the useful traversal, and it needs no spatial
    // reasoning from someone who can't see the plot.
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = activeIndex + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = activeIndex - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = points.length - 1;
    if (next === null) return;
    e.preventDefault();
    focusMark(Math.min(points.length - 1, Math.max(0, next)));
  };

  // End-of-axis swatches: the actual extreme candidates, which say what "left"
  // and "right" mean far better than a word can. "cooler/warmer" would be a lie —
  // from red, increasing hue heads to yellow; from blue, to purple.
  const [lowEnd, highEnd] = useMemo(() => {
    if (!points.length) return [null, null] as const;
    let lo = points[0];
    let hi = points[0];
    for (const p of points) {
      if (p.ax < lo.ax) lo = p;
      if (p.ax > hi.ax) hi = p;
    }
    return [lo, hi] as const;
  }, [points]);

  const unit = axisUnit(axis);
  const axisTitle = axis === "hue" ? "Hue shift" : "Saturation";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div
          role="group"
          aria-label="Horizontal axis"
          className="inline-flex rounded-lg border border-input bg-card p-0.5"
        >
          {(
            [
              { value: "hue", label: "Hue shift" },
              { value: "chroma", label: "Saturation" },
            ] as const
          ).map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={axis === o.value}
              onClick={() => onAxisChange(o.value)}
              className={`rounded-md px-2.5 py-1 text-sm ${
                axis === o.value
                  ? "bg-muted font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {axisOverridden ? (
          <button
            type="button"
            onClick={() => onAxisChange(null)}
            className="text-xs text-primary hover:underline"
          >
            Use the suggested axis
          </button>
        ) : null}
      </div>

      {targetIsNeutral && axis === "hue" ? (
        <p className="mb-3 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          {targetName} is nearly neutral, so its hue angle isn&rsquo;t reliable —
          positions on this axis are close to arbitrary. Saturation is the more
          useful axis for this paint.
        </p>
      ) : null}

      <figure className="m-0">
        <div ref={boxRef} className="relative w-full">
          {layout ? (
            <div
              className="relative mx-auto"
              style={{ width: layout.width, height: layout.height }}
            >
              {/* Chrome only: frame, gridlines, ticks, tethers. The marks are real
                  HTML anchors in the overlay below, so this carries no semantics. */}
              <svg
                width={layout.width}
                height={layout.height}
                aria-hidden="true"
                className="absolute inset-0 overflow-visible"
              >
                <rect
                  x={layout.plot.x}
                  y={layout.plot.y}
                  width={layout.plot.width}
                  height={layout.plot.height}
                  rx={8}
                  className="fill-card stroke-border"
                />

                {layout.x.ticks.map((t) => {
                  const x =
                    layout.plot.x +
                    layout.inset +
                    ((t - layout.x.min) / (layout.x.max - layout.x.min || 1)) *
                      (layout.plot.width - 2 * layout.inset);
                  return (
                    <g key={`x${t}`}>
                      <line
                        x1={x}
                        x2={x}
                        y1={layout.plot.y}
                        y2={layout.plot.y + layout.plot.height}
                        className="stroke-border"
                        strokeDasharray={t === 0 ? undefined : "2 4"}
                        strokeOpacity={t === 0 ? 0.9 : 0.5}
                      />
                      <text
                        x={x}
                        y={layout.plot.y + layout.plot.height + 14}
                        textAnchor="middle"
                        className="fill-[var(--muted-foreground)] text-[10px]"
                      >
                        {fmtSigned(t, unit)}
                      </text>
                    </g>
                  );
                })}

                {layout.y.ticks.map((t) => {
                  const y =
                    layout.plot.y +
                    layout.inset +
                    (1 -
                      (t - layout.y.min) / (layout.y.max - layout.y.min || 1)) *
                      (layout.plot.height - 2 * layout.inset);
                  return (
                    <g key={`y${t}`}>
                      <line
                        x1={layout.plot.x}
                        x2={layout.plot.x + layout.plot.width}
                        y1={y}
                        y2={y}
                        className="stroke-border"
                        strokeDasharray={t === 0 ? undefined : "2 4"}
                        strokeOpacity={t === 0 ? 0.9 : 0.5}
                      />
                      <text
                        x={layout.plot.x - 6}
                        y={y + 3}
                        textAnchor="end"
                        className="fill-[var(--muted-foreground)] text-[10px]"
                      >
                        {fmtSigned(t, "")}
                      </text>
                    </g>
                  );
                })}

                {/* Tethers for marks the packer had to nudge, so a displaced
                    swatch still points at where it really belongs. */}
                {points.map((p) =>
                  p.displaced ? (
                    <line
                      key={`t${p.id}`}
                      x1={p.trueX}
                      y1={p.trueY}
                      x2={p.x}
                      y2={p.y}
                      className="stroke-border"
                      strokeOpacity={0.7}
                    />
                  ) : null,
                )}

                {/* The reference paint. Not a link — you're already on its page. */}
                <g>
                  <circle
                    cx={layout.target.x}
                    cy={layout.target.y}
                    r={layout.markR + TARGET_RING}
                    className="fill-none stroke-[var(--foreground)]"
                    strokeOpacity={0.45}
                    strokeDasharray="3 3"
                  />
                  <rect
                    x={layout.target.x - layout.markR - 2}
                    y={layout.target.y - layout.markR - 2}
                    width={(layout.markR + 2) * 2}
                    height={(layout.markR + 2) * 2}
                    rx={4}
                    fill={targetHex}
                    className="stroke-[var(--foreground)]"
                    strokeOpacity={0.7}
                  />
                </g>
              </svg>

              {/* Marks. HTML anchors rather than <a> inside <svg>: SVGAElement
                  gives up real focus rings, border-radius, and Tailwind classes
                  for nothing in return.

                  DOM order is the ΔE ranking, so reading order, link order and
                  keyboard order all agree with the list view. Closest-on-top is
                  done with z-index instead — reversing the DOM to paint it would
                  read the ranking out backwards to a screen reader. */}
              <div
                className="absolute inset-0"
                onKeyDown={onKeyDown}
                onMouseLeave={() => setHovered(null)}
                role="group"
                aria-label={`${points.length} alternatives to ${targetName}, closest first`}
              >
                {points.map((p, i) => (
                  <Link
                    key={p.id}
                    ref={(el) => {
                      markRefs.current[i] = el;
                    }}
                    href={`/paints/${p.id}`}
                    // Load-bearing: App Router prefetches static routes on
                    // viewport intersection, so leaving this on would fire ~120
                    // RSC requests the moment the plot scrolls into view.
                    prefetch={false}
                    tabIndex={i === activeIndex ? 0 : -1}
                    aria-label={`${p.name}, ${p.brand}, ${p.range}. ${matchLabel(
                      p.distance,
                    )}, ΔE ${p.distance.toFixed(1)}. ${describePoint(p, axis)}.`}
                    onFocus={() => {
                      setActive(i);
                      setHovered(i);
                    }}
                    onBlur={() => setHovered(null)}
                    onMouseEnter={() => setHovered(i)}
                    className={`absolute rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      p.hueUncertain
                        ? "border-dashed border-[var(--foreground)]/60"
                        : "border-border"
                    } ${hovered === i ? "ring-2 ring-ring" : ""}`}
                    style={{
                      left: p.x - layout.markR,
                      top: p.y - layout.markR,
                      width: layout.markR * 2,
                      height: layout.markR * 2,
                      backgroundColor: p.hex,
                      // Closest match highest, and whatever is hovered above all.
                      zIndex: hovered === i ? points.length + 1 : points.length - i,
                    }}
                  />
                ))}
              </div>
            </div>
          ) : (
            // Pre-measurement: reserve the taller of the two heights so the first
            // real paint doesn't shift the page.
            <div className="h-[440px] w-full animate-pulse rounded-lg border border-border bg-muted" />
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            {lowEnd ? (
              <span
                className="h-3 w-3 rounded-sm border border-border"
                style={{ backgroundColor: lowEnd.hex }}
                aria-hidden="true"
              />
            ) : null}
            {/* Only claim "more muted" when something actually is: a paint with no
                saturation left has a one-sided axis starting at zero. */}
            {axis === "chroma" && layout && layout.x.min < 0
              ? AXIS_ENDS.chroma[0]
              : "◀"}
          </span>
          <span className="font-medium">
            {axisTitle}
            {unit ? ` (${unit})` : ""} · vertical: lightness
          </span>
          <span className="flex items-center gap-1.5">
            {axis === "chroma" ? AXIS_ENDS.chroma[1] : "▶"}
            {highEnd ? (
              <span
                className="h-3 w-3 rounded-sm border border-border"
                style={{ backgroundColor: highEnd.hex }}
                aria-hidden="true"
              />
            ) : null}
          </span>
        </div>

        {/* Fixed detail panel rather than a floating tooltip: it can't overflow
            the plot, and hover, focus and touch all drive the same thing. */}
        <div className="mt-3 min-h-[76px] rounded-lg border border-border bg-card p-3">
          {detail ? (
            <div className="flex items-center gap-3">
              <span
                className="h-10 w-10 shrink-0 rounded-md border border-border"
                style={{ backgroundColor: detail.hex }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium [overflow-wrap:anywhere]">
                  {detail.name}
                </span>
                <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  {detail.brand} · {detail.range}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {describePoint(detail, axis)}
                </span>
              </span>
              <MatchBadge distance={detail.distance} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No alternatives match these filters. Try widening them.
            </p>
          )}
        </div>

        <figcaption className="mt-2 text-xs text-muted-foreground">
          Alternatives to {targetName}, placed by{" "}
          {axis === "hue" ? "hue shift" : "saturation"} across and lightness up.{" "}
          {targetName} is the ringed swatch, on the zero lines.
          {layout && layout.omittedCount > 0
            ? ` Showing the ${points.length} closest of ${
                points.length + layout.omittedCount
              } matches.`
            : ""}
          {layout && layout.x.floored
            ? ` These are all within ${layout.x.max.toFixed(0)}${unit} of ${
                axis === "hue" ? "hue" : "saturation"
              }, so marks are spread apart to stay clickable.`
            : ""}
          {layout && layout.overlapping > 0
            ? ` ${layout.overlapping} mark${
                layout.overlapping === 1 ? "" : "s"
              } sit too close to separate and stay partly hidden — the list view shows every match.`
            : ""}
          <span className="sr-only">
            {" "}
            Press Tab to enter the plot, then the arrow keys to move from the
            closest match to the loosest.
          </span>
        </figcaption>
      </figure>
    </div>
  );
}
