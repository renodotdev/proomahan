# UI/UX review — roles and shared components

Reviewed 7 November 2026 after the elected-role prototype was implemented. User direction: keep component colors consistent, avoid red text above green buttons, and review UI/UX after implementation.

| Finding | Resolution and evidence |
| --- | --- |
| Destructive buttons inherited the primary green background while applying red text | Explicit white-on-red destructive background/border and darker red hover state. Browser review verified the revocation dialog. |
| Inline validation used red text directly above primary actions | Dark neutral text on a pale amber validation surface, retaining `role="alert"` and the written reason. Color is not the only signal. |
| Status badges and secondary labels were faint | Darkened positive/pending/negative/neutral badge text, field hints, shared muted text, table headers, and explanatory notes. Checked primary/destructive/error/badge/helper color pairs exceed 4.5:1. This is a targeted contrast check, not a claim of full WCAG conformance. |
| Elected staff could otherwise see a mixed dashboard | Module navigation and page rendering follow the selected example account's active roles. The aggregate dashboard is Super Administrator-only. Ordinary account management excludes platform and currently appointed/scheduled staff accounts for elected staff. |
| Term ending could be mistaken for account deactivation | Appointment screen and revocation confirmation distinguish the chosen appointment from other appointments and resident access. Labels show scheduled/active/expired/revoked states and the exclusive end time in WIB. |
| Renewal could overwrite prior election history | New period and audit event, with original dates preserved. Browser review submitted a renewal, revoked its scheduled period, and retained both events. |
| Narrow screens require horizontally scrolling tables | At 390 px, the page has no horizontal overflow; tables scroll within their panel. Table regions have keyboard focus and accessible labels. Role action controls have a minimum 44 px height. |

## Completed checks

- Desktop role page, appointment/renewal/revocation dialogs, confirmation copy, and validation state reviewed in the browser.
- Mobile role page reviewed at 390 × 844; document width remained within viewport width.
- Budi's billing-only navigation verified during his 2026 term; no administrative access at the exact 1 January 2027 00:00 WIB boundary. Nadia retains permanent platform access.
- Browser appointment submitted an additional Content Administrator role to an existing Resident Administrator, demonstrating separate, combinable appointments.
- Attempt to revoke the final active Super Administrator refused with a readable explanation.
- Shared component color pairs checked mathematically: primary 5.07:1, destructive 6.54:1, validation 9.55:1, checked badges 5.33–5.88:1, helper text 4.98:1.

Screenshots: [role management](../artifacts/mockup/roles-and-terms.jpg), [destructive action and validation](../artifacts/mockup/role-validation.jpg).

## Remaining production validation

Actual administrator/resident usability sessions, a complete screen-reader/keyboard audit, and all production Supabase authorization/concurrency/session/file checks remain ahead of launch. The demo account/time selectors are review tools and must not be present as identity-selection controls in production. Browser-local role history is fictional and editable through local storage; it is not an immutable security audit.

## Cluster management follow-up

Added the **Kelola klaster** entry under Warga dan unit, with a managed list, unique code/name validation, unit/occupancy summaries, archive confirmation, and restoration. Archive copy explicitly states that existing units and fees remain. The new forms reuse neutral validation text, the teal primary action, and white-on-red confirmation for archiving.

Mobile review at 390 px found table actions outside the visible area; the cluster list now becomes cards with visible actions and counts. Opening a unit summary or archive confirmation moves keyboard focus to its heading so the result is brought into view inside the modal. No horizontal page or dialog overflow was present in the reviewed mobile state. Desktop keeps the table. Browser checks covered add, rename, duplicate-code validation, archive, restore, unit summaries, and archived-cluster exclusion from new unit/fee choices. Domain tests cover rename/billing stability, archive preservation, duplicate validation, and earlier-snapshot migration.

Cluster preview captures: [desktop](../artifacts/mockup/clusters-desktop.jpg), [mobile cards](../artifacts/mockup/clusters-mobile.jpg).

## Billing/cash/media follow-up

Reviewed administrator payment recording, metered water entry, a reconciled income/expense ledger, saved WhatsApp templates and transaction previews, image upload/publication/reload, and the PDF download action. Invoice rows become mobile cards with visible quick actions and searchable unit/name/invoice identifiers. At 390 px the reviewed invoice page has no horizontal page overflow. Form errors retain neutral text on pale amber; no red text is placed on green primary actions.

