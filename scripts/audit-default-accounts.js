/**
 * Offline check: flags users whose email local-part or full address matches risky defaults
 * (root/admin/sa). Run with DATABASE_URL for periodic or pre-release audits.
 */
const { Client } = require('pg');

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
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
  console.error('Default account audit failed:', error.message);
  process.exit(1);
});
