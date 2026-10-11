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

## Reading event results

`GET /api/events/:id/measurements` returns the event's rows newest first (`date`, then `createdAt`, then `id`), each with `isCalculated` and `calculatedFromMeasurementIds` so a client can tell typed rows from derived ones (derived = `isCalculated` unless the list is an empty array). Event managers (coach, org admin of the event's organization, site admin) get unverified rows too; anyone else (an athlete reading their own results once they are published) gets verified rows only. `GET /api/events/:id/measurements/stats` is manager-only and counts unverified rows as well.

Code: `EventMeasurementsService.createEventMeasurement` / `createEventMeasurementsBulk` (`packages/api/services/event-measurements-service.ts`), routes in `packages/api/routes/event-measurements-routes.ts`. Movement Quality scores saved through `PUT /api/events/:id/athletes/:userId/movement-quality` are not covered by these checks.

## Recording sheet (CSV / XLSX)

The data entry page (`/events/:id/data-entry`) can download a blank recording sheet and load a filled one. Everything runs in the browser: values from a sheet become unsaved grid cells and are saved through the bulk route above, so all of its checks apply. There are no server changes.

Layout: three rows `Event`, `Date` (yyyy-mm-dd) and `Event ID`, then the table header `Athlete ID (do not edit)`, `Athlete` and one `Label (unit) [CODE]` column per metric, then one row per athlete of the grid (`approved`, `checked_in`, `completed`). Metrics that are not typed have no column: derived metrics, paired-input metrics and Movement Quality scores (entered in their panel). A column of one of those, or of a metric not on the event, is ignored with a warning.

Loading a sheet:

- The file must carry this event's `Event ID` row. A sheet with no `Event ID` row, a blank one, or a renamed label is refused as a whole, and so is a sheet of another event (compared ignoring case and surrounding spaces).
- Columns are matched by the `[CODE]` in the header first, then by the exact label or `Label (unit)`. Names and headers are compared in one Unicode form (NFC).
- A row is refused (and listed) for a missing or unknown athlete id, an athlete not entitled to results on the event, a name that does not match the id, or an athlete that appears more than once.
- A blank cell or `-` never clears a saved value. Comma decimals (`4,52`) are refused; use a dot. Values go through the normal value validation.
- CSV: the download escapes cells that start with `= + - @`, tab or CR with a leading `'`; on load that `'` is removed only before one of those characters, so a name like `'Ike` stays as typed. XLSX: formulas give their saved result, date cells are refused, and a percent-formatted cell loads as its fraction (50% is 0.5).
- Limits: a `.csv` or `.xlsx` file of at most 1 MB, 1000 athlete rows and 200 columns; an XLSX file may have at most 50 zip parts and 20 MB unpacked (as declared by the zip, checked before it is unpacked).

Conflicts: a file value that differs from the saved value is a conflict. The cell keeps its saved value until you choose `Keep saved` or `Use file value` (per cell, or for all in the summary); Save is blocked while conflicts remain. `Use file value` replaces the saved row when the cell has one, and adds a new trial when it has several. Values you type win: typing in a cell drops its pending file value, and a cell typed in while the file was being read keeps the typed value (the file value is listed as not loaded).

Upload is blocked while the grid has unsaved edits, while a save is in flight and while another sheet is being read; Save and `Discard file values` are off while a sheet is read, and `Discard file values` is off during a save.

Code: `packages/web/src/lib/recording-sheet.ts` (generate, read), `packages/web/src/lib/recording-sheet-import.ts` (plan, apply), `packages/web/src/components/events/RecordingSheet*.tsx`, `packages/web/src/pages/event-data-entry.tsx`.
