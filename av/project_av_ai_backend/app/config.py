import os
from dotenv import load_dotenv
from pathlib import Path

# This reliably finds your project's root directory (project_av_ai_backend)
BASE_DIR = Path(__file__).resolve().parent.parent

# This explicitly tells dotenv to load the .env file from that root directory
dotenv_path = os.path.join(BASE_DIR, ".env")
load_dotenv(dotenv_path=dotenv_path)

# Now, all your os.getenv() calls will work correctly because the file has been loaded
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES"))

# You can also load your other secrets here for consistency
MONGO_URI = os.getenv("MONGO_URI")
# In config.py
GOOGLE_WEB_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")