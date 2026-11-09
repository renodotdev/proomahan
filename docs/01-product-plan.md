# Product plan

Terminology follows the [terminology and naming standard](00-terminology-and-naming.md).

Status: finalized MVP planning baseline. Requirements are recorded in [the project overview](../README.md); technical defaults and configuration rules are consolidated in the [MVP implementation specification](05-mvp-implementation-specification.md).

## 1. Objective and opportunity

Give administrators a reliable record of who owns and occupies each unit, what is owed and paid, and which resident services need action. Give residents one place to check their information, submit payments, follow neighborhood updates, request letters, and find help.

No current spreadsheets, operating procedures, unit counts, or migration samples were supplied. The existing process and its pain points still need a short discovery session; this plan does not assume how the neighborhood currently works.

## 2. Roles and permissions

Elected staff roles are neighborhood-scoped, time-limited, and can be combined for a small administration team. Super Administrator is a separate platform role without automatic expiry. Resident access is independent of staff terms. [Roles and election terms](07-roles-and-terms.md) defines the current appointment rules. Keep permissions distinct even if one person initially holds several roles.

| Role | Main permissions | Sensitive limits |
| --- | --- | --- |
| Super Administrator | All modules in an explicitly selected neighborhood; appoint/renew/revoke staff; configure neighborhood | No automatic expiry; revocable; protect last active Super Administrator; audit privileged access |
| Resident Administrator | Manage ordinary local resident accounts, units, ownership, occupancy, and people | No appointment control, privileged account resets, or implicit billing access; sensitive review capability tied to active appointment |
| Billing administrator | Configure fees; issue invoices; review payments; prepare reminders; export billing reports | Sees billing contacts and payment proof; no default access to identity/family cards |
| Content administrator | Draft/publish news, announcements, and media | No default access to invoices, resident documents, or private service requests |
| Service administrator | Handle resident letters, service requests, and service contacts | Only documents and private details required for assigned service work |
| Resident | View explicitly authorized unit and personal data; submit payments, service requests, and letter requests | No general resident directory, other households' data, or automatic access to previous occupants' invoices |
| Security officer, optional | Receive guest reports or update a guest report | No resident identity files or billing information |
| Public visitor | View public landing page, public news, and selected public contacts | Login required for resident information and services |

The platform Super Administrator provisions neighborhoods and appoints elected staff. Private operational access requires an explicit neighborhood context and audit; it is not an ordinary neighborhood role.

## 3. Release scope

| Area | Neighborhood pilot | After the pilot |
| --- | --- | --- |
| Identity | Phone number or email address + password; administrator-created accounts, manual access approval, temporary passwords, administrator-assisted resets | Email/SMS verification, invitations, self-service recovery, MFA, and additional identity providers if needed |
| Resident records | Clusters, units, people, ownership/occupancy history, verification review, validated CSV import/export | Advanced household grouping and self-service change approval |
| Billing | Administrator-defined categories, fee items, amounts, and recurring/manual charges; community dues, cleaning, security, and water are examples; invoice preview; resident/admin-assisted payments and verification; metered water; billing PDF reports; cash income/expense notes and reports; configurable WhatsApp templates | Payment gateway, automatic reconciliation, more advanced adjustments |
| Reminders | Versioned templates, preview, consent/preference, open WhatsApp, administrator activity log | Official WhatsApp integration, scheduled delivery, provider delivery status |
| News and media | Public/resident/cluster audiences; draft, publish, archive; images and event updates | Reactions/likes, RSVPs; comments only if moderation is needed |
| Resident letters | Configurable types; private request form; review, revision, issue; reference number and uploaded signed PDF | Automatic PDF generation, approval chains, supported digital-signature integration |
| Occupancy status and type | Separate occupied/vacant and owner-occupied/rented/caretaker-occupied; dated history | Lease administration if it becomes necessary |
| Resident services | Contacts with hours; gate/security contacts; private service requests and progress; simple guest report | Staffed visitor check-in, QR passes, routing and service targets |
| Public landing | Neighborhood introduction, public news, public contacts, sign-in entry | Additional public pages as needed |

Native mobile applications, automatic physical gate operation, rental contract management, and SaaS subscriptions are outside the initial scope.

## 4. Core journeys and rules

### Onboard a home and residents

1. Administrator creates/imports cluster and unit records, resolving duplicate unit numbers within each cluster.
2. Administrator creates a person, adds ownership and/or occupancy relationships, and selects a primary contact.
3. Required verification evidence is submitted and reviewed only by an authorized reviewer. Requirements vary by person/relationship; do not require every occupant to upload every document.
4. Neighborhood administrator creates a user account, records the login phone number and/or email address, links the approved person/unit relationship, and provides a temporary password manually. No email or SMS verification is sent.
5. Access is activated after the administrator approves the relationship and any required evidence. The resident changes the temporary password at first sign-in. A matching phone number alone does not prove unit ownership or authorize linking.

