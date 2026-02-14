import { View, Text, ScrollView, Image, TouchableOpacity } from 'react-native';
import { Diagnosis, HealthStatus } from '../types';

export default function RecentDiagnoses({ diagnoses }: { diagnoses: Diagnosis[] }) {
  return (
    <View className="mb-8">
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-white text-lg font-bold">Recent Diagnoses</Text>
        <Text className="text-app-accent text-sm">View All</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-4 pl-1">
        {diagnoses.map((item) => (
          <TouchableOpacity key={item.id} className="bg-app-card w-64 rounded-2xl overflow-hidden border border-white/5 mr-4">
            <View className="h-32 w-full relative">
              <Image source={{ uri: item.imageUrl }} className="w-full h-full" resizeMode="cover" />
              <View className="absolute top-2 right-2 bg-black/60 px-2 py-1 rounded-full flex-row items-center">
                <View className={`w-2 h-2 rounded-full mr-2 ${item.status === HealthStatus.Healthy ? 'bg-green-500' : 'bg-red-500'}`} />
                <Text className="text-white text-xs font-bold">{item.status}</Text>
              </View>
            </View>
            
            <View className="p-4">
              <View className="flex-row justify-between mb-1">
                <Text className="text-white font-bold text-base">{item.plantName}</Text>
                <Text className="text-app-subtext text-xs">{item.time}</Text>
              </View>
              <Text className="text-app-subtext text-xs mb-3">{item.condition}</Text>
              
              <View className="w-full bg-white/10 h-1 rounded-full overflow-hidden">
                <View className="bg-app-accent h-full rounded-full" style={{ width: `${item.confidence}%` }} />
              </View>
              <Text className="text-app-accent text-[10px] mt-1 text-right">{item.confidence}% Confidence</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
