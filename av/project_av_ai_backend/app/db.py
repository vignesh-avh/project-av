import os
from pymongo import MongoClient, GEOSPHERE, IndexModel
from dotenv import load_dotenv
import certifi # --- 1. ADD THIS IMPORT ---

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = "project_av"

# --- 2. ADD these two lines and MODIFY the third to use the certificates ---
ca = certifi.where()
client = MongoClient(MONGO_URI, tlsCAFile=ca)
# --------------------------------------------------------------------
db = client[DB_NAME]

# Initialize collections
products_collection = db["products"]
cart_collection = db["cart"]
shops_collection = db["shops"]
rewards_collection = db["rewards"]
users_collection = db["users"]
referral_transactions_collection = db["referral_transactions"]
payments_collection = db["payments"]
product_views_collection = db["product_views"]
product_sales_collection = db["product_sales"]
orders_collection = db["orders"]

# Create indexes (single efficient creation)
shops_collection.create_indexes([
    IndexModel([("location", GEOSPHERE)]),
    IndexModel([("owner_id", 1)])
])

products_collection.create_index([("owner_id", 1)])
orders_collection.create_index([("user_id", 1), ("timestamp", -1)])
# Create compound indexes for performance
product_views_collection.create_indexes([
    IndexModel([("shop_id", 1), ("timestamp", 1)]),
    IndexModel([("timestamp", 1)])
])

product_sales_collection.create_indexes([
    IndexModel([("shop_id", 1), ("timestamp", 1)]),
    IndexModel([("product_id", 1)]),
    IndexModel([("timestamp", 1)])
])

print("✅ Connected to MongoDB with optimized indexes")