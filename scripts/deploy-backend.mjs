#!/usr/bin/env node
// Deploys the Supabase backend over the HTTPS Management API only (works from
// CI or a sandbox with no direct Postgres access).
//
//   SUPABASE_ACCESS_TOKEN=...  node scripts/deploy-backend.mjs [--dry-run] [--from <version>] [--skip-functions]
//
// 1. Reads supabase_migrations.schema_migrations to see what production has.
// 2. Applies each missing migration in filename order, recording it the same
//    way `supabase db push` does — so the CLI stays in sync afterwards.
// 3. Deploys every Edge Function (`supabase functions deploy --use-api`).
//
// Safety: if production has NO migration history (e.g. SQL was pasted into the
// dashboard), it refuses to guess and asks for --from <first version to apply>.
import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const REF = process.env.SUPABASE_PROJECT_REF || 'spwijxqlzzqvlopsojrx';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipFunctions = args.includes('--skip-functions');
const fromIdx = args.indexOf('--from');
const from = fromIdx >= 0 ? args[fromIdx + 1] : null;

if (!TOKEN) {
    console.error('Set SUPABASE_ACCESS_TOKEN (a personal access token from supabase.com/dashboard/account/tokens).');
    process.exit(1);
}

async function sql(query) {
    const res = await fetch(`${process.env.SUPABASE_API_URL || 'https://api.supabase.com'}/v1/projects/${REF}/database/query`, {
        method: 'POST',
        headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`SQL failed (${res.status}): ${text}`);
    return text ? JSON.parse(text) : [];
}

const dir = 'supabase/migrations';
const local = readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();

let applied = new Set();
try {
    const rows = await sql('select version from supabase_migrations.schema_migrations');
    applied = new Set(rows.map((r) => String(r.version)));
} catch (e) {
    // Only a missing history table means "no history"; anything else (bad
    // token, wrong project, network) must stop the deploy.
    if (!/schema_migrations|does not exist/i.test(String(e.message))) {
        console.error(String(e.message));
        process.exit(1);
    }
    console.warn('No supabase_migrations.schema_migrations table in production.');
}

if (applied.size === 0 && !from) {
    console.error('Production has no recorded migration history, so it is unclear which migrations were already applied.\n' +
        'Re-run with --from <version> (e.g. --from 20261005000100) to apply that migration and everything after it.');
    process.exit(1);
}

const pending = local.filter((f) => {
    const version = f.split('_')[0];
    return from ? version >= from && !applied.has(version) : !applied.has(version);
});

console.log(`Project ${REF}: ${applied.size} migrations recorded, ${pending.length} to apply.`);
for (const f of pending) console.log(`  - ${f}`);
if (dryRun) process.exit(0);

if (pending.length) {
    await sql(`create schema if not exists supabase_migrations;
      create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)`);
}
for (const f of pending) {
    const [version, ...rest] = f.replace(/\.sql$/, '').split('_');
    const body = readFileSync(join(dir, f), 'utf8');
    process.stdout.write(`Applying ${f} … `);
    // One transaction per migration: a failure leaves nothing half-applied.
    await sql(`begin;\n${body}\n;\ninsert into supabase_migrations.schema_migrations (version, name, statements)
      values ('${version}', '${rest.join('_').replace(/'/g, "''")}', array[]::text[]);\ncommit;`);
    console.log('ok');
}

if (!skipFunctions) {
    const fnDir = 'supabase/functions';
    const fns = readdirSync(fnDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
        .map((d) => d.name);
    for (const fn of fns) {
        console.log(`Deploying function ${fn} …`);
        // verify_jwt per function comes from supabase/config.toml.
        execFileSync('npx', ['-y', 'supabase@latest', 'functions', 'deploy', fn, '--project-ref', REF, '--use-api'], {
            stdio: 'inherit',
            env: { ...process.env, SUPABASE_ACCESS_TOKEN: TOKEN },
        });
    }
}
console.log('Done.');
