# Phone login and the first live data workflows

Implemented 8 November 2026. This milestone builds on the [deployed Neon schema](16-neon-database-schema.md). It changes the actual sign-in flow and connects the first application modules to the production database; it does not replace every prototype module at once.

## Resident sign-in

The login identifier is **phone number + password**. A user does not need to enter an email address, receive an SMS/email code, verify a phone number, or register publicly.

The existing Neon Auth service continues to own password hashing and sessions. An approved server-only mapping resolves a phone number to that managed identity. Neon Auth's internal account identifier may be an opaque generated email alias; it is not a user contact address, not shown as a login field, and not used for verification or recovery messages. Native SMS/phone-OTP endpoints are not enabled or exposed by this implementation.

This follows the installed [Neon Auth skill](https://neon.com/.well-known/agent-skills/neon-auth/SKILL.md) while keeping the existing provider. The [managed phone plugin](https://neon.com/docs/auth/guides/plugins/phone-number) documents an OTP-based linking flow; this app's administrator-approved identifier mapping implements the required no-OTP MVP without altering managed Auth tables.

- `0812…`, `62812…`, and `+62812…` normalize to the same Indonesian E.164 identifier. Valid international `+country…` numbers are preserved.
- Login identifiers are unique globally. Resident contact numbers may still be shared and are stored separately.
- Editing a resident's phone/contact details does not silently change their login identifier.
- Both unknown phones and wrong passwords return the same invalid-credentials message.
- Login attempts have persisted per-phone and endpoint rate limits. Equivalent phone formats share the same per-phone limit.
- Protected server operations verify sessions against the provider with cookie-cache bypass, so revoked sessions cannot keep accessing data through a cached session cookie.
- Direct email sign-in, public sign-up, public recovery, phone OTP, and account-admin endpoints are blocked by the generic app Auth proxy. Required account actions have their own server-authorized routes.

`0007_phone_login.sql` adds `app_private.phone_login_identifiers` and `app_private.login_rate_limits`. These tables have no grants to PUBLIC or the ordinary application runtime role. Passwords are not stored in either table.

## Activate the first permanent Super Administrator

The supplied administrator name and phone were saved only in the ignored `.env.local` as `PROOMAHAN_BOOTSTRAP_NAME` and `PROOMAHAN_BOOTSTRAP_PHONE`. No production password or replacement dummy password has been created.

From the project root, run:

```sh
npm run setup:admin
```

On this computer the Homebrew Node installation currently has a missing-library error. The working bundled runtime can run the same command:

```sh
PATH="/Users/reno/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" npm run setup:admin
```

Enter and confirm the password privately in the terminal. It is not echoed, printed, saved to an env file, or passed in command arguments. The command requires the already authenticated operator's Neon CLI and the production direct database connection. Re-running it after a permanent administrator exists leaves the account and password unchanged.

Initial bootstrap is a local operator action, not a public web route. To create the first managed credential account without an existing Auth administrator, the command briefly permits provider account creation, creates an opaque internal identity, and restores upstream sign-up to disabled in a `finally` block before enrolling the administrator. The app's public registration route remains blocked, and unenrolled provider identities have no workspace/document access. The command then configures the permanent app role, the provider administrator role needed for credential administration, D'Park City membership, approved phone identifier, and an audit event. No email/SMS verification is introduced.

Do not terminate the process during its provider setup step. If the provider-policy restoration reports a failure, follow its explicit `neon neon-auth config email-password update --disable-sign-up true` repair instruction before serving the application. A failed database enrollment attempts to remove only its newly created, unlinked provider identity.

After successful setup, open `/sign-in`, enter the phone number and password, and continue to `/workspace`.

## Live features

The live workspace contains these database-backed workflows:

| Workflow | Behavior |
| --- | --- |
| Neighborhood selection | Lists only active memberships, or all active neighborhoods for an active permanent Super Administrator |
| Clusters | Create, edit, archive and restore; normalized uniqueness and record-version conflict checks |
| Residents | Create/edit all profile fields, required normalized contact phone, optional contact email and HTTPS document URL; contacts remain separate from authentication |
| Units | Create/edit number, cluster, address detail, rental availability and archive status; cluster filter, search and pagination |
| Ownership | Effective-dated primary-owner assignment; closes the preceding open ownership record and preserves history |
| Occupancy | Check-in/check-out with a selected person and occupancy type; dated records preserve previous occupants and reject overlapping periods |
| Resident account creation | Super Administrator creates a phone login and temporary password for an existing person; the resident must replace the password before protected data access |
| Password reset | Super Administrator resets a resident's password manually, revokes provider sessions and reinstates the forced password-change gate; no recovery message is sent |
| Personal password change | Requires the current password and a different 12–128 character password; revokes other sessions |
| Resident access | Residents see only their own person record and units they currently own/occupy; management actions require current staff permissions |
| Documents | Existing private storage flow now also requires an active, enrolled profile with the password-change gate cleared |

Management of cluster/resident/unit/occupancy data allows `neighborhood_admin` or permanent Super Administrator. Credential creation/reset currently requires the permanent Super Administrator and the corresponding provider-admin session. Elected administrators are not granted global Neon Auth administrative privileges. Delegated account administration is not implemented in this milestone.

All live lists use server queries, search and pagination with 20 rows per page. Unit lists support cluster filtering. Mutations enforce expected `row_version`, same-origin requests, validated fields and redacted audit entries. No browser-local snapshot is sent back as a replacement database state. Dates are interpreted in the neighborhood's timezone inside the tenant transaction.

The original broader mockup remains clearly labeled as a preview. Its public landing sign-in action now opens the real phone sign-in route; its previous fake login form was removed. The live workspace does not use the prototype role switcher or localStorage for records.

## Server endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST /api/login/phone` | Phone/password authentication through the existing managed provider |
| `GET /api/workspace` | Own account setup state and authorized neighborhoods |
| `GET /api/workspace?tenantId=…` | Selected neighborhood context and effective roles |
| `GET/POST /api/neighborhoods/[tenantId]/records/[resource]` | Scoped cluster/person/unit lists and creation; resource is a fixed whitelist |
| `PATCH /api/neighborhoods/[tenantId]/records/[resource]/[id]` | Version-checked edits and archive/restore |
| `POST /api/neighborhoods/[tenantId]/units/[unitId]/occupancy` | Dated ownership/check-in/check-out operations |
| `POST /api/accounts` | Authorized resident account provisioning |
| `POST /api/accounts/reset-password` | Authorized manual credential reset and session revocation |
| `POST /api/account/password` | Current-password challenge, password change and gate clearance |

Normal data queries use the tenant-scoped restricted PostgreSQL role. Narrow privileged operations handle login resolution, account provisioning and credential control. Actors come from verified sessions, never from a request body or demo account selector.

## Verification

`npm run neon:verify -- schema-validation-<name>` now runs the phone-login/live-core integration suite, replacing the old email-login-only smoke test. It must target an isolated disposable branch and refuses production. It creates generated test passwords in process memory, bootstraps a synthetic administrator, starts the production build with that branch's runtime variables, exercises the HTTP APIs, and removes its private temporary env file/server on completion. Delete the disposable branch afterward to remove remaining synthetic identities/records.

The final evidence is recorded in [the verification output](../artifacts/neon-phone-core-verification.txt): **59 live HTTP/service checks and 60 unit tests passed**, along with TypeScript and the production build. Phone-login visual QA passed at desktop and 390px mobile sizes with uniform 46px inputs and no horizontal overflow. Signed-in data workflows were tested through the actual HTTP APIs; a complete signed-in visual regression remains part of the later full-platform review. Verification includes login, bootstrap policy restoration, duplicates, optimistic conflicts, contact normalization, owner/occupant changes, overlap rejection, resident account provisioning, forced password change, revoked-session rejection, per-resident filtering, forbidden management operations, private file storage, manual reset, and normalized-phone rate limiting.

The production `.neon` link, existing service credentials and cookie secret were preserved. Production migration applies only the new phone-identifier/rate-limit tables. Synthetic users and core records were confined to disposable test branches.

## Remaining modules

Billing creation/verification, meter billing, cash, reports/PDF exports, news/media, WhatsApp templates, letters, contact-center administration and elected role-management screens still need their live server adapters. The tables already exist; their broader prototype interactions remain examples until those adapters are implemented. No demo financial records were imported into production.
