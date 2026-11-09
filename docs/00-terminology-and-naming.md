# Terminology and naming standard

Use this reference across requirements, designs, database models, and future implementation. English is the specification language; Indonesian labels below define the default localization. Naming changes do not change the agreed feature scope.

## 1. Core terminology

| Preferred term | Meaning | Usage rule |
| --- | --- | --- |
| Neighborhood | The residential community being managed | Use in the interface and business documents |
| Tenant | An isolated neighborhood customer in the platform | Technical architecture only; never use for a renter |
| Cluster | A named group of units within a neighborhood | Keep the local housing term consistently |
| Unit | A physical residential property | Replace housing record, house record, and home when naming the entity |
| Person | An individual recorded by a neighborhood | May be an owner, occupant, or both; may have no account |
| Owner | A person with a dated ownership relationship to a unit | Ownership does not imply occupancy |
| Occupant | A person living in a unit during a recorded period | Occupancy does not imply ownership |
| Renter | An occupant renting a unit | Use renter, never tenant, for this meaning |
| Resident | A person living in the neighborhood; also the resident-facing access role | The Resident role may also be assigned to an authorized non-resident owner; access still depends on explicit relationships |
| User account | A login identity | Do not interchange with person or resident record |
| Neighborhood membership | A user account's authorized association with a neighborhood | Stored in `tenant_memberships` |
| Ownership period | Effective dates of a person's unit ownership | Stored in `unit_ownerships` |
| Occupancy period | Effective dates of a unit's occupancy group | Stored in `unit_occupancies`; people are linked through `occupancy_members` |
| Occupancy status | Occupied or vacant at a selected date | Derived from occupancy periods |
| Occupancy type | Owner-occupied, rented, caretaker-occupied, or other | Separate from occupancy status |
| Primary contact | Designated contact for a specified relationship | Say primary owner contact or primary occupant contact when needed |
| Verification document | Evidence submitted for identity or relationship review | ID card and family card are document types |
| Resident letter | An administrative letter issued by neighborhood administration | Do not call it a housing certificate or property certificate |
| Letter request | An application for a resident letter | Distinguish the application from the issued document |
| Service request | A resident's issue, complaint, or suggestion submitted for action | Reserve report for analytics or exported reports |
| Guest report | A resident's notification of an expected guest visit | Does not mean gate authorization or confirmed admission |
| News post | A published news item, announcement, or event update | Use post for the content entity; update remains an ordinary descriptive word |

## 2. Billing terminology

| Preferred term | Meaning | Avoid |
| --- | --- | --- |
| Fee category | Administrator-defined grouping of fee items | Bill type when referring to a fee |
| Fee item | Administrator-defined chargeable item, with a stable code and editable name | Hardcoded charge types |
| Fee schedule | Effective charging rules and amounts | Tariff, except for metered utility pricing |
| Invoice | Issued itemized amount owed | Bill as a competing entity or navigation label |
| Billing responsibility | Who owes a fee item's charge for a unit and period | Assuming the current occupant is always responsible |
| Bill-to person | The person named as responsible on an invoice | Payer when responsibility is intended |
| Payment submission | A resident's reported transfer or cash handover, awaiting a decision | Payment report, payment request, or confirmed payment |
| Verified payment | A submission accepted by a billing administrator | Approved payment, since verification is the defined action |
| Payment allocation | Amount applied to an invoice | Treating an uploaded receipt as settlement |
| Payment receipt | Platform record of a verified payment | Payment proof, which is evidence supplied for review |
| Outstanding balance | Amount remaining after effective verified allocations | Remaining balance or unpaid amount as competing metric labels |
| Overdue balance | Outstanding amount past its due date | Overdue as an invoice lifecycle state |
| Collections | Verified amounts under the dashboard's stated allocation/date basis | Cash balance or available funds |
| Payment reminder | Message about an invoice's outstanding balance | WA reminder as a module name; use WhatsApp for the channel |

Example fee items: **Community dues** (`community_dues`, Iuran warga), **Cleaning fee** (`cleaning_fee`, Iuran kebersihan), **Security fee** (`security_fee`, Iuran keamanan), and **Water charge** (`water_charge`, Tagihan air). Cash means the payment method; it is not the English name for community dues. Administrators can add, rename, and archive categories/items and set amounts without code changes. The examples are optional and never a fixed enum. Whether community dues are locally called kas is configured by the administrator.

## 3. Roles and navigation labels

Role names are **Super Administrator**, **Resident Administrator** (code `neighborhood_admin`, Indonesian **Administrator warga**), **Billing administrator**, **Content administrator**, **Service administrator**, **Security officer** (optional), and **Resident**. Use staff only as a collective term. A **Public visitor** is an unauthenticated audience, not an assigned role. The **Super Administrator** is platform-scoped, permanent until revoked, and separate from elected neighborhood appointments. See [roles and election terms](07-roles-and-terms.md).

