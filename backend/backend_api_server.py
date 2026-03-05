import yaml
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio
from typing import List
import uvicorn
import logging

app = FastAPI(title="Sign In Service API")

# Add CORS middleware to allow the frontend to access the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import os

CONFIG_FILE = Path(os.environ.get("CONFIG_PATH", Path(__file__).parent.parent / "data" / "config.yaml"))

def load_config():
    if not CONFIG_FILE.exists():
        return {"users": []}
    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {"users": []}

class QrSignInRequest(BaseModel):
    qrcode_url: str
    usernames: List[str]

class AttendanceCodeSignInRequest(BaseModel):
    code: str
    usernames: List[str]

class RegisterUserRequest(BaseModel):
    username: str
    password: str
    otp_url: str

@app.get("/api/users/check")
async def check_user(username: str):
    config = load_config()
    users = config.get("users", [])
    user_exists = any(u.get("username") == username for u in users)
    return {"exists": user_exists, "allow_registration": config.get("allow_registration", False)}

@app.get("/api/users")
async def get_users():
    config = load_config()
    users = config.get("users", [])
    return {"users": [u.get("username") for u in users]}


@app.post("/api/users/register")
async def register_user(req: RegisterUserRequest):
    config = load_config()
    
    if not config.get("allow_registration", False):
        raise HTTPException(status_code=403, detail="Registration is disabled")
    
    users = config.get("users", [])
    if any(u.get("username") == req.username for u in users):
        raise HTTPException(status_code=409, detail="User already exists")
    
    # Try to login first to validate credentials
    from uimLogin import uim_login_for_user
    user_config = {"username": req.username, "password": req.password, "otp_url": req.otp_url}
    
    success = uim_login_for_user(user_config)
    if not success:
        return {"success": False, "message": "Login failed. Please check your credentials."}
    
    # Login succeeded, save to config
    users.append({"username": req.username, "password": req.password, "otp_url": req.otp_url})
    config["users"] = users
    
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        yaml.dump(config, f, default_flow_style=False, allow_unicode=True)
    
    return {"success": True, "message": f"User {req.username} registered successfully"}

@app.post("/api/qrcode")
async def sign_in_qr(req: QrSignInRequest):
    from amsSignInByQRCode import sign_in_for_user
    
    config = load_config()
    users = config.get("users", [])
    
    results = []
    
    for username in req.usernames:
        user_config = next((u for u in users if u.get("username") == username), None)
        if not user_config:
            results.append({"username": username, "status": "error", "message": "User not configured"})
            continue
            
        success, message, data = sign_in_for_user(req.qrcode_url, user_config)
        results.append({
            "username": username,
            "status": "success" if success else "error",
            "message": message,
            "data": data
        })
        
    return {"success": True, "results": results}

@app.post("/api/attendancecode")
async def sign_in_code(req: AttendanceCodeSignInRequest):
    from amsSignInByAttendanceCode import sign_in_with_auto_token_for_user
     
    config = load_config()
    users = config.get("users", [])
    
    results = []
    
    for username in req.usernames:
        user_config = next((u for u in users if u.get("username") == username), None)
        if not user_config:
            results.append({"username": username, "status": "error", "message": "User not configured"})
            continue
            
        success, message, data = sign_in_with_auto_token_for_user(req.code, user_config)
        results.append({
            "username": username,
            "status": "success" if success else "error",
            "message": message,
            "data": data
        })
        
    return {"success": True, "results": results}

if __name__ == "__main__":
    uvicorn.run("backend_api_server:app", host="127.0.0.1", port=8000, reload=True)
