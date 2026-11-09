# Deployed Neon database schema

Status: migrated to production on 8 November 2026. Subsequent implementation: [phone login and live core data](17-phone-login-and-live-core.md); the latest migration count is seven. This document and `db/migrations/*.sql` supersede provider-specific schema details in the earlier Supabase planning documents.

Project `calm-fog-15595404`, branch `production`, PostgreSQL 18, AWS Singapore. The existing server-only `pg` pool connects with `DATABASE_URL`; migrations use `DATABASE_URL_UNPOOLED`. Neon-managed credentials and session-signing secrets remain in the ignored `.env.local` and were preserved.

## Schema boundaries

| Schema | Contents | Ownership |
| --- | --- | --- |
| `neon_auth` | Neon-managed users, accounts, sessions, verification, organizations and Auth configuration | Neon Auth; application migrations do not alter these tables |
| `app` | 47 Proomahan application tables and two reporting views | Versioned SQL migrations |
| `app_private` | `schema_migrations`, approved phone-login identifiers and login rate-limit counters | Migration runner and narrow privileged account/login services |

`app.user_profiles.user_id` references the UUID primary key of `neon_auth."user"`. Passwords, password hashes, tokens, and authentication sessions are not duplicated in application tables. Neon Auth organization/member records do not automatically grant Proomahan neighborhood membership or elected roles.

The only initial production business record is the `app.tenants` row for **D'Park City**, slug `dpark-city`, locale `id-ID`, timezone `Asia/Jakarta`, currency `IDR`. There are no seeded residents, clusters, fee amounts, invoices, payments, or administrator appointments.

## Application tables

| Area | Tables |
| --- | --- |
| Neighborhood and identity | `tenants`, `user_profiles`, `tenant_memberships`, `platform_role_assignments`, `role_assignments` |
| Residents and homes | `clusters`, `units`, `people`, `unit_ownerships`, `unit_occupancies`, `occupancy_members` |
| Files and identity evidence | `files`, `verification_documents` |
| Configurable fees and responsibility | `fee_categories`, `fee_items`, `fee_schedules`, `unit_billing_responsibilities` |
| Billing creation and invoices | `billing_runs`, `billing_run_units`, `invoices`, `invoice_items`, `invoice_participants` |
| Metered water | `meters`, `water_tariffs`, `meter_readings` |
| Receipts and cash | `cash_accounts`, `payments`, `payment_allocations`, `payment_reversals`, `cash_entries` |
| WhatsApp communication | `reminder_templates`, `communication_preferences`, `reminder_attempts` |
| News and media | `posts`, `post_audience_clusters`, `post_media`, `post_reactions` |
| Contact center and reports | `contact_entries`, `service_requests`, `service_request_updates`, `service_request_files`, `guest_reports` |
| Resident letters | `letter_types`, `letter_requests`, `letter_request_events`, `letter_request_files` |
| Audit trail | `audit_events` |

Views:

- `app.invoice_balances`: original invoice total and the sum of effective verified item allocations. Outstanding is total minus paid; there is no independent paid-status flag. Reversed payments no longer settle invoices.
- `app.cash_statement`: manual income/expenses, verified billing receipts, and reversal outflows on their own local dates. Original receipts remain in historical periods after a reversal. Opening balances belong to `cash_accounts` and must be included by the report query.

Both reporting views use `security_invoker=true` so the calling runtime role's tenant policies apply.

## Relationships and business rules

