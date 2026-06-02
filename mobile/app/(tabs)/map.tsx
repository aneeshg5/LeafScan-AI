import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type MapType, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { ChevronDown, ChevronRight, Clock, Layers, LocateFixed, MessageSquare, X } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useField } from '../../lib/FieldContext';
import FieldSelectorModal from '../../components/FieldSelectorModal';
import type { Plant, Scan } from '../../types';

const BG = '#101A14';
const CARD = '#1C2921';
const CARD2 = '#222E27';
const ACCENT = '#2ED158';
const AMBER = '#F5A623';
const RED = '#FF4D4D';
const SUBTLE = 'rgba(225,227,225,0.65)';
const SUBTLE2 = 'rgba(225,227,225,0.38)';
const SUBTLE_BORDER = 'rgba(225,227,225,0.13)';
const DELTA = 0.008;
const PANEL_HEIGHT = 215;

const SEVERITY_COLOR: Record<string, string> = {
  low: ACCENT, mild: ACCENT,
  medium: AMBER, moderate: AMBER,
  high: RED, severe: RED,
};

type PlantWithScan = Plant & { latestScan: Scan | null; scanCount: number };

function shortId(id: string): string {
  return '#' + id.replace(/-/g, '').slice(0, 5).toUpperCase();
}

function formatCoords(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
}

function markerColor(p: PlantWithScan): string {
  if (!p.latestScan) return '#8A9A91';
  return p.latestScan.is_healthy ? ACCENT : RED;
}