| Surface | English labels | Default Indonesian labels |
| --- | --- | --- |
| Administration navigation | Dashboard; Residents and units; Billing; Content; Services; Settings | Dasbor; Warga dan unit; Penagihan; Konten; Layanan; Pengaturan |
| Resident navigation | Home; Invoices; News; Services; Account | Beranda; Tagihan; Berita; Layanan; Akun |
| Unit details | Overview; People and history; Billing; Documents; Activity | Ringkasan; Data orang dan riwayat; Penagihan; Dokumen; Aktivitas |
| Services | Resident letters; Service requests; Guest reports; Contacts | Surat warga; Permintaan layanan; Laporan tamu; Kontak |
| Main actions | Sign in; Sign out; Submit payment; Request a letter; Submit a service request; Contact gate security | Masuk; Keluar; Kirim konfirmasi pembayaran; Ajukan surat; Kirim permintaan layanan; Hubungi keamanan gerbang |

Use **Sign in** as an action and **login** only as a technical noun/modifier. Use sentence case for visible labels. Use verbs for actions and nouns for destinations. Keep labels identical across desktop and mobile; do not abbreviate Account to Me. Public pages, resident portal, and administration workspace are the three surface names.

## 4. Status codes and display labels

Machine codes use lowercase `snake_case`. Display labels use sentence case. Different workflows retain their own status sets; do not force unrelated processes to share an enum.

| Workflow | Machine codes → English labels |
| --- | --- |
| Document verification | `submitted` → Pending review; `approved` → Approved; `rejected` → Rejected |
| Invoice lifecycle | `draft` → Draft; `issued` → Issued; `void` → Voided |
| Invoice settlement, derived | `unpaid` → Unpaid; `partially_paid` → Partially paid; `paid` → Paid |
| Payment verification | `submitted` → Pending verification; `verified` → Verified; `rejected` → Rejected |
| Payment reversal, separate record | Show Reversed when a verified payment has a full reversal; do not add an undocumented payment status |
| Letter request | `draft` → Draft; `submitted` → Submitted; `under_review` → Under review; `needs_revision` → Revision required; `approved` → Approved; `issued` → Issued; `rejected` → Rejected; `cancelled` → Cancelled |
| Service request | `submitted` → Submitted; `acknowledged` → Acknowledged; `in_progress` → In progress; `resolved` → Resolved; `closed` → Closed |
| News post | `draft` → Draft; `published` → Published; `archived` → Archived |
| Guest report | `reported` → Reported; `acknowledged` → Acknowledged; `cancelled` → Cancelled |
| Manual payment reminder | `prepared` → Prepared; `opened` → WhatsApp opened; `admin_reported_sent` → Marked as sent by administrator |

Use **Pending verification**, **Outstanding balance**, and **Overdue balance** consistently in financial screens. Amounts under review do not reduce the outstanding balance. Overdue and reversed indicators are derived conditions, not substitutes for the lifecycle statuses above.

## 5. Technical naming conventions

- Entities use singular English nouns in prose: unit, person, invoice, payment. Table names use plural `snake_case`: `units`, `people`, `invoices`, `payments`.
- Keep technical tenancy names: `tenants`, `tenant_id`, `tenant_memberships`. The interface displays Neighborhood.
- Use explicit foreign keys such as `unit_id`, `person_id`, `invoice_id`, and `service_request_id`. Avoid generic `request_id` for a domain foreign key; it may mean a trace/correlation ID in audit records.
- Use `service_requests`, `service_request_updates`, `letter_requests`, `letter_request_events`, and `guest_reports` consistently. `payments` stores payment submissions and their verification outcome; a separate renamed payment entity is unnecessary.
- Use `occupancy_type` with `owner_occupied`, `rented`, `caretaker`, or `other`. Display caretaker as Caretaker-occupied. Occupancy status is derived as Occupied or Vacant.
- Use `_at` for event timestamps, `_date` for calendar dates, `_id` for references, and `is_`/`has_` for Boolean fields. Date ranges use `start_date` and `end_date`; named validity periods may retain explicit `effective_from`/`effective_to`.
- Use role codes `super_admin` (platform only), `neighborhood_admin`, `billing_admin`, `content_admin`, `service_admin`, `security_officer`, and `resident`. Technical codes do not dictate visible labels.
- Write phone number and email address in user-facing copy. Use WhatsApp rather than WA. Define an acronym at its first explanatory use.

Apply these conventions to future code in the selected language's normal style. This document standardizes domain names; it does not choose a programming language or change implementation scope.

## 6. MVP account labels

Use **Create account**, **Approve access**, **Change login identifier**, **Reset password**, **Deactivate account**, **Change password**, and **Contact administrator**. Use **Administrator approved** for manual approval; reserve **Email verified** and **Phone verified** for actual channel verification after the MVP. Email/SMS verification, public registration, automated invitations, and self-service password recovery are deferred. Document review and payment verification keep their existing meanings.
