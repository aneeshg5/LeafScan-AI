import { Slot, Stack, usePathname } from 'expo-router';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import BottomNav from '../components/BottomNav'; // Ensure this file exists!
import '../global.css';

// Helper component to conditionally render the nav bar
function BottomNavWrapper() {
  const pathname = usePathname();
  
  // Hide the bottom nav on the scan (camera) screen for full immersion
  // Also hide it on chat details screens (if we add routing like /chat/[id])
  if (pathname === '/scan') return null;
  
  return <BottomNav />;
}

export default function Layout() {
  return (
    <View className="flex-1 bg-app-bg relative">
      <StatusBar style="light" />
      
      {/* The main content area (screens) */}
      <View className="flex-1">
        <Stack 
          screenOptions={{ 
            headerShown: false,
            contentStyle: { backgroundColor: '#101A14' }, // Force dark background
            animation: 'fade', // Smooth transitions
          }}
        >
            <Stack.Screen name="index" />
            <Stack.Screen name="scout" />
            <Stack.Screen name="chat" />
            <Stack.Screen name="profile" />
            <Stack.Screen 
              name="scan" 
              options={{ 
                presentation: 'fullScreenModal',
                animation: 'slide_from_bottom' 
              }} 
            />
        </Stack>
      </View>

      {/* Your Custom Floating Navigation Bar */}
      <BottomNavWrapper />
    </View>
  );
}
