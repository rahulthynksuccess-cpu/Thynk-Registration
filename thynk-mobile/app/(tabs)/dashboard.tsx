import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { authFetch, AdminRow, fmtAmount } from '@/lib/api';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { KpiCard, SectionHeader, ScreenHeader, InlineBar } from '@/components/ui';
import { useRouter } from 'expo-router';
import { clearToken } from '@/lib/api';

// ── Timeline filter ────────────────────────────────────────────────────────────
const TIMELINES = [
  { label: 'Today',    days: 0  },
  { label: '5D',       days: 5  },
  { label: '10D',      days: 10 },
  { label: '30D',      days: 30 },
  { label: 'Year',     days: -1 },
  { label: 'All',      days: -2 },
] as const;

type TimelineDays = 0 | 5 | 10 | 30 | -1 | -2;

function filterByTimeline(rows: AdminRow[], days: TimelineDays): AdminRow[] {
  if (days === -2) return rows;
  if (days === -1) { const y = new Date().getFullYear(); return rows.filter(r => new Date(r.created_at).getFullYear() === y); }
  if (days === 0)  { const t = new Date().toISOString().slice(0, 10); return rows.filter(r => r.created_at?.slice(0, 10) === t); }
  const cut = new Date(Date.now() - days * 86400000);
  return rows.filter(r => new Date(r.created_at) >= cut);
}

// ── Mini bar chart (pure RN, no lib needed) ────────────────────────────────────
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
  root: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingBottom: 4 },
  col:  { flex: 1, alignItems: 'center', gap: 3 },
  bar:  { width: '100%', borderRadius: 3, minHeight: 4 },
  val:  { fontSize: 9, color: Colors.textMuted, fontWeight: '700' },
  lbl:  { fontSize: 9, color: Colors.textDim, maxWidth: 36, textAlign: 'center' },
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
  row:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10 },
  rank:    { width: 24, textAlign: 'center', fontSize: 15, fontWeight: '800' },
  name:    { fontSize: 12, fontWeight: '600', color: Colors.text },
  sec:     { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  primary: { fontSize: 14, fontWeight: '800', color: Colors.warning },
});

// ── Stat table row ────────────────────────────────────────────────────────────
function StatRow({ label, count, revenue, maxCount, maxRevenue }: {
  label: string; count: number; revenue: number; maxCount: number; maxRevenue: number;
}) {
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
  row:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  label:   { width: 100, fontSize: 11, color: Colors.textMuted },
  barCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  cnt:     { width: 28, fontSize: 12, fontWeight: '700', color: Colors.text, textAlign: 'right' },
  rev:     { width: 80, fontSize: 11, fontWeight: '700', color: Colors.accent, textAlign: 'right' },
});

