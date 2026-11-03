/**
 * Post-processing for extracted article HTML.
 *
 * Readability finds the article container, but publishers leave a lot inside
 * it: bylines and "59 minutes ago" stamps, photo credits ("Getty Images"),
 * "Issued on / Modified" lines, video-player consent messages, share prompts,
 * repeated paragraphs and empty wrappers. This module removes that and returns
 * clean, consistently structured HTML plus plain-text paragraphs.
 *
 * Uses only standard DOM APIs, so it runs on a JSDOM document on the server and
 * on a DOMParser document in a browser (which is how it was tested on live pages).
 */

/** A whole paragraph that is nothing but boilerplate. */
const BOILERPLATE_EXACT = new RegExp(
  "^(?:" +
    [
      "live",
      "video",
      "video content(?: video)?",
      "advertisement",
      "advert",
      "ad",
      "sponsored(?: content)?",
      "share(?: this(?: article| story)?)?",
      "share on .{1,40}",
      "read more:?",
      "read next:?",
      "related(?: (?:topics|articles|stories|content))?:?",
      "more on this story",
      "top stories",
      "by:?",
      "[/•|\\-–—·]+",
      "image source,?.{0,80}",
      "image caption,?.{0,200}",
      "media caption,?.{0,200}",
      "getty images",
      "reuters",
      "afp",
      "ap",
      "epa(?:-efe)?",
      "pa media",
      "anadolu(?: agency)?",
      "bloomberg",
      "ani",
      "pti",
      "(?:photo|image|picture|file photo)(?: credit)?: .{0,60}",
      "copyright .{0,80}",
      "© ?.{0,80}",
      "sign up (?:for|to|now|here|today).{0,100}",
      "subscribe(?: now| today| here| to (?:our|the) .{0,40})?[.!]?",
      "(?:get our|sign up for our) .{0,40}newsletter.{0,80}",
      "follow us.{0,80}",
      "follow .{1,40} on (?:twitter|x|facebook|instagram|linkedin|telegram|whatsapp|youtube|threads|bluesky).{0,40}",
      "continue reading.{0,10}",
      "published(?: on)?:? \\d.{0,40}",
      "published on: .{0,40}",
      "issued on: .{0,160}",
      "(?:issued|published|posted|updated|modified|last updated)(?: on)?:?",
      "modified: .{0,40}",
      "updated: .{0,40}",
      "updated(?: on)? \\d.{0,40}",
      "last updated:? .{0,40}",
      "\\d+ ?(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?) ago",
      "\\d{1,2}:\\d{2}(?::\\d{2})?",
      "listen to (?:this|the) (?:article|story).{0,40}",
      "(?:watch|listen)(?: (?:video|now|live|here))?: .{0,80}",
      "(?:watch|play) (?:video|now|live)",
      "skip (?:to|advert|ad).{0,40}",
      "loading\\.{0,3}",
      "this article (?:was|is) .{0,30}(?:updated|corrected).{0,60}",
      "list(?: \\d+)? of \\d+(?: items?)?",
      "end of list",
    ].join("|") +
    ")$",
  "i",
);

/** Phrases that only appear in player, consent or blocked-content messages. */
const BOILERPLATE_CONTAINS =
  /(enable advertisement tracking|browser extensions? seems? to be blocking|javascript (?:is )?(?:disabled|required)|(?:video|content) (?:is )?(?:not available|cannot be (?:played|displayed))|accept (?:all )?cookies|cookie (?:settings|policy|preferences)|your browser does not support|to display this content from)/i;

const BYLINE_SELECTORS = [
  '[data-testid*="byline"]',
  '[data-component*="byline"]',
  '[class*="byline"]',
  '[class*="Byline"]',
  '[rel="author"]',
  '[itemprop="author"]',
  '[class*="article-meta"]',
  '[class*="publish-date"]',
  '[class*="timestamp"]',
  "time",
].join(",");

const JUNK_SELECTORS =
  "script, style, noscript, iframe, object, embed, form, button, input, select, textarea, svg, canvas, nav, aside, footer, template, [hidden]";

const TEXT_BLOCKS = "p, li, h2, h3, h4, h5, h6, blockquote, figcaption, dt, dd";
const KEEP_ATTRIBUTES = new Set(["href", "src", "srcset", "sizes", "alt", "title", "colspan", "rowspan"]);
const MEDIA = "img, picture, video";

