# Neon setup and verification

Subsequent milestone: the application schema is now deployed. See [the current Neon schema reference](16-neon-database-schema.md). The status below records the earlier infrastructure setup milestone.

Updated 8 November 2026. This is the current infrastructure contract; it supersedes the Supabase-specific provider assumptions in the older planning documents.

## Deployed services

| Setting | Value |
| --- | --- |
| Organization | `org-soft-sky-13456159` |
| Project | `calm-fog-15595404` — Proomahan - D'Park City |
| Branch | `production` (`br-autumn-block-a1ke6brf`) |
| Region | AWS Singapore (`aws-ap-southeast-1`) |
| Services | PostgreSQL 18, Neon Auth, Object Storage |
| Bucket | `assets`, private |
| Web hosting target | Next.js App Router on Vercel, Node.js 24 |

`neon deploy` completed successfully and pulled 11 Neon variables into the ignored `.env.local`. `neon config plan` subsequently reported: `No changes — branch production already matches the policy.` No Vercel deployment has been performed.

## What was changed

- Installed global Neon CLI 9.2.0 using the requested `npm i -g neon@latest` flow.
- Ran the requested `neon init -y --org-id org-soft-sky-13456159 --project-id calm-fog-15595404 --branch production --services postgres,auth,object-storage` command. It created `.neon`, `neon.ts`, installed `@neon/config` and `@neon/env`, and added `.neon` to `.gitignore`.
- Initialization installed the user-level `neon-postgres` plugin for Codex, Claude Code/Desktop, and Cursor, and configured the GitHub Copilot MCP entry. The separate Copilot skills step reported an error. The installed Codex plugin supplies all seven Neon skills and the OAuth MCP endpoint `https://mcp.neon.tech/mcp`; a duplicate standalone Codex MCP or skills installation was therefore unnecessary. The plugin is confirmed enabled in Codex configuration. Its MCP tool connection was not exercised in this chat; service verification used the authenticated CLI and the application SDKs. Existing unrelated configuration was retained.
- Fetched the exact requested skill from [Neon's agent-skill endpoint](https://neon.com/.well-known/agent-skills/neon/SKILL.md) and read the installed parent, PostgreSQL, Auth, and Object Storage skills. The fetched inspection copy is in `/private/tmp/proomahan-neon-skill.md`.
- Completed browser authentication and ran `neon deploy`; it provisioned the private bucket and pulled the service credentials. The CLI authenticated the DEFAULT profile.
- Preserved generated Neon environment values. Added a random application-managed `NEON_AUTH_COOKIE_SECRET` locally without printing it. Added a credential-free `.env.example` listing the service variables and cookie secret.
- Removed the two Supabase SDK dependencies. Added pinned PostgreSQL, Vercel pool, Neon Auth, Files SDK, AWS SDK peer packages, and PostgreSQL TypeScript definitions. Updated `package-lock.json`, Node engine selection, and `.nvmrc`.
- Added server-only database/Auth/storage clients in `lib/neon`. PostgreSQL uses a shared bounded `pg` pool with `attachDatabasePool` and explicit TLS hostname verification. All credentials stay on the server.
- Added `/sign-in`, `/documents`, `/api/auth/[...path]`, and `/api/documents`. These form a real, limited personal-document workflow: email/password sign-in, restored server session, PostgreSQL lookup of the signed-in user's own Auth profile, private upload/list/download/delete, and sign-out. The files are keyed under the verified user's own prefix. Files have a 3 MB limit, PDF/JPG/PNG signature checks, no-store responses, attachment downloads, and same-origin mutation checks. The document list is paginated at 20 objects.
- Restricted the app Auth proxy to the required sign-in/session/sign-out/password-change methods. No registration or automatic recovery UI was added.
- After the fixture-based tests, changed only two upstream Auth settings to match the approved MVP: `disable_sign_up=true` and `revoke_sessions_on_password_reset=true`. Existing settings were otherwise preserved: password sign-in enabled, verification not required, and no sign-up/sign-in verification emails.
- Added four environment/security unit tests and `scripts/verify-neon.ts`, exposed as `npm run neon:verify`. The unit-test command now includes all test files.
- Updated README to distinguish the real document service from the existing prototype. Added the document/sign-in styles and a sign-in preview artifact. No neighborhood financial data was imported and no permanent application schema migration was applied; the database write check used a temporary table inside a rolled-back transaction.

## Environment and Vercel

`.env.example` contains names, never credentials. `.env.local` and `.neon` are ignored by Git. All Neon credentials and the cookie secret are server-only; never rename them with `NEXT_PUBLIC_` or put them in `next.config.ts` public env settings.

For a fresh checkout:

```sh
nvm use
npm ci --legacy-peer-deps
neon login
neon init -y --org-id org-soft-sky-13456159 --project-id calm-fog-15595404 --branch production --services postgres,auth,object-storage
neon deploy
```

Keep the generated values intact. Generate a cookie secret separately for each application environment if absent, and save it directly to the ignored env file. Do not print or commit it. The local setup already contains one; do not regenerate it on every deploy because that invalidates cached session cookies.

On Vercel select the Next.js preset and Node.js 24.x; use `npm ci --legacy-peer-deps` as the install command and `npm run build` as the build command. Add the consumed server variables from `.env.local` to the matching Vercel environment: `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, and `AWS_REGION`. The bucket name is `assets`, as declared in `neon.ts`. Keep preview branches and credentials separate from production. Add the real application origin as a Neon Auth trusted domain before hosted sign-in testing. The production hostname and Vercel project have not been supplied or configured here.

The installed Homebrew Node currently fails to launch because of a missing system library. These commands were verified using the working bundled Node 24 runtime by prepending `/Users/reno/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin` to `PATH`. No system library was changed. Initial npm dependency resolution stalled; installation completed with `--legacy-peer-deps`, and `npm ls --depth=0` passes.

## Verification evidence

Full sanitized evidence: [Neon verification output](../artifacts/neon-verification.txt).

- `npm run build`: passed with the real `.env.local`; dynamic Auth/documents routes were included.
- Production app started using `npm run start -- --port 3001`: `Ready in 47ms` on the final restart.
- `npm run typecheck`: passed.
- `npm test`: 58 passed, 0 failed.
- `npm run neon:verify`: passed live PostgreSQL, Auth, and Object Storage checks through the running app. A temporary table write/read was rolled back. Two synthetic Auth accounts and a tiny PNG were created for verification and removed afterward. No real resident data was used.
- The sign-in page was opened and visually inspected in the browser. Preview: `artifacts/neon-sign-in-preview.png`.

The initial live test found that Next's local request URL hostname differed from the actual Host header; the same-origin upload guard rejected a legitimate upload. The guard was corrected to compare the browser Origin host with the request Host. The complete flow then passed. An initial session-cache mint request timed out; the subsequent successful run verified session restoration without that error. A sandbox port-binding failure was resolved by starting the authorized local server outside that restriction.

The fixture-based verification script intentionally creates disposable accounts through upstream sign-up and does not modify Auth policy. **Production sign-up is now disabled, so do not enable it merely to rerun this script.** Repeat fixture-based testing on an isolated non-production branch with test-only signup enabled, or extend the test to use explicitly provisioned test credentials. The successful initial proof was run before disabling sign-up; the app's public signup route was already blocked throughout.

## Remaining application work

This setup verifies the three infrastructure services and a first real document flow. The `/` dashboard still uses browser-local fixtures and simulated roles. Billing, resident/cluster editing, cash, news, letters, and elected RBAC have not been moved into server-authorized PostgreSQL workflows. Do not treat a prototype role selection as authorization for real data.

The real sign-in currently accepts email/password. Phone/password identity mapping and account provisioning/reset screens are still backend implementation work; no SMS or email verification was introduced. An actual first administrator and resident accounts must be provisioned through the approved administrative process. The temporary test accounts were deleted and are not launch accounts. The personal-document flow grants no access to other households or to the main admin prototype's fictional records.

Before a neighborhood launch, implement the tenant-scoped relational schema, live RBAC, transactional financial operations, account administration, data import, and remaining feature adapters, then perform the full acceptance checks from the product plan with Neon-specific enforcement. Real business records remain intentionally unmigrated.
