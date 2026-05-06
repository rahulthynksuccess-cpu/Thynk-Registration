import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  RefreshControl, Modal, ScrollView, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authFetch, AdminRow, fmtDateTime, fmtAmount, timeAgo } from '@/lib/api';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { Badge, Card, RowItem, SectionHeader, EmptyState, KpiCard, InlineBar } from '@/components/ui';

type PayFilter   = 'all' | 'paid' | 'failed' | 'pending' | 'initiated';
type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'primary' | 'muted';

const GW_COLORS: Record<string, string> = { razorpay: Colors.primary, cashfree: Colors.accent, easebuzz: Colors.warning, paypal: '#0070ba' };
const GW_ICONS:  Record<string, string> = { razorpay: '💙', cashfree: '💚', easebuzz: '💛', paypal: '💜' };

function payVariant(s?: string | null): BadgeVariant {
  if (s === 'paid')      return 'success';
  if (s === 'failed')    return 'danger';
  if (s === 'initiated') return 'info';
  if (s === 'pending')   return 'warning';
  return 'muted';
}

function PayCard({ row, onPress }: { row: AdminRow; onPress: () => void }) {
  const gwColor = GW_COLORS[row.gateway ?? ''] ?? Colors.textDim;
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{row.student_name}</Text>
          <Text style={styles.sub}  numberOfLines={1}>{row.school_name}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.amount, row.payment_status === 'paid' ? styles.amtPaid : styles.amtDim]}>{fmtAmount(row.final_amount)}</Text>
          <Badge label={row.payment_status ?? row.reg_status ?? '—'} variant={payVariant(row.payment_status ?? row.reg_status)} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        {row.gateway && (
          <View style={[styles.gwBadge, { borderColor: `${gwColor}40`, backgroundColor: `${gwColor}12` }]}>
            <Text style={{ fontSize: 11 }}>{GW_ICONS[row.gateway] ?? '💳'}</Text>
            <Text style={[{ fontSize: 11, fontWeight: '700' }, { color: gwColor }]}>{row.gateway}</Text>
          </View>
        )}
        {row.gateway_txn_id && <Text style={styles.txnId} numberOfLines={1}>{row.gateway_txn_id}</Text>}
        <Text style={styles.timeText}>{timeAgo(row.paid_at ?? row.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );
}

