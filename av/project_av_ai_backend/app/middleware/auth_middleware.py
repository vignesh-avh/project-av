from fastapi import Request, HTTPException
from jose import jwt, JWTError
from config import SECRET_KEY, ALGORITHM

async def jwt_middleware(request: Request):
    if request.url.path in ["/auth/login", "/auth/signup", "/auth/google-auth"]:
        return
    
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    
    token = auth_header.split(" ")[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        request.state.user_id = payload.get("sub")
        request.state.role = payload.get("role")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")