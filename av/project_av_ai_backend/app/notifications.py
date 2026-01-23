import firebase_admin
from firebase_admin import credentials, messaging
from app.db import users_collection, shops_collection, products_collection, product_views_collection
from bson import ObjectId
from datetime import datetime, timedelta, time
import logging
import random
from math import radians, cos, sin, asin, sqrt
import os # Add this line
import firebase_admin

# Configure logging
logger = logging.getLogger("uvicorn.error") # Use Uvicorn's logger

# --- Configuration ---
# Construct the absolute path to the key file relative to this script's location
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SERVICE_ACCOUNT_KEY_PATH = os.path.join(BASE_DIR, "firebase-service-account-key.json")
DEFAULT_NOTIFICATION_RADIUS_KM = 5 # How far to send customer notifications

# --- Initialization ---
try:
    cred = credentials.Certificate(SERVICE_ACCOUNT_KEY_PATH)
    firebase_admin.initialize_app(cred)
    logger.info("✅ Firebase Admin SDK Initialized Successfully.")
except Exception as e:
    logger.error(f"❌ Failed to initialize Firebase Admin SDK: {e}", exc_info=True)
    # Depending on your setup, you might want to raise an exception here
    # to prevent the app from starting without notification capability.

# --- Helper Functions ---

def haversine(lat1, lon1, lat2, lon2):
    """Calculates distance between two points on Earth."""
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    r = 6371 # Earth radius in km
    return c * r

def get_nearby_user_tokens(shop_lat, shop_lng, radius_km=DEFAULT_NOTIFICATION_RADIUS_KM):
    """Finds FCM tokens of users within a radius of a shop."""
    try:
        # Assuming users have 'latitude', 'longitude', and 'fcm_tokens' (list) fields
        nearby_users = users_collection.find({
            "location": {
                "$geoWithin": {
                    "$centerSphere": [[shop_lng, shop_lat], radius_km / 6371] # MongoDB needs radians
                }
            },
            "fcm_tokens": {"$exists": True, "$ne": []} # Only users with tokens
        })

        all_tokens = []
        for user in nearby_users:
            if isinstance(user.get("fcm_tokens"), list):
                all_tokens.extend(user["fcm_tokens"])
        
        # Remove duplicates just in case
        return list(set(all_tokens))
    except Exception as e:
        logger.error(f"Error finding nearby users: {e}", exc_info=True)
        return []



async def send_fcm_notification(tokens: list, title: str, body: str, data: dict = None):
    """Sends a notification to a list of FCM tokens and removes invalid tokens."""
    if not tokens:
        logger.warning(f"No FCM tokens provided for notification: '{title}'")
        return

    if isinstance(tokens, str):
        tokens = [tokens]
        
    valid_tokens = [token for token in tokens if token] # Filter out None or empty strings

    if not valid_tokens:
        logger.warning(f"No valid FCM tokens after filtering for notification: '{title}'")
        return

    # --- Prepare the message ---
    message = messaging.MulticastMessage(
        notification=messaging.Notification(
            title=title,
            body=body,
        ),
        tokens=valid_tokens,
        data=data or {}
    )

    try:
        # --- Send the message using send_each_for_multicast ---
        response = messaging.send_each_for_multicast(message)
        success_count = response.success_count
        failure_count = response.failure_count
        logger.info(f"FCM send_each_for_multicast Response - Success: {success_count}, Failure: {failure_count} for '{title}'")

        # --- Logic to Remove Invalid Tokens ---
        if failure_count > 0:
            tokens_to_remove = []
            errors_logged = []
            for i, resp in enumerate(response.responses):
                if not resp.success:
                    # Identify the token that failed
                    failed_token = valid_tokens[i] if i < len(valid_tokens) else None
                    if failed_token:
                        error = resp.exception
                        # Check if the error indicates the token is invalid or unregistered
                        is_unregistered = isinstance(error, messaging.UnregisteredError)
                        # You might need to check for specific error codes if available in error object
                        # Example: is_invalid_arg = isinstance(error, exceptions.InvalidArgumentError) and "registration token" in str(error).lower()
                        # Firebase Admin SDK often uses specific exception types like UnregisteredError
                        
                        if is_unregistered: # Add other conditions here if needed (e.g., or is_invalid_arg)
                            tokens_to_remove.append(failed_token)
                            errors_logged.append(f"Token [{failed_token[:10]}...] marked for removal: {type(error).__name__}")
                        else:
                            # Log other types of errors without removing the token
                            errors_logged.append(f"Token [{failed_token[:10]}...] failed (will not remove): {error}")

            if errors_logged:
                logger.warning(f"Failed FCM sends ({failure_count} total): {errors_logged}")

            # Remove the identified invalid tokens from the database
            if tokens_to_remove:
                try:
                    # Use MongoDB's $pull operator to remove specific tokens from the fcm_tokens array
                    # in any user document that contains them.
                    result = users_collection.update_many(
                        {"fcm_tokens": {"$in": tokens_to_remove}},
                        {"$pull": {"fcm_tokens": {"$in": tokens_to_remove}}}
                    )
                    logger.info(f"Removed {len(tokens_to_remove)} invalid FCM token(s) from {result.modified_count} user document(s).")
                except Exception as db_error:
                    logger.error(f"Failed to remove invalid FCM tokens from database: {db_error}", exc_info=True)
        # --- End Invalid Token Removal Logic ---

    except Exception as e:
        logger.error(f"Error in send_fcm_notification sending '{title}': {e}", exc_info=True)


