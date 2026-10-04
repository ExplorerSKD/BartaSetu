import { Platform, TextStyle } from 'react-native';

export const colors = {
  background: '#FFFFFF',
  surface: '#F6F7F9',
  surfaceAlt: '#EEF1F4',
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',

  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textOnPrimary: '#FFFFFF',

  primary: '#059669',
  primaryDark: '#047857',
  primarySoft: '#ECFDF5',
  primaryBorder: '#A7F3D0',

  internet: '#2563EB',
  internetSoft: '#EFF6FF',
  nearby: '#D97706',
  nearbySoft: '#FFFBEB',
  mesh: '#7C3AED',
  meshSoft: '#F5F3FF',

  danger: '#DC2626',
  dangerDark: '#B91C1C',
  dangerSoft: '#FEF2F2',
  dangerBorder: '#FECACA',

  bubbleOut: '#059669',
  bubbleIn: '#F1F5F9',
  overlay: 'rgba(15, 23, 42, 0.45)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
};

export const type: Record<string, TextStyle> = {
  display: { fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -0.6 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, fontWeight: '400', color: colors.text, lineHeight: 21 },
  bodyStrong: { fontSize: 15, fontWeight: '600', color: colors.text },
  caption: { fontSize: 13, fontWeight: '400', color: colors.textSecondary, lineHeight: 18 },
  small: { fontSize: 12, fontWeight: '500', color: colors.textMuted },
  label: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.4, textTransform: 'uppercase' },
  mono: {
    fontFamily: Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' }),
    fontWeight: '700',
    color: colors.text,
  },
};

export const shadow = {
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  raised: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 6,
  },
};
