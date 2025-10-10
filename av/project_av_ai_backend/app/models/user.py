# project_av_ai_backend/app/models/user.py

from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class User(BaseModel):
    email: str
    fullName: str
    city: str
    password: str
    role: str = "customer"

class UserInDB(User):
    password_hash: str
    referral_code: str
    referral_count: int = 0
    referral_earnings: float = 0
    coins: int = 0
    wallet_balance: float = 0
    onboarding_done: bool = False
    hasEnteredReferral: bool = False
    created_at: datetime
    uid: str 
    is_verified: bool = False
    email_otp: Optional[str] = None
    otp_expires_at: Optional[datetime] = None

class GoogleUser(BaseModel):
    email: str
    name: str
