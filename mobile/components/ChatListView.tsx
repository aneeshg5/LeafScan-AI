import { View, Text, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { Search, Mic, Camera, Sparkles, Clock, Filter } from 'lucide-react-native';
import { ChatSession } from '../types';

interface Props {
  chats: ChatSession[];
  onSelectChat: (id: string) => void;
  onStartNewChat: () => void;
}

export default function ChatListView({ chats, onSelectChat, onStartNewChat }: Props) {
  return (
    <View className="flex-1 bg-[#101A14] pt-12 px-5">
      {/* Header */}
      <View className="flex-row items-center mb-1">
        <View className="bg-[#2ED158]/20 w-10 h-10 rounded-xl items-center justify-center mr-3">
          <Sparkles size={20} color="#2ED158" fill="#2ED158" />
        </View>
        <Text className="text-white text-2xl font-bold">AgriScan AI</Text>
      </View>
      <Text className="text-gray-400 text-sm mb-6 ml-1 leading-5">
        Ask about crop health, analyze images, or check field logs.
      </Text>

      {/* Main Input Field - Fixed Height */}
      <TouchableOpacity 
        onPress={onStartNewChat}
        activeOpacity={0.8}
        className="bg-[#1C2921] h-16 rounded-3xl flex-row items-center px-5 mb-6 border border-white/10"
      >
        <View className="mr-4">
            <Text className="text-gray-400 text-2xl rotate-45" style={{ lineHeight: 28 }}>📎</Text>
        </View>
        <Text className="flex-1 text-gray-400 text-lg">Ask anything...</Text>
        <View className="flex-row gap-4 opacity-70">
             <Mic size={24} color="#A3A3A3" />
             <Camera size={24} color="#A3A3A3" />
        </View>
      </TouchableOpacity>

      {/* Suggestion Chips - Wrapped to prevent expansion */}
      <View className="h-10 mb-8">
        <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={{ alignItems: 'center', paddingRight: 20 }}
        >
            {[
            { text: 'Identify this pest', color: '#1C2921' },
            { text: 'Why is my corn yellowing?', color: '#1C2921' },
            { text: 'Irrigation schedule', color: '#1C2921' }
            ].map((chip, index) => (
            <TouchableOpacity 
                key={index} 
                onPress={onStartNewChat}
                className="bg-[#1C2921] border border-white/10 h-10 px-4 rounded-full mr-3 items-center justify-center"
            >
                <Text className="text-gray-200 text-sm font-medium">{chip.text}</Text>
            </TouchableOpacity>
            ))}
        </ScrollView>
      </View>

      {/* Search & Filter - Fixed Height */}
      <View className="flex-row gap-3 mb-8 h-12">
        <View className="flex-1 bg-[#1C2921] rounded-2xl flex-row items-center px-4 border border-white/5">
            <Search size={18} color="#737373" />
            <TextInput 
              placeholder="Search history..." 
              placeholderTextColor="#737373"
              className="flex-1 ml-3 text-white text-base h-full"
            />
        </View>
        <TouchableOpacity className="bg-[#1C2921] w-12 h-12 rounded-2xl items-center justify-center border border-white/5">
            <Filter size={20} color="#737373" />
        </TouchableOpacity>
      </View>

      {/* Recent Activity Section */}
      <View className="flex-row items-center mb-4">
        <Clock size={14} color="#A3A3A3" />
        <Text className="text-gray-400 text-xs font-bold ml-2 tracking-widest">RECENT ACTIVITY</Text>
      </View>

      <ScrollView className="flex-1">
        {chats.length === 0 ? (
          <View className="items-center justify-center py-12 opacity-30">
            <Text className="text-gray-400 font-medium">No conversations found.</Text>
          </View>
        ) : (
          chats.map((chat) => (
            <TouchableOpacity 
              key={chat.id} 
              onPress={() => onSelectChat(chat.id)}
              className="py-4 border-b border-white/5"
            >
              <Text className="text-white font-medium text-base mb-1">{chat.title}</Text>
              <Text className="text-gray-500 text-sm" numberOfLines={1}>{chat.preview}</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}
