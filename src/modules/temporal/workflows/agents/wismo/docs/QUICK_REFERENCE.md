# WISMO Workflow Quick Reference

## 📁 File Structure

```
workflows/agents/wismo/
├── wismo-main.workflow.ts           Main orchestrator
├── wismo.constants.ts               Configuration
├── wismo.types.ts                   Type definitions
├── wismo.helpers.ts                 Utilities
├── index.ts                         Module exports
└── sub-workflows/
    ├── wismo-preparation.sub-workflow.ts      Actions 1-2
    ├── wismo-order-discovery.sub-workflow.ts  Actions 3-3.1
    ├── wismo-order-processing.sub-workflow.ts Actions 4-5
    └── wismo-tracking.sub-workflow.ts         Actions 6-9
```

## 🔄 Workflow Phases

| Phase | Actions | Purpose | Duration |
|-------|---------|---------|----------|
| **Preparation** | 1-2 | Validate email and confidence | Seconds |
| **Order Discovery** | 3-3.1 | Find or request order info | Up to 3 days |
| **Order Processing** | 4-5 | Fetch details and acknowledge | Minutes |
| **Tracking** | 6-9 | Monitor until delivery | Up to weeks |

## 🚀 Usage

### Import Main Workflow
```typescript
import { handleWismo } from '@/modules/email-pipeline/temporal/workflows/agents/wismo';
```

### Import Sub-Workflows
```typescript
import {
  handleWismoPreparation,
  handleWismoOrderDiscovery,
  handleWismoOrderProcessing,
  handleWismoTracking,
} from '@/modules/email-pipeline/temporal/workflows/agents/wismo';
```

### Import Constants
```typescript
import {
  CLASSIFICATION_CONFIDENCE_THRESHOLD,
  MAX_TRACKING_RETRIES_IN_DAYS,
  ACTIVITY_TIMEOUTS,
} from '@/modules/email-pipeline/temporal/workflows/agents/wismo';
```

### Import Helpers
```typescript
import {
  formatWooCommerceOrder,
  extractEmail,
  extractCustomerName,
} from '@/modules/email-pipeline/temporal/workflows/agents/wismo';
```

## 🎛️ Feature Flag

### Enable Refactored Workflow
```bash
USE_REFACTORED_WISMO_WORKFLOW=true
```

### Use Legacy Workflow (Default)
```bash
USE_REFACTORED_WISMO_WORKFLOW=false
# or simply unset the variable
```

## 🔧 Common Tasks

### Running in Development
```bash
# Use legacy workflow
npm run start:dev

# Use refactored workflow
USE_REFACTORED_WISMO_WORKFLOW=true npm run start:dev
```

### Building
```bash
npm run build
```

### Testing (when tests are added)
```bash
npm test
npm run test:watch
npm run test:cov
```

## 📊 Monitoring

### Temporal UI
```
http://localhost:8233
```

### Check Workflow Execution
```bash
temporal workflow show -w <workflow-id>
```

### List Recent Workflows
```bash
temporal workflow list
```

### Query Workflow State
```bash
temporal workflow query -w <workflow-id> -q state
```

## 🐛 Debugging

### View Workflow Logs
```bash
# Check application logs
tail -f logs/application.log | grep WISMO

# Check Temporal worker logs
tail -f logs/temporal-worker.log
```

### Common Issues

#### Issue: Child workflow not found
**Solution:** Check child workflow IDs are unique:
```typescript
workflowId: `${parentWorkflowId}-preparation`
```

#### Issue: State not persisting
**Solution:** Ensure context.state is mutated:
```typescript
context.state.orderNumber = "12345"; // ✅ Correct
return { orderNumber: "12345" };     // ❌ Wrong
```

#### Issue: Signal not received
**Solution:** Signals must be in main workflow:
```typescript
// ✅ In wismo-main.workflow.ts
setHandler(humanResponseSignal, handler);

// ❌ Not in sub-workflows
```

