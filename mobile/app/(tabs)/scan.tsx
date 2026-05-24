import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  GestureResponderEvent,
  Image,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Accelerometer } from 'expo-sensors';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as GalleryIcon, RefreshCw, RotateCcw, Scan, X, Zap, ZapOff } from 'lucide-react-native';
import { postPredict } from '../../lib/api';
import { setResult } from '../../lib/resultCache';

const { width: W, height: H } = Dimensions.get('window');
const FRAME_SIZE = Math.round(W * 0.72);
const FRAME_LEFT = (W - FRAME_SIZE) / 2;
const FRAME_TOP = Math.round(H * 0.28);
const ARM = 28;
const THICK = 3;
const RAD = 6;

const TRACK_W = Math.round(W * 0.62);
const ZOOM_SLIDER_MAX = 4 / 9;

const PRESETS: { label: string; z: number }[] = [
  { label: '1×', z: 0 },
  { label: '2×', z: 1 / 9 },
  { label: '5×', z: 4 / 9 },
];

const ACCENT = '#2ED158';
const AMBER = '#F5A623';
const BAND = 'rgba(16, 26, 20, 0.72)';
const BG = '#101A14';
const PILL_BG = 'rgba(16, 26, 20, 0.78)';
const BTN_BG = 'rgba(28, 41, 33, 0.88)';
const SUBTLE = 'rgba(225, 227, 225, 0.70)';
const SUBTLE_BORDER = 'rgba(225, 227, 225, 0.14)';

const STABILITY_THRESHOLD = 0.06;
const STABILITY_WINDOW_MS = 600;

type ScanState = 'idle' | 'captured' | 'analyzing';

