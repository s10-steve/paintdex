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
  // browser — no origin is contacted.
  "img-src 'self' data: blob: https:",
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
