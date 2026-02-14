import { View, Text, TouchableOpacity, Image, Dimensions } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, PROVIDER_DEFAULT } from 'react-native-maps';
import { Layers, MapPin, Navigation, Info, X, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';

// Dark Mode Map Style (Hides roads/labels for a cleaner "Data" look)
const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#212121" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#757575" }] },
  { featureType: "administrative.country", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#181818" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "poi.park", elementType: "labels.text.stroke", stylers: [{ color: "#1b1b1b" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2c2c2c" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#000000" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3d3d3d" }] }
];

// Mock Data for Pins
const PINS = [
  { id: 1, lat: 40.1164, lng: -88.2434, type: 'Healthy', title: 'Sector 4 (Corn)' },
  { id: 2, lat: 40.1180, lng: -88.2400, type: 'Infected', title: 'Blight #2' }, // Red Pin
  { id: 3, lat: 40.1150, lng: -88.2450, type: 'Warning', title: 'Low Moisture' }, // Yellow Pin
];

export default function ScoutView() {
  const [selectedPin, setSelectedPin] = useState<any>(null);

  return (
    <View className="flex-1 bg-app-bg relative">
      <MapView
        provider={PROVIDER_DEFAULT} // Use DEFAULT for iOS (Apple Maps) or GOOGLE if setup
        style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').height }}
        customMapStyle={darkMapStyle}
        initialRegion={{
          latitude: 40.1164,
          longitude: -88.2434,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        onPress={() => setSelectedPin(null)} // Click map to close card
      >
        {PINS.map((pin) => (
          <Marker
            key={pin.id}
            coordinate={{ latitude: pin.lat, longitude: pin.lng }}
            onPress={() => setSelectedPin(pin)}
          >
            {/* Custom Marker UI */}
            <View className={`w-10 h-10 rounded-full items-center justify-center border-2 border-white shadow-lg ${
              pin.type === 'Healthy' ? 'bg-green-500 shadow-green-500/50' : 
              pin.type === 'Infected' ? 'bg-red-500 shadow-red-500/50' : 
              'bg-yellow-500 shadow-yellow-500/50'
            }`}>
               {pin.type === 'Healthy' && <View className="w-3 h-3 bg-white rounded-full" />}
               {pin.type === 'Infected' && <Info size={20} color="white" />}
               {pin.type === 'Warning' && <Navigation size={20} color="white" />}
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Top Left Field Pill */}
      <View className="absolute top-12 left-4 bg-app-card/90 px-4 py-2 rounded-full border border-white/10 flex-row items-center backdrop-blur-md">
         <Text className="text-white font-bold mr-2">Field: Sector 4 (Corn)</Text>
         <ChevronRight size={16} color="#8A9A91" />
      </View>

      {/* Top Right Controls */}
      <View className="absolute top-12 right-4 gap-3">
        <TouchableOpacity className="w-10 h-10 bg-app-card/90 rounded-full items-center justify-center border border-white/10">
          <Layers size={20} color="white" />
        </TouchableOpacity>
        <TouchableOpacity className="w-10 h-10 bg-app-card/90 rounded-full items-center justify-center border border-white/10">
          <Navigation size={20} color="#2ED158" />
        </TouchableOpacity>
      </View>

      {/* Alert Card (Popup) */}
      {selectedPin && (
        <View className="absolute bottom-24 left-4 right-4 bg-app-card p-4 rounded-2xl border border-white/10 shadow-xl">
            <View className="flex-row justify-between items-start">
                <View>
                    <Text className="text-app-danger font-bold text-xs uppercase mb-1">Alert Found • 2 hrs ago</Text>
                    <Text className="text-white text-xl font-bold mb-1">Early Blight</Text>
                    <Text className="text-app-subtext text-xs">Scan #402 • 92% Confidence</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedPin(null)}>
                    <X size={20} color="#8A9A91" />
                </TouchableOpacity>
            </View>

            <TouchableOpacity className="mt-4 bg-app-danger py-3 rounded-xl items-center">
                <Text className="text-white font-bold">View Details</Text>
            </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
