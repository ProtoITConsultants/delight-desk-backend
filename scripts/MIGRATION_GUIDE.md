# AI Assistant Data Migration Guide

This guide helps you migrate AI assistant data (escalations, approval queues, emails) from local to production with proper user context mapping.

## ⚠️ Critical Information

**IMPORTANT: The import command ADDS data to the database!**

- ❌ It does NOT replace or update existing records
- ❌ Running import multiple times will create DUPLICATE data
- ✅ Always run dry-run first
- ✅ Clean up partial imports before re-running
- ✅ Verify data after import

## Overview

The migration script handles:
- ✅ User ID mapping (local → production)
- ✅ Email threads and messages
- ✅ Escalations
- ✅ Approval queue items and actions
- ✅ Activity logs
- ✅ Referential integrity maintenance
- ✅ Dry-run mode for safety
- ✅ Invalid date handling

## Prerequisites

1. Access to both local and production databases
2. Connection strings for both databases
3. Knowledge of which production users should receive the migrated data

## Step-by-Step Process

### Step 1: List Production Users (Optional)

First, see which users exist in production:

```bash
npm run migrate:list-prod-users -- \
  -t "postgresql://user:pass@prod-host:5432/dbname"
```

This outputs all production users with their IDs and emails.

### Step 2: Export Data from Local Database

Export the data you want to migrate:

```bash
# Export all users
npm run migrate:export -- \
  -s "postgresql://user:pass@localhost:5432/local_db" \
  -o ./migration-data.json

# OR export specific users only
npm run migrate:export -- \
  -s "postgresql://user:pass@localhost:5432/local_db" \
  -o ./migration-data.json \
  -u "user-id-1" "user-id-2"
```

**Output:** Creates `migration-data.json` with all exported data.

### Step 3: Map Users

Open `migration-data.json` and find the `userMapping` section:

```json
{
  "userMapping": [
    {
      "localUserId": "123e4567-e89b-12d3-a456-426614174000",
      "localUserEmail": "test@local.com",
      "productionUserId": null,  // ← Fill this
      "productionUserEmail": null // ← Fill this
    }
  ]
}
```

**Update it with production user info:**

```json
{
  "userMapping": [
    {
      "localUserId": "123e4567-e89b-12d3-a456-426614174000",
      "localUserEmail": "test@local.com",
      "productionUserId": "987e6543-e21b-45d3-a654-426614174999",
      "productionUserEmail": "frontend-dev@production.com"
    }
  ]
}
```

### Step 4: Dry Run (Preview)

Test the migration without actually importing:

```bash
npm run migrate:import -- \
  -t "postgresql://user:pass@prod-host:5432/prod_db" \
  -i ./migration-data.json
```

This validates:
- All production users exist
- User mapping is complete
- Shows what will be imported

**Review the output carefully!**

### Step 5: Execute Migration

Once dry-run looks good, perform the actual import:

```bash
npm run migrate:import -- \
  -t "postgresql://user:pass@prod-host:5432/prod_db" \
  -i ./migration-data.json \
  --no-dry-run
```

⚠️ **This will modify the production database!**

### Step 6: Verify

Check production database to ensure data was imported correctly:

```sql
-- Check escalations for the user
SELECT * FROM escalations WHERE user_id = 'production-user-id';

-- Check approval queue
SELECT * FROM approval_queue WHERE user_id = 'production-user-id';

-- Check email threads
SELECT * FROM email_threads WHERE user_id = 'production-user-id';
```

## Using Environment Variables

For convenience, you can use `.env` files:

```bash
# .env.local
DATABASE_URL=postgresql://user:pass@localhost:5432/local_db

# .env.production
DATABASE_URL=postgresql://user:pass@prod-host:5432/prod_db
```

Then use:

```bash
# Export
source .env.local
npm run migrate:export -- -s "$DATABASE_URL" -o ./migration-data.json

# Import
source .env.production
npm run migrate:import -- -t "$DATABASE_URL" -i ./migration-data.json
```

## Common Scenarios