async def send_owner_morning_reminder():
    """Sends a varied morning reminder to all owners."""
    try:
        owners = users_collection.find({"role": "owner", "fcm_tokens": {"$exists": True, "$ne": []}})
        tokens = []
        owner_names = {} # Store names to personalize if available
        for owner in owners:
             if isinstance(owner.get("fcm_tokens"), list):
                 owner_id_str = str(owner["_id"])
                 tokens.extend(owner["fcm_tokens"])
                 owner_names[owner_id_str] = owner.get("fullName", "Owner") # Get name, default to "Owner"

        unique_tokens = list(set(tokens))

        if unique_tokens:
            # --- Creative Message Variations ---
            titles = [
                "☀️ Rise and Shine!",
                "🚀 Ready to Boost Sales?",
                "📈 Start Your Sales Day Strong!",
                "⏰ Time for Fresh Stock!",
            ]
            bodies = [
                "A new day for sales! Check inventory & add today's freshest items.",
                "Customers are looking! Make sure your best products are visible.",
                f"Good morning! Let's make today your best sales day yet.",
                "Tip: Adding new products often attracts more views. What's new today?",
            ]
            title = random.choice(titles)
            body = random.choice(bodies)
            # --- End Variations ---

            # Note: Sending the same random message to all owners in this batch.
            # For per-owner random messages, the loop structure would need changes.
            await send_fcm_notification(unique_tokens, title, body)
            logger.info(f"Sent varied morning reminder to {len(unique_tokens)} owner tokens.")
    except Exception as e:
        # Corrected error logging for this function
        logger.error(f"Error in send_owner_morning_reminder: {e}", exc_info=True)


async def send_owner_evening_stats():
    """Sends personalized evening view stats with more varied messages."""
    try:
        today_start = datetime.combine(datetime.utcnow().date(), time.min)
        yesterday_start = today_start - timedelta(days=1)

        owners = list(users_collection.find({"role": "owner", "fcm_tokens": {"$exists": True, "$ne": []}}))

        for owner in owners:
            owner_id_str = str(owner["_id"]) # Use MongoDB ObjectId string
            shop = shops_collection.find_one({"owner_id": owner_id_str}) # Query shop by owner's string _id
            if not shop: continue

            shop_id_obj = shop["_id"] # Use Shop's ObjectId for views query

            today_views_count = product_views_collection.count_documents({
                "shop_id": shop_id_obj,
                "timestamp": {"$gte": today_start}
            })
            yesterday_views_count = product_views_collection.count_documents({
                 "shop_id": shop_id_obj,
                 "timestamp": {"$gte": yesterday_start, "$lt": today_start}
            })

            tokens = owner.get("fcm_tokens", [])
            # Basic check if tokens list exists and is not empty
            if not tokens or not isinstance(tokens, list) or not tokens[0]: continue

            # --- More Creative Message Variations ---
            title = "📊 Today's Shop Performance"
            body = ""
            if today_views_count == 0:
                body = random.choice([
                    "Hmm, quiet day today (0 views). Tomorrow's a new opportunity!",
                    "No views logged today. Try adding a promotion for tomorrow?",
                    "Looks like 0 views today. Let's strategize for more visibility!",
                ])
            elif today_views_count > yesterday_views_count:
                 increase = today_views_count - yesterday_views_count
                 body = random.choice([
                     f"🚀 Awesome! {today_views_count} views today, that's {increase} more than yesterday!",
                     f"📈 Trending Up! You got {today_views_count} views today. Keep the momentum going!",
                     f"🎉 Great job! {today_views_count} views today shows growing interest!",
                 ])
            elif today_views_count < yesterday_views_count:
                 decrease = yesterday_views_count - today_views_count
                 body = random.choice([
                     f"👍 Keep it up! {today_views_count} views today. Aiming higher tomorrow!",
                     f"➡️ Steady traffic with {today_views_count} views today. What can boost it tomorrow?",
                     f"📊 {today_views_count} views today. A small dip ({decrease} less), but let's bounce back!",
                 ])
            else: # today == yesterday (and > 0)
                 body = random.choice([
                     f"✨ Consistent! {today_views_count} views again today. Keep up the good work!",
                     f"✅ Solid performance: {today_views_count} views today, matching yesterday!",
                     f"➡️ Maintained {today_views_count} views today. Can we push it higher tomorrow?",
                 ])
            # --- End Variations ---

            await send_fcm_notification(tokens, title, body)

        logger.info(f"Sent varied evening stats to {len(owners)} owners.")

    except Exception as e:
        logger.error(f"Error in send_owner_evening_stats: {e}", exc_info=True)


