import type { NextConfig } from "next";

/**
 * Content-Security-Policy for the site.
 *
 * The browser talks directly to Supabase and loads Google Identity Services for
 * sign-in, so those origins are allow-listed explicitly; everything else falls
 * back to `'self'`. `script-src`/`style-src` need `'unsafe-inline'` because the
 * site is statically prerendered (there is no server runtime to mint
 * per-request nonces) and uses inline `style` attributes for colour swatches —
 * the meaningful protection here is restricting *which origins* can load
 * scripts, plus locking down `object-src`, `base-uri`, and framing.
 *
 * If the Google/Supabase integrations move to different hosts, update the
 * matching directives here.
 */
/**
 * The Supabase project's origin, for `img-src`.
 *
 * Derived from the env var rather than wildcarded to `*.supabase.co`, so the
 * allow-list names one host rather than every project on the platform. It is
 * inlined at build time like the rest of the `NEXT_PUBLIC_*` vars, and is simply
 * absent when accounts aren't configured — in which case there are no remote
 * images to permit either.
 */
const supabaseImgSrc = (() => {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return url ? ` ${new URL(url).origin}` : "";
  } catch {
    return "";
  }
})();

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/client https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  // `blob:` is for the share-image studio: the photo the user picks is read via
  // `URL.createObjectURL` before being downscaled onto a canvas. It stays in the
  // browser — no origin is contacted. `data:` covers the canvas re-encode and the
  // stored photo.
  //
  // Deliberately no blanket `https:`: an <img> pointing anywhere is a GET the
  // CSP would otherwise refuse, so allowing any HTTPS origin would hand a future
  // markup-injection bug a free exfiltration channel. The Supabase project's own
  // origin is named because the public share page renders the owner's photo of
  // the model from a signed Storage URL. Keep adding *specific* origins here.
  `img-src 'self' data: blob:${supabaseImgSrc}`,
  "font-src 'self' data:",
  "frame-src https://accounts.google.com/gsi/",
  "connect-src 'self' https://accounts.google.com/gsi/ https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
