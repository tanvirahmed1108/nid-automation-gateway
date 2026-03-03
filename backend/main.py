import os
import json
import cv2
import numpy as np
import easyocr
import re
import logging
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
from typing import List, Dict

# --- 1. HARDWARE STABILITY FIX ---
# This fixes the [WinError 1114] DLL error seen in your screenshot
os.environ["CUDA_VISIBLE_DEVICES"] = "-1" 

# --- 2. INITIALIZATION ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Smart-Nagorik Gateway API")

# Enable CORS so React can talk to Python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize OCR in CPU mode to prevent crashes
try:
    reader = easyocr.Reader(['bn', 'en'], gpu=False)
    logger.info("OCR Engine loaded successfully.")
except Exception as e:
    logger.error(f"OCR Init Error: {e}")

# --- 3. DATABASE LOGIC (JSON) ---
USER_DB = "users.json"

class User(BaseModel):
    username: str
    password: str

def load_users():
    if not os.path.exists(USER_DB): return {}
    with open(USER_DB, "r") as f:
        return json.load(f)

def save_user(username, password):
    users = load_users()
    users[username] = password
    with open(USER_DB, "w") as f:
        json.dump(users, f)

# --- 4. AUTH ENDPOINTS ---
# These fix the "Not Found" error in your registration screenshot
@app.post("/register")
async def register(user: User):
    users = load_users()
    if user.username in users:
        raise HTTPException(status_code=400, detail="User already exists")
    save_user(user.username, user.password)
    return {"message": "User registered successfully"}

@app.post("/login")
async def login(user: User):
    users = load_users()
    if users.get(user.username) == user.password:
        return {"status": "success", "username": user.username}
    raise HTTPException(status_code=401, detail="Invalid credentials")

# --- 5. NID PROCESSING LOGIC ---
def calculate_age(dob_str: str) -> int:
    try:
        dob = datetime.strptime(dob_str, "%d %b %Y")
        today = datetime.today()
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    except:
        return None

def get_eligible_services(age: int) -> List[str]:
    if age is None: return ["Manual Age Verification Required"]
    services = []
    if age >= 18: services.append("Voter Registration (ভোটার নিবন্ধন)")
    if age >= 18: services.append("Smart ID Card Issuance")
    if 18 <= age <= 35: services.append("Youth Training Grant (যুব উন্নয়ন)")
    if age >= 65: services.append("Old Age Allowance (বয়স্ক ভাতা)")
    return services

def parse_nid_data(text_list: List[str]) -> Dict:
    full_text = " ".join(text_list)
    nid_match = re.search(r'\d{10,17}', full_text)
    nid_no = nid_match.group(0) if nid_match else "Not Found"
    dob_match = re.search(r'\d{2} [A-Za-z]{3} \d{4}', full_text)
    dob = dob_match.group(0) if dob_match else "Not Found"

    name = "Not Found"
    for i, line in enumerate(text_list):
        if any(key in line for key in ["Name", "নাম"]):
            if ":" in line and len(line.split(":")[-1].strip()) > 3:
                name = line.split(":")[-1].strip()
                break
            elif i + 1 < len(text_list):
                name = text_list[i+1].strip()
                break
    
    age = calculate_age(dob)
    benefits = get_eligible_services(age)
    return {"name": name, "nid_number": nid_no, "dob": dob, "eligible_benefits": benefits}

@app.post("/extract-nid")
async def extract_nid(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        raw_results = reader.readtext(img, detail=0)
        final_data = parse_nid_data(raw_results)
        return {"status": "success", "data": final_data}
    except Exception as e:
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)