function centroidRegion(plants: PlantWithScan[]): Region {
  const lats = plants.map(p => p.latitude);
  const lons = plants.map(p => p.longitude);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(maxLat - minLat, DELTA) * 1.6,
    longitudeDelta: Math.max(maxLon - minLon, DELTA) * 1.6,
  };
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const { selectedField } = useField();
  const [plants, setPlants] = useState<PlantWithScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapType, setMapType] = useState<MapType>('hybrid');
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedPlant, setSelectedPlant] = useState<PlantWithScan | null>(null);
  const [panelImageUrl, setPanelImageUrl] = useState<string | null>(null);
  const slideAnim = useRef(new Animated.Value(PANEL_HEIGHT)).current;

  const fetchData = useCallback(async () => {
    const [plantsRes, scansRes] = await Promise.all([
      supabase.from('plants').select('*'),
      supabase
        .from('scans')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
    ]);

    const latestByPlant = new Map<string, Scan>();
    const countByPlant = new Map<string, number>();
    for (const scan of (scansRes.data ?? [])) {
      if (scan.plant_id) {
        if (!latestByPlant.has(scan.plant_id)) latestByPlant.set(scan.plant_id, scan as Scan);
        countByPlant.set(scan.plant_id, (countByPlant.get(scan.plant_id) ?? 0) + 1);
      }
    }

    setPlants(
      (plantsRes.data ?? []).map(p => ({
        ...(p as Plant),
        latestScan: latestByPlant.get(p.id) ?? null,
        scanCount: countByPlant.get(p.id) ?? 0,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status !== 'granted') return;
      Location.getCurrentPositionAsync({}).then(loc =>
        setUserCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude })
      );
    });
  }, [fetchData]);

  function openPanel(plant: PlantWithScan) {
    setSelectedPlant(plant);
    setPanelImageUrl(null);

    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();

    if (plant.latestScan?.image_url) {
      supabase.storage
        .from('scan-images')
        .createSignedUrl(plant.latestScan.image_url, 3600)
        .then(({ data }) => setPanelImageUrl(data?.signedUrl ?? null));
    }

    // Pan map up so the marker stays visible above the panel
    mapRef.current?.animateToRegion({
      latitude: plant.latitude - 0.003,
      longitude: plant.longitude,
      latitudeDelta: DELTA,
      longitudeDelta: DELTA,
    }, 350);
  }

  function closePanel() {
    Animated.timing(slideAnim, {
      toValue: PANEL_HEIGHT,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setSelectedPlant(null);
      setPanelImageUrl(null);
    });
  }

  const selectedFieldId = selectedField?.id ?? null;
  const visiblePlants = selectedFieldId
    ? plants.filter(p => p.field_id === selectedFieldId)
    : plants;

  function initialRegion(): Region {
    if (visiblePlants.length > 0) return centroidRegion(visiblePlants);
    if (plants.length > 0) return centroidRegion(plants);
    if (userCoords) return { ...userCoords, latitudeDelta: DELTA, longitudeDelta: DELTA };
    return { latitude: 40.1106, longitude: -88.2073, latitudeDelta: DELTA, longitudeDelta: DELTA };
  }

  function recenter() {
    if (!userCoords) return;
    mapRef.current?.animateToRegion(
      { ...userCoords, latitudeDelta: DELTA, longitudeDelta: DELTA },
      400,
    );
  }

  return (
    <View style={styles.root}>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={ACCENT} />
        </View>
      ) : (
        <>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFillObject}
            provider={PROVIDER_GOOGLE}
            mapType={mapType}
            showsUserLocation
            showsMyLocationButton={false}
            initialRegion={initialRegion()}
            onPress={closePanel}
          >
            {visiblePlants.map(plant => {
              const color = markerColor(plant);
              const isSelected = selectedPlant?.id === plant.id;
              return (
                <Marker
                  key={plant.id}
                  coordinate={{ latitude: plant.latitude, longitude: plant.longitude }}
                  tracksViewChanges={isSelected}
                  onPress={(e) => { e.stopPropagation(); openPanel(plant); }}
                >
                  <View style={[
                    styles.pin,
                    { backgroundColor: color },
                    isSelected && styles.pinSelected,
                  ]}>
                    <View style={styles.pinCore} />
                  </View>
                </Marker>
              );
            })}
          </MapView>

          {/* Field selector */}
          <TouchableOpacity
            style={[styles.fieldPill, { top: insets.top + 12 }]}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.fieldPillText} numberOfLines={1}>
              {selectedField?.name ?? 'All Fields'}
            </Text>
            <ChevronDown size={13} color={SUBTLE} strokeWidth={1.5} />
          </TouchableOpacity>

          {/* Layer toggle */}
          <View style={[styles.topRight, { top: insets.top + 12 }]}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => setMapType(t => (t === 'hybrid' ? 'standard' : 'hybrid'))}
              activeOpacity={0.85}
            >
              <Layers size={18} color="#E1E3E1" strokeWidth={1.5} />
            </TouchableOpacity>
          </View>

          {/* Recenter FAB */}
          <TouchableOpacity
            style={[styles.fab, { bottom: insets.bottom + 80 }]}
            onPress={recenter}
            activeOpacity={0.85}
          >
            <LocateFixed size={20} color={ACCENT} strokeWidth={1.5} />
          </TouchableOpacity>

          {/* Plant panel — slides up from bottom on marker tap */}
          <Animated.View
            style={[
              styles.panel,
              { bottom: insets.bottom + 68, transform: [{ translateY: slideAnim }] },
            ]}
          >
            {selectedPlant ? (
              <PlantPanel
                plant={selectedPlant}
                imageUrl={panelImageUrl}
                onClose={closePanel}
                onChat={() => {
                  closePanel();
                  router.push(
                    `/chat?plantId=${selectedPlant.id}&plantName=${encodeURIComponent(
                      selectedPlant.nickname ?? shortId(selectedPlant.id)
                    )}&fieldName=`
                  );
                }}
                onHistory={() => {
                  closePanel();
                  router.push('/(tabs)/history');
                }}
              />
            ) : null}
          </Animated.View>
        </>
      )}

      <FieldSelectorModal visible={modalVisible} onClose={() => setModalVisible(false)} />
    </View>
  );
}

// ─── Plant panel ──────────────────────────────────────────────────────────────

