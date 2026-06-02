import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Leaf,
  MessageSquare,
  ScanLine,
  Shield,
} from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useField } from '../../lib/FieldContext';
import FieldSelectorModal from '../../components/FieldSelectorModal';
import type { Plant, Scan } from '../../types';

const BG = '#101A14';
const CARD = '#1C2921';
const ACCENT = '#2ED158';
const RED = '#FF4D4D';
const AMBER = '#F5A623';
const SUBTLE = 'rgba(225,227,225,0.70)';
const SUBTLE_BORDER = 'rgba(225,227,225,0.14)';

type ScanWithUrl = Scan & { signedUrl: string | null };
type DayBucket = { label: string; isToday: boolean; healthy: number; diseased: number; total: number };
type PlantCoverage = Plant & { lastScan: Scan | null; daysAgo: number | null };

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatTimestamp(iso: string): string {
  const now = new Date();
  const date = new Date(iso);
  const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000);
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffDays < 1 && date.getDate() === now.getDate()) return `Today at ${timeStr}`;
  if (diffDays < 2) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function shortId(id: string): string {
  return '#' + id.replace(/-/g, '').slice(0, 5).toUpperCase();
}

function build7DayBuckets(scans: Scan[]): DayBucket[] {
  const buckets: DayBucket[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = d.toDateString();
    const dayScans = scans.filter(s => new Date(s.created_at).toDateString() === dateStr);
    buckets.push({
      label: i === 0 ? 'Today' : `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`,
      isToday: i === 0,
      healthy: dayScans.filter(s => s.is_healthy).length,
      diseased: dayScans.filter(s => !s.is_healthy).length,
      total: dayScans.length,
    });
  }
  return buckets;
}

function getSeverityColor(severity: string | null | undefined): string {
  if (!severity) return RED;
  const s = severity.toLowerCase();
  if (s === 'low' || s === 'mild') return ACCENT;
  if (s === 'medium' || s === 'moderate') return AMBER;
  return RED;
}

