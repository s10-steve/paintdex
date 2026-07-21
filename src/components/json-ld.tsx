/**
 * Render a schema.org JSON-LD block. Server-safe (no client hooks) so it can be
 * embedded directly in server components / statically-generated pages.
 *
 * The `application/ld+json` type is a data block, not executable script, so it
 * is unaffected by the CSP `script-src` directive.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // Data is built from our own catalogue, not user input; stringify escapes it.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
