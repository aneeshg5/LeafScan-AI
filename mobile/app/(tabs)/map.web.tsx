import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPin } from 'lucide-react-native';

const BG = '#101A14';
const CARD = '#1C2921';
const ACCENT = '#2ED158';
const SUBTLE = 'rgba(225,227,225,0.65)';

export default function MapScreenWeb() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.card}>
        <MapPin size={48} color={ACCENT} strokeWidth={1.5} />
        <Text style={styles.title}>Field Map</Text>
        <Text style={styles.body}>
          The interactive field map with GPS plant tracking is available in the
          mobile app. Download LeafScan on iOS or Android to view and manage
          your field layout.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 36,
    alignItems: 'center',
    maxWidth: 400,
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#E1E3E1',
    marginTop: 8,
  },
  body: {
    fontSize: 15,
    color: SUBTLE,
    textAlign: 'center',
    lineHeight: 23,
  },
});
