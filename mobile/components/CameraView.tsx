import { View, Text, TouchableOpacity, Dimensions } from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { X, Zap, ZapOff, Image as ImageIcon } from 'lucide-react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';

export default function CameraScreenComponent() {
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const router = useRouter();

  if (!permission) return <View />;
  if (!permission.granted) {
    return (
      <View className="flex-1 justify-center items-center bg-black">
        <Text className="text-white mb-4">We need your permission to show the camera</Text>
        <TouchableOpacity onPress={requestPermission} className="bg-app-accent px-4 py-2 rounded">
          <Text className="font-bold">Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView 
        style={{ flex: 1 }} 
        facing={facing}
        enableTorch={flash}
      >
        {/* Top Controls */}
        <View className="flex-row justify-between items-center px-6 pt-12">
            <TouchableOpacity onPress={() => setFlash(!flash)} className="w-10 h-10 bg-black/40 rounded-full items-center justify-center">
                {flash ? <Zap size={20} color="#F59E0B" /> : <ZapOff size={20} color="white" />}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 bg-black/40 rounded-full items-center justify-center">
                <X size={24} color="white" />
            </TouchableOpacity>
        </View>

        {/* Center Frame */}
        <View className="flex-1 justify-center items-center">
            <View className="w-64 h-64 border-2 border-white/50 rounded-xl relative">
                <View className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-app-accent -mt-1 -ml-1" />
                <View className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-app-accent -mt-1 -mr-1" />
                <View className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-app-accent -mb-1 -ml-1" />
                <View className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-app-accent -mb-1 -mr-1" />
                <Text className="text-white text-center mt-32 font-bold opacity-80">Align Leaf</Text>
            </View>
        </View>

        {/* Bottom Controls */}
        <View className="pb-12 items-center">
            {/* Mode Selector */}
            <View className="flex-row bg-black/50 rounded-full p-1 mb-8">
                <TouchableOpacity className="px-4 py-1 bg-app-accent rounded-full">
                    <Text className="text-black font-bold text-xs">Leaf Diagnosis</Text>
                </TouchableOpacity>
                <TouchableOpacity className="px-4 py-1">
                    <Text className="text-white font-bold text-xs opacity-50">Pest ID</Text>
                </TouchableOpacity>
            </View>

            <View className="flex-row items-center justify-between w-full px-12">
                <TouchableOpacity className="w-12 h-12 bg-white/10 rounded-xl items-center justify-center">
                    <ImageIcon size={24} color="white" />
                </TouchableOpacity>

                <TouchableOpacity className="w-20 h-20 rounded-full border-4 border-white items-center justify-center">
                    <View className="w-16 h-16 bg-white rounded-full" />
                </TouchableOpacity>

                <View className="w-12" /> 
            </View>
        </View>
      </CameraView>
    </View>
  );
}
