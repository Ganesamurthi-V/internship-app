/**
 * Attendance percentage ring — 12_Mobile_App_Spec §3.
 *
 * Drawn with two nested Views rather than SVG: the app has no SVG dependency, and a
 * ring is expressible as a rotated half-disc. This keeps the bundle smaller and avoids
 * `react-native-svg`, which needs its own native build.
 *
 * The implementation uses the classic two-half-circle technique. Each half is a
 * semicircle clipped by its container and rotated by an angle derived from the
 * percentage, so 0–50% rotates the right half and 50–100% also rotates the left.
 */

import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize } from '@/constants/theme';

interface ProgressRingProps {
  /** 0–100. Values outside are clamped. */
  percentage: number;
  size?: number;
  thickness?: number;
  label?: string;
  /** Small caption under the percentage, e.g. "42 of 45 days". */
  caption?: string;
}

export function ProgressRing({
  percentage,
  size = 120,
  thickness = 10,
  label = 'Attendance',
  caption,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, percentage));

  // Attendance thresholds: institutions commonly require 75%, so the ring turns amber
  // approaching it and red below.
  const colour =
    clamped >= 85 ? colors.success : clamped >= 75 ? colors.warning : colors.danger;

  const rightRotation = clamped <= 50 ? (clamped / 50) * 180 : 180;
  const leftRotation = clamped <= 50 ? 0 : ((clamped - 50) / 50) * 180;

  const half = size / 2;

  return (
    <View
      style={[styles.container, { width: size, height: size }]}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped), text: `${clamped}%` }}
    >
      {/* Track */}
      <View
        style={[
          styles.ring,
          { width: size, height: size, borderRadius: half, borderWidth: thickness },
        ]}
      />

      {/* Right half sweep (0–50%) */}
      <View style={[styles.clip, { width: half, height: size, left: half }]}>
        <View
          style={[
            styles.ring,
            styles.sweep,
            {
              width: size,
              height: size,
              borderRadius: half,
              borderWidth: thickness,
              borderTopColor: colour,
              borderRightColor: colour,
              left: -half,
              transform: [{ rotate: `${rightRotation - 45}deg` }],
            },
          ]}
        />
      </View>

      {/* Left half sweep (50–100%) */}
      {clamped > 50 ? (
        <View style={[styles.clip, { width: half, height: size, left: 0 }]}>
          <View
            style={[
              styles.ring,
              styles.sweep,
              {
                width: size,
                height: size,
                borderRadius: half,
                borderWidth: thickness,
                borderTopColor: colour,
                borderRightColor: colour,
                left: 0,
                transform: [{ rotate: `${leftRotation + 135}deg` }],
              },
            ]}
          />
        </View>
      ) : null}

      <View style={styles.center}>
        <Text style={[styles.value, { color: colour }]}>{Math.round(clamped)}%</Text>
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    borderColor: colors.surfaceAlt,
  },
  clip: { position: 'absolute', overflow: 'hidden', top: 0 },
  sweep: {
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: fontSize.title, fontWeight: '800', fontVariant: ['tabular-nums'] },
  caption: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
});
