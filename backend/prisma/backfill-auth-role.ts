/**
 * Backfills `app_metadata.role` onto existing Supabase Auth accounts.
 *
 * WHY THIS EXISTS
 *
 * The mobile app needs a role when `/auth/me` cannot be reached, so it can decide which
 * area to open. It used to read that from `user_metadata`, which the account holder can
 * rewrite with nothing but the anon key:
 *
 *     supabase.auth.updateUser({ data: { role: 'admin' } })
 *
 * so the app was taking someone's word for who they were. It now reads `app_metadata`,
 * which only the service role can write, and falls back to the least privilege it can when
 * the claim is absent. Accounts created before that change have no `app_metadata.role`, so
 * they get the student area offline until a successful `/auth/me` corrects it. This closes
 * that gap.
 *
 * `public.users.role` is the authoritative source — never `user_metadata`, which is exactly
 * the field being distrusted. An auth account whose stored role disagrees with the database
 * is reported and overwritten with the database's answer.
 *
 * Read-only by default.
 *
 *   npx tsx --env-file=.env prisma/backfill-auth-role.ts
 *   npx tsx --env-file=.env prisma/backfill-auth-role.ts --apply
 */

import { PrismaClient } from '@prisma/client';
import { createClient, type User as AuthUser } from '@supabase/supabase-js';

const prisma = new PrismaClient();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const APPLY = process.argv.includes('--apply');
const PER_PAGE = 200;

/**
 * Every auth account, keyed by id.
 *
 * Paginated deliberately. `listUsers` caps a page, and the seed script's single
 * `perPage: 1000` call would silently stop finding accounts once the project outgrew it —
 * a backfill that quietly skips users is worse than one that fails.
 */
async function fetchAllAuthUsers(): Promise<Map<string, AuthUser>> {
  const byId = new Map<string, AuthUser>();

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error(`listUsers(page ${page}) failed: ${error.message}`);

    const users = data?.users ?? [];
    for (const user of users) byId.set(user.id, user);

    if (users.length < PER_PAGE) break;
  }

  return byId;
}

async function main(): Promise<void> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. Pass --env-file=.env');
  }

  console.log(APPLY ? 'Mode: APPLY (writing changes)' : 'Mode: dry run (no changes; pass --apply)');
  console.log('');

  const dbUsers = await prisma.user.findMany({
    select: { id: true, authId: true, email: true, role: true },
    orderBy: { email: 'asc' },
  });
  const authUsers = await fetchAllAuthUsers();

  console.log(`database users : ${dbUsers.length}`);
  console.log(`auth accounts  : ${authUsers.size}`);
  console.log('');

  let correct = 0;
  let updated = 0;
  let disagreed = 0;
  let failed = 0;
  const missingAuth: string[] = [];

  for (const dbUser of dbUsers) {
    const authUser = authUsers.get(dbUser.authId);

    if (!authUser) {
      // A database row pointing at an auth account that no longer exists. Not this script's
      // problem to fix — it cannot log in either way — but worth surfacing.
      missingAuth.push(dbUser.email);
      continue;
    }

    const existingMetadata = (authUser.app_metadata ?? {}) as Record<string, unknown>;
    const existingRole = existingMetadata.role;

    if (existingRole === dbUser.role) {
      correct += 1;
      continue;
    }

    if (typeof existingRole === 'string' && existingRole !== dbUser.role) {
      disagreed += 1;
      console.log(
        `  role mismatch  ${dbUser.email}: auth says "${existingRole}", database says "${dbUser.role}" — database wins`,
      );
    } else {
      console.log(`  needs role     ${dbUser.email} -> ${dbUser.role}`);
    }

    if (!APPLY) continue;

    // Existing keys are spread back explicitly rather than relying on the server to merge.
    // GoTrue does merge `app_metadata`, but `provider` and `providers` live in the same
    // object and losing them would break sign-in — not worth depending on that behaviour.
    const { error } = await supabase.auth.admin.updateUserById(dbUser.authId, {
      app_metadata: { ...existingMetadata, role: dbUser.role },
    });

    if (error) {
      failed += 1;
      console.error(`  FAILED         ${dbUser.email}: ${error.message}`);
    } else {
      updated += 1;
    }
  }

  // Auth accounts with no database row. These cannot sign in to the app (every request
  // resolves the app user by `authId`), so they are leftovers rather than a security hole.
  const dbAuthIds = new Set(dbUsers.map((user) => user.authId));
  const orphanAuth = [...authUsers.values()].filter((user) => !dbAuthIds.has(user.id));

  const pending = dbUsers.length - correct - missingAuth.length;

  console.log('');
  console.log('--- summary ---');
  console.log(`already correct        : ${correct}`);
  console.log(APPLY ? `updated                : ${updated}` : `would update           : ${pending}`);
  if (disagreed > 0) console.log(`role disagreements     : ${disagreed} (database value applied)`);
  if (failed > 0) console.log(`failed                 : ${failed}`);
  if (missingAuth.length > 0) {
    console.log(`database rows with no auth account: ${missingAuth.length}`);
    for (const email of missingAuth) console.log(`    ${email}`);
  }
  if (orphanAuth.length > 0) {
    console.log(`auth accounts with no database row: ${orphanAuth.length}`);
    for (const user of orphanAuth) console.log(`    ${user.email ?? user.id}`);
  }

  if (!APPLY && correct !== dbUsers.length) {
    console.log('');
    console.log('Re-run with --apply to write these changes.');
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
