# Proomahan prototype review

Brand: Proomahan. Neighborhood: D'Park City. Interface: Indonesian. Visual direction: minimal, approachable, teal and neutral. This responsive Next.js prototype demonstrates the agreed interface and core workflows using fictional examples dated 7 November 2026.

## Explore the three perspectives

- **Admin:** dashboard, resident/unit directory and details, invoices, payment review, editable fees and special tariffs, accounts, news, services, and example settings.
- **Warga:** resident home, own unit, own invoices, payment confirmation, service/letter/guest forms and progress, contacts, news, and account preferences.
- **Publik:** neighborhood introduction, public news only, service contacts, and the sign-in preview.

Switch perspectives using the preview bar. The sign-in page also provides sample administrator/resident selections. These controls simulate access; they are not production authentication or authorization.

## Review the core workflows

1. **Configure a fee.** In Admin → Pengaturan biaya, edit an amount or add an item/category. Use Tarif khusus on an existing item to set a unit/cluster tariff. Effective dates and monthly/one-time frequency control the next preview.
2. **Preview invoices.** In Admin → Tagihan → Buat tagihan, choose December 2026. A unit tariff replaces the general tariff for the same item. November invoices retain their old amount. Issue the example invoices, then retry the same period to see duplicate generation blocked.
3. **Submit and verify payment.** In Warga → Tagihan, open the November invoice for A-12. Submit a cash confirmation with a collector/reference, or a transfer with a fictional attachment. The outstanding amount stays unchanged while pending. Switch to Admin → Pembayaran to verify or reject it; switch back to see the resulting balance/status and review history.
4. **Request a letter or service.** In Warga → Layanan, submit a letter, issue, or guest report. In Admin → Layanan warga, open it and advance the review. A letter moves through review, revision/approval, and simulated issuance with a supplied example PDF. A guest acknowledgement does not open a gate.
5. **Manage clusters.** Admin → Warga dan unit → Kelola klaster. Add a unique name/code, edit a cluster, inspect its units/occupancy, archive, and restore. New-unit and new-fee choices include active clusters only; unit filters retain archived clusters. Renaming updates linked labels/scopes, while issued invoices keep their amounts. Existing units and fees continue after archiving.
6. **Manage the directory/accounts.** Search/filter units, inspect ownership/occupancy history and invoice tabs, add a fictional unit, or download the example CSV. Account creation/reset shows a fixed sample temporary password; no real Auth account or credential is created.
7. **Manage elected roles.** Admin → Peran dan masa jabatan: appoint, renew, or revoke with a reason. Use the simulation account/time controls to view Budi’s billing-only access and its expiry at 1 January 2027 00:00 WIB. Nadia’s platform role has no expiry. Accounts remain separate from appointments. See [role review scenarios](07-roles-and-terms.md).
8. **Publish news.** Admin → Berita dan kegiatan → Tulis berita can publish a fictional announcement. Resident-only items stay out of the public news list; public items appear in both views.

## Validation and limits

The domain tests cover pending versus verified balances, rejection reasons, duplicate verification, excess submissions, rate snapshots, duplicate invoice generation, date applicability, and unit-rate precedence. Type checking and production builds validate the Next.js source. Browser review exercises desktop/mobile views, cash confirmation and verification, letter submission, and a unit tariff's effect on the invoice preview.

This is a review prototype. Local storage holds sample records in one browser. It does not provide real access enforcement, database transactions, multi-user concurrency, cryptographic account controls, payment reconciliation, document scanning, signed-document generation, or production audit. Settings and communication preferences are interface simulations. Uploaded file contents are not stored; only an example filename may be retained. Payment evidence and receipts are illustrations, not bank records. No WhatsApp messages, emails, SMS messages, or actual payments are sent.

Start the real implementation from the finalized schema and permission specification after reviewing the screens. The prototype's compact fixture model is not a replacement for the production relational schema.

Cluster management uses browser-local records and migrates earlier demo snapshots without clearing invoices, units, or appointments. The production schema will use cluster IDs for unit and fee foreign keys; the compact prototype updates its display-name references together on rename.

## New billing, cash, and media review paths

- **Tagihan:** search by unit/name; use Pengingat WA or Catat pembayaran. Pending resident submissions open Tinjau pembayaran. Admin recording supports partial payments and records the staff member without requiring resident submission.
- **Tagihan → Buat tagihan → Tagihan air:** select December or another month, unit and responsible person; enter prior/current readings, rate, and due date. Issue and inspect the water invoice. November examples retain the water amount already on their original invoices.
- **Laporan tagihan:** choose invoice period and export PDF. **Kas lingkungan:** record an expense/use-of-budget note or other income; verified receipts enter automatically. Check monthly opening/income/expense/closing figures, PDF export, and WA summaries.
- **Template WhatsApp:** edit invoice, water, expense, and monthly cash templates with the shown variables. Quick previews use saved text and allow manual editing before opening WhatsApp. No automatic messages are sent.
- **Berita dan kegiatan:** Tulis berita → attach a JPG/PNG/WebP up to 2 MB → inspect preview → publish → reload to verify the image remains. Photos are stored locally for the prototype; financial evidence remains filename-only.

See the [approved update and production limits](09-billing-cash-media-update.md).

The latest Tagihan landing is a unified resident/unit list for iuran and water. **Buat tagihan** and each row's **Detail** open a bill-type chooser. Select Tagihan iuran for the configured-fee preview (all units or the selected unit), or Tagihan air for the meter dialog. Invoice-type selection also applies to quick payment/reminder actions. Issuance updates the monthly list and closes the form.

## Assessment and bulk issuance review

- **Resident:** open an invoice → Konfirmasi pembayaran → select items and amounts → submit. Balance stays unchanged until verification.
- **Staff:** Tagihan → payment action → choose invoice type → select/confirm items. Direct receipts use Konfirmasi dibantu pengurus; resident submissions use Tinjau pembayaran. Unknown old item allocations are explicitly reconciled first without adding cash income.
- **Creation:** choose iuran/air, then Bulk periode, Bulk unit terpilih, or Individual. Bulk period means one month. Water requires each selected unit's readings and rate.
- **Invoice:** Rincian tagihan → Unduh invoice (PDF), available in resident and staff views.
- **Cash:** Kas lingkungan → Catat transaksi kas opens a popup. Saving returns to the ledger.

See [the current assessment/bulk contract](10-assessments-bulk-invoices.md) for rules and prototype limits.

The latest Tagihan page is the monthly matrix described in [11-billing-matrix.md](11-billing-matrix.md). Try a cluster filter, page 2, resident search, and each of Iuran / Air / Sisa. Review the invoice action footer and both confirmation paths. Desktop and mobile screenshots are saved under `artifacts/mockup/billing-matrix-*.jpg`.
