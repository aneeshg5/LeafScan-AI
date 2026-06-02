import { Tabs } from 'expo-router';
import TabBar from '../../components/TabBar';
import { FieldProvider } from '../../lib/FieldContext';

export default function TabLayout() {
  return (
    <FieldProvider>
      <Tabs
        tabBar={(props) => props.state.index === 2 ? null : <TabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="map" />
        <Tabs.Screen name="scan" />
        <Tabs.Screen name="history" />
        <Tabs.Screen name="settings" />
      </Tabs>
    </FieldProvider>
  );
}