async def send_owner_night_stock_reminder():
    """Reminds owners to check stock, mentioning specific low-stock items."""
    try:
        owners = list(users_collection.find({"role": "owner", "fcm_tokens": {"$exists": True, "$ne": []}}))

        for owner in owners:
            owner_id_str = str(owner["_id"]) # Use MongoDB ObjectId string for querying products
            tokens = owner.get("fcm_tokens", [])
            if not tokens or not isinstance(tokens, list) or not tokens[0]: continue

            # --- Find Low Stock Items ---
            low_stock_limit = 5
            low_stock_products = list(products_collection.find(
                {"owner_id": owner_id_str, "count": {"$lte": low_stock_limit}},
                {"product_name": 1, "_id": 0} # Only fetch the name
            ).limit(3)) # Limit to mentioning 3 items

            low_stock_names = [p.get("product_name") for p in low_stock_products if p.get("product_name")]
            # --- End Find Low Stock ---

            # --- Construct Dynamic Message ---
            title = "🌙 Time for a Stock Check?"
            body = ""
            if low_stock_names:
                items_str = ", ".join(low_stock_names)
                body = random.choice([
                    f"Quick check before closing: Looks like you're running low on {items_str}. Time to restock?",
                    f"Don't forget! {items_str} might need replenishing soon.",
                    f"Stock alert: Consider restocking {items_str} for tomorrow's customers.",
                ])
            else:
                body = random.choice([
                    "Looks like your stock levels are good! Have a restful night.",
                    "Quick inventory check done? Ready for tomorrow!",
                    "Great work today! Get some rest and prepare for more sales.",
                ])
            # --- End Dynamic Message ---

            await send_fcm_notification(tokens, title, body)

        logger.info(f"Sent dynamic night stock reminders to {len(owners)} owners.")

    except Exception as e:
        logger.error(f"Error in send_owner_night_stock_reminder: {e}", exc_info=True)

