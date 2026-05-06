import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  RefreshControl, Modal, ScrollView, Alert, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authFetch, fmtDate, fmtAmount } from '@/lib/api';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { Badge, Card, RowItem, SectionHeader, EmptyState, PrimaryButton } from '@/components/ui';

type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'primary' | 'muted';
type FilterType   = 'all' | 'active' | 'pending' | 'inactive';

function statusVariant(s?: string): BadgeVariant {
  if (s === 'approved' || s === 'active') return 'success';
  if (s === 'pending')  return 'warning';
  if (s === 'rejected') return 'danger';
  return 'muted';
}

function SchoolCard({ school, onPress }: { school: any; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardTop}>
        <View style={styles.avatar}>
          <Text style={styles.avatarTxt}>{(school.name ?? 'S')[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.cardName} numberOfLines={1}>{school.name}</Text>
          <Text style={styles.cardSub}  numberOfLines={1}>{school.org_name}</Text>
        </View>
        <Badge label={school.status ?? (school.is_active ? 'Active' : 'Inactive')} variant={statusVariant(school.status ?? (school.is_active ? 'active' : 'inactive'))} />
      </View>
      <View style={styles.metaRow}>
        {school.city && <View style={styles.metaItem}><Ionicons name="location-outline" size={11} color={Colors.textDim} /><Text style={styles.metaTxt}>{school.city}</Text></View>}
        <View style={styles.metaItem}><Ionicons name="code-outline" size={11} color={Colors.textDim} /><Text style={styles.metaTxt}>{school.school_code}</Text></View>
        <View style={styles.metaItem}><Ionicons name="calendar-outline" size={11} color={Colors.textDim} /><Text style={styles.metaTxt}>{fmtDate(school.created_at)}</Text></View>
      </View>
      {school.reg_count != null && (
        <View style={styles.statsRow}>
          <View style={styles.statItem}><Text style={styles.statVal}>{school.reg_count ?? 0}</Text><Text style={styles.statLbl}>Registrations</Text></View>
          <View style={styles.statDiv} />
          <View style={styles.statItem}><Text style={[styles.statVal, { color: Colors.accent }]}>{school.revenue != null ? fmtAmount(school.revenue) : '—'}</Text><Text style={styles.statLbl}>Revenue</Text></View>
        </View>
      )}
    </TouchableOpacity>
  );
}