function zoomDisplay(z: number) {
  const x = 1 + z * 9;
  return x < 10 ? `${x.toFixed(1)}×` : '10×';
}

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [flash, setFlash] = useState<'on' | 'off'>('off');
  const [stable, setStable] = useState(false);
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0);

  const cameraRef = useRef<CameraView>(null);
  const stableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPinchDistance = useRef<number | null>(null);
  const zoomFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoomRef = useRef(0);
  const sliderBase = useRef(0);

  const pulse = useRef(new Animated.Value(1)).current;
  const flipSpin = useRef(new Animated.Value(0)).current;
  const cameraFlash = useRef(new Animated.Value(0)).current;
  const qualityOpacity = useRef(new Animated.Value(0)).current;
  const previewOpacity = useRef(new Animated.Value(0)).current;
  const zoomPillOpacity = useRef(new Animated.Value(0)).current;

  const sliderPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const touchX = Math.min(Math.max(e.nativeEvent.locationX, 0), TRACK_W);
        const tapZ = (touchX / TRACK_W) * ZOOM_SLIDER_MAX;
        zoomRef.current = tapZ;
        setZoom(tapZ);
        sliderBase.current = tapZ;
      },
      onPanResponderMove: (_, gs) => {
        const next = Math.min(1, Math.max(0, sliderBase.current + (gs.dx / TRACK_W) * ZOOM_SLIDER_MAX));
        zoomRef.current = next;
        setZoom(next);
      },
    })
  ).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.018, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);

  useEffect(() => {
    Accelerometer.setUpdateInterval(80);
    let lastX = 0, lastY = 0, lastZ = 0;

    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const moving = Math.abs(x - lastX) + Math.abs(y - lastY) + Math.abs(z - lastZ) > STABILITY_THRESHOLD;
      lastX = x; lastY = y; lastZ = z;

      if (moving) {
        if (stableTimerRef.current) { clearTimeout(stableTimerRef.current); stableTimerRef.current = null; }
        setStable(false);
      } else if (!stableTimerRef.current) {
        stableTimerRef.current = setTimeout(() => { setStable(true); stableTimerRef.current = null; }, STABILITY_WINDOW_MS);
      }
    });

    Animated.timing(qualityOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();

    return () => {
      sub.remove();
      if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
      if (zoomFadeTimer.current) clearTimeout(zoomFadeTimer.current);
    };
  }, [qualityOpacity]);

  const frameStyle = { transform: [{ scale: pulse }] };

  const flashZoomPill = () => {
    zoomPillOpacity.setValue(1);
    if (zoomFadeTimer.current) clearTimeout(zoomFadeTimer.current);
    zoomFadeTimer.current = setTimeout(() => {
      Animated.timing(zoomPillOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start();
    }, 1000);
  };

  const handleFlip = () => {
    flipSpin.setValue(0);
    Animated.timing(flipSpin, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    Animated.sequence([
      Animated.timing(cameraFlash, { toValue: 0.55, duration: 120, useNativeDriver: true }),
      Animated.timing(cameraFlash, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start();
    setFacing(f => (f === 'back' ? 'front' : 'back'));
  };

  const flipRotate = flipSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  const handleTouchMove = (e: GestureResponderEvent) => {
    if (scanState !== 'idle') return;
    const touches = e.nativeEvent.touches;
    if (touches.length !== 2) { lastPinchDistance.current = null; return; }
    const [t1, t2] = touches;
    const dist = Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY);
    if (lastPinchDistance.current !== null) {
      const delta = dist - lastPinchDistance.current;
      setZoom(z => {
        const next = Math.min(1, Math.max(0, z + delta * 0.004));
        zoomRef.current = next;
        if (next !== z) flashZoomPill();
        return next;
      });
    }
    lastPinchDistance.current = dist;
  };

  const handleTouchEnd = (e: GestureResponderEvent) => {
    if (e.nativeEvent.touches.length < 2) lastPinchDistance.current = null;
  };

  const showPreview = (uri: string) => {
    setCapturedUri(uri);
    setScanState('captured');
    previewOpacity.setValue(0);
    Animated.timing(previewOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  };

  const handleCapture = async () => {
    if (!cameraRef.current || scanState !== 'idle') return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (!photo) return;
      if (mediaPermission?.granted) {
        await MediaLibrary.saveToLibraryAsync(photo.uri);
      } else {
        const { granted } = await requestMediaPermission();
        if (granted) await MediaLibrary.saveToLibraryAsync(photo.uri);
      }
      showPreview(photo.uri);
    } catch {
      setError('Failed to capture photo');
    }
  };

  const handleGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!result.canceled && result.assets[0]) showPreview(result.assets[0].uri);
  };

  const handleRetake = () => {
    setCapturedUri(null);
    setScanState('idle');
    setError(null);
    previewOpacity.setValue(0);
  };

  const handleAnalyze = async () => {
    if (!capturedUri) return;
    setScanState('analyzing');
    setError(null);
    try {
      const result = await postPredict(capturedUri);
      setResult(result.scan_id, result);
      router.push(`/result/${result.scan_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
      setScanState('captured');
    }
  };

  if (!permission) return <View style={{ flex: 1, backgroundColor: BG }} />;

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 }}>
        <Text style={{ color: '#E1E3E1', fontSize: 16, textAlign: 'center' }}>Camera access is needed to scan plant leaves</Text>
        {permission.canAskAgain ? (
          <TouchableOpacity onPress={requestPermission} style={{ backgroundColor: ACCENT, paddingHorizontal: 28, paddingVertical: 13, borderRadius: 8 }}>
            <Text style={{ color: BG, fontSize: 15, fontWeight: '600' }}>Allow Camera</Text>
          </TouchableOpacity>
        ) : (
          <Text style={{ color: SUBTLE, fontSize: 14, textAlign: 'center' }}>Open Settings → Privacy → Camera and enable access for Expo Go.</Text>
        )}
      </View>
    );
  }

  const thumbX = Math.min(zoom / ZOOM_SLIDER_MAX, 1) * TRACK_W;

  return (
    <View style={{ flex: 1, backgroundColor: BG }} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} flash={flash} zoom={zoom} />

      <Animated.View pointerEvents="none" style={{ position: 'absolute', inset: 0, backgroundColor: '#000', opacity: cameraFlash }} />

      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: FRAME_TOP, backgroundColor: BAND }} />
      <View style={{ position: 'absolute', top: FRAME_TOP + FRAME_SIZE, left: 0, right: 0, bottom: 0, backgroundColor: BAND }} />
      <View style={{ position: 'absolute', top: FRAME_TOP, left: 0, width: FRAME_LEFT, height: FRAME_SIZE, backgroundColor: BAND }} />
      <View style={{ position: 'absolute', top: FRAME_TOP, right: 0, width: FRAME_LEFT, height: FRAME_SIZE, backgroundColor: BAND }} />

      <Animated.View style={{ position: 'absolute', top: FRAME_TOP, left: FRAME_LEFT, width: FRAME_SIZE, height: FRAME_SIZE, ...frameStyle }}>
        <View style={{ position: 'absolute', top: 0, left: 0, width: ARM, height: ARM, borderTopWidth: THICK, borderLeftWidth: THICK, borderColor: ACCENT, borderTopLeftRadius: RAD }} />
        <View style={{ position: 'absolute', top: 0, right: 0, width: ARM, height: ARM, borderTopWidth: THICK, borderRightWidth: THICK, borderColor: ACCENT, borderTopRightRadius: RAD }} />
        <View style={{ position: 'absolute', bottom: 0, left: 0, width: ARM, height: ARM, borderBottomWidth: THICK, borderLeftWidth: THICK, borderColor: ACCENT, borderBottomLeftRadius: RAD }} />
        <View style={{ position: 'absolute', bottom: 0, right: 0, width: ARM, height: ARM, borderBottomWidth: THICK, borderRightWidth: THICK, borderColor: ACCENT, borderBottomRightRadius: RAD }} />
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', top: FRAME_TOP + FRAME_SIZE / 2 - 16, left: 0, right: 0, alignItems: 'center', opacity: zoomPillOpacity }}
      >
        <View style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: PILL_BG, borderWidth: 1, borderColor: SUBTLE_BORDER }}>
          <Text style={{ color: '#E1E3E1', fontSize: 13, fontWeight: '600' }}>{zoomDisplay(zoom)}</Text>
        </View>
      </Animated.View>

      <View style={{ position: 'absolute', top: FRAME_TOP + FRAME_SIZE + 14, left: 0, right: 0, alignItems: 'center', gap: 8 }}>
        <Text style={{ color: SUBTLE, fontSize: 14, letterSpacing: 0.3 }}>Position leaf within frame</Text>
        <Animated.View
          style={{
            opacity: qualityOpacity,
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
            backgroundColor: PILL_BG, borderWidth: 1, borderColor: SUBTLE_BORDER,
          }}
        >
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: stable ? ACCENT : AMBER }} />
          <Text style={{ color: stable ? ACCENT : AMBER, fontSize: 12, fontWeight: '500', letterSpacing: 0.2 }}>
            {stable ? 'Steady' : 'Hold still'}
          </Text>
        </Animated.View>
      </View>

      <View style={{ position: 'absolute', top: insets.top + 12, left: 20, right: 20 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          backgroundColor: PILL_BG, borderRadius: 14, borderWidth: 1, borderColor: SUBTLE_BORDER,
          paddingVertical: 10, paddingHorizontal: 16,
        }}>
          <View style={{ flex: 1 }}>
            <TouchableOpacity onPress={() => router.navigate('/')} accessibilityLabel="Close scanner" hitSlop={12}>
              <X size={22} color={SUBTLE} strokeWidth={1.5} />
            </TouchableOpacity>
          </View>
          <Text style={{ color: '#E1E3E1', fontSize: 16, fontWeight: '600' }}>Scan</Text>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <TouchableOpacity onPress={() => setFlash(f => (f === 'off' ? 'on' : 'off'))} accessibilityLabel="Toggle flash" hitSlop={12}>
              {flash === 'off'
                ? <ZapOff size={20} color={SUBTLE} strokeWidth={1.5} />
                : <Zap size={20} color={ACCENT} strokeWidth={1.5} />}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {scanState === 'idle' && (
        <View style={{ position: 'absolute', bottom: insets.bottom + 16, left: 0, right: 0, alignItems: 'center', gap: 20 }}>
          <View style={{ width: TRACK_W, alignItems: 'center' }}>
            <View style={{ width: TRACK_W, height: 40, justifyContent: 'center' }} {...sliderPan.panHandlers}>
              <View style={{ height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.18)' }} />

              <View
                style={{
                  position: 'absolute', left: 0, width: thumbX,
                  height: 2, borderRadius: 1, backgroundColor: ACCENT,
                }}
              />

              {PRESETS.map(({ z }) => {
                const x = (z / ZOOM_SLIDER_MAX) * TRACK_W;
                return (
                  <View
                    key={z}
                    style={{
                      position: 'absolute', left: x - 1,
                      width: 2, height: 8, borderRadius: 1,
                      backgroundColor: zoom >= z - 0.005 ? ACCENT : 'rgba(255,255,255,0.30)',
                      top: 16,
                    }}
                  />
                );
              })}

              <View
                style={{
                  position: 'absolute', left: thumbX - 22,
                  width: 44, height: 26, borderRadius: 13,
                  backgroundColor: '#ffffff',
                  alignItems: 'center', justifyContent: 'center',
                  shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.35, shadowRadius: 4, elevation: 4,
                }}
              >
                <Text style={{ color: BG, fontSize: 11, fontWeight: '700', letterSpacing: 0.2 }}>
                  {zoomDisplay(zoom)}
                </Text>
              </View>
            </View>

            <View style={{ width: TRACK_W, flexDirection: 'row', marginTop: 4 }}>
              {PRESETS.map(({ label, z }) => {
                const x = (z / ZOOM_SLIDER_MAX) * TRACK_W;
                const active = Math.abs(zoom - z) < 0.015;
                return (
                  <TouchableOpacity
                    key={z}
                    onPress={() => { zoomRef.current = z; setZoom(z); }}
                    hitSlop={8}
                    style={{ position: 'absolute', left: x - 14, width: 28, alignItems: 'center' }}
                  >
                    <Text style={{ color: active ? ACCENT : SUBTLE, fontSize: 11, fontWeight: active ? '600' : '400' }}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 40 }}>
            <TouchableOpacity
              accessibilityLabel="Open gallery"
              onPress={handleGallery}
              style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: BTN_BG, borderWidth: 1, borderColor: SUBTLE_BORDER, alignItems: 'center', justifyContent: 'center' }}
            >
              <GalleryIcon size={22} color={SUBTLE} strokeWidth={1.5} />
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityLabel="Capture photo"
              onPress={handleCapture}
              style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 3, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center' }}
            >
              <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: '#ffffff' }} />
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityLabel="Flip camera"
              onPress={handleFlip}
              style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: BTN_BG, borderWidth: 1, borderColor: SUBTLE_BORDER, alignItems: 'center', justifyContent: 'center' }}
            >
              <Animated.View style={{ transform: [{ rotate: flipRotate }] }}>
                <RefreshCw size={20} color={SUBTLE} strokeWidth={1.5} />
              </Animated.View>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {(scanState === 'captured' || scanState === 'analyzing') && capturedUri && (
        <Animated.View style={{ position: 'absolute', inset: 0, backgroundColor: BG, opacity: previewOpacity }}>
          <Image source={{ uri: capturedUri }} style={StyleSheet.absoluteFillObject} resizeMode="contain" />

          {error && (
            <View style={{ position: 'absolute', top: insets.top + 16, left: 20, right: 20 }}>
              <View style={{ backgroundColor: 'rgba(200,60,60,0.90)', borderRadius: 12, padding: 12 }}>
                <Text style={{ color: '#fff', fontSize: 13, textAlign: 'center' }}>{error}</Text>
              </View>
            </View>
          )}

          <View style={{ position: 'absolute', bottom: insets.bottom + 24, left: 24, right: 24, gap: 12 }}>
            {scanState === 'analyzing' ? (
              <View style={{ alignItems: 'center', gap: 12 }}>
                <ActivityIndicator color={ACCENT} size="large" />
                <Text style={{ color: SUBTLE, fontSize: 14 }}>Analyzing leaf…</Text>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  accessibilityLabel="Analyze leaf"
                  onPress={handleAnalyze}
                  style={{ backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <Scan size={20} color={BG} strokeWidth={2} />
                  <Text style={{ color: BG, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 }}>Analyze</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  accessibilityLabel="Retake photo"
                  onPress={handleRetake}
                  style={{ backgroundColor: BTN_BG, borderRadius: 14, borderWidth: 1, borderColor: SUBTLE_BORDER, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <RotateCcw size={18} color={SUBTLE} strokeWidth={1.5} />
                  <Text style={{ color: SUBTLE, fontSize: 15, fontWeight: '500' }}>Retake</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Animated.View>
      )}
    </View>
  );
}
