import { View, Text, Image, TouchableOpacity } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { FieldCondition } from '../types';

export default function FieldConditions({ condition }: { condition: FieldCondition }) {
  return (
    <View className="mb-24">
      <Text className="text-white text-lg font-bold mb-4">Field Conditions</Text>
      <TouchableOpacity className="bg-app-card p-4 rounded-2xl border border-white/5 flex-row items-center">
        <Image source={{ uri: condition.imageUrl }} className="w-16 h-16 rounded-xl mr-4" />
        <View className="flex-1">
          <Text className="text-app-warning font-bold text-sm mb-1">{condition.title}</Text>
          <Text className="text-app-subtext text-xs leading-4">{condition.description}</Text>
        </View>
        <ChevronRight size={20} color="#8A9A91" />
      </TouchableOpacity>
    </View>
  );
}
