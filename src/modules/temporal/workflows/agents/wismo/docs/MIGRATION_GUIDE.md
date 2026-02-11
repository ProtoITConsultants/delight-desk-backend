# WISMO Workflow Migration Guide

## Overview

This guide provides step-by-step instructions for migrating from the legacy WISMO workflow to the refactored modular implementation.

## Pre-Deployment Checklist

- [ ] Review all code changes in the refactored workflow
- [ ] Ensure all dependencies are installed
- [ ] Verify TypeScript compilation succeeds
- [ ] Run existing tests (if any)
- [ ] Review the architecture in README.md
- [ ] Understand the feature flag mechanism

## Deployment Steps

### 1. Initial Deployment (Feature Flag OFF)

Deploy the code with the feature flag disabled to ensure legacy workflow continues to work:

```bash
# Environment variable (keep default: false or unset)
# USE_REFACTORED_WISMO_WORKFLOW=false

# Deploy the application
npm run build
npm run start:prod
```

**Expected Behavior:**
- All new WISMO workflows use the legacy implementation
- No changes to workflow behavior
- Refactored code is deployed but not active

### 2. Staging Testing (Feature Flag ON)

Enable the refactored workflow in staging environment:

```bash
# .env.staging
USE_REFACTORED_WISMO_WORKFLOW=true
```

**Test Cases:**

#### Test Case 1: Complete Happy Path
1. Send a WISMO email with clear order number
2. Verify workflow completes all phases:
   - ✓ Preparation (email marked read, confidence verified)
   - ✓ Order Discovery (order number extracted)
   - ✓ Order Processing (order fetched, acknowledgement sent)
   - ✓ Tracking (tracking monitored, delivery notification sent)
3. Check Temporal UI for proper phase hierarchy
4. Verify all customer emails sent correctly

#### Test Case 2: Order Not Found - Customer Reply
1. Send a WISMO email without order number
2. Verify follow-up email sent to customer
3. Send customer reply with order information
4. Verify workflow continues successfully

#### Test Case 3: Low Confidence Escalation
1. Send a WISMO email with low classification confidence (<70%)
2. Verify workflow escalates immediately at Action 2
3. Check escalation details in database

#### Test Case 4: Tracking Not Available - Retry Logic
1. Create a workflow with order that has no tracking
2. Verify workflow retries every 2 hours
3. Add tracking number to order
4. Verify workflow picks up tracking and continues

#### Test Case 5: Delivery Exception
1. Create a workflow with tracking
2. Simulate delivery exception status
3. Verify workflow escalates with proper details

### 3. Production Gradual Rollout

#### Phase 1: 10% Traffic (Day 1-2)

Enable for 10% of workflows using a percentage-based flag:

```typescript
// Modify email.workflow.ts temporarily for gradual rollout
const USE_REFACTORED_WISMO =
  process.env.USE_REFACTORED_WISMO_WORKFLOW === 'true' ||
  (Math.random() < 0.10 && process.env.ENABLE_GRADUAL_ROLLOUT === 'true');
```

```bash
# .env.production
USE_REFACTORED_WISMO_WORKFLOW=false
ENABLE_GRADUAL_ROLLOUT=true
```

**Monitoring:**
- Compare error rates: legacy vs refactored
- Check escalation rates
- Verify email delivery rates
- Monitor workflow execution times

**Metrics to Track:**
- Workflow completion rate
- Average execution time per phase
- Escalation count by type
- Customer satisfaction (if available)

**Rollback Trigger:**
- Error rate increase >5%
- Escalation rate increase >10%
- Customer complaints increase

#### Phase 2: 50% Traffic (Day 3-5)

If Phase 1 is successful, increase to 50%:

```typescript
const USE_REFACTORED_WISMO =
  process.env.USE_REFACTORED_WISMO_WORKFLOW === 'true' ||
  (Math.random() < 0.50 && process.env.ENABLE_GRADUAL_ROLLOUT === 'true');
```

**Continue monitoring same metrics**

#### Phase 3: 100% Traffic (Day 6-7)

If Phase 2 is successful, enable for all workflows:

```bash
# .env.production
USE_REFACTORED_WISMO_WORKFLOW=true
ENABLE_GRADUAL_ROLLOUT=false  # No longer needed
```

**Remove temporary gradual rollout code from email.workflow.ts**

### 4. Post-Migration Monitoring (Week 1)

Monitor the refactored workflow in production for one week:

**Daily Checks:**
- [ ] Check error logs for any new errors
- [ ] Review escalation dashboard
- [ ] Compare key metrics with legacy baseline
- [ ] Check Temporal UI for workflow health

**Weekly Review:**
- [ ] Analyze complete workflow execution patterns
- [ ] Review customer feedback
- [ ] Identify any edge cases not covered
- [ ] Plan improvements based on observations

### 5. Legacy Workflow Removal (After Week 1)

Once refactored workflow is stable for 1 week:

1. **Remove legacy workflow file:**
   ```bash
   rm src/modules/email-pipeline/temporal/workflows/wismo-legacy.workflow.ts
   ```

2. **Clean up email.workflow.ts:**
   ```typescript
   // Remove legacy import
   - import { handleWismo as handleWismoLegacy } from './wismo-legacy.workflow';

   // Remove feature flag
   - const USE_REFACTORED_WISMO = process.env.USE_REFACTORED_WISMO_WORKFLOW === 'true';

   // Simplify routing
   case 'wismo':
   -   if (USE_REFACTORED_WISMO) {
   -     wf.log.info('Using refactored WISMO workflow');
         return await handleWismoRefactored(workFlowInput);
   -   } else {
   -     wf.log.info('Using legacy WISMO workflow');
   -     return await handleWismoLegacy(workFlowInput);
   -   }
   ```

