print("--- !!! NEW VERSION OF AUTH.PY IS RUNNING !!! ---") 
from fastapi import APIRouter, HTTPException, Depends, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import jwt
from datetime import datetime, timedelta
from app.models.user import User, UserInDB, GoogleUser
from app.utils.security import verify_password, get_password_hash
from app.utils.oauth import get_google_user_info
from app.db import users_collection
from app.config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
from app.utils.email import send_otp_email # <--- ADD THIS IMPORT
from fastapi import BackgroundTasks

# We still need this one from config.py for the token expiry
from app.config import ACCESS_TOKEN_EXPIRE_MINUTES
import random
import uuid  # Added for UID generation
from pydantic import BaseModel  # Added import
from pymongo import errors as mongo_errors  # Added import
from fastapi import Header
from bson import ObjectId   # 🔧 ADD THIS IMPORT REQUIRED FOR refresh-token
from app.utils.security import create_access_token # Ensure this function is imported
import logging # Recommended for logging
logger = logging.getLogger("uvicorn.error")


router = APIRouter()

# UPDATED token creation with all claims as requested
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    user_id = data.get("sub")
    # This is the single, correct variable we will use throughout the function.
    subscription_active = False 
    
    if user_id:
        user = users_collection.find_one({"_id": ObjectId(user_id)})
        if user:
            renewal_date = user.get("next_payment_date")
            if renewal_date and isinstance(renewal_date, datetime):
                today = datetime.utcnow()
                
                # --- GRACE PERIOD LOGIC ---
                is_currently_active = renewal_date > today
                grace_period_end = renewal_date + timedelta(days=3)
                is_in_grace_period = today > renewal_date and today < grace_period_end
                
                # If the subscription is active OR in the grace period, set our variable to True.
                if is_currently_active or is_in_grace_period:
                    subscription_active = True
    
    # FIX: Use consistent claim names with underscores
    to_encode.update({
        "exp": expire,
        "role": data.get("role", "customer"),
        "onboarding_done": data.get("onboarding_done", False),
        "has_entered_referral": data.get("has_entered_referral", False),
        "uid": user_id, # Added uid claim
        "coins": data.get("coins", 0),  # ADDED COINS CLAIM
        "subscription_active": subscription_active,
    })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# Added request model
class GoogleAuthRequest(BaseModel):
    access_token: str
    role: str  # Added role field as requested
class UserLoginRequest(BaseModel):
    email: str
    password: str

@router.post("/signup")
async def signup(user: User, background_tasks: BackgroundTasks): # <-- Add BackgroundTasks
    existing_user = users_collection.find_one({"email": user.email})
    
    if existing_user and existing_user.get("is_verified"):
        raise HTTPException(status_code=400, detail="Email already registered") 

    # Generate a 6-digit OTP
    otp = str(random.randint(100000, 999999))
    otp_expires_at = datetime.utcnow() + timedelta(minutes=10) # 10-minute expiry

    # Send OTP email in the background
    background_tasks.add_task(send_otp_email, user.email, otp)
    
    if existing_user:
        # User exists but is not verified, update their OTP
        users_collection.update_one(
            {"email": user.email},
            {"$set": {
                "password_hash": get_password_hash(user.password),
                "fullName": user.fullName,
                "city": user.city,
                "email_otp": otp,
                "otp_expires_at": otp_expires_at,
                "created_at": datetime.utcnow()
            }}
        )
    else:
        # New user, create their record
        user_data = {
            "email": user.email,
            "fullName": user.fullName,
            "city": user.city,
            "role": user.role,
            "password_hash": get_password_hash(user.password),
            "referral_code": ''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', k=6)),
            "created_at": datetime.utcnow(),
            "uid": user.email.replace(' ', '_').lower(),
            # --- Set verification fields ---
            "is_verified": False,
            "email_otp": otp,
            "otp_expires_at": otp_expires_at,
            # --- Default other fields ---
            "referral_count": 0,
            "referral_earnings": 0,
            "coins": 0,
            "wallet_balance": 0,
            "onboarding_done": False,
            "hasEnteredReferral": False,
            "fcm_tokens": []
        }
        users_collection.insert_one(user_data)
        
    return {"message": "OTP has been sent to your email."}


# === ADD THIS NEW VERIFY OTP ENDPOINT ===
class OtpVerificationRequest(BaseModel):
    email: str
    otp: str

@router.post("/verify-otp")
async def verify_otp(request: OtpVerificationRequest):
    user = users_collection.find_one({"email": request.email})

    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    
    if user.get("is_verified"):
        raise HTTPException(status_code=400, detail="Account already verified.")

    if user.get("otp_expires_at") < datetime.utcnow():
        raise HTTPException(status_code=400, detail="OTP has expired.")
    
    if user.get("email_otp") != request.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP.")

    # Verification successful, update the user
    next_payment = datetime.utcnow() + timedelta(days=30)
    
    # Verification successful, update the user
    users_collection.update_one(
        {"email": request.email},
        {
            # Add next_payment_date to the $set operation
            "$set": {"is_verified": True, "next_payment_date": next_payment},
            "$unset": {"email_otp": "", "otp_expires_at": ""}
        }
    )
    # Log the user in by creating an access token
    access_token = create_access_token(
        data={
            "sub": str(user["_id"]),
            "role": user.get("role", "customer"),
            "onboarding_done": user.get("onboarding_done", False),
            "has_entered_referral": user.get("hasEnteredReferral", False),
            "uid": user.get("uid", ""),
            "coins": user.get("coins", 0)
        }
    )
    return {"access_token": access_token, "token_type": "bearer"}


