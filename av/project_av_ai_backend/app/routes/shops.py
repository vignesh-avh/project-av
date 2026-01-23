from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from app.db import (
    shops_collection, 
    products_collection, 
    product_views_collection, 
    product_sales_collection,
    users_collection
)
from app.schemas.shop import ShopCreate
from bson import ObjectId
from bson.errors import InvalidId  # Added for error handling
from math import radians, cos, sin, asin, sqrt
from datetime import datetime, timedelta
import json
import pymongo  # Added for DESCENDING sort
from fastapi.responses import JSONResponse  # Added for JSONResponse
import re

router = APIRouter()

# NEW: Coordinate validation function
def validate_and_normalize_coords(lat, lng):
    # Convert to float and round to 6 decimals
    lat = round(float(lat), 6)
    lng = round(float(lng), 6)
    
    # Validate Indian coordinates
    if not (6.0 <= lat <= 36.0) or not (68.0 <= lng <= 98.0):
        raise HTTPException(status_code=400, detail="Invalid Indian coordinates")
    return lat, lng

# FIXED: Added proper ObjectId serialization
def serialize_doc(doc):
    doc["_id"] = str(doc["_id"])
    if "shop_id" in doc:
        doc["shop_id"] = str(doc["shop_id"])
    return doc

# Standardize shop response format
def format_shop_response(shop):
    return {
        "id": str(shop["_id"]),
        "name": shop["name"],
        "latitude": float(shop["latitude"]),
        "longitude": float(shop["longitude"]),
        "location": {
            "type": "Point",
            "coordinates": [
                float(shop["longitude"]), 
                float(shop["latitude"])
            ]
        },
        # ... other fields ...
    }

# FIXED: Correct Haversine implementation
def haversine(lat1, lon1, lat2, lon2):
    # Convert to radians first
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    
    # Haversine formula
    dlat = lat2 - lat1 
    dlon = lon2 - lon1 
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a)) 
    r = 6371 # Earth radius in km
    return c * r

# FIXED: Unified coordinate extraction
def extract_shop_coordinates(shop):
    # Priority 1: Direct fields
    if 'latitude' in shop and 'longitude' in shop:
        return float(shop['latitude']), float(shop['longitude'])
    
    # Priority 2: GeoJSON format (corrected order)
    if 'location' in shop and 'coordinates' in shop['location']:
        coords = shop['location']['coordinates']
        if len(coords) >= 2:
            return float(coords[1]), float(coords[0])
    
    return None, None

