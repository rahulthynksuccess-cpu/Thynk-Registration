import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  RefreshControl, Modal, ScrollView, Alert, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authFetch, School, fmtDate, fmtAmount } from '@/lib/api';
import { Colors, Spacing, Radius } from '@/constants/theme';
import {
  Badge, Card, RowItem, SectionHeader, ScreenHeader,
  EmptyState, PrimaryButton,
} from '@/components/ui';

type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'primary' | 'muted';

function statusVariant(s?: string): BadgeVariant {
  if (s === 'approved' || s === 'active') return 'success';
  if (s === 'pending')  return 'warning';
  if (s === 'rejected') return 'danger';
  return 'muted';
}

function SchoolCard({ school, onPress }: { school: any; onPress: () => void }) {
  const isActive  = school.is_active;
  const isPending = school.status === 'pending';

  return (
    <TouchableOpacity style={styles.schoolCard} onPress={onPress} activeOpacity={0.75}>
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={styles.avatarBox}>
          <Text style={styles.avatarText}>{(school.name ?? 'S')[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.schoolName} numberOfLines={1}>{school.name}</Text>
          <Text style={styles.orgName} numberOfLines={1}>{school.org_name}</Text>
        </View>
        <Badge
          label={school.status ?? (isActive ? 'Active' : 'Inactive')}
          variant={statusVariant(school.status ?? (isActive ? 'active' : 'inactive'))}
        />
      </View>

      {/* Meta row */}
      <View style={styles.metaRow}>
        {school.city && (
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={11} color={Colors.textDim} />
            <Text style={styles.metaText}>{school.city}{school.country && `, ${school.country}`}</Text>
          </View>
        )}
        <View style={styles.metaItem}>
          <Ionicons name="code-outline" size={11} color={Colors.textDim} />
          <Text style={styles.metaText}>{school.school_code}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="calendar-outline" size={11} color={Colors.textDim} />
          <Text style={styles.metaText}>{fmtDate(school.created_at)}</Text>
        </View>
      </View>

      {/* Stats row */}
      {(school.reg_count != null || school.revenue != null) && (
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statVal}>{school.reg_count ?? 0}</Text>
            <Text style={styles.statLbl}>Registrations</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statVal, { color: Colors.accent }]}>
              {school.revenue != null ? fmtAmount(school.revenue, school.country) : '—'}
            </Text>
            <Text style={styles.statLbl}>Revenue</Text>
          </View>
          {isPending && (
            <>
              <View style={styles.statDivider} />
              <View style={[styles.statItem, { flex: 0 }]}>
                <View style={styles.pendingDot} />
                <Text style={[styles.statLbl, { color: Colors.warning }]}>Pending Approval</Text>
              </View>
            </>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

function SchoolDetailModal({ school, visible, onClose, onAction }: {
  school: any; visible: boolean; onClose: () => void;
  onAction: (action: 'approve' | 'reject' | 'toggle') => void;
}) {
  if (!school) return null;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={modalStyles.root}>
        {/* Header */}
        <View style={modalStyles.header}>
          <Text style={modalStyles.title} numberOfLines={1}>{school.name}</Text>
          <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={modalStyles.content}>
          {/* Status */}
          <View style={modalStyles.statusRow}>
            <Badge
              label={school.status ?? (school.is_active ? 'Active' : 'Inactive')}
              variant={statusVariant(school.status ?? (school.is_active ? 'active' : 'inactive'))}
            />
            {school.project_id && (
              <Badge label={`Project: ${school.project_id}`} variant="info" />
            )}
          </View>

          <SectionHeader title="School Info" />
          <Card>
            <RowItem label="School Code" value={school.school_code} mono />
            <RowItem label="Organisation"  value={school.org_name} />
            <RowItem label="City"          value={school.city} />
            <RowItem label="State"         value={school.state} />
            <RowItem label="Country"       value={school.country ?? 'India'} />
            <RowItem label="Registered"    value={fmtDate(school.created_at)} />
          </Card>

          {school.reg_count != null && (
            <>
              <SectionHeader title="Performance" />
              <Card>
                <RowItem label="Total Registrations" value={String(school.reg_count ?? 0)} />
                <RowItem label="Revenue" value={school.revenue != null ? fmtAmount(school.revenue, school.country) : '—'} />
                <RowItem label="Paid" value={String(school.paid_count ?? 0)} />
              </Card>
            </>
          )}

          {/* Actions */}
          <SectionHeader title="Actions" />
          {school.status === 'pending' && (
            <View style={modalStyles.actionRow}>
              <PrimaryButton label="✓ Approve" onPress={() => onAction('approve')} />
              <View style={{ width: 10 }} />
              <PrimaryButton label="✕ Reject" onPress={() => onAction('reject')} danger />
            </View>
          )}
          <View style={{ marginTop: school.status === 'pending' ? 10 : 0 }}>
            <PrimaryButton
              label={school.is_active ? '⏸ Deactivate School' : '▶ Activate School'}
              onPress={() => onAction('toggle')}
              danger={school.is_active}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function SchoolsScreen() {
  const [schools, setSchools]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]       = useState('');
  const [filter, setFilter]       = useState<'all' | 'active' | 'pending' | 'inactive'>('all');
  const [selected, setSelected]   = useState<any | null>(null);
  const [acting, setActing]       = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await authFetch('/api/admin/schools');
      if (res.ok) {
        const data = await res.json();
        setSchools(data.schools ?? data ?? []);
      }
    } catch (e) { /* network error */ }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, []);

  async function handleAction(action: 'approve' | 'reject' | 'toggle') {
    if (!selected) return;
    setActing(true);
    try {
      if (action === 'approve' || action === 'reject') {
        const res = await authFetch('/api/admin/schools/approve', {
          method: 'POST',
          body: JSON.stringify({ school_id: selected.id, action }),
        });
        if (res.ok) {
          Alert.alert('Done', `School ${action}d successfully.`);
          setSelected(null);
          load(true);
        } else {
          Alert.alert('Error', 'Action failed. Please try again.');
        }
      } else {
        const res = await authFetch(`/api/admin/schools`, {
          method: 'PATCH',
          body: JSON.stringify({ school_id: selected.id, is_active: !selected.is_active }),
        });
        if (res.ok) {
          Alert.alert('Done', `School ${selected.is_active ? 'deactivated' : 'activated'}.`);
          setSelected(null);
          load(true);
        } else {
          Alert.alert('Error', 'Action failed.');
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setActing(false);
  }

  const filtered = schools.filter(s => {
    const matchSearch = !search ||
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.school_code?.toLowerCase().includes(search.toLowerCase()) ||
      s.org_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.city?.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filter === 'active')   return s.is_active && s.status !== 'pending';
    if (filter === 'pending')  return s.status === 'pending';
    if (filter === 'inactive') return !s.is_active;
    return true;
  });

  const counts = {
    all:      schools.length,
    active:   schools.filter(s => s.is_active && s.status !== 'pending').length,
    pending:  schools.filter(s => s.status === 'pending').length,
    inactive: schools.filter(s => !s.is_active).length,
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScreenHeader
        title="Schools"
        subtitle={`${counts.all} total · ${counts.pending} pending`}
      />

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={16} color={Colors.textDim} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search schools..."
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
        {(['all', 'active', 'pending', 'inactive'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, filter === f && styles.chipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
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
          keyExtractor={s => s.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={<EmptyState icon="🏫" message="No schools found" />}
          renderItem={({ item }) => (
            <SchoolCard school={item} onPress={() => setSelected(item)} />
          )}
        />
      )}

      <SchoolDetailModal
        school={selected}
        visible={!!selected}
        onClose={() => setSelected(null)}
        onAction={handleAction}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list:   { padding: Spacing.lg, paddingTop: Spacing.sm },

  searchRow:  { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.xl, marginBottom: Spacing.md, backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder, paddingHorizontal: Spacing.md },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, height: 42, color: Colors.text, fontSize: 14 },

  chipScroll: { flexGrow: 0, marginBottom: Spacing.sm },
  chipRow:    { paddingHorizontal: Spacing.xl, gap: 8 },
  chip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.round, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder },
  chipActive: { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  chipText:   { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  chipTextActive: { color: Colors.primary },

  schoolCard: { backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.lg, marginBottom: Spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  avatarBox:  { width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.primaryBg, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 18, fontWeight: '800', color: Colors.primary },
  schoolName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  orgName:    { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

  metaRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: Spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, color: Colors.textDim },

  statsRow:    { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.cardBorder, paddingTop: Spacing.sm },
  statItem:    { flex: 1, alignItems: 'center', flexDirection: 'column' },
  statVal:     { fontSize: 16, fontWeight: '800', color: Colors.text },
  statLbl:     { fontSize: 10, color: Colors.textDim, marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: Colors.cardBorder },
  pendingDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.warning, marginBottom: 2 },
});

const modalStyles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: Colors.bg },
  header:    { flexDirection: 'row', alignItems: 'center', padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  title:     { flex: 1, fontSize: 18, fontWeight: '800', color: Colors.text },
  closeBtn:  { padding: 4 },
  content:   { padding: Spacing.xl },
  statusRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.sm },
  actionRow: { flexDirection: 'row' },
});