function PlantPanel({
  plant, imageUrl, onClose, onChat, onHistory,
}: {
  plant: PlantWithScan;
  imageUrl: string | null;
  onClose: () => void;
  onChat: () => void;
  onHistory: () => void;
}) {
  const scan = plant.latestScan;
  const healthColor = scan ? (scan.is_healthy ? ACCENT : RED) : '#8A9A91';
  const displayName = plant.nickname ?? shortId(plant.id);
  const severityColor = scan?.severity
    ? (SEVERITY_COLOR[scan.severity.toLowerCase()] ?? null)
    : null;
  const confidencePct = scan ? Math.round(scan.confidence * 100) : null;

  const metaParts: string[] = [];
  if (plant.plant_type) metaParts.push(plant.plant_type);
  metaParts.push(formatCoords(plant.latitude, plant.longitude));
  if (plant.scanCount > 0) metaParts.push(`${plant.scanCount} scan${plant.scanCount !== 1 ? 's' : ''}`);
  const metaLine = metaParts.join('  ·  ');

  return (
    <>
      {/* Header */}
      <View style={styles.panelHeader}>
        <View style={[styles.panelDot, { backgroundColor: healthColor }]} />
        <Text style={styles.panelTitle} numberOfLines={1}>{displayName}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.panelClose}>
          <X size={16} color={SUBTLE} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* Scan details */}
      {scan ? (
        <View style={styles.panelScanRow}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.panelThumb} resizeMode="cover" />
          ) : (
            <View style={[styles.panelThumb, styles.panelThumbPlaceholder]} />
          )}
          <View style={styles.panelScanInfo}>
            <Text style={styles.panelDisease} numberOfLines={2}>
              {scan.is_healthy ? 'No disease detected' : scan.disease_name}
            </Text>
            {confidencePct !== null && (
              <Text style={styles.panelConf}>{confidencePct}% confidence</Text>
            )}
            {!scan.is_healthy && severityColor ? (
              <View style={[styles.panelPill, { borderColor: severityColor + '55', backgroundColor: severityColor + '15' }]}>
                <Text style={[styles.panelPillText, { color: severityColor }]}>{scan.severity}</Text>
              </View>
            ) : scan.is_healthy ? (
              <View style={[styles.panelPill, { borderColor: ACCENT + '55', backgroundColor: ACCENT + '15' }]}>
                <Text style={[styles.panelPillText, { color: ACCENT }]}>Healthy</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.panelNoScan}>
          <Text style={styles.panelNoScanText}>No scans yet for this plant</Text>
        </View>
      )}

      {/* Meta line */}
      <Text style={styles.panelMeta} numberOfLines={1}>{metaLine}</Text>

      {/* Divider */}
      <View style={styles.panelDivider} />

      {/* Action buttons */}
      <View style={styles.panelActions}>
        <TouchableOpacity style={styles.panelBtnSecondary} onPress={onHistory} activeOpacity={0.8}>
          <Clock size={15} color="#E1E3E1" strokeWidth={1.8} />
          <Text style={styles.panelBtnSecondaryText}>View History</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.panelBtnPrimary} onPress={onChat} activeOpacity={0.8}>
          <MessageSquare size={15} color={BG} strokeWidth={2} />
          <Text style={styles.panelBtnPrimaryText}>Chat AI</Text>
          <ChevronRight size={14} color={BG} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  pin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.45)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 4,
    elevation: 5,
  },
  pinSelected: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  pinCore: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.65)',
  },

  fieldPill: {
    position: 'absolute',
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 21,
    backgroundColor: 'rgba(16,26,20,0.88)',
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    maxWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  fieldPillText: { color: '#E1E3E1', fontSize: 13, fontWeight: '600' },
  topRight: { position: 'absolute', right: 16, gap: 10 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(16,26,20,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  fab: {
    position: 'absolute',
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(16,26,20,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: ACCENT + '45',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },

  // ── Panel ───────────────────────────────────────────────────────────────────
  panel: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 12,
  },

  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  panelDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  panelTitle: {
    color: '#E1E3E1',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    letterSpacing: -0.2,
  },
  panelClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  panelScanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  panelThumb: {
    width: 60,
    height: 60,
    borderRadius: 10,
    flexShrink: 0,
  },
  panelThumbPlaceholder: { backgroundColor: 'rgba(255,255,255,0.07)' },
  panelScanInfo: { flex: 1, gap: 4 },
  panelDisease: { color: '#E1E3E1', fontSize: 14, fontWeight: '600', lineHeight: 19 },
  panelConf: { color: SUBTLE2, fontSize: 12 },
  panelPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  panelPillText: { fontSize: 11, fontWeight: '600' },

  panelNoScan: { paddingVertical: 8 },
  panelNoScanText: { color: SUBTLE2, fontSize: 13 },

  panelMeta: { color: SUBTLE2, fontSize: 11 },

  panelDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: SUBTLE_BORDER,
    marginVertical: 2,
  },

  panelActions: {
    flexDirection: 'row',
    gap: 10,
  },
  panelBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: CARD2,
    borderWidth: 1,
    borderColor: SUBTLE_BORDER,
  },
  panelBtnSecondaryText: { color: '#E1E3E1', fontSize: 14, fontWeight: '600' },
  panelBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: ACCENT,
  },
  panelBtnPrimaryText: { color: BG, fontSize: 14, fontWeight: '700' },
});
