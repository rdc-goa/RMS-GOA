# Schedule Meeting Page — Implementation Guide

This document explains how a "Schedule Meeting" page should work, what data it manages, UI components, validation, and integrations. Use this as a spec to implement the same page in another project or to provide to an AI/codegen system.

## Overview
- Purpose: Allow authenticated users (PIs, staff, admins) to schedule meetings (project reviews, committee meetings, interviews) with date/time, participants, agenda, attachments and optional reminders.
- Primary flows: create meeting, edit meeting, cancel meeting, send invites/notifications, check conflicts.

## High-level Components
- Form Container: main page/form that holds inputs and handles submit.
- Inputs:
  - Title (string)
  - Meeting Type (select) — e.g., IMR, Review, Interview
  - Date (date picker)
  - Start Time / End Time (time picker)
  - Timezone (optional) — default to user's locale
  - Participants (multi-select / combobox) — emails or user ids
  - Location/Mode (select) — physical room or video link
  - Agenda / Notes (textarea)
  - Attachments (file upload) — optional
  - Reminders (checkbox + offset) — optional
- Buttons: Save / Update, Cancel, Send Invites

## Data Model (example)
{
  "title": "IMR Mid-term Review",
  "type": "IMR",
  "organizerId": "uid_abc",
  "participants": ["uid_x","uid_y"],
  "participantEmails": ["a@..","b@.."],
  "date": "2026-05-20", // ISO date
  "startTime": "14:30", // HH:mm
  "endTime": "15:30",
  "timezone": "Asia/Kolkata",
  "location": "Room 101" or {"mode":"online","url":"https://meet"},
  "agenda": "Discuss project milestones",
  "attachments": [{"name":"file.pdf","url":"https://..."}],
  "reminders": [{"method":"email","offsetMinutes":30}],
  "status": "scheduled" // scheduled | cancelled | completed
}

## Validation Rules
- Title required, min length 3.
- Date required and cannot be in the past (compare in organizer timezone).
- Start and end times required; end > start.
- At least one participant required for meetings involving approvals.
- File size / types: limit (e.g., 10MB) and block dangerous types.
- Conflict check: query existing meetings for organizer & participants in the same timeslot.

## Key Functions & Flow
1. Render form with controlled inputs and client-side validation.
2. On date/time change, compute UTC timestamps for storage to avoid timezone bugs.
3. Conflict detection: call API (or Firestore query) to check overlapping meetings for participants and organizer.
   - If conflict found, surface a warning and optionally block scheduling.
4. File uploads: upload attachments to storage server or cloud storage first, obtain URLs, then include URLs in meeting record.
5. Persist meeting: create meeting document in DB (e.g., Firestore collection `meetings`).
6. Post-save actions:
   - Send calendar invites (iCal), email notifications, and optional push notifications.
   - For video meetings, generate meeting link or accept user-provided link.
7. Editing/cancelling: update DB and optionally send update/cancellation notifications.

## Example APIs / Backend Endpoints
- POST /api/meetings — create meeting. Body: meeting payload (see data model). Returns meeting id.
- PUT /api/meetings/:id — update meeting.
- POST /api/meetings/:id/invite — (optional) send invites / calendar events.
- GET /api/meetings?userId=uid — list meetings for user (support range filters).

If using Firestore:
- Collection: `meetings` documents keyed by meeting id.
- Indexes: query by participants array and timestamp range; use composite index for participant + date range queries.

## Notifications & Calendar Integration
- Email: send invite with iCalendar (.ics) attachment so recipients can add to calendars.
- Push: integrate with FCM or in-app notifications for reminders.
- Reminders: schedule background jobs / cloud functions to send reminder notifications X minutes before.

## UI/UX Suggestions
- Show busy/free indicator per participant when selecting participants (optional: requires calendar integration).
- Inline conflict warnings with suggestion of alternate slots.
- Preview generated calendar invite or meeting details before sending.
- Allow quick reschedule with drag/drop or quick-edit times.

## Error Handling
- Surface human-readable errors for validation and server-side failures.
- Retry file uploads with exponential backoff and show progress.
- Rollback created meeting if follow-up steps (e.g., invites) fail (or mark record as "invite-failed").

## Accessibility & Internationalization
- Labels for all inputs, aria attributes for date/time pickers.
- Support localized date/time formats and timezone awareness.

## Security Considerations
- Authenticate API endpoints; check that the requestor is authorized to create/modify the meeting.
- Validate participants are within allowed domains if required.
- Sanitize file uploads and avoid serving user-uploaded files directly without proper headers.

## Implementation Checklist (copy for new project)
- [ ] Create form UI components (date/time pickers, combobox for participants).
- [ ] Implement client-side validation.
- [ ] Implement timezone-safe timestamp generation.
- [ ] Add conflict-detection API and client integration.
- [ ] Implement file upload flow and storage integration.
- [ ] Persist meeting to DB and create necessary indexes.
- [ ] Implement invite/email calendar generation (iCal).
- [ ] Implement reminders (cloud function / background job).
- [ ] Add tests (unit + integration) for scheduling and conflict logic.

## Example Payload (POST /api/meetings)
{
  "title":"Quarterly Review",
  "type":"Review",
  "organizerId":"uid_1",
  "participants":["uid_2","uid_3"],
  "participantEmails":["a@..","b@.."],
  "startTimestampUtc":"2026-05-20T09:30:00Z",
  "endTimestampUtc":"2026-05-20T10:30:00Z",
  "location":{"mode":"online","url":"https://meet.example/abc"},
  "agenda":"Discuss results",
  "attachments":[{"name":"notes.pdf","url":"https://storage/..."}],
  "reminders":[{"method":"email","offsetMinutes":30}]
}

## Notes for AI / Code-Generation
- Provide data model and example payloads (above) to the AI.
- Specify desired UI components (date/time pickers, combobox) and validation rules.
- Mention backend/storage choice (Firestore, REST API, SQL) and auth method (Firebase Auth, JWT).
- If you need calendar invites, instruct AI to generate iCal content and attach it in emails.

---
If you'd like, I can adapt this README into a more prescriptive developer task list or generate a starter React/Next page (form + API handlers) for your target stack. Let me know the target stack (e.g., Next.js + Firestore, Express + PostgreSQL) and I will scaffold code examples.
