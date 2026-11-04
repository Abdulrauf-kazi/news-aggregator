/**
 * Turns feed HTML (RSS <description>, <content:encoded>, API summaries) into
 * plain-text paragraphs separated by a blank line, which is how story.content is
 * stored and rendered. Previously every tag was stripped with no separator, so
 * multi-paragraph descriptions became one block and entities like &#8217; or
 * &nbsp; were left in the text.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  hellip: "…",
  middot: "·",
  bull: "•",
  laquo: "«",
  raquo: "»",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  times: "×",
  eacute: "é",
  egrave: "è",
  aacute: "á",
  agrave: "à",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  ntilde: "ñ",
  ccedil: "ç",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  szlig: "ß",
};

export const decodeEntities = (value: string) =>
  value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const point = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point < 0x110000 ? String.fromCodePoint(point) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });

/** Trailing feed boilerplate, e.g. Guardian's "Continue reading..." or WordPress's "The post X appeared first on Y." */
const TRAILERS = [
  /\s*continue reading\s*(?:\.{3}|…)?\s*$/i,
  /\s*read more\s*(?:\.{3}|…|»|›)?\s*$/i,
  /\s*the post .{1,300} appeared first on .{1,120}\.?\s*$/i,
  /\s*\[(?:…|\.\.\.)\]\s*$/,
];

export const htmlToParagraphs = (value?: string | null, maxChars = 20_000): string => {
  if (!value) return "";
  let text = value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<(script|style|iframe|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // block boundaries become paragraph breaks
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr|section|article|figure|figcaption|ul|ol|table)>/gi, "\n\n")
    .replace(/<(p|div|li|h[1-6]|blockquote|tr|section|article|figure|ul|ol|table)(\s[^>]*)?>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");
  text = decodeEntities(decodeEntities(text)); // feeds often double-encode (&amp;#8217;)

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/[ \t \r\n]+/g, " ").trim())
    .filter(Boolean);
  if (paragraphs.length > 0) {
    let last = paragraphs[paragraphs.length - 1] as string;
    for (const pattern of TRAILERS) last = last.replace(pattern, "");
    last = last.trim();
    if (last) paragraphs[paragraphs.length - 1] = last;
    else paragraphs.pop();
  }
  const joined = paragraphs.join("\n\n");
  if (joined.length <= maxChars) return joined;
  const cut = joined.slice(0, maxChars);
  return `${cut.slice(0, Math.max(cut.lastIndexOf("\n\n"), cut.lastIndexOf(". ") + 1, maxChars * 0.8)).trim()}…`;
};

/** Longest non-empty text among several candidate HTML/text fields. */
export const bestText = (...candidates: Array<string | null | undefined>) =>
  candidates
    .map((candidate) => htmlToParagraphs(candidate))
    .reduce((best, current) => (current.length > best.length ? current : best), "");

/** Rewraps hard-wrapped plain text (NWS alerts wrap at ~70 columns) into paragraphs. */
export const unwrapParagraphs = (value?: string | null) =>
  (value ?? "")
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
