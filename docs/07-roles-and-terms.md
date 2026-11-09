# Roles and election terms

Approved direction: the user confirmed that elected administrators are residents appointed for a period, while Super Administrator access has no automatic expiry. This specification updates the earlier access baseline. The current implementation is an interactive browser-local prototype, not production authorization or a Supabase migration.

## Business rules

- A login account, neighborhood membership, resident relationship, and administrator appointment are distinct records. Ending an administrator term never deletes a person, deactivates their account, ends their occupancy, or removes their authorized historical invoices.
- Fixed staff roles combine permissions. A resident can hold multiple roles simultaneously. For the pilot, elected appointments require an active local resident membership. Resident access still depends on current membership and explicit housing/invoice relationships, not on holding office.
- Super Administrator is a platform role with no automatic expiry. It is manually revocable by another authorized Super Administrator; the last active Super Administrator cannot be revoked, deactivated, or have its underlying account removed. Bootstrap/recovery is a controlled server operation, not public signup or an elected-role option.
- Only Super Administrators appoint, renew, or revoke staff roles. Elected administrators cannot appoint themselves or others, extend their own term, grant document permissions, or manage Super Administrator credentials.
- `neighborhood_admin` is labeled **Resident Administrator / Administrator warga** and manages people, units, occupancy, ownership, and ordinary local accounts. It is not an umbrella administrator role. `billing_admin`, `content_admin`, and `service_admin` retain their dedicated capabilities. Optional security officers use the same dated pattern if added; no additional role editor is needed now.
- All elected roles require `starts_at` and `ends_at`; start is inclusive, end exclusive. Store timezone-aware timestamps; display and enter dates in the neighborhood timezone, initially Asia/Jakarta. For a term through 31 December, enter 1 January at 00:00 WIB as the exclusive end.
- Effective access requires an active account/session, active membership, matching neighborhood, valid role, `starts_at <= database_time`, `database_time < ends_at`, and no effective revocation. Missing or invalid boundaries deny staff access. Expiry is checked on every protected request and at a financial/state transition, without waiting for a scheduler or re-login.
- New appointments start now or in the future; historical fixture/import records are loaded through a controlled setup process, not by backdating the appointment form.
- Do not allow overlapping appointments for the same membership and role. Adjacent terms are allowed. Renewal creates a new appointment referencing the old one, preserving its original dates. Previously issued invoices and letters retain their original actors and records after a term ends.
- Early revocation requires a reason and takes effect immediately. Revoking one appointment does not revoke other roles or an independently scheduled future appointment. Show those remaining appointments to the Super Administrator during handover.
- Appointment, renewal, and revocation require an audit event with actor, target, role, scope, timestamps, reason, and previous/new values. Audit is append-only in production. Natural expiry is derived from dates and is not a background state change.

## Fixed permission matrix

| Role | Permitted administration modules | Limits |
| --- | --- | --- |
| Super Administrator (`super_admin`) | All modules; role appointments; neighborhood settings | Platform-scoped appointment; explicit selected-neighborhood context and audit for private operational access |
| Resident Administrator (`neighborhood_admin`) | Clusters/residents/units; ordinary local accounts | Cannot manage appointments or privileged accounts; no billing/content/service access unless separately appointed |
| Billing Administrator (`billing_admin`) | Fees; metered water; invoices; payments; cash ledger; PDF reports; WhatsApp templates/reminders | No general identity files, account control, content, or service case access |
| Content Administrator (`content_admin`) | News/media | No household or billing access |
| Services Administrator (`service_admin`) | Letters; service requests; guest reports; contacts | Only case-related person information and attachments |
| Resident (`resident`) | Own portal | Relationship-scoped unit/invoice/request access, independent of staff appointment dates |

The prototype's aggregate dashboard is Super Administrator-only because it combines several modules. A later role-specific dashboard may expose only aggregates that role can read. Sensitive identity review stays an explicit capability tied to an active eligible staff appointment, granted by Super Administrator; it cannot outlive that appointment.