function weekHealthPct(scans: Scan[], daysBack: number, window: number): number | null {
  const now = new Date();
  const from = new Date(now); from.setDate(now.getDate() - daysBack - window);
  const to = new Date(now); to.setDate(now.getDate() - daysBack);
  const period = scans.filter(s => {
    const t = new Date(s.created_at);
    return t >= from && t < to;
  });
  if (period.length === 0) return null;
  return Math.round((period.filter(s => s.is_healthy).length / period.length) * 100);
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: screenW } = useWindowDimensions();
  const { selectedField } = useField();

  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [allScans, setAllScans] = useState<Scan[]>([]);
  const [recentScans, setRecentScans] = useState<ScanWithUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalStartAdding, setModalStartAdding] = useState(false);

  const fetchData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setEmail(session.user.email ?? null);
      const { data } = await supabase
        .from('profiles').select('display_name, avatar_url').eq('id', session.user.id).single();
      setDisplayName(data?.display_name ?? null);
      if (data?.avatar_url) {
        const { data: { publicUrl } } = supabase.storage
          .from('avatars').getPublicUrl(data.avatar_url);
        setAvatarUrl(publicUrl + '?t=' + Date.now());
      } else {
        setAvatarUrl(null);
      }
    }

    const [plantsRes, scansRes] = await Promise.all([
      supabase.from('plants').select('*'),
      supabase.from('scans').select('*').is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(200),
    ]);

    setPlants((plantsRes.data ?? []) as Plant[]);
    setAllScans((scansRes.data ?? []) as Scan[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));
  function onRefresh() { setRefreshing(true); fetchData(); }

  // ── Field filtering ─────────────────────────────────────────────────────────
  const selectedFieldId = selectedField?.id ?? null;
  const filteredPlants = selectedFieldId
    ? plants.filter(p => p.field_id === selectedFieldId)
    : plants;
  const filteredPlantIds = new Set(filteredPlants.map(p => p.id));
  const filteredScans = selectedFieldId
    ? allScans.filter(s => s.plant_id && filteredPlantIds.has(s.plant_id))
    : allScans;

  // ── Recent scans (with signed URLs, from filtered set) ──────────────────────
  useEffect(() => {
    const top5 = filteredScans.slice(0, 5);
    if (top5.length === 0) { setRecentScans([]); return; }
    supabase.storage
      .from('scan-images')
      .createSignedUrls(top5.map(s => s.image_url), 3600)
      .then(({ data: urls }) => {
        const urlMap = Object.fromEntries((urls ?? []).map(u => [u.path, u.signedUrl]));
        setRecentScans(top5.map(s => ({ ...s, signedUrl: urlMap[s.image_url] ?? null })));
      });
  }, [filteredScans.length, selectedFieldId]);

  // ── Computed stats ──────────────────────────────────────────────────────────
  const totalPlants = filteredPlants.length;
  const totalScans = filteredScans.length;

  const thisWeekScans = filteredScans.filter(s => {
    const daysAgo = (Date.now() - new Date(s.created_at).getTime()) / 86400000;
    return daysAgo <= 7;
  });
  const thisWeekHealthy = thisWeekScans.filter(s => s.is_healthy).length;
  const thisWeekPct = thisWeekScans.length > 0
    ? Math.round((thisWeekHealthy / thisWeekScans.length) * 100) : null;
  const lastWeekPct = weekHealthPct(filteredScans, 7, 7);
  const pctDelta = thisWeekPct !== null && lastWeekPct !== null ? thisWeekPct - lastWeekPct : null;

  const thisWeekIssues = thisWeekScans.filter(s => !s.is_healthy).length;

  const buckets = build7DayBuckets(filteredScans);

  const avgConfPct = filteredScans.length > 0
    ? Math.round(filteredScans.reduce((sum, s) => sum + s.confidence, 0) / filteredScans.length * 100)
    : null;

  const diseaseStats = new Map<string, { count: number; confSum: number; firstAt: string }>();
  const severityCounts = { low: 0, medium: 0, high: 0, severe: 0 };
  for (const s of filteredScans) {
    if (!s.is_healthy) {
      const prev = diseaseStats.get(s.disease_name);
      const firstAt = prev && new Date(prev.firstAt) <= new Date(s.created_at) ? prev.firstAt : s.created_at;
      diseaseStats.set(s.disease_name, {
        count: (prev?.count ?? 0) + 1,
        confSum: (prev?.confSum ?? 0) + s.confidence,
        firstAt,
      });
      if (s.severity) {
        const key = s.severity.toLowerCase() as keyof typeof severityCounts;
        if (key in severityCounts) severityCounts[key]++;
      }
    }
  }
  const topDiseases = [...diseaseStats.entries()]
    .map(([name, { count, confSum, firstAt }]) => ({
      name, count,
      avgConf: Math.round((confSum / count) * 100),
      prevalence: Math.round((count / Math.max(filteredScans.length, 1)) * 100),
      firstAt,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
  const maxDiseaseCount = topDiseases[0]?.count ?? 1;

  const latestByPlant = new Map<string, Scan>();
  for (const s of filteredScans) {
    if (s.plant_id && !latestByPlant.has(s.plant_id)) latestByPlant.set(s.plant_id, s);
  }
  const plantCoverage: PlantCoverage[] = filteredPlants.map(p => {
    const last = latestByPlant.get(p.id) ?? null;
    const daysAgo = last
      ? Math.floor((Date.now() - new Date(last.created_at).getTime()) / 86400000)
      : null;
    return { ...p, lastScan: last, daysAgo };
  });

  const scannedThisWeek = plantCoverage.filter(p => p.daysAgo !== null && p.daysAgo <= 7).length;
  const overdueCount = plantCoverage.filter(p => p.daysAgo !== null && p.daysAgo > 7).length;
  const neverCount = plantCoverage.filter(p => p.daysAgo === null).length;
  const coveragePct = totalPlants > 0 ? Math.round((scannedThisWeek / totalPlants) * 100) : 0;
  const coverageBarColor = coveragePct >= 80 ? ACCENT : coveragePct >= 50 ? AMBER : RED;

  const thisWeekPlantIds = new Set(
    filteredScans.filter(s => s.plant_id && (Date.now() - new Date(s.created_at).getTime()) / 86400000 <= 7)
      .map(s => s.plant_id!)
  );
  const lastWeekPlantIds = new Set(
    filteredScans.filter(s => {
      const d = (Date.now() - new Date(s.created_at).getTime()) / 86400000;
      return s.plant_id && d > 7 && d <= 14;
    }).map(s => s.plant_id!)
  );
  const monitoringTrend = (lastWeekPlantIds.size > 0 || thisWeekPlantIds.size > 0)
    ? thisWeekPlantIds.size - lastWeekPlantIds.size : null;

  const alertPlants = plantCoverage.filter(p => p.lastScan && !p.lastScan.is_healthy);

  function openSelector() {
    setModalStartAdding(false);
    setModalVisible(true);
  }

  function handleAvatarPress() {
    Alert.alert(
      displayName ?? email ?? 'Account',
      email ?? '',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => supabase.auth.signOut(),
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={ACCENT} />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={[styles.root, { paddingTop: insets.top }]}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FFFFFF"
            colors={['#FFFFFF']}
          />
        }
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.greetingText}>
              {greeting()}, {displayName ?? email?.split('@')[0] ?? 'Farmer'}
            </Text>
            <TouchableOpacity style={styles.fieldSelector} onPress={openSelector} activeOpacity={0.7}>
              <Text style={styles.fieldName} numberOfLines={1}>
                {selectedField?.name ?? 'All Fields'}
              </Text>
              <ChevronDown size={18} color={SUBTLE} strokeWidth={1.5} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.avatarBtn} onPress={handleAvatarPress} activeOpacity={0.8}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>
                  {(displayName ?? email ?? '?')[0].toUpperCase()}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <StatCard
            label="Overdue"
            value={overdueCount}
            icon={<AlertTriangle size={15} color={overdueCount > 0 ? AMBER : SUBTLE} strokeWidth={1.5} />}
            accent={overdueCount > 0 ? AMBER : '#E1E3E1'}
            sub={neverCount > 0 ? `${neverCount} never scanned` : `${totalPlants} plants total`}
            subColor={neverCount > 0 ? RED : SUBTLE}
            onPress={() => router.push('/(tabs)/map')}
          />
          <StatCard
            label="Weekly Scans"
            value={thisWeekScans.length}
            icon={<ScanLine size={15} color={SUBTLE} strokeWidth={1.5} />}
            accent="#E1E3E1"
            sub={avgConfPct !== null ? `${avgConfPct}% avg confidence` : 'No scans yet'}
            onPress={() => router.push('/(tabs)/history')}
          />
          <StatCard
            label="Field Health"
            value={thisWeekPct !== null ? `${thisWeekPct}%` : '—'}
            icon={<CheckCircle2 size={15} color={ACCENT} strokeWidth={1.5} />}
            accent={ACCENT}
            sub={pctDelta !== null
              ? `${pctDelta >= 0 ? '+' : ''}${pctDelta}% vs last week`
              : 'This week'}
            subColor={pctDelta !== null ? (pctDelta >= 0 ? ACCENT : RED) : SUBTLE}
            onPress={() => router.push('/(tabs)/history')}
          />
          <StatCard
            label="At Risk"
            value={alertPlants.length}
            icon={<AlertTriangle size={15} color={alertPlants.length > 0 ? RED : SUBTLE} strokeWidth={1.5} />}
            accent={alertPlants.length > 0 ? RED : '#E1E3E1'}
            sub={thisWeekIssues > 0 ? `${thisWeekIssues} detected this week` : 'No active issues'}
            subColor={thisWeekIssues > 0 ? RED : SUBTLE}
            onPress={() => router.push('/(tabs)/history')}
          />
        </View>

        {/* 7-Day health trend */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>7-Day Health Trend</Text>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: ACCENT }]} />
              <Text style={styles.legendText}>Healthy</Text>
              <View style={[styles.legendDot, { backgroundColor: RED }]} />
              <Text style={styles.legendText}>Diseased</Text>
            </View>
          </View>
          <TrendChart buckets={buckets} screenW={screenW} />
        </View>

        {/* Disease Intelligence */}
        {topDiseases.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Disease Intelligence</Text>
            <View style={[styles.card, { paddingVertical: 10 }]}>
              {topDiseases.map((d, i) => (
                <View key={d.name} style={[styles.diseaseRow, i < topDiseases.length - 1 && styles.diseaseRowBorder]}>
                  <View style={styles.diseaseMainRow}>
                    <Text style={styles.diseaseName} numberOfLines={1}>{d.name}</Text>
                    <View style={styles.diseaseBarTrack}>
                      <View style={[styles.diseaseBarFill, { width: `${Math.round((d.count / maxDiseaseCount) * 100)}%` }]} />
                    </View>
                    <Text style={styles.diseaseCount}>{d.count}</Text>
                  </View>
                  <Text style={styles.diseaseMeta}>
                    {d.avgConf}% confidence · {d.prevalence}% of scans · since {new Date(d.firstAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                </View>
              ))}
              {(severityCounts.low + severityCounts.medium + severityCounts.high + severityCounts.severe) > 0 && (
                <>
                  <View style={[styles.divider, { marginVertical: 7 }]} />
                  <View style={styles.severityChipsRow}>
                    {([
                      ['Low', severityCounts.low, ACCENT + 'CC'],
                      ['Medium', severityCounts.medium, AMBER],
                      ['High', severityCounts.high, RED + 'CC'],
                      ['Severe', severityCounts.severe, RED],
                    ] as [string, number, string][]).filter(([, n]) => n > 0).map(([label, n, color]) => (
                      <View key={label} style={[styles.severityChip, { borderColor: color + '40' }]}>
                        <View style={[styles.severityChipDot, { backgroundColor: color }]} />
                        <Text style={[styles.severityChipText, { color }]}>{n} {label}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </View>
          </View>
        )}

        {/* Field monitoring report */}
        {filteredPlants.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Field Monitoring</Text>
            <View style={[styles.card, { gap: 0 }]}>
              <View style={styles.coverageHeader}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.coverageTitle}>
                    {scannedThisWeek} of {totalPlants} plants monitored this week
                  </Text>
                  {monitoringTrend !== null && (
                    <Text style={[styles.coverageTrend, { color: monitoringTrend >= 0 ? ACCENT : RED }]}>
                      {monitoringTrend > 0
                        ? `↑ ${monitoringTrend} more than last week`
                        : monitoringTrend < 0
                          ? `↓ ${Math.abs(monitoringTrend)} fewer than last week`
                          : 'Same as last week'}
                    </Text>
                  )}
                </View>
                <Text style={[styles.coveragePct, { color: coverageBarColor }]}>{coveragePct}%</Text>
              </View>
              <View style={[styles.coverageBarTrack, { marginBottom: 14 }]}>
                <View style={[styles.coverageBarFill, {
                  width: `${coveragePct}%` as any,
                  backgroundColor: coverageBarColor,
                }]} />
              </View>
              <View style={styles.monitoringStats}>
                <View style={styles.monitoringStat}>
                  <Text style={[styles.monitoringValue, { color: ACCENT }]}>{scannedThisWeek}</Text>
                  <Text style={styles.monitoringLabel}>Up to date</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.monitoringStat}>
                  <Text style={[styles.monitoringValue, { color: overdueCount > 0 ? AMBER : SUBTLE }]}>
                    {overdueCount}
                  </Text>
                  <Text style={styles.monitoringLabel}>Overdue</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.monitoringStat}>
                  <Text style={[styles.monitoringValue, { color: SUBTLE }]}>
                    {neverCount}
                  </Text>
                  <Text style={styles.monitoringLabel}>Never scanned</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Needs attention */}
        {alertPlants.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Needs Attention</Text>
            <View style={[styles.card, { padding: 0 }]}>
              {alertPlants.slice(0, 3).map((plant, i) => {
                const sevColor = getSeverityColor(plant.lastScan?.severity);
                const plantName = plant.nickname ?? shortId(plant.id);
                const confPct = plant.lastScan?.confidence != null
                  ? Math.round(plant.lastScan.confidence * 100) : null;
                return (
                  <TouchableOpacity
                    key={plant.id}
                    style={[styles.alertRow, i < Math.min(alertPlants.length, 3) - 1 && styles.alertRowBorder]}
                    onPress={() => router.push(`/chat?plantId=${plant.id}&plantName=${encodeURIComponent(plantName)}`)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.alertSeverityBar, { backgroundColor: sevColor }]} />
                    <View style={styles.alertBody}>
                      <View style={styles.alertNameRow}>
                        <Text style={styles.alertPlant} numberOfLines={1}>{plantName}</Text>
                        {plant.nickname && (
                          <Text style={styles.alertId}>{shortId(plant.id)}</Text>
                        )}
                        {plant.plant_type && (
                          <Text style={styles.alertMeta2} numberOfLines={1}>· {plant.plant_type}</Text>
                        )}
                        {plant.daysAgo !== null && (
                          <Text style={styles.alertAge}>
                            · {plant.daysAgo === 0 ? 'today' : `${plant.daysAgo}d ago`}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.alertDisease} numberOfLines={1}>
                        {plant.lastScan!.disease_name}{confPct != null ? `  ·  ${confPct}% conf` : ''}
                      </Text>
                    </View>
                    <View style={styles.alertRight}>
                      {plant.lastScan?.severity && (
                        <View style={[styles.pill, { borderColor: sevColor + '50' }]}>
                          <Text style={[styles.pillText, { color: sevColor }]}>{plant.lastScan.severity}</Text>
                        </View>
                      )}
                      <View style={styles.alertChatHint}>
                        <MessageSquare size={11} color={ACCENT} strokeWidth={1.8} />
                        <Text style={styles.alertChatText}>Ask AI</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Recent scans */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Recent Scans</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/history')} hitSlop={12}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>

          {recentScans.length === 0 ? (
            <View style={styles.emptyCard}>
              <Shield size={28} color={SUBTLE} strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>No scans yet</Text>
              <Text style={styles.emptyBody}>
                {selectedField
                  ? `No scans for ${selectedField.name} yet.`
                  : 'Tap the scan button to analyse your first plant.'}
              </Text>
            </View>
          ) : (
            <View style={styles.card}>
              {recentScans.map((scan, i) => (
                <View key={scan.id} style={[styles.scanRow, i < recentScans.length - 1 && styles.scanRowBorder]}>
                  {scan.signedUrl
                    ? <Image source={{ uri: scan.signedUrl }} style={styles.thumb} />
                    : <View style={[styles.thumb, styles.thumbPlaceholder]} />
                  }
                  <View style={styles.scanBody}>
                    <Text style={styles.scanDisease} numberOfLines={1}>{scan.disease_name}</Text>
                    <Text style={styles.scanMeta} numberOfLines={1}>
                      {scan.plant_type} · {Math.round(scan.confidence * 100)}%
                    </Text>
                  </View>
                  <View style={styles.scanRight}>
                    <View style={[styles.pill, { borderColor: (scan.is_healthy ? ACCENT : RED) + '50' }]}>
                      <Text style={[styles.pillText, { color: scan.is_healthy ? ACCENT : RED }]}>
                        {scan.is_healthy ? 'Healthy' : (scan.severity ?? 'Diseased')}
                      </Text>
                    </View>
                    <Text style={styles.scanTime}>{formatTimestamp(scan.created_at)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <FieldSelectorModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        startAdding={modalStartAdding}
      />
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon, accent, sub, subColor, onPress,
}: {
  label: string; value: string | number; icon: React.ReactNode;
  accent: string; sub?: string; subColor?: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.statCard} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.statInner}>
        <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
        <View style={styles.statRight}>
          <View style={styles.statLabelRow}>
            {icon}
            <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
          </View>
          {sub && (
            <Text style={[styles.statSub, { color: subColor ?? SUBTLE }]} numberOfLines={2}>
              {sub}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function TrendChart({ buckets, screenW }: { buckets: DayBucket[]; screenW: number }) {
  const OUTER_PAD = 16;
  const CARD_PAD = 16;
  const YAXIS_W = 32;
  const totalW = screenW - OUTER_PAD * 2 - CARD_PAD * 2;
  const barAreaW = totalW - YAXIS_W;
  const CHART_H = 80;
  const LABEL_H = 18;
  const SVG_H = CHART_H + LABEL_H + 4;
  const slotW = barAreaW / 7;
  const barW = slotW * 0.52;
  const maxTotal = Math.max(...buckets.map(b => b.total), 1);

  const ticks = [
    { value: maxTotal, y: 0 },
    { value: Math.round(maxTotal / 2), y: CHART_H / 2 },
    { value: 0, y: CHART_H },
  ];

  return (
    <View style={styles.card}>
      <Svg width={totalW} height={SVG_H}>
        <SvgText
          x={7}
          y={CHART_H / 2}
          textAnchor="middle"
          fill="rgba(225,227,225,0.30)"
          fontSize={8.5}
          transform={`rotate(-90, 7, ${CHART_H / 2})`}
        >
          scans
        </SvgText>

        {ticks.map((tick, ti) => (
          <Svg key={ti}>
            <SvgText
              x={YAXIS_W - 4} y={tick.y === 0 ? 9 : tick.y + 4}
              textAnchor="end" fill="rgba(225,227,225,0.42)" fontSize={9}
            >
              {tick.value}
            </SvgText>
            <Rect
              x={YAXIS_W} y={tick.y === 0 ? 0.5 : tick.y}
              width={barAreaW} height={0.5}
              fill="rgba(255,255,255,0.07)"
            />
          </Svg>
        ))}

        {buckets.map((b, i) => {
          const x = YAXIS_W + i * slotW + (slotW - barW) / 2;
          const scaledH = b.total > 0 ? Math.max((b.total / maxTotal) * CHART_H, 6) : 0;
          const greenH = b.total > 0 ? (b.healthy / b.total) * scaledH : 0;
          const redH = scaledH - greenH;
          const labelColor = b.isToday ? '#E1E3E1' : 'rgba(225,227,225,0.45)';

          return (
            <Svg key={i}>
              <Rect x={x} y={0} width={barW} height={CHART_H}
                fill="rgba(255,255,255,0.05)" rx={4} />
              {greenH > 0 && (
                <Rect x={x} y={CHART_H - greenH} width={barW} height={greenH}
                  fill={ACCENT + 'CC'} rx={4} />
              )}
              {redH > 0 && (
                <Rect x={x} y={CHART_H - scaledH} width={barW} height={redH}
                  fill={RED + 'CC'} rx={4} />
              )}
              <SvgText
                x={x + barW / 2} y={CHART_H + LABEL_H}
                textAnchor="middle" fill={labelColor}
                fontSize={b.isToday ? 10.5 : 10} fontWeight={b.isToday ? '600' : '400'}
              >
                {b.label}
              </SvgText>
            </Svg>
          );
        })}
      </Svg>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  centered: { alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 16, paddingBottom: 40, gap: 22, paddingTop: 16 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flex: 1, gap: 2, paddingRight: 12 },
  greetingText: { color: SUBTLE, fontSize: 13, fontWeight: '500' },
  fieldSelector: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fieldName: { color: '#E1E3E1', fontSize: 24, fontWeight: '700', flexShrink: 1 },
  avatarBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
  },
  avatarImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  avatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: ACCENT + '22',
    borderWidth: 1.5,
    borderColor: ACCENT + '50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: ACCENT,
    fontSize: 15,
    fontWeight: '700',
  },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: {
    flex: 1, minWidth: '45%',
    backgroundColor: CARD, borderRadius: 14, borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    paddingHorizontal: 13, paddingVertical: 12,
  },
  statInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6,
  },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statRight: { flex: 1, alignItems: 'flex-start', gap: 4 },
  statValue: { fontSize: 26, fontWeight: '800', lineHeight: 28 },
  statLabel: { color: '#E1E3E1', fontSize: 12, fontWeight: '600' },
  statSub: { fontSize: 10.5, lineHeight: 14 },

  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { color: SUBTLE, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  seeAll: { color: ACCENT, fontSize: 13, fontWeight: '500' },

  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { color: SUBTLE, fontSize: 11 },

  card: {
    backgroundColor: CARD, borderRadius: 14, borderWidth: 1,
    borderColor: SUBTLE_BORDER, overflow: 'hidden', padding: 16,
  },

  diseaseRow: { gap: 4, paddingVertical: 7 },
  diseaseRowBorder: { borderBottomWidth: 1, borderBottomColor: SUBTLE_BORDER },
  diseaseMainRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  diseaseName: { color: '#E1E3E1', fontSize: 13, fontWeight: '500', flex: 1 },
  diseaseMeta: { color: SUBTLE, fontSize: 10, lineHeight: 14 },
  diseaseBarTrack: {
    width: 100, height: 6, backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 3, overflow: 'hidden',
  },
  diseaseBarFill: { height: '100%', backgroundColor: RED + 'BB', borderRadius: 3 },
  diseaseCount: { color: SUBTLE, fontSize: 12, fontWeight: '600', width: 24, textAlign: 'right' },

  severityChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  severityChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 9, paddingVertical: 4,
  },
  severityChipDot: { width: 6, height: 6, borderRadius: 3 },
  severityChipText: { fontSize: 11, fontWeight: '600' },

  coverageHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 },
  coverageTitle: { color: '#E1E3E1', fontSize: 13, fontWeight: '600' },
  coverageTrend: { fontSize: 11, marginTop: 2 },
  coveragePct: { fontSize: 15, fontWeight: '700' },
  coverageBarTrack: { height: 7, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' },
  coverageBarFill: { height: '100%', borderRadius: 4 },
  divider: { height: 1, backgroundColor: SUBTLE_BORDER, marginVertical: 14 },
  monitoringStats: { flexDirection: 'row', alignItems: 'center' },
  monitoringStat: { flex: 1, alignItems: 'center', gap: 3 },
  statDivider: { width: 1, height: 30, backgroundColor: SUBTLE_BORDER },
  monitoringValue: { fontSize: 18, fontWeight: '700' },
  monitoringLabel: { color: SUBTLE, fontSize: 11 },

  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 0, paddingVertical: 0 },
  alertRowBorder: { borderBottomWidth: 1, borderBottomColor: SUBTLE_BORDER },
  alertSeverityBar: { width: 6, alignSelf: 'stretch', borderRadius: 2 },
  alertBody: { flex: 1, gap: 2, paddingVertical: 10, paddingLeft: 12 },
  alertNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  alertPlant: { color: '#E1E3E1', fontSize: 13, fontWeight: '600' },
  alertId: { color: 'rgba(225,227,225,0.38)', fontSize: 11, fontWeight: '600' },
  alertMeta2: { color: 'rgba(225,227,225,0.45)', fontSize: 11, flexShrink: 1 },
  alertAge: { color: 'rgba(225,227,225,0.38)', fontSize: 11 },
  alertDisease: { color: SUBTLE, fontSize: 12 },
  alertRight: { alignItems: 'flex-end', justifyContent: 'center', gap: 6, paddingRight: 12, paddingVertical: 10 },
  alertChatHint: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  alertChatText: { color: ACCENT, fontSize: 10, fontWeight: '600' },

  emptyCard: {
    backgroundColor: CARD, borderRadius: 14, borderWidth: 1,
    borderColor: SUBTLE_BORDER, alignItems: 'center', padding: 32, gap: 10,
  },
  emptyTitle: { color: '#E1E3E1', fontSize: 15, fontWeight: '600' },
  emptyBody: { color: SUBTLE, fontSize: 13, textAlign: 'center', lineHeight: 19 },

  scanRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  scanRowBorder: { borderBottomWidth: 1, borderBottomColor: SUBTLE_BORDER },
  thumb: { width: 44, height: 44, borderRadius: 8 },
  thumbPlaceholder: { backgroundColor: 'rgba(255,255,255,0.06)' },
  scanBody: { flex: 1, gap: 3 },
  scanDisease: { color: '#E1E3E1', fontSize: 13, fontWeight: '600' },
  scanMeta: { color: SUBTLE, fontSize: 12 },
  scanRight: { alignItems: 'flex-end', gap: 4 },
  scanTime: { color: SUBTLE, fontSize: 11 },

  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  pillText: { fontSize: 11, fontWeight: '500' },
});
