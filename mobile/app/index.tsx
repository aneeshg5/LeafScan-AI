import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Header from '../components/Header';
import StatsSection from '../components/StatsSection';
import RecentDiagnoses from '../components/RecentDiagnoses';
import FieldConditions from '../components/FieldConditions';
import { Diagnosis, HealthStatus, FieldCondition, UserStats } from '../types';

// Mock Data
const userStats: UserStats = { scansToday: 48, scanIncrease: 12, highRisks: 3 };

const recentDiagnoses: Diagnosis[] = [
  { 
    id: '1', 
    plantName: 'Corn (Maize)', 
    condition: 'Field A - North Sector', 
    location: 'Field A', 
    time: '10:42 AM', 
    confidence: 98, 
    status: HealthStatus.Healthy, 
    imageUrl: 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?q=80&w=400' 
  },
  { 
    id: '2', 
    plantName: 'Wheat Rust', 
    condition: 'Field B - Row 14', 
    location: 'Field B', 
    time: '09:15 AM', 
    confidence: 92, 
    status: HealthStatus.Infected, 
    imageUrl: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?q=80&w=400' 
  },
];

const fieldCondition: FieldCondition = { 
  id: '1', 
  title: 'Soil Moisture Low', 
  description: 'Sector 4 reported 22% moisture levels. Consider irrigation schedule update.', 
  imageUrl: 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?q=80&w=400', 
  alertLevel: 'Medium' 
};

export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-app-bg" edges={['top']}>
      <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
        <Header />
        <StatsSection stats={userStats} />
        <RecentDiagnoses diagnoses={recentDiagnoses} />
        <FieldConditions condition={fieldCondition} />
      </ScrollView>
    </SafeAreaView>
  );
}
