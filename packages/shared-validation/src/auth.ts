/**
 * Auth schemas.
 *
 * Supabase Auth owns sign-in, token refresh and session storage, so there is no
 * login or refresh schema here — the app calls the Supabase client directly. What
 * remains is the password-reset pair, which needs the service role, and the client
 * context headers recorded on audit rows.
 */

import { z } from 'zod';
import { CLIENT_PLATFORMS } from '@ims/shared-types';
import { emailSchema, loginPasswordSchema, passwordSchema } from './common';

/**
 * Kept for the sign-in form's client-side validation. The credentials go to
 * Supabase, not to this API, but the form still needs to check them before a round
 * trip.
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    /** The recovery access token from the emailed link. */
    accessToken: z.string().min(1, { message: 'Reset token is required.' }),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Client context headers, recorded on audit rows.
 *
 * Parsed leniently with `.catch()`: a missing or malformed header is metadata, and
 * losing it must never fail the request it describes.
 */
export const clientContextSchema = z.object({
  clientPlatform: z.enum(CLIENT_PLATFORMS).optional().catch(undefined),
  clientVersion: z.string().trim().max(32).optional().catch(undefined),
});
export type ClientContextInput = z.infer<typeof clientContextSchema>;
