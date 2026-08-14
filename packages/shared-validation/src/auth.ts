/**
 * Auth and device-token schemas — 05_API_Spec "Authentication" / "Device Tokens".
 */

import { z } from 'zod';
import { CLIENT_PLATFORMS, DEVICE_PLATFORMS } from '@ims/shared-types';
import { emailSchema, loginPasswordSchema, passwordSchema } from './common';

export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, { message: 'Refresh token is required.' }),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const logoutSchema = z.object({
  /**
   * Optional so a client that has lost its refresh token can still clear the
   * server session for the presented access token.
   */
  refreshToken: z.string().min(1).optional(),
  /** Revoke every session for this user, not just the current device. */
  allDevices: z.boolean().default(false),
});
export type LogoutInput = z.infer<typeof logoutSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, { message: 'Reset token is required.' }),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { message: 'Current password is required.' }),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })
  .refine((value) => value.password !== value.currentPassword, {
    message: 'New password must be different from the current one.',
    path: ['password'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * Expo push tokens look like `ExponentPushToken[xxxxxxxx]` in the managed
 * workflow, but bare FCM/APNs tokens appear in bare/dev builds. The format check
 * stays permissive; delivery failure is handled by pruning dead tokens instead.
 */
export const registerDeviceTokenSchema = z.object({
  expoPushToken: z
    .string()
    .trim()
    .min(10, { message: 'Push token is not valid.' })
    .max(500, { message: 'Push token is not valid.' }),
  platform: z.enum(DEVICE_PLATFORMS),
  appVersion: z.string().trim().max(32).optional(),
});
export type RegisterDeviceTokenInput = z.infer<typeof registerDeviceTokenSchema>;

/**
 * Client context headers, recorded on audit rows (02_SRS §6).
 * Parsed leniently: a missing or malformed header must never fail a request.
 */
export const clientContextSchema = z.object({
  clientPlatform: z.enum(CLIENT_PLATFORMS).optional().catch(undefined),
  clientVersion: z.string().trim().max(32).optional().catch(undefined),
});
export type ClientContextInput = z.infer<typeof clientContextSchema>;
