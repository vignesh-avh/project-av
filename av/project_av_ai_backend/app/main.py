from fastapi import FastAPI, File, UploadFile, Query, HTTPException, Request, Header, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dateutil.relativedelta import relativedelta  # Add this at top
from .routes.auth import create_access_token 
from typing import List
from pymongo import MongoClient
from pymongo import ReturnDocument
import os
from fastapi.responses import JSONResponse
from firebase_admin import firestore
from PIL import Image
from .utils.distance import isValidIndianCoordinate  # Import validation
import logging
logger = logging.getLogger("uvicorn.error")
import traceback
from fastapi.exceptions import HTTPException as FastAPIHTTPException
import cloudinary
import cloudinary.uploader
from fastapi import Form, File, UploadFile
from pydantic import BaseModel
from datetime import datetime, timedelta
from app.routes.shops import haversine
from datetime import datetime, timedelta, timezone


from fastapi import Form
import jwt  # Added for token verification
import uuid  # Added for UID generation
from bson import ObjectId
import re
from datetime import datetime
from bson import ObjectId
import re


# Add this at top with other imports
from app.routes.auth import router as auth_router, create_access_token  # Added create_access_token
# Add this import at top
from app.routes import referral

from io import BytesIO
import os
from dotenv import load_dotenv
import re
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
import pymongo  # Added for health check
import logging  # Added for proper logging
import razorpay
import hmac
import hashlib

from html import escape
from bson import ObjectId  # Added for MongoDB ObjectId handling

# Removed Firebase imports and initialization

from app.clip_model import predict_product_name
from app.routes.shops import router as shops_router

# ADD THIS HELPER FUNCTION
def safe_object_id(id_str: str):
    try:
        return ObjectId(id_str)
    except:
        raise HTTPException(
            status_code=400, 
            detail="Invalid ID format"
        )

# Initialize logging
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.ERROR)

# FIX 1: Properly load .env file
dotenv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')

load_dotenv(dotenv_path)

# Initialize Razorpay client
razorpay_client = razorpay.Client(auth=(os.getenv("RAZORPAY_KEY_ID"), os.getenv("RAZORPAY_KEY_SECRET")))

# Get JWT secret and algorithm from environment
SECRET_KEY = os.getenv("SECRET_KEY", "default_secret")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

app = FastAPI(debug=True)

# ======== ADDED CORS MIDDLEWARE ========
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Add your production domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/auth")
# Add this after creating the FastAPI app
app.include_router(referral.router, prefix="/referral")

# ✅ ADDED: New function to update onboarding status
def update_user_onboarding_status(owner_id):
    try:
        users_collection.update_one(
            {"uid": owner_id},
            {"$set": {"onboardingDone": True}}
        )
    except Exception as e:
        print(f"Failed to update onboarding status: {str(e)}")

# ✅ Now define the 404 handler AFTER middleware
@app.exception_handler(Exception)
async def universal_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, FastAPIHTTPException):
        raise exc

    # This will print the full traceback (file + line + code) to terminal
    logger.error("Unhandled exception on path %s:\n%s", request.url.path, traceback.format_exc())

    response = JSONResponse(
        status_code=500,
        content={"error": f"Internal server error: {str(exc)}"}
    )
    # ADD CORS HEADERS TO ERROR RESPONSES
    response.headers["Access-Control-Allow-Origin"] = "http://localhost:3000"
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response

'''# FIXED: Proper middleware implementation with OPTIONS request handling
@app.middleware("http")
async def enforce_json_response(request: Request, call_next):
    try:
        # Skip middleware for OPTIONS requests
        if request.method == "OPTIONS":
            response = await call_next(request)
            return response
        
        response = await call_next(request)
        
        # Convert all non-JSON responses to JSON
        if "application/json" not in response.headers.get("Content-Type", ""):
            try:
                content = await response.body()
                return JSONResponse(
                    content={"error": f"Server returned non-JJSON response: {str(content)[:200]}"},
                    status_code=500
                )
            except:
                return JSONResponse(
                    content={"error": "Server returned non-JSON response"},
                    status_code=500
                )
        return response
    except Exception as e:
        logger.exception(f"Middleware error: {str(e)}")
        return JSONResponse(
            content={"error": f"Internal server error: {str(e)}"},
            status_code=500
        )'''

def calculate_phase_details(created_at):
    now = datetime.utcnow()
    months_since_start = (now.year - created_at.year) * 12 + (now.month - created_at.month)
    
    # Exact phase matching frontend
    if months_since_start == 0:
        return {"phase": 1, "coins_required": 450, "discount_percent": 100}
    elif months_since_start == 1:
        return {"phase": 2, "coins_required": 450, "discount_percent": 75}
    elif months_since_start == 2:
        return {"phase": 3, "coins_required": 450, "discount_percent": 50}
    elif months_since_start == 3:
        return {"phase": 4, "coins_required": 450, "discount_percent": 25}
    else:
        return {"phase": 5, "coins_required": 0, "discount_percent": 0}

# ======== UPDATED CRON JOB MONITORING ======== (Change 8)


def sanitize_input(text: str) -> str:
    # Remove potentially harmful characters
    text = escape(text)
    text = re.sub(r'[^\w\s.,-]', '', text)
    return text.strip()


@app.on_event("startup")
def startup_db_client():
    MONGO_URI = os.getenv("MONGO_URI")
    if not MONGO_URI:
        raise ValueError("MONGO_URI environment variable not set")
    
    global client, db, products_collection, cart_collection, shops_collection, rewards_collection, users_collection, payments_collection
    
    client = MongoClient(MONGO_URI)
    db = client["project_av"]
    products_collection = db["products"]
    cart_collection = db["cart"]
    shops_collection = db["shops"]
    rewards_collection = db["rewards"]
    users_collection = db["users"]
    payments_collection = db["payments"]
    
    # Add new collections
    global product_views_collection, product_sales_collection
    product_views_collection = db["product_views"]
    product_sales_collection = db["product_sales"]
    
    print("✅ Connected to MongoDB with payments collection")  # Updated message

    try:
        cloudinary.config(
            cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
            api_key=os.getenv("CLOUDINARY_API_KEY"),
            api_secret=os.getenv("CLOUDINARY_API_SECRET"),
        )
        print("✅ Configured Cloudinary")
    except Exception as e:
        print(f"❌ Cloudinary configuration failed: {e}")

# MongoDB connection check for health endpoint
def check_mongodb_connection():
    try:
        # Try to list databases to check connection
        client.list_database_names()
        return True
    except pymongo.errors.ConnectionFailure:
        return False
    except Exception:
        return False

# Health check endpoint
@app.get("/health")
async def health_check():
    if check_mongodb_connection():
        return JSONResponse(content={"status": "ok", "database": "connected"})
    return JSONResponse(content={"status": "error", "database": "disconnected"}, status_code=500)

