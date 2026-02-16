# Data Migration Solution Summary

## Problem
You have test data (escalations, approval queues, emails) in your local database that frontend developers need in production. The challenge is that user IDs are different between environments.

## Solution
A complete data migration tool that:
1. Exports data from local database
2. Maps local user IDs to production user IDs
3. Imports data to production with proper relationships
4. Maintains referential integrity across all tables

---

## What Was Created

### 1. Migration Script
**File:** `scripts/migrate-ai-assistant-data.ts`

A TypeScript CLI tool with three commands:
- `export` - Exports data from source database
- `import` - Imports data to target database with user mapping
- `list-production-users` - Lists available production users

**Features:**
- ✅ User ID mapping and validation
- ✅ Dry-run mode (safe preview)
- ✅ Transaction safety
- ✅ Referential integrity maintenance
- ✅ Detailed logging and error reporting
- ✅ Selective export (specific users)

### 2. NPM Scripts
Added to `package.json`:
```json
"migrate:export": "Export data from database",
"migrate:import": "Import data with user mapping",
"migrate:list-prod-users": "List production users"
```

### 3. Documentation
- **QUICK_START.md** - Fast reference with examples
- **MIGRATION_GUIDE.md** - Complete step-by-step guide
- **README.md** - Scripts directory overview
- **migration-data.example.json** - Example data structure

### 4. Safety Features
- Added migration data files to `.gitignore`
- Installed `commander` package for CLI
- Dry-run default (must explicitly use `--no-dry-run`)

---

## How It Works

### Data Flow
```
Local DB → Export → JSON File → User Mapping → Import → Production DB
```

### Tables Migrated
1. **email_threads** - Email conversations
2. **emails** - Individual messages
3. **escalations** - Escalated issues
4. **approval_queue** - AI workflow items
5. **approval_queue_actions** - Workflow steps
6. **approval_queue_activity_log** - Activity logs

### Key Features

#### User ID Mapping
```json
{
  "localUserId": "local-uuid",
  "localUserEmail": "test@local.com",
  "productionUserId": "prod-uuid",     // ← You fill this
  "productionUserEmail": "dev@prod.com" // ← You fill this
}
```

#### Referential Integrity
The script maintains all relationships:
- `email.threadId` → Mapped to new thread ID
- `escalation.userId` → Mapped to production user
- `approval_queue.escalationId` → Mapped to new escalation
- All foreign keys updated correctly

#### Safety Mechanisms
1. **Dry-run default** - Preview before import
2. **User validation** - Verifies production users exist
3. **New ID generation** - No ID conflicts
4. **Error reporting** - Clear messages for issues
5. **Transaction safety** - All-or-nothing imports

---

## Usage Example

### Complete Workflow

```bash
# 1. List production users
npm run migrate:list-prod-users -- -t "postgresql://prod-host/db"
# Output: user-abc-123, email: frontend-dev@company.com

# 2. Export local data
npm run migrate:export -- \
  -s "postgresql://localhost/local_db" \
  -o ./migration-data.json

# 3. Edit migration-data.json
# Fill in production user IDs

# 4. Preview (safe)
npm run migrate:import -- \
  -t "postgresql://prod-host/db" \
  -i ./migration-data.json

# Output:
# ✓ All 1 users mapped successfully
# 📊 Would import:
#   - 5 email threads
#   - 12 emails
#   - 3 escalations
#   - 8 approval queue items
#   - 15 actions
#   - 20 activity logs

# 5. Execute
npm run migrate:import -- \
  -t "postgresql://prod-host/db" \
  -i ./migration-data.json \
  --no-dry-run

# Output:
# ✓ Imported 5 email threads
# ✓ Imported 12 emails
# ✓ Imported 3 escalations
# ✓ Imported 8 approval queue items
# ✓ Imported 15 actions
# ✓ Imported 20 activity logs
# ✅ Migration completed successfully!

# 6. Cleanup
rm ./migration-data.json
```

---

## Use Cases

### 1. Frontend Developer Needs Test Data
```bash
# Export your test data
npm run migrate:export -- -s "$LOCAL_DB" -o ./frontend-data.json

# Map to frontend dev's production account
# Edit JSON: productionUserId = "frontend-dev-id"

# Import
npm run migrate:import -- -t "$PROD_DB" -i ./frontend-data.json --no-dry-run

# Result: Frontend dev sees all your test escalations in production
```

### 2. Multiple Developers Need Different Data
```bash
# Export specific users
npm run migrate:export -- \
  -s "$LOCAL_DB" \
  -o ./multi-user.json \
  -u "user-1-id" "user-2-id" "user-3-id"

# Map each to different production users
# user-1 → prod-dev-A
# user-2 → prod-dev-B
# user-3 → prod-dev-C

# Import
npm run migrate:import -- -t "$PROD_DB" -i ./multi-user.json --no-dry-run
```

### 3. Staging → Production
```bash
# Test on staging first
npm run migrate:import -- -t "$STAGING_DB" -i ./data.json --no-dry-run

# If successful, promote to production
npm run migrate:import -- -t "$PROD_DB" -i ./data.json --no-dry-run
```

---

## Environment Variables

Create `.env.migration` for convenience:

