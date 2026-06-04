import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Pencil,
  Trash2,
} from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useField } from '../../lib/FieldContext';
import FieldSelectorModal from '../../components/FieldSelectorModal';
import type { Scan } from '../../types';

const BG = '#101A14';
const CARD = '#1C2921';
const CARD2 = '#222E27';
const ACCENT = '#2ED158';
const AMBER = '#F5A623';
const RED = '#FF4D4D';
const SUBTLE = 'rgba(225,227,225,0.65)';
const SUBTLE2 = 'rgba(225,227,225,0.38)';
const SUBTLE_BORDER = 'rgba(225,227,225,0.12)';

const SEVERITY_COLOR: Record<string, string> = {
  low: ACCENT, mild: ACCENT,
  medium: AMBER, moderate: AMBER,
  high: RED, severe: RED,
};

const MAX_INLINE = 5;

type Filter = 'all' | 'healthy' | 'diseased';
type ScanWithUrl = Scan & { signedUrl: string | null };
type PlantInfo = {
  id: string;
  field_id: string | null;
  plant_type: string | null;
  nickname: string | null;
  latitude: number;
  longitude: number;
};
type FieldInfo = { id: string; name: string };

type ListItem =
  | { kind: 'header'; plant_id: string; label: string; plantType: string | null; fieldName: string | null; coords: string | null; scans: ScanWithUrl[] }
  | { kind: 'child'; scan: ScanWithUrl }
  | { kind: 'viewall'; plant_id: string; remaining: number }
  | { kind: 'solo'; scan: ScanWithUrl };

function formatTimestamp(iso: string): string {
  const now = new Date();
  const date = new Date(iso);
  const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000);
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffDays < 1 && date.getDate() === now.getDate()) return timeStr;
  if (diffDays < 2) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatCoords(lat: number, lon: number): string | null {
  if (lat === 0 && lon === 0) return null;
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
}

function shortId(plant_id: string): string {
  return '#' + plant_id.replace(/-/g, '').slice(0, 5).toUpperCase();
}