# ======== UPDATED TOKEN VERIFICATION ENDPOINT ========
@app.get("/verify-token")
async def verify_token(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        
        # Fetch user from database
        user = users_collection.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return {
            "role": user.get("role", "customer"),
            "onboardingDone": user.get("onboarding_done", False),
            "uid": str(user["_id"]),
            "hasEnteredReferral": user.get("hasEnteredReferral", False)
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.post("/predict/")
async def predict(file: UploadFile = File(...)):
    try:
        if file.content_type not in ["image/jpeg", "image/png"]:
            raise HTTPException(status_code=400, detail="Invalid file type")
        
        contents = await file.read()
        if len(contents) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large")
        
        img = Image.open(BytesIO(contents))
        result = predict_product_name(img)
        return {"product_name": result}
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": str(e)})


@app.post("/add-product/")
async def add_product(
    product_name: str = Form(...),
    price: float = Form(...),
    unit: str = Form(...),
    owner_id: str = Form(...),
    count: int = Form(...),
    file: UploadFile = File(...)
):
    try:
        # Step 1: Upload the original image without any transformation parameters.
        upload_result = cloudinary.uploader.upload(
            file.file,
            folder="project_av_products"
        )
        
        public_id = upload_result.get("public_id")
        
        if not public_id:
            raise HTTPException(status_code=500, detail="Image upload failed, public_id not found.")

        # --- FINAL FIX ---
        # Manually construct the URL to include the on-the-fly background removal
        # transformation ('e_background_removal'). This ensures the correct version is always served.
        # NOTE: The cloud name 'dwg7jqdq7' is taken from your dashboard details.
        image_url = f"https://res.cloudinary.com/dwg7jqdq7/image/upload/e_background_removal/{public_id}.jpg"
        
        # Step 2: Save the product to the database with the correctly transformed URL.
        product_dict = {
            "product_name": sanitize_input(product_name),
            "price": price,
            "unit": unit,
            "owner_id": owner_id,
            "count": count,
            "imageUrl": image_url, # This is now the correctly transformed URL
            "inStock": True,
            "created_at": datetime.utcnow()
        }
        
        shop = shops_collection.find_one({"owner_id": owner_id})
        if shop:
            product_dict["shop_id"] = str(shop["_id"])
        
        result = products_collection.insert_one(product_dict)
        product_id = str(result.inserted_id)
        
        return {
            "message": "Product added successfully",
            "product_id": product_id,
            "product": {**product_dict, "_id": product_id}
        }
    except Exception as e:
        logger.error(f"Error adding product: {traceback.format_exc()}")
        return JSONResponse(status_code=500, content={"error": f"Failed to add product: {str(e)}"})

@app.get("/get-products/")
async def get_products(owner_id: str = Query(...)):
    try:
        products = list(products_collection.find({"owner_id": owner_id}))
        
        # Convert MongoDB ObjectId to string
        for product in products:
            if '_id' in product:
                product['_id'] = str(product['_id'])
                
        return {"products": products}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

class CartItem(BaseModel):
    product_name: str
    price: float
    unit: str
    quantity: int
    user_id: str
    shop_id: str  # CRITICAL: Added for MongoDB relation
    timestamp: str # Added for proper document structure


@app.post("/checkout-cart/")
async def checkout_cart(cart_items: List[dict]):
    try:
        if not cart_items:
            return JSONResponse(
                status_code=400, 
                content={"error": "Cart is empty."}
            )

        # ================== START OF CORRECTION ==================
        # This new logic robustly finds the user, whether the ID is an email or an ObjectId.
        
        user_identifier = cart_items[0]['user_id']
        user = None

        # Check if the identifier is a valid ObjectId
        if ObjectId.is_valid(user_identifier):
            user = users_collection.find_one({"_id": ObjectId(user_identifier)})
        
        # If not a valid ObjectId or user not found, assume it's a uid/email
        if not user:
            user = users_collection.find_one({"uid": user_identifier})

        # If user is still not found, return an error
        if not user:
            return JSONResponse(
                status_code=404,
                content={"error": f"User not found with identifier: {user_identifier}"}
            )
        
        # Use the real database _id for all subsequent operations
        user_db_id = user["_id"]
        
        # =================== END OF CORRECTION ===================

        # Decrement product count (this logic is now safe)
        for item in cart_items:
            product_id = safe_object_id(item.get("id"))
            quantity = item.get("quantity", 1)
            products_collection.update_one(
                {"_id": product_id},
                {"$inc": {"count": -quantity}}
            )
        
        # Insert cart items into the cart collection (this logic is correct)
        result = cart_collection.insert_many(cart_items)
        
        # Add coins reward using the correct user_db_id
        reward_amount = 3
        
        # Update user document using the correct ID
        users_collection.update_one(
            {"_id": user_db_id},
            {"$inc": {"coins": reward_amount}}
        )
        
        # Get updated coin balance
        updated_user = users_collection.find_one({"_id": user_db_id})
        updated_coins = updated_user.get("coins", 0)
        
        # Add reward transaction
        rewards_collection.insert_one({
            "user_id": str(user_db_id), # Store the ID as a string
            "coins": reward_amount,
            "type": "checkout",
            "created_at": datetime.utcnow()
        })
        
        return {
            "message": "Checkout successful", 
            "status": "success",
            "updated_coins": updated_coins
        }
        
    except Exception as e:
        # Improved error logging to help debug future issues
        logger.error(f"Checkout failed unexpectedly: {traceback.format_exc()}")
        return JSONResponse(
            status_code=500, 
            content={"error": f"Checkout failed: {str(e)}"}
        )
# CHANGE 2: Fixed endpoint URL (removed trailing slash)
class AddToCartRequest(BaseModel):
    product_id: str
    user_id: str

@app.post("/cart/add-item")
async def add_item_to_cart(request: AddToCartRequest):
    try:
        product_obj_id = safe_object_id(request.product_id)

        # This is an "atomic" operation. It finds a product with a count > 0
        # and decrements the count in a single, uninterruptible step.
        updated_product = products_collection.find_one_and_update(
            {"_id": product_obj_id, "count": {"$gt": 0}},
            {"$inc": {"count": -1}},
            return_document=ReturnDocument.AFTER # Return the document AFTER the update
        )

        # If updated_product is None, it means the product was already out of stock
        if not updated_product:
            raise HTTPException(status_code=400, detail="Product is out of stock.")

        # The rest of the logic for analytics can happen here
        # For example, recording the sale event (we will use this instead of the old endpoint)
        shop_id_obj = safe_object_id(updated_product.get("shop_id"))
        product_sales_collection.insert_one({
            "product_id": product_obj_id,
            "shop_id": shop_id_obj,
            "quantity": 1,
            "timestamp": datetime.utcnow()
        })
        products_collection.update_one(
            {"_id": product_obj_id},
            {"$inc": {"sale_count": 1}}
        )

        # Return the fully updated product so the frontend can update its state
        updated_product['_id'] = str(updated_product['_id']) # Serialize ID
        return {"success": True, "product": updated_product}

    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        logger.error(f"Add to cart failed: {e}")
        raise HTTPException(status_code=500, detail="Could not add item to cart.")
@app.get("/get-cart")
async def get_cart(user_id: str = Query(...)):
    try:
        items = list(cart_collection.find({"user_id": user_id}, {"_id": 0}))
        return {"cart": items}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

app.include_router(shops_router)

class ShopCreate(BaseModel):
    name: str
    rating: float
    latitude: float
    longitude: float
    store: str
    owner_id: str  # Will be overridden by token-based owner_id

# ======== UPDATED ADD-SHOP ENDPOINT ========
# Add this validation function
def validate_indian_coordinates(lat: float, lng: float):
    if not (6.0 <= lat <= 38.0) or not (68.0 <= lng <= 98.0):
        raise HTTPException(
            status_code=400,
            detail="Invalid Indian coordinates. Must be within 6-38°N, 68-98°E"
        )

@app.post("/add-shop")
async def add_shop(shop: ShopCreate, authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")  # Get user ID from token
        

        # Validate and normalize coordinates FIRST
        try:
            lat, lng = validate_and_normalize_coords(shop.latitude, shop.longitude)
        except Exception as e:
            return JSONResponse(
                status_code=400,
                content={"error": str(e)}
            )
         # Check if shop already exists
        existing_shop = shops_collection.find_one({"owner_id": user_id})
        if existing_shop:
            return JSONResponse(
                status_code=400,
                content={"error": "Shop already exists for this owner"}
            )

        # New nested try block for shop creation process
        try:
            # Update user status in database
            users_collection.update_one(
                {"_id": ObjectId(user_id)},
                {"$set": {"onboarding_done": True}}
            )
            
            # Strict coordinate validation with rounding and bounds check
            lat, lng = validate_and_normalize_coords(shop.latitude, shop.longitude)
            
            # Create shop document with normalized coords and timestamp
            shop_dict = shop.dict()
            shop_dict.update({
                "owner_id": user_id,
                "latitude": lat,
                "longitude": lng,
                "location": {
                    "type": "Point",
                    "coordinates": [lng, lat]
                },
                "created_at": datetime.utcnow()  # Added created_at field
            })
            
            # DEBUG logging
            logger.info(f"Shop created at: {lat},{lng}")
            
            # Insert and return
            result = shops_collection.insert_one(shop_dict)
            
            # Generate new token with updated claims
            new_token = create_access_token({
                **payload,
                "onboarding_done": True
            })
            
            return {
                "message": "Shop added successfully", 
                "shop_id": str(result.inserted_id),
                "access_token": new_token
            }
            
        except Exception as e:
            logger.error(f"Shop creation error: {str(e)}")
            return JSONResponse(
                status_code=400,
                content={"error": str(e)}
            )
            
    except Exception as e:
        print("❌ Add shop error:", str(e))
        return JSONResponse(status_code=500, content={"error": str(e)})

# Added strict coordinate validation
def validate_and_normalize_coords(lat: float, lng: float):
    try:
        # Validate first BEFORE rounding
        if not (6.0 <= lat <= 38.0) or not (68.0 <= lng <= 98.0):
            raise ValueError("Coordinates outside India")
        
        # Then normalize/round AFTER validation
        return round(lat, 6), round(lng, 6)
    except (TypeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
# ======== END OF ADD-SHOP UPDATE ========
@app.get("/get-shop-coordinates/{shop_id}")
async def get_shop_coordinates(shop_id: str):
    try:
        shop = shops_collection.find_one({"_id": ObjectId(shop_id)})
        if not shop:
            return JSONResponse(
                status_code=404,
                content={"error": "Shop not found"}
            )
        return {
            "latitude": shop["latitude"],
            "longitude": shop["longitude"]
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )
@app.get("/check-onboarding/")
async def check_onboarding(uid: str = Query(...)):
    try:
        # FIX: Return consistent boolean format
        shop_exists = shops_collection.find_one({"owner_id": uid})
        return {"onboardingDone": bool(shop_exists)}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
# Add this new endpoint to app/main.py
# Add this new endpoint
@app.delete("/delete-product/{product_id}")
async def delete_product(product_id: str):
    try:
        from bson import ObjectId
        
        # Check if product_id is a valid ObjectId
        if not product_id or not ObjectId.is_valid(product_id):
            return JSONResponse(
                status_code=400, 
                content={"error": "Invalid product ID format"}
            )
        
        obj_id = ObjectId(product_id)
        result = products_collection.delete_one({"_id": obj_id})
        
        if result.deleted_count == 1:
            return {"message": "Product deleted successfully"}
        else:
            return JSONResponse(
                status_code=404, 
                content={"error": "Product not found"}
            )
    except Exception as e:
        return JSONResponse(
            status_code=500, 
            content={"error": f"Error deleting product: {str(e)}"}
        )

# Add this new endpoint
# Update the endpoint to handle price conversion
# CHANGE 3: Updated stock status endpoint with manual update preservation
# Add this endpoint
@app.get("/check-shop-exists")
async def check_shop_exists(owner_id: str = Query(...)):
    try:
        shop = shops_collection.find_one({"owner_id": owner_id})
        return {"exists": bool(shop)}
    except Exception as e:
        print(f"Shop check error: {str(e)}")
        return {"exists": False}

@app.put("/update-product/{product_id}")
async def update_product(product_id: str, updated_data: dict):
    try:
        obj_id = safe_object_id(product_id) # Uses the helper function

        # Create a dynamic payload for $set.
        # This ensures we only update the fields that are sent from the frontend.
        update_payload = {}

        # Check for each possible field and add it to the payload if it exists
        if "product_name" in updated_data:
            update_payload["product_name"] = sanitize_input(updated_data["product_name"])
        
        if updated_data.get("price") is not None:
            update_payload["price"] = float(updated_data["price"])

        if "unit" in updated_data:
            update_payload["unit"] = updated_data["unit"]
            
        if "inStock" in updated_data:
            update_payload["inStock"] = bool(updated_data["inStock"])
            update_payload["lastUpdated"] = datetime.utcnow().isoformat()
            
        # ADD THIS BLOCK TO HANDLE THE 'count' FIELD
        if updated_data.get("count") is not None:
            try:
                # Ensure count is a whole number
                update_payload["count"] = int(updated_data["count"])
            except (ValueError, TypeError):
                # If conversion fails, ignore the field or return an error
                pass 

        # If there's nothing to update, return an error.
        if not update_payload:
            return JSONResponse(status_code=400, content={"error": "No update data provided"})

        # Perform the update operation in the database
        result = products_collection.update_one(
            {"_id": obj_id},
            {"$set": update_payload}
        )

        if result.modified_count == 1 or result.matched_count == 1:
            return {"message": "Product updated successfully"}
        else:
            return JSONResponse(status_code=404, content={"error": "Product not found"})

    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/products/deals")
async def get_deals_products(
    user_lat: float = Query(...),
    user_lng: float = Query(...),
    limit: int = 10
):
    try:
        # Find shops within a 5km radius
        nearby_shops_cursor = shops_collection.find({
            "location": {
                "$nearSphere": {
                    "$geometry": {"type": "Point", "coordinates": [user_lng, user_lat]},
                    "$maxDistance": 20000
                }
            }
        })
        nearby_shop_ids = [str(shop["_id"]) for shop in nearby_shops_cursor]
        if not nearby_shop_ids:
            return {"products": []}

        # Find products that are on sale, not expired, and from those nearby shops
        pipeline = [
            {"$match": {
                "shop_id": {"$in": nearby_shop_ids},
                "isOnSale": True,
                "saleEndDate": {"$gte": datetime.utcnow()}
            }},
            {"$sort": {"created_at": -1}}, # Using -1 for DESCENDING with pymongo
            {"$limit": limit},
            {"$lookup": {
                "from": "shops",
                "let": {"shop_id_obj": {"$toObjectId": "$shop_id"}},
                "pipeline": [{"$match": {"$expr": {"$eq": ["$_id", "$$shop_id_obj"]}}}],
                "as": "shop_data"
            }},
            {"$unwind": "$shop_data"},
            {"$project": {
                "_id": {"$toString": "$_id"},
                "product_name": 1, "price": 1, "unit": 1, "imageUrl": 1,
                "shop_id": 1, "shop_name": "$shop_data.name",
                "shop_latitude": "$shop_data.latitude", "shop_longitude": "$shop_data.longitude",
                "isOnSale": 1, "salePrice": 1, "saleDescription": 1
            }}
        ]
        deals = list(products_collection.aggregate(pipeline))
        
        # Add distance calculation
        for product in deals:
            if product.get("shop_latitude") and product.get("shop_longitude"):
                product['distance'] = haversine(
                    user_lat, user_lng,
                    product["shop_latitude"], product["shop_longitude"]
                )

        return {"products": deals}
    except Exception as error:
        print(f"Deals products error: {error}")
        return {"products": []}        

# New endpoint for shops with in_stock filter
@app.get("/get-shops")
async def get_shops(
    product_name: str = Query(...),
    user_lat: float = Query(...),
    user_lng: float = Query(...),
    in_stock: bool = Query(True)  # NEW PARAMETER
):
    try:
        # Find products matching the name
        query = {
            "product_name": {"$regex": product_name, "$options": "i"},
        }
        
        # ADD IN-STOCK FILTER
        if in_stock:
            query["inStock"] = True
            
        matching_products = list(products_collection.find(query))
        
        # Get unique shop IDs from matching products
        shop_ids = list({str(product["shop_id"]) for product in matching_products if "shop_id" in product})
        
        # Find shops within 10km radius
        shops = shops_collection.find({
            "_id": {"$in": [ObjectId(id) for id in shop_ids]},
            "location": {
                "$nearSphere": {
                    "$geometry": {
                        "type": "Point",
                        "coordinates": [user_lng, user_lat]
                    },
                    "$maxDistance": 10000  # 10km
                }
            }
        })
        
        # Format response
        shop_list = []
        for shop in shops:
            # Find products for this shop
            shop_products = [p for p in matching_products if str(p["shop_id"]) == str(shop["_id"])]
            
            shop_list.append({
                "id": str(shop["_id"]),
                "name": shop["name"],
                "rating": shop["rating"],
                "store": shop["store"],
                "products": [{
                    "id": str(p["_id"]),
                    "name": p["product_name"],
                    "price": p["price"],
                    "unit": p["unit"],
                    "inStock": p.get("inStock", True)
                } for p in shop_products]
            })
        
        return {"shops": shop_list}
    except Exception as e:
        print(f"Error in get_shops: {str(e)}")
        return {"shops": []}

# New endpoints for coin system
# Update get-user-coins endpoint
@app.get("/get-user-coins")
async def get_user_coins(user_id: str = Query(...)):
    try:
        # Calculate coins from rewards collection
        rewards = list(rewards_collection.find({"user_id": user_id}))
        total_coins = sum(r["coins"] for r in rewards)
        return {"total_coins": total_coins}
    except Exception as e:
        return {"total_coins": 0}

# Add this new endpoint for adding rewards
class Reward(BaseModel):
    user_id: str
    coins: int
    type: str

@app.post("/add-reward")
async def add_reward(reward: Reward):
    try:
        # Ensure coins=3 for "checkout" type
        coins = 3 if reward.type == "checkout" else reward.coins
        
        # Update user's coin balance
        users_collection.update_one(
            {"_id": ObjectId(reward.user_id)},
            {"$inc": {"coins": coins}}
        )
            
        rewards_collection.insert_one({
            "user_id": reward.user_id,
            "coins": coins,
            "type": reward.type,
            "created_at": datetime.utcnow()
        })
        return {"success": True}
    except Exception as e:
        return JSONResponse(
            status_code=500, 
            content={"success": False, "error": str(e)}
        )

@app.get("/get-next-payment-date")
async def get_next_payment_date(user_id: str = Query(...)):
    try:
        user = users_collection.find_one({"uid": user_id})
        if not user:
            # Create new user with initial subscription date
            next_date = datetime.utcnow() + relativedelta(months=1)
            next_date_str = next_date.isoformat()
            
            users_collection.insert_one({
                "uid": user_id,
                "next_payment_date": next_date_str,
                "subscription_active": True,
                "created_at": datetime.utcnow()
            })
            return {"next_payment_date": next_date_str}
        
        # Return existing date
        return {"next_payment_date": user.get("next_payment_date", "")}
        
    except Exception as e:
        print(f"Error in get_next_payment_date: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail="Failed to get payment date"
        )

# Update the create-user endpoint
@app.post("/create-user/")
async def create_user_endpoint(user: dict):
    try:
        # Calculate initial subscription date
        next_payment_date = (datetime.utcnow() + relativedelta(months=1)).strftime("%Y-%m-%d")
        
        # Add null check and UID generation
        user_data = {
            "uid": user.get("email") or str(uuid.uuid4()),  # Modified line
            "email": user.get("email", ""),
            "fullName": user.get("fullName", ""),
            "city": user.get("city", ""),
            "role": user.get("role", "customer"),
            "onboardingDone": user.get("onboardingDone", False),
            "referralCode": user.get("referralCode", ""),
            "referralCount": user.get("referralCount", 0),
            "hasEnteredReferral": False,  # Changed to always initialize as False
            "created_at": datetime.utcnow().isoformat(),
            "next_payment_date": next_payment_date,
            "subscription_active": True
        }
        
        # Insert into MongoDB
        users_collection.insert_one(user_data)
        
        return {"success": True}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"User creation failed: {str(e)}"}
        )

class UserProfileUpdateRequest(BaseModel):
    user_id: str
    fullName: str
    city: str

@app.post("/update-user-profile")
async def update_user_profile(request: UserProfileUpdateRequest):
    try:
        user_obj_id = safe_object_id(request.user_id)
        
        # Sanitize and validate input
        if len(request.fullName.strip()) == 0:
            raise HTTPException(status_code=400, detail="Full name cannot be empty.")
        if len(request.fullName) > 50 or len(request.city) > 50:
            raise HTTPException(status_code=400, detail="Input is too long.")

        update_payload = {
            "fullName": request.fullName.strip(),
            "city": request.city.strip()
        }
        
        result = users_collection.update_one(
            {"_id": user_obj_id},
            {"$set": update_payload}
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="User not found.")
        
        return {"success": True, "message": "Profile updated successfully."}

    except Exception as e:
        logger.error(f"Failed to update user profile: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail="An internal server error occurred.")


class ShopLocationUpdateRequest(BaseModel):
    owner_id: str
    latitude: float
    longitude: float

@app.post("/owner/update-shop-location")
async def update_shop_location(request: ShopLocationUpdateRequest):
    try:
        owner_obj_id = safe_object_id(request.owner_id)
        owner = users_collection.find_one({"_id": owner_obj_id})
        if not owner or owner.get("role") != "owner":
            raise HTTPException(status_code=403, detail="User is not a valid owner.")

        shop = shops_collection.find_one({"owner_id": request.owner_id})
        if not shop:
            raise HTTPException(status_code=404, detail="Shop not found for this owner.")

        update_payload = {
            "latitude": request.latitude,
            "longitude": request.longitude,
            "location": {
                "type": "Point",
                "coordinates": [request.longitude, request.latitude]
            }
        }
        shops_collection.update_one(
            {"_id": shop["_id"]},
            {"$set": update_payload}
        )

        return {"success": True, "message": "Shop location updated successfully."}
    except Exception as e:
        logger.error(f"Failed to update shop location: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail="An internal server error occurred.")


@app.get("/get-user")
async def get_user(user_id: str = Query(...)):
    try:
        from bson import ObjectId
        # Try both uid and email fields
        user = None
        
        # First try as ObjectId
        try:
            user = users_collection.find_one({"_id": ObjectId(user_id)})
        except:
            pass
        
        # Then try as email
        if not user:
            user = users_collection.find_one({"email": user_id})
            
        # Then try as uid
        if not user:
            user = users_collection.find_one({"uid": user_id})
            
        if user:
            # Convert ObjectId to string
            if '_id' in user:
                user['_id'] = str(user['_id'])
                
            return {
                "id": user.get("_id"),
                "email": user.get("email", ""),
                "fullName": user.get("fullName", ""),
                "city": user.get("city", ""),
                "role": user.get("role", "customer"),
                "referral_code": user.get("referral_code", ""),
                "referral_count": user.get("referral_count", 0),
                "referral_earnings": user.get("referral_earnings", 0),
                "coins": float(user.get("coins", 0)),
                "onboarding_done": user.get("onboarding_done", False),
                "hasEnteredReferral": user.get("hasEnteredReferral", False),
                "uid": user.get("uid", user.get("email", ""))  # Use email as fallback
            }
        return JSONResponse(
            status_code=404,
            content={"error": "User not found"}
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.get("/get-user-created-date")
async def get_user_created_date(user_id: str = Query(...)):
    try:
        # Try to get creation date from Firebase (using Firestore)
        # This is just a placeholder - you'll need Firebase Admin SDK
        created_at = datetime.utcnow() - timedelta(days=30)  # Placeholder
        return {"created_at": created_at.isoformat()}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

# MODIFIED: Updated payment verification endpoint with transaction storage
@app.post("/verify-razorpay-payment")
async def verify_razorpay_payment(payment_data: dict):
    try:
        params = {
            'razorpay_payment_id': payment_data['payment_id'],
            'razorpay_order_id': payment_data['order_id'],
            'razorpay_signature': payment_data['signature']
        }
        
        razorpay_client.utility.verify_payment_signature(params)
        
        # Store payment details in transactions collection
        payments_collection.insert_one({
            "user_id": payment_data["user_id"],
            "payment_id": payment_data["payment_id"],
            "order_id": payment_data["order_id"],
            "signature": payment_data["signature"],
            "amount": payment_data["amount"],
            "timestamp": datetime.utcnow(),
            "status": "verified",
            "method": "client_verification"
        })
        
        return {"status": "success"}
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": str(e)})

# FIX 2: Add proper error handling to Razorpay key endpoint
@app.get("/get-razorpay-key")
async def get_razorpay_key():
    try:
        key_id = os.getenv("RAZORPAY_KEY_ID")
        if not key_id:
            logger.error("Razorpay key not configured in environment variables")
            raise HTTPException(
                status_code=500,
                detail="Payment gateway configuration missing"
            )
        return {"key": key_id}
    except Exception as e:
        logger.exception(f"Error getting Razorpay key: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Payment gateway configuration error"
        )

# FIX 3: Add proper CORS headers to payment endpoints
@app.post("/create-razorpay-order")
async def create_razorpay_order(data: dict):
    try:
        amount = data["amount"]
        order = razorpay_client.order.create({
            "amount": amount,
            "currency": "INR",
            "payment_capture": 1
        })
        response = JSONResponse(content={"id": order["id"], "amount": order["amount"]})
        # FIX: Add CORS headers
        response.headers["Access-Control-Allow-Origin"] = "http://localhost:3000"
        response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        return response
    except Exception as e:
        logger.exception(f"Error creating Razorpay order: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

# FIX 4: Add OPTIONS handler for payment endpoints
@app.options("/create-razorpay-order")
async def options_create_order():
    response = JSONResponse(content={})
    response.headers["Access-Control-Allow-Origin"] = "http://localhost:3000"
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response

class RenewalRequest(BaseModel):
    user_id: str

@app.post("/renew-with-referral")
async def renew_with_referral(request: RenewalRequest):
    SUBSCRIPTION_COST = 99
    try:
        user_obj_id = safe_object_id(request.user_id)
        user = users_collection.find_one({"_id": user_obj_id})

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if user.get("role") != "owner":
            raise HTTPException(status_code=403, detail="This action is only for owners")

        referral_earnings = user.get("referral_earnings", 0)
        if referral_earnings < SUBSCRIPTION_COST:
            raise HTTPException(status_code=400, detail="Insufficient referral balance")

        # Process the renewal
        new_earnings = referral_earnings - SUBSCRIPTION_COST
        next_payment_date = datetime.utcnow() + relativedelta(months=1)

        users_collection.update_one(
            {"_id": user_obj_id},
            {
                "$set": {
                    "referral_earnings": new_earnings,
                    "next_payment_date": next_payment_date,
                    "subscription_active": True,
                    "last_payment_method": "referral",
                    "last_payment_time": datetime.utcnow()
                }
            }
        )
        
        # Re-fetch user to get all current data for the new token
        updated_user = users_collection.find_one({"_id": user_obj_id})
        
        # Issue a new token with all the latest claims to keep the client in sync
        access_token = create_access_token(
            data={
                "sub": str(updated_user["_id"]),
                "role": updated_user.get("role"),
                "onboarding_done": updated_user.get("onboarding_done", False),
                "has_entered_referral": updated_user.get("hasEnteredReferral", False),
                "uid": updated_user.get("uid", ""),
                "coins": updated_user.get("coins", 0)
            }
        )

        return {
            "success": True,
            "message": "Subscription renewed successfully using referral balance.",
            "access_token": access_token
        }

    except Exception as e:
        logger.error(f"Referral renewal failed: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail="An internal server error occurred during renewal.")

# Add endpoint for subscription update
@app.post("/update-subscription")
async def update_subscription(data: dict):
    try:
        user_id = data["user_id"]
        user_obj_id = safe_object_id(user_id)

        next_payment = datetime.utcnow() + relativedelta(months=1)
        
        result = users_collection.update_one(
            {"_id": user_obj_id},
            {"$set": {
                "subscription_active": True,
                "last_payment_method": data.get("method", "coins"),
                "last_payment_time": datetime.utcnow(),
                "next_payment_date": next_payment
            }}
        )

        if result.matched_count == 0:
            logger.error(f"Failed to update subscription for user_id: {user_id}. User not found.")
            return JSONResponse(status_code=404, content={"error": "User not found during final update."})

        # ===== ADD THIS BLOCK TO ISSUE AND RETURN A NEW TOKEN =====
        # Re-fetch the user to get all current data for the new token
        updated_user = users_collection.find_one({"_id": user_obj_id})
        
        # Issue a new token with all the latest claims
        access_token = create_access_token(
            data={
                "sub": str(updated_user["_id"]),
                "role": updated_user.get("role"),
                "onboarding_done": updated_user.get("onboarding_done", False),
                "has_entered_referral": updated_user.get("hasEnteredReferral", False),
                "uid": updated_user.get("uid", ""),
                "coins": updated_user.get("coins", 0)
            }
        )
        return {"success": True, "access_token": access_token}
        # =========================================================

    except Exception as e:
        logger.error(f"CRITICAL ERROR in update_subscription: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


# Add new endpoint
@app.post("/record-coin-transaction")
async def record_coin_transaction(transaction: dict):
    try:
        rewards_collection.insert_one({
            "user_id": transaction["user_id"],
            "coins": transaction["coins"],
            "type": transaction["type"],
            "timestamp": datetime.fromisoformat(transaction["timestamp"])
        })
        return {"success": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

class CoinPurchaseRequest(BaseModel):
    amount: int # Amount in INR

@app.post("/create-coin-purchase-order")
async def create_coin_purchase_order(request: CoinPurchaseRequest):
    try:
        if request.amount <= 0:
            raise HTTPException(status_code=400, detail="Invalid amount")

        order = razorpay_client.order.create({
            "amount": request.amount * 100, # Convert INR to paise
            "currency": "INR",
            "payment_capture": 1
        })
        return {"id": order["id"], "amount": order["amount"]}
    except Exception as e:
        logger.error(f"Error creating Razorpay coin order: {str(e)}")
        raise HTTPException(status_code=500, detail="Could not create payment order.")


class VerifyCoinPurchaseRequest(BaseModel):
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str
    user_id: str
    coins_to_add: int
    amount_paid: int # Amount in INR for verification

@app.post("/verify-coin-purchase")
async def verify_coin_purchase(request: VerifyCoinPurchaseRequest):
    try:
        # 1. Verify the payment signature to ensure it's a legitimate transaction
        params = {
            'razorpay_payment_id': request.razorpay_payment_id,
            'razorpay_order_id': request.razorpay_order_id,
            'razorpay_signature': request.razorpay_signature
        }
        razorpay_client.utility.verify_payment_signature(params)

        # 2. Add coins to the user's account
        user_obj_id = safe_object_id(request.user_id)
        users_collection.update_one(
            {"_id": user_obj_id},
            {"$inc": {"coins": request.coins_to_add}}
        )

        # 3. Log the transaction in the rewards collection for history
        rewards_collection.insert_one({
            "user_id": request.user_id,
            "coins": request.coins_to_add,
            "type": "purchase",
            "created_at": datetime.utcnow()
        })
        
        # 4. Log the payment transaction for financial records
        payments_collection.insert_one({
            "user_id": request.user_id,
            "payment_id": request.razorpay_payment_id,
            "order_id": request.razorpay_order_id,
            "amount": request.amount_paid,
            "timestamp": datetime.utcnow(),
            "status": "verified",
            "purpose": "coin_purchase"
        })

        # 5. Return success
        return {"success": True, "message": f"{request.coins_to_add} coins added successfully."}

    except Exception as e:
        logger.error(f"Coin purchase verification failed: {e}")
        raise HTTPException(status_code=400, detail="Payment verification failed.")

@app.post("/redeem-subscription")
async def redeem_subscription(data: dict):
    try:
        user_id = data.get("user_id")
        coins_to_use = data.get("coins_to_use", 0)
        
        if not user_id or coins_to_use <= 0:
            raise HTTPException(status_code=400, detail="Invalid data provided")
            
        # --- FIX 1: Correct user lookup by _id, not uid ---
        user_obj_id = safe_object_id(user_id)
        user = users_collection.find_one({"_id": user_obj_id})
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # --- FIX 2: Check against ACTIVE coins, not total coins ---
        coin_data = await get_user_coins(user_id) # Get the calculated active & total coins
        if coin_data.get("active_coins", 0) < coins_to_use:
            return JSONResponse(
                status_code=400,
                content={"success": False, "error": "Not enough coins"}
            )
            
        # The rest of the logic is correct:
        # 1. DEDUCT coins from the main total balance.
        users_collection.update_one(
             {"_id": user_obj_id},
            {"$inc": {"coins": -coins_to_use}}
        )
        
        # 2. Record the spending transaction in the 'rewards' log.
        rewards_collection.insert_one({
            "user_id": user_id,
            "coins": -coins_to_use,
            "type": "subscription",
            "created_at": datetime.utcnow()
        })

        return {"success": True, "coins_used": coins_to_use}

        
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )



@app.get("/get-user-subscription-phase")
async def get_user_subscription_phase(user_id: str = Query(...)):
    try:
        user = users_collection.find_one({"uid": user_id})
        if not user:
            return {"phase": 1, "months_since_start": 0}
        
        # Calculate months since first subscription
        created_at = user.get("created_at", datetime.utcnow())
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at)
        
        months_since_start = (datetime.utcnow() - created_at).days // 30
        
        # Determine phase
        if months_since_start < 3:
            return {"phase": 1, "months_since_start": months_since_start}
        elif months_since_start < 6:
            return {"phase": 2, "months_since_start": months_since_start}
        else:
            return {"phase": 3, "months_since_start": months_since_start}
            
    except Exception as e:
        print(f"Error getting subscription phase: {str(e)}")
        return {"phase": 1, "months_since_start": 0}

@app.get("/check-subscription-status")
async def check_subscription_status(user_id: str = Query(...)):
    try:
        # --- START OF ID MISMATCH FIX ---
        user = None
        # First, try to find the user by their email or uid
        user = users_collection.find_one({"uid": user_id})
        if not user:
            # If that fails, try to find them by their MongoDB _id
            if ObjectId.is_valid(user_id):
                user = users_collection.find_one({"_id": ObjectId(user_id)})

        if not user:
            # If user is still not found, they are not subscribed.
            return {"status": "not_subscribed"}
        # --- END OF ID MISMATCH FIX ---

        if not user.get("next_payment_date"):
            return {"status": "not_subscribed"}

        renewal_date = user["next_payment_date"]
        today = datetime.utcnow()
        days_until_renewal = (renewal_date - today).days

        grace_period_end = renewal_date + timedelta(days=3)
        if today > renewal_date and today < grace_period_end:
            grace_days_left = (grace_period_end - today).days
            return {
                "status": "grace_period_active",
                "days_left": grace_days_left + 1
            }

        if today >= grace_period_end:
             return {"status": "expired_locked"}

        if days_until_renewal <= 10:
            # Pass the user's actual _id string to get_user_coins
            coin_data = await get_user_coins(str(user["_id"]))
            if coin_data.get("active_coins", 0) < 450:
                return {
                    "status": "renewal_due_soon_warning",
                    "days_left": days_until_renewal + 1
                }

        return {"status": "active_ok"}

    except Exception as e:
        logger.error(f"Error in check_subscription_status: {e}")
        return {"status": "error"}
@app.get("/owner/check-subscription")
async def owner_check_subscription(owner_id: str = Query(...)):
    try:
        # Use safe_object_id for robust ID handling
        owner_obj_id = safe_object_id(owner_id)
        owner = users_collection.find_one({"_id": owner_obj_id})

        if not owner or owner.get("role") != "owner":
            # Return 'not_found' if user is not a valid owner
            return {"status": "not_found"}

        next_payment_date = owner.get("next_payment_date")
        if not next_payment_date:
            # If there's no payment date, they are treated as expired
            return {"status": "expired"}

        today = datetime.utcnow()
        days_left = (next_payment_date - today).days

        if days_left < 0:
            return {"status": "expired"}

        if days_left <= 10:
            # Add 1 to days_left so it says "in 1 day" instead of "in 0 days"
            return {"status": "expiring_soon", "days_left": days_left + 1}

        return {"status": "active"}

    except Exception as e:
        logger.error(f"Error in owner_check_subscription: {e}")
        return {"status": "error"}        

@app.get("/get-subscription-details")
async def get_subscription_details(user_id: str = Query(...)):
    try:
        # --- START OF ID MISMATCH FIX ---
        user = None
        # First, try to find the user by their email or uid
        user = users_collection.find_one({"uid": user_id})
        if not user:
            # If that fails, try to find them by their MongoDB _id
            if ObjectId.is_valid(user_id):
                 user = users_collection.find_one({"_id": ObjectId(user_id)})
        # --- END OF ID MISMATCH FIX ---
        
        if not user:
            logger.error(f"User not found in get_subscription_details for user_id: {user_id}")
            return {
                "coins": {"total_coins": 0, "active_coins": 0},
                "next_payment_date": (datetime.utcnow() + relativedelta(months=1)).isoformat(),
                "base_amount": 450,
                "referral_earnings": 0  # ADD THIS LINE
            }

        # Pass the user's actual _id string to get_user_coins for consistency
        coin_data = await get_user_coins(str(user["_id"]))
        
        next_payment_date = user.get("next_payment_date", datetime.utcnow() + relativedelta(months=1))
        if isinstance(next_payment_date, datetime):
            next_payment_date = next_payment_date.isoformat()

        return {
            "coins": coin_data,
            "next_payment_date": next_payment_date,
            "base_amount": 450,
            "referral_earnings": user.get("referral_earnings", 0) # ADD THIS LINE
        }
    
    except Exception as e:
        logger.exception(f"Critical error in get_subscription_details: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": "Internal server error"}
        )

# ✅ Place helper function OUTSIDE the route
async def get_user_coins(user_id: str):
    try:
        user = None
        if ObjectId.is_valid(user_id):
            user = users_collection.find_one({"_id": ObjectId(user_id)})
        if not user:
            user = users_collection.find_one({"uid": user_id})

        if not user:
            logging.error(f"DEBUG: User lookup FAILED for user_id: {user_id}")
            return {"total_coins": 0, "active_coins": 0}

        total_coins = user.get("coins", 0)
        user_db_id_str = str(user["_id"])
        user_uid = user.get("uid")
        
        # Query for transactions
        user_id_query = {"$in": [user_db_id_str, user_uid] if user_uid else [user_db_id_str]}
        
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=90)
        query = {
            "user_id": user_id_query,
            "$or": [
                {"created_at": {"$gte": cutoff_date}},
                {"timestamp": {"$gte": cutoff_date}}
            ]
        }
        
        recent_transactions = list(rewards_collection.find(query))
        active_coins = sum(t.get("coins", 0) for t in recent_transactions)
        
        return {
            "total_coins": total_coins,
            "active_coins": active_coins
        }
    except Exception as e:
        logging.error(f"FATAL ERROR in get_user_coins: {e}")
        return {"total_coins": 0, "active_coins": 0}

@app.post("/bulk-stock-update/")
async def bulk_stock_update(owner_id: str = Query(...), in_stock: bool = Query(...)):
    try:
        result = products_collection.update_many(
            {"owner_id": owner_id},
            {"$set": {"inStock": in_stock}}
        )
        return {"message": f"Updated {result.modified_count} products"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

# ADDED: Razorpay webhook endpoint
@app.post("/razorpay/webhook")
async def razorpay_webhook(request: Request):
    try:
        body = await request.body()
        signature = request.headers.get("x-razorpay-signature", "")
        webhook_secret = os.getenv("RAZORPAY_WEBHOOK_SECRET")
        
        # Verify signature
        generated_signature = hmac.new(
            webhook_secret.encode(),
            body,
            hashlib.sha256
        ).hexdigest()
        
        if generated_signature != signature:
            return JSONResponse(status_code=400, content={"error": "Invalid signature"})
        
        payload = await request.json()
        event_type = payload.get("event")
        
        # Handle payment capture event
        if event_type == "payment.captured":
            payment_id = payload["payload"]["payment"]["entity"]["id"]
            
            # Store transaction in database
            payments_collection.insert_one({
                "payment_id": payment_id,
                "order_id": payload["payload"]["payment"]["entity"]["order_id"],
                "signature": signature,
                "amount": payload["payload"]["payment"]["entity"]["amount"] / 100,
                "status": "captured",
                "timestamp": datetime.utcnow(),
                "event_type": event_type,
                "payload": payload
            })
        
        return JSONResponse(content={"status": "success"})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

# ✅ ADDED: New endpoint to update user referral status
@app.post("/update-user")
async def update_user(data: dict):
    try:
        users_collection.update_one(
            {"uid": data["uid"]},
            {"$set": {"hasEnteredReferral": data["hasEnteredReferral"]}}
        )
        return {"success": True}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )

# 🔥 NEW ENDPOINT: Update referral status
@app.post("/update-referral-status")
async def update_referral_status(data: dict):
    try:
        users_collection.update_one(
            {"uid": data["uid"]},
            {"$set": {"hasEnteredReferral": data["status"]}}
        )
        return {"success": True}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )

@app.post("/process-referral")
async def process_referral(data: dict):
    # ... existing code ...
    
    # Validate referral code format
    if not re.match(r"^[A-Z0-9]{6}$", referral_code):
        return JSONResponse(
            content={"success": False, "error": "Invalid referral code format"},
            status_code=400
        )
    
    # Prevent self-referral
    if owner["uid"] == customer_id:
        return JSONResponse(
            content={"success": False, "error": "Self-referral not allowed"},
            status_code=400
        )
    # In process-referral endpoint
    if user_data["hasEnteredReferral"]:
        return JSONResponse(
            content={"success": False, "error": "Referral already used"},
            status_code=400
        )

# ======== ADDED NEW ENDPOINTS ========
@app.post("/record-view/{product_id}")
async def record_view(product_id: str, shop_id: str):
    try:
        product_views_collection.insert_one({
            "product_id": product_id,
            "shop_id": shop_id,
            "timestamp": datetime.utcnow()
        })
        return {"success": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/record-sale/{product_id}")
async def record_sale(product_id: str, shop_id: str, quantity: int = 1):
    try:
        product_sales_collection.insert_one({
            "product_id": product_id,
            "shop_id": shop_id,
            "quantity": quantity,
            "timestamp": datetime.utcnow()
        })
        return {"success": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
# ======== END OF NEW ENDPOINTS ========

# ======== ADDED TRENDING PRODUCTS ENDPOINT ========

# ======== END OF TRENDING PRODUCTS ENDPOINT ========

app.include_router(shops_router)

# ======== ADDED OPTIONS HANDLER FOR UPDATE-USER-LOCATION ========
@app.options("/update-user-location")
async def options_update_location():
    return JSONResponse(content={}, headers={
        "Access-Control-Allow-Origin": "http://localhost:3000",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    })

# ✅ Add this error handler at the bottom of your main.py
@app.exception_handler(Exception)
async def universal_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": f"Internal server error: {str(exc)}"}
    )
# Add this endpoint to app/main.py
@app.post("/update-referral-status")
async def update_referral_status(data: dict):
    try:
        # Use consistent 'uid' field
        users_collection.update_one(
            {"uid": data["uid"]},  # CHANGED from _id to uid
            {"$set": {"hasEnteredReferral": data["status"]}}
        )
        return {"success": True}
    except Exception as e:
        logger.error(f"Referral status update failed: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": "Database update failed"}
        )

def generate_referral_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

def get_user_by_id(user_id):
    try:
        # FIX: Query by uid instead of _id
        user = users_collection.find_one({"uid": user_id})  # CHANGED
        if user:
            return user
        return None
    except:
        return None

# UPDATED REFERRAL ENDPOINTS

@app.post("/referral/skip-referral")
async def skip_referral(request: Request):
    data = await request.json()
    user_id = data.get("user_id")
    
    if not user_id:
        return JSONResponse(
            content={"error": "Missing user ID"},
            status_code=400
        )
    
    try:
        # FIX: Directly use UID without conversion
        users_collection.update_one(
            {"uid": user_id},
            {"$set": {"hasEnteredReferral": True}}
        )
        
        # Generate new token
        user = get_user_by_id(user_id)
        new_token = create_access_token({
            "sub": str(user["_id"]),
            "role": user["role"],
            "hasEnteredReferral": True
        })
        
        return {
            "access_token": new_token
        }
        
    except Exception as e:
        return JSONResponse(
            content={"error": str(e)},
            status_code=500
        )
# ADD CORS headers to error responses
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        }
    )          
@app.post("/record-shop-view/{shop_id}")
async def record_shop_view(shop_id: str):
    try:
        # Record shop view with timestamp
        db.shop_views.insert_one({
            "shop_id": ObjectId(shop_id),
            "timestamp": datetime.utcnow()
        })
        return {"success": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/record-sale")
async def record_sale(data: dict):
    try:
        # Record product sale with quantity
        db.product_sales.insert_one({
            "product_id": data["product_id"],
            "shop_id": data["shop_id"],
            "quantity": data["quantity"],
            "timestamp": datetime.utcnow()
        })
        return {"success": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
@app.post("/record-product-sale")
async def record_product_sale(sale_data: dict):
    try:
        # Convert string IDs to ObjectIds
        product_id = ObjectId(sale_data["product_id"])
        shop_id = ObjectId(sale_data["shop_id"])
        
        # Update product sale count
        products_collection.update_one(
            {"_id": product_id},
            {"$inc": {"sale_count": sale_data["quantity"]}}
        )
        
        # Return success immediately (don't wait for full transaction)
        return {"success": True}
    except Exception as e:
        print(f"Sale recording error: {str(e)}")
        return {"success": False}

# ======== ADDED USER LOCATION ENDPOINT BEFORE CATCH-ALL ========
@app.post("/update-user-location")
async def update_user_location(data: dict):
    try:
        user_id = data.get("user_id")
        if not user_id:
            raise HTTPException(status_code=400, detail="Missing user ID")
            
        # FIX: Only update location for shop owners
        user = users_collection.find_one({"uid": user_id})
        if not user or user.get("role") != "owner":
            return {"success": True}  # Skip for customers
        
        # Update only for owners
        users_collection.update_one(
            {"uid": user_id},
            {"$set": {
                "latitude": data["latitude"],
                "longitude": data["longitude"]
            }}
        )
        return {"success": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.options("/update-user-location")  # CORS FIX
async def options_update_location():
    return JSONResponse(content={}, headers={
        "Access-Control-Allow-Origin": "http://localhost:3000",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    })

class PromotionData(BaseModel):
    salePrice: float
    saleDescription: str
    durationDays: int

# ADD THIS NEW ENDPOINT to create or update a promotion
@app.put("/products/{product_id}/promotion")
async def update_promotion(product_id: str, promo_data: PromotionData):
    try:
        obj_id = safe_object_id(product_id)
        
        # Calculate the sale end date
        end_date = datetime.utcnow() + timedelta(days=promo_data.durationDays)

        update_payload = {
            "isOnSale": True,
            "salePrice": promo_data.salePrice,
            "saleDescription": promo_data.saleDescription,
            "saleEndDate": end_date
        }

        result = products_collection.update_one(
            {"_id": obj_id},
            {"$set": update_payload}
        )

        if result.matched_count == 0:
            return JSONResponse(status_code=404, content={"error": "Product not found"})
            
        return {"message": "Promotion updated successfully"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

# ADD THIS NEW ENDPOINT to remove a promotion
@app.delete("/products/{product_id}/promotion")
async def remove_promotion(product_id: str):
    try:
        obj_id = safe_object_id(product_id)

        # Use $unset to completely remove the promotion fields from the document
        unset_payload = {
            "isOnSale": "",
            "salePrice": "",
            "saleDescription": "",
            "saleEndDate": ""
        }

        result = products_collection.update_one(
            {"_id": obj_id},
            {"$unset": unset_payload}
        )

        if result.matched_count == 0:
            return JSONResponse(status_code=404, content={"error": "Product not found"})

        return {"message": "Promotion removed successfully"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def catch_all(path: str):
    return JSONResponse(
        status_code=404,
        content={"error": f"Endpoint not found: /{path}"}
    )