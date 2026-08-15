/**
 * Design tokens.
 *
 * Colours are chosen to satisfy the contrast requirement in 02_SRS §8 and
 * 12_Mobile_App_Spec §9 (>= 4.5:1 for text against its background). The palette is
 * built around the institution blue `#1e3a5f`, which is the notification colour named
 * in 12_Mobile_App_Spec §7.
 *
 * `touchTarget` encodes the accessibility floor from 02_SRS §8: 44pt on iOS, 48dp on
 * Android. The larger value is used everywhere so one number satisfies both, rather
 * than branching per platform and risking an undersized control on Android.
 */

export const colors = {
  primary: '#1e3a5f',
  primaryDark: '#14273f',
  primaryLight: '#2f5480',
  /** Text on a primary background. Contrast vs #1e3a5f is ~11:1. */
  onPrimary: '#ffffff',

  background: '#f7f8fa',
  surface: '#ffffff',
  surfaceAlt: '#eef1f5',

  /** ~13:1 on white. */
  text: '#16202b',
  /** ~5.7:1 on white — passes AA for body text. */
  textMuted: '#5a6672',
  /** Only for large text or decorative use; do not use for body copy. */
  textFaint: '#8b97a3',

  border: '#d6dce3',
  borderStrong: '#b6c0cb',

  /** Status colours. Each darkened until text on white passes 4.5:1. */
  success: '#1b7a44',
  successBg: '#e6f4ec',
  warning: '#8a5a00',
  warningBg: '#fdf3e0',
  danger: '#b3261e',
  dangerBg: '#fdecea',
  info: '#1c5f8a',
  infoBg: '#e7f1f8',

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
  lg: 14,
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
