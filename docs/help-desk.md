# Help desk and e-mail controls

## Help desk

Candidates raise support tickets; HR – N4 Section and senior administrators answer them. It is part of the
same application (same sign-in, database, storage and e-mail), not a separate system.

### Routes

| Route | Who | Purpose |
| --- | --- | --- |
| `/help-desk` | Everyone | Overview. Signed-in candidates see their ticket counts and list; visitors see how to get help. |
| `/help-desk/tickets` | Candidate | Own tickets: search, status / category filter, sort, pages. |
| `/help-desk/new` | Candidate | Create a ticket (subject, category, sub-category, description, optional application, urgency, attachments). |
| `/help-desk/tickets/:id` | Candidate (owner) | Conversation and reply. |
| `/help-desk/articles`, `/help-desk/articles/:slug` | Everyone | Published help articles (none ship with the system). |
| `/help-desk/files/:id` | Owner or support staff | Attachment download (authorised every time). |
| `/staff/help-desk` | HR – N4, Admin, owner | Ticket queue: views, counts, filters, bulk assign / status. |
| `/staff/help-desk/:id` | HR – N4, Admin, owner | Conversation, reply / request information / internal note, status, assignment, priority, escalation, history. |
| `/staff/help-desk/settings` | Owner | Default assignment, staff e-mail on new tickets, help articles. |

Signed-out visitors who open a ticket page are sent through the normal e-mail-code sign-in and returned
to the page afterwards.

### Permissions

| Permission | Roles | Allows |
| --- | --- | --- |
| `helpdesk:handle` | HR, Admin, owner | Read and work on every ticket. |
| `helpdesk:admin` | Admin, owner | Help desk settings, help articles, reopening closed tickets. |

Admin (Dean / Principal) and HODs have no help desk access. Candidates only ever see their own tickets,
public messages and attachments of public messages. Every rule is checked on the server.

### Ticket lifecycle

`Open → In progress → Awaiting candidate → Resolved → Closed`

| Who | Change |
| --- | --- |
| Candidate | Creates (Open). Replying to *Awaiting candidate* returns it to the team (Open / In progress). Replying to *Resolved* within 14 days reopens it. Cannot reply to *Closed*. |
| Staff | Any change allowed by `STAFF_TRANSITIONS` in `app/modules/helpdesk/definitions.ts`. *Resolved* and *Closed* need a resolution summary. Only a senior administrator reopens a *Closed* ticket. Replying to an unassigned ticket assigns it to the replier. |

Priority (Low / Normal / High / Urgent) is set by staff only; candidates describe the urgency in their
own words. Escalation flags the ticket for senior administrators (priority at least High) and keeps its history.
Every change is stored in `support_ticket_events` and in the audit log.

References are `PSGHD-<year>-<000001>` from `support_counters` (atomic, unique under concurrency).
A double click or retried request returns the same ticket (one request id per form).

### Data (migration `20261101090000_help_desk_and_notifications`)

New tables: `support_tickets`, `support_messages` (PUBLIC / INTERNAL, immutable),
`support_attachments`, `support_ticket_events`, `support_counters`, `help_articles`.
Notifications gain `dedupeKey`, `priority`, `readAt` and the `IN_APP` status. The migration is additive
and idempotent; no existing row is changed. Rollback: leave the tables in place (unused) — do not drop
them without exporting ticket data first.

Categories are defined once in `app/modules/helpdesk/definitions.ts`. Attachments (PDF / JPG / PNG,
10 MB, 3 per message) are checked by content, virus-scanned and stored under random keys in the private
storage volume, like application documents.

## E-mail controls (daily quota)

The mail account has a daily sending limit. The application keeps well inside it:

1. **Fewer sign-in codes** — candidates can stay signed in on their device (30 days, sliding); codes have
   a 60-second resend cooldown and at most 5 per hour.
2. **One e-mail per event** — notifications carry a `dedupeKey`; a retried request or double click creates
   nothing. The worker never re-sends a notification already marked sent.
3. **Daily budget** (`MAIL_DAILY_BUDGET`, default 450, shared Redis counter per IST day):
   - sign-in codes are always sent;
   - *critical* mail (submission receipt, interview call, invitations, account e-mails) is sent up to the
     budget;
   - *routine* mail (help desk updates, assignment notices) stops at 80 % and is then shown in the app only.
   Usage is logged at 70 / 85 / 95 % and shown in the Control centre.
4. **In-app notifications** — the bell icon lists every notification, e-mailed or not. Staff are told
   about new tickets in the app; e-mailing them is optional (help desk settings).

Keep `MAIL_DAILY_BUDGET` below the provider's limit. If the portal regularly needs more, ask the
institution for a higher sending quota or an approved transactional mail service.

### Testing locally

`./dev.sh up` sends every e-mail to Mailpit (http://127.0.0.1:8025); nothing reaches real inboxes.

```sh
npm test                    # unit tests
npm run test:integration    # includes tests/integration/helpdesk.test.ts
npm run build
```