- A neighborhood is a tenant. UUIDs identify server records; the browser demo's `dpark-city` identifier remains a demo identifier, while the actual tenant can be resolved by its slug in privileged setup tooling.
- Neighborhood-owned records carry `tenant_id`. Composite foreign keys enforce same-neighborhood relationships, including bulk-selected units, invoice items, payments, files, letters and requests. Global identity/profile references are deliberate exceptions.
- Cluster names/codes and unit numbers are normalized for uniqueness. Records are archived rather than deleting financial or occupancy history. The application runtime has no general DELETE grant.
- People store required phone numbers, optional email, and an optional HTTPS document-storage URL. Phone/email contacts need not be globally unique. Account identity and resident contact data remain separate.
- Ownership is dated separately from occupancy. A unit has at most one overlapping occupancy group; co-owners may coexist, with one primary owner contact. Occupancy members must fit inside the parent period and cannot overlap for the same person or primary contact. A meter replacement uses a new meter record, retaining the old serial and readings.
- Staff roles are dated and combinable: `neighborhood_admin`, `billing_admin`, `content_admin`, `service_admin`. Terms cannot overlap for the same membership/role. Super Administrator is a separate global assignment with no expiry column. The last active Super Administrator cannot be revoked or disabled through ordinary record changes.
- Fees are administrator-defined records. Schedules support neighborhood, cluster, and unit scope; monthly and one-time recurrence; payer and vacancy rules; effective dates; and independent content versions. No example fee amounts are seeded. Server issuance must apply `unit > cluster > tenant` precedence and resolve the historical bill-to person.
- Bulk issuance has a run record, unique retry key, scope (`all_eligible`, `selected`, `individual`), and normalized selected-unit rows. Invoice numbers and generated charge keys are unique per neighborhood. Month periods must start on day one.
- Invoice rows snapshot the bill-to name and unit label. Item rows snapshot category/name, quantity/rate and calculations. Issuance requires item sums to equal the invoice total; issued item/pricing snapshots are immutable. Voiding requires a reason and reversal of effective receipts first.
- Whole-rupiah totals use exact `numeric(18,0)`. Quantities, rates and meter values retain appropriate decimal precision. PostgreSQL rounds nonnegative line products to whole rupiah. Numeric NaN is rejected. API adapters must preserve exact numeric values; JavaScript floating point is not the accounting authority.
- Resident-submitted and administrator-recorded payments use the same `payments` table, with explicit `origin`, actor and unique submission key. Proposed and verified item checklists are separate allocation stages. Verification requires allocations to match the receipt amount, correct unit/person/currency, issued invoices and outstanding item balances. Invoice/item locks serialize settlement and voiding. Reviewed receipts/checklists are immutable; corrections use a full reversal and a new submission.
- Water readings retain previous/current values, tariff and invoice-item linkage. Readings cannot decrease, and billed readings are immutable. Linked water invoices must match the meter's unit and monthly period. Tariff/calculation snapshots belong on the issued invoice items.
- Cash expense/income notes are manual entries. A verified bill receipt appears automatically in the reporting view; do not also record it as manual cash income. Cash-account opening balances are configurable.
- Files retain their storage key, original name, purpose, uploader, scan status and metadata. Purpose/key/tenant cannot be changed in place. News media must use clean, undeleted news-purpose files. Private verification files cannot be repurposed as public news.
- Reminder templates preserve allowed variables and versions. Preparing/opening WhatsApp records an attempt; it does not claim delivery. Resident letters and their supporting documents remain separate from news.
- Payment state changes write a redacted automatic audit event. Audit events and payment reversals are append-only. Other privileged workflows must append their own audit records in the same transaction.
- Mutable records have automatic `updated_at` and `row_version`. Existing `version` fields on fee schedules, templates and letter types refer to content versions. Update APIs should use an expected `row_version` predicate and reject conflicting edits.

## Server access

`lib/neon/database.ts` retains the bounded Vercel-compatible PostgreSQL pool. It is privileged infrastructure: do not expose arbitrary SQL or its credentials to a browser.

Normal business access goes through `withActorTenant` in `lib/neon/tenant-context.ts`, using an actor ID obtained from a verified Neon Auth session. It:

