import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, SafeAreaView, ActivityIndicator, Modal, Alert,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { authFetch, AdminRow, fmtAmount } from '@/lib/api';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { KpiCard, SectionHeader, Card, RowItem, InlineBar } from '@/components/ui';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// ── Timeline filter ────────────────────────────────────────────────────────────
const TIMELINES = [
  { label: 'Today', days: 0  },
  { label: '5D',    days: 5  },
  { label: '10D',   days: 10 },
  { label: '30D',   days: 30 },
  { label: 'Year',  days: -1 },
  { label: 'All',   days: -2 },
] as const;

type TimelineDays = 0 | 5 | 10 | 30 | -1 | -2;

function filterByTimeline(rows: AdminRow[], days: TimelineDays): AdminRow[] {
  if (days === -2) return rows;
  if (days === -1) { const y = new Date().getFullYear(); return rows.filter(r => new Date(r.created_at).getFullYear() === y); }
  if (days === 0)  { const t = new Date().toISOString().slice(0, 10); return rows.filter(r => r.created_at?.slice(0, 10) === t); }
  const cut = new Date(Date.now() - days * 86400000);
  return rows.filter(r => new Date(r.created_at) >= cut);
}

// ── Bar chart ──────────────────────────────────────────────────────────────────
function BarChart({ data, color = Colors.primary }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <View style={chartStyles.root}>
      {data.slice(0, 10).map((d, i) => (
        <View key={i} style={chartStyles.col}>
          <Text style={chartStyles.val}>{d.value > 0 ? d.value : ''}</Text>
          <View style={[chartStyles.bar, { height: Math.max(4, Math.round(d.value / max * 80)), backgroundColor: color }]} />
          <Text style={chartStyles.lbl} numberOfLines={1}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}
const chartStyles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, paddingBottom: 4 },
  col:  { flex: 1, alignItems: 'center', gap: 3 },
  bar:  { width: '100%', borderRadius: 3, minHeight: 4 },
  val:  { fontSize: 8, color: Colors.textMuted, fontWeight: '700' },
  lbl:  { fontSize: 8, color: Colors.textDim, maxWidth: 32, textAlign: 'center' },
});

// ── Rank Row ──────────────────────────────────────────────────────────────────
const MEDALS = ['🥇', '🥈', '🥉'];
function RankRow({ rank, name, primary, secondary }: { rank: number; name: string; primary: string; secondary?: string }) {
  const isTop = rank < 3;
  return (
    <View style={[rankStyles.row, isTop && { backgroundColor: `${Colors.warning}09` }]}>
      <Text style={[rankStyles.rank, { color: isTop ? Colors.warning : Colors.textDim }]}>
        {isTop ? MEDALS[rank] : rank + 1}
      </Text>
      <View style={{ flex: 1 }}>
        <Text style={rankStyles.name} numberOfLines={1}>{name}</Text>
        {secondary && <Text style={rankStyles.sec}>{secondary}</Text>}
      </View>
      <Text style={rankStyles.primary}>{primary}</Text>
    </View>
  );
}
const rankStyles = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10 },
  rank:    { width: 22, textAlign: 'center', fontSize: 14, fontWeight: '800' },
  name:    { fontSize: 12, fontWeight: '600', color: Colors.text },
  sec:     { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  primary: { fontSize: 13, fontWeight: '800', color: Colors.warning },
});

// ── Stat Row ──────────────────────────────────────────────────────────────────
function StatRow({ label, count, revenue, maxCount }: { label: string; count: number; revenue: number; maxCount: number }) {
  return (
    <View style={statStyles.row}>
      <Text style={statStyles.label} numberOfLines={1}>{label}</Text>
      <View style={statStyles.barCell}>
        <InlineBar value={count} max={maxCount} color={Colors.primary} />
        <Text style={statStyles.cnt}>{count}</Text>
      </View>
      <Text style={statStyles.rev}>{fmtAmount(revenue)}</Text>
    </View>
  );
}
const statStyles = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  label:   { width: 90, fontSize: 11, color: Colors.textMuted },
  barCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  cnt:     { width: 24, fontSize: 12, fontWeight: '700', color: Colors.text, textAlign: 'right' },
  rev:     { width: 72, fontSize: 11, fontWeight: '700', color: Colors.accent, textAlign: 'right' },
});

