# UI/UX regression review

Reviewed the public site, login, resident portal, and shared administrator screens after the resident, rental, billing, and finance changes. This review covers the browser-local prototype and its existing saved example data.

## Findings and changes

| Priority | Finding | Result |
|---|---|---|
| High | Resident data was selected by unit alone. Check-out or a new occupant could make another person’s records appear in the old resident’s screens. | Centralized account/unit/bill-to scoping for invoices, requests, notifications, and modal actions. Current household details require an active owner/occupant relationship. Owners do not automatically receive occupant bills or document links. Former residents retain their own issued bills. |
| High | The housing card was hidden on mobile, with no clear mobile route to Unit saya. | Restored a compact, accessible housing card. All four unit tabs fit narrow screens. |
| Medium | Resident billing used old labels, one initial period, global period options, and clipped status tabs. | All personal periods are available by default, grouped by month. Iuran, air, and combined invoices have accurate labels; filters include pending verification. Search, a clearly labelled period selector, wrapping 44 px status controls, explanatory totals, and relevant empty states replace the clipped tabs. |
| Medium | Account and housing text was hardcoded and could disagree with admin records. | Names, display unit number, cluster, phone, account identifier, and relationship status come from the resident context. Unlinked or inactive relationships show an actionable explanation instead of another occupant’s private data or a crash. |
| Medium | WhatsApp preference reset on navigation and did not affect admin reminders. | Preference persists with the account. Matching invoice reminders respect opt-out. Toggling, reload, cross-role behavior, and restoring the enabled preference were exercised. |
| Medium | Public supporting text was faint and several product actions had small touch targets. | Darkened public copy and supporting labels, increased primary button/touch dimensions, improved focus outlines, and kept the established teal/neutral palette. Sample public text contrast ratios are 4.83–5.53 against the rendered background. |
| Medium | Tablet billing summary could split currency amounts in the middle of digits. | The summary uses rows at intermediate widths, retaining intact currency values. Phone and wide-desktop layouts remain tailored to their available space. |
| Medium | Desktop showed a redundant mobile-menu button; the mobile drawer lacked keyboard focus handling. | Desktop menu trigger is hidden. On mobile, focus stays in the drawer, Escape closes it, scrolling is locked behind it, and focus returns to the trigger. |
| Low | Login lacked a show-password action and a main landmark; route initialization could briefly show the default admin screen. | Added a labelled password toggle and semantic login heading/main content. A neutral loading state precedes route selection. Invalid resident routes resolve to home with the URL corrected. |
| Low | News/activity ordering and empty feeds were inconsistent; some screens assumed a first news item always existed. | News uses explicit audience filtering and chronological dates, preserving insertion order for same-day posts. Empty feeds and dashboard highlights have fallbacks. Resident recent requests sort correctly across existing date formats. |
| Low | Shared admin payment rows were difficult to scan on narrow screens. | Mobile payment cards retain visible amount, method, date, status, and review action. The shared administrator review dialog was rechecked. |

## Coverage

Layout sweep: **21 routes × 4 widths = 84 viewport checks**, using 320, 390, 768, and 1440 px. No horizontal page overflow, broken rendered images, or undersized visible select controls were found in the reviewed data. Follow-up checks covered the final tablet currency layout and mobile housing access.

Routes: public, login; resident home, bills, unit, news, services, account; administrator dashboard, payments, bills, units, finance summary, cash transactions, WhatsApp templates, news, services, fees, accounts, roles, and settings.

Manual visual/interaction checks included:

- Public landing, news visibility, contact dialog, and login entry.
- Password visibility and demo login with the account shown in resident settings.
- Resident all-period billing, status filtering, empty-result recovery, invoice detail, item checklist, and cancelling confirmation without submitting a payment.
- Housing access from the mobile home card, own document visibility, and all unit-detail tabs.
- Service request form context and cancellation, personal request history, account contact data, and notifications.
- WhatsApp opt-out persistence, the matching admin reminder explanation, and restoring the original enabled behavior.
- Shared administrator payments/review, mobile payment cards, drawer focus wrapping, Escape, focus return, and skip-to-main keyboard activation.
- Reduced-motion styling, sticky dialog controls, phone safe-area spacing, visible selected states, and consistent select heights.

Domain regression suite: **54 tests**. TypeScript and the production build passed. Existing invoices, payments, occupancy records, and service requests were preserved during this review; no real messages were sent.

## Review artifacts

- [Resident home, desktop](../artifacts/mockup/resident-home-regression-desktop.jpg)
- [Resident home, mobile](../artifacts/mockup/resident-home-regression-mobile.jpg)
- [Resident bills, desktop](../artifacts/mockup/resident-bills-regression-desktop.jpg)
- [Resident bills, mobile](../artifacts/mockup/resident-bills-regression-mobile.jpg)
- [Resident account, mobile](../artifacts/mockup/resident-account-regression-mobile.jpg)
- [Resident services, mobile](../artifacts/mockup/resident-services-regression-mobile.jpg)
- [Public site, desktop](../artifacts/mockup/public-regression-desktop.jpg)
- [Public site, mobile](../artifacts/mockup/public-regression-mobile.jpg)

## Prototype boundaries

The mode switch and data store are still a preview, not authentication or a security boundary. Demo associations use an account, unit, and bill-to name; production requires stable person IDs and server/RLS authorization. A name correction that no longer matches an account deliberately requires administrator review rather than guessing access. Real document storage, attachment delivery, contact configuration, and authentication remain implementation work.

This is a targeted design and browser regression review, not a complete WCAG certification or a real-device/screen-reader test. Safari/iOS and Android device checks, assistive technology testing, and resident usability sessions remain appropriate before launch.
