# Event registration: ways onto an event

An athlete ends up on an event roster (`event_registrations`, one row per event and user) in one of three ways.

| Way | Who starts it | Resulting status | Notifications |
|-----|---------------|------------------|---------------|
| Invitation | Manager invites an org member or an email (`POST /api/events/:id/invitations`) | `approved` when the athlete accepts | Invitation email |
| Self-registration | Athlete (`POST /api/events/:id/register`) | `pending` (request_approval), `approved` (open / invitation) or `waitlisted` when full | None to the athlete; managers approve or decline |
| Direct add | Manager (`POST /api/events/:id/registrations/bulk-add`, "Add athletes" button on the event page) | `checked_in` (default) or `approved` | None |

## Direct add rules

- Managers only: org admin or coach of the event's organization, or a site admin (same check as approve/decline/check-in).
- Body: `{ userIds: string[] (1..200 uuids, deduplicated), checkIn?: boolean (default true) }`.
- Only non-deleted athlete-role members of the event's organization can be added. Anyone else is returned under `rejected` with `reason: "not_in_organization"` and nothing is created. No creating athletes and no cross-organization adds.
- Checked in by default so the athlete is immediately listed for data entry; `checkIn: false` stores `approved`.
- Silent: no email, no push. The event shows up in the athlete's "My Events" because that list reads registrations.
- Capacity and waitlist are ignored (coach override). When the add pushes the event past `maxRegistrations` the response carries `overCapacity: true`. The overCapacity count excludes `cancelled`, `declined` and `waitlisted` registrations, so a waitlist never makes an event look over capacity.
- Existing registrations in `pending`, `waitlisted`, `declined`, `cancelled` or `approved` are moved to the target status (counted under `updated`); `checked_in` and `completed` are left untouched (`alreadyOnEvent`); so is a registration already in the target status (a repeat `checkIn: false` call on `approved` rows), which is not rewritten and adds no audit entry. Calling twice is idempotent. Moving an existing registration never overwrites history: an already `approved` row keeps its `approvedAt`/`approvedBy`, and existing `adminNotes` are left alone.
- A cancelled or frozen event answers 409 (status and frozen flag are read under the event row lock); an event without an organization also answers 409 (only site admins get that far) and the UI hides the button for it.
- If the athlete registers themselves while the add runs, the unique `(event_id, user_id)` conflict is absorbed (`ON CONFLICT DO NOTHING`) and that registration is handled as an existing one.
- The UI caps a single add at 200 athletes ("Select all" stops at 200).
- Each new row is inserted individually (not one multi-row insert) so a conflict on one athlete does not fail the others.
- Draft, published and completed events are allowed.
- The whole batch runs in one transaction, counts as one rate-limiter hit, and writes one audit log entry (`event_registration_created` with `directAdd: true` in its details; the `audit_logs_action_valid` CHECK constraint only allows known actions).

Response: `{ added: string[], updated: string[], alreadyOnEvent: string[], rejected: [{ userId, reason }], overCapacity?: true }`.

Code: `EventRegistrationService.addAthletesDirectly` (`packages/api/services/event-registration-service.ts`), route in `packages/api/routes/event-registration-routes.ts`, UI in `packages/web/src/components/events/AddAthletesModal.tsx`.

## Who can have results entered

`POST /api/events/:id/measurements` (one item) and `POST /api/events/:id/measurements/bulk` (`{ measurements: [...] }`) write results for an event. Besides the existing rules (manager of the event's organization, event not frozen, athlete a member of the event's organization), every item must meet these:

- The athlete has a registration on the event in one of `EVENT_DATA_ENTRY_REGISTRATION_STATUSES` (`approved`, `checked_in`, `completed`; exported from `@shared/schema`, also used by device import). `pending`, `waitlisted`, `declined` and `cancelled` are refused, and so is an organization member without a registration.
- The metric is one of the event's metrics (`event_metrics`).
- A bulk request carries at most 200 items; more is a 400 and nothing is written. The request body is also limited to Express' default 100 kB JSON limit, which answers 413 before any check runs (a plain item is about 170 bytes; notes, `flyInDistance` and `mediaUrl` make it larger). Clients must chunk larger sheets into requests of at most 200 items AND well under 100 kB.

A refused item is a 400 on the single route and a per-item entry `{ index, error }` in `errors` on the bulk route (the other items are still written). Registrations, event metrics and replace targets are each loaded with one query per request.

