import { View, Text } from 'react-native';
import { Scan, AlertTriangle } from 'lucide-react-native';
import { UserStats } from '../types';

export default function StatsSection({ stats }: { stats: UserStats }) {
  return (
    <View className="flex-row gap-4 mb-8">
      {/* Scans Card */}
      <View className="flex-1 bg-app-card p-4 rounded-2xl border border-white/5">
        <View className="flex-row justify-between items-start mb-2">
          <View className="bg-app-accent/20 p-2 rounded-lg">
            <Scan size={20} color="#2ED158" />
          </View>
          <View className="bg-app-accent/10 px-2 py-0.5 rounded text-xs">
            <Text className="text-app-accent text-xs font-bold">+{stats.scanIncrease}%</Text>
          </View>
        </View>
        <Text className="text-3xl font-bold text-white mb-1">{stats.scansToday}</Text>
        <Text className="text-app-subtext text-xs">Scans Today</Text>
      </View>

      {/* Risks Card */}
      <View className="flex-1 bg-app-card p-4 rounded-2xl border border-white/5">
        <View className="flex-row justify-between items-start mb-2">
          <View className="bg-app-warning/20 p-2 rounded-lg">
            <AlertTriangle size={20} color="#F59E0B" />
          </View>
          <View className="bg-app-warning/10 px-2 py-0.5 rounded text-xs">
            <Text className="text-app-warning text-xs font-bold">Alert</Text>
          </View>
        </View>
        <Text className="text-3xl font-bold text-white mb-1">{stats.highRisks}</Text>
        <Text className="text-app-subtext text-xs">High Risks</Text>
      </View>
    </View>
  );
}
