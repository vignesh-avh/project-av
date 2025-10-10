# In a file like app/utils/oauth.py

from pydantic import BaseModel
from google.oauth2 import id_token
from google.auth.transport import requests

# Make sure this is imported from your main config file (e.g., app/config.py)
# This MUST be your WEB CLIENT ID.
from app.config import GOOGLE_WEB_CLIENT_ID 

class GoogleUser(BaseModel):
    email: str
    name: str

def get_google_user_info(token: str) -> GoogleUser | None:
    """
    Verifies a Google ID Token and returns the user's information.
    This is the modern, secure method.
    """
    try:
        # This function checks the token's signature, expiration, and that it was
        # issued to your app (by checking the Web Client ID).
        id_info = id_token.verify_oauth2_token(
            token, requests.Request(), GOOGLE_WEB_CLIENT_ID
        )

        # If verification is successful, extract the user's info
        return GoogleUser(
            email=id_info["email"],
            name=id_info.get("name", "")
        )

    except ValueError as e:
        # This will catch any error: invalid token, expired token, or wrong Client ID
        print(f"Google ID Token verification error: {e}")
        return None
    except Exception as e:
        print(f"An unexpected error occurred during token verification: {e}")
        return None