## 📈 Key Metrics to Monitor

| Metric | Target | Query |
|--------|--------|-------|
| Completion Rate | ≥95% | Check approval_queue status |
| Escalation Rate | ≤10% | Check escalations table |
| Avg Execution Time | Baseline ±10% | Temporal UI metrics |
| Phase Success Rate | ≥98% per phase | Temporal workflow history |

## 🔐 State Management Pattern

```typescript
// ✅ CORRECT: Mutate context.state
const context: ActionExecutionContext = { /* ... */ };
await executeChild(handleWismoPreparation, { args: [context] });
// context.state is already updated

// ❌ WRONG: Return new state
const newState = await executeChild(handleWismoPreparation, { args: [context] });
context.state = newState.state; // Don't do this!
```

## 🎯 Activity Timeouts

```typescript
ACTIVITY_TIMEOUTS = {
  EMAIL: { startToCloseTimeout: '2 minutes' },
  AI_IDENTITY: { startToCloseTimeout: '30 seconds' },
  WISMO_ORDER: { startToCloseTimeout: '5 minutes' },
  WISMO_TRACKING: { startToCloseTimeout: '3 minutes' },
  WISMO_MESSAGE: { startToCloseTimeout: '2 minutes' },
}
```

## 📝 Adding New Actions

1. Add action type to `WismoActionType` enum
2. Add action to appropriate sub-workflow
3. Use `executeWorkflowAction` pattern
4. Update documentation

Example:
```typescript
const result = await executeWorkflowAction(
  {
    type: WismoActionType.NEW_ACTION,
    step: 10,
    description: 'Description of new action',
  },
  async () => {
    // Action implementation
    const result = await someActivity();
    context.state.newField = result;
    return { result };
  },
  context,
);
```

## 🔍 Useful Queries

### Check Recent WISMO Workflows
```sql
SELECT *
FROM approval_queue
WHERE agent_type = 'WISMO Agent'
ORDER BY created_at DESC
LIMIT 10;
```

### Check Action Status
```sql
SELECT action_type, action_status, COUNT(*)
FROM approval_queue_actions
WHERE approval_queue_id IN (
  SELECT id FROM approval_queue
  WHERE agent_type = 'WISMO Agent'
)
GROUP BY action_type, action_status;
```

### Check Escalations
```sql
SELECT escalation_type, COUNT(*)
FROM escalations
WHERE workflow_id LIKE '%wismo%'
AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY escalation_type;
```

## 📞 Support

- **Documentation:** Check README.md and MIGRATION_GUIDE.md
- **Architecture Questions:** Review code comments and type definitions
- **Deployment Issues:** Follow MIGRATION_GUIDE.md step-by-step
- **Bug Reports:** Include workflow ID and Temporal UI screenshots

## 🔗 Related Files

- **Legacy Workflow:** `../wismo-legacy.workflow.ts`
- **Router:** `../email.workflow.ts`
- **Types:** `../../../types/workflow-actions.types.ts`
- **State Types:** `../../../types/index.ts`
- **Activities:** `../../activities/agents/wismo/`

## 💡 Best Practices

1. **Always use constants** - Never hardcode timeouts or thresholds
2. **Mutate context.state** - Don't return state from sub-workflows
3. **Log at phase boundaries** - Use structured logging
4. **Handle escalations** - Always catch and escalate properly
5. **Test in staging first** - Never deploy directly to production
6. **Monitor metrics** - Set up alerts for error rates
7. **Document changes** - Update this guide when adding features

## ⚡ Performance Tips

- Child workflow overhead: ~20-40ms (negligible for long workflows)
- Use appropriate activity timeouts
- Monitor Temporal worker capacity
- Consider workflow caching for high volume

## 🎓 Learning Resources

- [Temporal Documentation](https://docs.temporal.io/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [NestJS Documentation](https://docs.nestjs.com/)
- Project README.md for architecture overview
