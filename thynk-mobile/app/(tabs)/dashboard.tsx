import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
  RefreshControl, ActivityIndicator, Modal, Alert,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { authFetch, AdminRow, fmtAmount } from '@/lib/api';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { KpiCard, SectionHeader, Card, RowItem, InlineBar } from '@/components/ui';

type TimelineDays = 0 | 5 | 10 | 30 | -1 | -2;
type Section = 'overview' | 'schools' | 'classes' | 'payment' | 'trends';

const TIMELINES = [
  { label: 'Today', days: 0  },
  { label: '5D',    days: 5  },
  { label: '10D',   days: 10 },
  { label: '30D',   days: 30 },
  { label: 'Year',  days: -1 },
  { label: 'All',   days: -2 },
] as const;

function filterByDays(rows: AdminRow[], days: TimelineDays): AdminRow[] {
  if (days === -2) return rows;
  if (days === -1) { const y = new Date().getFullYear(); return rows.filter(r => new Date(r.created_at).getFullYear() === y); }
  if (days === 0)  { const t = new Date().toISOString().slice(0, 10); return rows.filter(r => r.created_at?.slice(0, 10) === t); }
  const cut = new Date(Date.now() - days * 86400000);
  return rows.filter(r => new Date(r.created_at) >= cut);
}

// ── Mini bar chart ─────────────────────────────────────────────────────────────
function BarChart({ data, color = Colors.primary }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 70 }}>
      {data.slice(0, 14).map((d, i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
          <Text style={{ fontSize: 8, color: Colors.textMuted }}>{d.value > 0 ? d.value : ''}</Text>
          <View style={{ width: '100%', height: Math.max(3, Math.round(d.value / max * 50)), backgroundColor: color, borderRadius: 2 }} />
          <Text style={{ fontSize: 7, color: Colors.textDim }}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Rank Row ───────────────────────────────────────────────────────────────────
const MEDALS = ['🥇', '🥈', '🥉'];
function RankRow({ rank, name, value, sub }: { rank: number; name: string; value: string; sub?: string }) {
  const top = rank < 3;
  return (
    <View style={[rr.row, top && { backgroundColor: `${Colors.warning}08` }]}>
      <Text style={[rr.rank, { color: top ? Colors.warning : Colors.textDim }]}>{top ? MEDALS[rank] : rank + 1}</Text>
      <View style={{ flex: 1 }}>
        <Text style={rr.name} numberOfLines={1}>{name}</Text>
        {sub && <Text style={rr.sub}>{sub}</Text>}
      </View>
      <Text style={rr.val}>{value}</Text>
    </View>
  );
}
const rr = StyleSheet.create({
  row:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8 },
  rank: { width: 22, textAlign: 'center', fontSize: 14, fontWeight: '800' },
  name: { fontSize: 12, fontWeight: '600', color: Colors.text },
  sub:  { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  val:  { fontSize: 13, fontWeight: '800', color: Colors.warning },
});

// ── Stat row ───────────────────────────────────────────────────────────────────
function StatRow({ label, count, revenue, maxCount }: { label: string; count: number; revenue: number; maxCount: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder }}>
      <Text style={{ width: 90, fontSize: 11, color: Colors.textMuted }} numberOfLines={1}>{label}</Text>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <InlineBar value={count} max={maxCount} color={Colors.primary} />
        <Text style={{ width: 24, fontSize: 12, fontWeight: '700', color: Colors.text, textAlign: 'right' }}>{count}</Text>
      </View>
      <Text style={{ width: 72, fontSize: 11, fontWeight: '700', color: Colors.accent, textAlign: 'right' }}>{fmtAmount(revenue)}</Text>
    </View>
  );
}

// ── Pie legend ─────────────────────────────────────────────────────────────────
function PieLegend({ entries }: { entries: { label: string; value: number; color: string }[] }) {
  const total = entries.reduce((s, e) => s + e.value, 0) || 1;
  return (
    <View style={{ gap: 10 }}>
      {entries.map((e, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: e.color }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, color: Colors.text, fontWeight: '600' }}>{e.label}</Text>
            <Text style={{ fontSize: 10, color: Colors.textDim }}>{Math.round(e.value / total * 100)}%</Text>
          </View>
          <Text style={{ fontSize: 15, fontWeight: '800', color: e.color }}>{e.value}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Profile modal ──────────────────────────────────────────────────────────────
function ProfileModal({ visible, onClose, onLogout }: { visible: boolean; onClose: () => void; onLogout: () => void }) {
  const [email, setEmail] = useState('');
  const [url, setUrl]     = useState('');

  useEffect(() => {
    if (visible) {
      SecureStore.getItemAsync('thynk_admin_email').then(v => setEmail(v ?? 'Admin'));
      SecureStore.getItemAsync('thynk_backend_url').then(v => setUrl(v ?? ''));
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: Colors.bg }}>
        <View style={pm.header}>
          <Text style={pm.title}>Profile</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.textMuted} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl }}>
          <View style={pm.avatarWrap}>
            <View style={pm.avatar}><Text style={pm.avatarTxt}>{(email?.[0] ?? 'A').toUpperCase()}</Text></View>
            <Text style={pm.emailTxt}>{email}</Text>
            <Text style={pm.roleTxt}>Administrator</Text>
          </View>
          <SectionHeader title="Account" />
          <Card>
            <RowItem label="Email"       value={email} />
            <RowItem label="Backend URL" value={url} />
            <RowItem label="Role"        value="Admin" />
          </Card>
          <SectionHeader title="App" />
          <Card>
            <RowItem label="Version"  value="1.0.0" />
            <RowItem label="Platform" value="Android" />
          </Card>
          <TouchableOpacity style={pm.logoutBtn} onPress={onLogout}>
            <Ionicons name="log-out-outline" size={18} color="#fff" />
            <Text style={pm.logoutTxt}>Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}
const pm = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  title:      { fontSize: 18, fontWeight: '800', color: Colors.text },
  avatarWrap: { alignItems: 'center', paddingVertical: Spacing.xl },
  avatar:     { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.primaryBg, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.md, borderWidth: 2, borderColor: Colors.primary },
  avatarTxt:  { fontSize: 32, fontWeight: '800', color: Colors.primary },
  emailTxt:   { fontSize: 16, fontWeight: '700', color: Colors.text },
  roleTxt:    { fontSize: 13, color: Colors.textMuted, marginTop: 4 },
  logoutBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.danger, borderRadius: Radius.md, paddingVertical: 14, marginTop: Spacing.xl },
  logoutTxt:  { color: '#fff', fontSize: 16, fontWeight: '700' },
});

