/**
 * Canvas 2D renderer for the shareable poster.
 *
 * Why hand-rolled canvas rather than the `next/og` path used by
 * `app/scheme/[slug]/opengraph-image.tsx`: Satori supports neither CSS gradients
 * nor blend modes, which is exactly why the OG image draws banded solids and
 * drops wash/glaze overlays entirely. Canvas does `createLinearGradient` and
 * `globalCompositeOperation = "multiply"` natively, so the poster can show the
 * real ramp — and it runs in the browser, so the user's photo never leaves their
 * device.
 *
 * The same `drawPoster` renders both the on-screen preview and the exported PNG,
 * differing only in `scale`. That is deliberate: it makes the export WYSIWYG by
 * construction rather than by keeping two renderers in agreement.
 *
 * Layout decisions live in `./poster`; this module only paints.
 */
import { overlayCenter, type Overlay, type Seg } from "./bars";
import { roleOf, type SchemePaint } from "./types";
import {
  COLUMN_W,
  FOOTER_H,
  MARGIN,
  NAME_GAP,
  NAME_H,
  OVERLAY_W,
  photoRect,
  POSTER_THEMES,
  ROW_H,
  STRIP_GAP,
  STRIP_H,
  type CalloutLayout,
  type PhotoFraming,
  type PosterLayout,
  type PosterOptions,
  type PosterTheme,
} from "./poster";

/** The credit line. Quiet by design — a signature, not a watermark. */
export const CREDIT = "GENERATED WITH PAINTDEX.APP";

const STRIP_RADIUS = 6;
const LEADER_STUB = 18;
const ANCHOR_RADIUS = 7;
const DOT_RADIUS = 5;
const DOT_TEXT_GAP = 22;

/** The photo bitmap plus how it is framed, in logical poster pixels. */
export interface PosterPhoto extends PhotoFraming {
  image: CanvasImageSource;
}

export interface DrawPosterArgs {
  layout: PosterLayout;
  options: PosterOptions;
  photo: PosterPhoto | null;
  /**
   * Resolved font family for `ctx.font`. Canvas cannot read a CSS custom
   * property, so the caller must pass the real (hashed) family that `next/font`
   * generated — see `resolveFontFamily` in the studio.
   */
  fontFamily: string;
  /** Logical → device pixel factor. 2 for export, devicePixelRatio for preview. */
  scale: number;
  /** Optional id to draw with an emphasised anchor ring (editor hover state). */
  highlight?: number | null;
}

type Ctx = CanvasRenderingContext2D;

const rgba = (rgb: string, a: number) => `rgba(${rgb},${a})`;

/** Fit `text` into `max` px, appending an ellipsis if it has to be cut. */
function ellipsize(ctx: Ctx, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, mid).trimEnd()}…`).width <= max) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo).trimEnd()}…`;
}

function setShadow(ctx: Ctx, colour: string | null) {
  ctx.shadowColor = colour ?? "transparent";
  ctx.shadowBlur = colour ? 14 : 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = colour ? 1 : 0;
}

/**
 * The photo, scaled to cover the poster then nudged by the user's pan/zoom.
 * Cover (not contain) because a miniature photo's background is part of the
 * look — letterboxing it would read as a mistake. The rect comes from the same
 * `photoRect` the anchor projection uses, so rings can't drift off the model.
 */
function drawPhoto(ctx: Ctx, photo: PosterPhoto, w: number, h: number) {
  const { dx, dy, dw, dh } = photoRect(photo, w, h);
  ctx.drawImage(photo.image, dx, dy, dw, dh);
}

/**
 * Four edge gradients that darken (or lighten) the gutters and bands where text
 * sits, without touching the centred model. Without these a pale photo makes the
 * callouts unreadable.
 */
