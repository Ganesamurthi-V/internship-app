/**
 * Deletes Supabase Auth accounts that no `public.users` row points at.
 *
 * Supabase Auth lives in `auth.users`, a different table from `public.users`, and nothing
 * cascades between them. Deleting an app user — or a registration that failed halfway —
 * leaves the auth account behind. Those leftovers cannot sign in, because every request
 * resolves the app user by `authId`, so they are not a security hole. They do hold their
 * email hostage: `createUser` rejects a duplicate, which is why `student-register` has to
 * reclaim orphans before it can retry.
 *
 * WHY THE AGE GUARD MATTERS
 *
 * `student-register` creates the auth account first and the app rows immediately after. A
 * registration caught between those two writes looks exactly like an orphan. Deleting it
 * would break a signup that was seconds from finishing, so anything newer than
 * `--min-age-hours` is left alone — the same reasoning `cleanup-orphan-storage.ts` applies
 * to pre-registration uploads.
 *
 * Read-only by default.
 *
 *   npx tsx --env-file=.env prisma/cleanup-orphan-auth-users.ts
 *   npx tsx --env-file=.env prisma/cleanup-orphan-auth-users.ts --delete
 *   npx tsx --env-file=.env prisma/cleanup-orphan-auth-users.ts --delete --min-age-hours=0
 */

import { PrismaClient } from '@prisma/client';
import { createClient, type User as AuthUser } from '@supabase/supabase-js';

const prisma = new PrismaClient();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const DELETE = process.argv.includes('--delete');
const PER_PAGE = 200;

function parseMinAgeHours(): number {
  const arg = process.argv.find((value) => value.startsWith('--min-age-hours='));
  if (!arg) return 24;
  const parsed = Number(arg.split('=')[1]);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`--min-age-hours must be a non-negative number, got "${arg.split('=')[1]}"`);
  }
  return parsed;
}

const MIN_AGE_HOURS = parseMinAgeHours();

/** Paginated: `listUsers` caps a page, and a sweep that silently stops is worse than none. */
async function fetchAllAuthUsers(): Promise<AuthUser[]> {
  const all: AuthUser[] = [];

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error(`listUsers(page ${page}) failed: ${error.message}`);

    const users = data?.users ?? [];
    all.push(...users);
    if (users.length < PER_PAGE) break;
  }

  return all;
}

function hoursSince(iso: string | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const created = new Date(iso).getTime();
  if (Number.isNaN(created)) return Number.POSITIVE_INFINITY;
  return (Date.now() - created) / (1000 * 60 * 60);
}

async function main(): Promise<void> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. Pass --env-file=.env');
  }

  console.log(DELETE ? 'Mode: DELETE (destructive)' : 'Mode: dry run (no changes; pass --delete)');
  console.log(`Minimum age    : ${MIN_AGE_HOURS}h`);
  console.log('');

  const dbAuthIds = new Set((await prisma.user.findMany({ select: { authId: true } })).map((u) => u.authId));
  const authUsers = await fetchAllAuthUsers();

  console.log(`auth accounts  : ${authUsers.length}`);
  console.log(`database users : ${dbAuthIds.size}`);
  console.log('');

  const orphans = authUsers.filter((user) => !dbAuthIds.has(user.id));
  const tooNew = orphans.filter((user) => hoursSince(user.created_at) < MIN_AGE_HOURS);
  const removable = orphans.filter((user) => hoursSince(user.created_at) >= MIN_AGE_HOURS);

  if (orphans.length === 0) {
    console.log('No orphaned auth accounts. Nothing to do.');
    return;
  }

  let deleted = 0;
  let failed = 0;

  for (const user of removable) {
    const age = Math.round(hoursSince(user.created_at));
    const label = `${user.email ?? '(no email)'} (${age}h old)`;

    if (!DELETE) {
      console.log(`  would delete   ${label}`);
      continue;
    }

    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) {
      failed += 1;
      console.error(`  FAILED         ${label}: ${error.message}`);
    } else {
      deleted += 1;
      console.log(`  deleted        ${label}`);
    }
  }

  for (const user of tooNew) {
    const age = Math.round(hoursSince(user.created_at) * 10) / 10;
    console.log(`  skipped        ${user.email ?? user.id} (${age}h old, under ${MIN_AGE_HOURS}h — may be mid-registration)`);
  }

  console.log('');
  console.log('--- summary ---');
  console.log(`orphans found          : ${orphans.length}`);
  console.log(DELETE ? `deleted                : ${deleted}` : `would delete           : ${removable.length}`);
  if (tooNew.length > 0) console.log(`skipped as too new     : ${tooNew.length}`);
  if (failed > 0) console.log(`failed                 : ${failed}`);

  if (!DELETE && removable.length > 0) {
    console.log('');
    console.log('Re-run with --delete to remove these. This cannot be undone.');
  }

  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