# === MODIFIED LOGIN ENDPOINT ===
@router.post("/login")
async def login(credentials: UserLoginRequest):
    user = users_collection.find_one({"email": credentials.email})

    if not user or not verify_password(credentials.password, user.get("password_hash")): 
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    
    # --- ADD THIS CHECK ---
    if not user.get("is_verified"):
        # You could optionally resend the OTP here if you want
        raise HTTPException(status_code=403, detail="Account not verified. Please check your email for an OTP.")
    # ----------------------

    access_token = create_access_token(
        data={
            "sub": str(user["_id"]),
            "role": user.get("role", "customer"),
            "onboarding_done": user.get("onboarding_done", False),
            "has_entered_referral": user.get("hasEnteredReferral", False),
            "uid": user.get("uid", ""),
            "coins": user.get("coins", 0)
        }
    ) 
    
    return {"access_token": access_token, "token_type": "bearer"} 

# UPDATED Google auth endpoint as requested
@router.post("/google-auth")
async def google_auth(request: GoogleAuthRequest):
    try:
        user_info = get_google_user_info(request.access_token)
        if not user_info:
            raise HTTPException(status_code=400, detail="Invalid Google token")
        
        user = users_collection.find_one({"email": user_info.email})
        
        if user:
            # FIX: Validate role consistency
            if request.role and user["role"] != request.role:
                raise HTTPException(
                    status_code=403,
                    detail="Account exists with different role"
                )
            
            # FIXED: Include has_entered_referral in token with consistent naming
            access_token = create_access_token({
                "sub": str(user["_id"]),
                "role": user["role"],
                "onboarding_done": user.get("onboarding_done", False),
                "has_entered_referral": user.get("hasEnteredReferral", False),
                "uid": str(user["_id"])  # Consistent uid claim
            })
            return {"access_token": access_token, "token_type": "bearer"}
        
        # New user - create with requested role
        referral_code = await generate_referral_code()
        new_user_data = {
            "email": user_info.email,
            "fullName": user_info.name,
            "city": "",
            "role": request.role,
            "password_hash": "",
            "referral_code": referral_code,
            "referral_count": 0,
            "referral_earnings": 0,
            "coins": 0,
            "wallet_balance": 0,
            "onboarding_done": False,
            "hasEnteredReferral": False,  # Initialize as False
            "created_at": datetime.utcnow(),
            "next_payment_date": datetime.utcnow() + timedelta(days=30),
            "uid": user_info.email.replace(' ', '_').lower() if user_info.email else str(uuid.uuid4())
        }
        
        result = users_collection.insert_one(new_user_data)
        
        # FIXED: Consistent naming and added uid
        access_token = create_access_token({
            "sub": str(result.inserted_id),
            "role": request.role,
            "onboarding_done": False,
            "has_entered_referral": False,  # Consistent naming
            "uid": str(result.inserted_id)  # Added uid claim
        })
        return {"access_token": access_token, "token_type": "bearer"}
        
    except Exception as e:
        print(f"Google auth error: {str(e)}")
        raise HTTPException(status_code=500, detail="Google authentication failed")


async def generate_referral_code() -> str:
    chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    code = ""
    for _ in range(6):
        code += random.choice(chars)
    return code
    
@router.get("/verify-token")
async def verify_token(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        
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

# 🔧 🔥 UPDATED TO MATCH REQUIREMENTS: Proper refresh token handler
@router.post("/refresh-token")
async def refresh_token(request: Request):
    try:
        data = await request.json()
        token = data.get("token")
        
        if not token:
            raise HTTPException(status_code=401, detail="Missing token")
        
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        
        user = users_collection.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Create new token with updated claims
        new_token = create_access_token(
            data={
                "sub": str(user["_id"]),
                "role": user.get("role", "customer"),
                "onboarding_done": user.get("onboarding_done", False),
                "has_entered_referral": user.get("hasEnteredReferral", False),
                "uid": str(user["_id"])
            }
        )
        return {"access_token": new_token}
    
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        print(f"Refresh token error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

# In project_av_ai_backend/app/routes/auth.py

# Add this new endpoint to issue a fresh token after a subscription renewal.
@router.post("/issue-new-token")
async def issue_new_token(data: dict):
    """
    Finds a user by their ID, reads their latest data from the database,
    and returns a new access token with updated claims.
    """
    try:
        user_id = data.get("user_id")
        if not user_id:
            raise HTTPException(status_code=400, detail="User ID is required")

        if not ObjectId.is_valid(user_id):
            raise HTTPException(status_code=400, detail="Invalid user ID format")
            
        user_obj_id = ObjectId(user_id)
        user = users_collection.find_one({"_id": user_obj_id})

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Create a new token with the user's current data from the database.
        # This will include the correct coin balance after the deduction.
        access_token = create_access_token(
            data={
                "sub": str(user["_id"]),
                "role": user.get("role", "customer"),
                "onboarding_done": user.get("onboarding_done", False),
                "has_entered_referral": user.get("hasEnteredReferral", False),
                "uid": user.get("uid", ""),
                "coins": user.get("coins", 0) # This fetches the updated coin count
            }
        ) # [cite: 788, 789]
        return {"access_token": access_token, "token_type": "bearer"}

    except Exception as e:
        logger.error(f"Failed to issue new token: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail="Could not issue new token.")