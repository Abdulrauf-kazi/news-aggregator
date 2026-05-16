# Active Context

## Current Focus
- Fixed the root cause of empty article content: implemented multi-strategy article extraction with Cheerio fallback.

## Recent Changes
- **Multi-strategy article extraction**: The fetch-article API now uses three extraction strategies:
  1. Mozilla Readability (primary - best for clean article extraction)
  2. Cheerio structured content extraction (fallback - searches for article body, post-content, entry-content, etc.)
  3. Raw text extraction (last resort - extracts meaningful text paragraphs from the page)
- **Enhanced content detection**: Increased timeout to 15s, added more meta tag patterns for date/author extraction
- **Frontend fallback chain**: live-home.tsx now shows content in order: article.html → article.text → story.content → article.description → metadata card
- **NewsModal improved**: Better fallback display when article content is unavailable

## Next Steps
- Monitor extraction success rates across different news sources
- Consider adding article content caching to Redis to avoid re-fetching
- Test with various paywalled/anti-bot protected sites