Items are appended by default: several rows per athlete, metric and event are normal (trials). To overwrite a saved value instead, send `replaceMeasurementId` with the id of that row. The row must belong to the same event, athlete and metric and must not be derived from other measurements (a calculated row with a non-empty `calculated_from_measurement_ids`, e.g. a derived total); anything else is refused and nothing is inserted. Paired-input rows (e.g. a 1RM estimate from load and reps) are calculated from their own inputs, store an empty source list and can be replaced: the value is recomputed from the new inputs. A `replaceMeasurementId` may appear only once per bulk request; later items naming the same id are per-item errors. The row is updated in place through `MeasurementService.updateMeasurement` (same value validation, Movement Quality and clip permission checks, derived metric recalculation as an edit), so re-sending the same replace changes nothing. The single route answers 200 for a replace (201 for a create); the bulk response lists replaced rows under `replaced`, next to `created` and `errors`. Every entry of `created` and `replaced` carries `index`, its position in the request array (as `errors[].index` does). A replace keeps the row's `isVerified`, `verifiedBy` and `submittedBy`, and does not recompute the stored `age` column: a replace that changes the date can leave a stale `age`.

Retries: a replace is idempotent, an append is not. If a bulk response is lost (timeout, dropped connection) after the server wrote the rows, re-sending the same request applies the replace items again (no change) but appends the plain items a second time, so a retry after a lost response can duplicate appended rows. The data entry grid sends a replace only when a cell has exactly one saved row, so only cells that were empty or held several trials can be duplicated this way.

## Data entry grid

The data entry page (`/events/:id/data-entry`) shows one row per athlete (`approved`, `checked_in`, `completed`) and one column per metric. A cell shows the newest typed (non-derived) saved row; `N saved trials` under it means the athlete has several rows for that metric.

- Save: a retyped cell with exactly one saved row replaces that row (`replaceMeasurementId`); a retyped cell with several saved rows is added as a new trial; an empty cell creates the first row.
- Add trial (`+` to the right of the input): shown when a cell that already has a saved row holds a changed number and no pending sheet conflict, on a column that can be typed (not derived or paired-input) of an event that is not frozen. It saves that one value at once as a new row (a single-item bulk request without `replaceMeasurementId`), so the cell turns saved and its trial count goes up. It never replaces a row. A per-item error is shown on the cell; a failed request leaves the cell unsaved. It is off while a save runs or a sheet is read, and Save and Upload are off while it runs. An append is not idempotent (see Retries above).

- Keyboard: Up / Down move to the same metric in the previous / next athlete's row, and Enter in an input moves down. Left / Right move to the neighbouring cell only when the caret is at the start / end of the input with no text selected (otherwise they move the caret); on the Movement Quality button they always move, and Enter on it opens the panel. Tab is unchanged. Keys are left alone during IME composition and with Shift, Alt, Ctrl or Cmd held; disabled cells are skipped and the grid's edges are no-ops. The pinned Athlete column never covers the focused cell.
- Scroll buttons: when the metric columns do not fit, the "N metric columns · scroll sideways" line gets `Scroll metrics left` / `Scroll metrics right` buttons. One click scrolls the visible width less the Athlete column, keeping one column of overlap (without animation when the browser asks for reduced motion). Each button is off at its end.

Code: `packages/web/src/pages/event-data-entry.tsx`, `packages/web/src/components/events/EventGridCell.tsx`, `packages/web/src/lib/event-grid-cell-state.ts` (`getCellState`, `canAddTrial`), `packages/web/src/lib/event-grid-save.ts` (`chunkBulkItems`, `savedCellPatch`), `packages/web/src/hooks/use-grid-keyboard-nav.ts`, `packages/web/src/hooks/use-horizontal-scroll-state.ts` (`scrollByPage`).

## Reading event results

`GET /api/events/:id/measurements` returns the event's rows newest first (`date`, then `createdAt`, then `id`), each with `isCalculated` and `calculatedFromMeasurementIds` so a client can tell typed rows from derived ones (derived = `isCalculated` unless the list is an empty array). Event managers (coach, org admin of the event's organization, site admin) get unverified rows too; anyone else (an athlete reading their own results once they are published) gets verified rows only. `GET /api/events/:id/measurements/stats` is manager-only and counts unverified rows as well.

