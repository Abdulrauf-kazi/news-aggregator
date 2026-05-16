# Failures Log

- 2026-05-16: NewsGraph click detection was broken because pointerDownMetaRef was not being set on pointer down events. This caused click timing validation to always fail. Resolved by accurately storing the event timestamp during handlePointerDown.
- 2026-05-16: LiveNewsGraphPage was missing an onNodeClick handler entirely, preventing interaction data from reaching the backend. Resolved by implementing handleNodeClick to POST event to /api/live and refresh data.
- 2026-05-16: POST /api/live failed with 400 Bad Request ("Missing session id") because initial server-rendered data did not generate a session ID, leaving data.meta.sessionId undefined in the browser. Resolved by generating a localSessionId fallback on the client and explicitly passing it in the x-session-id header for both POST and GET requests.
- 2026-05-16: NewsGraph click detection was still failing for many users because the tolerance (dist < 5px, time < 300ms) was far too strict for trackpads or slow clicks. Increased to 15px and 800ms. Additionally, the hover/active state was destructively overwriting the node's native semantic color with a flat red; updated canvas renderer to preserve the topic color and apply a stroke/glow instead.
- 2026-05-16: Retrieval Vector card in LiveNewsGraphPage had invisible text due to a CSS specificity conflict. The global `.bento-shell` class forced `background: #ffffff`, overriding the inline `bg-[#1c1917]` utility class, resulting in white text on a white background. Resolved by removing the `.bento-shell` class from the dark card.


