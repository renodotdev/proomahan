# MVP implementation specification

Finalized planning baseline · 7 November 2026. This is an implementation handoff, not deployed software or executed migrations. Read with the [terminology standard](00-terminology-and-naming.md), [data model](02-data-model.md), and [screen designs](03-experience-design.md). This document consolidates the technical choices and replaces earlier tentative recommendations where stated.

## 1. Decision register

| Topic | Final baseline | Basis |
| --- | --- | --- |
| Clients | One responsive desktop/mobile web application | User requirement |
| Framework | Next.js App Router with TypeScript | Recommended stack adopted for this finalized implementation plan |
| Interface | Tailwind CSS and shadcn/ui; shared components for both workspaces | Implementation baseline |
| Backend | Next.js server actions/route handlers; PostgreSQL functions for atomic domain changes | Implementation baseline |
| Data platform | Supabase PostgreSQL | User selection |
| Authentication | Supabase Auth; phone number or email address plus password | Requested sign-in behavior; implementation baseline |
| Account operations | Administrator provisioning, manual approval, temporary-password handover and resets | User clarification |
| Elected administration | Residents hold fixed, combinable staff roles for dated terms; Super Administrator is permanent until revoked and alone controls appointments | User confirmation; [role contract](07-roles-and-terms.md) |
| Verification channels | No email/SMS verification, public registration, invitation emails, or automated recovery in MVP | User clarification |
| Files | Supabase Storage; private buckets and audience-aware downloads | Implementation baseline |
| Fees | Administrator-defined categories, items, amounts, schedules, liability, and vacancy treatment | User clarification; settings replace hardcoded policy |
| Payment methods | Bank transfer/cash; resident submission or administrator-assisted recording/verification | User clarification |
| Resident letters | Private administrative letter requests; signed PDF uploaded by staff | User clarification and MVP workflow |
| Gate service | Contacts; physical opening and keys handled manually | User clarification |
| Guests | Simple guest reports and manual acknowledgement | Original request, bounded MVP interpretation |
| Tenancy | One neighborhood initially; tenant-aware schema and authorization immediately | User requirement |
| Locale | Indonesian UI, IDR accounting, Asia/Jakarta; English technical specifications | Configurable implementation defaults |

