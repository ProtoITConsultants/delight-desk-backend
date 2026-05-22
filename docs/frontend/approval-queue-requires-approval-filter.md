# Requires Approval Filter — Frontend Integration Handoff

Reference for adding the **Requires Approval** filter to the approval queue list UI.

---

## Overview

The approval queue list supports a virtual filter status, `requires_approval`, for items that have **at least one action waiting for human approval**.

This is different from workflow-level statuses such as `in_progress` or `pending`:

| Concept | Field | Example values |
|---------|-------|----------------|
| **Workflow status** | `status` on the approval queue item | `pending`, `in_progress`, `completed`, `escalated`, `cancelled` |
| **Requires approval** | Derived from actions | Any item with an action in `pending_approval` |

An item can be `in_progress` **and** require approval at the same time. The `requires_approval` filter surfaces items where the user still needs to approve or reject an action.

---

## Authentication

Same as other approval-queue routes: session cookie required on every request.

---

## List Endpoint

```
GET /approval-queue?status=requires_approval
```

### Query parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | `string` | Filter value. Use `requires_approval` for this filter. |
| `category` | `string` | Optional category filter (unchanged). |
| `page` | `number` | Page number (default `1`). |
| `limit` | `number` | Page size (default `20`). |

### All valid `status` filter values

| Value | Filters by |
|-------|------------|
| `pending` | Workflow status |
| `in_progress` | Workflow status |
| `cancelled` | Workflow status |
| `escalated` | Workflow status |
| `completed` | Workflow status |
| `requires_approval` | At least one action with `pending_approval` |

**Note:** Only one `status` value is applied per request (same behavior as existing workflow status filters).

Example request:

```
GET /approval-queue?status=requires_approval&page=1&limit=20
```

### Example response

```json
{
  "data": [
    {
      "id": "approval-queue-uuid",
      "workflowId": "workflow-thread-thread-uuid",
      "status": "in_progress",
      "requiresApproval": true,
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
          "description": "...",
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
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 1,
    "totalItems": 1,
    "itemsPerPage": 20,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

### New list item field: `requiresApproval`

Every item in `GET /approval-queue` now includes:

```json
"requiresApproval": true
```

| Value | Meaning |
|-------|---------|
| `true` | At least one action in `workflowActions` has `status: "pending_approval"` |
| `false` | No actions are waiting for human approval |

Use this field to show badges or highlights on the unfiltered list without an extra API call.

---

## Stats Endpoint

```
GET /approval-queue/stats
```

The stats response includes a count for items requiring approval:

```json
{
  "total": 42,
  "pending": 5,
  "inProgress": 3,
  "requiresApproval": 4,
  "cancelled": 2,
  "escalated": 1,
  "completed": 31
}
```

| Field | Meaning |
|-------|---------|
| `requiresApproval` | Number of approval queue items with at least one `pending_approval` action |

Use this for filter tab badges (e.g. “Requires Approval (4)”).

---

## How “Requires Approval” Is Determined

An item matches when **any** of its `workflowActions` has:

```json
"status": "pending_approval"
```

Typical scenarios:

- Workflow is `in_progress` and the current step is awaiting approve/reject
- Workflow is `pending` and the first moderated action is waiting

Items that do **not** match:

- All actions are `executed`, `rejected`, `escalated`, `cancelled`, etc.
- Workflow is `completed`, `escalated`, or `cancelled` with no pending actions

---

## Workflow Status vs Requires Approval

These filters answer different questions:

| Filter | Question it answers |
|--------|---------------------|
| `status=in_progress` | “Which workflows are still running?” |
| `status=requires_approval` | “Which items need me to approve or reject something now?” |

Examples:

| Workflow `status` | Has `pending_approval` action? | In `requires_approval` filter? |
|-------------------|-------------------------------|--------------------------------|
| `in_progress` | Yes | Yes |
| `in_progress` | No (e.g. executing) | No |
| `pending` | Yes | Yes |
| `completed` | No | No |
| `escalated` | No | No |

---

## Live Updates (SSE)

When queue data changes, re-fetch the list and stats if the user is viewing the requires-approval filter or badge counts.

```
GET /approval-queue/stream
```

Relevant `queue_updated` reasons that may change `requiresApproval` counts or list membership:

| `reason` | Likely effect |
|----------|---------------|
| `action_created` | New item may require approval |
| `action_updated` | Action may enter or leave `pending_approval` |
| `action_approved` | Item may no longer require approval |
| `action_rejected` | Item may no longer require approval |
| `action_edited_and_approved` | Item may no longer require approval |
| `workflow_cancelled` | Item leaves requires-approval set |
| `workflow_status_updated` | May correlate with approval state changes |

On any `queue_updated` event, re-fetch:

- `GET /approval-queue` (if list is visible)
- `GET /approval-queue/stats` (if filter badges are shown)

---

## User Actions on Items Requiring Approval

Once filtered, users typically approve, reject, or edit-and-approve the pending action:

| Action | Endpoint |
|--------|----------|
| Approve | `POST /approval-queue/actions/:id/approve` |
| Reject | `POST /approval-queue/actions/:id/reject` |
| Edit and approve | `POST /approval-queue/actions/:id/edit-and-approve` |

Use the action `id` from `workflowActions` where `status` is `pending_approval`.

Cancel workflow (whole item): `POST /approval-queue/cancel` — see [cancel-workflow-api.md](./cancel-workflow-api.md).

---

## Error Responses

Invalid `status` query value:

**HTTP 400 Bad Request**

```json
{
  "statusCode": 400,
  "message": [
    "status must be one of the following values: pending, in_progress, cancelled, escalated, completed, requires_approval"
  ],
  "error": "Bad Request"
}
```

---

## Integration Checklist

- [ ] Add “Requires Approval” filter option with query value `requires_approval`
- [ ] Show badge count from `GET /approval-queue/stats` → `requiresApproval`
- [ ] Use `requiresApproval` on list items for inline badges on the unfiltered view
- [ ] Re-fetch list and stats on SSE `queue_updated` events
- [ ] Do not confuse `requires_approval` with workflow `pending` or `in_progress`
- [ ] Wire approve/reject/edit actions to the `pending_approval` action in `workflowActions`

---

## Related Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/approval-queue?status=requires_approval` | List items needing approval |
| `GET` | `/approval-queue/stats` | Counts including `requiresApproval` |
| `GET` | `/approval-queue/stream` | SSE live updates |
| `POST` | `/approval-queue/actions/:id/approve` | Approve pending action |
| `POST` | `/approval-queue/actions/:id/reject` | Reject pending action |
| `POST` | `/approval-queue/actions/:id/edit-and-approve` | Edit and approve pending action |
