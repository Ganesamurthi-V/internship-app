/**
 * Circular progress ring using SVG for pixel-perfect rendering.
 *
 * At 100% the ring is fully filled. As the percentage decreases, the colored arc
 * shrinks proportionally, starting from 12 o'clock going clockwise.
 */

import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/constants/theme';

interface ProgressRingProps {
  /** 0–100. Values outside are clamped. */
  percentage: number;
  size?: number;
  strokeWidth?: number;
  /** Small caption under the percentage, e.g. "1/1 days". */
  caption?: string;
}

export function ProgressRing({
  percentage,
  size = 90,
  strokeWidth = 8,
  caption,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, percentage));
  const colour =
    clamped >= 85 ? colors.success : clamped >= 75 ? colors.warning : colors.danger;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <View
      style={[styles.container, { width: size, height: size }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped), text: `${clamped}%` }}
    >
      <Svg width={size} height={size}>
        {/* Background track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.surfaceAlt}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Filled arc */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colour}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>

      {/* Center text */}
      <View style={styles.center}>
        <Text style={[styles.value, { color: colour }]}>{Math.round(clamped)}%</Text>
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  caption: { fontSize: 10, color: colors.textMuted, marginTop: 1 },
});