### Scenario 1: Single Frontend Developer Needs Test Data

```bash
# 1. Export your local test data
npm run migrate:export -- \
  -s "postgresql://localhost:5432/local_db" \
  -o ./frontend-test-data.json \
  -u "your-local-user-id"

# 2. Map to frontend dev's production account
# Edit frontend-test-data.json:
# productionUserId: "frontend-dev-prod-id"
# productionUserEmail: "dev@company.com"

# 3. Dry run
npm run migrate:import -- \
  -t "postgresql://prod-db/..." \
  -i ./frontend-test-data.json

# 4. Import
npm run migrate:import -- \
  -t "postgresql://prod-db/..." \
  -i ./frontend-test-data.json \
  --no-dry-run
```

### Scenario 2: Multiple Users Need Data

```bash
# Export multiple users
npm run migrate:export -- \
  -s "postgresql://localhost:5432/local_db" \
  -o ./multi-user-data.json \
  -u "user-1-id" "user-2-id" "user-3-id"

# Map each to different production users
# In JSON:
# user-1 → prod-user-A
# user-2 → prod-user-B
# user-3 → prod-user-C
```

### Scenario 3: Staging Environment First

Test on staging before production:

```bash
# Test on staging first
npm run migrate:import -- \
  -t "postgresql://staging-db/..." \
  -i ./migration-data.json \
  --no-dry-run

# If successful, repeat for production
npm run migrate:import -- \
  -t "postgresql://production-db/..." \
  -i ./migration-data.json \
  --no-dry-run
```

## Data Included

The migration includes:

### Email Threads
- Thread metadata
- Subject lines
- Workflow associations

### Emails
- Full email content
- Sender/receiver info
- Internal dates
- Direction (incoming/outgoing)

### Escalations
- Escalation reasons
- Status and priority
- AI suggested responses
- Resolution tracking

### Approval Queue
- Workflow items
- Agent types (WISMO, order cancellation, etc.)
- Customer context
- AI classifications
- Planned steps

### Approval Queue Actions
- Individual workflow steps
- Action metadata
- Approval/rejection tracking
- Execution results

### Activity Logs
- Full audit trail
- User actions
- System events

## Safety Features

1. **Dry Run Default**: Always runs in preview mode unless `--no-dry-run` is specified
2. **User Validation**: Verifies all production users exist before importing
3. **Referential Integrity**: Maintains all foreign key relationships
4. **ID Regeneration**: Creates new IDs to avoid conflicts
5. **Error Reporting**: Detailed error messages for troubleshooting

## Troubleshooting

### Error: "Production user not found"

**Problem:** The production user ID in your mapping doesn't exist.

**Solution:**
1. Run `npm run migrate:list-prod-users` to see available users
2. Update your mapping with correct production user IDs

### Error: "Missing production user ID"

**Problem:** You didn't fill in the `productionUserId` in the mapping.

**Solution:** Edit `migration-data.json` and add production user IDs.

### Error: "Connection refused"

**Problem:** Can't connect to database.

**Solution:**
- Check connection string format
- Verify database host/port
- Check firewall rules
- Ensure SSL settings if required

### Error: "Invalid time value" or "RangeError"

**Problem:** Import failed partially due to invalid date values.

**Solution:**
1. The script has been updated to handle invalid dates
2. Clean up partial import (see Cleanup Procedure below)
3. Re-run the import

### Some Records Skipped

**Problem:** Not all records were imported.

**Solution:**
- Check the error messages in the output
- Verify all user mappings are complete
- Ensure production users have proper permissions

### Import Failed Partially

**Problem:** Some tables imported, but process failed midway.

**What happened:**
- Data was partially imported to production
- Database is in inconsistent state
- Re-running will create duplicates

**Solution:**
1. Clean up the partial import (see Cleanup Procedure below)
2. Re-run the import command

### Duplicate Data After Re-import

**Problem:** Ran import multiple times and now have duplicate escalations/emails.

**Why this happens:**
- Import command ADDS records, doesn't replace them
- Each run creates new records with new IDs

