# Initial thread list duplicate snapshots

## Prerequisites

Build and run the local web UI with a thread/list response containing repeated IDs; retain two distinct IDs with an identical title.

## Actions and expected results

1. Cold-load the homepage before selecting another conversation. Each ID appears once, with the newest updatedAt snapshot.
2. Switch conversations and refresh. The sidebar count stays stable.
3. Confirm the two distinct IDs with the same title remain separate.
4. Run the focused normalizer regression tests, including cross-project snapshots and timestamp ties.

## Performance and cleanup

The fix uses one O(n) Map pass over the existing page, adds no requests or filesystem operations, and does not modify stored conversation data. It introduces no fanout, extra response payload, or persistent cache. No cleanup of user history is required.
