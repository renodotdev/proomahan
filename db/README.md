# Proomahan database

Production uses Neon PostgreSQL. The deployed structure is described in [the schema reference](../docs/16-neon-database-schema.md).

- `migrations/`: ordered, checksum-protected SQL; add a new file for every subsequent schema change.
- `npm run db:migrate`: apply pending files with `DATABASE_URL_UNPOOLED`.
- `npm run db:status`: inspect the configured database without printing credentials.
- `npm run db:verify -- schema-validation-<name>`: live integrity checks on a disposable test branch. Never run the fixture suite against production.

Use the server's verified-identity tenant transaction helper for ordinary business queries. Migrations and explicit privileged account/role operations use the owner connection. Do not run migrations as part of `next build` or copy browser-local demo data into production automatically.
