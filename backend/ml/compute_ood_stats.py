"""Compute Mahalanobis OOD statistics from the PlantVillage training set.

Run this on Kaggle (or any machine with the training data) after training:

    python compute_ood_stats.py

Outputs (saved alongside the model weights):
    weights/class_means.npy       shape [38, 1280]  — per-class feature centroids
    weights/precision_matrix.npy  shape [1280, 1280] — inverse of tied covariance

Threshold tuning
----------------
After generating the stats, run the validation split through the OOD scorer and
inspect the score distribution:

    import numpy as np, torch
    # load class_means, precision_matrix, your val_loader
    scores = [ood_score(feat, means, prec) for feat in val_features]
    print(np.percentile(scores, [90, 95, 99]))

Set OOD_THRESHOLD to the 95th–99th percentile of in-distribution scores.
Then collect ~500 non-leaf images (random ImageNet samples work well) and
verify that >95% of them exceed your chosen threshold. Adjust as needed and
export as OOD_THRESHOLD= in backend/.env (or Render env vars).
"""

from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torchvision
from torch.utils.data import DataLoader
from torchvision import datasets, transforms

DATA_DIR = "/kaggle/input/datasets/abdallahalidev/plantvillage-dataset/color"
WEIGHTS_PATH = "weights/efficientnet_plantvillage.pt"
OUT_DIR = Path("weights")

IMG_SIZE = 224
BATCH_SIZE = 64
NUM_CLASSES = 38
SEED = 42

# Same normalization as inference
_TRANSFORM = transforms.Compose([
    transforms.Resize((IMG_SIZE, IMG_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])


def build_model(weights_path: str) -> nn.Module:
    model = torchvision.models.efficientnet_b0(weights=None)
    model.classifier[1] = nn.Linear(1280, NUM_CLASSES)
    model.load_state_dict(torch.load(weights_path, map_location="cpu", weights_only=True))
    model.eval()
    return model


def extract_features(model: nn.Module, loader: DataLoader, device: torch.device):
    """Return (features [N, 1280], labels [N]) tensors for the entire loader."""
    all_feats, all_labels = [], []
    with torch.no_grad():
        for images, labels in loader:
            images = images.to(device)
            feats = torch.flatten(model.avgpool(model.features(images)), 1)
            all_feats.append(feats.cpu())
            all_labels.append(labels)
    return torch.cat(all_feats), torch.cat(all_labels)


def main():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    model = build_model(WEIGHTS_PATH).to(device)

    dataset = datasets.ImageFolder(DATA_DIR, transform=_TRANSFORM)
    loader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=4, pin_memory=True)

    print("Extracting backbone features from training set…")
    features, labels = extract_features(model, loader, device)
    print(f"  features shape: {features.shape}")  # [N, 1280]

    # Per-class mean feature vectors
    class_means = torch.zeros(NUM_CLASSES, 1280)
    for c in range(NUM_CLASSES):
        mask = labels == c
        if mask.sum() == 0:
            print(f"  WARNING: class {c} has no samples")
            continue
        class_means[c] = features[mask].mean(dim=0)

    # Tied covariance: center each feature vector by its class mean, then
    # compute a single shared covariance matrix across all classes.
    centered = features - class_means[labels]  # [N, 1280]
    cov = np.cov(centered.numpy().T)           # [1280, 1280]

    # Regularized inverse (Tikhonov regularization avoids singular matrix)
    reg = 1e-4 * np.eye(1280)
    precision = np.linalg.inv(cov + reg)
    print(f"  Precision matrix condition number: {np.linalg.cond(precision):.2e}")

    OUT_DIR.mkdir(exist_ok=True)
    np.save(OUT_DIR / "class_means.npy", class_means.numpy())
    np.save(OUT_DIR / "precision_matrix.npy", precision.astype(np.float32))
    print(f"Saved to {OUT_DIR}/class_means.npy and precision_matrix.npy")

    # Print in-distribution score distribution to help choose OOD_THRESHOLD
    print("\nIn-distribution Mahalanobis score percentiles (on training set):")
    means_t = class_means
    prec_t = torch.tensor(precision, dtype=torch.float32)
    scores = []
    for feat in features:
        diffs = feat.unsqueeze(0) - means_t
        s = torch.einsum("ci,ij,cj->c", diffs, prec_t, diffs).clamp(min=0).min().sqrt()
        scores.append(s.item())
    scores = np.array(scores)
    for p in [50, 90, 95, 99]:
        print(f"  p{p}: {np.percentile(scores, p):.2f}")
    print(f"\nSuggested OOD_THRESHOLD: ~{np.percentile(scores, 99):.1f}  (99th percentile of training scores)")


if __name__ == "__main__":
    main()