function drawScrims(ctx: Ctx, theme: PosterTheme, w: number, h: number) {
  const bands: Array<[number, number, number, number, number]> = [
    // x0, y0, x1, y1, alpha
    [0, 0, 0, h * 0.22, 0.55],
    [0, h, 0, h * 0.82, 0.45],
    [0, 0, w * 0.34, 0, 0.5],
    [w, 0, w * 0.66, 0, 0.5],
  ];
  for (const [x0, y0, x1, y1, alpha] of bands) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, rgba(theme.scrim, alpha));
    g.addColorStop(1, rgba(theme.scrim, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

/**
 * The element's ramp, rotated 90° from the app's vertical bar so it reads
 * left→right (base→highlight) in the same direction as the paint list beneath
 * it. Always banded — hard steps at each segment boundary — matching
 * `rampGradient(segs, false)`.
 */
export function drawRampStrip(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  segs: Seg[],
  overlays: Overlay[],
  theme: PosterTheme,
) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, STRIP_RADIUS);
  ctx.clip();

  if (segs.length === 1) {
    ctx.fillStyle = segs[0].paint.hex;
  } else if (segs.length > 1) {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    for (const s of segs) {
      g.addColorStop(s.start, s.paint.hex);
      g.addColorStop(s.end, s.paint.hex);
    }
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = rgba(theme.scrim, 0.25);
  }
  ctx.fillRect(x, y, w, h);

  for (const ov of overlays) {
    const meta = roleOf(ov.paint);
    const cx = x + overlayCenter(ov, segs) * w;
    // Keep the band clear of the rounded ends — an overlay applied last pins to
    // the very end of the ramp, where the corner radius would eat it.
    const lo = x + STRIP_RADIUS;
    const hi = x + w - STRIP_RADIUS - OVERLAY_W;
    const bx = Math.max(lo, Math.min(hi, cx - OVERLAY_W / 2));

    ctx.globalAlpha = meta.opacity ?? 1;
    ctx.globalCompositeOperation = meta.blendMode === "normal" ? "source-over" : "multiply";
    ctx.fillStyle = ov.paint.hex;
    ctx.fillRect(bx, y, OVERLAY_W, h);

    // Hairline either side, at full opacity in normal blending, so a dark wash
    // over a dark ramp is still legible as a distinct band.
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = theme.overlayEdge;
    ctx.fillRect(bx, y, 1, h);
    ctx.fillRect(bx + OVERLAY_W - 1, y, 1, h);
  }
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, STRIP_RADIUS - 0.5);
  ctx.strokeStyle = theme.stripRing;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/**
 * Elbow from the callout's inner edge out to a ring on the model. Stroked twice
 * — a wide shadow pass then the line itself — so it stays visible over both the
 * dark background and a bright highlight on the miniature.
 */
function drawLeader(ctx: Ctx, callout: CalloutLayout, theme: PosterTheme, emphasised: boolean) {
  const { origin, anchor } = callout;
  const dir = anchor.x < origin.x ? -1 : 1;
  const path = new Path2D();
  path.moveTo(origin.x, origin.y);
  // The stub only exists to give the line a deliberate right-angled start. Skip
  // it when the anchor is nearer than the stub itself, or it would overshoot and
  // kink back on itself.
  if (Math.abs(anchor.x - origin.x) > LEADER_STUB * 1.5) {
    path.lineTo(origin.x + dir * LEADER_STUB, origin.y);
  }
  path.lineTo(anchor.x, anchor.y);

  const ring = new Path2D();
  ring.arc(anchor.x, anchor.y, ANCHOR_RADIUS, 0, Math.PI * 2);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = theme.leaderShadow;
  ctx.lineWidth = 3.5;
  ctx.stroke(path);
  ctx.stroke(ring);

  ctx.strokeStyle = theme.leader;
  ctx.lineWidth = emphasised ? 2.5 : 1.5;
  ctx.stroke(path);
  ctx.stroke(ring);
  ctx.restore();
}

function drawCallout(
  ctx: Ctx,
  callout: CalloutLayout,
  theme: PosterTheme,
  options: PosterOptions,
  ff: string,
) {
  const { x, y } = callout;
  setShadow(ctx, theme.textShadow);

  // Element name.
  ctx.font = `600 22px ${ff}`;
  ctx.letterSpacing = "0.09em";
  ctx.fillStyle = theme.name;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(ellipsize(ctx, callout.name.toUpperCase(), COLUMN_W), x, y + NAME_H / 2);
  ctx.letterSpacing = "0px";

  const stripY = y + NAME_H + NAME_GAP;
  drawRampStrip(ctx, x, stripY, COLUMN_W, STRIP_H, callout.segs, callout.overlays, theme);
  setShadow(ctx, theme.textShadow);

  let rowY = stripY + STRIP_H + STRIP_GAP + ROW_H / 2;
  for (const paint of callout.paints) {
    drawPaintRow(ctx, paint, x, rowY, theme, options, ff);
    rowY += ROW_H;
  }
  if (callout.hiddenCount > 0) {
    ctx.font = `500 16px ${ff}`;
    ctx.fillStyle = theme.roleText;
    ctx.fillText(`+${callout.hiddenCount} more`, x + DOT_TEXT_GAP, rowY);
  }

  setShadow(ctx, null);
}