export const normalizeText = (value: string | null | undefined) =>
  (value ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();

const comparable = (value: string) => normalizeText(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

export const isBoilerplate = (text: string) => {
  const t = normalizeText(text);
  if (!t) return true;
  if (t.length <= 220 && BOILERPLATE_EXACT.test(t)) return true;
  return t.length < 500 && BOILERPLATE_CONTAINS.test(t);
};

const RELATED_HEADING =
  /^(?:recommended|related|more|most read|most popular|popular|trending|latest|also read|read also|see also|you may (?:also )?like|more (?:from|on|in) .{1,40}|editor'?s picks)(?: (?:stories|articles|news|content|videos|reads|links|topics))?:?$/i;

/** True when every bit of the element's text sits inside links. */
const isLinkOnly = (el: Element) => {
  const text = comparable(el.textContent ?? "");
  if (!text) return false;
  const linked = comparable(Array.from(el.querySelectorAll("a")).map((a) => a.textContent ?? "").join(" "));
  return linked.length > 0 && linked === text;
};

export type CleanedArticle = {
  html: string;
  text: string;
  textLength: number;
  paragraphs: number;
};

/**
 * Cleans the element in place and returns its HTML and text.
 * `title` lets a repeated headline at the top of the body be dropped.
 */
export function cleanArticleElement(root: Element, options: { title?: string } = {}): CleanedArticle {
  root.querySelectorAll(JUNK_SELECTORS).forEach((el) => el.remove());

  // Bylines and timestamps are shown separately in the page header.
  root.querySelectorAll(BYLINE_SELECTORS).forEach((el) => {
    if (normalizeText(el.textContent).length < 200) el.remove();
  });

  // The page renders its own <h1>; drop any headline that repeats it.
  const title = comparable(options.title ?? "");
  root.querySelectorAll("h1").forEach((el) => el.remove());
  root.querySelectorAll("h2, h3").forEach((el) => {
    if (title && comparable(el.textContent ?? "") === title) el.remove();
  });

  // "Recommended stories" / "Related" blocks: drop the heading and the link list.
  root.querySelectorAll("h2, h3, h4, h5, strong").forEach((heading) => {
    if (!heading.isConnected || !RELATED_HEADING.test(normalizeText(heading.textContent))) return;
    const box = heading.parentElement;
    const boxHasProse =
      !!box && Array.from(box.querySelectorAll("p")).some((p) => normalizeText(p.textContent).length > 80 && !isLinkOnly(p));
    if (box && box !== root && !boxHasProse && normalizeText(box.textContent).length < 1200 && box.querySelector("a")) {
      box.remove();
      return;
    }
    let next = heading.nextElementSibling;
    while (next && /^(UL|OL)$/.test(next.tagName)) {
      const after = next.nextElementSibling;
      next.remove();
      next = after;
    }
    heading.remove();
  });
  // Lists made only of links are related-article lists, not article content.
  root.querySelectorAll("ul, ol").forEach((list) => {
    const items = Array.from(list.querySelectorAll("li"));
    if (items.length > 0 && items.every((li) => isLinkOnly(li))) list.remove();
  });

  // Text blocks: drop boilerplate and exact repeats (keep the first occurrence).
  const seen = new Set<string>();
  root.querySelectorAll(TEXT_BLOCKS).forEach((el) => {
    if (!el.isConnected) return;
    const hasMedia = !!el.querySelector(MEDIA);
    const text = normalizeText(el.textContent);
    if (!text) {
      if (!hasMedia) el.remove();
      return;
    }
    if (isBoilerplate(text)) {
      if (hasMedia) {
        // keep the image, drop the credit text around it
        Array.from(el.childNodes).forEach((node) => {
          if (node.nodeType === 3 || (node.nodeType === 1 && !(node as Element).querySelector(MEDIA) && !(node as Element).matches(MEDIA))) {
            node.parentNode?.removeChild(node);
          }
        });
      } else {
        el.remove();
      }
      return;
    }
    // A short paragraph that is entirely a link is a promo for another article.
    if (el.tagName === "P" && text.length < 220 && !hasMedia && isLinkOnly(el)) {
      el.remove();
      return;
    }
    const key = comparable(text);
    // Only dedupe real sentences; short repeated labels are handled above.
    if (key.length > 20) {
      if (seen.has(key)) {
        el.remove();
        return;
      }
      seen.add(key);
    }
  });

  // Images: drop placeholders, keep real ones responsive and lazy.
  root.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    const srcset = img.getAttribute("srcset") ?? "";
    const placeholder = !src || (src.startsWith("data:") && src.length < 300) || /grey-placeholder|spacer|blank\.gif|pixel\./i.test(src);
    if (placeholder && !srcset) {
      img.remove();
      return;
    }
    img.setAttribute("loading", "lazy");
  });

  // Strip presentation attributes so the page's own styles apply consistently.
  root.querySelectorAll("*").forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      if (!KEEP_ATTRIBUTES.has(attr.name.toLowerCase())) el.removeAttribute(attr.name);
    });
    if (el.tagName === "A") {
      const href = el.getAttribute("href") ?? "";
      if (!/^https?:\/\//i.test(href)) el.removeAttribute("href");
      else {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      }
    }
  });

  // Remove wrappers left empty by the steps above (deepest first).
  Array.from(root.querySelectorAll("*"))
    .reverse()
    .forEach((el) => {
      if (el.matches(`${MEDIA}, br, hr, source`)) return;
      if (!normalizeText(el.textContent) && !el.querySelector(MEDIA)) el.remove();
    });

  // A figure that lost its image is just a stray caption.
  root.querySelectorAll("figure").forEach((figure) => {
    if (!figure.querySelector(MEDIA)) figure.remove();
  });
  // Every image sits in a figure so the page styles it one way.
  root.querySelectorAll("img").forEach((img) => {
    if (img.closest("figure")) return;
    const target = img.closest("picture") ?? img;
    const figure = root.ownerDocument.createElement("figure");
    target.parentNode?.insertBefore(figure, target);
    figure.appendChild(target);
  });

  const blocks = Array.from(root.querySelectorAll("p, li, h2, h3, h4, blockquote"))
    .filter((el) => !el.parentElement?.closest("p, li, blockquote"))
    .map((el) => normalizeText(el.textContent))
    .filter(Boolean);
  const text = (blocks.length > 0 ? blocks : [normalizeText(root.textContent)]).join("\n\n");

  return {
    html: root.innerHTML.trim(),
    text,
    textLength: text.length,
    paragraphs: blocks.length,
  };
}

