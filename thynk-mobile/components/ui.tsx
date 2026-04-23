import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Colors, Spacing, Radius } from '@/constants/theme';

// ── Badge ────────────────────────────────────────────────────────────────────
type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'primary' | 'muted';
const BADGE_COLORS: Record<BadgeVariant, { bg: string; fg: string }> = {
  success: { bg: Colors.successBg,  fg: Colors.success },
  danger:  { bg: Colors.dangerBg,   fg: Colors.danger },
  warning: { bg: Colors.warningBg,  fg: Colors.warning },
  info:    { bg: 'rgba(56,189,248,0.12)', fg: Colors.info },
  primary: { bg: Colors.primaryBg,  fg: Colors.primary },
  muted:   { bg: 'rgba(148,163,184,0.1)', fg: Colors.textMuted },
};

export function Badge({ label, variant = 'muted' }: { label: string; variant?: BadgeVariant }) {
  const c = BADGE_COLORS[variant];
  return (
    <View style={[badgeStyles.root, { backgroundColor: c.bg }]}>
      <Text style={[badgeStyles.text, { color: c.fg }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  root: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.round },
  text: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
});

// ── KPI Card ──────────────────────────────────────────────────────────────────
export function KpiCard({
  icon, label, value, sub, color = Colors.primary, highlight = false,
}: {
  icon: string; label: string; value: string | number;
  sub?: string; color?: string; highlight?: boolean;
}) {
  return (
    <View style={[kpiStyles.card, highlight && { borderColor: `${color}40`, backgroundColor: `${color}10` }]}>
      <Text style={kpiStyles.icon}>{icon}</Text>
      <Text style={kpiStyles.label}>{label}</Text>
      <Text style={[kpiStyles.value, { color }]}>{value}</Text>
      {sub ? <Text style={kpiStyles.sub}>{sub}</Text> : null}
    </View>
  );
}

const kpiStyles = StyleSheet.create({
  card: {
    flex: 1, minWidth: 140,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    padding: Spacing.lg,
  },
  icon:  { fontSize: 20, marginBottom: 6 },
  label: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  value: { fontSize: 26, fontWeight: '800', lineHeight: 30 },
  sub:   { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
});

// ── Section Header ────────────────────────────────────────────────────────────
export function SectionHeader({ title, note }: { title: string; note?: string }) {
  return (
    <View style={shStyles.row}>
      <View style={shStyles.bar} />
      <Text style={shStyles.title}>{title}</Text>
      {note && <View style={shStyles.notePill}><Text style={shStyles.noteText}>{note}</Text></View>}
    </View>
  );
}

const shStyles = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 20 },
  bar:      { width: 3, height: 16, backgroundColor: Colors.primary, borderRadius: 2 },
  title:    { fontSize: 12, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  notePill: { marginLeft: 'auto', backgroundColor: Colors.primaryBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.round },
  noteText: { fontSize: 10, fontWeight: '600', color: Colors.primary },
});

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View style={[cardStyles.card, style]}>
      {children}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
});

// ── Row Item ──────────────────────────────────────────────────────────────────
export function RowItem({
  label, value, mono = false,
}: { label: string; value: string | undefined | null; mono?: boolean }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={[rowStyles.value, mono && rowStyles.mono]}>{value ?? '—'}</Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  label: { fontSize: 12, color: Colors.textMuted, flex: 1 },
  value: { fontSize: 12, color: Colors.text, fontWeight: '600', flex: 2, textAlign: 'right' },
  mono:  { fontFamily: 'monospace', fontSize: 11 },
});

// ── Primary Button ────────────────────────────────────────────────────────────
export function PrimaryButton({
  label, onPress, loading = false, danger = false,
}: { label: string; onPress: () => void; loading?: boolean; danger?: boolean }) {
  return (
    <TouchableOpacity
      style={[btnStyles.btn, danger && btnStyles.danger]}
      onPress={onPress}
      disabled={loading}
    >
      {loading
        ? <ActivityIndicator color="#fff" size="small" />
        : <Text style={btnStyles.text}>{label}</Text>}
    </TouchableOpacity>
  );
}

const btnStyles = StyleSheet.create({
  btn:    { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 12, alignItems: 'center' },
  danger: { backgroundColor: Colors.danger },
  text:   { color: '#fff', fontSize: 14, fontWeight: '700' },
});

// ── Empty State ───────────────────────────────────────────────────────────────
export function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <View style={emptyStyles.root}>
      <Text style={emptyStyles.icon}>{icon}</Text>
      <Text style={emptyStyles.msg}>{message}</Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  root: { alignItems: 'center', paddingVertical: 60 },
  icon: { fontSize: 40, marginBottom: 12 },
  msg:  { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
});

// ── Screen Header ─────────────────────────────────────────────────────────────
export function ScreenHeader({
  title, subtitle, right,
}: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={headerStyles.root}>
      <View style={{ flex: 1 }}>
        <Text style={headerStyles.title}>{title}</Text>
        {subtitle && <Text style={headerStyles.sub}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

const headerStyles = StyleSheet.create({
  root:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  title: { fontSize: 22, fontWeight: '800', color: Colors.text, letterSpacing: -0.3 },
  sub:   { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
});

// ── Inline Bar ────────────────────────────────────────────────────────────────
export function InlineBar({ value, max, color = Colors.primary }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round(value / max * 100)) : 0;
  return (
    <View style={barStyles.track}>
      <View style={[barStyles.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
    </View>
  );
}

const barStyles = StyleSheet.create({
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: Colors.cardBorder, overflow: 'hidden' },
  fill:  { height: '100%', borderRadius: 3 },
});
