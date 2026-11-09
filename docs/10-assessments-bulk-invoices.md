# Payment assessments, item verification, bulk issuance, and individual invoices

Confirmed additions: two payment-confirmation paths; per-item payment checklists; Super Administrator access to all features; individual invoice PDF downloads; period-wide/selected/individual issuance for both iuran and water; cash entry in a popup. The user clarified that bulk period means all eligible units in **one month**, not several months.

## Two assessment paths

| Path | Interface | Outcome |
| --- | --- | --- |
| Resident self assessment | **Konfirmasi mandiri warga** | Resident selects paid items, may enter a partial amount per selected item, supplies method/date/proof or receipt reference, and submits. It remains pending until staff verification. |
| Admin-assisted assessment | **Konfirmasi dibantu pengurus** | Billing staff help a resident by selecting paid items and recording actual cash/bank receipt information. Staff explicitly confirm receipt and verify in one action; no resident submission is required. |

Assessment confirms payment against configured charges; it does not let residents change fee rates or issued invoice amounts. Record source, submitting/recording actor, reviewing actor, timestamps, and financial reference. Super Administrator can perform both administrative workflows and every other administration feature within the authorized neighborhood context.

## Per-item verification and settlement

Show all invoice items with an individual checkbox, amount already paid, remaining amount, and an editable allocation amount for a selected unpaid item. Fully paid items are marked and disabled. Staff verification preloads the resident's proposed allocation and can confirm the actual allocation after checking the payment. The confirmed total must equal the receipt/submission amount exactly.

Reject empty selections, duplicate/unknown item references, nonpositive/fractional-IDR/unsafe amounts, amounts exceeding an item's remaining balance, receipt-total mismatch, duplicate receipt IDs, and already-reviewed submissions. Pending and rejected proposals never change settlement. On verification, update only the selected item balances and the invoice balance in the same transaction; cash income still records the payment once, not once per item.

Preserve proposed and verified allocations separately. When they differ, show both in payment history. Invoice details display which items are paid/partial/unpaid and retain the total invoice balance. A receipt can partially cover one or several items. Rejection preserves the invoice and item balances and requires an explanation.

The compact prototype uses immutable invoice item positions as references and an `itemPaid` vector. Production requires stable invoice-item UUIDs and `payment_item_allocations(tenant_id, payment_id, invoice_id, invoice_item_id, amount, stage/provenance)` with composite foreign keys, protected writes, row locks, idempotency, audit, and explicit reversals. Each allocation must belong to the same invoice/resident/tenant/currency as its payment. Do not derive actual allocation from the order of items.

### Earlier unallocated payments

Older browser snapshots may contain a paid total without item details. Do not guess which items were paid. An authorized staff member first uses **Alokasikan pembayaran sebelumnya** to allocate exactly that historical credit to the correct items. Record actor/time/allocations, without creating a payment, changing the invoice paid total, or increasing cash income. Residents are directed to ask staff for this reconciliation before submitting a new payment. A fully paid invoice's items are all settled; a one-item invoice has an unambiguous item balance.

New fictional seed records include explicit opening item allocations; these are example data, not a migration rule for older records. Real production opening balances and allocations require reconciliation from actual evidence.

## Super Administrator

The protected `ADMIN_FEATURES` list is the complete administration workspace, used by the Super Administrator role. Every elected-role capability is a subset. Active Super Administrators can manage accounts/appointments, residents/clusters, fees, all invoice scopes, assisted assessments, legacy reconciliation, verification, cash transactions, templates, media, services, reports, and invoice exports. Account/session checks, tenant context, audit, and protection of the last active Super Administrator still apply.

## Iuran and water issuance scopes

Both bill types are selected through **Tagihan → Buat tagihan** and support:

- **Bulk periode:** all eligible units in one selected month. Existing issued occurrences are skipped and never re-created.
- **Bulk unit terpilih:** choose units using a searchable checklist, with select-search-results and clear controls. Deduplicate selection and reject unknown/empty scope.
- **Individual:** choose one unit. A resident-row Detail creation action preselects that unit and month.

Iuran previews apply configured rates, scope precedence, responsible person, vacancy rules, and date applicability. The preview and final issuance use the same selected unit set. A separate water invoice does not suppress creation of that month's general dues invoice.

Bulk water retains a separate previous/current reading, rate, responsible person, and computed amount for every selected unit, with a common due date. Carry forward an earlier closing reading when present; otherwise require the actual opening reading. No copied or estimated usage is assumed across households. Already billed units are shown as skipped. Every eligible row must be complete and valid before issuance. Validate all rows and commit the entire batch atomically; a failed reading must not leave a partly issued batch. The browser prototype builds the entire next state before saving; Supabase production requires a transaction or a controlled durable job with explicit atomicity/recovery semantics.

## Individual invoice PDF

Each **Rincian tagihan** view includes **Unduh invoice (PDF)** for the authorized resident and staff. Export one bill with invoice number, resident, unit, period, due date, items, per-item paid/remaining amounts, invoice paid/remaining totals, and status. Use an invoice/unit-specific filename. For unknown historical allocation, label it explicitly while preserving the verified invoice total. A single invoice export must not contain another household's records or private payment proofs. Access must be rechecked server-side in production.

The app uses its shared PDF renderer with an invoice-specific details block. A rendered one-page example was inspected and its totals checked; the browser download action was also exercised.

## Cash entry popup

**Kas lingkungan** remains the summary and transaction-list landing page. **Catat transaksi kas** opens a native dialog with type, date, category, amount, use/source note, and optional proof filename. Save closes the popup and refreshes the ledger; Cancel, close, and Escape return to the ledger. The popup uses the established neutral/teal component palette.

## Validation

Domain tests cover both assessment sources, selected-item settlement, unchanged pending/rejected balances, receipt/allocation consistency, preservation of the original proposal, explicit legacy reconciliation without duplicate income, full Super Administrator capabilities, all three unit scopes, atomic per-unit water batching, and invoice-document privacy/content. Browser review exercised a resident submission followed by staff verification, an assisted item payment, explicit old-credit allocation, selected water readings with different amounts, selected iuran issuance, period-wide previews, individual scope selection, individual PDF download, and cash popup save.

All records remain fictional browser-local data. Database transactions/RLS, real file storage, immutable production audit and financial corrections, secure resident entitlement, and production reconciliation remain implementation gates.
