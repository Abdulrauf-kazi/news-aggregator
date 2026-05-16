# Active Context

## Current Focus
- Fixed the root cause of the empty news modal: URL extraction from story IDs, article fetching, and detail rendering.

## Recent Changes
- **Root cause identified & fixed**: `getArticleUrl()` checked `story.id.startsWith("http")` but story IDs use format `story:source:https://...`. The URL was never extracted. Now uses regex `/https?:\/\/.+/` to find embedded URLs.
- **useEffect infinite loop fixed**: Article fetch `useEffect` depended on `selectedStory` (a new object reference on every data refresh). Changed to depend on `selectedGraphNodeId` (a stable string).
- **Enhanced detail view**: Added article metadata display (author, site name, published date, reading time). Applied rich typography styling to article HTML content.
- **openOriginal** now uses `article.finalUrl` (the actual resolved URL from the article fetcher) as first priority.

## Next Steps
- Monitor that article fetching works reliably across all source types (GDELT, RSS, HackerNews, etc.).
- Consider persisting bookmarks to localStorage or MongoDB.