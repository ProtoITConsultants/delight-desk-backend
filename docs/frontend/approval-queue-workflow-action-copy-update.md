# Approval Queue Workflow Actions — Frontend Migration Handoff

Reference for updating the frontend after backend changes to workflow action fields and wording.

---

## Why this change happened

Workflow action `name` and `description` were almost duplicates in many cases, which created noisy UI and inconsistent wording.

Backend has been updated to:

1. Use **`name` as the single primary action label**
2. Return clearer, user-friendly language in `name` and `actionDetails`
3. **Remove `description` from `workflowActions[]` API response**

Goal: make approval queue content easier for e-commerce operators to read and act on.

---

## API contract change (important)

### Endpoint impacted

```
GET /approval-queue
```

### `workflowActions[]` shape — before vs after

#### Before

```json
{
  "id": "action-uuid",
  "name": "Mark Email as Read",
  "description": "Mark incoming email as read",
  "actionDetails": "Marking the incoming email ...",
  "status": "executed",
  "step": "1",
  "createdAt": "2026-05-25T11:11:10.237Z",
  "proposedEmailBody": null,
  "escalationId": null,
  "escalationReason": null
}
```

#### After

```json
{
  "id": "action-uuid",
  "name": "Open customer email",
  "actionDetails": "Marking the incoming email ...",
  "status": "executed",
  "step": "1",
  "createdAt": "2026-05-25T11:11:10.237Z",
  "proposedEmailBody": null,
  "escalationId": null,
  "escalationReason": null
}
```

### Breaking detail

- `workflowActions[].description` is no longer returned.

If frontend still reads `description`, it must be removed or migrated to use `name`.

---

## Frontend changes required

### 1) Stop reading `workflowActions[].description`

Search and remove usage in:

- API response typings/interfaces
- Zod/Yup/validation schemas
- UI components rendering action cards/rows
- Utility mappers/adapters
- Tests and fixtures/mock payloads

### 2) Use `name` as the single action title

Recommended rendering:

- **Primary line/title:** `name`
- **Supporting text/body:** `actionDetails` (optional if null/empty)

Do not attempt to reconstruct or re-infer old description text.

### 3) Keep `actionDetails` optional-safe

Backend attempts to provide action details, but frontend should still guard null/empty safely.

UI fallback suggestion if missing:

- show only `name` (no placeholder needed)

### 4) Update frontend test fixtures

Any mock approval queue payloads must remove:

- `workflowActions[].description`

and keep:

- `name`
- `actionDetails`

### 5) Update local frontend types

If you have a type like this:

```ts
type WorkflowAction = {
  id: string;
  name: string | null;
  description: string;
  actionDetails: string | null;
  // ...
};
```

migrate to:

```ts
type WorkflowAction = {
  id: string;
  name: string | null;
  actionDetails: string | null;
  // ...
};
```

---

## UX/content note for frontend

Action labels and details are now intentionally less technical and more operator-friendly.

Examples of new style:

- "Open customer email"
- "Confirm request type"
- "Find customer order"
- "Send quick update"
- "Check if urgent"

Frontend should display these as-is and avoid adding technical suffixes/tooltips unless product requires it.

---

## Related docs already updated

- [approval-queue-pending-approval-filter.md](./approval-queue-pending-approval-filter.md)
- [cancel-workflow-api.md](./cancel-workflow-api.md)

These docs now reflect the new `workflowActions[]` shape (without `description`).

---

## QA checklist for frontend agent

- [ ] `GET /approval-queue` parsing works without `description`
- [ ] Approval queue action cards render correctly with only `name` + `actionDetails`
- [ ] No UI crashes when `actionDetails` is null
- [ ] Type checks/build passes after type updates
- [ ] Unit/integration tests and fixtures updated
- [ ] Snapshot tests (if any) updated for text/shape change

---

## Suggested PR title for frontend

`refactor(approval-queue): remove action description and use friendly name/details`
