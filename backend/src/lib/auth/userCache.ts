/**
 * Short-lived in-memory cache for application user lookups.
 *
 * After local JWT verification confirms the `authId`, we still need the user's
 * role, studentId, mentorId etc. from Postgres. This cache avoids hitting the DB
 * on every single request — a user's role/status changes at most a few times during
 * their internship, so a 2-minute stale window is more than acceptable.
 *
 * Size: 500 entries. At 2 concurrent users per department × 10 departments, this
 * comfortably holds the entire active user base of a single college.
 */

import { LRUCache } from 'lru-cache';

export interface CachedUser {
  userId: string;
  authId: string;
  email: string;
  role: string;
  name: string;
  studentId: string | null;
  mentorId: string | null;
  departmentId: string | null;
}

export const userCache = new LRUCache<string, CachedUser>({
  max: 500,
  ttl: 2 * 60 * 1000, // 2 minutes
});
