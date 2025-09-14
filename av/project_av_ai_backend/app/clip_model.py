from transformers import CLIPProcessor, CLIPModel
from PIL import Image
import torch
import pandas as pd
import os

# Load model and processor
model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

# Load product names from CSV
def load_product_labels():
    csv_path = os.path.join(os.path.dirname(__file__), "../product_list.csv")
    df = pd.read_csv(csv_path)
    return df["product_name"].tolist()

LABELS = load_product_labels()

# Prediction function
def predict_product_name(image: Image.Image) -> str:
    inputs = processor(text=LABELS, images=image, return_tensors="pt", padding=True)
    outputs = model(**inputs)
    logits_per_image = outputs.logits_per_image
    probs = logits_per_image.softmax(dim=1)
    best_idx = torch.argmax(probs, dim=1).item()
    return LABELS[best_idx]