function buildListItems(
  scans: ScanWithUrl[],
  plants: PlantInfo[],
  fieldMap: Record<string, string>,
  expanded: Set<string>,
  showAll: Set<string>,
  filter: Filter,
): ListItem[] {
  const plantMap = Object.fromEntries(plants.map(p => [p.id, p]));

  // Group ALL scans first — filter is applied at the plant level, not scan level
  const grouped = new Map<string, ScanWithUrl[]>();
  const solo: ScanWithUrl[] = [];

  for (const scan of scans) {
    if (scan.plant_id) {
      if (!grouped.has(scan.plant_id)) grouped.set(scan.plant_id, []);
      grouped.get(scan.plant_id)!.push(scan);
    } else {
      solo.push(scan);
    }
  }

  type TopItem = { latestAt: string; item: ListItem };
  const topItems: TopItem[] = [];

  for (const [plant_id, groupScans] of grouped) {
    // Filter by the most recent scan's health status, not individual scans
    const latest = groupScans[0];
    if (filter === 'healthy' && !latest.is_healthy) continue;
    if (filter === 'diseased' && latest.is_healthy) continue;

    const plant = plantMap[plant_id];
    const label = plant?.nickname ?? shortId(plant_id);
    const plantType = plant?.plant_type ?? groupScans[0]?.plant_type ?? null;
    const fieldName = (plant?.field_id && fieldMap[plant.field_id]) || null;
    const coords = plant ? formatCoords(plant.latitude, plant.longitude) : null;
    topItems.push({
      latestAt: groupScans[0].created_at,
      item: { kind: 'header', plant_id, label, plantType, fieldName, coords, scans: groupScans },
    });
  }

  // Solo scans (no plant) filter by their own status
  for (const scan of solo) {
    if (filter === 'healthy' && !scan.is_healthy) continue;
    if (filter === 'diseased' && scan.is_healthy) continue;
    topItems.push({ latestAt: scan.created_at, item: { kind: 'solo', scan } });
  }

  topItems.sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime());

  const result: ListItem[] = [];
  for (const { item } of topItems) {
    result.push(item);
    if (item.kind === 'header' && expanded.has(item.plant_id)) {
      const all = item.scans;
      const limit = showAll.has(item.plant_id) ? all.length : MAX_INLINE;
      all.slice(0, limit).forEach(scan => result.push({ kind: 'child', scan }));
      if (!showAll.has(item.plant_id) && all.length > MAX_INLINE) {
        result.push({ kind: 'viewall', plant_id: item.plant_id, remaining: all.length - MAX_INLINE });
      }
    }
  }

  return result;
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { selectedField } = useField();
  const [scans, setScans] = useState<ScanWithUrl[]>([]);
  const [plants, setPlants] = useState<PlantInfo[]>([]);
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const fetchData = useCallback(async () => {
    const [scansRes, plantsRes, fieldsRes] = await Promise.all([
      supabase.from('scans').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('plants').select('id, field_id, plant_type, nickname, latitude, longitude'),
      supabase.from('fields').select('id, name'),
    ]);

    const scanData = scansRes.data ?? [];
    setPlants(plantsRes.data ?? []);
    setFields(fieldsRes.data ?? []);

    if (scanData.length === 0) {
      setScans([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data: urls } = await supabase.storage
      .from('scan-images')
      .createSignedUrls(scanData.map((s: Scan) => s.image_url), 3600);

    const urlMap = Object.fromEntries((urls ?? []).map(u => [u.path, u.signedUrl]));
    setScans(scanData.map((s: Scan) => ({ ...s, signedUrl: urlMap[s.image_url] ?? null })));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function onRefresh() {
    setRefreshing(true);
    fetchData();
  }

  function toggleExpanded(plant_id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(plant_id)) {
        next.delete(plant_id);
        // Reset showAll when collapsing
        setShowAll(sa => { const s = new Set(sa); s.delete(plant_id); return s; });
      } else {
        next.add(plant_id);
      }
      return next;
    });
  }

  function toggleShowAll(plant_id: string) {
    setShowAll(prev => {
      const next = new Set(prev);
      next.has(plant_id) ? next.delete(plant_id) : next.add(plant_id);
      return next;
    });
  }

  function handleRename(plant_id: string, currentLabel: string) {
    Alert.prompt(
      'Rename plant',
      'Give this plant a unique name',
      async (name) => {
        const trimmed = name?.trim();
        if (!trimmed) return;
        const { data: existing } = await supabase
          .from('plants')
          .select('id')
          .eq('nickname', trimmed)
          .neq('id', plant_id)
          .limit(1);
        if (existing && existing.length > 0) {
          Alert.alert('Name already taken', `"${trimmed}" is already used by another plant. Try a different name.`);
          return;
        }
        const { error } = await supabase
          .from('plants')
          .update({ nickname: trimmed })
          .eq('id', plant_id);
        if (!error) {
          setPlants(prev => prev.map(p =>
            p.id === plant_id ? { ...p, nickname: trimmed } : p,
          ));
        }
      },
      'plain-text',
      currentLabel,
    );
  }

  function handleDelete(id: string) {
    Alert.alert('Delete scan', 'Remove this scan from your history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('scans')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id);
          if (!error) setScans(prev => prev.filter(s => s.id !== id));
        },
      },
    ]);
  }

  function handleDeleteConversation(plant_id: string, label: string) {
    Alert.alert(
      'Delete AI conversation',
      `Remove all chat messages and memories for ${label}? Scan history is not affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await Promise.all([
              supabase.from('chat_messages').delete().eq('plant_id', plant_id),
              supabase.from('plant_memories').delete().eq('plant_id', plant_id),
            ]);
          },
        },
      ],
    );
  }

  const selectedFieldId = selectedField?.id ?? null;
  const fieldPlantIds = selectedFieldId
    ? new Set(plants.filter(p => p.field_id === selectedFieldId).map(p => p.id))
    : null;

  const filteredScans = fieldPlantIds
    ? scans.filter(s => s.plant_id && fieldPlantIds.has(s.plant_id))
    : scans;

  const filteredPlants = fieldPlantIds
    ? plants.filter(p => fieldPlantIds.has(p.id))
    : plants;

  const fieldMap = Object.fromEntries(fields.map(f => [f.id, f.name]));
  const listItems = buildListItems(filteredScans, filteredPlants, fieldMap, expanded, showAll, filter);

  function renderItem({ item }: { item: ListItem }) {
    if (item.kind === 'header') {
      return (
        <GroupHeader
          plant_id={item.plant_id}
          label={item.label}
          plantType={item.plantType}
          fieldName={item.fieldName}
          coords={item.coords}
          scans={item.scans}
          isExpanded={expanded.has(item.plant_id)}
          onToggle={() => toggleExpanded(item.plant_id)}
          onRename={() => handleRename(item.plant_id, item.label)}
          onDeleteConversation={() => handleDeleteConversation(item.plant_id, item.label)}
          onChat={() => router.push(`/chat?plantId=${item.plant_id}&plantName=${encodeURIComponent(item.label)}&fieldName=${encodeURIComponent(item.fieldName ?? '')}`)}
        />
      );
    }
    if (item.kind === 'viewall') {
      return (
        <TouchableOpacity
          style={styles.viewAllRow}
          onPress={() => toggleShowAll(item.plant_id)}
          activeOpacity={0.7}
        >
          <Text style={styles.viewAllText}>Show {item.remaining} more scan{item.remaining !== 1 ? 's' : ''}</Text>
          <ChevronDown size={14} color={ACCENT} strokeWidth={2} />
        </TouchableOpacity>
      );
    }
    return (
      <ScanCard
        scan={item.scan}
        onDelete={() => handleDelete(item.scan.id)}
        isChild={item.kind === 'child'}
      />
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>History</Text>
        <TouchableOpacity
          style={styles.fieldPill}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.fieldPillText} numberOfLines={1}>
            {selectedField?.name ?? 'All Fields'}
          </Text>
          <ChevronDown size={13} color={SUBTLE} strokeWidth={1.5} />
        </TouchableOpacity>
      </View>

      <View style={styles.chips}>
        {(['all', 'healthy', 'diseased'] as Filter[]).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, filter === f && styles.chipActive]}
            onPress={() => setFilter(f)}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {f === 'all' ? 'All' : f === 'healthy' ? 'Healthy' : 'Diseased'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={ACCENT} />
        </View>
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item, i) => {
            if (item.kind === 'header') return `header-${item.plant_id}`;
            if (item.kind === 'child') return `child-${item.scan.id}`;
            if (item.kind === 'viewall') return `viewall-${item.plant_id}`;
            return `solo-${item.scan.id}-${i}`;
          }}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#FFFFFF"
              colors={['#FFFFFF']}
            />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyTitle}>No scans yet</Text>
              <Text style={styles.emptyBody}>
                {filter !== 'all'
                  ? `No ${filter} scans found.`
                  : selectedField
                    ? `No scans for ${selectedField.name} yet.`
                    : 'Take your first scan to see results here.'}
              </Text>
            </View>
          }
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
        />
      )}

      <FieldSelectorModal visible={modalVisible} onClose={() => setModalVisible(false)} />
    </View>
  );
}

// ─── Group header ─────────────────────────────────────────────────────────────

function GroupHeader({
  plant_id, label, plantType, fieldName, coords, scans,
  isExpanded, onToggle, onRename, onDeleteConversation, onChat,
}: {
  plant_id: string;
  label: string;
  plantType: string | null;
  fieldName: string | null;
  coords: string | null;
  scans: ScanWithUrl[];
  isExpanded: boolean;
  onToggle: () => void;
  onRename: () => void;
  onDeleteConversation: () => void;
  onChat: () => void;
}) {
  const latest = scans[0];
  const diseasedCount = scans.filter(s => !s.is_healthy).length;
  const healthColor = diseasedCount > 0 ? RED : ACCENT;
  const recentLabel = `Recent: ${latest.is_healthy ? 'Healthy' : (latest.disease_name ?? 'Unknown')}`;

  // Single compact footer: crop type · field · coords · time
  const footerParts: string[] = [];
  if (plantType) footerParts.push(plantType);
  if (fieldName) footerParts.push(fieldName);
  if (coords) footerParts.push(coords);
  footerParts.push(formatTimestamp(latest.created_at));
  const footerLine = footerParts.join('  ·  ');

  return (
    <View style={styles.groupCard}>
      <View style={styles.groupRow}>
        <View style={[styles.groupBar, { backgroundColor: healthColor }]} />

        {latest.signedUrl ? (
          <Image source={{ uri: latest.signedUrl }} style={styles.groupThumb} resizeMode="cover" />
        ) : (
          <View style={[styles.groupThumb, styles.groupThumbPlaceholder]} />
        )}

        <View style={styles.groupContent}>
          {/* Row 1: name (tap to rename) + action icons */}
          <View style={styles.groupTitleRow}>
            <TouchableOpacity onPress={onRename} style={styles.groupNameBtn} activeOpacity={0.7} hitSlop={6}>
              <Text style={styles.groupTitle} numberOfLines={1}>{label}</Text>
              <Pencil size={13} color={SUBTLE2} strokeWidth={1.5} />
            </TouchableOpacity>
            <View style={styles.groupIcons}>
              <TouchableOpacity onPress={onChat} hitSlop={10}>
                <MessageSquare size={19} color={ACCENT} strokeWidth={1.8} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onToggle} hitSlop={10} style={styles.groupExpandBtn}>
                {isExpanded
                  ? <ChevronUp size={18} color={SUBTLE} strokeWidth={2} />
                  : <ChevronDown size={18} color={SUBTLE} strokeWidth={2} />}
                <Text style={styles.groupExpandCount}>{scans.length}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onDeleteConversation} hitSlop={10}>
                <Trash2 size={17} color={RED + 'BB'} strokeWidth={1.8} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Row 2: recent diagnosis */}
          <Text style={styles.groupDisease} numberOfLines={1}>{recentLabel}</Text>

          {/* Row 3: crop · field · coords · time — all on one line */}
          <Text style={styles.groupFooter} numberOfLines={1}>{footerLine}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Scan card ────────────────────────────────────────────────────────────────

function ScanCard({ scan, onDelete, isChild }: {
  scan: ScanWithUrl;
  onDelete: () => void;
  isChild: boolean;
}) {
  const severityColor = scan.severity ? (SEVERITY_COLOR[scan.severity.toLowerCase()] ?? null) : null;
  const confidencePct = Math.round(scan.confidence * 100);

  return (
    <View style={[styles.scanCard, isChild && styles.scanCardChild]}>
      {scan.signedUrl ? (
        <Image source={{ uri: scan.signedUrl }} style={styles.scanThumb} resizeMode="cover" />
      ) : (
        <View style={[styles.scanThumb, styles.scanThumbPlaceholder]} />
      )}

      <View style={styles.scanBody}>
        <View style={styles.scanTopRow}>
          <Text style={styles.scanDisease} numberOfLines={1}>{scan.disease_name}</Text>
          <TouchableOpacity onPress={onDelete} hitSlop={12} accessibilityLabel="Delete scan">
            <Trash2 size={15} color={SUBTLE2} strokeWidth={1.5} />
          </TouchableOpacity>
        </View>
        <Text style={styles.scanMeta} numberOfLines={1}>
          {scan.plant_type}  ·  {confidencePct}% conf
        </Text>
        <View style={styles.scanFooter}>
          {scan.is_healthy ? (
            <View style={[styles.scanPill, { borderColor: ACCENT + '55', backgroundColor: ACCENT + '15' }]}>
              <Text style={[styles.scanPillText, { color: ACCENT }]}>Healthy</Text>
            </View>
          ) : severityColor ? (
            <View style={[styles.scanPill, { borderColor: severityColor + '55', backgroundColor: severityColor + '15' }]}>
              <Text style={[styles.scanPillText, { color: severityColor }]}>{scan.severity}</Text>
            </View>
          ) : null}
          <Text style={styles.scanDate}>{formatTimestamp(scan.created_at)}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    paddingTop: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SUBTLE_BORDER,
  },
  headerTitle: { color: '#E1E3E1', fontSize: 22, fontWeight: '700' },
  fieldPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    maxWidth: 160,
  },
  fieldPillText: { color: SUBTLE, fontSize: 12, fontWeight: '500', flexShrink: 1 },

  chips: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SUBTLE_BORDER,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: SUBTLE_BORDER,
  },
  chipActive: { backgroundColor: ACCENT + '18' },
  chipText: { color: SUBTLE, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: ACCENT },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  listContent: { flexGrow: 1, paddingHorizontal: 12, paddingBottom: 32, paddingTop: 8 },
  emptyTitle: { color: '#E1E3E1', fontSize: 16, fontWeight: '600' },
  emptyBody: { color: SUBTLE, fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },

  // ── Group card ──────────────────────────────────────────────────────────────
  groupCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    overflow: 'hidden',
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 11,
    paddingRight: 14,
    gap: 10,
  },
  groupBar: { width: 4 },
  groupThumb: { width: 58, height: 58, borderRadius: 9, flexShrink: 0, alignSelf: 'center' },
  groupThumbPlaceholder: { backgroundColor: 'rgba(255,255,255,0.07)' },
  groupContent: { flex: 1, gap: 4, justifyContent: 'center' },

  groupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  groupNameBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
    minWidth: 0,
  },
  groupTitle: { color: '#E1E3E1', fontSize: 15, fontWeight: '700', flexShrink: 1 },
  groupIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexShrink: 0,
  },
  groupExpandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  groupExpandCount: { color: SUBTLE, fontSize: 14, fontWeight: '700' },

  groupDisease: { color: SUBTLE, fontSize: 13 },
  groupFooter: { color: SUBTLE2, fontSize: 11 },

  // ── View-all row ────────────────────────────────────────────────────────────
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginLeft: 16,
    paddingVertical: 10,
    backgroundColor: CARD2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ACCENT + '30',
  },
  viewAllText: { color: ACCENT, fontSize: 13, fontWeight: '600' },

  // ── Scan card ───────────────────────────────────────────────────────────────
  scanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    overflow: 'hidden',
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 14,
    gap: 11,
  },
  scanCardChild: {
    backgroundColor: CARD2,
    marginLeft: 16,
    borderLeftWidth: 3,
    borderLeftColor: ACCENT + '45',
    borderRadius: 10,
    paddingLeft: 10,
  },
  scanThumb: { width: 54, height: 54, borderRadius: 8, flexShrink: 0 },
  scanThumbPlaceholder: { backgroundColor: 'rgba(255,255,255,0.06)' },
  scanBody: { flex: 1, gap: 3 },
  scanTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanDisease: { color: '#E1E3E1', fontSize: 14, fontWeight: '600', flex: 1 },
  scanMeta: { color: SUBTLE2, fontSize: 12 },
  scanFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 1,
  },
  scanPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, borderWidth: 1 },
  scanPillText: { fontSize: 11, fontWeight: '600' },
  scanDate: { color: SUBTLE2, fontSize: 11 },
});
