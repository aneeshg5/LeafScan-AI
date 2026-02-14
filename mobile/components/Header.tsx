import { View, Text } from 'react-native';
import { Sun } from 'lucide-react-native';

export default function Header() {
  return (
    <View className="flex-row justify-between items-center mb-6 mt-2">
      <View>
        <Text className="text-app-subtext text-sm font-sans">Good Morning, Alex</Text>
        <Text className="text-white text-3xl font-bold font-sans">Dashboard</Text>
      </View>
      <View className="bg-app-card px-3 py-1.5 rounded-full flex-row items-center border border-white/5">
        <Sun size={16} color="#F59E0B" />
        <Text className="text-white ml-2 font-bold">24°C</Text>
      </View>
    </View>
  );
}
