from fastapi import APIRouter, HTTPException, Query
from app.db import (
    shops_collection, 
    products_collection, 
    product_views_collection, 
    product_sales_collection
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

@router.get("/get-shops")
async def get_shops(
    product_name: str = Query(...),
    user_lat: float = Query(...),
    user_lng: float = Query(...),
    in_stock: bool = Query(True)  # NEW PARAMETER
):
    try:
        # Modified query with inStock condition
        query = {
            "product_name": {"$regex": product_name, "$options": "i"},
            "inStock": True if in_stock else {"$in": [True, False]},
            "count": {"$gt": 0}
        }

        matching_products = list(products_collection.find(query))
        
        print(f"Found {len(matching_products)} matching products for '{product_name}'")
        
        if matching_products:
            print(f"Sample product: {matching_products[0]}")
        
        if not matching_products:
            return {"shops": []}

        # Get unique owner IDs from matching products
        owner_ids = list(set([p["owner_id"] for p in matching_products]))
        print(f"Found shops for owner IDs: {owner_ids}")
        
        # Find shops for these owners
        shops = list(shops_collection.find({
            "owner_id": {"$in": owner_ids}
        }))
        print(f"Found {len(shops)} shops")
        
        if shops:
            print(f"Sample shop: {shops[0]}")
        
        shops_with_products = []
        
        for shop in shops:
            # FIXED: Use standardized coordinate extraction
            shop_lat, shop_lng = extract_shop_coordinates(shop)
            if shop_lat is None or shop_lng is None:
                print(f"Skipping shop {shop['_id']} - missing location data")
                continue
                
            # Use validated Haversine
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
        print(f"Returning {len(shops_with_products)} shops with products")
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
                        "count": {"$gt": 0},
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
                            "imageUrl": "$$prod.imageUrl",
                            "isOnSale": {"$ifNull": ["$$prod.isOnSale", False]},
                            "salePrice": "$$prod.salePrice",
                            "saleDescription": "$$prod.saleDescription",
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
                "shop_id": shop_id,
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

# ===== FIXED TRENDING PRODUCTS ENDPOINT =====

# FIXED: Unified location handling in product endpoints
@router.get("/products/trending")
async def get_trending_products(
    user_lat: float = Query(None),
    user_lng: float = Query(None),
    limit: int = 6
):
    try:
        if user_lat is None or user_lng is None:
            print("Location not provided for trending products search; returning empty list.")
            return {"products": []}
        nearby_shops_cursor = shops_collection.find({
            "location": {
                "$nearSphere": {
                    "$geometry": {
                        "type": "Point",
                        "coordinates": [user_lng, user_lat]
                    },
                    "$maxDistance": 20000
                }
            }
        })
        nearby_shop_ids = [str(shop["_id"]) for shop in nearby_shops_cursor]

        # If no shops are nearby, return an empty list immediately
        if not nearby_shop_ids:
            return {"products": []}

        # Step 2: Build a pipeline to find trending products ONLY from those nearby shops
        pipeline = [
            # First, match only products that are in stock and from a nearby shop
            {"$match": {
                "shop_id": {"$in": nearby_shop_ids},
                "inStock": True,
                "isOnSale": {"$ne": True}
            }},

            {"$addFields": {
                "sale_count": {"$ifNull": ["$sale_count", 0]}
            }},
            {"$sort": {"sale_count": pymongo.DESCENDING, "created_at": pymongo.DESCENDING}},
            {"$limit": limit},
            # FIXED: Corrected lookup using ObjectId conversion
            {"$lookup": {
                "from": "shops",
                "let": {"shop_id": {"$toObjectId": "$shop_id"}},
                "pipeline": [
                    {"$match": {
                        "$expr": {"$eq": ["$_id", "$$shop_id"]}
                    }}
                ],
                "as": "shop_data"
            }},
            {"$unwind": {"path": "$shop_data", "preserveNullAndEmptyArrays": True}},
            {"$project": {
                "_id": {"$toString": "$_id"},
                "product_name": 1,
                "price": 1,
                "unit": 1,
                "imageUrl": 1, 
                "shop_id": 1,
                "shop_name": "$shop_data.name",  # Consistent naming
                "shop_latitude": "$shop_data.latitude",
                "shop_longitude": "$shop_data.longitude",
                "isOnSale": {"$ifNull": ["$isOnSale", False]},
                "salePrice": "$salePrice",
                "saleDescription": "$saleDescription",
                "saleDaysLeft": {
                    "$cond": {
                        "if": {"$and": ["$isOnSale", "$saleEndDate"]},
                        "then": {
                            "$max": [0, {"$ceil": {"$divide": [{"$subtract": ["$saleEndDate", datetime.utcnow()]}, 1000 * 60 * 60 * 24]}}]
                        },
                        "else": None
                    }
                },
                "location": {
                    "type": "Point",
                    "coordinates": ["$shop_data.longitude", "$shop_data.latitude"]
                },
                "isOnSale": {"$ifNull": ["$isOnSale", False]},
                "salePrice": "$salePrice",
                "saleDescription": "$saleDescription",
                "distance": {
                    "$cond": {
                        "if": {
                            "$and": [
                                {"$ne": [user_lat, None]},
                                {"$ne": [user_lng, None]},
                                {"$ne": ["$shop_data.latitude", None]},
                                {"$ne": ["$shop_data.longitude", None]}
                            ]
                        },
                        "then": None,
                        "else": None
                    }
                }
            }}
        ]
        trending = list(products_collection.aggregate(pipeline))
        
        # FIXED: Unified coordinate handling using extract_shop_coordinates
        if user_lat and user_lng and \
           (-90 <= user_lat <= 90) and (-180 <= user_lng <= 180):
            for product in trending:
                shop_lat, shop_lng = extract_shop_coordinates(product)
                if shop_lat is not None and shop_lng is not None:
                    product['distance'] = haversine(
                        user_lat, user_lng,
                        shop_lat,
                        shop_lng
                    )
        
        return {"products": trending}
    except Exception as error:
        print(f"Trending products error: {error}")
        return {"products": []}

# Make same fix for best-price endpoint
@router.get("/products/best-price")
async def get_best_price_products(
    user_lat: float = Query(None),
    user_lng: float = Query(None),
    limit: int = 6
):
    try:
        if user_lat is None or user_lng is None:
            print("Location not provided for best-price products search; returning empty list.")
            return {"products": []}
        nearby_shops_cursor = shops_collection.find({
            "location": {
                "$nearSphere": {
                    "$geometry": {
                        "type": "Point",
                        "coordinates": [user_lng, user_lat]
                    },
                    "$maxDistance": 20000
                }
            }
        })
        nearby_shop_ids = [str(shop["_id"]) for shop in nearby_shops_cursor]

        if not nearby_shop_ids:
            return {"products": []}

        pipeline = [
            # 1. Match products from nearby shops that are in stock
            {"$match": {
                "shop_id": {"$in": nearby_shop_ids},
                "inStock": True,
                "isOnSale": {"$ne": True}
            }},

            # 2. Add sale_count field, defaulting to 0 if it's missing
            {"$addFields": {
                "sale_count": {"$ifNull": ["$sale_count", 0]}
            }},

            # 3. Sort by MOST SOLD first, then by CHEAPEST price as a tie-breaker
            {"$sort": {
                "sale_count": pymongo.DESCENDING,
                "price": pymongo.ASCENDING
            }},

            # 4. Limit the results to the top items overall
            {"$limit": limit * 2}, # Fetch a slightly larger pool to ensure variety

            # 5. Group by product name to get the best one for each type
            {"$group": {
                "_id": "$product_name",
                "best_product": {"$first": "$$ROOT"}
            }},
            {"$replaceRoot": {"newRoot": "$best_product"}},

            # 6. Final limit for display
            {"$limit": limit},

            # 7. Add shop data (lookup)
            {"$lookup": {
                "from": "shops",
                "let": {"shop_id": {"$toObjectId": "$shop_id"}},
                "pipeline": [
                    {"$match": {
                        "$expr": {"$eq": ["$_id", "$$shop_id"]}
                    }}
                ],
                "as": "shop_data"
            }},
            {"$unwind": {"path": "$shop_data", "preserveNullAndEmptyArrays": True}},

            # 8. Project the final fields for the response
            {"$project": {
                "_id": {"$toString": "$_id"},
                "product_name": 1,
                "price": 1,
                "unit": 1,
                "imageUrl": 1,
                "shop_id": 1,
                "shop_name": "$shop_data.name",
                "shop_latitude": "$shop_data.latitude",
                "shop_longitude": "$shop_data.longitude",
                "isOnSale": {"$ifNull": ["$isOnSale", False]},
                "salePrice": "$salePrice",
                "saleDescription": "$saleDescription",
                "saleDaysLeft": {
                    "$cond": {
                        "if": {"$and": ["$isOnSale", "$saleEndDate"]},
                        "then": {
                            "$max": [0, {"$ceil": {"$divide": [{"$subtract": ["$saleEndDate", datetime.utcnow()]}, 1000 * 60 * 60 * 24]}}]
                        },
                        "else": None
                    }
                },
            }}
        ]
        best_price = list(products_collection.aggregate(pipeline))
        
        # FIXED: Unified coordinate handling using extract_shop_coordinates
        if user_lat and user_lng and \
           (-90 <= user_lat <= 90) and (-180 <= user_lng <= 180):
            for product in best_price:
                shop_lat, shop_lng = extract_shop_coordinates(product)
                if shop_lat is not None and shop_lng is not None:
                    product['distance'] = haversine(
                        user_lat, user_lng,
                        shop_lat,
                        shop_lng
                    )
        
        return {"products": best_price}
    except Exception as error:
        print(f"Best price error: {error}")
        return {"products": []}
        
# ===== UPDATED TRACKING ENDPOINTS =====
@router.post("/record-shop-view/{shop_id}")
async def record_shop_view(shop_id: str):
    try:
        # Validate shop ID format
        if not shop_id or not re.match(r'^[0-9a-fA-F]{24}$', shop_id):
            raise HTTPException(
                status_code=400, 
                detail="Invalid shop ID"
            )
        
        # Create view document
        view_data = {
            "shop_id": shop_id,
            "timestamp": datetime.utcnow(),
            "type": "view"
        }
        product_views_collection.insert_one(view_data)
        
        # Immediately update shop's view count
        shops_collection.update_one(
            {"_id": ObjectId(shop_id)},
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