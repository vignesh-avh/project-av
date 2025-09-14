from fastapi import APIRouter, Query
from pymongo import MongoClient
from math import radians, cos, sin, asin, sqrt
import os

router = APIRouter()

# MongoDB setup
client = MongoClient(os.getenv("MONGO_URL"))
db = client["project_av"]
shops_collection = db["shops"]

# Haversine function
def haversine(lat1, lon1, lat2, lon2):
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1)*cos(lat2)*sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    r = 6371
    return c * r

@router.get("/get-shops")
async def get_shops(product: str = Query(""), latitude: float = Query(...), longitude: float = Query(...)):
    shops = list(shops_collection.find({}))
    nearby_shops = []

    for shop in shops:
        if "products" not in shop:
            continue
        found_product = any(product.lower() in p.lower() for p in shop["products"])
        if found_product:
            distance = haversine(latitude, longitude, shop["latitude"], shop["longitude"])
            shop["_id"] = str(shop["_id"])
            shop["distance"] = round(distance, 2)
            nearby_shops.append(shop)

    sorted_shops = sorted(nearby_shops, key=lambda x: x["distance"])
    return sorted_shops
