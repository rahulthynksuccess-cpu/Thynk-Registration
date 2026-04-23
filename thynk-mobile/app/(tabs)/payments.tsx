import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  RefreshControl, Modal, ScrollView, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authFetch, AdminRow, fmtDate, fmtDateTime, fmtAmount, timeAgo } from '@/lib/api';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { Badge, Card, KpiCard, RowItem, SectionHeader, ScreenHeader, EmptyState, InlineBar } from '@/components/ui';

type PayFilter = 'all' | 'paid' | 'failed' | 'pending' | 'initiated';
type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'primary' | 'muted';

const GATEWAY_COLORS: Record<string, string> = {
  razorpay: Colors.primary,
  cashfree: Colors.accent,
  easebuzz: Colors.warning,
  paypal:   '#0070ba',
};

const GATEWAY_ICONS: Record<string, string> = {
  razorpay: '💙',
  cashfree: '💚',
  easebuzz: '💛',
  paypal:   '💜',
};

function payVariant(status?: string | null): BadgeVariant {
  if (status === 'paid')      return 'success';
  if (status === 'failed')    return 'danger';
  if (status === 'initiated') return 'info';
  if (status === 'pending')   return 'warning';
  if (status === 'cancelled') return 'muted';
  return 'muted';
}

function PaymentCard({ row, onPress }: { row: AdminRow; onPress: () => void }) {
  const gwColor = GATEWAY_COLORS[row.gateway ?? ''] ?? Colors.textDim;
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.studentName} numberOfLines={1}>{row.student_name}</Text>
          <Text style={styles.schoolName} numberOfLines={1}>{row.school_name}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.amount, row.payment_status === 'paid' ? styles.amountPaid : styles.amountDim]}>
            {fmtAmount(row.final_amount)}
          </Text>
          <Badge label={row.payment_status ?? row.reg_status ?? '—'} variant={payVariant(row.payment_status ?? row.reg_status)} />
        </View>
      </View>

      <View style={styles.cardMeta}>
        {row.gateway && (
          <View style={[styles.gwBadge, { borderColor: `${gwColor}40`, backgroundColor: `${gwColor}12` }]}>
            <Text style={{ fontSize: 11 }}>{GATEWAY_ICONS[row.gateway] ?? '💳'}</Text>
            <Text style={[styles.gwText, { color: gwColor }]}>{row.gateway}</Text>
          </View>
        )}
        {row.gateway_txn_id && (
          <Text style={styles.txnId} numberOfLines={1}>{row.gateway_txn_id}</Text>
        )}
        <Text style={styles.timeText}>{timeAgo(row.paid_at ?? row.created_at)}</Text>
      </View>

      {row.discount_code && (
        <View style={styles.discountRow}>
          <Ionicons name="pricetag-outline" size={11} color={Colors.warning} />
          <Text style={styles.discountTxt}>{row.discount_code} (−{fmtAmount(row.discount_amount)})</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function PaymentDetailModal({ row, visible, onClose }: {
  row: AdminRow | null; visible: boolean; onClose: () => void;
}) {
  if (!row) return null;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={modalStyles.root}>
        <View style={modalStyles.header}>
          <View style={{ flex: 1 }}>
            <Text style={modalStyles.title}>{row.student_name}</Text>
            <Text style={modalStyles.subtitle}>{row.school_name}</Text>
          </View>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
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
            <RowItem label="Name"     value={row.student_name} />
            <RowItem label="Grade"    value={row.class_grade} />
            <RowItem label="Phone"    value={row.contact_phone} />
            <RowItem label="Email"    value={row.contact_email} />
            <RowItem label="Program"  value={row.program_name} />
            <RowItem label="Reg ID"   value={row.id} mono />
          </Card>

          <SectionHeader title="School" />
          <Card>
            <RowItem label="School Name" value={row.school_name} />
            <RowItem label="School Code" value={row.school_code} mono />
            <RowItem label="Created At"  value={fmtDateTime(row.created_at)} />
          </Card>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function PaymentsScreen() {
  const [rows, setRows]           = useState<AdminRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]       = useState('');
  const [filter, setFilter]       = useState<PayFilter>('all');
  const [selected, setSelected]   = useState<AdminRow | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await authFetch('/api/admin/registrations?limit=500');
      if (res.ok) {
        const data = await res.json();
        setRows(data.rows ?? data ?? []);
      }
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      const q = search.toLowerCase();
      const matchSearch = !search ||
        r.student_name?.toLowerCase().includes(q) ||
        r.gateway_txn_id?.toLowerCase().includes(q) ||
        r.school_name?.toLowerCase().includes(q) ||
        r.discount_code?.toLowerCase().includes(q);
      if (!matchSearch) return false;
      if (filter === 'all')       return true;
      if (filter === 'paid')      return r.payment_status === 'paid';
      if (filter === 'failed')    return r.payment_status === 'failed';
      if (filter === 'pending')   return r.payment_status === 'pending';
      if (filter === 'initiated') return r.payment_status === 'initiated';
      return true;
    });
  }, [rows, search, filter]);

  // ── KPIs ──
  const paidRows   = useMemo(() => rows.filter(r => r.payment_status === 'paid'), [rows]);
  const totalRev   = useMemo(() => paidRows.reduce((a, r) => a + (r.final_amount ?? 0), 0), [paidRows]);
  const totalDisc  = useMemo(() => rows.reduce((a, r) => a + (r.discount_amount ?? 0), 0), [rows]);
  const convRate   = rows.length ? Math.round(paidRows.length / rows.length * 100) : 0;

  // ── Gateway breakdown ──
  const gatewayStats = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    for (const r of paidRows) {
      const gw = r.gateway ?? 'unknown';
      if (!map[gw]) map[gw] = { count: 0, revenue: 0 };
      map[gw].count++;
      map[gw].revenue += r.final_amount ?? 0;
    }
    return Object.entries(map).sort((a, b) => b[1].revenue - a[1].revenue);
  }, [paidRows]);
  const maxGwRev = gatewayStats[0]?.[1].revenue ?? 1;

  const counts = useMemo(() => ({
    all:       rows.length,
    paid:      paidRows.length,
    failed:    rows.filter(r => r.payment_status === 'failed').length,
    pending:   rows.filter(r => r.payment_status === 'pending').length,
    initiated: rows.filter(r => r.payment_status === 'initiated').length,
  }), [rows, paidRows]);

  return (
    <SafeAreaView style={styles.root}>
      <ScreenHeader title="Payments" subtitle={`${counts.paid} paid · ${convRate}% conversion`} />

      {/* KPI Row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: Spacing.sm }} contentContainerStyle={{ paddingHorizontal: Spacing.xl, gap: 10 }}>
        <KpiCard icon="💰" label="Total Revenue" value={fmtAmount(totalRev)} color={Colors.accent} highlight />
        <KpiCard icon="✅" label="Paid" value={counts.paid} sub={`${convRate}% conv.`} color={Colors.success} />
        <KpiCard icon="⏳" label="Pending" value={counts.pending} color={Colors.warning} />
        <KpiCard icon="❌" label="Failed" value={counts.failed} color={Colors.danger} />
        <KpiCard icon="🏷️" label="Discounts Used" value={`− ${fmtAmount(totalDisc)}`} color={Colors.warning} />
      </ScrollView>

      {/* Gateway breakdown */}
      {gatewayStats.length > 0 && (
        <View style={styles.gwSection}>
          {gatewayStats.map(([gw, stats]) => {
            const color = GATEWAY_COLORS[gw] ?? Colors.textDim;
            return (
              <View key={gw} style={styles.gwRow}>
                <Text style={{ fontSize: 13 }}>{GATEWAY_ICONS[gw] ?? '💳'}</Text>
                <Text style={[styles.gwName, { color }]}>{gw}</Text>
                <InlineBar value={stats.revenue} max={maxGwRev} color={color} />
                <Text style={[styles.gwRev, { color }]}>{fmtAmount(stats.revenue)}</Text>
                <Text style={styles.gwCount}>{stats.count} txns</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={16} color={Colors.textDim} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, txn ID, school..."
          placeholderTextColor={Colors.textDim}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Colors.textDim} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: Spacing.sm }} contentContainerStyle={{ paddingHorizontal: Spacing.xl, gap: 8 }}>
        {(['all', 'paid', 'pending', 'initiated', 'failed'] as PayFilter[]).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, filter === f && styles.chipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f] ?? 0})
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={r => r.id}
          contentContainerStyle={{ padding: Spacing.lg, paddingTop: Spacing.sm }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={<EmptyState icon="💳" message="No payments found" />}
          renderItem={({ item }) => (
            <PaymentCard row={item} onPress={() => setSelected(item)} />
          )}
        />
      )}

      <PaymentDetailModal row={selected} visible={!!selected} onClose={() => setSelected(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  gwSection: { marginHorizontal: Spacing.xl, marginBottom: Spacing.md, backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.md },
  gwRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  gwName:    { width: 70, fontSize: 12, fontWeight: '700' },
  gwRev:     { fontSize: 12, fontWeight: '800', width: 72, textAlign: 'right' },
  gwCount:   { fontSize: 10, color: Colors.textDim, width: 50, textAlign: 'right' },
  gwBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.round, borderWidth: 1 },
  gwText:    { fontSize: 11, fontWeight: '700' },

  searchRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.xl, marginBottom: Spacing.md, backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder, paddingHorizontal: Spacing.md },
  searchInput: { flex: 1, height: 42, color: Colors.text, fontSize: 14 },

  chip:          { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.round, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder },
  chipActive:    { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  chipText:      { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  chipTextActive:{ color: Colors.primary },

  card:        { backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.lg, marginBottom: Spacing.md },
  cardTop:     { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.sm },
  studentName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  schoolName:  { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  amount:      { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  amountPaid:  { color: Colors.accent },
  amountDim:   { color: Colors.textMuted },

  cardMeta:   { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  txnId:      { fontSize: 10, color: Colors.textDim, fontFamily: 'monospace', flex: 1 },
  timeText:   { fontSize: 11, color: Colors.textDim },

  discountRow:{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  discountTxt:{ fontSize: 11, color: Colors.warning },
});

const modalStyles = StyleSheet.create({
  root:     { flex: 1, backgroundColor: Colors.bg },
  header:   { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  title:    { fontSize: 18, fontWeight: '800', color: Colors.text },
  subtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 3 },
});
