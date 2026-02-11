# WISMO Workflow Refactoring

## Overview

The WISMO (Where Is My Order) workflow has been refactored from a single 866-line monolithic file into a modular architecture with 8 focused files totaling 1,558 lines. This refactoring improves maintainability, testability, and observability.

## File Structure

```
workflows/agents/wismo/
├── index.ts                                    (21 lines)   - Module exports
├── wismo.constants.ts                          (60 lines)   - Configuration constants
├── wismo.types.ts                              (53 lines)   - Type definitions
├── wismo.helpers.ts                            (54 lines)   - Utility functions
├── wismo-main.workflow.ts                      (256 lines)  - Main orchestrator
└── sub-workflows/
    ├── wismo-preparation.sub-workflow.ts       (153 lines)  - Actions 1-2
    ├── wismo-order-discovery.sub-workflow.ts   (297 lines)  - Actions 3-3.1
    ├── wismo-order-processing.sub-workflow.ts  (209 lines)  - Actions 4-5
    └── wismo-tracking.sub-workflow.ts          (455 lines)  - Actions 6-9
```

**Total:** 1,558 lines across 9 files (vs 866 lines in 1 file)

## Architecture

### Main Workflow (wismo-main.workflow.ts)

The main orchestrator coordinates all phases:

1. **Initialization:** Sets up workflow state, signal handlers, and context
2. **Phase Execution:** Executes each sub-workflow sequentially
3. **Error Handling:** Catches escalations and failures
4. **Completion:** Marks workflow as completed

**Key Responsibilities:**
- Signal handler setup (humanResponseSignal, stateQuery)
- Context initialization
- Sub-workflow orchestration
- Final completion handling

### Sub-Workflows

#### 1. Preparation Sub-Workflow (Actions 1-2)
- Mark email as read
- Verify AI classification confidence
- Early escalation for low confidence

#### 2. Order Discovery Sub-Workflow (Actions 3-3.1)
- Extract order number from email
- Find order by customer email
- Request order info from customer (if needed)
- Wait for customer reply (up to 3 days)

#### 3. Order Processing Sub-Workflow (Actions 4-5)
- Fetch order details from WooCommerce
- Send acknowledgement email (if moderation enabled)

#### 4. Tracking Sub-Workflow (Actions 6-9)
- Wait for tracking number (up to 7 days)
- Create AfterShip tracking
- Monitor tracking status (until delivered)
- Send final delivery notification

## State Management

**Critical Pattern:** Sub-workflows mutate `context.state` directly (NOT return values).

```typescript
const context: ActionExecutionContext = {
  workflowId,
  workflowRunId,
  userId,
  email,
  state,  // WorkflowState object (mutated in-place)
  requiresModeration,
  agentType: 'WISMO Agent',
};

await executeChild(handleWismoPreparation, { args: [context] });
// context.state is already updated by sub-workflow
```

This approach is:
- **Temporal-safe:** Context object is part of workflow state, automatically persisted
- **Single source of truth:** No state synchronization issues
- **Consistent:** executeWorkflowAction already mutates context.state

## Feature Flag

The refactored workflow is deployed with a feature flag to enable gradual rollout:

```typescript
// In email.workflow.ts
const USE_REFACTORED_WISMO = process.env.USE_REFACTORED_WISMO_WORKFLOW === 'true';
```

**Default:** `false` (uses legacy workflow)

### Rollout Strategy

1. Deploy with feature flag OFF
2. Test in staging with flag ON
3. Gradual production rollout: 10% → 50% → 100%
4. Remove legacy workflow after 1 week of stability

## Benefits

### 1. Improved Maintainability
- Files are 100-300 lines (vs 866)
- Single responsibility per file
- Easy to locate and modify specific logic

### 2. Better Testability
- Each phase can be tested independently
- Mock sub-workflows for integration tests
- Isolated unit tests for helpers

### 3. Enhanced Observability
- Phase boundaries visible in Temporal UI
- Clear workflow hierarchy
- Easier to debug specific phases

### 4. Reduced Cognitive Load
- Developers focus on one phase at a time
- Clear separation of concerns
- Self-documenting structure

