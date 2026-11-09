# Matriks tagihan warga

The Tagihan administration page uses unit/resident rows and month columns. Each month contains three clickable lines: **Iuran**, **Air**, and **Sisa / status**. Dynamic individual fee items remain in invoice details; the matrix does not assume three fixed fee categories.

- Iuran and Air show the issued amount and charge-specific settlement status. A cell opens its invoice directly when there is one, offers a selection when there are several, or explains that no bill has been issued before offering creation.
- Sisa shows the outstanding amount for that unit/month and opens the monthly summary with total, verified payments, remaining balance, and the iuran/air choices. Pending confirmations are visible without reducing the balance.
- Historical combined invoices appear under both types but count once in monthly totals. Unknown older allocations show “Perlu alokasi”; settlement is never invented.
- Start month and 3/6/12-month windows control the displayed periods. Search includes resident, owner, unit, and invoice references. Cluster uses managed cluster IDs. Status matches a unit when any displayed month has that status; pending uses pending payment records.
- Sorting supports unit, resident name, cluster, and remaining balance. Numeric unit ordering and a unit tie-breaker keep pagination stable. Pagination offers 10/25/50 units, first/previous/numbered/next/last controls, clamping, counts, and an empty state.
- Summary cards include all filtered units across the visible months, including later pages. They are billed/settled positions, not cash receipts by transaction date.
- On phones, only the matrix scrolls horizontally; the resident column and month header retain their context. Filters, pagination, and accessible cell labels remain available.

Invoice details prioritize total/verified/remaining cards, per-item balances, downloadable invoice, reminder, and the relevant payment action. History is expandable. Resident and assisted confirmation share a selectable per-item checklist, partial amounts, select-all for unpaid items, and invoice context. Verification shows a receipt-matching summary and disables verification until the allocation total equals the payment amount. Rejection requires a reason. Existing domain validation remains authoritative for item bounds, duplicates, access, and repeated verification.

This is a browser-local prototype. Supabase queries, server authorization, proof file storage, and production-scale server pagination remain implementation work.