async def send_customer_morning_essentials():
    """Notifies customers about nearby fresh essentials, using specific product names."""
    try:
        essential_categories = ["Dairy & Beverages", "Fruits & Vegetables"]
        now = datetime.utcnow()

        # --- Step 1: Find shops with relevant products using Aggregation ---
        pipeline = [
            # Match products in essential categories, in stock
            {
                "$match": {
                    "category": {"$in": essential_categories},
                    "inStock": True,
                    "count": {"$gt": 0}
                }
            },
            # Group by shop_id to get a list of product names per shop
            {
                "$group": {
                    "_id": "$shop_id", # Group by shop_id (which is a string)
                    "productNames": {"$addToSet": "$product_name"} # Get unique product names
                }
            },
            # Convert string shop_id back to ObjectId for shop lookup
            {
                "$addFields": {
                    "shopObjectId": {"$toObjectId": "$_id"}
                }
            },
            # Lookup shop details using the ObjectId
            {
                "$lookup": {
                    "from": "shops",
                    "localField": "shopObjectId",
                    "foreignField": "_id",
                    "as": "shopInfo"
                }
            },
            # Deconstruct the shopInfo array (should only be one shop per ID)
            {"$unwind": "$shopInfo"},
            # Project only the necessary fields
            {
                "$project": {
                    "_id": 0, # Exclude MongoDB _id
                    "shop_id": "$_id", # Keep original string shop_id
                    "shopName": "$shopInfo.name",
                    "latitude": "$shopInfo.latitude",
                    "longitude": "$shopInfo.longitude",
                    "productNames": 1 # Keep the list of product names
                }
            }
        ]

        shops_with_essentials = list(products_collection.aggregate(pipeline))

        if not shops_with_essentials:
            logger.info("No shops found with fresh morning essentials today for dynamic notification.")
            return

        sent_count = 0
        total_shops_processed = 0

        # --- Step 2: Iterate through shops and send notifications ---
        for shop_data in shops_with_essentials:
            shop_lat = shop_data.get("latitude")
            shop_lng = shop_data.get("longitude")
            shop_name = shop_data.get("shopName", "a nearby store")
            shop_id_str = shop_data.get("shop_id")
            product_names = shop_data.get("productNames", [])

            if not shop_lat or not shop_lng or not product_names or not shop_id_str:
                logger.warning(f"Skipping shop due to missing data: {shop_data}")
                continue

            total_shops_processed += 1
            nearby_tokens = get_nearby_user_tokens(shop_lat, shop_lng)

            if nearby_tokens:
                # --- Step 3: Construct Dynamic Message ---
                title = f"☀️ Fresh Stock at {shop_name}!"

                # Create a sample list of products for the body (limit to a few)
                sample_products = ", ".join(product_names[:3]) # Take up to 3 names
                if len(product_names) > 3:
                    sample_products += " & more"

                body = f"Get your fresh essentials like {sample_products} today!"
                # Note: This uses the product name exactly as saved by the owner,
                # including native language characters if they used them.

                data = {"shop_id": shop_id_str} # Data payload for app navigation

                await send_fcm_notification(nearby_tokens, title, body, data)
                sent_count += len(nearby_tokens)

        logger.info(f"Sent dynamic morning essentials to {sent_count} customer tokens across {total_shops_processed} relevant shops.")

    except Exception as e:
        logger.error(f"Error in dynamic send_customer_morning_essentials: {e}", exc_info=True)

async def send_customer_deals_reminder():
    """Notifies nearby customers about active deals."""
    try:
        now = datetime.utcnow()
        shops_with_deals = products_collection.distinct("shop_id", {
            "isOnSale": True,
            "saleEndDate": {"$gte": now},
            "inStock": True,
            "count": {"$gt": 0}
        })

        if not shops_with_deals:
            logger.info("No active deals found to notify customers about.")
            return

        shop_object_ids = [ObjectId(sid) for sid in shops_with_deals if ObjectId.is_valid(sid)]
        shops = list(shops_collection.find({"_id": {"$in": shop_object_ids}}))
        sent_count = 0

        for shop in shops:
            shop_lat = shop.get("latitude")
            shop_lng = shop.get("longitude")
            if not shop_lat or not shop_lng: continue

            nearby_tokens = get_nearby_user_tokens(shop_lat, shop_lng)
            if nearby_tokens:
                title = "🔥 Hot Deals Alert!"
                body = f"Don't miss out! Special offers available now at {shop.get('name', 'a nearby store')}. Check the app!"
                data = {"screen": "Deals"} # Example: navigate user to Deals section
                await send_fcm_notification(nearby_tokens, title, body, data)
                sent_count += len(nearby_tokens)
        
        logger.info(f"Sent deals reminder to {sent_count} customer tokens across {len(shops)} shops.")

    except Exception as e:
         logger.error(f"Error in send_customer_deals_reminder: {e}", exc_info=True)