const CONTENT_SELECTORS = [
  "article",
  '[itemprop="articleBody"]',
  '[role="main"]',
  ".article-body",
  ".article-content",
  ".article__body",
  ".story-body",
  ".post-content",
  ".entry-content",
  ".content-body",
  "#articleBody",
  "main",
];

/**
 * Used when Readability finds nothing: take the likeliest content container and
 * rebuild it from its leaf text blocks only (no nested divs, so no repeats).
 */
export function extractFallbackArticle(doc: Document, options: { title?: string } = {}): CleanedArticle {
  doc.querySelectorAll(JUNK_SELECTORS).forEach((el) => el.remove());
  doc.querySelectorAll("header").forEach((el) => el.remove());

  let container: Element | null = null;
  for (const selector of CONTENT_SELECTORS) {
    const candidate = Array.from(doc.querySelectorAll(selector)).sort(
      (a, b) => normalizeText(b.textContent).length - normalizeText(a.textContent).length,
    )[0];
    if (candidate && normalizeText(candidate.textContent).length > 200) {
      container = candidate;
      break;
    }
  }
  container ??= doc.body;

  const out = doc.createElement("div");
  let list: Element | null = null;
  const blocks = Array.from(container?.querySelectorAll("p, h2, h3, h4, li, blockquote") ?? []).filter(
    (el) => !el.querySelector("p, h2, h3, h4, li, blockquote"),
  );
  for (const block of blocks) {
    const text = normalizeText(block.textContent);
    const tag = block.tagName.toLowerCase();
    // Short list items in a content area are usually menus, tags or share links.
    if (!text || (tag === "li" && text.length < 40) || (tag === "p" && text.length < 25)) continue;
    if (tag === "li") {
      if (!list) {
        list = doc.createElement("ul");
        out.appendChild(list);
      }
      const item = doc.createElement("li");
      item.textContent = text;
      list.appendChild(item);
      continue;
    }
    list = null;
    const el = doc.createElement(tag === "blockquote" ? "blockquote" : tag);
    el.textContent = text;
    out.appendChild(el);
  }
  return cleanArticleElement(out, options);
}