// ── Donut-style legend ─────────────────────────────────────────────────────────
function PieLegend({ entries }: { entries: { label: string; value: number; color: string }[] }) {
  const total = entries.reduce((s, e) => s + e.value, 0) || 1;
  return (
    <View style={pieStyles.root}>
      {entries.map((e, i) => (
        <View key={i} style={pieStyles.item}>
          <View style={[pieStyles.dot, { backgroundColor: e.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={pieStyles.label}>{e.label}</Text>
            <Text style={pieStyles.pct}>{Math.round(e.value / total * 100)}%</Text>
          </View>
          <Text style={[pieStyles.val, { color: e.color }]}>{e.value}</Text>
        </View>
      ))}
    </View>
  );
}

const pieStyles = StyleSheet.create({
  root:  { gap: 8 },
  item:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot:   { width: 10, height: 10, borderRadius: 5 },
  label: { fontSize: 12, color: Colors.text, fontWeight: '600' },
  pct:   { fontSize: 10, color: Colors.textDim },
  val:   { fontSize: 14, fontWeight: '800' },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const router = useRouter();
  const [allRows, setAllRows]     = useState<AdminRow[]>([]);
  const [schools, setSchools]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeline, setTimeline]   = useState<TimelineDays>(-2);
  const [section, setSection]     = useState<'overview' | 'schools' | 'classes' | 'payment' | 'trends'>('overview');

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

  const totalRev   = useMemo(() => paidRows.reduce((a, r) => a + (r.final_amount ?? 0), 0), [paidRows]);
  const totalDisc  = useMemo(() => rows.reduce((a, r) => a + (r.discount_amount ?? 0), 0), [rows]);
  const convRate   = rows.length ? Math.round(paidRows.length / rows.length * 100) : 0;
  const avgTxn     = paidRows.length ? Math.round(totalRev / paidRows.length) : 0;

  const totalSchools   = schools.length;
  const activeSchools  = schools.filter(s => s.is_active !== false).length;
  const pendingSchools = schools.filter(s => s.status === 'pending').length;

  // ── School rankings ────────────────────────────────────────────────────────
  const schoolStats = useMemo(() => {
    const map: Record<string, { name: string; count: number; revenue: number }> = {};
    for (const r of paidRows) {
      if (!map[r.school_code]) map[r.school_code] = { name: r.school_name, count: 0, revenue: 0 };
      map[r.school_code].count++;
      map[r.school_code].revenue += r.final_amount ?? 0;
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [paidRows]);

  // ── Class breakdown ────────────────────────────────────────────────────────
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

  // ── Gender breakdown ───────────────────────────────────────────────────────
  const genderStats = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of paidRows) {
      const g = (r.gender ?? 'Unknown').charAt(0).toUpperCase() + (r.gender ?? 'Unknown').slice(1);
      map[g] = (map[g] ?? 0) + 1;
    }
    return Object.entries(map).map(([label, value], i) => ({
      label, value, color: Colors.palette[i % Colors.palette.length],
    }));
  }, [paidRows]);

  // ── Gateway breakdown ──────────────────────────────────────────────────────
  const gatewayStats = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of paidRows) { const g = r.gateway ?? 'unknown'; map[g] = (map[g] ?? 0) + 1; }
    return Object.entries(map).map(([label, value], i) => ({
      label, value, color: Colors.palette[i % Colors.palette.length],
    }));
  }, [paidRows]);

  // ── Daily trend (last 14 days) ─────────────────────────────────────────────
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
    return Object.entries(buckets).map(([date, value]) => ({
      label: date.slice(5), value,
    }));
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

  const SECTIONS = ['overview', 'schools', 'classes', 'payment', 'trends'] as const;

  async function handleLogout() {
    await clearToken();
    router.replace('/(auth)/login');
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScreenHeader
        title="Reports"
        subtitle={`${rows.length} registrations`}
        right={
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutTxt}>Sign Out</Text>
          </TouchableOpacity>
        }
      />

      {/* Timeline chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: Spacing.sm }} contentContainerStyle={{ paddingHorizontal: Spacing.xl, gap: 8 }}>
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

      {/* Section tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: Spacing.md }} contentContainerStyle={{ paddingHorizontal: Spacing.xl, gap: 8 }}>
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
          {/* ── OVERVIEW ─────────────────────────────── */}
          {section === 'overview' && (
            <>
              {/* KPI grid */}
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
                <KpiCard icon="🏷️" label="Discount Saved" value={fmtAmount(totalDisc)} color={Colors.warning} />
                <KpiCard icon="🌍" label="Countries" value={new Set(schools.map(s => s.country ?? 'India')).size} color={Colors.info} />
              </View>

              {/* Trends chart */}
              <SectionHeader title="Daily Paid Registrations" note="14 days" />
              <View style={styles.chartCard}>
                <BarChart data={dailyTrend} color={Colors.primary} />
              </View>
            </>
          )}

          {/* ── SCHOOLS ──────────────────────────────── */}
          {section === 'schools' && (
            <>
              <SectionHeader title="Top Schools by Revenue" note={`${schoolStats.length} schools`} />
              <View style={styles.rankCard}>
                {schoolStats.slice(0, 10).map((s, i) => (
                  <RankRow
                    key={s.name}
                    rank={i}
                    name={s.name}
                    primary={fmtAmount(s.revenue)}
                    secondary={`${s.count} paid`}
                  />
                ))}
                {schoolStats.length === 0 && <Text style={styles.empty}>No data yet</Text>}
              </View>

              <SectionHeader title="Top Cities" note="by paid registrations" />
              <View style={styles.rankCard}>
                {cityStats.map(([city, stats], i) => (
                  <View key={city} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={styles.cityName}>{city}</Text>
                      <Text style={styles.cityAmt}>{fmtAmount(stats.revenue)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <InlineBar value={stats.count} max={maxCityCount} color={Colors.palette[i % Colors.palette.length]} />
                      <Text style={styles.cityCnt}>{stats.count}</Text>
                    </View>
                  </View>
                ))}
                {cityStats.length === 0 && <Text style={styles.empty}>No data yet</Text>}
              </View>
            </>
          )}

          {/* ── CLASSES ──────────────────────────────── */}
          {section === 'classes' && (
            <>
              <SectionHeader title="Class/Grade Breakdown" note={`${classStats.length} grades`} />
              <View style={styles.rankCard}>
                <View style={{ flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder, marginBottom: 4 }}>
                  <Text style={{ width: 100, fontSize: 10, fontWeight: '700', color: Colors.textDim, textTransform: 'uppercase' }}>Grade</Text>
                  <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: Colors.textDim, textTransform: 'uppercase' }}>Count</Text>
                  <Text style={{ width: 80, fontSize: 10, fontWeight: '700', color: Colors.textDim, textTransform: 'uppercase', textAlign: 'right' }}>Revenue</Text>
                </View>
                {classStats.map(([grade, stats]) => (
                  <StatRow
                    key={grade}
                    label={grade}
                    count={stats.count}
                    revenue={stats.revenue}
                    maxCount={maxClassCount}
                    maxRevenue={classStats[0]?.[1].revenue ?? 1}
                  />
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

          {/* ── PAYMENT ──────────────────────────────── */}
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
                  <View key={s.label} style={styles.statStatusRow}>
                    <View style={[styles.statusDot, { backgroundColor: s.color }]} />
                    <Text style={styles.statusLabel}>{s.label}</Text>
                    <InlineBar value={s.val} max={rows.length || 1} color={s.color} />
                    <Text style={[styles.statusVal, { color: s.color }]}>{s.val}</Text>
                    <Text style={styles.statusPct}>{rows.length ? Math.round(s.val / rows.length * 100) : 0}%</Text>
                  </View>
                ))}
              </View>

              <SectionHeader title="Revenue Metrics" />
              <View style={styles.rankCard}>
                {([
                  { label: 'Gross Revenue',    value: fmtAmount(totalRev) },
                  { label: 'Total Discounts',  value: fmtAmount(totalDisc) },
                  { label: 'Net Revenue',      value: fmtAmount(totalRev - totalDisc) },
                  { label: 'Avg Transaction',  value: fmtAmount(avgTxn) },
                  { label: 'Conversion Rate',  value: `${convRate}%` },
                  { label: 'Paid Count',       value: String(paidRows.length) },
                ] as { label: string; value: string }[]).map(m => (
                  <View key={m.label} style={styles.metricRow}>
                    <Text style={styles.metricLabel}>{m.label}</Text>
                    <Text style={styles.metricValue}>{m.value}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* ── TRENDS ───────────────────────────────── */}
          {section === 'trends' && (
            <>
              <SectionHeader title="Daily Registrations (Total)" note="last 14 days" />
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
                    <StatRow key={prog} label={prog} count={stats.count} revenue={stats.revenue} maxCount={maxC} maxRevenue={entries[0][1].revenue} />
                  ));
                })()}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Colors.bg },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: Spacing.xl, paddingTop: Spacing.sm, paddingBottom: 40 },

  chip:           { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.round, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder },
  chipActive:     { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  chipText:       { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  chipTextActive: { color: Colors.primary },

  sectionTab:         { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.round, backgroundColor: 'transparent' },
  sectionTabActive:   { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder },
  sectionTabText:     { fontSize: 13, fontWeight: '600', color: Colors.textDim },
  sectionTabTextActive:{ color: Colors.text },

  kpiGrid: { flexDirection: 'row', gap: 10, marginBottom: 10 },

  chartCard: { backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.lg, marginBottom: Spacing.md },
  rankCard:  { backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.md, marginBottom: Spacing.md },

  empty: { textAlign: 'center', color: Colors.textDim, paddingVertical: 20, fontSize: 13 },

  cityName: { fontSize: 13, fontWeight: '600', color: Colors.text },
  cityAmt:  { fontSize: 12, fontWeight: '700', color: Colors.accent },
  cityCnt:  { fontSize: 11, fontWeight: '700', color: Colors.text, width: 24 },

  statStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  statusDot:     { width: 8, height: 8, borderRadius: 4 },
  statusLabel:   { width: 70, fontSize: 12, fontWeight: '600', color: Colors.text },
  statusVal:     { fontSize: 14, fontWeight: '800', width: 32, textAlign: 'right' },
  statusPct:     { fontSize: 11, color: Colors.textDim, width: 32, textAlign: 'right' },

  metricRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  metricLabel:  { fontSize: 13, color: Colors.textMuted },
  metricValue:  { fontSize: 13, fontWeight: '800', color: Colors.text },

  logoutBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.round, borderWidth: 1, borderColor: Colors.cardBorder },
  logoutTxt: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
});
