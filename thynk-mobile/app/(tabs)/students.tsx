import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  RefreshControl, Modal, ScrollView, SafeAreaView, ActivityIndicator, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authFetch, AdminRow, fmtDate, fmtDateTime, fmtAmount, timeAgo } from '@/lib/api';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { Badge, Card, RowItem, SectionHeader, ScreenHeader, EmptyState } from '@/components/ui';

type StatusFilter = 'all' | 'paid' | 'pending' | 'failed' | 'initiated';
type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'primary' | 'muted';

function paymentVariant(status?: string | null): BadgeVariant {
  if (status === 'paid')      return 'success';
  if (status === 'failed')    return 'danger';
  if (status === 'initiated') return 'info';
  if (status === 'pending')   return 'warning';
  return 'muted';
}

function StudentCard({ row, onPress }: { row: AdminRow; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{row.student_name?.[0]?.toUpperCase() ?? 'S'}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.name} numberOfLines={1}>{row.student_name}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {row.class_grade} · {row.gender} · {row.parent_school}
          </Text>
        </View>
        <Badge label={row.payment_status ?? row.reg_status} variant={paymentVariant(row.payment_status ?? row.reg_status)} />
      </View>

      <View style={styles.metaRow}>
        <View style={styles.meta}>
          <Ionicons name="school-outline" size={11} color={Colors.textDim} />
          <Text style={styles.metaTxt} numberOfLines={1}>{row.school_name}</Text>
        </View>
        <View style={styles.meta}>
          <Ionicons name="book-outline" size={11} color={Colors.textDim} />
          <Text style={styles.metaTxt} numberOfLines={1}>{row.program_name}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.amount}>{fmtAmount(row.final_amount)}</Text>
        <Text style={styles.time}>{timeAgo(row.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );
}

