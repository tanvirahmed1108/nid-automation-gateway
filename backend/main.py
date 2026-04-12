import os
import json
import cv2
import numpy as np
import re
import logging
import io
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from datetime import datetime
from typing import List, Dict, Optional, Any
from fpdf import FPDF

# --- MODULE 1: SYSTEM INITIALIZATION ---
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Smart-Nagorik Gateway: Complete 5-Module API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"]
)

# --- FIX: STUCK PROBLEM SOLVER ---
# Age eikhane reader = easyocr.Reader chilo jeta terminal stuck korto.
# Ekhon eita function er bhetor niye gesi jate dorkar chara load na hoy.
_reader = None
def get_ocr_reader():
    global _reader
    if _reader is None:
        import easyocr
        logger.info("Loading OCR Models... (Please wait 1-2 mins for the first time)")
        _reader = easyocr.Reader(['bn', 'en'], gpu=False)
        logger.info("OCR Engine loaded successfully.")
    return _reader

USER_DB = "users.json"
HISTORY_DB = "history.json"

def load_db(path):
    if not os.path.exists(path): return {}
    try:
        with open(path, "r", encoding='utf-8') as f:
            content = f.read().strip()
            return json.loads(content) if content else {}
    except Exception as e:
        logger.error(f"DB Load Error: {e}")
        return {}

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
def calculate_age(dob_str: str) -> Optional[int]:
    try:
        # Multiple format support
        dob_str = dob_str.replace("-", " ").replace("/", " ")
        for fmt in ("%d %b %Y", "%d %B %Y", "%d %m %Y"):
            try:
                dob = datetime.strptime(dob_str, fmt)
                today = datetime.today()
                return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
            except: continue
        return None
    except: return None

def get_eligibility(age: Optional[int]) -> List[str]:
    services = ["Smart ID Services", "Digital Banking Access"]
    if age is None: return services
    if age >= 18: services.append("Voter Registration")
    if 18 <= age <= 35: services.append("Youth Training Grant")
    if age >= 65: services.append("Old Age Allowance")
    return services

def parse_nid_data(text_list: List[str]) -> Dict:
    full_text = " ".join(text_list)
    nid_match = re.search(r'\d{10,17}', full_text)
    dob_match = re.search(r'\d{2} [A-Za-z]{3} \d{4}', full_text)

    name = "Not Found"
    for i, line in enumerate(text_list):
        if any(key in line.lower() for key in ["name", "nid", "nom"]):
            if ":" in line and len(line.split(":")[-1].strip()) > 3:
                name = line.split(":")[-1].strip()
                break
            elif i + 1 < len(text_list):
                name = text_list[i + 1].strip()
                break

    dob = dob_match.group(0) if dob_match else "Not Found"
    age = calculate_age(dob)
    return {
        "name": name,
        "nid_number": nid_match.group(0) if nid_match else "Not Found",
        "dob": dob,
        "age": age,
        "benefits": get_eligibility(age),
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

@app.post("/extract-nid")
async def extract_nid(username: str, file: UploadFile = File(...)):
    try:
        reader = get_ocr_reader() # Call on demand
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image file")

        raw_text = reader.readtext(img, detail=0)
        result = parse_nid_data(raw_text)

        history = load_db(HISTORY_DB)
        if username not in history: history[username] = []
        history[username].append(result)
        save_db(HISTORY_DB, history)

        return {"status": "success", "data": result}
    except Exception as e:
        logger.error(f"Extract error: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/history/{username}")
async def get_history(username: str):
    return load_db(HISTORY_DB).get(username, [])

# --- MODULE 5: ANALYTICS & PDF ---
@app.get("/admin/analytics")
async def get_analytics():
    history = load_db(HISTORY_DB)
    all_scans = [item for sublist in history.values() for item in sublist]
    stats = {
        "total_scans": len(all_scans),
        "age_groups": {"Youth (18-35)": 0, "Middle (36-64)": 0, "Senior (65+)": 0},
        "service_demand": {}
    }
    for scan in all_scans:
        age = scan.get("age")
        if age:
            if age <= 35: stats["age_groups"]["Youth (18-35)"] += 1
            elif age <= 64: stats["age_groups"]["Middle (36-64)"] += 1
            else: stats["age_groups"]["Senior (65+)"] += 1
        for b in scan.get("benefits", []):
            stats["service_demand"][b] = stats["service_demand"].get(b, 0) + 1
    return stats

class ReportData(BaseModel):
    name: Optional[str] = "Not Found"
    nid_number: Optional[str] = "Not Found"
    dob: Optional[str] = "Not Found"
    age: Optional[int] = None
    benefits: Optional[List[str]] = []
    timestamp: Optional[str] = None

@app.post("/generate-report")
async def generate_report(data: ReportData):
    try:
        pdf = FPDF()
        pdf.add_page()
        
        # Original Styling
        pdf.set_fill_color(0, 106, 78)
        pdf.rect(0, 0, 210, 42, 'F')
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Arial", 'B', 18)
        pdf.set_xy(0, 10)
        pdf.cell(210, 10, txt="SMART-NAGORIK CITIZEN REPORT", ln=True, align='C')
        
        pdf.set_text_color(40, 40, 40)
        pdf.set_y(50)
        pdf.set_font("Arial", 'B', 12)
        pdf.cell(0, 10, "CITIZEN INFORMATION", ln=True)
        
        pdf.set_font("Arial", size=10)
        lines = [
            f"Full Name: {data.name}", 
            f"NID Number: {data.nid_number}",
            f"Date of Birth: {data.dob}",
            f"Age: {data.age if data.age else 'N/A'}",
            f"Timestamp: {data.timestamp if data.timestamp else ''}"
        ]
        for line in lines:
            pdf.cell(0, 8, txt=line.encode('latin-1', 'replace').decode('latin-1'), ln=True)

        pdf.ln(5)
        pdf.set_font("Arial", 'B', 12)
        pdf.cell(0, 10, "ELIGIBLE SERVICES", ln=True)
        pdf.set_font("Arial", size=10)
        for b in (data.benefits or []):
            clean_b = re.sub(r'[^\x00-\x7F]+', '', b)
            pdf.cell(0, 8, txt=f"- {clean_b}", ln=True)

        pdf_bytes = pdf.output(dest='S')
        if isinstance(pdf_bytes, str): pdf_bytes = pdf_bytes.encode('latin-1')

        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=Report_{data.nid_number}.pdf",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        logger.error(f"PDF Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)