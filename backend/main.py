import os
import json
import cv2
import numpy as np
import easyocr
import re
import logging
import io
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from datetime import datetime
from typing import List, Dict
from fpdf import FPDF

# --- MODULE 1: SYSTEM INITIALIZATION ---
os.environ["CUDA_VISIBLE_DEVICES"] = "-1" 
logging.basicConfig(level=logging.INFO)
# FIXED: Added double underscores
logger = logging.getLogger(__name__) 

app = FastAPI(title="Smart-Nagorik Gateway: Complete 5-Module API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize OCR Engine (CPU Mode)
try:
    reader = easyocr.Reader(['bn', 'en'], gpu=False)
    logger.info("OCR Engine loaded successfully.")
except Exception as e:
    logger.error(f"OCR Init Error: {e}")

USER_DB = "users.json"
HISTORY_DB = "history.json"

# --- HELPER FUNCTIONS ---
def load_db(path):
    if not os.path.exists(path): return {}
    with open(path, "r", encoding='utf-8') as f:
        return json.load(f)

def save_db(path, data):
    with open(path, "w", encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

# --- MODULE 2: AUTHENTICATION ---
class User(BaseModel):
    username: str
    password: str

@app.post("/register")
async def register(user: User):
    db = load_db(USER_DB)
    if user.username in db:
        raise HTTPException(status_code=400, detail="User already exists")
    db[user.username] = user.password
    save_db(USER_DB, db)
    return {"message": "Registration successful"}

@app.post("/login")
async def login(user: User):
    db = load_db(USER_DB)
    if db.get(user.username) == user.password:
        return {"status": "success", "username": user.username}
    raise HTTPException(status_code=401, detail="Invalid credentials")

# --- MODULE 3 & 4: OCR & DATA PROCESSING ---
def calculate_age(dob_str: str) -> int:
    try:
        # Expected NID format: "01 Jan 1990"
        dob = datetime.strptime(dob_str, "%d %b %Y")
        today = datetime.today()
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    except:
        return None

def get_eligibility(age: int) -> List[str]:
    services = ["Smart ID Services", "Digital Banking Access"]
    if age is None: return services
    if age >= 18: services.append("Voter Registration (ভোটার নিবন্ধন)")
    if 18 <= age <= 35: services.append("Youth Training Grant (যুব উন্নয়ন)")
    if age >= 65: services.append("Old Age Allowance (বয়স্ক ভাতা)")
    return services

def parse_nid_data(text_list: List[str]) -> Dict:
    full_text = " ".join(text_list)
    nid_match = re.search(r'\d{10,17}', full_text)
    dob_match = re.search(r'\d{2} [A-Za-z]{3} \d{4}', full_text)
    
    name = "Not Found"
    for i, line in enumerate(text_list):
        if any(key in line for key in ["Name", "নাম"]):
            if ":" in line and len(line.split(":")[-1].strip()) > 3:
                name = line.split(":")[-1].strip()
                break
            elif i + 1 < len(text_list):
                name = text_list[i+1].strip()
                break
    
    dob = dob_match.group(0) if dob_match else "Not Found"
    age = calculate_age(dob)
    benefits = get_eligibility(age)
    
    return {
        "name": name, 
        "nid_number": nid_match.group(0) if nid_match else "Not Found",
        "dob": dob,
        "age": age,
        "benefits": benefits,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

@app.post("/extract-nid")
async def extract_nid(username: str, file: UploadFile = File(...)):
    try:
        contents = await file.read()
        img = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)
        raw_text = reader.readtext(img, detail=0)
        result = parse_nid_data(raw_text)
        
        # Save History to DB
        history = load_db(HISTORY_DB)
        if username not in history: history[username] = []
        history[username].append(result)
        save_db(HISTORY_DB, history)
        
        return {"status": "success", "data": result}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/history/{username}")
async def get_history(username: str):
    return load_db(HISTORY_DB).get(username, [])

# --- MODULE 5: DATA ANALYTICS ---
@app.get("/admin/analytics")
async def get_analytics():
    history = load_db(HISTORY_DB)
    all_scans = [item for sublist in history.values() for item in sublist]
    stats = {
        "total_scans": len(all_scans),
        "age_groups": {"Youth": 0, "Middle": 0, "Senior": 0},
        "service_demand": {}
    }
    for scan in all_scans:
        age = scan.get("age")
        if age:
            if age <= 35: stats["age_groups"]["Youth"] += 1
            elif age <= 64: stats["age_groups"]["Middle"] += 1
            else: stats["age_groups"]["Senior"] += 1
        for b in scan.get("benefits", []):
            stats["service_demand"][b] = stats["service_demand"].get(b, 0) + 1
    return stats

# --- PDF GENERATION (FIXED) ---
@app.post("/generate-report")
async def generate_report(data: Dict):
    try:
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("Arial", 'B', 16)
        pdf.cell(0, 10, txt="Smart-Nagorik Official Citizen Report", ln=True, align='C')
        pdf.ln(10)
        
        pdf.set_font("Arial", size=12)
        pdf.cell(0, 10, txt=f"Full Name: {data.get('name')}", ln=True)
        pdf.cell(0, 10, txt=f"NID Number: {data.get('nid_number')}", ln=True)
        pdf.cell(0, 10, txt=f"Date of Birth: {data.get('dob')}", ln=True)
        pdf.ln(5)
        
        pdf.set_font("Arial", 'B', 12)
        pdf.cell(0, 10, txt="Eligible Benefits & Services:", ln=True)
        pdf.set_font("Arial", size=11)
        
        for b in data.get('benefits', []):
            # FIXED: Stripping Bangla for FPDF compatibility
            clean_b = b.split('(')[0].strip() 
            pdf.cell(0, 8, txt=f"- {clean_b}", ln=True)

        # FIXED: Stream output with proper encoding
        pdf_bytes = pdf.output(dest='S').encode('latin-1', 'replace')
        return StreamingResponse(io.BytesIO(pdf_bytes), media_type="application/pdf")
    except Exception as e:
        logger.error(f"PDF Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# FIXED: Correct main check
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)