Code: `EventMeasurementsService.createEventMeasurement` / `createEventMeasurementsBulk` (`packages/api/services/event-measurements-service.ts`), routes in `packages/api/routes/event-measurements-routes.ts`. Movement Quality scores saved through `PUT /api/events/:id/athletes/:userId/movement-quality` are not covered by these checks.

## Recording sheet (CSV / XLSX / printable PDF)

The data entry page (`/events/:id/data-entry`) can download a recording sheet and load a filled one. Everything runs in the browser: values from a sheet become unsaved grid cells and are saved through the bulk route above, so all of its checks apply; Movement Quality scores are saved through `PUT /api/events/:id/athletes/:userId/movement-quality` (see Loading). There are no server changes.

Layout: three rows `Event`, `Date` (yyyy-mm-dd) and `Event ID`, then the table header `Athlete ID (do not edit)`, `Athlete` and one `Label (unit) [CODE]` column per metric, then one row per athlete of the grid (`approved`, `checked_in`, `completed`).

Saved values are pre-printed: each cell holds the athlete's saved value for that metric (the newest typed row, never a derived row and never an unsaved edit in the grid). When at least one value is printed, a `Note` row after `Event ID` says: "Saved values are filled in. Change one to replace it (where several trials are saved, the change is added as a new trial); leave it as is to keep it. Clearing a cell does not delete a saved value." A sheet without saved values has no note row (the table header is then row 4, else row 5). XLSX: printed cells are shaded light grey, and a cell whose athlete has several saved rows for the metric has the cell note `Newest of N saved trials`. CSV: the value only (any extra text would stop it reading as a number). Uploading a pre-printed sheet untouched loads nothing: every printed value equals the saved one (`unchanged`). An edited printed value is a conflict; a cleared one changes nothing.