For forgotten passwords, the resident contacts the neighborhood administrator. After checking the resident against existing neighborhood records, the administrator issues a new temporary password through the dashboard and records the action. Administrators can change login identifiers and deactivate access; passwords are never stored in resident records or displayed after creation/reset. There is no public registration or automated recovery flow in the MVP.

Accounts are individual. A resident can own several units or live in a unit owned by someone else. People without logins remain valid records. A shared family contact phone is allowed in records; login identifiers must resolve to a single account.

### Record a move or ownership transfer

Close the previous period and create the new period in one transaction. Preserve history. Ownership transfer and occupancy change are independent actions. Moving out ends current household access; historical access is limited to the person's own invoices, submissions, receipts, and requests. A former occupant cannot open the new occupants' files.

Vacancy does not imply exemption from every fee. Fee applicability and responsibility are explicit policies, rather than inferred from whoever is currently living there.

### Issue and settle invoices

1. Billing administrator creates fee categories and fee items, then configures a fee schedule: item, neighborhood/cluster/unit scope, effective dates, amount, recurrence, due-date rule, vacancy treatment, and responsible party. Names, items, and amounts are dynamic; no charge is hardcoded.
2. A generation preview shows charges, bill-to person, missing responsibility, duplicates, and exclusions. Unresolved records are blocked from issuing.
3. Administrator issues invoices. Each invoice belongs to one unit and one bill-to person; split owner/occupant liabilities into separate invoices as needed.
4. Resident submits transfer details and proof, or a cash payment submission with handover date and recipient/reference. “Submitted” means pending verification.
5. Billing administrator compares a transfer against bank evidence, or cash against a handover/receipt record, then verifies or rejects with a reason.
6. Verification and payment allocation happen atomically; the resident receives a receipt and the outstanding amount updates.

MVP rules:

- Only verified, unreversed allocations reduce outstanding balances. Pending submissions can be displayed separately but do not count as collected money.
- Support partial payments. A payment may cover several invoices belonging to the same unit and bill-to person. Wider grouping can follow later.
- Prevent duplicate verification and over-allocation, including concurrent actions by two administrators.
- Issued amounts and bill-to snapshots are immutable. Unpaid invoices may be voided with a reason and replaced. Paid-invoice credit notes and refunds need an agreed workflow before enabling those operations.
- Full reversal of an incorrectly verified payment is a privileged, audited correction that reopens the affected balances. It is not evidence that a bank refund occurred.
- Excess received money is shown as unapplied payment and placed in an exception queue; it is not silently discarded or automatically refunded.
- Changing the occupant does not transfer old debt or expose an old invoice to the next occupant. Any debt reassignment requires a separate documented policy.
- Start with simple monthly full-period charges. Proration, late penalties, discounts, and mid-period split liability remain disabled until rules are agreed.

### Remind a resident through WhatsApp

Choose unpaid invoices → resolve an authorized recipient → preview the template and balance → open WhatsApp → administrator reviews and sends manually. Recheck outstanding balance immediately before preparing the message. A paid invoice is skipped; a pending payment is prominently flagged for review.

Record `prepared`, `opened`, or `admin_reported_sent`. Opening WhatsApp is not proof of sending or delivery. Keep message content minimal and use a login-protected invoice link. Never put identity documents or bank proof in reminders.

Example template, proposed Indonesian copy:

> Halo {{resident_name}}, pengingat tagihan {{neighborhood_name}} untuk unit {{unit_label}}, periode {{period_label}}. Sisa tagihan {{outstanding_amount}}, jatuh tempo {{due_date}}. Detail dan konfirmasi pembayaran: {{portal_url}}. Jika sudah membayar, silakan kirim bukti melalui portal. Terima kasih.

