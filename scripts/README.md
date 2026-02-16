# Scripts Directory

This directory contains utility scripts for managing the application.

## Available Scripts

### Data Migration Tool

**File:** `migrate-ai-assistant-data.ts`

Migrates AI assistant data (escalations, approval queues, emails) between environments with proper user mapping.

**Use Cases:**
- Transfer test data from local to production
- Provide frontend developers with realistic test data
- Clone data between environments

**Quick Start:**

```bash
# 1. Export from local
npm run migrate:export -- \
  -s "postgresql://localhost/local_db" \
  -o ./migration-data.json

# 2. Edit migration-data.json to map users

# 3. Preview import (dry-run)
npm run migrate:import -- \
  -t "postgresql://production/prod_db" \
  -i ./migration-data.json

# 4. Execute import
npm run migrate:import -- \
  -t "postgresql://production/prod_db" \
  -i ./migration-data.json \
  --no-dry-run
```

**Documentation:** See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for complete instructions.

**Example Data:** See [migration-data.example.json](./migration-data.example.json) for structure reference.

---

### Other Scripts

Add documentation for additional scripts here as they are created.

## Security Notes

⚠️ **IMPORTANT:**

1. **Never commit migration data files** - Add `migration-*.json` to `.gitignore`
2. **Protect database credentials** - Use environment variables
3. **Secure production access** - Only run from authorized machines
4. **Delete after use** - Remove export files after successful migration

## Need Help?

- Check the specific script's documentation
- Review error messages carefully
- Verify database permissions
- Ensure correct connection strings
