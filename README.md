# Proomahan — neighborhood management platform

MVP planning baseline and interactive frontend prototype · 7 November 2026.

Brand: **Proomahan**. Initial neighborhood: **D'Park City**. Indonesian interface; minimal teal and neutral visual direction. The prototype uses fictional browser-local data. The selected production target is Neon PostgreSQL, Neon Auth, and Neon Object Storage. Phone/password sign-in is available at `/sign-in`; live cluster, resident, unit, occupancy and account workflows are at `/workspace`, with private files at `/documents`. The broader prototype still uses simulated roles and browser-local billing/cash data.

Build one responsive web application with an administration workspace and a resident portal. Start with one neighborhood, while keeping neighborhood isolation in the database and authorization from the beginning.

## Run the clickable prototype

Requires a working Node.js 24 installation and npm.

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. Use **Publik**, **Admin**, and **Warga** in the preview bar to switch perspectives. Start in the administrator dashboard. Prototype changes persist in this browser; **Pengaturan → Atur ulang data contoh** restores the fixtures.

Checks: `npm test`, `npm run typecheck`, and `npm run build`. See [prototype review instructions](docs/06-prototype-review.md) for the main click-through paths and limitations.

## Planning documents

| Document | Use it to decide |
| --- | --- |
| [Assessment, bulk issuance, and invoice exports](docs/10-assessments-bulk-invoices.md) | Two confirmation paths, item checklist, three creation scopes, Super Administrator access, individual PDFs, cash popup |
| [Billing, cash, media, and communications](docs/09-billing-cash-media-update.md) | Direct admin receipts, metered water, cash ledger, PDF exports, news images, WhatsApp templates |
| [UI/UX review](docs/08-ui-ux-review.md) | Component colors, contrast, responsive role management, and remaining usability checks |
| [Roles and election terms](docs/07-roles-and-terms.md) | Fixed permissions, elected appointments, permanent Super Administrator, authorization enforcement contract (provider details superseded) |
| [MVP implementation specification](docs/05-mvp-implementation-specification.md) | Final stack, dynamic fee configuration, planned relational schema (provider details superseded), access matrix, and build acceptance gates |
| [Terminology and naming](docs/00-terminology-and-naming.md) | Standard terms, role names, interface labels, and status codes |
| [Product plan](docs/01-product-plan.md) | Scope, roles, business rules, and release priorities |
| [Data model](docs/02-data-model.md) | Entities, relationships, history, and data constraints |
| [Experience design](docs/03-experience-design.md) | Navigation, desktop/mobile layouts, and workflows |
| [Architecture and delivery](docs/04-architecture-and-delivery.md) | System boundaries, development order, acceptance checks, and rollout |

## Confirmed requirements

- Desktop and mobile web access; login with a phone number or email address and a password.
- MVP accounts, access approval, login identifier changes, and password resets are managed manually by neighborhood administrators. No email/SMS verification, public registration, or automated recovery is required.
- Elected administrators are residents with dated, combinable role appointments. Super Administrator has no automatic expiry and controls appointments; expiry preserves resident access.
- Administrators manage residents, units, invoices, reminders, and activity news and media.
- Fee categories, fee items, amounts, schedules, billing responsibility, and vacancy treatment are configurable by administrators. Example fees are not fixed product rules.
- Residents view authorized unit information, invoices, news, and service contacts, and submit service requests.
- Residents submit bank-transfer/cash details for verification, or billing staff record and verify direct payments without resident submission. Monthly metered water, cash income/expense notes, billing/cash PDF exports, news images, and configurable WhatsApp templates are included in the mockup.
- Resident letters are administrative documents issued by neighborhood administration.
- Gate access consists of contact information; opening the gate and handling keys remain manual.
- A public landing page is available to visitors.
- One neighborhood at launch; multiple neighborhood customers may be supported later.

The original request also includes occupancy history and guest reporting. The first guest workflow is a resident notification with manual acknowledgement. A staffed visitor check-in/out log would be an additional workflow.

## Technology decisions

- Database: **Neon PostgreSQL**, selected by the user (supersedes the earlier Supabase plan).
- Implementation baseline: **Next.js App Router + TypeScript**, **Tailwind CSS + shadcn/ui**, **Neon Auth**, and **Neon Object Storage**.
- The [MVP implementation specification](docs/05-mvp-implementation-specification.md) consolidates the finalized technical decisions.

## Recommended foundations

1. A **tenant** is a neighborhood customer. A **renter** is a person renting a unit. These are different concepts.
2. A **unit** is the physical home. Ownership and occupancy are separate records with effective dates.
3. A **person** is someone in neighborhood records. A **user account** grants login access. Owners, children, and other occupants can exist without accounts.
4. An **invoice** is an amount owed. A **payment submission** is a claim of payment. Only verification changes the settled amount.
5. A **resident letter request** is a private service workflow; its documents and progress do not appear in the public news portal.

## Implementation defaults and deployment setup

- Indonesian labels, IDR, and Asia/Jakarta are implementation defaults; language and timezone belong to neighborhood settings.
- An example fee item is **Community dues** (Iuran warga; locally called kas where appropriate). **Cash** is a payment method. A cash/bank accounting ledger is a separate feature if required.
- Initial water charges are fixed or manually entered. Meter readings and tariffs are a later extension unless essential at launch.
- Initial reminders use an administrator previewing a message and opening WhatsApp manually. Automated delivery is a later integration.
- Owners and occupants do not automatically share every invoice, personal document, or historical record. Access is explicitly granted.
- Indonesian/IDR/Jakarta, monthly or one-time charges, and fixed/manual water charges are the implementation defaults. Neighborhood-specific values are entered during administrator setup. Delivery estimates remain provisional.

## Build sequence

Start with accounts, permissions, units, people, ownership, and occupancy. Complete one end-to-end billing cycle next. Add news, contacts, service requests, and resident letters before the neighborhood pilot. Introduce payment gateways, automatic WhatsApp delivery, QR visitors, and customer self-onboarding only after the pilot establishes a need.

The exported system-design DOCX is the original planning snapshot; the linked Markdown contracts contain the subsequent approved RBAC, cluster, billing, cash, and media updates.

Latest prototype changes: [monthly billing matrix](docs/11-billing-matrix.md), [resident contacts, occupancy, WhatsApp templates, and shared controls](docs/12-residents-and-template-editor.md).

Current workflows: [complete resident editing, rental check-in/check-out, nested bills, and financial reports](docs/13-resident-stays-nested-bills-finance.md).

Latest QA: [public, resident, and administrator UI/UX regression review](docs/14-ui-ux-regression-review.md).

Current infrastructure setup: [Neon setup and verification](docs/15-neon-setup.md). Earlier planning documents retain Supabase-specific details as historical design notes; they must be adapted to Neon before backend implementation.

Deployed database: [Neon schema and server access](docs/16-neon-database-schema.md). Production contains 47 application tables, two reporting views and seven applied migrations. Run `npm run db:status` to inspect it. The main frontend still uses demo data until its feature adapters are connected.

Latest implementation: [phone login and live core data](docs/17-phone-login-and-live-core.md). Run `npm run setup:admin` locally to enter the first permanent administrator password privately; the approved name and phone are already configured in ignored local settings.
