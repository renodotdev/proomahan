# Billing, cash, media, and communications update

Confirmed user additions on 7 November 2026. This contract supersedes the earlier deferral of metered water and a basic neighborhood cash ledger. The current implementation is a browser-local interactive prototype; the production requirements below remain the Supabase implementation contract.

## Administrator-assisted payments

Billing Administrators and Super Administrators can use **Tagihan → Catat pembayaran** without a prior resident submission. Require amount, payment date, method (cash/bank transfer), receiving officer or transaction reference, and confirmation that the receipt/transaction was checked. Optional proof accompanies the record. Create a verified payment and its allocation atomically, record source `admin`, recorder/verifier and timestamps, and update settlement from effective allocations. Partial payments remain partial; never directly toggle an invoice to paid.

If a resident submission is pending, the quick action opens **Tinjau pembayaran** instead of creating a second receipt. Reject duplicate requests, nonpositive/unsafe amounts, over-allocation, invalid dates, and actors whose appointment has expired. Historical payment actors and sources survive role handover. Resident history shows administrator-recorded receipts. Production uses idempotency keys, row locks, append-only payment events, and explicit reversals for mistakes.

Invoice rows/cards expose **Detail**, **Pengingat WA**, and **Catat pembayaran / Tinjau pembayaran**. Paid invoices disable payment/reminder actions; pending submissions disable reminders until reviewed. Search matches unit, resident name, and invoice number. Mobile cards keep all actions visible.

## Monthly metered water

Use **Tagihan → Buat tagihan → Tagihan air** to select month, unit, bill-to resident/owner, prior/current readings in m³, tariff in IDR/m³, and due date. The pilot calculates `(current - previous) × unit tariff`, rounded to the nearest rupiah. Readings support up to three decimal places. Tariff is configurable at issuance; no static water charge is included in new recurring general-dues invoices.

The first reading requires a known opening meter value. Subsequent periods carry forward the prior issued closing reading. Reject decreasing readings, earlier-period insertion after later readings have issued, invalid responsibility, and duplicate water charges for the same unit/month. Zero consumption produces a zero-value invoice with no payment due. Meter replacement/reset and corrections use an explicit operational workflow before production; the prototype rejects them rather than guessing usage.

Issue a separate water invoice and immutable reading/tariff/responsibility snapshot. General recurring dues and water may coexist in the same month without suppressing one another. Historical combined invoices that already contain a water item prevent a second water invoice for that unit/month. Existing November examples keep their historical fixed water amount; the legacy built-in water tariff is retired for future recurring generation.

Production entities: `meters(tenant_id, unit_id, serial_number, installed_at, retired_at?)`, `meter_readings(tenant_id, meter_id, billing_period, previous_reading_id?, opening_value, closing_value, read_at, recorded_by, status)`, effective-dated `water_tariffs`, and links from invoice items to reading/tariff versions. Use tenant-consistent foreign keys and transactional unique occurrence keys so simultaneous requests cannot double-charge. Bill-to and authorized invoice participants are snapshotted; later occupants do not inherit earlier residents' water debts. Flat unit tariffs are the prototype baseline; tiered tariffs and meter replacements need their own implementation rules.

## Billing reports and PDF export

**Laporan tagihan** filters by invoice period and lists invoice/unit, bill-to person, kind (general dues/water), billed amount, verified paid amount, outstanding balance, and settlement. Totals match the displayed rows. Amount paid is the position when the report is generated; it differs from cash receipts grouped by payment date. Pending submissions do not reduce the balance.

**Ekspor PDF** generates a paginated landscape A4 report with repeated table headers, summary, neighborhood/period, page numbering, and a sample-data notice in the prototype. The browser can download both billing and cash reports. Production exports must reauthorize the requesting staff member and scope every row to the neighborhood; mark exports with generation time and actor. Household billing exports remain administrative, not public attachments to a broadcast.

## Cash ledger and budget-use notes

**Kas lingkungan** records expense or non-invoice income, date, category, amount, purpose/source note, optional proof, recorder, and timestamp. The purpose field captures budget use such as facility repairs or security supplies. Verified invoice receipts enter income automatically exactly once; pending/rejected submissions do not. Manual income is for sources other than invoice payments, avoiding duplicate recording.

For each month: `closing book balance = opening book balance + verified income - recorded expenses`. Opening for a later month includes all earlier recorded transactions. This is a combined neighborhood funds book, not a separately reconciled bank/cash account system. The prototype has a configurable initial balance and a clearly labeled synthetic legacy-income entry that reconciles the old example invoices whose receipt records were not originally included. Production migration must reconcile actual opening balances and receipts; never invent a production receipt to match a dashboard.

