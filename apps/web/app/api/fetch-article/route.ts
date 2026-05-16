import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

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
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const finalUrl = response.url || targetUrl;
    const html = await response.text();
    
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

    // STRATEGY 1: Mozilla Readability (best for clean article extraction)
    const reader = new Readability(doc);
    const article = reader.parse();

    // STRATEGY 2: Cheerio fallback for structured content extraction
    let cheerioContent = '';
    let cheerioTitle = '';
    if (!article) {
      const $ = cheerio.load(html);
      
      // Remove non-content elements
      $('script, style, nav, header, footer, iframe, noscript, .ad, .ads, .advertisement, .sidebar, .comments, .related, .newsletter, .subscription, .cookie-banner, .popup, .modal').remove();
      
      // Try to find main content area
      const contentSelectors = [
        'article',
        '[role="main"]',
        '.article-body',
        '.article-content',
        '.post-content',
        '.entry-content',
        '.story-body',
        '.content-body',
        '.article-text',
        '.article__body',
        '.post-body',
        '.content__body',
        '#articleBody',
        '.main-content',
        '.content',
        'main',
        '.post',
        '.story',
        '.news-item',
      ];
      
      let $content: cheerio.Cheerio<any> | null = null;
      for (const selector of contentSelectors) {
        const $el = $(selector).first();
        if ($el.length > 0 && $el.text().trim().length > 200) {
          $content = $el;
          break;
        }
      }
      
      // Fallback: use body if no specific content area found
      if (!$content) {
        $content = $('body');
      }
      
      // Extract paragraphs with minimum length
      const paragraphs: string[] = [];
      $content.find('p, div, li, td, h2, h3').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 50 && !paragraphs.includes(text)) {
          paragraphs.push(text);
        }
      });
      
      if (paragraphs.length > 0) {
        cheerioContent = paragraphs.map(p => `<p>${p}</p>`).join('\n');
      }
      
      // Extract title if Readability failed
      cheerioTitle = $('h1').first().text().trim() || $('title').text().trim();
    }

    // STRATEGY 3: Extract all meaningful text as last resort
    let fallbackText = '';
    if (!article && !cheerioContent) {
      const textNodes = doc.querySelectorAll('p, div, span, li, td, h2, h3');
      const textParts: string[] = [];
      for (const node of Array.from(textNodes)) {
        const text = node.textContent?.trim();
        if (text && text.length > 80 && text.length < 2000) {
          textParts.push(text);
        }
      }
      // Deduplicate and take top chunks
      const unique = Array.from(new Set(textParts)).slice(0, 20);
      fallbackText = unique.map(t => `<p>${t}</p>`).join('\n');
    }

    // STRATEGY 4: If still no content, use description or page title as content
    if (!article && !cheerioContent && !fallbackText) {
      if (description) {
        fallbackText = `<p>${description}</p>`;
      } else {
        const pageTitle = doc.title || '';
        if (pageTitle) {
          fallbackText = `<p>${pageTitle}</p><p>Content from ${finalUrl}</p>`;
        }
      }
    }

    const finalHtml = article?.content || cheerioContent || fallbackText;
    const finalTitle = article?.title || cheerioTitle || doc.title || '';
    const finalText = article?.textContent || '';
    
    const wordCount = finalText.split(/\s+/).filter(Boolean).length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 238));
    
    const cleanHtml = enhanceArticleHtml(finalHtml);
    
    return NextResponse.json({ 
      text: finalText,
      html: cleanHtml,
      title: finalTitle,
      byline: article?.byline || author,
      siteName: article?.siteName || siteName,
      imageUrl,
      author,
      publishedDate,
      readingTime,
      wordCount,
      finalUrl,
      description
    });
  } catch (error: any) {
    console.error('Error fetching article:', error?.message || error);
    return NextResponse.json({ 
      text: '', 
      html: '', 
      imageUrl: '',
      siteName: '',
      author: '',
      publishedDate: '',
      readingTime: 0,
      finalUrl: targetUrl,
      error: error?.message || 'Failed to fetch article'
    });
  }
}

/**
 * Enhance the raw Readability HTML for better Medium-like rendering.
 * Strips empty elements, adds figure captions, etc.
 */
function enhanceArticleHtml(html: string): string {
  // Remove empty paragraphs
  let enhanced = html.replace(/<p>\s*<\/p>/gi, '');
  
  // Wrap standalone images in figure tags if not already
  enhanced = enhanced.replace(
    /<img([^>]+)(?:\/>|>)(?!\s*<\/figure>)/gi, 
    '<figure class="article-figure"><img$1 loading="lazy" /></figure>'
  );
  
  // Don't double-wrap figures
  enhanced = enhanced.replace(
    /<figure[^>]*>\s*<figure[^>]*>/gi,
    '<figure class="article-figure">'
  );
  enhanced = enhanced.replace(
    /<\/figure>\s*<\/figure>/gi,
    '</figure>'
  );
  
  // Add class to blockquotes for styling
  enhanced = enhanced.replace(
    /<blockquote>/gi,
    '<blockquote class="article-blockquote">'
  );
  
  return enhanced;
}