Movement Quality: when the event has any Movement Quality score, the 8 pattern columns follow the other metrics as `Label (0-3) [CODE]` (for example `Deceleration (0-3) [MQ_DECEL]`), plus the 4 transition columns when at least one transition is on the event, the same rows as the Movement Quality panel (labels are the panel's). Saved scores are pre-printed like other values.

Metrics that are not typed have no column: derived metrics, paired-input metrics and the Movement Quality totals (`MQI_TOTAL`, `MQ_TRANSITION_TOTAL`, calculated from the scores). A column of one of those, or of a metric not on the event, is ignored with a warning.

Loading a sheet:

- The file must carry this event's `Event ID` row. A sheet with no `Event ID` row, a blank one, or a renamed label is refused as a whole, and so is a sheet of another event (compared ignoring case and surrounding spaces).
- Columns are matched by the `[CODE]` in the header first, then by the exact label or `Label (unit)`. Names and headers are compared in one Unicode form (NFC).
- A row is refused (and listed) for a missing or unknown athlete id, an athlete not entitled to results on the event, a name that does not match the id, or an athlete that appears more than once.
- A blank cell or `-` never clears a saved value. Comma decimals (`4,52`) are refused; use a dot. Values go through the normal value validation. Movement Quality scores must be whole numbers 0-3 (the bounds of the site metric, else 0-3): `0` to `3` load, `4`, `1.5`, `-1` and `3,0` are refused.
- Movement Quality scores from a sheet show under the athlete's Movement Quality button (`N scores from sheet (unsaved)`, conflicts, errors); the button's summary keeps showing the saved scores. Save sends the grid first, then one `PUT .../movement-quality` per athlete with scores only (`{ upserts: [{ metric, value }], deletes: [] }`), so the notes and clips saved in the panel stay; they never go through the bulk route. A refused athlete (per-score errors, or another 400 such as an athlete that is not a member) keeps its scores unsaved with the error and the next athlete is still sent; a rate limit (429), access error (403), server or network error, or a frozen event stops the loop and the remaining scores stay unsaved. They are not sent at all when a grid request failed as a whole. One refetch follows the whole save.
- Rate limit: every `/api` request of a user counts against the general limit of 600 requests per 15 minutes (`API_RATE_LIMIT`) (page loads, refetches, add-trial clicks, grid requests and one request per athlete with Movement Quality scores). A sheet with scores for more than about 60-80 athletes can hit it: the save stops with "Saved MQ for N of M athletes" and the remaining scores stay unsaved; the whole app is then limited for up to 15 minutes, so wait, then save again.
- CSV: the download escapes cells that start with `= + - @`, tab or CR with a leading `'`; on load that `'` is removed only before one of those characters, so a name like `'Ike` stays as typed. XLSX: formulas give their saved result, date cells are refused, and a percent-formatted cell loads as its fraction (50% is 0.5).
- Limits: a `.csv` or `.xlsx` file of at most 1 MB, 1000 athlete rows and 200 columns; an XLSX file may have at most 50 zip parts and 20 MB unpacked (as declared by the zip, checked before it is unpacked).

Conflicts: a file value that differs from the saved value is a conflict (a saved Movement Quality score of 0 counts as saved). Movement Quality conflicts are resolved in the `N conflicts` popover under the athlete's Movement Quality button (per pattern, or all of that athlete) or with the summary's buttons. While an athlete has unsaved scores from a sheet, the Movement Quality panel shows them as blocked: Save scores is off until the page is saved or the file values are discarded, so the two cannot overwrite each other. The cell keeps its saved value until you choose `Keep saved` or `Use file value` (per cell, or for all in the summary); Save is blocked while conflicts remain. `Use file value` replaces the saved row when the cell has one, and adds a new trial when it has several. Values you type win: typing in a cell drops its pending file value, and a cell typed in while the file was being read keeps the typed value (the file value is listed as not loaded).

Upload is blocked while the grid has unsaved edits, while a save is in flight and while another sheet is being read. Download and upload are both off while saved results could not be loaded (`Saved results could not be loaded. Refresh before uploading a sheet.`): without them every file value would look new, so no conflict would be shown and saved rows could be duplicated, and a downloaded sheet would miss its pre-printed values. Save and `Discard file values` are off while a sheet is read, and `Discard file values` is off during a save.

Printable PDF (`Download sheet > Printable PDF`, off for a frozen event like the other downloads): the same athletes, order and metric columns as the CSV / XLSX, for writing results by hand. It cannot be uploaded; type the results into the grid (or into a CSV / XLSX sheet and upload that).

- Letter, landscape only (A4 can be added if asked). Helvetica, generated in the browser with `jspdf` + `jspdf-autotable`, both loaded only when a PDF is made.
- Every page has the event name, the date (the same yyyy-mm-dd as the CSV), the location when the event has one, the event id in small print and `Page n of N`.
- Table: `#`, `Athlete`, then one box per metric (header = label on up to 2 lines, then the unit). Rows are about 0.36 in tall with alternating light shading; up to 15 athletes per page.
- Saved values: a box with a saved value is shaded darker grey and shows the value in small grey print at its top right, with ` (N trials)` when several rows are saved, so the box still has room for a handwritten correction. The footer then starts with `Shaded = already recorded (newest saved value shown).`
- Column strips: a page holds at most 7 metric columns (at least 1 in wide each). More metrics are split into balanced strips (12 metrics = 6 + 6), each repeating `#` and `Athlete`, and each page says `Columns 1-6 of 12 (part 1 of 2)`. Page order: every athlete for strip 1, then every athlete for strip 2, and so on; match rows across strips by `#`.
- Movement Quality: their columns are ordinary metric columns; a page whose strip holds one prints `Movement Quality: 3 Efficient, 2 Functional, 1 Compensated, 0 Absent` at the right of the event id line.
- Characters: the built-in font prints Latin-1 only. Curly quotes and dashes print as plain ones, and the arrows of the transition labels as `->` and `<->`; any other character (for example Chinese or Polish `Ł`) prints as `?`, and the first page then says that some text contains characters the PDF cannot print. Long names and labels are cut with `...`.
- File name: `recording-sheet-<event-name-slug>-<date>.pdf`, as for the CSV / XLSX.

Code: `packages/web/src/lib/recording-sheet.ts` (generate, read, `sheetMqMetrics`), `packages/web/src/lib/recording-sheet-pdf.ts` (PDF layout plan and rendering), `packages/web/src/lib/recording-sheet-import.ts` (plan, apply), `packages/web/src/lib/mq-sheet-cells.ts` and `packages/web/src/hooks/use-movement-quality-sheet-cells.ts` (Movement Quality scores from a sheet: cells, save requests, stop rule), `packages/web/src/components/events/RecordingSheet*.tsx`, `packages/web/src/components/events/MovementQualityGridCell.tsx`, `packages/web/src/pages/event-data-entry.tsx`.
