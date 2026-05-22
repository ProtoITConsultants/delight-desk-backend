# Pending Approval Filter — Frontend Integration Handoff

Reference for filtering approval queue items that have actions awaiting human approval.

---

## Terminology (read this first)

There are **two different `status` concepts** in the approval queue. Do not mix them up.

### 1. Workflow status — on the approval queue item

Field: `data[].status`

| Value | Meaning |
|-------|---------|
| `pending` | Workflow created; no action has started yet |
| `in_progress` | At least one action has started |
| `completed` | All actions finished successfully |
| `escalated` | Workflow escalated to a human |
| `cancelled` | Workflow cancelled by user |

Filter with: `GET /approval-queue?status=in_progress` (and other workflow values above).

### 2. Action status — on each step in `workflowActions`

Field: `data[].workflowActions[].status`

When a step needs the user to approve or reject, its status is:

```json
"status": "pending_approval"
```

**This is the only status used for “needs your approval.”** There is no `requires_approval` action status.

Filter items that have such an action with:

```
GET /approval-queue?status=pending_approval
```

---

## Do not confuse these three strings

| String | What it refers to |
|--------|-------------------|
| `pending` | **Workflow** has not started processing yet |
| `in_progress` | **Workflow** is running |
| `pending_approval` | An **action** is waiting for human approve/reject |

Example: a workflow can be `in_progress` while one of its actions is `pending_approval`. That item appears in the `pending_approval` filter.

---

## Authentication

Same as other approval-queue routes: session cookie required on every request.

---

## List Endpoint

```
GET /approval-queue?status=pending_approval
```

### Query parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | `string` | Use `pending_approval` to list items with actions awaiting approval |
| `category` | `string` | Optional category filter (unchanged) |
| `page` | `number` | Page number (default `1`) |
| `limit` | `number` | Page size (default `20`) |

### All valid `status` filter values

| Value | Filters by |
|-------|------------|
| `pending` | Workflow status |
| `in_progress` | Workflow status |
| `cancelled` | Workflow status |
| `escalated` | Workflow status |
| `completed` | Workflow status |
| `pending_approval` | Items with at least one action where `workflowActions[].status` is `pending_approval` |

**Note:** Only one `status` value is applied per request.

Example request:

```
GET /approval-queue?status=pending_approval&page=1&limit=20
```

### Example response

```json
{
  "data": [
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

### Detecting pending approval on the unfiltered list

There is no separate boolean on the item. Check actions directly:

- An item needs user approval when **any** `workflowActions[].status` equals `pending_approval`.

Use that for inline badges on the full list without applying the filter.

---

## Stats Endpoint

```
GET /approval-queue/stats
```

```json
{
  "total": 42,
  "pending": 5,
  "inProgress": 3,
  "pendingApproval": 4,
  "cancelled": 2,
  "escalated": 1,
  "completed": 31
}
```

| Field | Meaning |
|-------|---------|
| `pending` | Workflows with workflow status `pending` |
| `inProgress` | Workflows with workflow status `in_progress` |
| `pendingApproval` | Items with at least one action in `pending_approval` |
| `cancelled` | Workflows with workflow status `cancelled` |
| `escalated` | Workflows with workflow status `escalated` |
| `completed` | Workflows with workflow status `completed` |

Use `pendingApproval` for a filter tab badge (e.g. “Pending Approval (4)”).

---

## Live Updates (SSE)

```
GET /approval-queue/stream
```

On `queue_updated`, re-fetch the list and stats when showing the pending-approval filter or badge counts.

Events that can change which items match `status=pending_approval`:

| `reason` | Likely effect |
|----------|---------------|
| `action_created` | Item may gain a `pending_approval` action |
| `action_updated` | Action may enter or leave `pending_approval` |
| `action_approved` | Item may leave the filter |
| `action_rejected` | Item may leave the filter |
| `action_edited_and_approved` | Item may leave the filter |
| `workflow_cancelled` | Item may leave the filter |

---

## User Actions

Approve, reject, or edit-and-approve the action whose `workflowActions[].status` is `pending_approval`:

| Action | Endpoint |
|--------|----------|
| Approve | `POST /approval-queue/actions/:id/approve` |
| Reject | `POST /approval-queue/actions/:id/reject` |
| Edit and approve | `POST /approval-queue/actions/:id/edit-and-approve` |

Use the action `id` from the `pending_approval` step, not the approval queue item `id`.

Cancel whole workflow: `POST /approval-queue/cancel` — see [cancel-workflow-api.md](./cancel-workflow-api.md).

---

## Error Responses

Invalid `status` query value:

**HTTP 400 Bad Request**

```json
{
  "statusCode": 400,
  "message": [
    "status must be one of the following values: pending, in_progress, cancelled, escalated, completed, pending_approval"
  ],
  "error": "Bad Request"
}
```

---

## Integration Checklist

- [ ] Filter tab sends `status=pending_approval` (not `requires_approval`)
- [ ] Badge count uses stats field `pendingApproval`
- [ ] UI label can say “Pending Approval” but the API value is always `pending_approval`
- [ ] Do not confuse workflow `pending` with action `pending_approval`
- [ ] On unfiltered list, detect approval needed via `workflowActions[].status === "pending_approval"`
- [ ] Re-fetch list and stats on SSE `queue_updated`

---

## Related Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/approval-queue?status=pending_approval` | Items with actions awaiting approval |
| `GET` | `/approval-queue/stats` | Counts including `pendingApproval` |
| `GET` | `/approval-queue/stream` | SSE live updates |
| `POST` | `/approval-queue/actions/:id/approve` | Approve pending action |
| `POST` | `/approval-queue/actions/:id/reject` | Reject pending action |
| `POST` | `/approval-queue/actions/:id/edit-and-approve` | Edit and approve pending action |
