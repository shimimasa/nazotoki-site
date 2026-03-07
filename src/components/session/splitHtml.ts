/**
 * Split HTML string into sections by <hr> tags.
 * Each section is a chunk of HTML between <hr> boundaries.
 * If splitting fails or produces <= 1 section, returns the full HTML as a single-element array.
 */
export function splitHtmlByHr(html: string): string[] {
  if (!html || !html.trim()) return [];

  // Split on <hr>, <hr/>, <hr /> variants
  const parts = html.split(/<hr\s*\/?>/i).map((s) => s.trim()).filter(Boolean);

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
