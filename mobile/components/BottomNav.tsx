import { View, Text, TouchableOpacity, Dimensions } from 'react-native';
import { Home, Map, MessageSquare, User, Camera } from 'lucide-react-native';
import { useRouter, usePathname } from 'expo-router';

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/' || pathname === '/index';
    return pathname.includes(path);
  };

  const NavItem = ({ icon: Icon, label, path }: any) => {
    const active = isActive(path);
    return (
      <TouchableOpacity 
        onPress={() => router.push(path)}
        className="items-center justify-center w-12"
      >
        <Icon 
          size={24} 
          color={active ? '#2ED158' : '#8A9A91'} 
        />
        <Text className={`text-[10px] mt-1 ${active ? 'text-app-accent font-bold' : 'text-app-subtext'}`}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View className="absolute bottom-6 left-4 right-4 h-16 bg-[#1C2921]/95 border border-white/10 rounded-full flex-row items-center justify-between px-6 shadow-xl backdrop-blur-md">
      <NavItem icon={Home} label="Home" path="/" />
      <NavItem icon={Map} label="Scout" path="/scout" />

      {/* Floating Center Button */}
      <View className="relative -top-6">
        <TouchableOpacity 
          onPress={() => router.push('/scan')}
          className="w-16 h-16 bg-app-accent rounded-full items-center justify-center shadow-lg shadow-app-accent/50 border-4 border-[#101A14]"
        >
          <Camera size={28} color="#101A14" />
        </TouchableOpacity>
      </View>

      <NavItem icon={MessageSquare} label="Chat" path="/chat" />
      <NavItem icon={User} label="Profile" path="/profile" />
    </View>
  );
}
