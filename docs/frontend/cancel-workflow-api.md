# Cancel Workflow API — Frontend Integration Handoff

Reference for integrating the **Cancel Workflow** action in the approval queue UI.

---

## Overview

Users can cancel an in-progress AI workflow from the approval queue. When cancel succeeds, the backend:

1. Sets the **workflow** status to `cancelled`
2. Sets the **current in-flight action** status to `cancelled` (not `rejected` or `escalated`)
3. Sends a cancel request to **Temporal** to stop the running workflow
4. Emits **SSE events** so connected clients can refresh the approval queue and activity log

---

## Authentication

All approval-queue routes require an authenticated session.

| Requirement | Detail |
|-------------|--------|
| Auth method | Session cookie (set by `POST /auth/login` or signup) |
| Credentials | Include session cookies on every request |
| Unauthorized | `401` — `{ "statusCode": 401, "message": "Not authenticated" }` |

---

## Cancel Workflow Endpoint

```
POST /approval-queue/cancel
Content-Type: application/json
```

### Request body

Send **at least one** of these identifiers:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Approval queue row UUID (from `GET /approval-queue` → `data[].id`) |
| `workflowId` | `string` | Temporal workflow ID (from `GET /approval-queue` → `data[].workflowId`, format: `workflow-thread-<thread-uuid>`) |

**Recommended:** use `id` from the list item already shown in the UI.

Example:

```json
{ "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }
```

or

```json
{ "workflowId": "workflow-thread-abc123-def456-..." }
```

### Success response

**HTTP 200 OK**

```json
{
  "message": "Workflow cancelled successfully"
}
```

---

## When to Show the Cancel Button

Show **Cancel Workflow** only when the workflow status is cancellable.

| Workflow `status` | Show cancel button? |
|-------------------|---------------------|
| `pending` | Yes |
| `in_progress` | Yes |
| `cancelled` | No (already cancelled) |
| `completed` | No |
| `escalated` | No |

---

## Error Responses

| HTTP | When | Example message |
|------|------|-----------------|
| `400` | Missing both `id` and `workflowId` | `"Either workflowId or id is required"` |
| `400` | Workflow already in a terminal state | `"Cannot cancel a workflow with status: cancelled"` (also applies to `completed`, `escalated`) |
| `400` | Temporal workflow not found or already finished | `"Workflow not found or already completed"` |
| `400` | Other Temporal cancel failure | `"Failed to cancel workflow"` |
| `401` | Not logged in | `"Not authenticated"` |
| `404` | No matching workflow for this user | `"Workflow not found"` |

NestJS error shape:

```json
{
  "statusCode": 400,
  "message": "Cannot cancel a workflow with status: cancelled",
  "error": "Bad Request"
}
```

### Frontend handling notes

- **Repeat cancel on an already-cancelled item:** expect `400` with `"Cannot cancel a workflow with status: cancelled"`. Disable the button or remove/hide the row after the first successful cancel.
- **Optimistic UI:** optional, but prefer waiting for `200` before treating the workflow as cancelled.
- **Loading state:** disable the cancel button while the request is in flight.

---

## UI State After Successful Cancel

### Workflow-level status

```json
"status": "cancelled"
```

### Action-level status

The **current in-flight action** becomes:

```json
"status": "cancelled"
```

Earlier completed steps remain `"executed"`.

### Action status values (reference)

| Value | Meaning |
|-------|---------|
| `pending_approval` | Waiting for human approve/reject |
| `approved` | Human approved, not yet executing |
| `executing` | Action running |
| `awaiting_customer_reply` | Waiting on customer |
| `executed` | Step completed successfully |
| `rejected` | Human rejected the action |
| `failed` | Action failed |
| `escalated` | Action escalated to human |
| `cancelled` | Workflow was cancelled by user |

**Important:** `cancelled` is distinct from `rejected` and `escalated`. Do not display cancelled actions using the same UI treatment as failed or rejected actions.

---

## Data Source: Approval Queue List

Use `GET /approval-queue` to populate the approval queue and determine which items can be cancelled.

### Example list item shape

```json
{
  "id": "approval-queue-uuid",
  "workflowId": "workflow-thread-thread-uuid",
  "status": "in_progress",
  "category": "order_cancellation",
  "customerEmail": "customer@example.com",
  "customerName": "Jane Doe",
  "emailSubject": "Cancel my order",
  "originalCustomerEmailBody": "...",
  "createdAt": "2026-05-22T10:00:00.000Z",
  "workflowActions": [
    {
      "id": "action-uuid",
      "name": "Send Acknowledgement",
      "actionDetails": "...",
      "status": "pending_approval",
      "step": "5",
      "createdAt": "2026-05-22T10:01:00.000Z",
      "proposedEmailBody": "...",
      "escalationId": null,
      "escalationReason": null
    }
  ]
}
```

