/**
 * Skeleton loading screens using boneyard-js.
 *
 * Each exported component matches the layout of its real screen so the user sees a
 * familiar shape while data loads, rather than a blank page or "Loading..." text.
 *
 * Boneyard's `<Skeleton>` component renders captured bone shapes when `loading` is
 * true, and transparently shows children once loading is false.
 */

import { StyleSheet, View } from 'react-native';
import { Skeleton } from 'boneyard-js/native';
import { Screen } from '@/components/shared/Screen';
import { colors, radius, spacing } from '@/constants/theme';

// ---------------------------------------------------------------------------
// Shared bone building blocks
// ---------------------------------------------------------------------------

/** A single rounded rectangle that shimmers while loading. */
function Bone({
  width,
  height,
  borderRadius = radius.sm,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: object;
}) {
  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.surfaceAlt,
        },
        style,
      ]}
    />
  );
}

/** A card-shaped container matching the real Card component's visual. */
function CardBone({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

// ---------------------------------------------------------------------------
// Student Dashboard Skeleton
// ---------------------------------------------------------------------------

export function StudentDashboardSkeleton() {
  return (
    <Screen>
      <Skeleton name="student-dashboard" loading={true} animate="pulse" color={colors.surfaceAlt}>
        <View style={styles.container}>
          {/* Greeting + date */}
          <Bone width="60%" height={24} />
          <Bone width="45%" height={14} style={{ marginTop: spacing.sm }} />

          {/* Main action card */}
          <CardBone>
            <Bone width="70%" height={18} />
            <Bone width="100%" height={14} style={{ marginTop: spacing.md }} />
            <Bone width="85%" height={14} style={{ marginTop: spacing.xs }} />
            <Bone width={120} height={40} borderRadius={radius.md} style={{ marginTop: spacing.lg }} />
          </CardBone>

          {/* Attendance summary card */}
          <CardBone>
            <Bone width="50%" height={18} />
            <View style={styles.summaryRow}>
              {/* Progress ring placeholder */}
              <Bone width={64} height={64} borderRadius={32} />
              <View style={styles.summaryFacts}>
                <Bone width="80%" height={14} />
                <Bone width="70%" height={14} style={{ marginTop: spacing.sm }} />
                <Bone width="60%" height={14} style={{ marginTop: spacing.sm }} />
              </View>
            </View>
          </CardBone>

          {/* Recent days card */}
          <CardBone>
            <Bone width="40%" height={18} />
            {[1, 2, 3].map((i) => (
              <View key={i} style={styles.listRow}>
                <Bone width="50%" height={14} />
                <Bone width={60} height={22} borderRadius={radius.pill} />
              </View>
            ))}
          </CardBone>

          {/* Summary tiles */}
          <View style={styles.tileRow}>
            <View style={styles.tile}>
              <Bone width="60%" height={14} />
              <Bone width={40} height={24} style={{ marginTop: spacing.sm }} />
            </View>
            <View style={styles.tile}>
              <Bone width="60%" height={14} />
              <Bone width={40} height={24} style={{ marginTop: spacing.sm }} />
            </View>
          </View>
        </View>
      </Skeleton>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Faculty Dashboard Skeleton
// ---------------------------------------------------------------------------

export function FacultyDashboardSkeleton() {
  return (
    <Screen>
      <Skeleton name="faculty-dashboard" loading={true} animate="pulse" color={colors.surfaceAlt}>
        <View style={styles.container}>
          {/* Greeting + subtitle */}
          <Bone width="50%" height={24} />
          <Bone width="65%" height={14} style={{ marginTop: spacing.sm }} />

          {/* Pending review card */}
          <CardBone>
            <Bone width="75%" height={18} />
            <Bone width="100%" height={14} style={{ marginTop: spacing.md }} />
            <Bone width="90%" height={14} style={{ marginTop: spacing.xs }} />
            <Bone width={140} height={40} borderRadius={radius.md} style={{ marginTop: spacing.lg }} />
          </CardBone>

          {/* Today card */}
          <CardBone>
            <Bone width="30%" height={18} />
            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              {[1, 2, 3, 4].map((i) => (
                <View key={i} style={styles.factRow}>
                  <Bone width="40%" height={14} />
                  <Bone width={30} height={18} />
                </View>
              ))}
            </View>
            <Bone width="70%" height={40} borderRadius={radius.md} style={{ marginTop: spacing.lg }} />
          </CardBone>

          {/* Summary tiles */}
          <View style={styles.tileRow}>
            <View style={styles.tile}>
              <Bone width="70%" height={14} />
              <Bone width={30} height={24} style={{ marginTop: spacing.sm }} />
            </View>
            <View style={styles.tile}>
              <Bone width="70%" height={14} />
              <Bone width={30} height={24} style={{ marginTop: spacing.sm }} />
            </View>
          </View>
        </View>
      </Skeleton>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// List Skeleton (for history, review queue, student list)
// ---------------------------------------------------------------------------

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Screen>
      <Skeleton name="list-screen" loading={true} animate="pulse" color={colors.surfaceAlt}>
        <View style={styles.container}>
          {/* Filter chips row */}
          <View style={styles.chipRow}>
            <Bone width={60} height={30} borderRadius={radius.pill} />
            <Bone width={70} height={30} borderRadius={radius.pill} />
            <Bone width={65} height={30} borderRadius={radius.pill} />
          </View>

          {/* List items */}
          {Array.from({ length: rows }, (_, i) => (
            <CardBone key={i}>
              <View style={styles.listRow}>
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <Bone width="65%" height={16} />
                  <Bone width="40%" height={12} />
                </View>
                <Bone width={60} height={22} borderRadius={radius.pill} />
              </View>
            </CardBone>
          ))}
        </View>
      </Skeleton>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Answer/Form Skeleton
// ---------------------------------------------------------------------------

export function FormSkeleton({ fields = 3 }: { fields?: number }) {
  return (
    <Screen>
      <Skeleton name="form-screen" loading={true} animate="pulse" color={colors.surfaceAlt}>
        <View style={styles.container}>
          {Array.from({ length: fields }, (_, i) => (
            <CardBone key={i}>
              <Bone width="80%" height={16} />
              <Bone width="50%" height={12} style={{ marginTop: spacing.xs }} />
              <Bone width="100%" height={44} borderRadius={radius.md} style={{ marginTop: spacing.md }} />
            </CardBone>
          ))}

          {/* Submit button */}
          <Bone width="100%" height={48} borderRadius={radius.md} style={{ marginTop: spacing.md }} />
        </View>
      </Skeleton>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  summaryFacts: {
    flex: 1,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  factRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tileRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
