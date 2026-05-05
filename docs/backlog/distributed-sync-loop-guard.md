# Backlog: Distributed Sync-Loop Guard for the Promo Code Agent

**Status:** Backlog. Pick this up when one of the trigger conditions in the
"When to act" section becomes true.

**Owner of decision:** the team that introduces a multi-replica deployment topology
or starts seeing scale-related issues with the current implementation.

---

## Goal

Replace the per-process in-memory cache currently used for the WC → DD sync-loop
recently-pushed guard with a distributed mechanism that survives process restarts
and is visible across multiple API replicas.

## Non-goals

- Replacing the other two sync-loop guards (self-marker meta + hash equality).
  Those are independent, layered, and remain correct without any cache.
- General-purpose caching infrastructure for the rest of the codebase. This plan
  is scoped to the recently-pushed guard only.
- Sub-millisecond performance. The current cache is a fast-path optimization, not
  a correctness dependency, so we can tolerate single-digit-millisecond reads.

---

## Current implementation (as of this writing)

`WooCommerceCouponSyncService` keeps a `Map<wcCouponId, pushedAtMs>` in the Node
process:

- 60-second TTL, evicted lazily on read/write.
- 10,000-entry hard cap with oldest-first eviction (defensive).
- Stamped on every successful `syncOne` and `deleteRemote`.
- Read by the webhook receiver before any DB work.

See `src/modules/agents/woocommerce-coupon-sync.service.ts`. Search for
`recentlyPushedCache` to find every touchpoint (a few methods, two constants,
two callers).

## Why this is a *backlog* item, not a *bug*

The cache is a fast-path optimization. The webhook receiver applies three
sync-loop guards in order of cost:

