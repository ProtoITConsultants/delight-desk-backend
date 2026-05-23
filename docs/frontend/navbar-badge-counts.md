# Navbar Badge Counts — Frontend Integration Handoff

Reference for showing counter badges on the **Approval Queue** and **AI Assistant** navbar items with a **single API request**.

---

## Endpoint

```
GET /dashboard/nav-badge-counts
```

Returns both navbar badge values in one response.

### Authentication

Session cookie required on every request.

### Success response

**HTTP 200 OK**

```json
{
  "approvalQueuePendingApproval": 4,
  "aiAssistantPending": 7
}
```

| Field | Navbar item | Meaning |
|-------|-------------|---------|
| `approvalQueuePendingApproval` | Approval Queue | Items with at least one action in `pending_approval` |
| `aiAssistantPending` | AI Assistant | Escalation tickets with status `pending` |

### Display rules

| Count | Suggested UI |
|-------|--------------|
| `0` | Hide badge |
| `> 0` | Show count (optionally cap at `99+`) |

---

## What each count represents

### `approvalQueuePendingApproval`

Counts approval queue items where **any** `workflowActions[].status` is `pending_approval`.

Same set as:

```
GET /approval-queue?status=pending_approval
```

See [approval-queue-pending-approval-filter.md](./approval-queue-pending-approval-filter.md) for terminology (`pending_approval` vs workflow `pending`).

### `aiAssistantPending`

Counts escalation tickets with status **`pending`** (new, not yet handled).

Escalation statuses for reference:

| Status | Meaning |
|--------|---------|
| `pending` | New ticket — **used for navbar badge** |
| `progress` | Being worked on |
| `resolved` | Closed |

This endpoint counts only `pending`. If product later wants “all open tickets,” that would be `pending + progress` and would require a backend change.

---

## When to call this endpoint

- On app layout / navbar mount (every page with the nav)
- After SSE events that change queue or escalation data (see below)

One request replaces separate calls to `/approval-queue/stats` and `/escalations/stats` for navbar badges only.

---

## Live updates (SSE)

Re-fetch `GET /dashboard/nav-badge-counts` when either stream fires an update event.

### Approval Queue stream

```
GET /approval-queue/stream
```

On `queue_updated`, refresh badge counts.

Relevant `reason` values: `action_created`, `action_updated`, `action_approved`, `action_rejected`, `action_edited_and_approved`, `workflow_cancelled`, `workflow_status_updated`.

### AI Assistant stream

```
GET /escalations/stream
```

On `escalations_updated`, refresh badge counts.

Relevant `reason` values: `escalation_created`, `escalation_status_updated`, `escalations_bulk_status_updated`, `escalation_response_sent`.

---

## Error responses

| HTTP | Meaning |
|------|---------|
| `401` | Not authenticated — hide badges or prompt login |
| `5xx` | Server error — keep last known counts or hide badges |

NestJS error shape:

```json
{
  "statusCode": 401,
  "message": "Not authenticated",
  "error": "Unauthorized"
}
```

---

## Integration checklist

- [ ] Fetch `GET /dashboard/nav-badge-counts` on navbar/layout load
- [ ] Map `approvalQueuePendingApproval` → Approval Queue nav badge
- [ ] Map `aiAssistantPending` → AI Assistant nav badge
- [ ] Hide badges when count is `0`
- [ ] Re-fetch on `/approval-queue/stream` `queue_updated`
- [ ] Re-fetch on `/escalations/stream` `escalations_updated`
- [ ] Include session credentials on every request

---

## Related endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/dashboard/nav-badge-counts` | **Navbar badges (use this)** |
| `GET` | `/approval-queue?status=pending_approval` | Full approval queue list needing action |
| `GET` | `/escalations?status=pending` | Full pending escalations list |
| `GET` | `/approval-queue/stream` | Live approval queue updates |
| `GET` | `/escalations/stream` | Live AI Assistant updates |

### Legacy stats endpoints (optional)

These still exist if a page needs full breakdowns; **navbar should prefer the combined endpoint**:

| Method | Route | Field |
|--------|-------|-------|
| `GET` | `/approval-queue/stats` | `pendingApproval` |
| `GET` | `/escalations/stats` | `byStatus.pending` |
