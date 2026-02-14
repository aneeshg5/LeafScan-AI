import { View, Text, TouchableOpacity, Image, Switch, ScrollView } from 'react-native';
import { LogOut, ChevronRight, Settings, Cloud, Ruler, Share2 } from 'lucide-react-native';
import { useState } from 'react';

export default function ProfileView() {
  const [offlineMode, setOfflineMode] = useState(false);

  const SettingRow = ({ icon: Icon, label, value, showArrow = true }: any) => (
    <TouchableOpacity className="flex-row items-center justify-between py-4 border-b border-white/5">
      <View className="flex-row items-center">
        <View className="w-8 h-8 rounded-full bg-app-accent/10 items-center justify-center mr-3">
          <Icon size={16} color="#2ED158" />
        </View>
        <Text className="text-white font-sans text-base">{label}</Text>
      </View>
      <View className="flex-row items-center">
        {value && <Text className="text-app-subtext mr-2">{value}</Text>}
        {showArrow && <ChevronRight size={16} color="#8A9A91" />}
      </View>
    </TouchableOpacity>
  );

  return (
    <ScrollView className="flex-1 bg-app-bg px-4">
      {/* Header */}
      <View className="items-center mt-12 mb-8">
        <View className="w-24 h-24 rounded-full bg-app-card border-2 border-app-accent mb-4 overflow-hidden relative">
             <Image 
                source={{ uri: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200' }} 
                className="w-full h-full"
             />
             <View className="absolute bottom-0 w-full bg-app-accent py-1 items-center">
                <Text className="text-[#101A14] text-[10px] font-bold">PREMIUM</Text>
             </View>
        </View>
        <Text className="text-white text-2xl font-bold">Alex G.</Text>
        <Text className="text-app-subtext">alex@greenacres.com</Text>
      </View>

      {/* Farm Details Card */}
      <View className="bg-app-card rounded-2xl p-4 mb-6 border border-white/5">
        <Text className="text-app-subtext text-xs font-bold uppercase mb-2">Farm Details</Text>
        <SettingRow icon={Share2} label="Farm Name" value="Green Acres" />
        <SettingRow icon={Ruler} label="Total Area" value="1,240 Acres" />
        <SettingRow icon={Map} label="Location" value="Illinois, USA" showArrow={false} />
      </View>

      {/* Preferences Card */}
      <View className="bg-app-card rounded-2xl p-4 mb-8 border border-white/5">
        <Text className="text-app-subtext text-xs font-bold uppercase mb-2">Preferences</Text>
        
        <View className="flex-row items-center justify-between py-4 border-b border-white/5">
           <View className="flex-row items-center">
             <View className="w-8 h-8 rounded-full bg-app-accent/10 items-center justify-center mr-3">
               <Cloud size={16} color="#2ED158" />
             </View>
             <Text className="text-white font-sans text-base">Offline Mode</Text>
           </View>
           <Switch 
             value={offlineMode} 
             onValueChange={setOfflineMode}
             trackColor={{ false: '#3f3f46', true: '#2ED158' }}
             thumbColor={'white'}
           />
        </View>

        <SettingRow icon={Settings} label="Units" value="Metric" />
      </View>

      {/* Logout */}
      <TouchableOpacity className="flex-row items-center justify-center mb-12 bg-app-danger/10 py-4 rounded-xl border border-app-danger/20">
        <LogOut size={20} color="#EF4444" />
        <Text className="text-app-danger font-bold ml-2">Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// Helper component for Icon
import { Map } from 'lucide-react-native';
