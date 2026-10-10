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
- Only active, non-deleted athlete-role members of the event's organization can be added. Anyone else is returned under `rejected` with `reason: "not_in_organization"` and nothing is created. No creating athletes and no cross-organization adds.
- Checked in by default so the athlete is immediately listed for data entry; `checkIn: false` stores `approved`.
- Silent: no email, no push. The event shows up in the athlete's "My Events" because that list reads registrations.
- Capacity and waitlist are ignored (coach override). When the add pushes the event past `maxRegistrations` the response carries `overCapacity: true`.
- Existing registrations in `pending`, `waitlisted`, `declined`, `cancelled` or `approved` are moved to the target status (counted under `updated`); `checked_in` and `completed` are left untouched (`alreadyOnEvent`). Calling twice is idempotent.
- A cancelled event answers 409; draft, published and completed events are allowed.
- The whole batch runs in one transaction, counts as one rate-limiter hit, and writes one audit log entry (`event_registration_created` with `directAdd: true` in its details; the `audit_logs_action_valid` CHECK constraint only allows known actions).

Response: `{ added: string[], updated: string[], alreadyOnEvent: string[], rejected: [{ userId, reason }], overCapacity?: true }`.

Code: `EventRegistrationService.addAthletesDirectly` (`packages/api/services/event-registration-service.ts`), route in `packages/api/routes/event-registration-routes.ts`, UI in `packages/web/src/components/events/AddAthletesModal.tsx`.
