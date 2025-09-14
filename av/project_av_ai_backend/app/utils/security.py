from passlib.context import CryptContext
from jose import jwt
from app.config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
from datetime import timedelta
from datetime import datetime


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    # Use consistent claim names
    to_encode.update({
        "exp": expire,
        "role": data.get("role", "customer"),
        "onboardingDone": data.get("onboarding_done", False),
        "hasEnteredReferral": data.get("has_entered_referral", False),
        "uid": data.get("uid", "")
    })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
