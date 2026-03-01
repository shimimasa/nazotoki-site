import { marked } from 'marked';

marked.setOptions({
  breaks: true,
  gfm: true,
});

export function renderMarkdown(md: string): string {
  if (!md) return '';
  return marked.parse(md) as string;
}
