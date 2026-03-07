/**
 * Split HTML string into sections by structural boundaries.
 * Split points: <hr>, <h3>, <h4>, <table>, <blockquote>
 * <hr> is removed; other elements are kept as the start of their section.
 * If splitting produces <= 1 section, returns the full HTML as a single-element array.
 */
export function splitHtml(html: string): string[] {
  if (!html || !html.trim()) return [];

  const SENTINEL = '\x00SPLIT\x00';

  const marked = html
    // Replace <hr> variants with sentinel (hr itself is removed)
    .replace(/<hr\s*\/?>/gi, SENTINEL)
    // Insert sentinel before block-level elements (element is kept in next section)
    .replace(/(?=<(?:h[34]|table|blockquote)[\s>])/gi, SENTINEL);

  const parts = marked.split(SENTINEL).map((s) => s.trim()).filter(Boolean);

  if (parts.length <= 1) return [html];
  return parts;
}

/**
 * Extract a heading label from an HTML section for use as a "next" button hint.
 * Looks for the first <h2>, <h3>, or <h4> and returns its text content.
 */
export function extractHeading(sectionHtml: string): string | null {
  const match = sectionHtml.match(/<h[2-4][^>]*>(.*?)<\/h[2-4]>/i);
  if (!match) return null;
  // Strip HTML tags from the heading to get plain text
  return match[1].replace(/<[^>]+>/g, '').trim() || null;
}
