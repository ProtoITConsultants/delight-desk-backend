# AI Assistant Escalation Stats API — Frontend Integration Handoff

Reference for integrating escalation stats in the AI Assistant (escalation queue) UI.

---

## Endpoint

```
GET /escalations/stats
```

Returns aggregate escalation counts for the logged-in user.

### Authentication

Session cookie required on every request.

---

## Query Parameters

All query params are optional.

| Parameter | Type | Description |
|-----------|------|-------------|
| `dateFrom` | `string` | Include escalations with `createdAt >= dateFrom` |
| `dateTo` | `string` | Include escalations with `createdAt <= dateTo` |

### Notes

- Date filtering is based on escalation **`createdAt`**.
- Use ISO date/time strings (recommended), for example `2026-05-01T00:00:00.000Z`.
- If no date filters are sent, stats are calculated over all escalations for that user.

Example:

```
GET /escalations/stats?dateFrom=2026-05-01T00:00:00.000Z&dateTo=2026-05-31T23:59:59.999Z
```

---

## Success Response

**HTTP 200 OK**

```json
{
  "total": 21,
  "byStatus": {
    "pending": 6,
    "progress": 8,
    "resolved": 7
  },
  "byPriority": {
    "low": 2,
    "medium": 9,
    "high": 7,
    "urgent": 3
  }
}
```

### Response fields

| Field | Meaning |
|-------|---------|
| `total` | Total escalations in scope (after date filters, if any) |
| `byStatus.pending` | New escalations not handled yet |
| `byStatus.progress` | Escalations currently being worked |
| `byStatus.resolved` | Closed escalations |
| `byPriority.low` | Low priority escalations |
| `byPriority.medium` | Medium priority escalations |
| `byPriority.high` | High priority escalations |
| `byPriority.urgent` | Urgent priority escalations |

Backend guarantees all status and priority keys are always present in the response (missing groups are returned as `0`).

---

## Status Vocabulary (Important)

Escalation statuses:

| Status | Meaning |
|--------|---------|
| `pending` | New ticket |
| `progress` | In progress |
| `resolved` | Completed/closed |

Important for frontend mapping:

- `progress` is the backend value (not `in_progress`).
- Navbar badge for AI Assistant "pending" should use `byStatus.pending`.

---

## Error Responses

| HTTP | Meaning |
|------|---------|
| `401` | Not authenticated |
| `400` | Invalid query params (if validation fails) |
| `5xx` | Server-side error |

Typical NestJS error shape:

```json
{
  "statusCode": 401,
  "message": "Not authenticated",
  "error": "Unauthorized"
}
```

Frontend handling guidance:

- On `401`: redirect to login or trigger session refresh flow.
- On `5xx`: keep last known stats and show non-blocking error state.

---

## Live Updates (SSE)

To keep stats current in real time, subscribe to:

```
GET /escalations/stream
```

When event `type` is `escalations_updated`, re-fetch:

- `GET /escalations/stats` (this endpoint)
- Any visible escalation list endpoint (`/escalations` or `/escalations/thread`)

Common `reason` values that should trigger stats refresh:

- `escalation_created`
- `escalation_status_updated`
- `escalations_bulk_status_updated`
- `escalation_response_sent`

Also handle heartbeat/connected events as transport-level events only (no stats re-fetch needed unless your client strategy prefers it).

---

## Usage Guidance

Use this endpoint when the UI needs **breakdowns** (status and priority cards/charts).

If the UI only needs navbar badge counts, prefer:

```
GET /dashboard/nav-badge-counts
```

That endpoint returns both approval queue and AI assistant badge counts in one call.

---

## Integration Checklist

- [ ] Fetch `GET /escalations/stats` on AI Assistant dashboard/page load
- [ ] Pass session credentials with the request
- [ ] Map `byStatus` to status KPI cards/charts
- [ ] Map `byPriority` to priority KPI cards/charts
- [ ] Use `byStatus.pending` for AI Assistant pending indicator/badge
- [ ] Add optional date range filter using `dateFrom` and `dateTo`
- [ ] Subscribe to `/escalations/stream` and re-fetch stats on `escalations_updated`
- [ ] Handle `401` and `5xx` gracefully

---

## Related Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/escalations/stats` | Escalation aggregate stats (this doc) |
| `GET` | `/escalations` | Escalation list (without thread messages) |
| `GET` | `/escalations/thread` | Escalation list with full thread/messages |
| `GET` | `/escalations/stream` | SSE live updates for escalations |
| `GET` | `/dashboard/nav-badge-counts` | Combined navbar badges for Approval Queue + AI Assistant |