1. Begins a transaction and sets `LOCAL ROLE proomahan_app`.
2. Sets the verified actor context, clears tenant context, and checks active account/password-change gates.
3. Checks active membership or an active permanent Super Administrator assignment.
4. Sets the authorized tenant context and checks the neighborhood is active.
5. Reads currently effective staff roles using database time, enforcing requested roles while letting Super Administrator access them.
6. Commits or rolls back, then releases the connection. Role and tenant settings are transaction-local and do not leak through the pool.

The `proomahan_app` role has no login and no RLS bypass. RLS filters tenant tables by the transaction context; identity/membership bootstrap reads have narrow own-account policies. Identity, tenant-root and role-assignment writes are withheld from this runtime role. Account creation and appointment management need separately authorized, audited privileged server operations.

**Tenant isolation is only one authorization layer.** A resident membership does not authorize listing every resident's personal information or invoices. Each business API must additionally scope resident records to the account's linked person/explicit grants and require the appropriate staff role for administration. The callback is trusted server code; never accept an actor ID, SQL fragment, or role list from request input. Database-owner connections can bypass RLS and are reserved for migrations/explicit privileged operations.

The first connected business endpoint is `GET /api/neighborhoods/[tenantId]`. It obtains identity from Neon Auth, invokes the tenant helper, and returns the authorized neighborhood profile and active-cluster count. Missing sign-in returns 401; missing setup/membership/permissions returns 403. It does not auto-enroll users or appoint administrators.

## Commands and migrations

```sh
npm run db:migrate             # configured production direct URL; never runs during next build
npm run db:status              # server connection, table list, neighborhood names and migration count
npm run db:migrate -- schema-validation-<name>
npm run db:verify -- schema-validation-<name>
```

`db:migrate` uses the direct connection, a session advisory lock, SHA-256 drift checks and one transaction per migration. Failed migrations roll back and are not recorded; a successfully applied SQL file must never be edited. Add a new numbered migration for later changes. There is no destructive automatic down-migration.

| Migration | Purpose |
| --- | --- |
| `0001_application_schema.sql` | Core application entities, references, initial runtime role and query indexes |
| `0002_integrity_and_access.sql` | Period/financial checks, reporting views, D'Park City seed, runtime grants and RLS |
| `0003_additional_guards.sql` | Settlement/void locks, permanent-admin guard, billed meter and news-file protection, dated cash reversals |
| `0004_billing_selection_and_audit.sql` | Tenant-constrained bulk selections and automatic payment audits |
| `0005_numeric_and_query_guards.sql` | NaN rejection and common membership/resident/billing indexes |
| `0006_record_versions.sql` | Automatic update timestamps and record versions |
| `0007_phone_login.sql` | Server-only approved phone identifiers and persisted login rate limits |

The development branch `schema-validation-20261108` was created from production for testing. Synthetic identity/member fixtures were confined to it; financial test transactions were rolled back. The branch is removed after validation, including its remaining synthetic identities. The production link and original environment values are retained.

Evidence: [sanitized verification output](../artifacts/neon-schema-verification.txt).

Verification: 29 live database/server-context checks, 58 unit tests, TypeScript and production build passed. The live suite covers cross-tenant references, normalized uniqueness, occupancy/member dates, overlapping/expired role terms, account and membership gates, connection context reset, immutable invoice snapshots, totals, partial settlement, overpayment, reversals, cash reconciliation, automatic audit records, append-only history, finite money, last permanent admin, and row versions.

## Remaining integration work

The schema is deployed and server access is connected. The main frontend still uses the existing localStorage demo state. Real account bootstrap, manually administered resident accounts, per-feature server actions/API adapters, resident record authorization, automatic numbering/issuance orchestration, file metadata integration, exports from live queries and any real-data import remain implementation work. No permanent administrator was invented or granted access by this migration.

The previously tested personal-document service continues to use its own authenticated owner prefix in the private bucket. Its existing objects were not silently imported into `app.files` or relabeled as neighborhood evidence. Integrate that metadata deliberately when the file workflows are connected.