PDF review covers every page of the four-page billing example and the one-page cash example. Divider spacing and word wrapping were corrected after rendering. Page headers/footers repeat, totals reconcile, and the financial report clearly labels its data as examples. Full production accessibility and actual-resident usability validation remain launch gates.

The final 320 px review verified no horizontal overflow on the water and cash pages. Balance cards become a single column at the smallest width. Issued water periods show preserved readings, a link to the issued invoice, and a disabled duplicate-issuance action; next-month opening readings carry forward and remain read-only.

## Unified billing review

The separate water menu and inline meter form were replaced by one **Tagihan** resident list. Creation and resident details both expose an iuran/air chooser. Browser review exercised water-form opening/cancellation, unit-specific selection, iuran preview/issuance for A-12, and the combined resident totals. Domain checks cover historical combined invoices without duplicate totals and separately issued water/dues invoices. Both creation forms keep the existing component palette, native dialog focus management, and validation styling.

## Assessment, bulk, and popup follow-up

The resident and assisted confirmation forms use the same item checklist, clearly distinguish previously paid items, allow per-item partial amounts, and show the selected total. Verification checks the checklist against the fixed receipt amount. Explicit old-credit allocation prevents invented historical settlement. Source and final item allocations appear in history. Rejection text remains white on red.

Bulk unit selectors expose period-wide, selected, and individual scope. Water batching has per-unit inputs, carry-forward values, row amounts and a total preview; phone layouts turn meter rows into cards. Cash entry is now a dialog with the ledger retained underneath. Individual PDFs include a resident/unit-specific filename and per-item balances; a rendered sample and browser download were checked.

## Monthly billing matrix follow-up

Tagihan now displays resident/unit rows, month columns, and the agreed Iuran / Air / Sisa-status lines. Reviewed cluster filtering (16 Akasia units, two pages), combined search and page reset, pending filtering, direct invoice and unissued-bill popups, monthly summaries, and natural unit sorting. Summary cards retain full filtered totals across pages. At 390 px and 320 px, the page does not overflow horizontally; horizontal scrolling is confined to the matrix and the resident column stays sticky.

Payment screens include invoice context, workflow hints, clearer selected/unpaid checklist states, an unpaid select-all action, and sticky action footers. Browser review confirmed empty submission is disabled, receipt mismatches disable verification, matching all four details enables verification, and rejection remains white text on red. No financial records were changed during this review. Domain suite: 35 passing tests; TypeScript and production build pass.

## Shared controls, templates, and resident contacts

Selects now use the same 44 px height, padding, border, and chevron across filters, pagination, and forms. Browser measurements verified 44 px desktop controls and 44 px / 16 px-text mobile selects. The WhatsApp editor uses icon category cards, clickable variables, per-type drafts, validation, clear save/cancel actions, and a sample message preview. Resident details show owner/current-occupant phone and storage links, with contact editing and occupancy updates in dialogs. Previous occupancy is retained and old invoices remain unchanged. Review includes mobile contact dialogs and the template page at 320 px without horizontal page overflow. See [12-residents-and-template-editor.md](12-residents-and-template-editor.md).

## Resident stays, nested bills, and finance workspace

The complete resident edit form uses three labelled sections and a persistent save footer; direct row editing removes an extra navigation step. Exclusive check-in/check-out replaces the ambiguous generic occupancy switch, with clear departure confirmation, retained rental designation, available/occupied rental filters, and closed-stay history. Old invoices and account assignments are preserved.

Tagihan defaults to year/month/cluster/resident/bill groups, with clear subtotals, expandable levels, per-cluster pagination, and quick bill actions. The earlier spreadsheet remains selectable. The finance workspace follows opening/income/expense/closing cards, category summaries, a running-balance transaction statement, separate income/expense entry dialogs, and full-month PDF export. Native dialogs and selects retain focus/keyboard behavior. The spending form was changed to one column on phones after visual review. Checked pages and dialogs have no horizontal overflow at 320 px; a two-page PDF sample has readable repeated headers, aligned amounts, and clean page breaks. Details are in [13-resident-stays-nested-bills-finance.md](13-resident-stays-nested-bills-finance.md).

## Final public/resident regression

A cross-role review corrected resident bill labels and filtering, mobile housing access, dynamic account/unit information, personal-data scoping after check-out, news ordering/empty states, persistent WhatsApp preferences, keyboard drawer handling, and public readability. The 21-route layout sweep covered 320/390/768/1440 px, followed by targeted visual checks and a tablet currency-wrap correction. See [14-ui-ux-regression-review.md](14-ui-ux-regression-review.md) for findings, evidence, and remaining production validation.
