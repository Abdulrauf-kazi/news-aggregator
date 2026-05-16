# Failures Log

- 2026-05-16: NewsGraph click detection was broken because pointerDownMetaRef was not being set on pointer down events. This caused click timing validation to always fail. Resolved by accurately storing the event timestamp during handlePointerDown.
- 2026-05-16: LiveNewsGraphPage was missing an onNodeClick handler entirely, preventing interaction data from reaching the backend. Resolved by implementing handleNodeClick to POST event to /api/live and refresh data.


