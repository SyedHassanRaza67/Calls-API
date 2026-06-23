#!/usr/bin/env node
// =============================================================================
// migrate.mjs — idempotent SQL migration runner (pure ESM, only dep: `pg`).
// =============================================================================
// Runs every *.sql file in this directory in sorted (lexicographic) order.
// Each file runs inside its own transaction. Applied files are recorded in a
// `_migrations` table so re-runs skip what's already done — safe to run on
// every deploy.
//
// Ordering note: files run in plain string sort order, which gives
//   001_extensions.sql, 002_schema.sql, 003_functions.sql, 004_views.sql, seed.sql
// (digits sort before letters, so seed.sql runs last — after the schema exists).
//
// Usage:
//   DATABASE_URL=postgres://user:pass@host:5432/db node db/migrate.mjs
//
// Requires the `pg` package (installed in the backend, or `npm i pg` here).
// =============================================================================

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required.');
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    // Bookkeeping table — created outside the per-file transactions.
    await client.query(`
      create table if not exists public._migrations (
        filename   text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const all = await readdir(__dirname);
    const sqlFiles = all.filter((f) => f.endsWith('.sql')).sort();

    if (sqlFiles.length === 0) {
      console.log('No .sql files found next to migrate.mjs — nothing to do.');
      return;
    }

    const { rows } = await client.query('select filename from public._migrations');
    const applied = new Set(rows.map((r) => r.filename));

    let ran = 0;
    for (const filename of sqlFiles) {
      if (applied.has(filename)) {
        console.log(`skip   ${filename} (already applied)`);
        continue;
      }

      const sql = await readFile(join(__dirname, filename), 'utf8');
      process.stdout.write(`apply  ${filename} ... `);

      try {
        await client.query('begin');
        await client.query(sql);
        await client.query(
          'insert into public._migrations (filename) values ($1)',
          [filename],
        );
        await client.query('commit');
        console.log('ok');
        ran++;
      } catch (err) {
        await client.query('rollback');
        console.log('FAILED');
        console.error(`\nError applying ${filename}:\n${err.message}\n`);
        throw err;
      }
    }

    console.log(`\nDone. ${ran} migration(s) applied, ${sqlFiles.length - ran} skipped.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