1. **Recently-pushed cache** (this plan's subject) — O(1) Map check.
2. **Self-marker meta** — payload's `_delightdesk_managed=true` plus a 10-second
   timestamp window vs the matched DD row's `updatedAt`.
3. **Hash equality** — SHA-256 of canonical WC fields vs last applied hash.

If the cache misses (because we're on a different replica or just restarted),
guard 2 catches the same self-echo using only data persisted in Postgres and
the WooCommerce coupon's metadata. Guard 3 catches WC's automatic webhook
retries. So the system is provably correct without this cache; the cache only
saves a DB lookup on the common-case self-echo.

That's why we can:

- Defer this work without compromising correctness.
- Prefer the simpler implementation when we eventually do it (a few extra ms of
  latency on the fast path is fine).

---

## When to act (any of these)

Implement this plan when **one or more** of the following becomes true:

- The deployment topology changes from single-replica to multi-replica.
- Sentry / log inspection reveals frequent `[OWNERSHIP GUARD BYPASSED]`-style
  signals indicating the cache is repeatedly missing self-echoes.
- We add additional WooCommerce webhook topics (orders, products) and want the
  same loop protection without re-implementing it three times.
- The defensive-cap warn log
  (`Recently-pushed sync-loop cache hit hard cap (...)`) starts firing
  regularly. That signals push volume sustainably exceeds the TTL window.

## When NOT to act

If we're still on a single replica and the cache hard-cap warn never fires,
keep the in-memory implementation. Adding distributed infrastructure for a
fast-path optimization that's already working is over-engineering.

---

## Three approaches evaluated

### Approach A — Postgres-backed (recommended primary plan)

A small dedicated table indexed by `wc_coupon_id`, with a `pushed_at` timestamp
column. TTL handled by:

- A periodic cleanup query (`DELETE WHERE pushed_at < now() - INTERVAL '60 seconds'`)
  driven by an existing cron, OR
- An on-demand check during reads (`SELECT 1 WHERE wc_coupon_id = $1 AND pushed_at > now() - INTERVAL '60 seconds'`),
  which makes stale rows logically invisible without needing immediate cleanup.

**Pros:**

- No new infrastructure. Postgres is already in the stack.
- Survives process restarts.
- Visible across replicas immediately.
- Transactional with the rest of the sync writes if useful (we can stamp
  the cache row in the same transaction as the
  `promo_code_configurations.updateSyncMetadata` write).
- Trivial to reason about for any developer familiar with the codebase.

**Cons:**

- ~5–10 ms per check vs sub-millisecond for in-memory. Acceptable for a
  fast-path optimization.
- Adds DB write traffic on every push and DB read traffic on every webhook
  receive. Currently both volumes are tiny (human-driven edits + WC webhook
  rate per merchant).

### Approach B — Redis with native TTL

`SET key value EX 60` on push, `EXISTS key` on receive. Native TTL handles
eviction.

**Pros:**

- Purpose-built for this access pattern.
- Sub-millisecond operations.
- Native TTL — no cleanup logic needed.

**Cons:**

- Adds Redis as a hard infrastructure dependency for the API process.
- Operational complexity: provisioning, monitoring, failover, secrets, network ACLs.
- Single point of failure unless we run Redis in HA. If Redis goes down, the
  sync-loop guard fails open (other two guards still cover correctness, but
  performance degrades for every webhook).
- For a fast-path optimization, we're paying real ops cost for a perf win we
  don't currently need.

### Approach C — Hybrid (in-memory + Postgres)

Keep the per-process Map as a fast first-level check; fall through to Postgres
on miss. Both writes go to both layers.

**Pros:**

- Most reads stay in-memory (sub-millisecond).
- Restart and multi-replica gaps are covered by the DB layer.

**Cons:**

- Two layers to keep coherent. More code, more failure modes.
- Cache invalidation across replicas not solved by this hybrid alone (one
  replica's in-memory entry is still invisible to another's in-memory check;
  it still needs to hit Postgres). So the perf benefit only applies to
  single-replica or to repeated pushes within one replica's session.

---

## Recommendation

**Postgres-first (Approach A)**, with **Redis (Approach B)** as the upgrade path
if Postgres latency or load measurably becomes a problem in production.

Rationale: the cache is non-critical, single-digit-millisecond DB reads are
fine on the fast path, and we already have all the operational tooling for
Postgres. We add zero new infrastructure. If we ever genuinely need Redis-
class performance (or multi-region replication, or another caching use case
crystallizes), we revisit; the abstraction this plan introduces makes the
swap mechanical.

---

## Implementation plan (Postgres-first)

### Phase 1 — Schema + repository (one PR)

1. **New table** `woocommerce_sync_loop_marks`:

   ```sql
   CREATE TABLE woocommerce_sync_loop_marks (
     wc_coupon_id INTEGER PRIMARY KEY,
     pushed_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
   );
   CREATE INDEX woocommerce_sync_loop_marks_pushed_at_idx
     ON woocommerce_sync_loop_marks (pushed_at);
   ```

   Single-row-per-coupon. The PRIMARY KEY also gives us O(1) reads. The
   secondary index is for the periodic cleanup query.

2. **Repository** `WooCommerceSyncLoopMarksRepository`:

   - `markPushed(wcCouponId: number): Promise<void>` — `INSERT ... ON CONFLICT (wc_coupon_id) DO UPDATE SET pushed_at = now()`.
   - `isRecentlyPushed(wcCouponId: number, ttlMs: number): Promise<boolean>` —
     `SELECT 1 FROM woocommerce_sync_loop_marks WHERE wc_coupon_id = $1 AND pushed_at > now() - make_interval(secs => $2)`.
   - `deleteExpired(ttlMs: number): Promise<number>` — for the cron cleanup;
     returns deleted row count for diagnostics.

3. **Schema generation**: edit the schema file under `src/database/schema/`,
   then `npm run db:generate && npm run db:migrate` per the drizzle rule.

### Phase 2 — Abstraction layer (same PR)

Introduce a small interface in `WooCommerceCouponSyncService` (or a new helper
class) that hides the storage backend:

```ts
interface SyncLoopGuardStore {
  markPushed(wcCouponId: number): Promise<void>;
  isRecentlyPushed(wcCouponId: number): Promise<boolean>;
}
```

Two implementations:

- `InMemorySyncLoopGuardStore` — wraps the existing Map (kept as fallback or
  for tests).
- `PostgresSyncLoopGuardStore` — wraps the new repository.

Wire the Postgres implementation as the default. `markCouponRecentlyPushed`
and `isCouponRecentlyPushed` become async pass-throughs to the store.

### Phase 3 — Periodic cleanup (same PR)

Reuse the existing `@Cron(CronExpression.EVERY_30_MINUTES)` reconciliation hook
in `WooCommerceCouponSyncService`. After its existing two passes, add a third
pass that calls `WooCommerceSyncLoopMarksRepository.deleteExpired(ttlMs)`.

The reads use `WHERE pushed_at > now() - interval` so stale rows are
*functionally* invisible the moment the TTL elapses. The cleanup is housekeeping
to keep the table small, not for correctness.

### Phase 4 — Make callers async (same PR)

Audit every caller of `markCouponRecentlyPushed` and `isCouponRecentlyPushed`
in `woocommerce-coupon-sync.service.ts` and the webhook service. Both are
already in async contexts (`syncOne`, `deleteRemote`, the webhook handler), so
this is a mechanical `await` insertion.

Budget: ~5 call sites.

### Phase 5 — Rollout (a separate small PR if behind a feature flag)

Optional: gate the swap behind an env var like `SYNC_LOOP_GUARD_BACKEND=postgres|memory`
defaulting to `memory` for one deploy. Flip to `postgres` after a soak period.
Roll back is a single env var change.

### Phase 6 — Cleanup

Once Postgres is confirmed solid, delete the `InMemorySyncLoopGuardStore`
and the env var. Final state is one storage backend.

---

## Fallback path: switching to Redis

If the Postgres implementation lands and we later observe:

- Webhook receive p99 latency exceeds an acceptable threshold (set this
  before swapping; suggest 100 ms p99 on the receive endpoint as a starting
  threshold), OR
- DB write contention from `markPushed` becomes visible in slow-query logs, OR
- Multi-region deployment forces a regional cache,

then implement `RedisSyncLoopGuardStore` against the same interface introduced
in Phase 2. Operational checklist for that move:

- Provision Redis (managed: AWS ElastiCache or equivalent; self-hosted: a
  small cluster).
- Add `REDIS_URL` to env config and a connection helper module.
- Add health checks so the API doesn't 500 if Redis is briefly unreachable
  — the store should fail-open (treat as "not recently pushed") so the other
  two guards take over. Log the fall-through.
- Decide on persistence policy: AOF or none. None is fine for this use case
  because the data is ephemeral by design (60-second TTL).
- Add Sentry alerting on Redis errors.

The interface from Phase 2 means the swap is a single file's worth of
implementation plus dependency wiring. No business logic changes.

---

## Open questions to resolve before starting

- **Should the Postgres `markPushed` write be in the same transaction as
  `updateSyncMetadata`?** Probably yes — they describe the same logical event
  (DD pushed a coupon to WC). Coupling them removes one possible class of
  inconsistency where one write succeeds and the other fails. Trade-off: a
  failed mark blocks the metadata write. Acceptable since both go to the same
  DB on the same connection.

- **TTL value: keep at 60 seconds, or shorter?** Current 60 s comfortably
  covers WooCommerce's own webhook delivery window plus our processing. No
  reason to change unless we observe stale entries causing problems.

- **Should we shorten the `enforceRecentlyPushedSizeCap` warn cooldown so
  operators don't get spammed?** Currently logs once per breach event. With
  Postgres, this cap goes away entirely (table size is bounded by TTL plus
  cleanup cron, not by an in-memory cap). N/A once Phase 6 is done.

---

## Effort estimate

- Phase 1–4 combined: ~1 day of focused work, mostly mechanical.
- Phase 5 (feature flag): 1–2 hours.
- Phase 6 (cleanup): 30 minutes.
- Redis fallback if eventually needed: ~half a day.