function StudentDetailModal({ row, visible, onClose }: {
  row: AdminRow | null; visible: boolean; onClose: () => void;
}) {
  if (!row) return null;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={modalStyles.root}>
        <View style={modalStyles.header}>
          <View style={{ flex: 1 }}>
            <Text style={modalStyles.title}>{row.student_name}</Text>
            <Text style={modalStyles.subtitle}>{row.school_name} · {row.program_name}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={modalStyles.content}>
          {/* Status badges */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: Spacing.md }}>
            <Badge label={`Reg: ${row.reg_status}`} variant={paymentVariant(row.reg_status)} />
            {row.payment_status && (
              <Badge label={`Pay: ${row.payment_status}`} variant={paymentVariant(row.payment_status)} />
            )}
          </View>

          <SectionHeader title="Student Details" />
          <Card>
            <RowItem label="Student Name"   value={row.student_name} />
            <RowItem label="Class / Grade"  value={row.class_grade} />
            <RowItem label="Gender"         value={row.gender} />
            <RowItem label="Parent School"  value={row.parent_school} />
            <RowItem label="City"           value={row.city} />
          </Card>

          <SectionHeader title="Parent / Guardian" />
          <Card>
            <RowItem label="Parent Name"  value={row.parent_name} />
            <RowItem label="Phone"        value={row.contact_phone} />
            <RowItem label="Email"        value={row.contact_email} />
          </Card>

          {/* Quick actions */}
          <View style={modalStyles.actionRow}>
            {row.contact_phone && (
              <TouchableOpacity
                style={modalStyles.actionBtn}
                onPress={() => Linking.openURL(`tel:${row.contact_phone}`)}
              >
                <Ionicons name="call-outline" size={18} color={Colors.accent} />
                <Text style={[modalStyles.actionTxt, { color: Colors.accent }]}>Call</Text>
              </TouchableOpacity>
            )}
            {row.contact_email && (
              <TouchableOpacity
                style={modalStyles.actionBtn}
                onPress={() => Linking.openURL(`mailto:${row.contact_email}`)}
              >
                <Ionicons name="mail-outline" size={18} color={Colors.info} />
                <Text style={[modalStyles.actionTxt, { color: Colors.info }]}>Email</Text>
              </TouchableOpacity>
            )}
            {row.contact_phone && (
              <TouchableOpacity
                style={modalStyles.actionBtn}
                onPress={() => Linking.openURL(`https://wa.me/${row.contact_phone.replace(/\D/g, '')}`)}
              >
                <Ionicons name="logo-whatsapp" size={18} color={Colors.accent} />
                <Text style={[modalStyles.actionTxt, { color: Colors.accent }]}>WhatsApp</Text>
              </TouchableOpacity>
            )}
          </View>

          <SectionHeader title="Payment" />
          <Card>
            <RowItem label="Program"        value={row.program_name} />
            <RowItem label="Base Amount"    value={fmtAmount(row.base_amount)} />
            <RowItem label="Discount"       value={row.discount_amount > 0 ? `- ${fmtAmount(row.discount_amount)}` : 'None'} />
            <RowItem label="Final Amount"   value={fmtAmount(row.final_amount)} />
            {row.discount_code && <RowItem label="Discount Code" value={row.discount_code} mono />}
            <RowItem label="Gateway"        value={row.gateway ?? '—'} />
            <RowItem label="Txn ID"         value={row.gateway_txn_id} mono />
            <RowItem label="Paid At"        value={fmtDateTime(row.paid_at)} />
          </Card>

          <SectionHeader title="Registration" />
          <Card>
            <RowItem label="ID"         value={row.id} mono />
            <RowItem label="School"     value={row.school_name} />
            <RowItem label="School Code" value={row.school_code} mono />
            <RowItem label="Registered" value={fmtDateTime(row.created_at)} />
          </Card>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function StudentsScreen() {
  const [rows, setRows]         = useState<AdminRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<AdminRow | null>(null);

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
        r.parent_name?.toLowerCase().includes(q) ||
        r.contact_phone?.includes(q) ||
        r.contact_email?.toLowerCase().includes(q) ||
        r.school_name?.toLowerCase().includes(q) ||
        r.class_grade?.toLowerCase().includes(q) ||
        r.city?.toLowerCase().includes(q);
      if (!matchSearch) return false;
      if (filter === 'all')       return true;
      if (filter === 'paid')      return r.payment_status === 'paid';
      if (filter === 'pending')   return r.payment_status === 'pending' || r.reg_status === 'pending';
      if (filter === 'failed')    return r.payment_status === 'failed';
      if (filter === 'initiated') return r.payment_status === 'initiated';
      return true;
    });
  }, [rows, search, filter]);

  const counts = useMemo(() => ({
    all:       rows.length,
    paid:      rows.filter(r => r.payment_status === 'paid').length,
    pending:   rows.filter(r => r.payment_status === 'pending' || (!r.payment_status && r.reg_status === 'pending')).length,
    failed:    rows.filter(r => r.payment_status === 'failed').length,
    initiated: rows.filter(r => r.payment_status === 'initiated').length,
  }), [rows]);

  return (
    <SafeAreaView style={styles.root}>
      <ScreenHeader
        title="Students"
        subtitle={`${counts.all} total · ${counts.paid} paid`}
      />

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={16} color={Colors.textDim} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, phone, school..."
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
        {(['all', 'paid', 'pending', 'initiated', 'failed'] as StatusFilter[]).map(f => (
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
          ListEmptyComponent={<EmptyState icon="👥" message="No students found" />}
          renderItem={({ item }) => (
            <StudentCard row={item} onPress={() => setSelected(item)} />
          )}
        />
      )}

      <StudentDetailModal row={selected} visible={!!selected} onClose={() => setSelected(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  searchRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.xl, marginBottom: Spacing.md, backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder, paddingHorizontal: Spacing.md },
  searchInput: { flex: 1, height: 42, color: Colors.text, fontSize: 14 },

  chip:          { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.round, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder },
  chipActive:    { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  chipText:      { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  chipTextActive:{ color: Colors.primary },

  card: { backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.lg, marginBottom: Spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  avatar:     { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(79,70,229,0.15)', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800', color: Colors.primary },
  name:       { fontSize: 14, fontWeight: '700', color: Colors.text },
  sub:        { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  metaRow:    { flexDirection: 'row', gap: 12, marginBottom: Spacing.sm },
  meta:       { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  metaTxt:    { fontSize: 11, color: Colors.textDim },
  footer:     { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: Colors.cardBorder, paddingTop: Spacing.sm },
  amount:     { fontSize: 15, fontWeight: '800', color: Colors.accent },
  time:       { fontSize: 11, color: Colors.textDim },
});

const modalStyles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: Colors.bg },
  header:    { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  title:     { fontSize: 18, fontWeight: '800', color: Colors.text },
  subtitle:  { fontSize: 12, color: Colors.textMuted, marginTop: 3 },
  closeBtn:  { padding: 4, marginTop: 2 },
  content:   { padding: Spacing.xl },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: Spacing.sm },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder, paddingVertical: 12 },
  actionTxt: { fontSize: 13, fontWeight: '700' },
});
