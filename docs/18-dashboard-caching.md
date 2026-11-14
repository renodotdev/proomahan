# Shared dashboard navigation and caching

Workspace and Documents share the `app/(dashboard)` layout. It verifies the Neon session on entry and mounts one client cache and sidebar for both routes. Existing URLs stay `/workspace` and `/documents`. Dashboard navigation uses Next.js client navigation; sign-in and sign-out retain full reloads to reset session state.

TanStack Query keeps API data in memory. Neon remains the source of truth, and the server still verifies authentication and authorization on every API request. API responses remain `private, no-store`; this change does not enable HTTP/CDN caching of personal records.

| Query | Freshness window |
| --- | --- |
| Account details and neighborhood summary | 60 seconds |
| Dropdown choices | 5 minutes |
| Resident, unit, and cluster lists | 30 seconds |
| Document lists | 30 seconds |

Inactive browser cache entries are collected after five minutes. Fresh entries are reused on navigation. Stale active queries refresh on mount, window focus, or reconnection. Refresh failures are shown with a retry action; there is no automatic polling or retry loop.

Each private cache key includes the verified user ID. Neighborhood data additionally includes the neighborhood ID. Lists also include resource, search, status, page, and cluster filter. Documents are personal and keyed by user and cursor, independently of the selected neighborhood. Search, filters, pagination, and document cursors live in the URL. Selected neighborhood state lives in the shared layout, so it survives dashboard navigation.

## Mutation refreshes

| Successful action | Invalidated queries |
| --- | --- |
| Create/edit/archive/delete/import clusters | Cluster lists and dropdowns, unit lists, selected neighborhood summary |
| Create/edit/archive/delete/import residents | Resident lists and dropdowns, unit lists |
| Create/edit/archive/delete/import units | Unit lists |
| Ownership and occupancy changes | Resident and unit lists |
| Resident account provisioning/reset | Resident and unit lists |
| Personal password change | Reset the signed-in user's private queries |
| Upload/delete documents | That user's document lists, across cached cursor pages |

Active affected queries refresh immediately. Inactive affected entries are marked stale for their next visit. Deletion also removes successfully deleted documents from cached pages, including when the storage service reports partial failures.

On successful sign-out or a 401 response, the cache is cleared and pending query reads are cancelled before a full navigation to sign-in. Sign-out is broadcast to other open dashboard tabs when BroadcastChannel is available. If an account refresh returns a different user ID, the app clears the cache and reloads the protected layout to establish the new identity. Cached sidebar roles are display information; they never authorize a write.

No passwords, tokens, private records, or document metadata are saved in localStorage or sessionStorage. A full browser refresh starts with an empty client cache.

## Verification

`tests/client-cache.test.ts` checks request deduplication, freshness, per-user/per-neighborhood/filter/page isolation, targeted invalidation, and cancellation of in-flight reads on cache clearing. All 67 unit tests passed, along with TypeScript and the production build.

Browser verification used temporary simulated Auth and API services with request counters; it did not modify Neon:

- Units → People → Documents → Units → People produced six business API requests total: account, summary, units, cluster choices, people, and documents, once each.
- Pagination and searching fetched their matching record query without refetching account or summary.
- Saving a resident refreshed the visible resident query exactly once, without refreshing account, summary, or documents.
- Neighborhood switching displayed separate records, and selection survived navigation through Documents.
- Successful sign-out returned to sign-in; browser Back did not restore the private dashboard.

These checks establish request reuse and isolation, not production latency or database-load measurements. Cross-tab sign-out wiring and focus/reconnect behavior follow the library/browser APIs but were not exercised in a multi-tab live-account test.