3. **Remove environment variable:**
   ```bash
   # .env.production
   - USE_REFACTORED_WISMO_WORKFLOW=true
   ```

4. **Update imports:**
   ```typescript
   // Rename import
   - import { handleWismo as handleWismoRefactored } from './agents/wismo/wismo-main.workflow';
   + import { handleWismo } from './agents/wismo/wismo-main.workflow';
   ```

5. **Deploy final cleanup**

## Rollback Procedures

### Immediate Rollback (During Deployment)

If critical issues are detected:

```bash
# Set environment variable
USE_REFACTORED_WISMO_WORKFLOW=false

# Restart application
npm run start:prod
```

**Result:** All new workflows immediately use legacy implementation

### Handling In-Flight Workflows

**Important:** Workflows already started will continue with their initial implementation (legacy or refactored). Only NEW workflows are affected by the feature flag.

**To handle in-flight refactored workflows during rollback:**
1. Let them complete naturally (recommended)
2. Or manually complete/cancel if critical issues exist

### Data Compatibility

The refactored workflow uses the same:
- WorkflowState structure
- Activity signatures
- Signal handlers
- Database schemas

**Result:** No data migration needed, rollback is seamless

## Verification Steps

After each deployment phase:

### 1. Code Verification
```bash
# Build succeeds
npm run build

# No TypeScript errors
npx tsc --noEmit

# Tests pass (if available)
npm test
```

### 2. Runtime Verification
```bash
# Check Temporal workflows
temporal workflow list

# Check recent workflow executions
temporal workflow show -w <workflow-id>

# Check workflow history
temporal workflow describe -w <workflow-id>
```

### 3. Database Verification
```sql
-- Check approval queue entries
SELECT * FROM approval_queue
WHERE agent_type = 'WISMO Agent'
ORDER BY created_at DESC
LIMIT 10;

-- Check action executions
SELECT * FROM approval_queue_actions
WHERE approval_queue_id IN (
  SELECT id FROM approval_queue
  WHERE agent_type = 'WISMO Agent'
)
ORDER BY created_at DESC
LIMIT 20;

-- Check escalations
SELECT * FROM escalations
WHERE workflow_id LIKE '%wismo%'
ORDER BY created_at DESC
LIMIT 10;
```

### 4. Email Verification
- Check Gmail sent folder for workflow emails
- Verify email threading is working
- Confirm email content is correct
- Check for any delivery failures

## Troubleshooting

### Issue: Workflow fails at phase transition

**Symptoms:**
- Workflow fails between phases
- Error: "Child workflow failed"

**Resolution:**
1. Check Temporal UI for child workflow error details
2. Review workflow state in database
3. Check activity logs for the failing phase
4. Consider adding retry logic if transient

### Issue: State not persisting between phases

**Symptoms:**
- Order number found in discovery but lost in processing
- Tracking data not available in final phase

**Resolution:**
1. Verify context.state is being mutated correctly
2. Check that context object is passed by reference
3. Review executeWorkflowAction pattern usage
4. Ensure state updates happen before returning

### Issue: Signal handlers not receiving responses

**Symptoms:**
- Workflows stuck waiting for human response
- Action approvals not being received

**Resolution:**
1. Verify signal handlers are in main workflow (not sub-workflows)
2. Check signal name matches: 'humanResponse'
3. Verify approvalItemId is being passed correctly
4. Check actionResponses map in workflow state

### Issue: Child workflow ID conflicts

**Symptoms:**
- Error: "Workflow execution already started"
- Duplicate child workflow IDs

**Resolution:**
1. Verify unique child workflow IDs using parent workflow ID:
   ```typescript
   workflowId: `${wfInfo.workflowId}-preparation`
   ```
2. Check for workflow ID collisions in Temporal UI
3. Ensure workflow IDs don't overlap between phases

## Monitoring Dashboard

### Key Metrics to Track

1. **Workflow Completion Rate**
   ```sql
   SELECT
     COUNT(*) as total,
     SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
     SUM(CASE WHEN status = 'escalated' THEN 1 ELSE 0 END) as escalated,
     SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
   FROM approval_queue
   WHERE agent_type = 'WISMO Agent'
   AND created_at > NOW() - INTERVAL '24 hours';
   ```

2. **Average Phase Execution Time**
   - Check Temporal UI for phase durations
   - Compare legacy vs refactored

3. **Escalation Rate by Type**
   ```sql
   SELECT
     escalation_type,
     COUNT(*) as count
   FROM escalations
   WHERE workflow_id LIKE '%wismo%'
   AND created_at > NOW() - INTERVAL '24 hours'
   GROUP BY escalation_type;
   ```

4. **Action Success Rate**
   ```sql
   SELECT
     action_type,
     COUNT(*) as total,
     SUM(CASE WHEN action_status = 'executed' THEN 1 ELSE 0 END) as succeeded
   FROM approval_queue_actions
   WHERE approval_queue_id IN (
     SELECT id FROM approval_queue WHERE agent_type = 'WISMO Agent'
   )
   AND created_at > NOW() - INTERVAL '24 hours'
   GROUP BY action_type;
   ```

## Support Contacts

- **Technical Issues:** Development Team
- **Temporal Issues:** DevOps Team
- **Business Logic Questions:** Product Team
- **Customer Impact:** Customer Support Team

## Additional Resources

- [README.md](README.md) - Architecture overview
- [Temporal Documentation](https://docs.temporal.io/)
- [Original Workflow](../wismo-legacy.workflow.ts) - Legacy implementation reference
