const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY ?? '';

module.exports = {
  expo: {
    name: 'LeafScan',
    slug: 'leafscan',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    scheme: 'leafscan',
    userInterfaceStyle: 'dark',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#101A14',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.aneeshg5.leafscan',
      config: {
        googleMapsApiKey: mapsApiKey,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#101A14',
      },
      package: 'com.aneeshg5.leafscan',
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      config: {
        googleMaps: {
          apiKey: mapsApiKey,
        },
      },
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-camera',
        {
          cameraPermission:
            'LeafScan needs camera access to photograph plant leaves for disease detection.',
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission:
            'LeafScan needs access to your photos to select plant leaf images for analysis.',
        },
      ],
      'expo-media-library',
      'expo-secure-store',
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'LeafScan uses your location to track where each plant is on the map.',
        },
      ],
    ],
    extra: {
      eas: {
        projectId: '58649c0e-b4ee-4a15-be02-429cb10fbe36',
      },
    },
  },
};
