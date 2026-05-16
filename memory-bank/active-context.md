# Active Context

## Current Focus
- Fixed detailed news rendering, bookmarking, and 'READ ORIGINAL' functionality in the live news dashboard.

## Recent Changes
- Modified `live-home.tsx` to fetch the full article details via `/api/fetch-article` for the selected story.
- Updated the node analysis overlay in `live-home.tsx` to render detailed news content (HTML, text, and images).
- Implemented functional local state toggle for bookmarking news items.
- Fixed 'READ ORIGINAL' button behavior to gracefully fallback to Google Search when the direct article `url` is missing from the mocked/graph data.

## Next Steps
- Continue monitoring user feedback on the node analysis interactions and detailed article rendering.