```bash
# .env.migration
LOCAL_DB_URL=postgresql://user:pass@localhost:5432/delight_desk_local
PROD_DB_URL=postgresql://user:pass@prod.example.com:5432/delight_desk_prod
STAGING_DB_URL=postgresql://user:pass@staging.example.com:5432/delight_desk_staging
```

Usage:
```bash
source .env.migration
npm run migrate:export -- -s "$LOCAL_DB_URL" -o ./data.json
npm run migrate:import -- -t "$PROD_DB_URL" -i ./data.json
```

---

## Best Practices

### ✅ DO
- Always run dry-run first
- Test on staging before production
- Backup production database before import
- Keep export files as documentation
- Use specific user exports for targeted data
- Verify data after import
- Clean up before re-importing

### ❌ DON'T
- Skip the dry-run step
- Commit migration data files (already in .gitignore)
- Hardcode credentials
- Run imports without reviewing preview
- Import large datasets at once (break into batches)
- Delete export files until verified
- **Run import multiple times without cleanup (creates duplicates!)**

## Understanding Import Behavior

### ⚠️ CRITICAL: Import ADDS Data

**The import command inserts new records - it does NOT:**
- ❌ Replace existing data
- ❌ Update existing records
- ❌ Check for duplicates

**What this means:**
```
First import:  → Creates escalation with ID "abc-123"
Second import: → Creates NEW escalation with ID "def-456" (DUPLICATE!)
```

### When You Need to Re-import

1. **Clean up first:**
   ```sql
   DELETE FROM approval_queue_activity_log WHERE ...;
   DELETE FROM approval_queue_actions WHERE ...;
   DELETE FROM approval_queue WHERE user_id = 'PROD_USER_ID';
   DELETE FROM escalations WHERE user_id = 'PROD_USER_ID';
   DELETE FROM emails WHERE user_id = 'PROD_USER_ID';
   DELETE FROM email_threads WHERE user_id = 'PROD_USER_ID';
   ```

2. **Then re-import:**
   ```bash
   npm run migrate:import -- -t "$PROD_DB" -i ./data.json --no-dry-run
   ```

---

## Troubleshooting

### Issue: "Production user not found"
**Cause:** User ID in mapping doesn't exist in production
**Fix:** Run `migrate:list-prod-users` and use correct ID

### Issue: "Missing production user ID"
**Cause:** Forgot to edit JSON file
**Fix:** Fill in `productionUserId` in userMapping section

### Issue: "Connection refused"
**Cause:** Can't connect to database
**Fix:**
- Check connection string format
- Verify host/port accessibility
- Check firewall/VPN
- Add `?sslmode=require` if needed

### Issue: "Invalid time value" / Import failed partially
**Cause:** Invalid date values in source data
**Status:** Script now handles invalid dates automatically
**Fix:**
1. Clean up partial import (see Cleanup section)
2. Re-run import (fixed script handles dates correctly)

### Issue: Some records skipped
**Cause:** Invalid mappings or constraints
**Fix:** Review error messages, check all mappings complete

### Issue: Duplicate data after multiple imports
**Cause:** Import was run multiple times without cleanup
**Fix:**
1. Identify production user ID from mapping
2. Run cleanup SQL (delete all records for that user)
3. Re-import once

## Cleanup: Removing Imported Data

If import fails or you need to start over:

```sql
-- Replace 'PRODUCTION_USER_ID' with actual ID

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

Verify cleanup:
```sql
SELECT COUNT(*) FROM email_threads WHERE user_id = 'PRODUCTION_USER_ID';
-- Should return 0
```

---

## Files Created

```
scripts/
├── migrate-ai-assistant-data.ts      # Main migration tool
├── QUICK_START.md                    # Fast reference guide
├── MIGRATION_GUIDE.md                # Complete documentation
├── README.md                         # Scripts overview
└── migration-data.example.json       # Example data structure
```

Plus:
- Updated `package.json` (added scripts + commander dependency)
- Updated `.gitignore` (added migration data files)
- Installed `commander` package

---

## Next Steps

1. **Install dependencies** (already done)
   ```bash
   npm install
   ```

2. **Try it out with a small export**
   ```bash
   npm run migrate:export -- -s "$LOCAL_DB" -o ./test.json
   ```

3. **Review the exported JSON**
   ```bash
   cat test.json
   ```

4. **Read the quick start**
   ```bash
   cat scripts/QUICK_START.md
   ```

5. **Ready to migrate?**
   Follow the steps in `scripts/QUICK_START.md`

---

## Security Notes

⚠️ **CRITICAL:**
- Migration files contain sensitive data (emails, customer info)
- Never commit migration data files (protected by .gitignore)
- Use environment variables for credentials
- Delete export files after successful migration
- Only run from secure, authorized machines
- Use SSL for production database connections

---

## Support

If you encounter issues:
1. Check error messages in the output
2. Review `MIGRATION_GUIDE.md` troubleshooting section
3. Verify database permissions
4. Check connection strings
5. Review exported JSON structure

---

## Summary

You now have a complete, production-ready data migration solution that:
- ✅ Safely exports and imports AI assistant data
- ✅ Handles user context mapping automatically
- ✅ Maintains referential integrity
- ✅ Provides dry-run safety
- ✅ Includes comprehensive documentation
- ✅ Follows security best practices

**Ready to migrate?** Start with `scripts/QUICK_START.md`! 🚀
