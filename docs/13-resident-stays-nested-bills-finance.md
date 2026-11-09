# Resident editing, rental stays, grouped billing, and financial reports

This update supersedes earlier prototype descriptions of the limited contact editor, generic occupancy change, default billing matrix, and standalone cash ledger.

## Resident editing

Use **Warga dan unit → Edit data**, or **Detail → Edit data warga**. One form groups unit number/cluster/rental designation, owner name/phone/document URL, and current occupant name/phone/document URL/tenure/start date. Required fields are marked. Owner occupation shares owner contact and documents. Empty fields from older saved records remain empty until entered. All resident/house fields currently represented in the prototype can be corrected; status transitions use the check-in/check-out actions. Internal identifiers and recorded audit/history entries are not editable form fields.

Changing a display unit number keeps its stable relationships to invoices, fee scopes, user accounts, and occupancy history. Newly issued invoices snapshot the current display number; old invoice records are not rewritten. Issued invoice names and amounts remain immutable snapshots. Editing the current occupant’s name corrects the current profile; use check-out/check-in when a different person moves.

Only active Super Administrator / Administrator warga access can save resident changes. The editor validates unique unit numbers, active cluster assignment, valid phone/storage URL, rental status, and start dates. Dates cannot be in the future or overlap a previous closed period.

## Check-in and check-out

An empty unit offers **Check-in**. Enter the resident, phone, optional document URL, owner/rented tenure, and start date. Check-in is rejected while another stay is active.

An occupied unit offers **Check-out**. Review the resident and check-in date, enter the departure date, and confirm departure. The unit becomes vacant; the closed stay retains the resident’s details, document link, period, and recording administrator/time. A rental designation persists after checkout, allowing the next tenant to check in. Same-day turnover is supported. Older vacant periods also remain in the timeline. Login/account/role assignment and existing debts are separate records and do not transfer automatically.

The list filters include **Rumah sewa**, **Sewa tersedia**, and **Sewa terhuni**, in addition to overall occupied/vacant status.

## Nested bills

Tagihan defaults to **Tahun → Periode → Klaster → Warga → Tagihan**. Native expandable groups show invoice count, total billed, and outstanding balance at each level. Bills remain grouped by their issued bill-to name, including when current occupants change. Combined legacy invoices are counted once. Individual bill cards expose items, status, detail/PDF, reminder, and payment/verification actions.

Search, year, month, cluster, status, and resident sorting apply before group totals. Cluster resident lists paginate at 10/25/50 entries. Open-all/close-all controls apply to groups; pagination retains the full filtered subtotal. Only issued bills appear in this view. **Spreadsheet** retains the previous cross-month matrix and its unissued-unit view.

## Common finance workspace

Navigation uses **Laporan keuangan** and **Transaksi kas**, backed by the same workspace:

- **Ringkasan keuangan**: opening balance, income, expenses, closing balance, category breakdowns, and reconciliation.
- **Transaksi kas**: search, income/expense/category filters, date ordering, pagination, source/method, receiver/reference, income, expense, and monthly running balance.
- **Laporan tagihan**: the previous invoice/receivables report remains available as a separate tab; outstanding invoices are not treated as cash income.

**Catat pengeluaran** is the primary action. **Catat pemasukan** records income from other sources. Both open dialogs with date, amount, category, payee/source, method, reference, description, and optional example attachment. Verified bill payments enter income once automatically. The opening-balance setting is a separate action rather than an inline form on every report. It changes the baseline before all recorded transactions, not just one month.

The statement is cash-based. Running balances are computed across all chronological transactions before table filtering/pagination; filtered rows retain their original monthly balance. Summary cards and **Ekspor PDF bulanan** cover the complete selected month regardless of table filters. The PDF contains opening/income/expense/closing totals, chronological rows, running balances, repeated headers, and page numbering. Manual and verified receipts remain distinguishable. Monthly WhatsApp summaries and individual expense drafts remain available.

## Validation and limits

Domain tests cover full profile validation and stable references, exclusive check-in/out and retained rental history, hierarchical totals/filtering and historical bill-to names, and statement reconciliation/filtering/pagination. Browser review includes saving profile corrections, checkout/check-in, retained document links, rental list filters, nested navigation/pagination, the spreadsheet toggle, income/expense recording, search, and actual PDF download. Mobile checks cover 320 px and 390 px layouts. A two-page financial PDF sample was rendered and visually reviewed; extracted totals and the last running balance reconcile.

All records remain browser-local prototype data. Production requires normalized person/occupancy records, server authorization, transactional writes, file storage/access controls, real bank/cash account configuration, and Supabase queries. This change provides cash reporting, not double-entry accounting or automated bank reconciliation.
