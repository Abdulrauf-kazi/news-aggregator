import { NextResponse } from 'next/server';
import { cleanArticleElement, extractFallbackArticle, type CleanedArticle } from '../../../lib/article-cleanup';

/** Below this much body text the page is treated as a teaser, not the full article. */
const FULL_TEXT_MIN_CHARS = 600;
const MAX_HTML_BYTES = 5_000_000;

type ArticleStatus = 'ok' | 'short' | 'empty' | 'not-html' | 'too-large' | 'error';

const failure = (targetUrl: string, status: ArticleStatus, error: string) =>
  NextResponse.json({
    status,
    text: '',
    html: '',
    textLength: 0,
    imageUrl: '',
    siteName: '',
    author: '',
    publishedDate: '',
    readingTime: 0,
    finalUrl: targetUrl,
    error,
  });

export async function GET(request: Request) {
  const { JSDOM } = await import('jsdom');
  const { Readability } = await import('@mozilla/readability');

  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return failure(targetUrl, 'error', `HTTP ${response.status}`);
    }

    // Images, PDFs and JSON APIs used to be parsed as HTML and shown as garbage.
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return failure(targetUrl, 'not-html', `Not an article page (${contentType.split(';')[0]})`);
    }
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_HTML_BYTES) {
      return failure(targetUrl, 'too-large', 'Page too large to extract');
    }

    const finalUrl = response.url || targetUrl;
    const html = (await response.text()).slice(0, MAX_HTML_BYTES);

    const dom = new JSDOM(html, { url: finalUrl });
    const doc = dom.window.document;

    const metaTags = doc.getElementsByTagName('meta');
    let imageUrl = '';
    let siteName = '';
    let description = '';
    let author = '';
    let publishedDate = '';

    for (let i = 0; i < metaTags.length; i++) {
      const tag = metaTags[i];
      if (!tag) continue;
      const property = tag.getAttribute('property') || '';
      const name = tag.getAttribute('name') || '';
      const content = tag.getAttribute('content') || '';

      if ((property === 'og:image' || name === 'twitter:image') && !imageUrl) {
        imageUrl = content;
      }
      if (property === 'og:site_name' && !siteName) {
        siteName = content;
      }
      if ((property === 'og:description' || name === 'description') && !description) {
        description = content;
      }
      if ((name === 'author' || property === 'article:author') && !author) {
        author = content;
      }
      if ((property === 'article:published_time' || name === 'publish_date' || name === 'date') && !publishedDate) {
        publishedDate = content;
      }
    }

    if (!author) {
      const ldScripts = doc.querySelectorAll('script[type="application/ld+json"]');
      for (const script of ldScripts) {
        try {
          const ld = JSON.parse(script.textContent || '');
          if (ld.author) {
            author = typeof ld.author === 'string'
              ? ld.author
              : (ld.author.name || (Array.isArray(ld.author) ? ld.author[0]?.name : ''));
          }
          if (ld.datePublished && !publishedDate) {
            publishedDate = ld.datePublished;
          }
        } catch {
          // ignore JSON parse errors
        }
      }
    }
    // An author URL ("https://…/people/x") is not a byline.
    if (/^https?:\/\//i.test(author)) author = '';

    // 1. Readability finds the article container; 2. the cleaner strips the
    // bylines, credits, player messages, promos and repeats it leaves behind.
    // Readability mutates the document, so the fallback gets a fresh parse.
    const pageTitle = doc.title || '';
    const article = new Readability(new JSDOM(html, { url: finalUrl }).window.document).parse();
    let cleaned: CleanedArticle | null = null;
    if (article?.content) {
      const fragment = new JSDOM(`<!doctype html><body>${article.content}</body>`).window.document;
      cleaned = cleanArticleElement(fragment.body, { title: article.title || pageTitle });
    }
    // 3. Readability found nothing usable: rebuild from the page's own paragraphs.
    if (!cleaned || cleaned.textLength < 200) {
      const fallback = extractFallbackArticle(new JSDOM(html, { url: finalUrl }).window.document, {
        title: article?.title || pageTitle,
      });
      if (fallback.textLength > (cleaned?.textLength ?? 0)) cleaned = fallback;
    }

    const text = cleaned?.text ?? '';
    const textLength = cleaned?.textLength ?? 0;
    const status: ArticleStatus = textLength >= FULL_TEXT_MIN_CHARS ? 'ok' : textLength > 0 ? 'short' : 'empty';
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 238));

    return NextResponse.json({
      status,
      text,
      html: enhanceArticleHtml(cleaned?.html ?? ''),
      textLength,
      title: article?.title || pageTitle,
      byline: (article?.byline && !/^https?:\/\//i.test(article.byline) ? article.byline : '') || author,
      siteName: article?.siteName || siteName,
      imageUrl,
      author,
      publishedDate,
      readingTime,
      wordCount,
      finalUrl,
      description,
      ...(status === 'ok' ? {} : { error: status === 'empty' ? 'No article text found on the page' : 'Only a short excerpt was found on the page' }),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch article';
    console.error('Error fetching article:', message);
    return failure(targetUrl, 'error', message);
  }
}

/** Tags blockquotes for styling (images are already wrapped in figures by the cleaner). */
function enhanceArticleHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<figure>/gi, '<figure class="article-figure">')
    .replace(/<blockquote>/gi, '<blockquote class="article-blockquote">');
}
