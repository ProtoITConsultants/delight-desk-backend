/**
 * Flags users whose email local-part or full address matches risky defaults (root/admin/sa).
 *
 * Run from project root: `npm run security:audit-default-accounts` (same layout as EC2 ~/delight-desk).
 * DATABASE_URL must be set in the environment or in `.env` at the repository root (same source as Nest).
 */
const { Client } = require('pg');
const path = require('path');

// Load ../.env relative to this file so the script works when cwd is not the repo root.
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required (set in environment or .env at project root)');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    // First condition: rare exact string match; second: local-part (before @) equals root|admin|sa.
    const query = `
      SELECT id, email, role, created_at
      FROM users
      WHERE
        lower(email) IN ('root', 'admin', 'sa')
        OR lower(split_part(email, '@', 1)) IN ('root', 'admin', 'sa')
      ORDER BY created_at DESC
    `;

    const result = await client.query(query);
    if (result.rows.length === 0) {
      console.log('PASS: No default/shared accounts detected (root/admin/sa).');
      process.exitCode = 0;
      return;
    }

    console.log('FAIL: Potential default/shared accounts detected:');
    for (const row of result.rows) {
      console.log(
        JSON.stringify(
          {
            id: row.id,
            email: row.email,
            role: row.role,
            createdAt: row.created_at,
          },
          null,
          2,
        ),
      );
    }
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  // Connection errors, missing pg, etc.
  console.error('Default account audit failed:', error.message);
  process.exit(1);
});