@router.post("/update-owner-location/")
async def update_owner_location(owner_id: str = Query(...), lat: float = Query(...), lng: float = Query(...)):
    try:
        # NEW: Validate and normalize coordinates
        lat, lng = validate_and_normalize_coords(lat, lng)
        
        shops_collection.update_one(
            {"owner_id": owner_id},
            {"$set": {
                "owner_location": {
                    "type": "Point",
                    "coordinates": [lng, lat]
                },
                "last_updated": datetime.utcnow()
            }}
        )
        return {"message": "Owner location updated"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


def check_missed_opportunities(product_name: str, user_lat: float, user_lng: float):
    try:
        # 1. Find products that match the name BUT have 0 stock
        search_regex = {"$regex": product_name, "$options": "i"}
        missed_products = list(products_collection.find({
            "product_name": search_regex,
            "count": 0, # Specifically looking for OUT OF STOCK
            "owner_id": {"$exists": True}
        }))

        if not missed_products:
            return

        # 2. Filter for shops nearby
        from app.notifications import send_owner_fomo_alert # Import here to avoid circular dependency
        
        for product in missed_products:
            shop = shops_collection.find_one({"owner_id": product["owner_id"]})
            if shop:
                shop_lat, shop_lng = extract_shop_coordinates(shop)
                if shop_lat and shop_lng:
                    dist = haversine(user_lat, user_lng, shop_lat, shop_lng)
                    if dist <= 5: # Only notify if user is within 5km
                        # Trigger the notification logic (checks cooldown internally)
                        # We pass the product name explicitly to show "Customer looking for Bread"
                        import asyncio
                        asyncio.run(send_owner_fomo_alert(product["owner_id"], product["product_name"]))
                        
    except Exception as e:
        print(f"FOMO Check Error: {e}")

@router.get("/get-shops")
async def get_shops(
    background_tasks: BackgroundTasks,
    product_name: str = Query(...),
    user_lat: float = Query(...),
    user_lng: float = Query(...),
    in_stock: bool = Query(True)
):
    try:
        background_tasks.add_task(check_missed_opportunities, product_name, user_lat, user_lng)
        # Searches for the exact input (e.g., "Kirana Items") in Name OR Category.
        search_regex = {"$regex": product_name, "$options": "i"}
        
        query = {
            "$or": [
                {"product_name": search_regex},
                {"category": search_regex} 
            ]
        }
        if in_stock:
            query["inStock"] = True
            query["count"] = {"$gt": 0}

        matching_products = list(products_collection.find(query))
        
        if not matching_products:
            return {"shops": []}

        # Get unique owner IDs from matching products
        owner_ids = list(set([p["owner_id"] for p in matching_products]))
        
        # Find shops for these owners
        shops = list(shops_collection.find({
            "owner_id": {"$in": owner_ids}
        }))
        
        shops_with_products = []
        
        for shop in shops:
            shop_lat, shop_lng = extract_shop_coordinates(shop)
            if shop_lat is None or shop_lng is None:
                continue
                
            distance = haversine(user_lat, user_lng, shop_lat, shop_lng)
            
            # Get products for this specific shop
            shop_products = [
                p["product_name"] for p in matching_products
                if p["owner_id"] == shop["owner_id"]
            ]
                
            shops_with_products.append({
                "_id": str(shop["_id"]),
                "name": shop["name"],
                "rating": shop.get("rating", 0),
                "latitude": float(shop_lat),
                "longitude": float(shop_lng),
                "products": shop_products,
                "distance": distance
            })
        
        # Sort by distance
        shops_with_products.sort(key=lambda x: x["distance"])
        return {"shops": shops_with_products}

    except Exception as e:
        print(f"Error in get_shops: {str(e)}")
        return {"shops": []}

# FIXED: Direction-ready shop data
@router.get("/get-shop")
async def get_shop(id: str = Query(...)):
    try:
        if not ObjectId.is_valid(id):
            return JSONResponse(status_code=400, content={"error": "Invalid shop ID format"})

        shop_id_obj = ObjectId(id)

        pipeline = [
            {"$match": {"_id": shop_id_obj}},
            {"$lookup": {
                "from": "products",
                "let": {"shop_id_str": {"$toString": "$_id"}},
                "pipeline": [
                    {"$match": {
                        "$expr": {"$eq": ["$shop_id", "$$shop_id_str"]},
                    
                    }}
                ],
                "as": "products"
            }},
            {"$addFields": {
                "products": {
                    "$map": {
                        "input": "$products",
                        "as": "prod",
                        "in": {
                            "id": {"$toString": "$$prod._id"},
                            "product_name": "$$prod.product_name",
                            "price": "$$prod.price",
                            "unit": "$$prod.unit",
                            "count": "$$prod.count",
                            "category": "$$prod.category",
                            "imageUrl": "$$prod.imageUrl",
                            "isOnSale": {"$ifNull": ["$$prod.isOnSale", False]},
                            "salePrice": "$$prod.salePrice",
                            "saleDescription": "$$prod.saleDescription",
                            "saleEndDate": "$$prod.saleEndDate",
                            "last_updated": "$$prod.last_updated",
                            "saleDaysLeft": {
                                "$cond": {
                                    "if": {"$and": ["$$prod.isOnSale", "$$prod.saleEndDate"]},
                                    "then": {
                                        "$max": [0, {"$ceil": {"$divide": [{"$subtract": ["$$prod.saleEndDate", datetime.utcnow()]}, 1000 * 60 * 60 * 24]}}]
                                    },
                                    "else": None
                                }
                            }
                        }
                    }
                }
            }}
        ]

        result = list(shops_collection.aggregate(pipeline))

        if not result:
            return JSONResponse(status_code=404, content={"error": "Shop not found"})

        shop_data = result[0]
        formatted_shop = format_shop_response(shop_data)
        formatted_shop["products"] = shop_data.get("products", [])
        formatted_shop["rating"] = shop_data.get("rating", 0)
        
        return {"shop": formatted_shop}

    except Exception as err:
        print(f"Failed to load shop: {err}")
        return JSONResponse(status_code=500, content={"error": "Internal server error"})
        
# ===== FIXED SHOP PERFORMANCE ENDPOINT =====
@router.get("/owner/shop-performance")
async def get_shop_performance(owner_id: str, days: int = 7):
    try:
        shop = shops_collection.find_one({"owner_id": owner_id})
        if not shop:
            return {"performance": []}
            
        shop_id = str(shop["_id"])

        # --- START OF FIX ---
        # Define the date range based on full calendar days for accuracy
        
        # Set end_date to the very end of today in UTC
        end_date = datetime.utcnow().replace(hour=23, minute=59, second=59, microsecond=999999)
        # Set start_date to the very beginning of the day, 7 days ago
        start_date = (end_date - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Initialize the map with all days in the range
        performance_map = {}
        for i in range(days):
            date_key = (start_date + timedelta(days=i)).strftime("%Y-%m-%d")
            performance_map[date_key] = {"date": date_key, "sales": 0, "views": 0}
        # --- END OF FIX ---
            
        # Get sales data
        sales_pipeline = [
            {"$match": {
                "shop_id": ObjectId(shop_id),
                "timestamp": {"$gte": start_date, "$lte": end_date}
            }},
            {"$group": {
                "_id": {"$dateToString": { "format": "%Y-%m-%d", "date": "$timestamp" }},
                "sales": {"$sum": "$quantity"}
            }},
            {"$project": {
                "_id": 0,
                "date": "$_id",
                "sales": 1
            }}
        ]
        sales_data = list(product_sales_collection.aggregate(sales_pipeline))
        
        # Get views data
        views_pipeline = [
            {"$match": {
                "shop_id": ObjectId(shop_id),
                "timestamp": {"$gte": start_date, "$lte": end_date},
                "type": "view"
            }},
            {"$group": {
                "_id": {"$dateToString": { "format": "%Y-%m-%d", "date": "$timestamp" }},
                "views": {"$sum": 1}
            }},
            {"$project": {
                "_id": 0,
                "date": "$_id",
                "views": 1
            }}
        ]
        views_data = list(product_views_collection.aggregate(views_pipeline))
        
        # Populate map with the fetched data
        for item in sales_data:
            if item["date"] in performance_map:
                performance_map[item["date"]]["sales"] = item["sales"]
            
        for item in views_data:
            if item["date"] in performance_map:
                performance_map[item["date"]]["views"] = item["views"]
        
        # Sort the data chronologically
        performance_data = sorted(performance_map.values(), key=lambda x: x["date"])
        
        return {"performance": performance_data}
    except Exception as e:
        print(f"Performance error: {str(e)}")
        return {"performance": []}


# ===== UPDATED TOP PRODUCTS ENDPOINT =====
@router.get("/owner/top-products")
async def get_top_products(owner_id: str, limit: int = 3):
    try:
        # Directly query products collection
        top_products = products_collection.find(
            {"owner_id": owner_id},
            sort=[("sale_count", pymongo.DESCENDING)],
            limit=limit
        )
        
        return {"products": [
            {
                "name": p["product_name"],
                "sold": p.get("sale_count", 0)
            } 
            for p in top_products
        ]}
    except Exception as e:
        print(f"Top products error: {str(e)}")
        return {"products": []}

# ===== EXTENDED DEALS ENDPOINT WITH CATEGORY FILTER =====
@router.get("/products/deals-extended")
async def get_extended_deals(
    user_lat: float = Query(...),
    user_lng: float = Query(...),
    limit: int = 10,
    skip: int = 0,
    category: str = Query(None) # Added category param
):
    try:
        # Dynamic Match
        match_query = {
            "products.isOnSale": True,
            "products.saleEndDate": {"$gte": datetime.utcnow()}
        }
        if category and category != "All":
            match_query["products.category"] = category

        pipeline = [
            {
                "$geoNear": {
                    "near": {"type": "Point", "coordinates": [user_lng, user_lat]},
                    "distanceField": "distance_in_meters",
                    "minDistance": 5000, 
                    "maxDistance": 50000,
                    "spherical": True
                }
            },
            {
                "$lookup": {
                    "from": "products",
                    "let": { "shop_id_str": { "$toString": "$_id" } },
                    "pipeline": [
                        { "$match": { "$expr": { "$eq": [ "$shop_id", "$$shop_id_str" ] } } }
                    ],
                    "as": "products"
                }
            },
            {"$unwind": "$products"},
            {"$match": match_query}, # Applied dynamic match
            # Sort by Popularity (Sale count) first, then Distance
            {"$sort": {"products.sale_count": -1, "distance_in_meters": 1}},
            {"$skip": skip},
            {"$limit": limit},
            {
                "$project": {
                    "_id": {"$toString": "$products._id"},
                    "product_name": "$products.product_name",
                    "price": "$products.price",
                    "unit": "$products.unit",
                    "imageUrl": "$products.imageUrl",
                    "category": "$products.category", # Return category
                    "shop_id": {"$toString": "$_id"},
                    "shop_name": "$name",
                    "distance": {"$divide": ["$distance_in_meters", 1000]},
                    "isOnSale": "$products.isOnSale",
                    "salePrice": "$products.salePrice",
                    "saleDescription": "$products.saleDescription",
                    # --- NEW: Project real sold count for frontend ---
                    "sold_count": {"$ifNull": ["$products.sale_count", 0]},
                    "marketing_tagline": {"$literal": "Worth the distance"}
                }
            }
        ]
        deals = list(shops_collection.aggregate(pipeline))
        return {"products": deals}
    except Exception as error:
        print(f"Extended deals error: {error}")
        return {"products": []}

# ===== FIXED TRENDING PRODUCTS ENDPOINT WITH CATEGORY FILTER =====
@router.get("/products/trending")
async def get_trending_products(
    user_lat: float = Query(...),
    user_lng: float = Query(...),
    limit: int = 10,
    skip: int = 0,
    category: str = Query(None) # Added category param
):
    try:
        # Dynamic Match
        # FIX: Include items if NOT on sale OR if sale has EXPIRED
        match_query = {
            "products.inStock": True,
            "$or": [
                {"products.isOnSale": {"$ne": True}},
                {"products.saleEndDate": {"$lt": datetime.utcnow()}}
            ]
        }
        if category and category != "All":
            match_query["products.category"] = category

        pipeline = [
            {
                "$geoNear": {
                    "near": {"type": "Point", "coordinates": [user_lng, user_lat]},
                    "distanceField": "distance_in_meters",
                    "maxDistance": 5000, # 5 kilometers
                    "spherical": True
                }
            },
            {
                "$lookup": {
                    "from": "products",
                    "let": { "shop_id_str": { "$toString": "$_id" } },
                    "pipeline": [ { "$match": { "$expr": { "$eq": [ "$shop_id", "$$shop_id_str" ] } } } ],
                    "as": "products"
                }
            },
            {"$unwind": "$products"},
            {"$match": match_query}, # Applied dynamic match
            # Sort by MOST SOLD first, then by distance
            {"$sort": {"products.sale_count": -1, "distance_in_meters": 1}},
            {"$skip": skip},
            {"$limit": limit},
            {
                "$project": {
                    "_id": {"$toString": "$products._id"},
                    "product_name": "$products.product_name",
                    "price": "$products.price",
                    "unit": "$products.unit",
                    "imageUrl": "$products.imageUrl",
                    "category": "$products.category", # Return category
                    "shop_id": {"$toString": "$_id"},
                    "shop_name": "$name",
                    "distance": {"$divide": ["$distance_in_meters", 1000]},
                    # FIX: Force isOnSale to False if the date has passed so it appears as a normal product
                    "isOnSale": {
                        "$cond": {
                            "if": { "$lt": ["$products.saleEndDate", datetime.utcnow()] },
                            "then": False,
                            "else": "$products.isOnSale"
                        }
                    },
                    "salePrice": "$products.salePrice",
                    "saleDescription": "$products.saleDescription",
                    # --- NEW: Project real sold count for frontend ---
                    "sold_count": {"$ifNull": ["$products.sale_count", 0]},
                    "marketing_tagline": {"$literal": "Trending now"}
                }
            }
        ]
        trending = list(shops_collection.aggregate(pipeline))
        return {"products": trending}
    except Exception as error:
        print(f"Trending products error: {error}")
        return {"products": []}


# ===== REVISED BEST PRICE ENDPOINT WITH CATEGORY FILTER =====
@router.get("/products/best-price")
async def get_best_price_products(
    user_lat: float = Query(...),
    user_lng: float = Query(...),
    limit: int = 10,
    skip: int = 0,
    category: str = Query(None) # Added category param
):
    try:
        # Dynamic Match
        # FIX: Include items if NOT on sale OR if sale has EXPIRED
        match_query = {
            "products.inStock": True,
            "$or": [
                {"products.isOnSale": {"$ne": True}},
                {"products.saleEndDate": {"$lt": datetime.utcnow()}}
            ]
        }
        if category and category != "All":
            match_query["products.category"] = category

        pipeline = [
            {
                "$geoNear": {
                    "near": {"type": "Point", "coordinates": [user_lng, user_lat]},
                    "distanceField": "distance_in_meters",
                    "maxDistance": 5000, # 5 kilometers
                    "spherical": True,
                }
            },
            {
                "$lookup": {
                    "from": "products",
                    "let": { "shop_id_str": { "$toString": "$_id" } },
                    "pipeline": [ { "$match": { "$expr": { "$eq": [ "$shop_id", "$$shop_id_str" ] } } } ],
                    "as": "products"
                }
            },
            {"$unwind": "$products"},
            {"$match": match_query}, # Applied dynamic match
            {"$sort": {"products.sale_count": -1, "products.price": 1}},
            {"$group": {
                "_id": "$products.product_name",
                "best_product": {"$first": "$$ROOT"}
            }},
            {"$replaceRoot": {"newRoot": "$best_product"}},
            {"$sort": {"distance_in_meters": 1}},
            {"$skip": skip},
            {"$limit": limit},
            {
                "$project": {
                    "_id": {"$toString": "$products._id"},
                    "product_name": "$products.product_name",
                    "price": "$products.price",
                    "unit": "$products.unit",
                    "imageUrl": "$products.imageUrl",
                    "category": "$products.category", # Return category
                    "shop_id": {"$toString": "$_id"},
                    "shop_name": "$name",
                    "distance": {"$divide": ["$distance_in_meters", 1000]},
                    # FIX: Force isOnSale to False if the date has passed
                    "isOnSale": {
                        "$cond": {
                            "if": { "$lt": ["$products.saleEndDate", datetime.utcnow()] },
                            "then": False,
                            "else": "$products.isOnSale"
                        }
                    },
                    "salePrice": "$products.salePrice",
                    "saleDescription": "$products.saleDescription",
                    "sold_count": {"$ifNull": ["$products.sale_count", 0]}
                }
            }
        ]
        best_price = list(shops_collection.aggregate(pipeline))

        default_phrases = [
            "Lowest price nearby",
            "Unbeatable Value",
            "Market Best Rate",
            "Huge Savings Today"
        ]

        for i, product in enumerate(best_price):
            # Calculate specific savings if applicable
            price = product.get("price")
            sale_price = product.get("salePrice")
            is_on_sale = product.get("isOnSale")

            tagline = ""
            
            # Logic: If on sale and cheaper than original, show specific saving
            if is_on_sale and price and sale_price and (price > sale_price):
                saving = int(price - sale_price)
                if saving > 0:
                    tagline = f"₹{saving} cheaper nearby"
            
            # Fallback if no specific saving calc available
            if not tagline:
                phrase_index = (len(product.get("product_name", "")) + i) % len(default_phrases)
                tagline = default_phrases[phrase_index]

            # Assign to snake_case key
            product["marketing_tagline"] = tagline

        return {"products": best_price}
        
    except Exception as error:
        print(f"Best price error: {error}")
        return {"products": []}
        
# ===== FIX: Corrected View Recording =====
@router.post("/record-shop-view/{shop_id}")
async def record_shop_view(shop_id: str):
    try:
        if not ObjectId.is_valid(shop_id): # Use is_valid for better checking
            raise HTTPException(
                status_code=400, 
                detail="Invalid shop ID"
            )
        
        # ▼▼▼ ADD THIS LINE ▼▼▼
        # Convert the incoming string ID to a proper ObjectId
        shop_id_obj = ObjectId(shop_id)
        
        # Create view document
        view_data = {
            "shop_id": shop_id_obj, # <-- Use the converted ObjectId here
            "timestamp": datetime.utcnow(),
            "type": "view"
        }
        product_views_collection.insert_one(view_data)
        
        # Immediately update shop's view count
        shops_collection.update_one(
            {"_id": shop_id_obj}, # <-- Also use the ObjectId here
            {"$inc": {"view_count": 1}}
        )
        return {"success": True}
    except Exception as e:
        print(f"Error recording shop view: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )


# ===== ENHANCED SALES RECORDING LOGIC =====
@router.post("/record-product-sale")
async def record_product_sale(sale_data: dict):
    try:
        # FIX: Proper ID conversion and validation
        product_id = sale_data["product_id"]
        shop_id = sale_data["shop_id"]
        
        # Validate IDs
        if not ObjectId.is_valid(product_id) or not ObjectId.is_valid(shop_id):
            return JSONResponse(
                status_code=400,
                content={"error": "Invalid ID format"}
            )
            
        # Convert to ObjectId
        product_id = ObjectId(product_id)
        shop_id = ObjectId(shop_id)

        # Create sale document
        sale_doc = {
            "product_id": product_id,
            "shop_id": shop_id,
            "quantity": sale_data["quantity"],
            "timestamp": datetime.utcnow()
        }
        result = product_sales_collection.insert_one(sale_doc)
        
        # Update product sale count
        products_collection.update_one(
            {"_id": product_id},
            {"$inc": {"sale_count": sale_data["quantity"]}}
        )
        
        # Update shop analytics
        shops_collection.update_one(
            {"_id": shop_id},
            {"$inc": {"sale_count": sale_data["quantity"]}}
        )
        
        # FIX: Update shop's daily sales count
        today = datetime.utcnow().strftime("%Y-%m-%d")
        shops_collection.update_one(
            {"_id": shop_id},
            {"$inc": {"daily_sales": sale_data["quantity"]}},
            upsert=True
        )
        
        # FIX: Dispatch event for real-time updates
        return {"success": True, "sale_id": str(result.inserted_id)}
    except Exception as e:
        print(f"Sale recording error: {str(e)}")
        return {"success": False, "error": str(e)}

@router.get("/owner/dashboard-metrics")
async def get_owner_dashboard_metrics(owner_id: str = Query(...)):
    try:
        # Step 1: Find the shop_id from the owner_id.
        shop = shops_collection.find_one({"owner_id": owner_id})
        if not shop:
            return {"todayViews": 0, "lowStockItems": 0, "activePromotions": 0}
        shop_id = str(shop["_id"])

        # Define "today" for the queries
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        
        # 1. Get Today's Views
        today_views = product_views_collection.count_documents({
            "shop_id": shop_id, 
            "timestamp": {"$gte": today_start}
        })

        # 2. Get count of low stock items (FIXED: uses $lte for "less than or equal to")
        low_stock_items = products_collection.count_documents({
            "owner_id": owner_id,
            "count": {"$lte": 5} # Correctly includes items with a count of 5
        })
        
        # 3. NEW: Get count of active promotions
        active_promotions = products_collection.count_documents({
            "owner_id": owner_id,
            "isOnSale": True,
            "saleEndDate": {"$gte": datetime.utcnow()}
        })

        return {
            "todayViews": today_views,
            "lowStockItems": low_stock_items,
            "activePromotions": active_promotions # Replaced other metrics
        }
    except Exception as e:
        print(f"Dashboard metrics error: {str(e)}")
        return {"todayViews": 0, "lowStockItems": 0, "activePromotions": 0}

        # 4. NEW: Get count of low stock items using owner_id
        low_stock_items = products_collection.count_documents({
            "owner_id": owner_id,
            "count": {"$lt": 5} # Items with less than 5 count
        })

        return {
            "todaySales": round(today_sales, 2),
            "todayViews": today_views,
            "lowStockItems": low_stock_items # Replaced totalEarnings
        }
    except Exception as e:
        print(f"Dashboard metrics error: {str(e)}")
        return {"todaySales": 0, "todayViews": 0, "lowStockItems": 0}


@router.get("/owner/inventory-alerts")
async def get_inventory_alerts(owner_id: str = Query(...), limit: int = 5):
    try:
        # Find products with low stock count (e.g., less than 5)
        alert_products = products_collection.find({
            "owner_id": owner_id,
            "count": {"$lt": 5}
        }).sort("count", 1).limit(limit) # Sort by lowest count first

        products_list = []
        for product in alert_products:
            product['_id'] = str(product['_id'])
            products_list.append(product)
            
        return {"alerts": products_list}
    except Exception as e:
        print(f"Inventory alerts error: {str(e)}")
        return {"alerts": []}


@router.get("/get-nearby-shops")
async def get_nearby_shops(
    lat: float = Query(...),
    lng: float = Query(...),
    limit: int = 20
):
    try:
        pipeline = [
            {
                "$geoNear": {
                    "near": {"type": "Point", "coordinates": [lng, lat]},
                    "distanceField": "distance_in_meters",
                    "maxDistance": 10000, # 10km Radius
                    "spherical": True
                }
            },
            {
                "$lookup": {
                    "from": "products",
                    "let": { "shop_id_str": { "$toString": "$_id" } },
                    "pipeline": [
                        { "$match": { "$expr": { "$eq": [ "$shop_id", "$$shop_id_str" ] } } },
                        { "$limit": 4 } # Get top 4 items for the preview strip
                    ],
                    "as": "preview_products"
                }
            },
            {
                "$project": {
                    "_id": {"$toString": "$_id"},
                    "name": 1,
                    "rating": 1,
                    "distance": {"$divide": ["$distance_in_meters", 1000]},
                    # Send images for the "Crowded" look
                    "preview_images": "$preview_products.imageUrl", 
                    "products": "$preview_products.product_name" # Send names for fallback
                }
            },
            { "$limit": limit }
        ]
        
        shops = list(shops_collection.aggregate(pipeline))
        return {"shops": shops}
    except Exception as e:
        print(f"Error fetching nearby shops: {str(e)}")
        return {"shops": []}