# Add more functions here for other customer notifications (seasonal, snacks, night needs etc.)
# using similar logic: find relevant products/shops, get nearby users, send notification.
async def send_subscription_reminders():
    """Finds users (customers/owners) with subscriptions expiring in 10, 3, or 1 day and sends a reminder."""
    logger.info("--- Running send_subscription_reminders Job ---")
    try:
        today = datetime.utcnow().date()
        reminder_days = [10, 3, 1] # Days before expiry to send a notification

        users_to_notify = []

        for days in reminder_days:
            # Calculate the target expiration date (today + X days)
            target_date = today + timedelta(days=days)

            # Find users whose 'next_payment_date' matches the target date
            # We query for a date range (>= target_date and < target_date + 1 day) 
            # to safely handle different times of day.
            start_of_target_day = datetime(target_date.year, target_date.month, target_date.day, 0, 0, 0)
            end_of_target_day = start_of_target_day + timedelta(days=1)

            query = {
                "next_payment_date": {
                    "$gte": start_of_target_day,
                    "$lt": end_of_target_day
                },
                "fcm_tokens": {"$exists": True, "$ne": []}
            }

            users = list(users_collection.find(query))

            for user in users:
                tokens = user.get("fcm_tokens", [])
                if not tokens or not isinstance(tokens, list) or not tokens[0]:
                    continue

                # Create a personalized message
                days_left = (start_of_target_day.date() - today).days
                title = f"⚠️ Subscription Reminder"
                if days_left <= 1:
                    title = f"❗ FINAL Subscription Reminder" # More urgent

                body = f"Your subscription expires in {days_left} day(s). Renew now to avoid interruption!"
                if user.get("role") == "customer":
                    body = f"Your subscription expires in {days_left} day(s). Renew with coins to keep finding great deals!"

                await send_fcm_notification(tokens, title, body, {"screen": "Subscription"}) # Add data to navigate
                logger.info(f"Sent {days_left}-day subscription reminder to user {user['_id']}")

    except Exception as e:
        logger.error(f"Error in send_subscription_reminders: {e}", exc_info=True)

async def send_owner_availability_request(owner_id: str, product_name: str, product_image: str, product_id: str):
    """
    Sends a HIGH PRIORITY notification to the owner asking about stock.
    Includes custom sound payload.
    """
    try:
        owner = users_collection.find_one({"_id": ObjectId(owner_id)}) # Assuming owner_id is passed as ID string or we fix lookup
        if not owner:
            # Fallback: try looking up by uid if _id failed (legacy support)
            owner = users_collection.find_one({"uid": owner_id})
            
        if not owner:
            logger.warning(f"Owner not found for availability request: {owner_id}")
            return

        tokens = owner.get("fcm_tokens", [])
        if not tokens: return

        # Custom Data for the app to handle the "Loud Sound" and "Action Buttons"
        data_payload = {
            "type": "availability_check",
            "product_id": product_id,
            "product_name": product_name,
            "image_url": product_image if product_image else "",
            "sound": "loud_shop_bell", # Frontend will map this to a raw resource
            "priority": "high"
        }

        # Send to all owner tokens
        await send_fcm_notification(
            tokens,
            title="Customer Waiting! 🔔",
            body=f"Do you have {product_name} in stock?",
            data=data_payload
        )
        logger.info(f"Sent availability request to owner {owner_id}")

    except Exception as e:
        logger.error(f"Error in send_owner_availability_request: {e}", exc_info=True)


async def send_owner_fomo_alert(owner_id: str, product_name: str):
    """
    Sends a 'Fear Of Missing Out' notification.
    Includes COOLDOWN logic to prevent spam.
    """
    try:
        # 1. Cooldown Check (Simple In-Memory or DB approach)
        # We will use the database to store the last alert time for this specific product+owner
        
        # Check 'fomo_cooldowns' in shops_collection
        
        shop = shops_collection.find_one({"owner_id": owner_id})
        if not shop: return
        
        # safely get nested dict
        fomo_cooldowns = shop.get("fomo_cooldowns", {})
        last_alert_time = fomo_cooldowns.get(product_name, None)
        
        if last_alert_time:
            # If alerted in last 1 hour, SKIP
            if (datetime.utcnow() - last_alert_time).total_seconds() < 3600:
                return

        # 2. Send Notification
        owner = users_collection.find_one({"uid": owner_id}) # owner_id in shops is usually uid
        if not owner: 
             # Fallback to _id if uid lookup fails (unlikely given schema, but safe)
             if ObjectId.is_valid(owner_id):
                 owner = users_collection.find_one({"_id": ObjectId(owner_id)})
        
        if not owner: return
        
        tokens = owner.get("fcm_tokens", [])
        if not tokens: return

        await send_fcm_notification(
            tokens,
            title="⚠️ Missed Sale Alert",
            body=f"Someone just searched for '{product_name}' near you, but you have 0 stock. Restock now?",
            data={"screen": "Inventory", "highlight": product_name}
        )

        # 3. Update Cooldown
        shops_collection.update_one(
            {"owner_id": owner_id},
            {"$set": {f"fomo_cooldowns.{product_name}": datetime.utcnow()}}
        )
        logger.info(f"Sent FOMO alert to owner {owner_id} for {product_name}")

    except Exception as e:
        logger.error(f"Error in send_owner_fomo_alert: {e}", exc_info=True)