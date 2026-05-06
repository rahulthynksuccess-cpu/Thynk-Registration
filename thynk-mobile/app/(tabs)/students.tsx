import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  RefreshControl, Modal, ScrollView, SafeAreaView, ActivityIndicator, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authFetch, AdminRow, fmtDateTime, fmtAmount, timeAgo } from '@/lib/api';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { Badge, Card, RowItem, SectionHeader, EmptyState } from '@/components/ui';

type StatusFilter = 'all' | 'paid' | 'pending' | 'failed' | 'initiated';
type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'primary' | 'muted';

function payVariant(s?: string | null): BadgeVariant {
  if (s === 'paid')      return 'success';
  if (s === 'failed')    return 'danger';
  if (s === 'initiated') return 'info';
  if (s === 'pending')   return 'warning';
  return 'muted';
}

function StudentCard({ row, onPress }: { row: AdminRow; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardTop}>
        <View style={styles.avatar}><Text style={styles.avatarTxt}>{row.student_name?.[0]?.toUpperCase() ?? 'S'}</Text></View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.name} numberOfLines={1}>{row.student_name}</Text>
          <Text style={styles.sub}  numberOfLines={1}>{row.class_grade} · {row.gender} · {row.parent_school}</Text>
        </View>
        <Badge label={row.payment_status ?? row.reg_status} variant={payVariant(row.payment_status ?? row.reg_status)} />
      </View>
      <View style={styles.metaRow}>
        <View style={styles.meta}><Ionicons name="school-outline" size={11} color={Colors.textDim} /><Text style={styles.metaTxt} numberOfLines={1}>{row.school_name}</Text></View>
        <View style={styles.meta}><Ionicons name="book-outline"   size={11} color={Colors.textDim} /><Text style={styles.metaTxt} numberOfLines={1}>{row.program_name}</Text></View>
      </View>
      <View style={styles.footer}>
        <Text style={styles.amount}>{fmtAmount(row.final_amount)}</Text>
        <Text style={styles.time}>{timeAgo(row.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );
}