**Cancel request:** send `id` or `workflowId` from this object — not an action `id`.

---

## Live Updates (SSE)

Subscribe to real-time queue changes:

```
GET /approval-queue/stream
```

The connection must include the user's session cookie (same-origin, or CORS configured with credentials).

### Event types

**1. Connected (on connect)**

```json
{
  "type": "connected",
  "timestamp": "2026-05-22T10:00:00.000Z",
  "reconnectInMs": 2000
}
```

**2. Queue updated (after cancel, approve, reject, etc.)**

```json
{
  "type": "queue_updated",
  "reason": "workflow_cancelled",
  "timestamp": "2026-05-22T10:05:00.000Z"
}
```

Other `reason` values include `action_approved`, `action_rejected`, `action_edited_and_approved`, `workflow_created`, `action_created`, `action_updated`, `action_executed`, `action_escalated`, and `workflow_status_updated`.

**3. Heartbeat (approximately every 25 seconds)**

```json
{
  "type": "heartbeat",
  "timestamp": "2026-05-22T10:05:25.000Z"
}
```

### Recommended SSE handling

On `queue_updated` with `reason: "workflow_cancelled"`, re-fetch:

- The approval queue list (`GET /approval-queue`)
- Approval queue stats if displayed (`GET /approval-queue/stats`)
- The activity log if displayed on the same page

The backend also emits a matching activity-log SSE event when a workflow is cancelled.

---

## Workflow Progress View

`GET /approval-queue/workflows` returns progress timelines for supported agent categories.

After cancel:

- Item `status` → `"cancelled"`
- The current stage in `actionProgress.timeline[].status` → `"cancelled"` (not `"blocked"`)

**Note:** this endpoint returns `id` but does **not** include `workflowId`. Use `id` when cancelling from the workflow progress view.

---

## Stats Endpoint

`GET /approval-queue/stats` includes a `cancelled` count. Re-fetch after a successful cancel or after receiving SSE `workflow_cancelled`.

Example response:

```json
{
  "total": 42,
  "pending": 5,
  "inProgress": 3,
  "cancelled": 2,
  "escalated": 1,
  "completed": 31
}
```

---

## Activity Log

Cancelled actions appear under the **`cancelled`** activity-log status bucket (not `failed`).

Filter: `GET /dashboard/activity-log?status=cancelled`

Example entry shape:

```json
{
  "id": "action-uuid",
  "status": "cancelled",
  "rawStatus": "cancelled",
  "message": "...",
  "actionName": "Send Acknowledgement",
  "customerEmail": "customer@example.com",
  "agentName": "WISMO Agent",
  "timestamp": "2026-05-22T10:05:00.000Z"
}
```

Activity log status buckets:

| UI bucket | Raw action statuses |
|-----------|---------------------|
| `completed` | `executed`, `approved` |
| `failed` | `failed`, `escalated`, `rejected` |
| `pending` | `pending_approval`, `executing`, `awaiting_customer_reply` |
| `cancelled` | `cancelled` |

---

## Cancel vs Reject

Do not confuse whole-workflow cancel with single-action reject.

| User action | Endpoint | Workflow status after | Action status after |
|-------------|----------|----------------------|---------------------|
| **Cancel workflow** | `POST /approval-queue/cancel` | `cancelled` | Current action → `cancelled` |
| **Reject action** | `POST /approval-queue/actions/:id/reject` | `escalated` | That action → `rejected` |

Cancel stops the entire workflow. Reject declines one pending action and escalates the workflow.

---

## Integration Checklist

- [ ] Cancel button visible only for `pending` and `in_progress` workflows
- [ ] Request includes session credentials
- [ ] Request body sends `id` (preferred) or `workflowId`
- [ ] Cancel button disabled while the request is in flight
- [ ] Handle `400` for already-cancelled workflows (disable button or update UI)
- [ ] On success, update UI or re-fetch the approval queue list
- [ ] SSE listener triggers re-fetch on `queue_updated` with `reason: "workflow_cancelled"`
- [ ] Cancelled actions styled differently from rejected/escalated actions
- [ ] Activity log refreshed after cancel if shown on the same page

---

## Related Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/approval-queue` | List approval queue items |
| `GET` | `/approval-queue/workflows` | Workflow progress timelines |
| `GET` | `/approval-queue/stats` | Queue counts by status |
| `GET` | `/approval-queue/stream` | SSE live updates |
| `POST` | `/approval-queue/cancel` | Cancel a workflow |
| `POST` | `/approval-queue/actions/:id/approve` | Approve a pending action |
| `POST` | `/approval-queue/actions/:id/reject` | Reject a pending action |
| `GET` | `/dashboard/activity-log` | Activity log entries |