Use recorded opt-in and honor opt-out. If official API automation is introduced, business-initiated conversations require approved templates; outside the 24-hour service window approved templates are also required. See the [WhatsApp policy](https://business.whatsapp.com/policy).

### Request a resident letter

Resident selects a letter type and relevant unit → supplies type-specific fields and necessary evidence → submits → service administrator reviews → asks for changes, rejects with a reason, or approves → administrator assigns a unique reference and uploads the issued signed PDF → applicant downloads it.

Keep applicant-visible updates separate from internal review notes. Revisions preserve a history. Proposed letter types, to confirm: proof of residence, administrative introduction letter, and move-in/move-out letters. They are examples, not assumed local requirements. Signing authority and verification requirements must be agreed before launch.

### Read news and request help

- Content administrators choose public, neighborhood-resident, or cluster audiences. Media follows the same audience rules. Resident-submitted event suggestions are private service requests until reviewed for publication.
- Residents submit categorized service requests with optional photo and location/unit, then see status and administrator responses. Other residents cannot see private service requests by default.
- Contact cards show role, phone/WhatsApp, service hours, and last-checked date. Gate opening remains a phone/contact workflow with physical keys handled manually.
- Basic guest reporting: resident records guest name, destination, visit window, and optional vehicle. The assigned service administrator or security officer acknowledges manually; avoid collecting guest ID-card copies by default.

## 5. Dashboard definitions

| Metric | Definition |
| --- | --- |
| Occupied units | Units with an active occupancy period at the selected date |
| Current occupants | Distinct people with active occupant memberships at the selected date |
| Verification queue | Required document reviews still awaiting a decision |
| Issued charges | Total issued, non-void invoice amount for the selected billing period |
| Outstanding balance | Issued total minus verified, unreversed allocations, including partial balances |
| Overdue balance | Outstanding portion of invoices whose due date has passed in neighborhood time |
| Collections in date range | Verified allocations by verification date, less reversals by reversal date; use the same basis in exports |
| Collection rate | Verified allocations against the selected issued-invoice cohort ÷ that cohort's issued total, as of the selected date |
| Work queues | Pending payments, open service requests, and pending letter requests shown separately |

Collection rates and payment-date cash flow are different views. Label date basis and filters. A treasury cash/bank balance requires opening balances, expenses, transfers, and reconciliation; do not label collections as the available cash balance.

## 6. Acceptance stories

| ID | Story | Acceptance criteria |
| --- | --- | --- |
| R1 | As an administrator, I manage resident relationships | Owner and occupants may differ; one person may link to multiple units; move-out preserves history and revokes current household access |
| R2 | As a resident, I access my data securely | Administrator-created account plus approved relationship is required; another unit/person URL returns no private data |
| B1 | As a billing administrator, I issue recurring invoices | Preview shows charges and responsibility; rerunning the same generation does not duplicate charges; errors do not issue partial incorrect invoices |
| B2 | As a resident, I submit a transfer or cash payment | I see a Pending verification status and submission record; no paid receipt or settled balance appears before verification |
| B3 | As a billing administrator, I verify a payment | Evidence and authority are checked; duplicate/concurrent verification applies it once; rejection includes a resident-visible reason |
| B4 | As a billing administrator, I prepare a reminder | Only authorized recipients appear; balance is rechecked; missing consent/contact blocks the action; delivery is never inferred from opening WhatsApp |
| C1 | As a content administrator, I publish updates | Drafts are private; publication and media respect audience; public visitors cannot retrieve resident-only media by direct URL |
| L1 | As a resident, I request a letter | Type-specific validation applies; I can respond to revision requests and download only my authorized issued document |
| S1 | As a resident, I contact staff or submit a service request | Gate contact and hours are visible; my service request remains private; I can follow its status |
| T1 | As a future second neighborhood, my data is isolated | Cross-neighborhood requests, files, exports, jobs, and references are rejected even with a valid record ID |

## 7. Administrator setup and launch inputs

| Setup input | Implementation default | Why it matters |
| --- | --- | --- |
| First neighborhood size, roles, and import source | Obtain actual counts and a redacted sample | Determines import effort and meaningful load targets |
| Fee categories, items, amounts, payers, vacancy, and due dates | Administrator-configurable, effective-dated schedules; no automatic debt transfer | Controls who receives a invoice and who can view it |
| Meaning of kas and treasury needs | Community dues as an optional fee item; collection reporting | An actual cash ledger expands financial scope |
| Water charging | Monthly meter-based charges with resident responsibility and tariff snapshots | Meter replacement/corrections require explicit controlled handling; see [billing update](09-billing-cash-media-update.md) |
| Cash confirmation | Verify against a designated collector's record | A payment submission alone cannot establish receipt of money |
| Identity and family evidence | Collect the minimum required for approved relationships | Determines upload fields, reviewer access, and retention |
| Letter types, signatory, reference format | Small agreed list; signed PDF uploaded by staff | Prevents building the wrong administrative process |
| Guest report fields and recipient | Resident notification to service/security staff; no gate automation | Determines contact routing and whether separate security accounts are needed |
| WhatsApp manual or automated | Manual preview/open first | Automation adds sender setup, approval, provider costs, and delivery handling |
| Locale, retention, hosting, recovery targets | Indonesian/IDR/Jakarta defaults; production settings to record | Needed before production setup and privacy notices |

Validate the plan with one neighborhood administrator, one billing administrator, and two residents representing an owner-occupier and a renter. Walk through a move-out with an unpaid invoice, a partial payment, a rejected payment, and a letter revision before the pilot.

### Dynamic fee acceptance criteria

A billing administrator can add a category and fee item without a code change; configure a monthly or one-time amount; override it for a cluster/unit; select who is billed and whether vacant units are charged; preview the results; and issue invoices. Editing or archiving an item never changes an issued invoice. Different items in one category are separate charges. Missing required configuration blocks issuance rather than guessing a payer or amount.

The [billing, cash, media, and communications update](09-billing-cash-media-update.md) records the approved subsequent scope and supersedes earlier metered-water/treasury deferrals.