## Production data contract

Retain `tenant_memberships` as the local account/person link. Replace timeless `membership_roles` with **`role_assignments`**, not a mutable `role` field on `people` or `auth.users`:

| Field | Rule |
| --- | --- |
| `id, tenant_id, membership_id, role` | UUID primary key; same-tenant membership foreign key; fixed neighborhood role code |
| `starts_at, ends_at` | Required `timestamptz`; end strictly after start |
| `revoked_at, revoked_by, revocation_reason` | Nullable together; server-written; early revocation preserves the original term |
| `assigned_by, assigned_at, appointment_reason` | Required actor/time/reference; server-written |
| `renews_assignment_id` | Optional same-tenant predecessor, same member/role; new start no earlier than predecessor end |

Resident access uses the active membership and relationship grants; it does not need an expiring staff row. Model `platform_role_assignments` separately with `user_id, role(super_admin), starts_at, revoked_at?, assigned_by, assigned_at, reason`; no tenant or end timestamp. A platform assignment must not be representable through the neighborhood role API. A local Resident Administrator cannot read/enumerate global platform accounts.

Sensitive `membership_permissions` must reference `role_assignment_id` as well as the tenant/membership. Only an active compatible parent assignment can confer the permission. Revocation/expiry of the parent removes it automatically. Never accept arbitrary permission codes from a client editor.

Use transaction-safe overlap validation (including concurrent grants), composite tenant foreign keys, indexed role lookups, and protected write functions. Grants/revocations and their audit event commit together. Serialize platform-role/account changes when protecting the last active Super Administrator. Check the actor's appointment again inside each write transaction; do not authorize once at page load and reuse that decision for later writes.

## Supabase enforcement contract

Before connecting real data, implement the predicates in server authorization, PostgreSQL RLS, private Storage policies/download actions, exports, and workers. Resolve roles from protected database rows, not editable metadata or cached role claims in a long-lived JWT. A valid sign-in token alone does not preserve an expired appointment. Background jobs distinguish system authority from a resident's delegated authority and recheck it before privileged work. Revoked staff cannot download new private files; an already issued signed URL remains valid only for its short lifetime.

Role-management endpoints are Super Administrator-only. Resident Administrators can provision/reset ordinary local resident accounts, but cannot reset, deactivate, relink, or alter credentials for a platform Super Administrator or another privileged account. Global account recovery remains a platform/account-owner operation. Platform access requires a server-selected neighborhood context, explicit authorization and audit; a client-supplied tenant ID alone is insufficient.

No scheduler is required for authorization expiry. Optional expiry reminders and handover notices can be added later without changing the predicate.

## Prototype review and acceptance

Open Admin → **Peran dan masa jabatan** as Nadia Putri (Super Administrator). The simulation controls above the page let reviewers choose an account and a WIB evaluation time; these controls deliberately bypass real identity selection for demonstration.

1. Budi Santoso has a Billing Administrator appointment from 1 January 2026 until 1 January 2027. Select Budi: only billing modules appear, while the Warga preview still shows his own portal.
2. Set evaluation time to 1 January 2027 at 00:00: billing access disappears at that exact boundary. Switch back to Nadia to manage appointments.
3. Appoint an active resident to another role, supplying start, end, and election/decision reference. The role can coexist with billing access; another overlapping appointment for the same role is rejected.
4. Renew an appointment: the new period begins at or after the existing end. Both periods and the renewal event remain visible.
5. Revoke with a reason: that appointment stops conferring access. Other appointments and resident account data remain intact.
6. Try revoking the final Super Administrator: the operation is refused. No expiry date is available for the platform role.

Automated domain tests exercise exact start/end instants (including equivalent UTC timestamps), tenant/account gates, combined capabilities, self-appointment denial, malformed/missing dates, overlap rejection, renewal preservation, revocation audit, and the last-super guard. Real Supabase policies, concurrent transactions, sessions, private files, exports, and privileged account operations remain implementation acceptance gates.
