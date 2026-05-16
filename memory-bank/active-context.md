# Active Context

## Current Focus
- Fixed article content display by implementing multi-layer fallback system for content extraction and data ingestion.

## Recent Changes
- **Multi-strategy article extraction**: fetch-article API uses three strategies: Readability → Cheerio structured extraction → raw DOM text → description/title fallback
- **Enhanced fallback stories**: Placeholder stories now contain realistic content snippets instead of empty placeholders
- **Google News RSS fallback**: When primary RSS/API sources fail, system automatically tries Google News RSS search for that source
- **Frontend fallback chain**: live-home.tsx displays content in priority order: article.html → article.text → story.content → article.description → metadata card
- **RSS content preservation**: Improved RSS parser to properly extract and store content from feed items

## Next Steps
- User needs to restart dev server to pick up all changes
- Monitor extraction success rates across different news sources
- Consider adding article content caching to Redis
- Test with various paywalled/anti-bot protected sites