No specific Next.js/Supabase package version is frozen by this plan. Pin supported compatible versions when scaffolding and keep one lockfile. Supabase documents the [Next.js authentication integration](https://supabase.com/docs/guides/auth/quickstarts/nextjs). shadcn/ui supplies editable component source for the [interface baseline](https://ui.shadcn.com/docs).

## 2. MVP boundary and configuration

The pilot includes accounts/roles; cluster, unit, and person records; ownership/occupancy history; private verification review; configurable billing; manual payment review and reminders; news/media; resident letters; service requests; guest reports; contacts; dashboards; scoped CSV import/export; and audit history.

Deferred: native apps, payment gateways, automated WhatsApp delivery, full double-entry accounting/bank reconciliation, credit notes/automated refunds, electronic gate operation, QR visitor access, reactions/comments, SaaS subscriptions, and customer self-onboarding. Monthly metered water, a basic income/expense cash ledger, PDF billing/cash exports, and administrator-assisted payments are now required; see the [approved billing/cash/media update](09-billing-cash-media-update.md).

| Configuration area | Administrator enters | System behavior |
| --- | --- | --- |
| Neighborhood | Name, branding, public introduction, address, timezone, language | Stored per tenant; public pages expose only approved public fields |
| People and access | Real unit/person relationships, login identifiers, roles | Manual approval; shared contact numbers do not merge accounts |
| Billing | Categories, items, amounts, scope, dates, payer, vacancy rule | Validate complete settings before issuing; no built-in monetary amounts |
| Receiving payments | Bank account instructions and designated cash collectors | Display current instructions; preserve submitted references |
| Letters | Types, required fields/evidence, reference prefix, authorized signatory | Disable a type until configured; no invented local form or signing authority |
| Contacts | Staff/service numbers, hours, public/resident visibility | Gate contact remains a contact action |
| Communications | WhatsApp reminder templates, recipients and preferences | Preview/open manually; no automatic send or delivery claims |
| Documents and operations | Required evidence, upload limits, retention, backup/restore targets | Private files by default; production settings must be recorded before launch |

Missing neighborhood-specific content does not block coding. It blocks activation of the affected service until setup is complete. No required letter type or fee is silently invented.

## 3. Dynamic billing contract

### Catalog and pricing

1. A **fee category** groups items for navigation/reporting. A **fee item** identifies a charge. Both have tenant-unique stable codes, editable labels, and archive controls. Neither uses a fixed enum.
2. Community dues, cleaning, security, and water are optional examples only. A neighborhood can add a maintenance item or remove an unused item without deployment.
3. A **fee schedule** prices one item for a neighborhood, cluster, or unit over effective dates. MVP frequency is `monthly` or `one_time`; one-time schedules require a charge date. An item may have several nonoverlapping schedule versions.
4. Amounts and quantities must be positive exact decimals; reject a line that rounds to zero. For IDR, round each line half up to a whole rupiah; store monetary values as `numeric(18,2)`. No tax, penalty, discount, or proration engine is implied.
5. For one item occurrence, resolve the most specific effective schedule: unit, then cluster, then neighborhood. Two distinct items in one category are both valid charges. Ambiguous schedules at the same scope/date are rejected.
6. Ad hoc invoices still reference a configured item. Billing staff can enter quantity, unit rate, and reason in a draft; manual lines receive unique occurrence IDs rather than recurring-generation keys.
7. Archiving stops future use and preserves existing invoices. Changes to pricing create a new effective version. Issued descriptions, category/item names, quantities, rates, amounts, bill-to details, and unit labels remain snapshots.

### Responsibility and periods

- Each schedule explicitly chooses `primary_owner`, `primary_occupant`, or `explicit_person` as the payer rule, and `charge` or `skip` for vacancy. These fields have no silent default. An explicit person must be authorized for the unit; missing contacts/responsibility block issuance.
- Dated `unit_billing_responsibilities` can override the resolved person for a particular unit/item. Do not infer liability from a phone number or the person who last submitted payment.
- Monthly occurrences use the first local date of the billing month as their reference date. One-time occurrences use the configured charge date. Resolve effective schedule, occupancy, and liability at that date. Mid-month changes affect the next occurrence; explicit draft corrections are available before issue. No automatic proration.
- Due rules are a configured day of month and month offset of zero or one for monthly charges, or days after issue for one-time charges. Clamp a nonexistent day to month end. Preview requires an explicit correction if the computed due date precedes the actual issue date.
- Group issued lines by tenant, unit, bill-to person, currency, and billing period. Different responsible people receive separate invoices.

### Generation, submission, and correction

Preview is nonfinancial: it shows candidate lines, resolved settings and people, excluded units, totals, and errors. Issue revalidates the preview version and commits each invoice and its lines atomically. Batch issuance reports success/failure per invoice and safely resumes failed work; it must not leave a half-issued invoice.

Enforce one generated occurrence per tenant/unit/item/period or one-time charge date. Schedule version and retry ID must not create new occurrences. Voiding does not erase the key; explicit replacements link to the original and use an audited revision. Assign official invoice numbers atomically on issue.

Resident payment submissions reference authorized invoices for one unit, bill-to person, and currency. Proof is required for bank transfers. Cash requires a handover date and collector/reference; receipt evidence is optional. Pending/rejected submissions never reduce balances.

Verification locks the payment and target invoices in a stable order, rechecks permission/state/balances, applies allocations once, and records the decision and audit event in one transaction. Partial payments are supported. Amounts above outstanding balances become unapplied exceptions; no automatic refund. Verified payment details are immutable. A privileged full reversal records a separate correction and reopens balances; it does not claim a bank refund occurred.

MVP invoice corrections: void and replace an unpaid invoice; full reversal is available for a mistaken payment verification. Credit notes, partial reversals, actual refund processing, and adjustments to correctly paid invoices remain a separate feature. Escalate those cases to billing staff rather than altering history.

## 4. Supabase schema contract

The [data model](02-data-model.md) is the complete logical field inventory. Apply the following concrete placement, types, and constraints in migrations when implementation starts. Migrations belong in version control, and all later dashboard schema changes must be reproduced there.

### Schema placement and common types

| Schema/table group | Contract |
| --- | --- |
| `auth.users` | Supabase-managed identity, password, and login identifiers; application references use its UUID primary key |
| `public.user_profiles` | `id uuid` primary key referencing `auth.users.id`; display data only; own-row reads, no public directory |
| `private.account_controls` | `user_id uuid` primary key; account `status` (`provisioning/active/resetting/disabled`), `must_change_password boolean`, `credential_version integer`, provisioning actor/time |
| `private.app_sessions` | `session_id uuid` primary key from the authenticated session; `user_id uuid`, `credential_version integer`, `authenticated_at timestamptz`, `revoked_at timestamptz null`; no direct API grants |
| `public.tenants` | UUID primary key; private settings separate from public presentation fields |
| Neighborhood tables | UUID primary key plus non-null `tenant_id uuid`; unique `(tenant_id,id)` for referenced parents |
| References | Composite tenant/ID foreign keys for all neighborhood-owned relationships; global auth references use `auth.users.id` |
| Dates and events | `date` for effective/business dates, `timestamptz` for events; half-open effective periods |
| Money and quantity | `numeric(18,2)` amounts, `numeric(18,4)` rates, `numeric(12,3)` quantities; currency is `char(3)` and IDR-only in pilot |
| Flags and states | Boolean flags; text with check constraints for fixed workflow enums; ordinary rows for editable catalogs |
| Flexible forms | `jsonb` for validated versioned letter fields/form snapshots, not for substituting relational ownership or financial records |

Supabase recommends referencing only the primary key of its managed users table. Keep application data in application-owned tables. [User-data guidance](https://supabase.com/docs/guides/auth/managing-user-data)

### Migration groups and mandatory constraints

| Order | Tables | Required checks |
| --- | --- | --- |
| 1. Access | Account controls/sessions, `user_profiles`, `tenants`, `tenant_settings`, `tenant_memberships`, `role_assignments`, `platform_role_assignments`, `membership_permissions`, `audit_events` | One membership per user/tenant; one non-null linked person per tenant; fixed role codes; no client role changes |
| 2. Housing | `clusters`, `units`, `people`, `unit_ownerships`, `unit_occupancies`, `occupancy_members`, `unit_access_grants` | Unique cluster code/unit label; end after start; no overlapping occupancy groups or duplicate memberships; at most one primary owner/occupant contact at a date |
| 3. Files | `files`, `verification_documents` | Tenant-consistent references, allowed purpose/type/size, reviewed versions preserved |
| 4. Fee setup | `fee_categories`, `fee_items`, `fee_schedules`, `unit_billing_responsibilities`, `payment_destinations` | Unique catalog codes; scope columns match scope type; positive amounts; no ambiguous schedule or responsibility intervals |
| 5. Billing | `invoices`, `invoice_items`, `invoice_participants`, `payments`, `payment_allocations`, `payment_events`, `payment_reversals` | Unique invoice numbers/generated occurrences/submission keys; immutable issued/verified data; allocation and reversal invariants enforced transactionally |
| 6. Content | `posts`, `post_audience_clusters`, `post_media`, `contact_entries` | Unique post slug per tenant; valid audience; publish time required when published; private files cannot become news media |
| 7. Services | `service_requests`, `service_request_updates`, `letter_types`, `letter_requests`, `letter_request_events`, `guest_reports`, attachment joins | Valid transitions, tenant-consistent assignees; issued letter requires unique reference/file/date; guest end after start |
| 8. Operations | `communication_preferences`, `reminder_templates`, `reminder_attempts`, `background_jobs`, `number_sequences` | Versioned templates; deduplication keys; bounded retries; atomic number allocation |

Supporting records: `payment_destinations` has `tenant_id, id, method, label, bank_name?, account_number?, account_holder?, collector_person_id?, instructions?, start_date, end_date?, is_active`; require bank fields for transfers and a designated collector for cash. `public.tenant_settings` has one row per tenant and stores private operational configuration, including versioned upload/retention settings; public presentation is an explicit projection of `tenants` and approved public content. `number_sequences` stores tenant/type/year counters. `background_jobs` stores tenant, type, actor/service identity, idempotency key, payload references, state (`queued/running/completed/failed`), attempt count, availability time, and lease expiry for recovery. Do not put full identity files, passwords, or proof images into job payloads. Use a small Postgres-backed worker; a specific queue package is not required by the plan.

Apply membership-to-person foreign keys after the housing tables exist, within the same migration sequence. Use versioned letter-type rows with unique `(tenant_id, code, version)` and at most one active version per code; each request references the original version.

Add explicit `service_request_attachments`, `service_request_update_attachments`, and `letter_request_attachments` with unique parent/file pairs. Their references include the tenant; update attachments inherit update visibility. Add indexes on tenant plus the columns used for relationship lookup, review queues, due dates, and worker scheduling.

Keep private settings (bank instructions, retention, internal contact data) behind authorization. Expose public landing data using an allowlisted projection; public read access to an entire tenant settings row is forbidden.

## 5. Access matrix and policy rules

Elected staff permissions are neighborhood-scoped and time-limited. Super Administrator is a separate platform role with no automatic expiry and full operational capabilities only within an explicitly selected, audited neighborhood context. The [role and election-term contract](07-roles-and-terms.md) supersedes timeless assignments. The table below lists capabilities; absence means deny. Multiple assigned roles combine capabilities. Document review is an explicit additional `review_verification_documents` permission assigned by Super Administrator and tied to an active compatible staff appointment; billing/content roles do not receive it automatically.

| Resource/action | Resident Administrator | Billing administrator | Content administrator | Service administrator | Security officer | Resident | Public |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Ordinary accounts/access approval | Manage own-neighborhood ordinary memberships; no privileged account operations | — | — | — | — | Own sign-in/password only | Sign-in entry |
| Clusters, units, people, ownership, occupancy | Manage | Billing contacts/unit context only | — | Request-related context only | Guest destination context only | Own profile and explicitly granted unit summary | — |
| Verification documents | Explicit review permission only | — | — | Explicit review permission only | — | Own authorized submissions | — |
| Fee catalog/schedules/responsibility | — | Manage | — | — | — | Invoice snapshots only | — |
| Invoices and billing reports | — | Manage | — | — | — | Own bill-to/delegated invoices | — |
| Payment evidence and decisions | — | Review/verify/reject/reverse | — | — | — | Submit/view own or explicitly delegated payment evidence | — |
| Payment reminders | — | Prepare and record manual action | — | — | — | Own preferences | — |
| Posts and media | — | — | Manage | — | — | Published allowed audience | Published public audience |
| Service requests/internal updates | — | — | — | Manage | — | Own requests; applicant-visible updates only | — |
| Resident letters/internal review | — | — | — | Manage | — | Own applications/issued documents | — |
| Guest reports | — | — | — | Manage | Acknowledge | Own reports | — |
| Service contacts | — | — | — | Manage | Read allowed | Read resident/public contacts | Read public contacts |
| Audit trail | Tenant metadata, redacted | Billing actions in scope | Content actions in scope | Service actions in scope | Own guest actions | Own visible timelines, not raw audit | — |

Only Super Administrator appoints, renews, and revokes staff roles; elected administrators cannot grant themselves capabilities or extend a term. Require start/end timestamps and reject overlapping terms for the same membership/role. Renewal creates a new period; revocation requires a reason and audit. Expiry removes staff capabilities without ending resident access. Prevent removal/deactivation of the last active platform Super Administrator; bootstrap that role through a controlled setup operation. The service role is a technical credential, never an assignable neighborhood role.

### Row and file authorization

1. Enable RLS on every exposed application table. Evaluate `auth.uid()`, account/session gates, active membership, tenant, current appointment start/end/revocation, capability, relationship dates, and the requested row. Never rely solely on UI hiding or a supplied tenant ID.
2. Keep roles and credential gates in server-controlled tables, not editable user metadata. Helpers used by RLS must avoid recursive membership policies. Where a narrow `SECURITY DEFINER` helper is necessary, fix its search path, qualify objects, revoke default execution, restrict grants, and check the caller explicitly. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database-function guidance](https://supabase.com/docs/guides/database/functions)
3. Revoke direct table writes for issued financial records, roles, account controls, audit, and transition-only service fields. Restricted functions/server workflows enforce the allowed action; RLS alone does not enforce business transitions or column immutability.
4. Bill-to and invoice-participant snapshots grant historical invoice access. Current unit access never grants the next occupant previous occupants' financial records. Ordinary household access does not reveal other people's ID/family cards.
5. Residents read their own service/letter/guest requests. Internal messages and attachments are separate authorized rows. Content audiences and published state apply equally to file downloads and direct API reads.
6. Privileged Supabase credentials stay on the server and bypass RLS, so every privileged operation must explicitly verify actor, role, tenant, target, and allowed fields. Prefer the caller's user-scoped client for ordinary reads/actions.
7. Store files in private buckets: verification evidence, payment proof, letter documents, service attachments, and news media. Validate parent/purpose/tenant before granting upload or download. Only finalized inspected uploads can be attached to a published/issued record.
8. Generate short-lived download URLs (60 seconds by default) after permission checks. Existing URLs can remain usable until expiry; never promise immediate revocation of an already issued signed link. Public news files may be served publicly only after an explicit public publication step; draft/private media remains private.
9. Exports, workers, audit views, aggregates, and search use the same row scopes. Aggregate permission is not permission to expose underlying private people/documents.

## 6. Account lifecycle and Supabase integration

The application server creates accounts through the Auth Admin API with manual confirmation, then records profile, tenant membership, role, and approved person relationship. Auth provisioning and application writes span separate systems: begin with a blocked `provisioning` control record, complete all links, then activate. On failure keep access blocked and allow an idempotent administrator retry. Do not expose partially provisioned residents.

No separate login-identifier table is authoritative: Supabase Auth owns identifiers and passwords; neighborhood people records hold contact data. Identifier changes are explicit administrator actions. A matching shared contact number does not merge identities. Existing global accounts cannot be silently linked or reset by another tenant administrator. For future shared accounts, global credential changes go through the account owner or platform operator; local administrators manage their own memberships only.

Temporary passwords are shown once for manual handover and never stored in application tables, browser persistence, logs, or audit. First sign-in/change after reset is restricted to password change, help, and sign-out. Server actions and database/storage policies must enforce `must_change_password`, not just a redirect.

Session authorization uses server-managed `private.app_sessions`: register a session only after a fresh server-mediated password sign-in, bind it to the current credential version, and require it on protected policies. The client cannot register an arbitrary existing JWT or clear the password-change flag. Account reset blocks the account, increments its credential version, revokes registered sessions, changes credentials through Auth, and reactivates only on success. Keep it blocked on failure. A successful password-change workflow clears the gate only after Auth confirms the change. Test reset/sign-in races and all failure paths before enabling account administration.

Disable public registration at provider configuration, not only on the interface. Normalize phone numbers to E.164 with an Indonesian default country selector; normalize email consistently with the auth provider. Accept phone number or email address plus password; neither is described as channel-verified in the MVP. Deactivation blocks protected access even while an old access token has not expired.

## 7. Application structure and screen inventory

Use one repository and one web application; no separate API service, ORM, state-management framework, or native mobile project is required initially. Query through the typed Supabase client, use version-controlled SQL migrations/functions for transactional operations, and generate database types from migrations. Use server components for initial data and client components where interaction is needed.

| Route group | Main screens |
| --- | --- |
| Public | Neighborhood landing, public news list/detail, public contacts, sign in, contact administrator |
| Account | Change temporary password, change own password, sign out; no public signup/reset-email page |
| Resident | Home, My unit, Invoices/detail, Submit payment/history, News/detail, Services, letter request/detail, service request/detail, guest report/detail, Contacts, Account/preferences |
| Administration | Dashboard; Residents and units; Units/detail; People/detail; User accounts; role assignment; verification queue |
| Billing | Fee categories/items/schedules; responsibility editor; preview/issue; invoices/detail; payment review; reminders; reports |
| Content | Post list/editor, audience selection, media attachment |
| Services | Letter types/requests/review/issue, service requests/replies, guest reports, contact editor |
| Settings | Neighborhood settings, payment instructions/collectors, numbering, templates, imports/exports, redacted audit |

Organize server/domain code by identity, housing, billing, content, and services. Share UI components rather than making separate desktop/mobile implementations. Keep secret-bearing modules server-only. Authenticated data must not enter shared/public rendering caches. Exact file layout follows Next.js conventions when scaffolded.

## 8. Required transactional actions

| Action | Contract |
| --- | --- |
| Change ownership/occupancy | Validate tenant, dates, relationships, primary contacts; update access periods and history together |
| Save fee schedule version | Validate item/scope/dates/payer/vacancy; reject conflicts; preserve prior version |
| Issue invoice | Revalidate preview, resolve snapshots, enforce occurrence uniqueness, allocate number, freeze lines atomically |
| Submit payment | Check authorized invoices, amount/evidence, scope and client idempotency key; record submission and requested allocations |
| Verify/reject/reverse payment | Validate role/state, lock rows, apply once; reject/reverse with reason; preserve evidence and events |
| Publish post | Validate audience and media purpose/inspection; publish content and access metadata consistently |
| Issue resident letter | Check approval, signature file and signatory, allocate reference, record issued event; no silent PDF replacement |
| Resolve service request | Enforce status transition; record response and visibility; notify through portal timeline |
| Approve guest report | Acknowledge the notification only; no electronic gate command |

All mutations accept a verified actor and return clear validation/conflict errors. Use bounded retries for infrastructure failures; never retry a financial effect without its idempotency key. Do not trust totals, roles, bill-to people, or file ownership supplied by a browser.

## 9. Implementation backlog and acceptance gates

| Milestone | Deliverable | Done when |
| --- | --- | --- |
| M1: Foundation | Next.js project, local Supabase, migrations, Auth, tenant/membership/session policies, private storage | Two synthetic tenants cannot cross-read; admin creates/reset/deactivates accounts; old sessions remain blocked after reset; no privileged credential reaches browser |
| M2: Directory | Clusters/units/people, history, approvals, account links, CSV preview | Owner, renter, non-login occupant, move-out, future dates, and invalid overlaps work; own-unit portal flow is complete |
| M3: Billing setup | Dynamic categories/items/schedules, payer/vacancy settings, invoice preview | A new item and cluster/unit override work without code changes; missing configuration blocks issue; same-category distinct items remain distinct |
| M4: Billing settlement | Issue, submission, verification, reversal, receipt, reports, manual reminders | Repeated/concurrent operations apply once; partial payment and overpayment reconcile; changing rates leaves issued invoices unchanged |
| M5: Content/services | News/media audiences, contacts, service/letter/guest workflows | Direct private URL reads fail; internal notes stay private; letter issuance requires reference and PDF; gate remains manual |
| M6: Pilot | Imports, real-device review, scoped exports, restore drill, staff guide | Counts/opening balances reconcile; representative residents finish tasks; database plus files recover; deployment checklist complete |

Implementation validation includes SQL constraint/RLS tests, transaction/concurrency checks, and a small end-to-end suite of the key journeys. Synthetic fixtures include an owner-occupier, non-resident owner, renter, moved-out resident, account without approved access, multiple staff roles, and two neighborhoods with similar unit labels. None of these checks has been run against an application yet.

## 10. Deployment checklist and handoff status

Planning is ready for implementation. Actual setup inputs remain deliberately separate: Supabase project/region, application hosting account, production domain, first administrator, real neighborhood data, enabled fee schedules, bank/collector instructions, approved letter types/signatories, privacy/retention settings, and agreed recovery/performance targets. Obtain these when their milestone needs them; do not invent them or put secrets in documentation.

Before production, pin dependencies, apply reviewed migrations to staging, pass acceptance checks, reconcile imported data, configure production secrets, verify public signup is disabled, restore both data/files, and select a cutover date. No live Supabase project has been configured, no production migration applied, and no application deployed by this planning work.

The [assessment/bulk/invoice contract](10-assessments-bulk-invoices.md) is the current baseline for per-item payment verification, both confirmation sources, all three creation scopes, the individual PDF action, and the cash-entry popup. The Super Administrator has the complete administration capability set.