### 5. Future-Proof
- Easy to modify individual phases
- Add new phases without affecting existing ones
- Reuse sub-workflows in other contexts

## Migration from Legacy

### Code Changes Required

#### Before (Legacy)
```typescript
import { handleWismo } from './wismo.workflow';
```

#### After (Refactored)
```typescript
import { handleWismo } from './agents/wismo/wismo-main.workflow';
```

### Feature Flag Usage

**Environment Variable:**
```bash
USE_REFACTORED_WISMO_WORKFLOW=true  # Enable refactored workflow
USE_REFACTORED_WISMO_WORKFLOW=false # Use legacy workflow (default)
```

**Testing in Development:**
```bash
# .env.local
USE_REFACTORED_WISMO_WORKFLOW=true
```

## Testing

### Unit Tests (Sub-workflows)
Test each sub-workflow independently with mocked activities:

```typescript
describe('handleWismoPreparation', () => {
  it('should mark email as read and verify confidence', async () => {
    // Mock context and activities
    // Execute sub-workflow
    // Assert result and state changes
  });
});
```

### Integration Tests (Main Workflow)
Test orchestration with mocked sub-workflows:

```typescript
describe('handleWismo orchestrator', () => {
  it('should execute all phases in sequence', async () => {
    // Mock sub-workflows
    // Execute main workflow
    // Assert phase execution order
  });
});
```

## Activity Proxy Configuration

Each sub-workflow declares its own activity proxies using constants from `wismo.constants.ts`:

```typescript
const emailActivities = proxyActivities<typeof EmailActivities.prototype>(
  ACTIVITY_TIMEOUTS.EMAIL
);
```

This provides:
- Activity configuration near usage
- Clear visibility of dependencies
- Different timeouts per phase if needed

## Constants

All configuration is centralized in `wismo.constants.ts`:

- `CLASSIFICATION_CONFIDENCE_THRESHOLD = 70`
- `MAX_TRACKING_RETRIES_IN_DAYS = 7`
- `TRACKING_RETRY_INTERVAL = '2 hours'`
- `STATUS_CHECK_INTERVAL = '2 hours'`
- `CUSTOMER_REPLY_CHECK_INTERVAL = '10 minutes'`
- `MAX_CUSTOMER_REPLY_WAIT_DAYS = 3`
- `ACTIVITY_TIMEOUTS` - All activity timeout configurations

## Comparison: Legacy vs Refactored

| Aspect | Legacy | Refactored |
|--------|--------|------------|
| **Total Lines** | 866 | 1,558 (across 9 files) |
| **Largest File** | 866 | 455 (tracking sub-workflow) |
| **Files** | 1 | 9 |
| **Testability** | Difficult | Easy (isolated sub-workflows) |
| **Observability** | Single workflow | 4 visible phases |
| **Maintainability** | Hard to navigate | Easy to locate logic |
| **Cognitive Load** | High | Low (focused files) |

## Performance Impact

- **Overhead:** ~20-40ms total for child workflow spawning (negligible for 7-14 day workflows)
- **Benefits:** Better observability, easier debugging, clearer phase transitions in Temporal UI

## Rollback Plan

If issues are detected:

1. Set `USE_REFACTORED_WISMO_WORKFLOW=false` in environment
2. Restart Temporal workers
3. Legacy workflow immediately takes over
4. No data loss (state management is compatible)

The legacy workflow file (`wismo-legacy.workflow.ts`) will be maintained for 1 week after full rollout before removal.

## Future Improvements

1. Add comprehensive unit tests for each sub-workflow
2. Add integration tests for main orchestrator
3. Monitor metrics comparing legacy vs refactored performance
4. Consider extracting reusable patterns to a workflow utilities library
5. Add timeout configurations per-phase if needed

## References

- **Legacy Workflow:** `src/modules/email-pipeline/temporal/workflows/wismo-legacy.workflow.ts`
- **Refactored Workflow:** `src/modules/email-pipeline/temporal/workflows/agents/wismo/`
- **Router:** `src/modules/email-pipeline/temporal/workflows/email.workflow.ts`