function drawPaintRow(
  ctx: Ctx,
  paint: SchemePaint,
  x: number,
  cy: number,
  theme: PosterTheme,
  options: PosterOptions,
  ff: string,
) {
  ctx.beginPath();
  ctx.arc(x + DOT_RADIUS + 1, cy, DOT_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = paint.hex;
  ctx.fill();
  // Without a ring a near-black paint (Nuln Oil, Abaddon Black) is an invisible
  // dot on the dark scrim — the row reads as though it had no swatch at all.
  ctx.strokeStyle = theme.dotRing;
  ctx.lineWidth = 1;
  ctx.stroke();

  const textX = x + DOT_TEXT_GAP;
  let available = COLUMN_W - DOT_TEXT_GAP;

  let role = "";
  let roleW = 0;
  if (options.showRoles) {
    ctx.font = `600 12px ${ff}`;
    ctx.letterSpacing = "0.1em";
    role = roleOf(paint).label.toUpperCase();
    roleW = ctx.measureText(role).width;
    ctx.letterSpacing = "0px";
    available -= roleW + 8;
  }

  ctx.font = `400 18px ${ff}`;
  ctx.fillStyle = theme.paintText;
  const name = ellipsize(ctx, paint.name, available);
  // Measure while the name's own font is still selected — measuring after the
  // switch to the 12px role font returns a much shorter width and the role label
  // lands on top of the name.
  const nameW = ctx.measureText(name).width;
  ctx.fillText(name, textX, cy);

  if (role) {
    ctx.font = `600 12px ${ff}`;
    ctx.letterSpacing = "0.1em";
    ctx.fillStyle = theme.roleText;
    ctx.fillText(role, textX + nameW + 8, cy + 1);
    ctx.letterSpacing = "0px";
  }
}

/** Top rule + optional `@handle`, and the credit line at the foot. */
function drawChrome(ctx: Ctx, options: PosterOptions, theme: PosterTheme, ff: string, w: number, h: number) {
  setShadow(ctx, theme.textShadow);
  ctx.textBaseline = "middle";

  const ruleY = MARGIN + 22;
  let ruleEnd = w - MARGIN;

  const handle = options.handle.trim().replace(/^@+/, "");
  if (handle) {
    ctx.font = `500 26px ${ff}`;
    ctx.fillStyle = theme.handleText;
    ctx.textAlign = "right";
    const text = `@${handle}`;
    ctx.fillText(text, w - MARGIN, ruleY);
    ruleEnd = w - MARGIN - ctx.measureText(text).width - 24;
  }

  if (ruleEnd > MARGIN + 40) {
    ctx.beginPath();
    ctx.moveTo(MARGIN, ruleY);
    ctx.lineTo(ruleEnd, ruleY);
    ctx.strokeStyle = theme.rule;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.font = `500 17px ${ff}`;
  ctx.letterSpacing = "0.22em";
  ctx.fillStyle = theme.creditText;
  ctx.textAlign = "center";
  // Nudged right by half the tracking so the trailing letter-space doesn't
  // visually offset the centred line.
  ctx.fillText(CREDIT, w / 2 + 2, h - FOOTER_H / 2);
  ctx.letterSpacing = "0px";

  ctx.textAlign = "left";
  setShadow(ctx, null);
}

/**
 * Paint a complete poster into `ctx`. The canvas must already be sized
 * `layout.width * scale` × `layout.height * scale`; everything below works in
 * logical units.
 */
export function drawPoster(ctx: Ctx, args: DrawPosterArgs) {
  const { layout, options, photo, fontFamily: ff, scale, highlight } = args;
  const theme = POSTER_THEMES[options.theme];
  const { width: w, height: h } = layout;

  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, w, h);
  if (photo) drawPhoto(ctx, photo, w, h);
  drawScrims(ctx, theme, w, h);

  // Leaders first so the callout blocks sit cleanly on top of the line ends.
  for (const c of layout.callouts) drawLeader(ctx, c, theme, highlight === c.elementIndex);
  for (const c of layout.callouts) drawCallout(ctx, c, theme, options, ff);

  drawChrome(ctx, options, theme, ff, w, h);
  ctx.restore();
}

/**
 * The real font family to hand to `ctx.font`.
 *
 * `next/font` exposes Geist as a CSS custom property holding a *hashed* family
 * name (`__Geist_1a2b3c, ...`). Canvas can't resolve custom properties, so a
 * naive `ctx.font = "22px var(--font-geist-sans)"` silently falls back to the
 * platform sans and the exported PNG looks nothing like the preview. Read the
 * computed value instead, and always `await document.fonts.ready` before the
 * first draw *and* before export.
 */
export function resolveFontFamily(): string {
  if (typeof window === "undefined") return "sans-serif";
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-geist-sans")
    .trim();
  return v ? `${v}, sans-serif` : "sans-serif";
}
