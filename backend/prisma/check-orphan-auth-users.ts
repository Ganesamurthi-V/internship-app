/**
 * Diagnostic: find Supabase Auth users with no matching app user.
 *
 * Supabase keeps accounts in `auth.users`, which is a different table from the
 * app's `public.users`. Deleting a row from `public.users` / `public.students`
 * leaves the auth account behind, and that leftover account is what makes a
 * re-registration fail with "already registered" even though the app tables look
 * empty.
 *
 * Read-only by default.
 *
 *   npx tsx prisma/check-orphan-auth-users.ts
 *   npx tsx prisma/check-orphan-auth-users.ts --email=test2@smvec.ac.in
 *   npx tsx prisma/check-orphan-auth-users.ts --delete-all
 */

import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const prisma = new PrismaClient();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function main(): Promise<void> {
  const deleteAll = process.argv.includes('--delete-all');
  const emailArg = process.argv.find((a) => a.startsWith('--email='));
  const targetEmail = emailArg?.slice('--email='.length).toLowerCase();

  // Supabase paginates admin listing; walk every page.
  const authUsers: { id: string; email: string | undefined; createdAt: string }[] = [];
  let page = 1;

  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    if (data.users.length === 0) break;

    for (const u of data.users) {
      authUsers.push({ id: u.id, email: u.email, createdAt: u.created_at });
    }

    if (data.users.length < 200) break;
    page += 1;
  }

  const appUsers = await prisma.user.findMany({
    select: { authId: true, email: true, role: true, status: true },
  });

  const appByAuthId = new Map(appUsers.map((u) => [u.authId, u]));
  const appEmails = new Set(appUsers.map((u) => u.email.toLowerCase()));

  console.log(`auth.users   : ${authUsers.length}`);
  console.log(`public.users : ${appUsers.length}\n`);

  const orphans = authUsers.filter((a) => !appByAuthId.has(a.id));

  if (orphans.length === 0) {
    console.log('No orphaned auth accounts. Every auth user has an app record.');
  } else {
    console.log(`=== Orphaned auth accounts (${orphans.length}) ===`);
    console.log('These block re-registration of that email:\n');
    for (const o of orphans) {
      const alsoByEmail = o.email && appEmails.has(o.email.toLowerCase());
      console.log(`  ${o.email ?? '(no email)'}`);
      console.log(`    authId : ${o.id}`);
      console.log(`    created: ${o.createdAt}`);
      if (alsoByEmail) {
        console.log('    note   : an app user has this email but a DIFFERENT authId');
      }
    }

    // Only ever delete orphans — an auth account that still has an app user is
    // never touched, whichever flag was passed.
    const toDelete = targetEmail
      ? orphans.filter((o) => o.email?.toLowerCase() === targetEmail)
      : deleteAll
        ? orphans
        : [];

    if (targetEmail && toDelete.length === 0) {
      console.log(`\nNo orphaned auth account found for "${targetEmail}".`);
    }

    if (toDelete.length > 0) {
      console.log(`\nDeleting ${toDelete.length} orphaned auth account(s)...`);
      for (const o of toDelete) {
        const { error } = await supabase.auth.admin.deleteUser(o.id);
        if (error) {
          console.log(`  FAILED  ${o.email} — ${error.message}`);
        } else {
          console.log(`  deleted ${o.email}`);
        }
      }
      console.log('\nDone. Those emails can be registered again.');
    } else if (!targetEmail) {
      console.log('\nTo free one email : --email=someone@smvec.ac.in');
      console.log('To free all       : --delete-all');
    }
  }

  // The reverse problem: an app user whose auth account is gone. Such a user can
  // never log in, because JWT verification resolves nothing.
  const authIds = new Set(authUsers.map((a) => a.id));
  const brokenAppUsers = appUsers.filter((u) => !authIds.has(u.authId));

  if (brokenAppUsers.length > 0) {
    console.log(`\n=== App users with no auth account (${brokenAppUsers.length}) ===`);
    console.log('These cannot log in:\n');
    for (const u of brokenAppUsers) {
      console.log(`  ${u.email}  role=${u.role}  status=${u.status}  authId=${u.authId}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
