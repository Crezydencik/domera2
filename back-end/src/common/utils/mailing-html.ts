const ALLOWED_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 'p', 'div', 'br', 'ul', 'ol', 'li', 'a']);
const VOID_TAGS = new Set(['br']);
const MAX_INPUT = 20_000;

const escapeText = (value: string) =>
  value.replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Allow-list HTML sanitizer for information mailings.
 *
 * Output contains ONLY tags rebuilt from the allow-list plus escaped text. The previous
 * regex-strip version left everything that did not look like a complete tag untouched, so an
 * unclosed `<img src=x onerror=...` survived and was closed by the e-mail template's next `>`.
 * Unbalanced allowed tags are closed at the end so the fragment cannot break the template.
 */
export function sanitizeMailingHtml(value?: string): string | undefined {
  if (!value) return undefined;
  const input = value.slice(0, MAX_INPUT);
  const tokenPattern = /<(\/)?([a-zA-Z][a-zA-Z0-9]*)\b([^<>]*)>/g;
  const open: string[] = [];
  let output = '';
  let cursor = 0;

  for (let match = tokenPattern.exec(input); match; match = tokenPattern.exec(input)) {
    output += escapeText(input.slice(cursor, match.index));
    cursor = match.index + match[0].length;

    const closing = Boolean(match[1]);
    const name = match[2]!.toLowerCase();
    const attributes = match[3] ?? '';
    if (!ALLOWED_TAGS.has(name)) continue;

    if (closing) {
      const index = open.lastIndexOf(name);
      if (index === -1) continue;
      while (open.length > index) output += `</${open.pop()}>`;
      continue;
    }

    if (VOID_TAGS.has(name)) {
      output += `<${name}>`;
      continue;
    }

    if (name === 'a') {
      const href = /href\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1] ?? '';
      output += /^https?:\/\//i.test(href)
        ? `<a href="${escapeText(href)}" style="color:#2563eb;text-decoration:underline;text-underline-offset:2px;">`
        : '<a>';
    } else {
      const align = /text-align\s*:\s*(left|center|right|justify)/i.exec(attributes)?.[1];
      output += align && (name === 'p' || name === 'div') ? `<${name} style="text-align:${align.toLowerCase()}">` : `<${name}>`;
    }
    open.push(name);
  }

  output += escapeText(input.slice(cursor));
  while (open.length) output += `</${open.pop()}>`;
  return output;
}
