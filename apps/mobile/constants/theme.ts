/**
 * Design tokens.
 *
 * The primary colour `#4d5cc9` is the institution brand. Derived shades are built
 * from it so the whole palette stays cohesive.
 *
 * `touchTarget` encodes the accessibility floor: 44pt on iOS, 48dp on Android. The
 * larger value is used everywhere so one number satisfies both.
 */

export const colors = {
  primary: '#414fb8ff',
  primaryDark: '#3a47a3',
  primaryLight: '#6e7bd4',
  /** Text on a primary background. White on #4d5cc9 is ~5.2:1 — passes AA. */
  onPrimary: '#ffffff',

  background: '#f5f6fa',
  surface: '#ffffff',
  surfaceAlt: '#eceef5',

  /** ~13:1 on white. */
  text: '#1a1d2e',
  /** ~5.7:1 on white — passes AA for body text. */
  textMuted: '#5a5f72',
  /** Only for large text or decorative use; do not use for body copy. */
  textFaint: '#8b90a3',

  border: '#d6d9e3',
  borderStrong: '#b6bacb',

  /** Status colours. Each darkened until text on white passes 4.5:1. */
  success: '#1b7a44',
  successBg: '#e6f4ec',
  warning: '#8a5a00',
  warningBg: '#fdf3e0',
  danger: '#b3261e',
  dangerBg: '#fdecea',
  info: '#4d5cc9',
  infoBg: '#eceef8',

} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/**
 * Minimum interactive size. 02_SRS §8: 44x44 pt (Apple HIG) / 48x48 dp (Material).
 * Using 48 everywhere satisfies both platforms with one constant.
 */
export const touchTarget = 48;

export const fontSize = {
  caption: 12,
  small: 13,
  body: 15,
  subtitle: 17,
  title: 20,
  heading: 24,
  display: 30,
} as const;

/**
 * Shadow presets. Android uses `elevation`; iOS needs the shadow* family, so both are
 * set and each platform ignores the other's properties.
 */
export const shadow = {
  card: {
    shadowColor: '#0b1622',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
} as const;