Production entities: `fund_accounts`, `fund_opening_balances`, `cash_categories`, `cash_transactions`, optional proof-file links, and audit events. Verified payment references are unique in ledger income; do not create a second manually editable receipt copy. Amounts are positive integers with an explicit income/expense direction. Opening adjustments and corrections are audited transactions with authorized reasons, preserving earlier reports. Add bank/cash separation, transfers, formal budgets/approvals, and reconciliation only when those workflows are defined. The requested MVP capability is a cash ledger with budget-use notes, not full double-entry accounting.

## Configurable WhatsApp templates

Billing staff manage four fixed template types under **Template WhatsApp**:

| Type | Allowed variables |
| --- | --- |
| Invoice reminder | `{nama}`, `{unit}`, `{periode}`, `{nominal}`, `{jatuh_tempo}` |
| Water invoice | Same variables, populated from the selected water invoice |
| Cash expense | `{tanggal}`, `{kategori}`, `{nominal}`, `{catatan}` |
| Monthly cash report | `{periode}`, `{saldo_awal}`, `{pemasukan}`, `{pengeluaran}`, `{saldo_akhir}` |

Templates are saved, nonempty, length-bounded, and validate placeholder names. Invoice quick reminders, expense rows, and monthly cash reports use the configured template, populate its transaction values, and open an editable preview. **Buka WhatsApp** opens a click-to-chat draft/contact selection; the administrator selects the recipient and sends manually. Opening a draft does not prove delivery. No automatic WhatsApp delivery or recipient-number guessing is implemented, and no messages were sent during QA. Production templates/audit are tenant-scoped; sharing a cash summary must not expose unrelated household debts or identity files.

## News image attachments

The news editor accepts one JPEG/PNG/WebP image up to 2 MB, validates decoding, downsizes it for the browser-local preview, and shows a removable preview before publication. News cards, article details, and the resident feature display the image. Public/resident audience rules apply to both the article and image. Browser storage quota errors are visible instead of silently promising persistence.

The prototype stores a bounded JPEG data URL in the post and stores only filenames for financial proof files. Production must use purpose-tagged Supabase Storage objects, validated MIME/content/size, image inspection, scoped upload authorization, and publication/audience-aware download rules. Private proof/identity images cannot be reused as public news media. News images and report PDFs are separate data purposes.

## Verification and limits

Domain tests cover administrator-only direct receipts, partial/full settlement, duplicates/overpayment/pending conflicts, metered amount and carry-forward, historical water duplicate protection, recurring-dues coexistence, migration, cash reconciliation, template variables, and calendar dates. Browser checks exercised a 15 m³ / Rp5,000 tariff producing Rp75,000, a Rp25,000 direct receipt leaving Rp50,000, the corresponding cash income, a Rp150,000 expense, saved template substitution, PDF download, and image publication/persistence. Desktop/mobile component colors retain the agreed teal/neutral palette and readable validation surfaces. Example PDFs are visually reviewed across all pages.

Supabase policies, real storage, concurrent financial transactions, immutable audit/reversals, production financial migration/reconciliation, secure server-side exports, and real-user usability testing remain required before launch.

## Unified billing navigation (latest approved interaction)

The administration workspace has one **Tagihan** menu. Its landing page is a monthly resident/unit list with separate iuran and water amounts, total issued charges, remaining balance, settlement, search, and status filters. Meter entry is not shown on this landing page. **Buat tagihan** opens a choice between **Tagihan iuran** and **Tagihan air**. **Detail** on a resident row offers the same choice for that unit/month. Unbilled detail choices open the corresponding creation form; billed choices open the existing invoice. Multiple bill-to invoices require selecting the relevant invoice.

Iuran creation supports all units or a selected unit and an arbitrary supported month. Water creation opens the meter form in a dialog with the selected unit/month. Issuance closes the form and refreshes the unified list. Quick payment and WhatsApp actions also select the relevant invoice type before opening the existing receipt/review or message workflow. The separate water navigation entry is removed; old `view=water` links resolve to Tagihan.

For historical combined invoices, iuran and water columns show their respective item amounts while total/paid/outstanding count the invoice once. The detail chooser explains that both choices refer to the same combined invoice. No allocation of a combined payment to water-only settlement is invented. New separate invoices combine into one resident summary without being merged or changing their snapshots.
