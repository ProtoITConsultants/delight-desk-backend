# Quick Start: Data Migration

## ⚠️ IMPORTANT: Read This First

**The import command ADDS data, it does NOT replace existing data!**

- Running import multiple times = DUPLICATE data
- Partial import failures require cleanup before re-running
- Always run dry-run first to preview changes

## TL;DR

```bash
# Step 1: Export local data
npm run migrate:export -- -s "$LOCAL_DB" -o ./data.json

# Step 2: Edit data.json - map local users to production users
# (Fill in productionUserId and productionUserEmail)

# Step 3: Preview (dry-run - safe)
npm run migrate:import -- -t "$PROD_DB" -i ./data.json

# Step 4: Execute (actually imports)
npm run migrate:import -- -t "$PROD_DB" -i ./data.json --no-dry-run

# Step 5: Cleanup
rm ./data.json
```

## Real Example

**Scenario:** Frontend dev needs your test escalations

```bash
# Your local DB
LOCAL="postgresql://user:pass@localhost:5432/delight_desk_local"

# Production DB
PROD="postgresql://user:pass@prod.example.com:5432/delight_desk_prod"

# 1. See who's in production
npm run migrate:list-prod-users -- -t "$PROD"
# Output: Frontend dev email is "sarah@company.com", ID is "abc-123..."

# 2. Export your test data
npm run migrate:export -- -s "$LOCAL" -o ./frontend-test-data.json

# 3. Edit frontend-test-data.json
# Change:
#   "productionUserId": null
#   "productionUserEmail": null
# To:
#   "productionUserId": "abc-123..."
#   "productionUserEmail": "sarah@company.com"

# 4. Test run (safe - doesn't change anything)
npm run migrate:import -- -t "$PROD" -i ./frontend-test-data.json
# Review output: "Would import 5 escalations, 10 approval queue items..."

# 5. Looks good? Do it for real
npm run migrate:import -- -t "$PROD" -i ./frontend-test-data.json --no-dry-run
# ✅ Done! Sarah can now see your test data in production

# 6. Clean up
rm ./frontend-test-data.json
```

## Connection String Formats

```bash
# Local
postgresql://username:password@localhost:5432/database_name

# Production (with SSL)
postgresql://username:password@prod-host.com:5432/database_name?sslmode=require

# From environment
export DATABASE_URL="postgresql://..."
npm run migrate:export -- -s "$DATABASE_URL" -o ./data.json
```

## What Gets Migrated?

✅ Email threads and messages
✅ Escalations (pending, resolved, all)
✅ Approval queue workflows
✅ Approval queue actions
✅ Activity logs
✅ All metadata and relationships

## Safety Features

🔒 **Dry-run by default** - Won't touch database unless you add `--no-dry-run`
🔒 **User validation** - Checks production users exist before importing
🔒 **New IDs** - Generates fresh IDs to avoid conflicts
🔒 **Referential integrity** - Maintains all relationships correctly

## Common Issues

### "Production user not found"
👉 Run `npm run migrate:list-prod-users` to see available users
👉 Copy the correct user ID to your mapping

### "Missing production user ID"
👉 You forgot to edit the JSON file
👉 Fill in `productionUserId` and `productionUserEmail`

### "Connection refused"
👉 Check your connection string
👉 Verify database host is accessible
👉 Check firewall/VRP settings

### "Invalid time value" or Import Failed Partially
👉 Some data was imported, some failed
👉 **You must clean up before re-running** (see Cleanup section below)
👉 The script has been fixed to handle invalid dates

### Running Import Multiple Times
❌ **This creates DUPLICATE data!**
👉 Import ADDS records, it doesn't replace them
👉 Clean up old data before re-importing

## Cleanup: Remove Imported Data

If import fails or you need to re-import, clean up first:

```sql
-- Connect to your production database
-- Replace 'PRODUCTION_USER_ID' with actual user ID from your mapping

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

**After cleanup**, re-run the import:
```bash
npm run migrate:import -- -t "$PROD_DB" -i ./data.json --no-dry-run
```

## Pro Tips

💡 **Test on staging first** - Always safer
💡 **Small batches** - Export specific users with `-u user-id-1 user-id-2`
💡 **Backup first** - Take DB backup before importing to production
💡 **Keep exports** - Save the JSON file as documentation
💡 **Use .env files** - Store connection strings securely

## Need More Help?

📖 Full guide: [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)
📄 Example data: [migration-data.example.json](./migration-data.example.json)
📂 Scripts overview: [README.md](./README.md)

---

**Ready?** Start with step 1! 🚀
