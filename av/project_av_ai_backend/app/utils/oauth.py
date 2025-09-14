import requests
from pydantic import BaseModel

class GoogleUser(BaseModel):
    email: str
    name: str

def get_google_user_info(access_token: str) -> GoogleUser:
    try:
        response = requests.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10  # Add timeout to prevent hanging
        )
        if response.status_code != 200:
            print(f"Google API error: {response.status_code} - {response.text}")
            return None
        
        user_info = response.json()
        return GoogleUser(
            email=user_info["email"],
            name=user_info.get("name", user_info["email"].split('@')[0])
        )
    except Exception as e:
        print(f"Google user info error: {str(e)}")
        return None