function SchoolModal({ school, visible, onClose, onAction }: {
  school: any; visible: boolean; onClose: () => void; onAction: (a: 'approve'|'reject'|'toggle') => void;
}) {
  if (!school) return null;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: Colors.bg }}>
        <View style={styles.modalHdr}>
          <Text style={styles.modalTitle} numberOfLines={1}>{school.name}</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.textMuted} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl }}>
          <SectionHeader title="School Info" />
          <Card>
            <RowItem label="School Code"  value={school.school_code} mono />
            <RowItem label="Organisation" value={school.org_name} />
            <RowItem label="City"         value={school.city} />
            <RowItem label="Country"      value={school.country ?? 'India'} />
            <RowItem label="Registered"   value={fmtDate(school.created_at)} />
          </Card>
          <SectionHeader title="Actions" />
          {school.status === 'pending' && (
            <View style={{ flexDirection: 'row', marginBottom: 10 }}>
              <PrimaryButton label="✓ Approve" onPress={() => onAction('approve')} />
              <View style={{ width: 10 }} />
              <PrimaryButton label="✕ Reject" onPress={() => onAction('reject')} danger />
            </View>
          )}
          <PrimaryButton label={school.is_active ? '⏸ Deactivate' : '▶ Activate'} onPress={() => onAction('toggle')} danger={school.is_active} />
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function SchoolsScreen() {
  const [schools, setSchools]       = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState<FilterType>('all');
  const [selected, setSelected]     = useState<any>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await authFetch('/api/admin/schools');
      if (res.ok) { const d = await res.json(); setSchools(d.schools ?? d ?? []); }
    } catch {}
    setLoading(false); setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, []);

  async function handleAction(action: 'approve'|'reject'|'toggle') {
    if (!selected) return;
    try {
      const res = action === 'toggle'
        ? await authFetch('/api/admin/schools', { method: 'PATCH', body: JSON.stringify({ school_id: selected.id, is_active: !selected.is_active }) })
        : await authFetch('/api/admin/schools/approve', { method: 'POST', body: JSON.stringify({ school_id: selected.id, action }) });
      if (res.ok) { setSelected(null); load(true); }
      else Alert.alert('Error', 'Action failed.');
    } catch (e: any) { Alert.alert('Error', e.message); }
  }

  const counts = { all: schools.length, active: schools.filter(s => s.is_active && s.status !== 'pending').length, pending: schools.filter(s => s.status === 'pending').length, inactive: schools.filter(s => !s.is_active).length };

  const filtered = schools.filter(s => {
    const q = search.toLowerCase();
    const ok = !search || s.name?.toLowerCase().includes(q) || s.school_code?.toLowerCase().includes(q) || s.org_name?.toLowerCase().includes(q) || s.city?.toLowerCase().includes(q);
    if (!ok) return false;
    if (filter === 'active')   return s.is_active && s.status !== 'pending';
    if (filter === 'pending')  return s.status === 'pending';
    if (filter === 'inactive') return !s.is_active;
    return true;
  });

  const Header = () => (
    <View style={{ paddingBottom: 4 }}>
      <View style={{ marginBottom: Spacing.md }}>
        <Text style={styles.pageTitle}>Schools</Text>
        <Text style={styles.pageSub}>{counts.all} total · {counts.pending} pending</Text>
      </View>
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={16} color={Colors.textDim} style={{ marginRight: 8 }} />
        <TextInput style={styles.searchInput} placeholder="Search schools..." placeholderTextColor={Colors.textDim} value={search} onChangeText={setSearch} />
        {search.length > 0 && <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color={Colors.textDim} /></TouchableOpacity>}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
        {(['all','active','pending','inactive'] as FilterType[]).map(f => (
          <TouchableOpacity key={f} style={[styles.chip, filter === f && styles.chipOn]} onPress={() => setFilter(f)}>
            <Text style={[styles.chipTxt, filter === f && styles.chipTxtOn]}>{f.charAt(0).toUpperCase()+f.slice(1)} ({counts[f]})</Text>
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
            keyExtractor={s => s.id}
            contentContainerStyle={{ padding: Spacing.lg, paddingTop: Spacing.sm }}
            ListHeaderComponent={<Header />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={Colors.primary} />}
            ListEmptyComponent={<EmptyState icon="🏫" message="No schools found" />}
            renderItem={({ item }) => <SchoolCard school={item} onPress={() => setSelected(item)} />}
          />
      }
      <SchoolModal school={selected} visible={!!selected} onClose={() => setSelected(null)} onAction={handleAction} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pageTitle: { fontSize: 22, fontWeight: '800', color: Colors.text, letterSpacing: -0.3 },
  pageSub:   { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  searchInput:{ flex: 1, height: 42, color: Colors.text, fontSize: 14 },
  chip:    { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.round, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder },
  chipOn:  { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  chipTxt: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  chipTxtOn:{ color: Colors.primary },
  card:      { backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.lg, marginBottom: Spacing.md },
  cardTop:   { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  avatar:    { width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.primaryBg, justifyContent: 'center', alignItems: 'center' },
  avatarTxt: { fontSize: 18, fontWeight: '800', color: Colors.primary },
  cardName:  { fontSize: 14, fontWeight: '700', color: Colors.text },
  cardSub:   { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  metaRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: Spacing.md },
  metaItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaTxt:   { fontSize: 11, color: Colors.textDim },
  statsRow:  { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.cardBorder, paddingTop: Spacing.sm },
  statItem:  { flex: 1, alignItems: 'center' },
  statVal:   { fontSize: 15, fontWeight: '800', color: Colors.text },
  statLbl:   { fontSize: 10, color: Colors.textDim, marginTop: 2 },
  statDiv:   { width: 1, height: 26, backgroundColor: Colors.cardBorder },
  modalHdr:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  modalTitle:{ flex: 1, fontSize: 18, fontWeight: '800', color: Colors.text, marginRight: 12 },
});