function StudentModal({ row, visible, onClose }: { row: AdminRow | null; visible: boolean; onClose: () => void }) {
  if (!row) return null;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: Colors.bg }}>
        <View style={styles.modalHdr}>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle}>{row.student_name}</Text>
            <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 3 }}>{row.school_name} · {row.program_name}</Text>
          </View>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.textMuted} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl }}>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: Spacing.md }}>
            <Badge label={`Reg: ${row.reg_status}`} variant={payVariant(row.reg_status)} />
            {row.payment_status && <Badge label={`Pay: ${row.payment_status}`} variant={payVariant(row.payment_status)} />}
          </View>
          <SectionHeader title="Student Details" />
          <Card>
            <RowItem label="Name"   value={row.student_name} />
            <RowItem label="Grade"  value={row.class_grade} />
            <RowItem label="Gender" value={row.gender} />
            <RowItem label="School" value={row.parent_school} />
            <RowItem label="City"   value={row.city} />
          </Card>
          <SectionHeader title="Parent / Guardian" />
          <Card>
            <RowItem label="Name"  value={row.parent_name} />
            <RowItem label="Phone" value={row.contact_phone} />
            <RowItem label="Email" value={row.contact_email} />
          </Card>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: Spacing.sm }}>
            {row.contact_phone && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => Linking.openURL(`tel:${row.contact_phone}`)}>
                <Ionicons name="call-outline" size={18} color={Colors.accent} /><Text style={[styles.actionTxt, { color: Colors.accent }]}>Call</Text>
              </TouchableOpacity>
            )}
            {row.contact_email && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => Linking.openURL(`mailto:${row.contact_email}`)}>
                <Ionicons name="mail-outline" size={18} color={Colors.info} /><Text style={[styles.actionTxt, { color: Colors.info }]}>Email</Text>
              </TouchableOpacity>
            )}
            {row.contact_phone && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => Linking.openURL(`https://wa.me/${row.contact_phone.replace(/\D/g, '')}`)}>
                <Ionicons name="logo-whatsapp" size={18} color={Colors.accent} /><Text style={[styles.actionTxt, { color: Colors.accent }]}>WhatsApp</Text>
              </TouchableOpacity>
            )}
          </View>
          <SectionHeader title="Payment" />
          <Card>
            <RowItem label="Program"      value={row.program_name} />
            <RowItem label="Base Amount"  value={fmtAmount(row.base_amount)} />
            <RowItem label="Discount"     value={row.discount_amount > 0 ? `- ${fmtAmount(row.discount_amount)}` : 'None'} />
            <RowItem label="Final Amount" value={fmtAmount(row.final_amount)} />
            <RowItem label="Discount Code" value={row.discount_code} mono />
            <RowItem label="Gateway"      value={row.gateway ?? '—'} />
            <RowItem label="Txn ID"       value={row.gateway_txn_id} mono />
            <RowItem label="Paid At"      value={fmtDateTime(row.paid_at)} />
          </Card>
          <SectionHeader title="Registration" />
          <Card>
            <RowItem label="ID"          value={row.id} mono />
            <RowItem label="School Code" value={row.school_code} mono />
            <RowItem label="Registered"  value={fmtDateTime(row.created_at)} />
          </Card>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function StudentsScreen() {
  const [rows, setRows]             = useState<AdminRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState<StatusFilter>('all');
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

  const counts = useMemo(() => ({
    all:       rows.length,
    paid:      rows.filter(r => r.payment_status === 'paid').length,
    pending:   rows.filter(r => r.payment_status === 'pending').length,
    failed:    rows.filter(r => r.payment_status === 'failed').length,
    initiated: rows.filter(r => r.payment_status === 'initiated').length,
  }), [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    const q = search.toLowerCase();
    const ok = !search || r.student_name?.toLowerCase().includes(q) || r.parent_name?.toLowerCase().includes(q) || r.contact_phone?.includes(q) || r.school_name?.toLowerCase().includes(q) || r.city?.toLowerCase().includes(q);
    if (!ok) return false;
    if (filter === 'all')       return true;
    if (filter === 'paid')      return r.payment_status === 'paid';
    if (filter === 'pending')   return r.payment_status === 'pending';
    if (filter === 'failed')    return r.payment_status === 'failed';
    if (filter === 'initiated') return r.payment_status === 'initiated';
    return true;
  }), [rows, search, filter]);

  const Header = () => (
    <View style={{ paddingBottom: 4 }}>
      <View style={{ marginBottom: Spacing.md }}>
        <Text style={styles.pageTitle}>Students</Text>
        <Text style={styles.pageSub}>{counts.all} total · {counts.paid} paid</Text>
      </View>
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={16} color={Colors.textDim} style={{ marginRight: 8 }} />
        <TextInput style={styles.searchInput} placeholder="Search by name, phone, school..." placeholderTextColor={Colors.textDim} value={search} onChangeText={setSearch} />
        {search.length > 0 && <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color={Colors.textDim} /></TouchableOpacity>}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
        {(['all','paid','pending','initiated','failed'] as StatusFilter[]).map(f => (
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
            ListEmptyComponent={<EmptyState icon="👥" message="No students found" />}
            renderItem={({ item }) => <StudentCard row={item} onPress={() => setSelected(item)} />}
          />
      }
      <StudentModal row={selected} visible={!!selected} onClose={() => setSelected(null)} />
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
  card:      { backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.lg, marginBottom: Spacing.md },
  cardTop:   { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  avatar:    { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primaryBg, justifyContent: 'center', alignItems: 'center' },
  avatarTxt: { fontSize: 16, fontWeight: '800', color: Colors.primary },
  name:      { fontSize: 14, fontWeight: '700', color: Colors.text },
  sub:       { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  metaRow:   { flexDirection: 'row', gap: 12, marginBottom: Spacing.sm },
  meta:      { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  metaTxt:   { fontSize: 11, color: Colors.textDim },
  footer:    { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: Colors.cardBorder, paddingTop: Spacing.sm },
  amount:    { fontSize: 15, fontWeight: '800', color: Colors.accent },
  time:      { fontSize: 11, color: Colors.textDim },
  modalHdr:  { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  modalTitle:{ fontSize: 18, fontWeight: '800', color: Colors.text },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder, paddingVertical: 12 },
  actionTxt: { fontSize: 13, fontWeight: '700' },
});
