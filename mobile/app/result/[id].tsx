import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, CheckCircle, ChevronLeft, Leaf } from 'lucide-react-native';
import { getResult, clearResult } from '../../lib/resultCache';
import type { PredictResponse } from '../../types';

const BG = '#101A14';
const CARD = '#1C2921';
const ACCENT = '#2ED158';
const AMBER = '#F5A623';
const RED = '#FF4D4D';
const SUBTLE = 'rgba(225, 227, 225, 0.70)';
const SUBTLE_BORDER = 'rgba(225, 227, 225, 0.14)';

const SEVERITY_COLOR: Record<string, string> = {
  low: ACCENT,
  medium: AMBER,
  high: RED,
  severe: RED,
};

export default function ResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [result, setResult] = useState<PredictResponse | null>(null);

  useEffect(() => {
    if (id) {
      const cached = getResult(id);
      if (cached) {
        setResult(cached);
        clearResult(id);
      }
    }
  }, [id]);

  if (!result) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: SUBTLE, fontSize: 15 }}>Result not found.</Text>
        <TouchableOpacity onPress={() => router.navigate('/')} style={{ marginTop: 16 }}>
          <Text style={{ color: ACCENT, fontSize: 15 }}>Go home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const severityColor = result.severity ? (SEVERITY_COLOR[result.severity.toLowerCase()] ?? SUBTLE) : SUBTLE;
  const confidencePct = Math.round(result.confidence * 100);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingBottom: 14,
          paddingHorizontal: 20,
          flexDirection: 'row',
          alignItems: 'center',
          borderBottomWidth: 1,
          borderBottomColor: SUBTLE_BORDER,
        }}
      >
        <TouchableOpacity onPress={() => router.navigate('/')} hitSlop={12} style={{ marginRight: 12 }}>
          <ChevronLeft size={24} color={SUBTLE} strokeWidth={1.5} />
        </TouchableOpacity>
        <Text style={{ color: '#E1E3E1', fontSize: 18, fontWeight: '600', flex: 1 }}>Scan Result</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: insets.bottom + 32 }}>
        <View
          style={{
            backgroundColor: CARD,
            borderRadius: 16,
            padding: 20,
            borderWidth: 1,
            borderColor: result.is_healthy ? 'rgba(46,209,88,0.25)' : 'rgba(255,77,77,0.25)',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {result.is_healthy
            ? <CheckCircle size={44} color={ACCENT} strokeWidth={1.5} />
            : <AlertTriangle size={44} color={RED} strokeWidth={1.5} />
          }
          <Text style={{ color: '#E1E3E1', fontSize: 22, fontWeight: '700', textAlign: 'center' }}>
            {result.disease_name}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Pill label={`${confidencePct}% confidence`} color={SUBTLE} />
            {result.severity && <Pill label={result.severity} color={severityColor} />}
            <Pill label={result.plant_type} color={SUBTLE} />
          </View>
        </View>

        <Section title="About">
          <Text style={{ color: SUBTLE, fontSize: 14, lineHeight: 21 }}>{result.description}</Text>
        </Section>

        {result.treatments.length > 0 && (
          <Section title="Recommended actions">
            <View style={{ gap: 10 }}>
              {result.treatments.map((t, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT, marginTop: 7 }} />
                  <Text style={{ color: SUBTLE, fontSize: 14, lineHeight: 21, flex: 1 }}>{t}</Text>
                </View>
              ))}
            </View>
          </Section>
        )}

        <TouchableOpacity
          onPress={() => router.navigate('/scan')}
          style={{
            backgroundColor: ACCENT,
            borderRadius: 14,
            paddingVertical: 15,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
            marginTop: 4,
          }}
        >
          <Leaf size={20} color={BG} strokeWidth={2} />
          <Text style={{ color: BG, fontSize: 16, fontWeight: '700' }}>Scan another</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: SUBTLE_BORDER, gap: 10 }}>
      <Text style={{ color: '#E1E3E1', fontSize: 14, fontWeight: '600', letterSpacing: 0.3 }}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: SUBTLE_BORDER }}>
      <Text style={{ color, fontSize: 12, fontWeight: '500' }}>{label}</Text>
    </View>
  );
}
