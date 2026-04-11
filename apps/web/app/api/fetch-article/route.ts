import { NextResponse } from 'next/server';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const html = await response.text();
    
    // Parse the HTML using JSDOM
    const dom = new JSDOM(html, { url: targetUrl });
    
    // Extract metadata before Readability consumes it
    const metaTags = dom.window.document.getElementsByTagName('meta');
    let imageUrl = '';
    for (let i = 0; i < metaTags.length; i++) {
      const tag = metaTags[i];
      if (!tag) continue;
      const property = tag.getAttribute('property');
      const name = tag.getAttribute('name');
      if (property === 'og:image' || name === 'twitter:image') {
        imageUrl = tag.getAttribute('content') || '';
        if (imageUrl) break;
      }
    }

    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      return NextResponse.json({ text: '', html: '', imageUrl: '' });
    }
    
    // Some basic HTML cleaning for safer rendering
    const cleanHtml = article.content || '';
    
    return NextResponse.json({ 
      text: article.textContent,
      html: cleanHtml,
      title: article.title,
      byline: article.byline,
      siteName: article.siteName,
      imageUrl 
    });
  } catch (error) {
    console.error('Error fetching article:', error);
    return NextResponse.json({ error: 'Failed to fetch article' }, { status: 500 });
  }
}
