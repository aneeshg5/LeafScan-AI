import io
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import torch
import torch.nn as nn
import torchvision
from PIL import Image
from torchvision import transforms

from app.config import settings

NUM_CLASSES = 38
_TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])


def _build_model() -> nn.Module:
    model = torchvision.models.efficientnet_b0(weights=None)
    model.classifier[1] = nn.Linear(1280, NUM_CLASSES)
    return model


class PlantClassifier:
    def __init__(self):
        self._model: nn.Module | None = None
        self._class_names: dict[str, str] = {}
        self._metadata: dict[str, dict] = {}

    def load(self):
        weights_path = Path(settings.model_weights_path)
        if not weights_path.exists():
            return

        self._model = _build_model()
        self._model.load_state_dict(
            torch.load(weights_path, map_location="cpu", weights_only=True)
        )
        self._model.eval()

        with open(weights_path.parent / "class_names.json") as f:
            self._class_names = json.load(f)

        with open(Path(__file__).parent / "disease_metadata.json") as f:
            self._metadata = json.load(f)

    def is_loaded(self) -> bool:
        return self._model is not None

    def predict(self, image_bytes: bytes) -> dict:
        if not self._model:
            raise RuntimeError("Model not loaded")

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        tensor = _TRANSFORM(image).unsqueeze(0)

        with torch.no_grad():
            probs = torch.softmax(self._model(tensor), dim=1)
            confidence, idx = probs.max(dim=1)

        class_key = self._class_names[str(idx.item())]
        meta = self._metadata[class_key]

        return {
            "scan_id": str(uuid.uuid4()),
            "disease_name": meta["disease_name"],
            "is_healthy": meta["is_healthy"],
            "confidence": round(confidence.item(), 4),
            "severity": meta["severity"],
            "description": meta["description"],
            "treatments": meta["treatments"],
            "plant_type": meta["plant_type"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }


classifier = PlantClassifier()
