/**
 * POST /api/auth/create-faculty — admin creates a new faculty account.
 *
 * Flow:
 *   1. Admin provides name, email, password, and departmentId
 *   2. Creates a Supabase Auth user
 *   3. Creates the User record with role 'faculty' and the assigned department
 *   4. Returns the created user info
 *
 * Only admins can call this. The assigned department determines which students
 * the faculty member can see and review.
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { created, parseJson, withErrorHandling } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { requireRole } from '@/lib/auth/guards';
import { conflict, serverError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/audit';
import { getRequestContext } from '@/lib/http';

const createFacultySchema = z.object({
  name: z.string().trim().min(2, { message: 'Name is required.' }).max(120),
  email: z.string().trim().email({ message: 'Enter a valid email.' }).transform((v) => v.toLowerCase()),
  password: z.string().min(8, { message: 'Password must be at least 8 characters.' }),
  departmentId: z.string().uuid({ message: 'Select a department.' }),
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  requireRole(auth, 'admin');

  const input = await parseJson(request, createFacultySchema);

  // Check email uniqueness
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) {
    throw conflict('This email is already in use.', { email: 'Already registered.' });
  }

  // Verify department exists
  const dept = await prisma.department.findUnique({
    where: { id: input.departmentId },
    select: { id: true, name: true },
  });
  if (!dept) {
    throw conflict('Department not found.', { departmentId: 'Invalid department.' });
  }

  // Create Supabase Auth user
  const { data: authData, error: authError } = await supabaseAdmin().auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name },
    // `app_metadata`, not `user_metadata`. Only the service role can write this, so it is
    // the one role claim in the token a client may trust. `user_metadata` is writable by
    // the account holder via `updateUser`, which meant the mobile app's offline fallback
    // was reading a role its owner could set. The database stays authoritative — this is
    // the fallback for when `/auth/me` cannot be reached.
    app_metadata: { role: 'faculty' },
  });

  if (authError) {
    if (authError.message?.includes('already been registered')) {
      throw conflict('This email is already registered.', { email: 'Already exists.' });
    }
    throw serverError(`Could not create account: ${authError.message}`);
  }

  const authId = authData.user.id;

  // Create the User record
  try {
    const user = await prisma.user.create({
      data: {
        authId,
        email: input.email,
        role: 'faculty',
        status: 'active',
        name: input.name,
        departmentId: input.departmentId,
      },
      select: { id: true, email: true, name: true, role: true, departmentId: true },
    });

    await recordAudit({
      action: 'user_created',
      entityType: 'user',
      entityId: user.id,
      actorUserId: auth.userId,
      context: getRequestContext(request),
      metadata: { role: 'faculty', name: input.name, department: dept.name },
    });

    return created({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      departmentName: dept.name,
    });
  } catch (error) {
    // Clean up auth user if Prisma fails
    await supabaseAdmin().auth.admin.deleteUser(authId).catch(() => {});
    throw error;
  }
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
