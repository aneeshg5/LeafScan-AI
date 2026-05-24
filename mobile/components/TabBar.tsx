import { Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, Clock, Home, Map, Settings } from 'lucide-react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const TABS = [
  { label: 'Home', Icon: Home },
  { label: 'Map', Icon: Map },
  { label: 'Scan', Icon: Camera },
  { label: 'History', Icon: Clock },
  { label: 'Settings', Icon: Settings },
] as const;

const ACCENT = '#2ED158';
const MUTED = '#8A9A91';
const BG = '#101A14';
const CARD = '#1C2921';

const CAMERA_TOP = -30;

export default function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const cameraFocused = state.index === 2;

  const makeOnPress = (index: number, isFocused: boolean) => () => {
    const event = navigation.emit({
      type: 'tabPress',
      target: state.routes[index].key,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(state.routes[index].name);
    }
  };

  return (
    <View
      style={{
        backgroundColor: CARD,
        borderTopWidth: 1,
        borderTopColor: 'rgba(46, 209, 88, 0.15)',
        paddingTop: 4,
        paddingHorizontal: 4,
        paddingBottom: insets.bottom,
        overflow: 'visible',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', overflow: 'visible' }}>
        {TABS.map(({ label, Icon }, index) => {
          const isFocused = state.index === index;
          const isCamera = index === 2;
          const color = isFocused ? ACCENT : MUTED;
          const onPress = makeOnPress(index, isFocused);

          if (isCamera) {
            return (
              <TouchableOpacity
                key={index}
                onPress={onPress}
                accessibilityLabel="Scan"
                accessibilityRole="button"
                style={{ flex: 1, alignItems: 'center', paddingVertical: 2 }}
              >
                <View style={{ width: 40, height: 36 }} />
                <Text style={{ color: cameraFocused ? ACCENT : MUTED, fontSize: 11, marginTop: 2, fontWeight: cameraFocused ? '500' : '400' }}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              key={index}
              onPress={onPress}
              accessibilityLabel={label}
              accessibilityRole="tab"
              style={{ flex: 1, alignItems: 'center', paddingVertical: 2 }}
            >
              <View
                style={{
                  width: 40,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: isFocused ? 'rgba(46, 209, 88, 0.10)' : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={28} color={color} strokeWidth={1.5} />
              </View>
              <Text style={{ color, fontSize: 11, marginTop: 2, fontWeight: isFocused ? '500' : '400' }}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 0, right: 0, top: CAMERA_TOP, alignItems: 'center' }}
      >
        <View style={{ width: 68, height: 68, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              position: 'absolute',
              width: 68,
              height: 68,
              borderRadius: 36,
              borderWidth: 2.5,
              borderColor: 'rgb(138, 154, 145)',
            }}
          />
          <TouchableOpacity
            onPress={makeOnPress(2, cameraFocused)}
            accessibilityLabel="Scan"
            accessibilityRole="button"
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: ACCENT,
                borderWidth: 2,
                borderColor: 'rgba(255, 255, 255, 0.22)',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: ACCENT,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.5,
                shadowRadius: 14,
                elevation: 8,
              }}
            >
              <Camera size={29} color={BG} strokeWidth={2} />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
