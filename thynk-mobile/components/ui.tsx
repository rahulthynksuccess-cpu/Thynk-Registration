import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Colors, Spacing, Radius } from '@/constants/theme';

type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'primary' | 'muted';
const BADGE_COLORS: Record<BadgeVariant, { bg: string; fg: string }> = {
  success: { bg: Colors.successBg, fg: Colors.success },
  danger:  { bg: Colors.dangerBg,  fg: Colors.danger  },
  warning: { bg: Colors.warningBg, fg: Colors.warning  },
  info:    { bg: 'rgba(56,189,248,0.12)', fg: Colors.info },
  primary: { bg: Colors.primaryBg, fg: Colors.primary  },
  muted:   { bg: 'rgba(148,163,184,0.1)', fg: Colors.textMuted },
};

export function Badge({ label, variant = 'muted' }: { label: string; variant?: BadgeVariant }) {
  const c = BADGE_COLORS[variant];
  return (
    <View style={[bs.root, { backgroundColor: c.bg }]}>
      <Text style={[bs.text, { color: c.fg }]}>{label.toUpperCase()}</Text>
    </View>
  );
}
const bs = StyleSheet.create({
  root: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.round },
  text: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
});

export function KpiCard({ icon, label, value, sub, color = Colors.primary, highlight = false }: {
  icon: string; label: string; value: string | number; sub?: string; color?: string; highlight?: boolean;
}) {
  return (
    <View style={[ks.card, highlight && { borderColor: `${color}40`, backgroundColor: `${color}10` }]}>
      <Text style={ks.icon}>{icon}</Text>
      <Text style={ks.label}>{label}</Text>
      <Text style={[ks.value, { color }]}>{value}</Text>
      {sub ? <Text style={ks.sub}>{sub}</Text> : null}
    </View>
  );
}
const ks = StyleSheet.create({
  card:  { flex: 1, backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.cardBorder, padding: Spacing.lg },
  icon:  { fontSize: 20, marginBottom: 6 },
  label: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  value: { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  sub:   { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
});

export function SectionHeader({ title, note }: { title: string; note?: string }) {
  return (
    <View style={sh.row}>
      <View style={sh.bar} />
      <Text style={sh.title}>{title}</Text>
      {note && <View style={sh.pill}><Text style={sh.pillText}>{note}</Text></View>}
    </View>
  );
}
const sh = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 18 },
  bar:      { width: 3, height: 14, backgroundColor: Colors.primary, borderRadius: 2 },
  title:    { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  pill:     { marginLeft: 'auto', backgroundColor: Colors.primaryBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.round },
  pillText: { fontSize: 10, fontWeight: '600', color: Colors.primary },
});

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[cs.card, style]}>{children}</View>;
}
const cs = StyleSheet.create({
  card: { backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.lg, marginBottom: Spacing.md },
});

export function RowItem({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <View style={rs.row}>
      <Text style={rs.label}>{label}</Text>
      <Text style={[rs.value, mono && rs.mono]} numberOfLines={1}>{value ?? '—'}</Text>
    </View>
  );
}
const rs = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  label: { fontSize: 12, color: Colors.textMuted, flex: 1 },
  value: { fontSize: 12, color: Colors.text, fontWeight: '600', flex: 2, textAlign: 'right' },
  mono:  { fontFamily: 'monospace', fontSize: 11 },
});

export function PrimaryButton({ label, onPress, loading = false, danger = false }: {
  label: string; onPress: () => void; loading?: boolean; danger?: boolean;
}) {
  return (
    <TouchableOpacity style={[pb.btn, danger && pb.danger]} onPress={onPress} disabled={loading}>
      {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={pb.text}>{label}</Text>}
    </TouchableOpacity>
  );
}
const pb = StyleSheet.create({
  btn:    { flex: 1, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 12, alignItems: 'center' },
  danger: { backgroundColor: Colors.danger },
  text:   { color: '#fff', fontSize: 14, fontWeight: '700' },
});

export function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 50 }}>
      <Text style={{ fontSize: 36, marginBottom: 12 }}>{icon}</Text>
      <Text style={{ fontSize: 14, color: Colors.textMuted, textAlign: 'center' }}>{message}</Text>
    </View>
  );
}

export function InlineBar({ value, max, color = Colors.primary }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round(value / max * 100)) : 0;
  return (
    <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: Colors.cardBorder, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: '100%', borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}
