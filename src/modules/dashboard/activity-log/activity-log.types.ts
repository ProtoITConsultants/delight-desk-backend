/**
 * Types that describe a single entry in the user-facing activity log.
 *
 * The activity log is a read-model derived from `approval_queue_actions`
 * joined with `approval_queue` — we do NOT persist a separate activity
 * table. Each activity log entry corresponds to a single AI agent
 * action row, projected into a UI-friendly shape.
 */

/**
 * Status buckets surfaced to the UI (matches the colored chips next to
 * each entry on the dashboard Activity Log card).
 *
 * The underlying `approval_queue_actions.actionStatus` has more granular
 * values (pending_approval / approved / executing / executed / failed /
 * escalated / rejected / cancelled). Those are collapsed into these buckets in
 * the service layer.
 */
export enum ActivityLogStatus {
  COMPLETED = 'completed',
  FAILED = 'failed',
  PENDING = 'pending',
  CANCELLED = 'cancelled',
}