// ── Pie Legend ────────────────────────────────────────────────────────────────
function PieLegend({ entries }: { entries: { label: string; value: number; color: string }[] }) {
  const total = entries.reduce((s, e) => s + e.value, 0) || 1;
  return (
    <View style={{ gap: 8 }}>
      {entries.map((e, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: e.color }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: Colors.text, fontWeight: '600' }}>{e.label}</Text>
            <Text style={{ fontSize: 10, color: Colors.textDim }}>{Math.round(e.value / total * 100)}%</Text>
          </View>
          <Text style={{ fontSize: 14, fontWeight: '800', color: e.color }}>{e.value}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Profile Modal ─────────────────────────────────────────────────────────────
function ProfileModal({ visible, onClose, onLogout }: { visible: boolean; onClose: () => void; onLogout: () => void }) {
  const [email, setEmail]   = useState('');
  const [url, setUrl]       = useState('');

  useEffect(() => {
    if (visible) {
      SecureStore.getItemAsync('thynk_backend_url').then(v => setUrl(v ?? ''));
      SecureStore.getItemAsync('thynk_admin_email').then(v => setEmail(v ?? 'Admin'));
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={profileStyles.root}>
        <View style={profileStyles.header}>
          <Text style={profileStyles.title}>Profile</Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Ionicons name="close" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.xl }}>
          {/* Avatar */}
          <View style={profileStyles.avatarSection}>
            <View style={profileStyles.avatar}>
              <Text style={profileStyles.avatarText}>
                {(email?.[0] ?? 'A').toUpperCase()}
              </Text>
            </View>
            <Text style={profileStyles.emailText}>{email || 'Admin'}</Text>
            <Text style={profileStyles.roleText}>Administrator</Text>
          </View>

          <SectionHeader title="Account" />
          <Card>
            <RowItem label="Email" value={email || '—'} />
            <RowItem label="Backend URL" value={url || '—'} />
            <RowItem label="Role" value="Admin" />
          </Card>

          <SectionHeader title="App" />
          <Card>
            <RowItem label="Version" value="1.0.0" />
            <RowItem label="Platform" value="Android" />
          </Card>

          {/* Logout button */}
          <TouchableOpacity style={profileStyles.logoutBtn} onPress={onLogout}>
            <Ionicons name="log-out-outline" size={18} color="#fff" />
            <Text style={profileStyles.logoutTxt}>Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const profileStyles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: Colors.bg },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  title:         { fontSize: 18, fontWeight: '800', color: Colors.text },
  avatarSection: { alignItems: 'center', paddingVertical: Spacing.xl },
  avatar:        { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.primaryBg, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.md, borderWidth: 2, borderColor: Colors.primary },
  avatarText:    { fontSize: 32, fontWeight: '800', color: Colors.primary },
  emailText:     { fontSize: 16, fontWeight: '700', color: Colors.text },
  roleText:      { fontSize: 13, color: Colors.textMuted, marginTop: 4 },
  logoutBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.danger, borderRadius: Radius.md, paddingVertical: 14, marginTop: Spacing.xl },
  logoutTxt:     { color: '#fff', fontSize: 16, fontWeight: '700' },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const router = useRouter();
  const [allRows, setAllRows]       = useState<AdminRow[]>([]);
  const [schools, setSchools]       = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeline, setTimeline]     = useState<TimelineDays>(-2);
  const [section, setSection]       = useState<'overview' | 'schools' | 'classes' | 'payment' | 'trends'>('overview');
  const [showProfile, setShowProfile] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [rR, sR] = await Promise.all([
        authFetch('/api/admin/registrations?limit=2000'),
        authFetch('/api/admin/schools'),
      ]);
      if (rR.ok) { const d = await rR.json(); setAllRows(d.rows ?? d ?? []); }
      if (sR.ok) { const d = await sR.json(); setSchools(d.schools ?? d ?? []); }
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, []);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const rows     = useMemo(() => filterByTimeline(allRows, timeline), [allRows, timeline]);
  const paidRows = useMemo(() => rows.filter(r => r.payment_status === 'paid'), [rows]);

  const totalRev  = useMemo(() => paidRows.reduce((a, r) => a + (r.final_amount ?? 0), 0), [paidRows]);
  const totalDisc = useMemo(() => rows.reduce((a, r) => a + (r.discount_amount ?? 0), 0), [rows]);
  const convRate  = rows.length ? Math.round(paidRows.length / rows.length * 100) : 0;
  const avgTxn    = paidRows.length ? Math.round(totalRev / paidRows.length) : 0;

  const totalSchools   = schools.length;
  const activeSchools  = schools.filter(s => s.is_active !== false).length;
  const pendingSchools = schools.filter(s => s.status === 'pending').length;

  const schoolStats = useMemo(() => {
    const map: Record<string, { name: string; count: number; revenue: number }> = {};
    for (const r of paidRows) {
      if (!map[r.school_code]) map[r.school_code] = { name: r.school_name, count: 0, revenue: 0 };
      map[r.school_code].count++;
      map[r.school_code].revenue += r.final_amount ?? 0;
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [paidRows]);

  const classStats = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    for (const r of paidRows) {
      const g = r.class_grade ?? 'Unknown';
      if (!map[g]) map[g] = { count: 0, revenue: 0 };
      map[g].count++;
      map[g].revenue += r.final_amount ?? 0;
    }
    return Object.entries(map).sort((a, b) => b[1].count - a[1].count);
  }, [paidRows]);
  const maxClassCount = classStats[0]?.[1].count ?? 1;

  const genderStats = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of paidRows) {
      const g = (r.gender ?? 'Unknown').charAt(0).toUpperCase() + (r.gender ?? 'Unknown').slice(1);
      map[g] = (map[g] ?? 0) + 1;
    }
    return Object.entries(map).map(([label, value], i) => ({ label, value, color: Colors.palette[i % Colors.palette.length] }));
  }, [paidRows]);

  const gatewayStats = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of paidRows) { const g = r.gateway ?? 'unknown'; map[g] = (map[g] ?? 0) + 1; }
    return Object.entries(map).map(([label, value], i) => ({ label, value, color: Colors.palette[i % Colors.palette.length] }));
  }, [paidRows]);

  const dailyTrend = useMemo(() => {
    const buckets: Record<string, number> = {};
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      buckets[d.toISOString().slice(0, 10)] = 0;
    }
    for (const r of paidRows) {
      const d = r.paid_at?.slice(0, 10) ?? r.created_at?.slice(0, 10);
      if (d && d in buckets) buckets[d]++;
    }
    return Object.entries(buckets).map(([date, value]) => ({ label: date.slice(5), value }));
  }, [paidRows]);

  const cityStats = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    for (const r of paidRows) {
      const c = r.city ?? 'Unknown';
      if (!map[c]) map[c] = { count: 0, revenue: 0 };
      map[c].count++;
      map[c].revenue += r.final_amount ?? 0;
    }
    return Object.entries(map).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
  }, [paidRows]);
  const maxCityCount = cityStats[0]?.[1].count ?? 1;

  async function handleLogout() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          await SecureStore.deleteItemAsync('thynk_admin_token');
          await SecureStore.deleteItemAsync('thynk_backend_url');
          await SecureStore.deleteItemAsync('thynk_admin_email');
          setShowProfile(false);
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  const SECTIONS = ['overview', 'schools', 'classes', 'payment', 'trends'] as const;

  return (
    <SafeAreaView style={styles.root}>

      {/* Header with profile icon */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.headerTitle}>Reports</Text>
          <Text style={styles.headerSub}>{rows.length} registrations</Text>
        </View>
        <TouchableOpacity style={styles.profileBtn} onPress={() => setShowProfile(true)}>
          <Ionicons name="person-circle-outline" size={32} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Everything scrollable below header */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={Colors.primary}
            />
          }
        >
          {/* Timeline chips — inside scroll */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: Spacing.sm }} contentContainerStyle={{ gap: 8 }}>
            {TIMELINES.map(t => (
              <TouchableOpacity
                key={t.days}
                style={[styles.chip, timeline === t.days && styles.chipActive]}
                onPress={() => setTimeline(t.days as TimelineDays)}
              >
                <Text style={[styles.chipText, timeline === t.days && styles.chipTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Section tabs — inside scroll */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: Spacing.lg }} contentContainerStyle={{ gap: 8 }}>
            {SECTIONS.map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.sectionTab, section === s && styles.sectionTabActive]}
                onPress={() => setSection(s)}
              >
                <Text style={[styles.sectionTabText, section === s && styles.sectionTabTextActive]}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* ── OVERVIEW ── */}
          {section === 'overview' && (
            <>
              <View style={styles.kpiGrid}>
                <KpiCard icon="💰" label="Revenue" value={fmtAmount(totalRev)} color={Colors.accent} highlight />
                <KpiCard icon="✅" label="Paid" value={paidRows.length} sub={`${convRate}% conv.`} color={Colors.success} highlight />
              </View>
              <View style={styles.kpiGrid}>
                <KpiCard icon="📋" label="Total Regs" value={rows.length} color={Colors.primary} />
                <KpiCard icon="📊" label="Avg Txn" value={fmtAmount(avgTxn)} color={Colors.info} />
              </View>
              <View style={styles.kpiGrid}>
                <KpiCard icon="🏫" label="Schools" value={totalSchools} sub={`${activeSchools} active`} color={Colors.primary} />
                <KpiCard icon="⏳" label="Pending" value={pendingSchools} color={Colors.warning} />
              </View>
              <View style={styles.kpiGrid}>
                <KpiCard icon="🏷️" label="Discounts" value={`− ${fmtAmount(totalDisc)}`} color={Colors.warning} />
                <KpiCard icon="🌍" label="Countries" value={new Set(schools.map(s => s.country ?? 'India')).size} color={Colors.info} />
              </View>
              <SectionHeader title="Daily Paid (14 days)" />
              <View style={styles.chartCard}>
                <BarChart data={dailyTrend} color={Colors.primary} />
              </View>
            </>
          )}

          {/* ── SCHOOLS ── */}
          {section === 'schools' && (
            <>
              <SectionHeader title="Top Schools by Revenue" note={`${schoolStats.length} schools`} />
              <View style={styles.rankCard}>
                {schoolStats.slice(0, 10).map((s, i) => (
                  <RankRow key={s.name} rank={i} name={s.name} primary={fmtAmount(s.revenue)} secondary={`${s.count} paid`} />
                ))}
                {schoolStats.length === 0 && <Text style={styles.empty}>No data yet</Text>}
              </View>
              <SectionHeader title="Top Cities" />
              <View style={styles.rankCard}>
                {cityStats.map(([city, stats], i) => (
                  <View key={city} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.text }}>{city}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.accent }}>{fmtAmount(stats.revenue)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <InlineBar value={stats.count} max={maxCityCount} color={Colors.palette[i % Colors.palette.length]} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.text, width: 24 }}>{stats.count}</Text>
                    </View>
                  </View>
                ))}
                {cityStats.length === 0 && <Text style={styles.empty}>No data yet</Text>}
              </View>
            </>
          )}

          {/* ── CLASSES ── */}
          {section === 'classes' && (
            <>
              <SectionHeader title="Grade Breakdown" note={`${classStats.length} grades`} />
              <View style={styles.rankCard}>
                {classStats.map(([grade, stats]) => (
                  <StatRow key={grade} label={grade} count={stats.count} revenue={stats.revenue} maxCount={maxClassCount} />
                ))}
                {classStats.length === 0 && <Text style={styles.empty}>No data yet</Text>}
              </View>
              <SectionHeader title="Gender Split" />
              <View style={styles.rankCard}>
                <PieLegend entries={genderStats} />
                {genderStats.length === 0 && <Text style={styles.empty}>No data yet</Text>}
              </View>
            </>
          )}

          {/* ── PAYMENT ── */}
          {section === 'payment' && (
            <>
              <SectionHeader title="Gateway Split" />
              <View style={styles.rankCard}>
                <PieLegend entries={gatewayStats} />
                {gatewayStats.length === 0 && <Text style={styles.empty}>No paid transactions yet</Text>}
              </View>
              <SectionHeader title="Payment Status" />
              <View style={styles.rankCard}>
                {([
                  { label: 'Paid',      val: paidRows.length,                                          color: Colors.success },
                  { label: 'Pending',   val: rows.filter(r => r.payment_status === 'pending').length,  color: Colors.warning },
                  { label: 'Failed',    val: rows.filter(r => r.payment_status === 'failed').length,   color: Colors.danger },
                  { label: 'Initiated', val: rows.filter(r => r.payment_status === 'initiated').length,color: Colors.info },
                ] as { label: string; val: number; color: string }[]).map(s => (
                  <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
                    <Text style={{ width: 70, fontSize: 12, fontWeight: '600', color: Colors.text }}>{s.label}</Text>
                    <InlineBar value={s.val} max={rows.length || 1} color={s.color} />
                    <Text style={{ fontSize: 14, fontWeight: '800', color: s.color, width: 32, textAlign: 'right' }}>{s.val}</Text>
                    <Text style={{ fontSize: 11, color: Colors.textDim, width: 32, textAlign: 'right' }}>{rows.length ? Math.round(s.val / rows.length * 100) : 0}%</Text>
                  </View>
                ))}
              </View>
              <SectionHeader title="Revenue Metrics" />
              <View style={styles.rankCard}>
                {([
                  { label: 'Gross Revenue',   value: fmtAmount(totalRev) },
                  { label: 'Total Discounts', value: `− ${fmtAmount(totalDisc)}` },
                  { label: 'Net Revenue',     value: fmtAmount(totalRev - totalDisc) },
                  { label: 'Avg Transaction', value: fmtAmount(avgTxn) },
                  { label: 'Conversion Rate', value: `${convRate}%` },
                  { label: 'Paid Count',      value: String(paidRows.length) },
                ] as { label: string; value: string }[]).map(m => (
                  <View key={m.label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder }}>
                    <Text style={{ fontSize: 13, color: Colors.textMuted }}>{m.label}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.text }}>{m.value}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* ── TRENDS ── */}
          {section === 'trends' && (
            <>
              <SectionHeader title="Daily Total Registrations" note="last 14 days" />
              <View style={styles.chartCard}>
                <BarChart
                  data={(() => {
                    const buckets: Record<string, number> = {};
                    const today = new Date();
                    for (let i = 13; i >= 0; i--) {
                      const d = new Date(today); d.setDate(d.getDate() - i);
                      buckets[d.toISOString().slice(0, 10)] = 0;
                    }
                    for (const r of rows) {
                      const d = r.created_at?.slice(0, 10);
                      if (d && d in buckets) buckets[d]++;
                    }
                    return Object.entries(buckets).map(([date, value]) => ({ label: date.slice(5), value }));
                  })()}
                  color={Colors.textMuted}
                />
              </View>
              <SectionHeader title="Daily Paid" note="last 14 days" />
              <View style={styles.chartCard}>
                <BarChart data={dailyTrend} color={Colors.accent} />
              </View>
              <SectionHeader title="Program Breakdown" />
              <View style={styles.rankCard}>
                {(() => {
                  const map: Record<string, { count: number; revenue: number }> = {};
                  for (const r of paidRows) {
                    const p = r.program_name ?? 'Unknown';
                    if (!map[p]) map[p] = { count: 0, revenue: 0 };
                    map[p].count++;
                    map[p].revenue += r.final_amount ?? 0;
                  }
                  const entries = Object.entries(map).sort((a, b) => b[1].count - a[1].count);
                  if (!entries.length) return <Text style={styles.empty}>No data</Text>;
                  const maxC = entries[0][1].count;
                  return entries.map(([prog, stats]) => (
                    <StatRow key={prog} label={prog} count={stats.count} revenue={stats.revenue} maxCount={maxC} />
                  ));
                })()}
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* Profile Modal */}
      <ProfileModal
        visible={showProfile}
        onClose={() => setShowProfile(false)}
        onLogout={handleLogout}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content:{ padding: Spacing.xl, paddingTop: Spacing.sm, paddingBottom: 40 },

  headerRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.text, letterSpacing: -0.3 },
  headerSub:   { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  profileBtn:  { padding: 4 },

  chip:            { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.round, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder },
  chipActive:      { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  chipText:        { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  chipTextActive:  { color: Colors.primary },

  sectionTab:          { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.round },
  sectionTabActive:    { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder },
  sectionTabText:      { fontSize: 13, fontWeight: '600', color: Colors.textDim },
  sectionTabTextActive:{ color: Colors.text },

  kpiGrid:   { flexDirection: 'row', gap: 10, marginBottom: 10 },
  chartCard: { backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.lg, marginBottom: Spacing.md },
  rankCard:  { backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.md, marginBottom: Spacing.md },
  empty:     { textAlign: 'center', color: Colors.textDim, paddingVertical: 20, fontSize: 13 },
});
