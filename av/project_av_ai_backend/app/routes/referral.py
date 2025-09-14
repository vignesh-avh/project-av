# In project_av_ai_backend/app/routes/referral.py

from fastapi import APIRouter, HTTPException
# --- FIX 1: ADD rewards_collection IMPORT ---
from app.db import users_collection, referral_transactions_collection, rewards_collection
from datetime import datetime, timedelta, timezone # ADD timezone
from app.utils.security import create_access_token
from app.config import ACCESS_TOKEN_EXPIRE_MINUTES
from pydantic import BaseModel
from bson import ObjectId
from bson.errors import InvalidId
import logging
logger = logging.getLogger("uvicorn.error")


router = APIRouter()

class ApplyReferralRequest(BaseModel):
    customer_id: str
    referral_code: str

class SkipReferralRequest(BaseModel):
    user_id: str

# --- FIX 2: REPLACE THE ENTIRE apply_referral FUNCTION ---
@router.post("/apply-referral")
async def apply_referral(request: ApplyReferralRequest):
    try:
        customer_id = request.customer_id
        referral_code = request.referral_code.upper()

        referrer = users_collection.find_one({"referral_code": referral_code})
        if not referrer:
            raise HTTPException(status_code=404, detail="Invalid referral code")
        
        customer = users_collection.find_one({"_id": ObjectId(customer_id)})
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        if referrer["uid"] == customer["uid"]:
            raise HTTPException(status_code=400, detail="Self-referral not allowed")
        
        if customer.get("hasEnteredReferral", False):
            raise HTTPException(status_code=400, detail="Referral already used")
        
        # --- REWARD LOGIC (Unchanged) ---
        if referrer["role"] == "owner":
            users_collection.update_one(
                {"_id": referrer["_id"]},
                {"$inc": {"referral_earnings": 5, "referral_count": 1}}
            )
        else:
            users_collection.update_one(
                {"_id": referrer["_id"]},
                {"$inc": {"coins": 25, "referral_count": 1}}
            )
            # --- START OF THE ACTUAL FIX ---
            # ADD A TRANSACTION LOG FOR THE REFERRER
            rewards_collection.insert_one({
                "user_id": str(referrer["_id"]),
                "coins": 25,
                "type": "referral_bonus",
                "created_at": datetime.now(timezone.utc)
            })
            # --- END OF THE ACTUAL FIX ---

        # Update customer
        users_collection.update_one(
            {"_id": ObjectId(customer_id)}, 
            {
                "$inc": {"coins": 25},
                "$set": {"hasEnteredReferral": True}
            }
        )
        
        # --- START OF THE ACTUAL FIX ---
        # ADD A TRANSACTION LOG FOR THE CUSTOMER
        rewards_collection.insert_one({
            "user_id": customer_id, # This is already the string _id
            "coins": 25,
            "type": "referral",
            "created_at": datetime.now(timezone.utc)
        })
        # --- END OF THE ACTUAL FIX ---

        # Record transaction (this logs to a different collection, we leave it for now)
        referral_transactions_collection.insert_one({
            "referrer_id": str(referrer["_id"]),
            "customer_id": str(customer["_id"]),
            "code": referral_code,
            "timestamp": datetime.utcnow()
        })
        
        # Generate new token
        token_data = {
            "sub": str(customer["_id"]),
            "uid": str(customer["_id"]),
            "role": customer["role"],
            "onboarding_done": customer.get("onboarding_done", False),
            "has_entered_referral": True
        }
        access_token = create_access_token(
            token_data, 
            timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        
        # Return response
        updated_customer = users_collection.find_one({"_id": ObjectId(customer_id)})
        print("DEBUG: New token data being created:", token_data)

        return {
            "success": True,
            "message": "Referral applied successfully",
            "access_token": access_token,
            "updated_coins": updated_customer.get("coins", 0)
        }
        
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    except Exception as e:
        import traceback
        logger.error("apply_referral failed for request: %s\n%s", request.dict(), traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

# This function remains unchanged
@router.post("/skip-referral")
async def skip_referral(request: SkipReferralRequest):
    try:
        user_id = request.user_id
        
        result = users_collection.update_one(
            {"_id": ObjectId(user_id)}, 
            {"$set": {"hasEnteredReferral": True}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="User not found")
        
        user = users_collection.find_one({"_id": ObjectId(user_id)})
        
        token_data = {
            "sub": user["uid"],
            "role": user["role"],
            "onboardingDone": user.get("onboarding_done", False),
            "has_entered_referral": True,
            "uid": user["uid"]
        }
        access_token = create_access_token(
            token_data, 
            timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        
        return {
            "success": True,
            "access_token": access_token
        }
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    except Exception as e:
        import traceback
        logger.error("skip_referral failed for request: %s\n%s", request.dict(), traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))