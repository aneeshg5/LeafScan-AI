import json
import random

import torch
import torch.nn as nn
import torchvision
from torch.utils.data import DataLoader, Subset
from torchvision import datasets, transforms

# Verify this path in your Kaggle notebook with: !ls /kaggle/input/plantvillage-dataset/
DATA_DIR = "/kaggle/input/datasets/abdallahalidev/plantvillage-dataset/color"
WEIGHTS_OUT = "efficientnet_plantvillage.pt"
CLASS_NAMES_OUT = "class_names.json"

IMG_SIZE = 224
BATCH_SIZE = 32
EPOCHS = 10
LR = 1e-4
VAL_SPLIT = 0.2
NUM_CLASSES = 38
SEED = 42


def build_model() -> nn.Module:
    model = torchvision.models.efficientnet_b0(
        weights=torchvision.models.EfficientNet_B0_Weights.IMAGENET1K_V1
    )
    for param in model.parameters():
        param.requires_grad = False
    model.classifier[1] = nn.Linear(1280, NUM_CLASSES)
    return model


def get_transforms():
    mean = [0.485, 0.456, 0.406]
    std = [0.229, 0.224, 0.225]
    train_tf = transforms.Compose([
        transforms.Resize((IMG_SIZE, IMG_SIZE)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(15),
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
        transforms.ToTensor(),
        transforms.Normalize(mean, std),
    ])
    val_tf = transforms.Compose([
        transforms.Resize((IMG_SIZE, IMG_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(mean, std),
    ])
    return train_tf, val_tf


def split_dataset(data_dir: str, train_tf, val_tf):
    full_train = datasets.ImageFolder(data_dir, transform=train_tf)
    full_val = datasets.ImageFolder(data_dir, transform=val_tf)

    random.seed(SEED)
    indices = list(range(len(full_train)))
    random.shuffle(indices)
    split = int(len(indices) * (1 - VAL_SPLIT))

    return (
        Subset(full_train, indices[:split]),
        Subset(full_val, indices[split:]),
        full_train.class_to_idx,
    )


def train_epoch(model, loader, optimizer, criterion, device) -> float:
    model.train()
    total_loss = 0.0
    for images, labels in loader:
        images, labels = images.to(device), labels.to(device)
        optimizer.zero_grad()
        loss = criterion(model(images), labels)
        loss.backward()
        optimizer.step()
        total_loss += loss.item()
    return total_loss / len(loader)


def val_accuracy(model, loader, device) -> float:
    model.eval()
    correct = total = 0
    with torch.no_grad():
        for images, labels in loader:
            images, labels = images.to(device), labels.to(device)
            preds = model(images).argmax(dim=1)
            correct += preds.eq(labels).sum().item()
            total += labels.size(0)
    return correct / total


def main():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    train_tf, val_tf = get_transforms()
    train_set, val_set, class_to_idx = split_dataset(DATA_DIR, train_tf, val_tf)

    train_loader = DataLoader(train_set, batch_size=BATCH_SIZE, shuffle=True, num_workers=2, pin_memory=True)
    val_loader = DataLoader(val_set, batch_size=BATCH_SIZE, shuffle=False, num_workers=2, pin_memory=True)

    model = build_model().to(device)
    optimizer = torch.optim.Adam(model.classifier.parameters(), lr=LR)
    criterion = nn.CrossEntropyLoss()

    idx_to_class = {str(v): k for k, v in class_to_idx.items()}
    best_acc = 0.0

    for epoch in range(EPOCHS):
        loss = train_epoch(model, train_loader, optimizer, criterion, device)
        acc = val_accuracy(model, val_loader, device)
        print(f"Epoch {epoch + 1}/{EPOCHS}  loss={loss:.4f}  val_acc={acc:.4f}")

        if acc > best_acc:
            best_acc = acc
            torch.save(model.state_dict(), WEIGHTS_OUT)
            print(f"  -> saved ({acc:.4f})")

    with open(CLASS_NAMES_OUT, "w") as f:
        json.dump(idx_to_class, f, indent=2)

    print(f"\nBest val acc: {best_acc:.4f}")
    print(f"Outputs: {WEIGHTS_OUT}, {CLASS_NAMES_OUT}")


if __name__ == "__main__":
    main()