// ── Main ───────────────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const router = useRouter();
  const [allRows, setAllRows]       = useState<AdminRow[]>([]);
  const [schools, setSchools]       = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeline, setTimeline]     = useState<TimelineDays>(-2);
  const [section, setSection]       = useState<Section>('overview');
  const [showProfile, setShowProfile] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Fetch both in parallel — use same endpoint as Students/Payments tab
      const [rRes, sRes] = await Promise.all([
        authFetch('/api/admin/registrations?limit=2000'),
        authFetch('/api/admin/schools'),
      ]);
      if (rRes.ok) {
        const d = await rRes.json();
        const arr = d.rows ?? d ?? [];
        setAllRows(Array.isArray(arr) ? arr : []);
      }
      if (sRes.ok) {
        const d = await sRes.json();
        const arr = d.schools ?? d ?? [];
        setSchools(Array.isArray(arr) ? arr : []);
      }
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, []);

  // Derived
  const rows     = useMemo(() => filterByDays(allRows, timeline), [allRows, timeline]);
  const paidRows = useMemo(() => rows.filter(r => r.payment_status === 'paid'), [rows]);
  const totalRev  = useMemo(() => paidRows.reduce((a, r) => a + (r.final_amount ?? 0), 0), [paidRows]);
  const totalDisc = useMemo(() => rows.reduce((a, r)  => a + (r.discount_amount ?? 0), 0), [rows]);
  const convRate  = rows.length ? Math.round(paidRows.length / rows.length * 100) : 0;
  const avgTxn    = paidRows.length ? Math.round(totalRev / paidRows.length) : 0;

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

  const genderStats = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of paidRows) {
      const g = (r.gender ?? 'Unknown');
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

  async function handleLogout() {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        await SecureStore.deleteItemAsync('thynk_admin_token');
        await SecureStore.deleteItemAsync('thynk_backend_url');
        await SecureStore.deleteItemAsync('thynk_admin_email');
        await SecureStore.deleteItemAsync('thynk_refresh_token');
        setShowProfile(false);
        router.replace('/(auth)/login');
      }},
    ]);
  }

  const SECTIONS: Section[] = ['overview', 'schools', 'classes', 'payment', 'trends'];

  return (
    <SafeAreaView style={styles.root}>

      {/* ── Header: profile icon on LEFT ── */}
      <View style={styles.hdr}>
        <TouchableOpacity style={styles.profileBtn} onPress={() => setShowProfile(true)}>
          <Ionicons name="person-circle-outline" size={34} color={Colors.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: Spacing.md }}>
          <Text style={styles.hdrTitle}>Reports</Text>
          <Text style={styles.hdrSub}>{allRows.length} total · {paidRows.length} paid</Text>
        </View>
        <TouchableOpacity onPress={() => load(true)} style={styles.refreshBtn}>
          <Ionicons name="refresh-outline" size={20} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={Colors.primary} />}
        >
          {/* Timeline chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: Spacing.sm }}>
            {TIMELINES.map(t => (
              <TouchableOpacity key={t.days} style={[styles.chip, timeline === t.days && styles.chipOn]} onPress={() => setTimeline(t.days as TimelineDays)}>
                <Text style={[styles.chipTxt, timeline === t.days && styles.chipTxtOn]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Section tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: Spacing.lg }}>
            {SECTIONS.map(s => (
              <TouchableOpacity key={s} style={[styles.secTab, section === s && styles.secTabOn]} onPress={() => setSection(s)}>
                <Text style={[styles.secTxt, section === s && styles.secTxtOn]}>{s.charAt(0).toUpperCase() + s.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* ── OVERVIEW ── */}
          {section === 'overview' && <>
            <View style={styles.kpiRow}>
              <KpiCard icon="💰" label="Revenue"    value={fmtAmount(totalRev)}       color={Colors.accent}   highlight />
              <KpiCard icon="✅" label="Paid"        value={paidRows.length}            color={Colors.success}  highlight sub={`${convRate}% conv.`} />
            </View>
            <View style={styles.kpiRow}>
              <KpiCard icon="📋" label="Total Regs" value={rows.length}                color={Colors.primary} />
              <KpiCard icon="📊" label="Avg Txn"    value={fmtAmount(avgTxn)}          color={Colors.info} />
            </View>
            <View style={styles.kpiRow}>
              <KpiCard icon="🏫" label="Schools"    value={schools.length}             color={Colors.primary}  sub={`${schools.filter(s => s.is_active !== false).length} active`} />
              <KpiCard icon="⏳" label="Pending"    value={schools.filter(s => s.status === 'pending').length} color={Colors.warning} />
            </View>
            <View style={styles.kpiRow}>
              <KpiCard icon="🏷️" label="Discounts"  value={`− ${fmtAmount(totalDisc)}`} color={Colors.warning} />
              <KpiCard icon="🌍" label="Countries"  value={new Set(schools.map(s => s.country ?? 'India')).size} color={Colors.info} />
            </View>
            <SectionHeader title="Daily Paid (14 days)" />
            <View style={styles.chartCard}><BarChart data={dailyTrend} color={Colors.primary} /></View>
          </>}

          {/* ── SCHOOLS ── */}
          {section === 'schools' && <>
            <SectionHeader title="Top Schools by Revenue" note={`${schoolStats.length} schools`} />
            <View style={styles.rankCard}>
              {schoolStats.slice(0, 10).map((s, i) => <RankRow key={s.name} rank={i} name={s.name} value={fmtAmount(s.revenue)} sub={`${s.count} paid`} />)}
              {schoolStats.length === 0 && <Text style={styles.empty}>No data yet</Text>}
            </View>
            <SectionHeader title="Top Cities" />
            <View style={styles.rankCard}>
              {cityStats.map(([city, s], i) => (
                <View key={city} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.text }}>{city}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.accent }}>{fmtAmount(s.revenue)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <InlineBar value={s.count} max={cityStats[0]?.[1].count ?? 1} color={Colors.palette[i % Colors.palette.length]} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.text, width: 24 }}>{s.count}</Text>
                  </View>
                </View>
              ))}
              {cityStats.length === 0 && <Text style={styles.empty}>No data yet</Text>}
            </View>
          </>}

          {/* ── CLASSES ── */}
          {section === 'classes' && <>
            <SectionHeader title="Grade Breakdown" note={`${classStats.length} grades`} />
            <View style={styles.rankCard}>
              {classStats.map(([g, s]) => <StatRow key={g} label={g} count={s.count} revenue={s.revenue} maxCount={classStats[0]?.[1].count ?? 1} />)}
              {classStats.length === 0 && <Text style={styles.empty}>No data yet</Text>}
            </View>
            <SectionHeader title="Gender Split" />
            <View style={styles.rankCard}>
              <PieLegend entries={genderStats} />
              {genderStats.length === 0 && <Text style={styles.empty}>No data yet</Text>}
            </View>
          </>}

          {/* ── PAYMENT ── */}
          {section === 'payment' && <>
            <SectionHeader title="Gateway Split" />
            <View style={styles.rankCard}>
              <PieLegend entries={gatewayStats} />
              {gatewayStats.length === 0 && <Text style={styles.empty}>No paid transactions yet</Text>}
            </View>
            <SectionHeader title="Payment Status" />
            <View style={styles.rankCard}>
              {([
                { label: 'Paid',      val: paidRows.length,                                           color: Colors.success },
                { label: 'Pending',   val: rows.filter(r => r.payment_status === 'pending').length,   color: Colors.warning },
                { label: 'Failed',    val: rows.filter(r => r.payment_status === 'failed').length,    color: Colors.danger  },
                { label: 'Initiated', val: rows.filter(r => r.payment_status === 'initiated').length, color: Colors.info    },
              ] as {label:string;val:number;color:string}[]).map(s => (
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
              ] as {label:string;value:string}[]).map(m => (
                <View key={m.label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder }}>
                  <Text style={{ fontSize: 13, color: Colors.textMuted }}>{m.label}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.text }}>{m.value}</Text>
                </View>
              ))}
            </View>
          </>}

          {/* ── TRENDS ── */}
          {section === 'trends' && <>
            <SectionHeader title="Daily Total Registrations" note="14 days" />
            <View style={styles.chartCard}>
              <BarChart color={Colors.textMuted} data={(() => {
                const b: Record<string, number> = {};
                const today = new Date();
                for (let i = 13; i >= 0; i--) { const d = new Date(today); d.setDate(d.getDate()-i); b[d.toISOString().slice(0,10)] = 0; }
                for (const r of rows) { const d = r.created_at?.slice(0,10); if (d && d in b) b[d]++; }
                return Object.entries(b).map(([date, value]) => ({ label: date.slice(5), value }));
              })()} />
            </View>
            <SectionHeader title="Daily Paid" note="14 days" />
            <View style={styles.chartCard}><BarChart data={dailyTrend} color={Colors.accent} /></View>
            <SectionHeader title="Program Breakdown" />
            <View style={styles.rankCard}>
              {(() => {
                const map: Record<string, { count: number; revenue: number }> = {};
                for (const r of paidRows) { const p = r.program_name ?? 'Unknown'; if (!map[p]) map[p] = { count: 0, revenue: 0 }; map[p].count++; map[p].revenue += r.final_amount ?? 0; }
                const entries = Object.entries(map).sort((a, b) => b[1].count - a[1].count);
                if (!entries.length) return <Text style={styles.empty}>No data</Text>;
                const maxC = entries[0][1].count;
                return entries.map(([prog, s]) => <StatRow key={prog} label={prog} count={s.count} revenue={s.revenue} maxCount={maxC} />);
              })()}
            </View>
          </>}

        </ScrollView>
      )}

      <ProfileModal visible={showProfile} onClose={() => setShowProfile(false)} onLogout={handleLogout} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Colors.bg },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: Spacing.xl, paddingTop: Spacing.sm, paddingBottom: 40 },

  hdr:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  profileBtn: { padding: 2 },
  refreshBtn: { padding: 6 },
  hdrTitle:   { fontSize: 20, fontWeight: '800', color: Colors.text, letterSpacing: -0.3 },
  hdrSub:     { fontSize: 12, color: Colors.textMuted, marginTop: 1 },

  chip:    { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.round, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder },
  chipOn:  { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  chipTxt: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  chipTxtOn:{ color: Colors.primary },

  secTab:   { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.round },
  secTabOn: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder },
  secTxt:   { fontSize: 13, fontWeight: '600', color: Colors.textDim },
  secTxtOn: { color: Colors.text },

  kpiRow:    { flexDirection: 'row', gap: 10, marginBottom: 10 },
  chartCard: { backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.lg, marginBottom: Spacing.md },
  rankCard:  { backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.md, marginBottom: Spacing.md },
  empty:     { textAlign: 'center', color: Colors.textDim, paddingVertical: 20, fontSize: 13 },
});