**Solution:**
1. Identify duplicate data
2. Run cleanup SQL (see Cleanup Procedure below)
3. Re-import once

## Cleanup Procedure

If you need to remove imported data (partial import, duplicates, or starting over):

### Step 1: Identify Production User ID

From your `migration-data.json`, find the `productionUserId`:
```json
"userMapping": [
  {
    "productionUserId": "abc-123-prod-id",  ← This one
    "productionUserEmail": "user@company.com"
  }
]
```

### Step 2: Run Cleanup SQL

Connect to your production database and run:

```sql
-- Replace 'PRODUCTION_USER_ID' with actual user ID

-- Delete in order (foreign key constraints)
DELETE FROM approval_queue_activity_log
WHERE approval_queue_id IN (
  SELECT id FROM approval_queue WHERE user_id = 'PRODUCTION_USER_ID'
);

DELETE FROM approval_queue_actions
WHERE approval_queue_id IN (
  SELECT id FROM approval_queue WHERE user_id = 'PRODUCTION_USER_ID'
);

DELETE FROM approval_queue WHERE user_id = 'PRODUCTION_USER_ID';
DELETE FROM escalations WHERE user_id = 'PRODUCTION_USER_ID';
DELETE FROM emails WHERE user_id = 'PRODUCTION_USER_ID';
DELETE FROM email_threads WHERE user_id = 'PRODUCTION_USER_ID';
```

### Step 3: Verify Cleanup

```sql
-- Should return 0 for all
SELECT COUNT(*) FROM email_threads WHERE user_id = 'PRODUCTION_USER_ID';
SELECT COUNT(*) FROM emails WHERE user_id = 'PRODUCTION_USER_ID';
SELECT COUNT(*) FROM escalations WHERE user_id = 'PRODUCTION_USER_ID';
SELECT COUNT(*) FROM approval_queue WHERE user_id = 'PRODUCTION_USER_ID';
```

### Step 4: Re-run Import

```bash
npm run migrate:import -- \
  -t "$PROD_DB" \
  -i ./data.json \
  --no-dry-run
```

## Best Practices

1. **Always dry-run first** - Never skip the preview step
2. **Test on staging** - Use a staging environment before production
3. **Backup first** - Take a database backup before importing
4. **Small batches** - For large datasets, migrate in smaller chunks
5. **Verify after** - Always check the data after migration
6. **Keep export files** - Save them as backup/documentation

## Security Notes

⚠️ **Important Security Considerations:**

1. **Never commit migration data files** - They contain sensitive data
2. **Use environment variables** - Don't hardcode credentials
3. **Secure connection strings** - Use SSL for database connections
4. **Limit access** - Only run migrations from secure, authorized machines
5. **Delete export files** - After successful migration, securely delete export files

## Support

If you encounter issues:

1. Check the migration output for specific error messages
2. Verify your database connection strings
3. Ensure you have necessary database permissions
4. Review the exported JSON file structure
5. Check database logs for constraint violations

## Example Complete Workflow

```bash
# 1. List production users to find target user
npm run migrate:list-prod-users -- -t "$PROD_DB_URL"

# Output shows: user-id-999, email: dev@company.com

# 2. Export local data
npm run migrate:export -- \
  -s "$LOCAL_DB_URL" \
  -o ./migration.json

# 3. Edit migration.json
# Set productionUserId: "user-id-999"
# Set productionUserEmail: "dev@company.com"

# 4. Dry run to preview
npm run migrate:import -- \
  -t "$PROD_DB_URL" \
  -i ./migration.json

# Output shows: 5 escalations, 20 approval queue items, 50 emails ready to import

# 5. Execute migration
npm run migrate:import -- \
  -t "$PROD_DB_URL" \
  -i ./migration.json \
  --no-dry-run

# Output shows: ✅ Successfully imported all data

# 6. Verify in production
# Frontend developer can now see all test data in their account

# 7. Clean up
rm ./migration.json
```

---

**Ready to migrate? Start with Step 1!** 🚀
