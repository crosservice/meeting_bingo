import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://meeting_bingo:changeme@localhost:5432/meeting_bingo';

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Create migrations tracking table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Read migration files
    const migrationsDir = path.resolve(__dirname, '..', 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No migration files found.');
      return;
    }

    // Get already applied migrations
    const { rows: applied } = await pool.query('SELECT name FROM _migrations ORDER BY id');
    const appliedSet = new Set(applied.map((r: { name: string }) => r.name));

    let count = 0;
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  SKIP  ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`  APPLY ${file}`);
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  FAIL  ${file}:`, (err as Error).message);
        process.exit(1);
      } finally {
        client.release();
      }
    }

    console.log(`\nDone. ${count} migration(s) applied, ${appliedSet.size} already applied.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
