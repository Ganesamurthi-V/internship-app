/**
 * React Query hooks over the API client.
 *
 * Two things worth noting:
 *
 *  1. Read hooks that matter offline write their result into the local `response_cache`
 *     and fall back to it when the request fails with a network error. 02_SRS §5
 *     requires "View own records | Served from local cache" and "Faculty dashboard |
 *     Stale cache shown with last-sync timestamp", which is what `cachedAt` supports.
 *
 *  2. Attendance and work-log writes do not go through React Query mutations to the
 *     server directly — they are written to SQLite first and synced by the engine. That
 *     is what makes the offline path the *only* path, so an online submission and an
 *     offline one behave identically and there is no second code path to get wrong.
 */

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type {
  AttendanceSummary,
  CurrentWeekSummary,
  Department,
  DocumentMeta,
  FacultyCoordinatorOption,
  FacultyDashboard,
  FinalAssessmentDetail,
  InternshipDetail,
  MentorDashboard,
  MentorStudentItem,
  Student,
  StudentDashboard,
  WeeklyReport,
} from '@ims/shared-types';
import { api, ApiError } from './client';
import { queryKeys } from './queryKeys';
import { responseCache } from '@/lib/db/database';

/** Result of an offline-tolerant read. */
export interface CachedResult<T> {
  value: T;
  /** Set when the value came from the local cache rather than the network. */
  cachedAt: number | null;
}

/**
 * Fetches, caching the response locally, and falls back to that cache on a network
 * failure. Any non-network error propagates — a 403 must surface, not be masked by
 * stale data.
 */
async function fetchWithCache<T>(cacheKey: string, fetcher: () => Promise<T>): Promise<CachedResult<T>> {
  try {
    const value = await fetcher();
    await responseCache.set(cacheKey, value);
    return { value, cachedAt: null };
  } catch (error) {
    if (error instanceof ApiError && error.isNetworkError) {
      const cached = await responseCache.get<T>(cacheKey);
      if (cached) return { value: cached.value, cachedAt: cached.cachedAt };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Dashboards
// ---------------------------------------------------------------------------

type DashboardResponse =
  | { role: 'student'; dashboard: StudentDashboard }
  | { role: 'mentor'; dashboard: MentorDashboard }
  | { role: 'faculty' | 'admin'; dashboard: FacultyDashboard };

export function useDashboard(
  options?: Partial<UseQueryOptions<CachedResult<DashboardResponse>>>,
) {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => fetchWithCache('dashboard', () => api.get<DashboardResponse>('/dashboard')),
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------

export function useMyProfile() {
  return useQuery({
    queryKey: queryKeys.student.me,
    queryFn: () => fetchWithCache('student:me', () => api.get<Student>('/students/me')),
  });
}

/** `null` is a valid result: the student has not registered an internship yet. */
export function useMyInternship() {
  return useQuery({
    queryKey: queryKeys.student.myInternship,
    queryFn: () =>
      fetchWithCache('internship:me', () => api.get<InternshipDetail | null>('/internships/me')),
  });
}

export function useAttendanceSummary(internshipId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.student.attendanceSummary(internshipId ?? 'none'),
    enabled: Boolean(internshipId),
    queryFn: () =>
      fetchWithCache(`attendance:summary:${internshipId}`, () =>
        api.get<AttendanceSummary>('/attendance/summary', { internshipId }),
      ),
  });
}

export function useCurrentWeek(internshipId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.student.currentWeek(internshipId ?? 'none'),
    enabled: Boolean(internshipId),
    queryFn: () =>
      fetchWithCache(`weekly:current:${internshipId}`, () =>
        api.get<CurrentWeekSummary>('/weekly-reports/current', { internshipId }),
      ),
  });
}

export function useWeeklyReports(internshipId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.student.weeklyReports(internshipId ?? 'none'),
    enabled: Boolean(internshipId),
    queryFn: () =>
      fetchWithCache(`weekly:list:${internshipId}`, () =>
        api.get<WeeklyReport[]>('/weekly-reports', { internshipId }),
      ),
  });
}

export function useFinalAssessment(internshipId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.student.finalAssessment(internshipId ?? 'none'),
    enabled: Boolean(internshipId),
    queryFn: () =>
      fetchWithCache(`final:${internshipId}`, () =>
        api.get<FinalAssessmentDetail>('/final-assessment', { internshipId }),
      ),
  });
}

export function useDocuments(internshipId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.student.documents(internshipId ?? 'none'),
    enabled: Boolean(internshipId),
    queryFn: () =>
      fetchWithCache(`documents:${internshipId}`, () =>
        api.get<DocumentMeta[]>('/documents', { internshipId }),
      ),
  });
}

// ---------------------------------------------------------------------------
// Reference data for the registration wizard
// ---------------------------------------------------------------------------

export function useDepartments() {
  return useQuery({
    queryKey: queryKeys.reference.departments,
    // Reference data changes rarely; an hour of staleness is fine and saves requests.
    staleTime: 60 * 60 * 1000,
    queryFn: () => fetchWithCache('departments', () => api.get<Department[]>('/departments')),
  });
}

export function useFacultyCoordinators() {
  return useQuery({
    queryKey: queryKeys.reference.facultyCoordinators,
    staleTime: 60 * 60 * 1000,
    queryFn: () =>
      fetchWithCache('faculty-coordinators', () =>
        api.get<FacultyCoordinatorOption[]>('/faculty-coordinators'),
      ),
  });
}

// ---------------------------------------------------------------------------
// Mentor
// ---------------------------------------------------------------------------

export function useMentorStudents() {
  return useQuery({
    queryKey: queryKeys.mentor.students,
    queryFn: () =>
      fetchWithCache('mentor:students', () => api.get<MentorStudentItem[]>('/mentor/students')),
  });
}
