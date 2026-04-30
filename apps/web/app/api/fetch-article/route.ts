import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // Dynamic imports prevent Turbopack from resolving jsdom's internal data
  // files at build time, which would crash the static analysis phase.
  const { JSDOM } = await import('jsdom');
  const { Readability } = await import('@mozilla/readability');

  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    // Follow redirects (important for Google News RSS URLs)
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
    
    // Parse the HTML using JSDOM
    const dom = new JSDOM(html, { url: finalUrl });
    const doc = dom.window.document;
    
    // Extract metadata before Readability consumes it
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
      if ((property === 'article:published_time' || name === 'publish_date') && !publishedDate) {
        publishedDate = content;
      }
    }

    // Try to extract author from structured data
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

    // Extract reading time estimate
    const reader = new Readability(doc);
    const article = reader.parse();

    if (!article) {
      return NextResponse.json({ 
        text: description || '', 
        html: description ? `<p>${description}</p>` : '', 
        imageUrl,
        siteName,
        author,
        publishedDate,
        readingTime: 0,
        finalUrl
      });
    }
    
    // Estimate reading time (avg 238 words per minute)
    const wordCount = (article.textContent || '').split(/\s+/).filter(Boolean).length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 238));
    
    // Clean and enhance the HTML for Medium-style rendering
    const cleanHtml = enhanceArticleHtml(article.content || '');
    
    return NextResponse.json({ 
      text: article.textContent,
      html: cleanHtml,
      title: article.title,
      byline: article.byline || author,
      siteName: article.siteName || siteName,
      imageUrl,
      author,
      publishedDate,
      readingTime,
      wordCount,
      finalUrl,
      description
    });
  } catch (error) {
    console.error('Error fetching article:', error);
    return NextResponse.json({ error: 'Failed to fetch article' }, { status: 500 });
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
