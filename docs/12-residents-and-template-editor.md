# Resident contacts, occupancy, and WhatsApp editor

## Resident records in the prototype

Unit records now include separate owner and current-occupant phone numbers and optional document storage URLs. Existing saved records remain intact; absent fields show “belum diisi” rather than invented contact data. New entries and contact updates require a valid phone number (8–15 digits, optional leading +; formatting spaces and hyphens are normalized). A resident who is also the owner uses the same contact fields for both roles.

Administrators can use **Warga dan unit → Detail → Ubah kontak dan dokumen**. Document URLs must use HTTPS and cannot embed credentials. **Buka dokumen** opens the saved folder/document URL in a new tab with `noopener noreferrer`. No document upload, Drive OAuth, or sharing-permission changes are performed. Google Drive permissions determine access to linked files. In the resident view, owner document links and previous residents’ contact/document links are hidden.

**Update keterhunian** is available from the unit row and detail screen. It supports occupied/vacant status, owner/rented tenure, current resident name, phone, document URL, and effective date. Updates require active Super Administrator or Administrator warga access. Future changes and dates before the current occupancy are rejected. The previous occupant’s name, contact, document URL, tenure, and period are preserved in occupancy history with the acting administrator and recording time. Marking vacant clears active occupant contact/document fields while preserving the owner and history. Issued invoices, payment records, user accounts, and role appointments are unchanged. Account reassignment remains a separate administrator action.

Prototype fields: `ownerPhone`, `ownerDocumentsUrl`, `occupantPhone`, `occupantDocumentsUrl`, `occupancyHistory[]`. These are optional for compatibility with existing browser data. Production should place phone/document references on stable person records and link occupancy through person/unit foreign keys, following the normalized model in the system design. The mockup currently manages owners and primary occupants; it is not a complete household registry.

## WhatsApp template editor

Four icon cards select invoice reminders, water bills, cash expenditure, or monthly cash reports. Variable chips insert a valid placeholder at the textarea cursor (or replace selected text). Newline insertion, character count, live sample preview, copy-example, saved/unsaved status, default example, cancel changes, and save are available. Drafts stay separate when switching types within the editor. Changes apply only after saving; defaults replace the draft and can be cancelled. Invalid placeholders and messages over 2,000 characters cannot be saved. Preview uses clearly labelled fictional values, not another resident’s record. No WhatsApp message is sent by the editor.

## Controls and verification

Single-line selects share 44 px height, padding, border, and chevron across toolbars, pagination, access controls, and dialogs; mobile select text uses 16 px. Related field inputs match their height. Native option pickers remain available for keyboard/mobile interaction.

Browser checks covered variable insertion, draft switching/cancellation, invalid variables, cash-report preview, resident contact save, occupancy save/history, saved external-link attributes, and responsive layouts. Example C-16 contact/occupancy data was entered for review, using placeholder Drive URLs rather than real document folders. No document links were opened or WhatsApp messages sent.
