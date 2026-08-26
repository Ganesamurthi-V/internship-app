/**
 * Removes Supabase Storage files that no `documents` row points at.
 *
 * Deleting a user cascades the `documents` rows away, but the uploaded bytes live
 * in Storage, which no database trigger can reach. This sweeps the bucket and
 * deletes objects nothing references any more.
 *
 * Two key shapes exist:
 *   <ownerUserId>/<uuid>.<ext>      normal upload, owned by a user
 *   pre-registration/<uuid>.<ext>   anonymous upload during registration
 *
 * Pre-registration files are skipped unless older than --min-age-hours (default
 * 24), because a registration that is still being filled in has uploaded its files
 * before the Document row exists. Deleting those mid-flight would break it.
 *
 * Read-only by default.
 *
 *   npx tsx --env-file=.env prisma/cleanup-orphan-storage.ts
 *   npx tsx --env-file=.env prisma/cleanup-orphan-storage.ts --delete
 */

import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const prisma = new PrismaClient();
const BUCKET = process.env.STORAGE_BUCKET ?? 'internship-documents';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

interface StoredObject {
  key: string;
  createdAt: string | null;
  sizeBytes: number;
}

/** Storage listing is per-prefix, so walk folders one level at a time. */
async function listAll(prefix = ''): Promise<StoredObject[]> {
  const out: StoredObject[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });

    if (error) throw new Error(`list("${prefix}") failed: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const entry of data) {
      const key = prefix ? `${prefix}/${entry.name}` : entry.name;

      // A folder placeholder has no id/metadata; recurse into it.
      if (entry.id === null) {
        out.push(...(await listAll(key)));
      } else {
        out.push({
          key,
          createdAt: entry.created_at ?? null,
          sizeBytes: (entry.metadata as { size?: number } | null)?.size ?? 0,
        });
      }
    }

    if (data.length < 100) break;
    offset += 100;
  }

  return out;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function main(): Promise<void> {
  const shouldDelete = process.argv.includes('--delete');
  const ageArg = process.argv.find((a) => a.startsWith('--min-age-hours='));
  const minAgeHours = ageArg ? Number(ageArg.slice('--min-age-hours='.length)) : 24;

  const objects = await listAll();
  const documents = await prisma.document.findMany({ select: { storageKey: true } });
  const referenced = new Set(documents.map((d) => d.storageKey));

  console.log(`bucket           : ${BUCKET}`);
  console.log(`objects in bucket: ${objects.length}`);
  console.log(`documents rows   : ${documents.length}\n`);

  const cutoff = Date.now() - minAgeHours * 60 * 60 * 1000;

  const orphans: StoredObject[] = [];
  const skippedRecent: StoredObject[] = [];

  for (const obj of objects) {
    if (referenced.has(obj.key)) continue;

    const isPreRegistration = obj.key.startsWith('pre-registration/');
    const createdMs = obj.createdAt ? new Date(obj.createdAt).getTime() : 0;

    if (isPreRegistration && createdMs > cutoff) {
      skippedRecent.push(obj);
      continue;
    }

    orphans.push(obj);
  }

  if (skippedRecent.length > 0) {
    console.log(`Skipped ${skippedRecent.length} pre-registration upload(s) newer than ${minAgeHours}h`);
    console.log('(a registration may still be in progress)\n');
  }

  if (orphans.length === 0) {
    console.log('No orphaned files. Every object is referenced by a document row.');
    return;
  }

  const wasted = orphans.reduce((sum, o) => sum + o.sizeBytes, 0);
  console.log(`=== Orphaned files (${orphans.length}, ${formatSize(wasted)}) ===`);
  for (const o of orphans) {
    console.log(`  ${o.key}  ${formatSize(o.sizeBytes)}  ${o.createdAt ?? 'unknown date'}`);
  }

  if (!shouldDelete) {
    console.log('\nRe-run with --delete to remove them.');
    return;
  }

  // Supabase accepts a batch of keys per call; chunk to stay within limits.
  console.log('\nDeleting...');
  for (let i = 0; i < orphans.length; i += 50) {
    const batch = orphans.slice(i, i + 50).map((o) => o.key);
    const { error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) {
      console.log(`  FAILED batch starting ${batch[0]} — ${error.message}`);
    } else {
      for (const key of batch) console.log(`  deleted ${key}`);
    }
  }

  console.log(`\nReclaimed ${formatSize(wasted)}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