function PayModal({ row, visible, onClose }: { row: AdminRow | null; visible: boolean; onClose: () => void }) {
  if (!row) return null;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: Colors.bg }}>
        <View style={styles.modalHdr}>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle}>{row.student_name}</Text>
            <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 3 }}>{row.school_name}</Text>
          </View>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.textMuted} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl }}>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: Spacing.lg }}>
            <Badge label={row.payment_status ?? '—'} variant={payVariant(row.payment_status)} />
            <Badge label={row.reg_status} variant={payVariant(row.reg_status)} />
          </View>
          <SectionHeader title="Payment Details" />
          <Card>
            <RowItem label="Base Amount"   value={fmtAmount(row.base_amount)} />
            <RowItem label="Discount"      value={row.discount_amount > 0 ? `− ${fmtAmount(row.discount_amount)}` : 'None'} />
            <RowItem label="Final Amount"  value={fmtAmount(row.final_amount)} />
            <RowItem label="Discount Code" value={row.discount_code} mono />
            <RowItem label="Gateway"       value={row.gateway ?? '—'} />
            <RowItem label="Txn ID"        value={row.gateway_txn_id} mono />
            <RowItem label="Paid At"       value={fmtDateTime(row.paid_at)} />
          </Card>
          <SectionHeader title="Student" />
          <Card>
            <RowItem label="Name"    value={row.student_name} />
            <RowItem label="Grade"   value={row.class_grade} />
            <RowItem label="Phone"   value={row.contact_phone} />
            <RowItem label="Email"   value={row.contact_email} />
            <RowItem label="Program" value={row.program_name} />
            <RowItem label="Reg ID"  value={row.id} mono />
          </Card>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function PaymentsScreen() {
  const [rows, setRows]             = useState<AdminRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState<PayFilter>('all');
  const [selected, setSelected]     = useState<AdminRow | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await authFetch('/api/admin/registrations?limit=500');
      if (res.ok) { const d = await res.json(); setRows(d.rows ?? d ?? []); }
    } catch {}
    setLoading(false); setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, []);

  const paidRows = useMemo(() => rows.filter(r => r.payment_status === 'paid'), [rows]);
  const totalRev = useMemo(() => paidRows.reduce((a, r) => a + (r.final_amount ?? 0), 0), [paidRows]);
  const convRate = rows.length ? Math.round(paidRows.length / rows.length * 100) : 0;

  const gwStats = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    for (const r of paidRows) {
      const g = r.gateway ?? 'unknown';
      if (!map[g]) map[g] = { count: 0, revenue: 0 };
      map[g].count++;
      map[g].revenue += r.final_amount ?? 0;
    }
    return Object.entries(map).sort((a, b) => b[1].revenue - a[1].revenue);
  }, [paidRows]);
  const maxGwRev = gwStats[0]?.[1].revenue ?? 1;

  const counts = useMemo(() => ({
    all:       rows.length,
    paid:      paidRows.length,
    failed:    rows.filter(r => r.payment_status === 'failed').length,
    pending:   rows.filter(r => r.payment_status === 'pending').length,
    initiated: rows.filter(r => r.payment_status === 'initiated').length,
  }), [rows, paidRows]);

  const filtered = useMemo(() => rows.filter(r => {
    const q = search.toLowerCase();
    const ok = !search || r.student_name?.toLowerCase().includes(q) || r.gateway_txn_id?.toLowerCase().includes(q) || r.school_name?.toLowerCase().includes(q);
    if (!ok) return false;
    if (filter === 'all')       return true;
    if (filter === 'paid')      return r.payment_status === 'paid';
    if (filter === 'failed')    return r.payment_status === 'failed';
    if (filter === 'pending')   return r.payment_status === 'pending';
    if (filter === 'initiated') return r.payment_status === 'initiated';
    return true;
  }), [rows, search, filter]);

  const Header = () => (
    <View style={{ paddingBottom: 4 }}>
      <View style={{ marginBottom: Spacing.md }}>
        <Text style={styles.pageTitle}>Payments</Text>
        <Text style={styles.pageSub}>{counts.paid} paid · {convRate}% conversion</Text>
      </View>
      {/* KPI strip */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, marginBottom: Spacing.md }}>
        <KpiCard icon="💰" label="Revenue"  value={fmtAmount(totalRev)} color={Colors.accent} highlight />
        <KpiCard icon="✅" label="Paid"     value={counts.paid}      sub={`${convRate}% conv.`} color={Colors.success} />
        <KpiCard icon="⏳" label="Pending"  value={counts.pending}   color={Colors.warning} />
        <KpiCard icon="❌" label="Failed"   value={counts.failed}    color={Colors.danger} />
      </ScrollView>
      {/* Gateway breakdown */}
      {gwStats.length > 0 && (
        <View style={styles.gwCard}>
          {gwStats.map(([gw, s]) => {
            const color = GW_COLORS[gw] ?? Colors.textDim;
            return (
              <View key={gw} style={styles.gwRow}>
                <Text style={{ fontSize: 13 }}>{GW_ICONS[gw] ?? '💳'}</Text>
                <Text style={[styles.gwName, { color }]}>{gw}</Text>
                <InlineBar value={s.revenue} max={maxGwRev} color={color} />
                <Text style={[styles.gwRev, { color }]}>{fmtAmount(s.revenue)}</Text>
                <Text style={styles.gwCnt}>{s.count} txns</Text>
              </View>
            );
          })}
        </View>
      )}
      {/* Search */}
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={16} color={Colors.textDim} style={{ marginRight: 8 }} />
        <TextInput style={styles.searchInput} placeholder="Search by name, txn ID, school..." placeholderTextColor={Colors.textDim} value={search} onChangeText={setSearch} />
        {search.length > 0 && <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color={Colors.textDim} /></TouchableOpacity>}
      </View>
      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
        {(['all','paid','pending','initiated','failed'] as PayFilter[]).map(f => (
          <TouchableOpacity key={f} style={[styles.chip, filter === f && styles.chipOn]} onPress={() => setFilter(f)}>
            <Text style={[styles.chipTxt, filter === f && styles.chipTxtOn]}>{f.charAt(0).toUpperCase()+f.slice(1)} ({counts[f] ?? 0})</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
      {loading
        ? <View style={{ flex: 1, padding: Spacing.xl }}><Header /><ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} /></View>
        : <FlatList
            data={filtered}
            keyExtractor={r => r.id}
            contentContainerStyle={{ padding: Spacing.lg, paddingTop: Spacing.sm }}
            ListHeaderComponent={<Header />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={Colors.primary} />}
            ListEmptyComponent={<EmptyState icon="💳" message="No payments found" />}
            renderItem={({ item }) => <PayCard row={item} onPress={() => setSelected(item)} />}
          />
      }
      <PayModal row={selected} visible={!!selected} onClose={() => setSelected(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pageTitle:  { fontSize: 22, fontWeight: '800', color: Colors.text, letterSpacing: -0.3 },
  pageSub:    { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  searchBox:  { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  searchInput:{ flex: 1, height: 42, color: Colors.text, fontSize: 14 },
  chip:    { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.round, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder },
  chipOn:  { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  chipTxt: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  chipTxtOn:{ color: Colors.primary },
  gwCard:  { backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.md, marginBottom: Spacing.md },
  gwRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  gwName:  { width: 68, fontSize: 12, fontWeight: '700' },
  gwRev:   { fontSize: 12, fontWeight: '800', width: 70, textAlign: 'right' },
  gwCnt:   { fontSize: 10, color: Colors.textDim, width: 48, textAlign: 'right' },
  gwBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.round, borderWidth: 1 },
  card:    { backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.lg, marginBottom: Spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.sm },
  name:    { fontSize: 14, fontWeight: '700', color: Colors.text },
  sub:     { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  amount:  { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  amtPaid: { color: Colors.accent },
  amtDim:  { color: Colors.textMuted },
  txnId:   { fontSize: 10, color: Colors.textDim, fontFamily: 'monospace', flex: 1 },
  timeText:{ fontSize: 11, color: Colors.textDim },
  modalHdr:  { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  modalTitle:{ fontSize: 18, fontWeight: '800', color: Colors.text },
});
