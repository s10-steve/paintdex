"use client";

/**
 * The homepage's example-scheme carousel.
 *
 * It renders the **real** `Bar` from `scheme-bars`, not a lookalike: the whole
 * point is that a visitor sees genuine visualiser output — weighted tonal ramps,
 * translucent overlay bands, the element-order width taper — rather than the
 * decorative CSS gradients this replaced. Presets arrive fully resolved from the
 * server component (`src/app/page.tsx`), so this file never touches the paint
 * catalogue.
 *
 * Auto-rotation follows the ARIA APG carousel pattern, which matters more than
 * usual here because the thing rotates on its own:
 * - `prefers-reduced-motion` disables rotation entirely;
 * - hover *and* keyboard focus pause it (focus is capture-phase — it lands on
 *   descendants, never the region itself);
 * - any manual navigation stops it for good;
 * - there's an explicit pause/play button, because WCAG 2.2.2 wants a real
 *   control for motion lasting over five seconds and hover doesn't help a
 *   keyboard or touch user.
 */

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Bar, useBarHover } from "@/components/scheme-bars";
import type { ResolvedPreset } from "@/lib/scheme/presets";

const ROTATE_MS = 7000;
/** Shorter than the editor's 340px so a slide fits a homepage card. */
const BAR_HEIGHT_PX = 200;

export function HomeSchemeCarousel({ presets }: { presets: ResolvedPreset[] }) {
  const [i, setI] = useState(0);
  /** The visitor took manual control — stop rotating for the rest of the visit. */
  const [sticky, setSticky] = useState(false);
  const [paused, setPaused] = useState(false);
  /** Direction of the last move, so the incoming slide enters from that side. */
  const [dir, setDir] = useState(1);
  /**
   * The slide has changed at least once. Withholds the enter animation on the
   * first paint, where there's nothing to transition *from*.
   */
  const [moved, setMoved] = useState(false);
  /**
   * Starts `true` so nothing can rotate before the media query is measured, and
   * so the server and first client render agree.
   */
  const [reduced, setReduced] = useState(true);
  const { hovered, hover, tooltip } = useBarHover();

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const count = presets.length;
  const rotating = !reduced && !sticky && !paused && count > 1;

  useEffect(() => {
    if (!rotating) return;
    // Functional update keeps `i` out of the deps, so the interval isn't torn
    // down and rebuilt on every tick.
    const timer = setInterval(() => {
      setDir(1);
      setMoved(true);
      setI((n) => (n + 1) % count);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [rotating, count]);

  if (count === 0) return null;

  /** Manual navigation: move, and stop auto-rotating permanently. */
  const go = (next: number) => {
    setDir(next < i ? -1 : 1);
    setMoved(true);
    setI(((next % count) + count) % count);
    setSticky(true);
  };

  const active = presets[i];
  const animated = moved && !reduced;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Example paint schemes"
      className="rounded-xl border border-border bg-background/40 p-4 sm:p-5"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(i - 1);
        else if (e.key === "ArrowRight") go(i + 1);
        else return;
        e.preventDefault();
      }}
    >
      {/* Announce slide changes only once rotation has stopped — an unprompted
          live region firing every 7s is worse than silence (APG). */}
      <div aria-live={rotating ? "off" : "polite"}>
        {/* Keyed on the index so only the active slide is in the DOM: no hidden
            focusable links to tab into, no aria-hidden bookkeeping. The key is
            also what restarts the enter animation — remounting replays it, so
            there's no need to track the outgoing slide. */}
        <div
          key={active.slug}
          role="group"
          aria-roledescription="slide"
          aria-label={`${i + 1} of ${count}: ${active.title}`}
          className={animated ? "carousel-slide-in" : undefined}
          style={{ "--carousel-from": dir > 0 ? "1rem" : "-1rem" } as CSSProperties}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="text-lg font-semibold tracking-tight">{active.title}</h3>
            <Link
              href={`/visualiser?preset=${active.slug}`}
              className="text-sm font-medium text-foreground underline underline-offset-2 hover:no-underline"
            >
              Open in the designer →
            </Link>
          </div>
          {/* Seven elements is the widest preset; on a narrow viewport the row
              scrolls inside itself rather than stretching the page. */}
          <div className="mt-4 overflow-x-auto pb-1">
            <div className="flex min-w-fit items-start gap-3">
              {active.elements.map((element, k) => (
                <Bar
                  key={element.id}
                  element={element}
                  index={k}
                  blend={false}
                  heightPx={BAR_HEIGHT_PX}
                  hovered={hovered}
                  hover={hover}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2">
        <CarouselButton label="Previous scheme" onClick={() => go(i - 1)}>
          ←
        </CarouselButton>

        <div className="flex items-center gap-1.5">
          {presets.map((p, n) => (
            <button
              key={p.slug}
              type="button"
              onClick={() => go(n)}
              aria-label={`Show scheme ${n + 1}: ${p.title}`}
              aria-current={n === i}
              className={`h-2.5 w-2.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                n === i ? "bg-foreground" : "bg-border hover:bg-muted-foreground"
              }`}
            />
          ))}
        </div>

        <CarouselButton label="Next scheme" onClick={() => go(i + 1)}>
          →
        </CarouselButton>

        {/* Only meaningful when something could actually be moving. */}
        {!reduced && count > 1 && (
          <CarouselButton
            label={sticky ? "Start automatic rotation" : "Stop automatic rotation"}
            onClick={() => {
              // Pressing play also clears the hover/focus pause. Without that, a
              // keyboard user who tabs to this button and presses it holds focus
              // inside the region, so `paused` stays true and nothing moves — the
              // control reads as broken. An explicit request beats an ambient pause.
              if (sticky) setPaused(false);
              setSticky(!sticky);
            }}
            className="ml-1"
          >
            {sticky ? "▶" : "❙❙"}
          </CarouselButton>
        )}
      </div>

      {tooltip}
    </section>
  );
}

function CarouselButton({
  label,
  onClick,
  className = "",
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-7 w-7 items-center justify-center rounded-md border border-border text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
    >
      {children}
    </button>
  );
}
