# LeafScan

Plant disease detection app. Point your phone at a leaf, get a diagnosis.

## What's here

- **mobile/** — React Native app (Expo) with camera, zoom, stability detection, and result screen
- **backend/** — FastAPI server running an EfficientNet-B0 model trained on PlantVillage (38 classes)

## Requirements

- Node 18+ and npm
- Python 3.11+
- Expo Go on your phone (iOS or Android)
- Phone and dev machine on the same Wi-Fi

## Backend setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The model weights are loaded on startup. Hit `http://localhost:8000/health` to confirm it's running.

## Mobile setup

```bash
cd mobile
npm install
```

Create `mobile/.env`:

```
EXPO_PUBLIC_API_URL=http://<your-local-ip>:8000
```

Find your IP with `ipconfig getifaddr en0` on Mac. Then:

```bash
npx expo start
```

Scan the QR code with Expo Go.

## Using it

1. Open the Scan tab
2. Point the camera at a leaf — use the zoom slider or pinch to frame it
3. Wait for the "Steady" indicator, then tap the shutter
4. Review the photo and tap **Analyze**
5. Results show the detected condition, confidence, severity, and recommended actions
