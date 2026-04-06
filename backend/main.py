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
)

# Initialize OCR Engine (CPU Mode)
try:
    reader = easyocr.Reader(['bn', 'en'], gpu=False)
    logger.info("OCR Engine loaded successfully.")
except Exception as e:
    logger.error(f"OCR Init Error: {e}")
    reader = None

USER_DB = "users.json"
HISTORY_DB = "history.json"

def load_db(path):
    if not os.path.exists(path):
        return {}
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
def calculate_age(dob_str: str) -> Optional[int]:
    try:
        dob = datetime.strptime(dob_str, "%d %b %Y")
        today = datetime.today()
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    except:
        return None

def get_eligibility(age: Optional[int]) -> List[str]:
    services = ["Smart ID Services", "Digital Banking Access"]
    if age is None:
        return services
    if age >= 18:
        services.append("Voter Registration")
    if 18 <= age <= 35:
        services.append("Youth Training Grant")
    if age >= 65:
        services.append("Old Age Allowance")
    return services

def parse_nid_data(text_list: List[str]) -> Dict:
    full_text = " ".join(text_list)
    nid_match = re.search(r'\d{10,17}', full_text)
    dob_match = re.search(r'\d{2} [A-Za-z]{3} \d{4}', full_text)

    name = "Not Found"
    for i, line in enumerate(text_list):
        if any(key in line for key in ["Name", "nid"]):
            if ":" in line and len(line.split(":")[-1].strip()) > 3:
                name = line.split(":")[-1].strip()
                break
            elif i + 1 < len(text_list):
                name = text_list[i + 1].strip()
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
        if reader is None:
            raise HTTPException(status_code=500, detail="OCR engine not initialized")
        contents = await file.read()
        img = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image file")
        raw_text = reader.readtext(img, detail=0)
        result = parse_nid_data(raw_text)

        history = load_db(HISTORY_DB)
        if username not in history:
            history[username] = []
        history[username].append(result)
        save_db(HISTORY_DB, history)

        return {"status": "success", "data": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Extract NID error: {e}")
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
        "age_groups": {"Youth (18-35)": 0, "Middle (36-64)": 0, "Senior (65+)": 0},
        "service_demand": {}
    }
    for scan in all_scans:
        age = scan.get("age")
        if age:
            if age <= 35:
                stats["age_groups"]["Youth (18-35)"] += 1
            elif age <= 64:
                stats["age_groups"]["Middle (36-64)"] += 1
            else:
                stats["age_groups"]["Senior (65+)"] += 1
        for b in scan.get("benefits", []):
            stats["service_demand"][b] = stats["service_demand"].get(b, 0) + 1
    return stats

# --- MODULE 5: PDF GENERATION ---
# FIX 1: Use Pydantic model instead of raw Dict — raw Dict causes FastAPI to expect query params, not body
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

        # Header bar
        pdf.set_fill_color(0, 106, 78)
        pdf.rect(0, 0, 210, 42, 'F')
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Arial", 'B', 18)
        pdf.set_xy(0, 10)
        pdf.cell(210, 10, txt="SMART-NAGORIK CITIZEN REPORT", ln=True, align='C')
        pdf.set_font("Arial", size=9)
        pdf.cell(210, 6, txt="Bangladesh National ID Verification Gateway", ln=True, align='C')

        pdf.set_text_color(30, 30, 30)
        pdf.ln(14)

        # Generated date
        pdf.set_font("Arial", 'I', 9)
        pdf.set_text_color(120, 120, 120)
        timestamp = data.timestamp or datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        pdf.cell(0, 6, txt=f"Generated: {timestamp}", ln=True, align='R')
        pdf.ln(5)

        # Citizen Info Section
        pdf.set_fill_color(235, 248, 242)
        pdf.set_font("Arial", 'B', 12)
        pdf.set_text_color(0, 106, 78)
        pdf.cell(0, 10, txt="  CITIZEN INFORMATION", ln=True, fill=True)
        pdf.ln(4)

        fields = [
            ("Full Name", data.name or "Not Found"),
            ("NID Number", data.nid_number or "Not Found"),
            ("Date of Birth", data.dob or "Not Found"),
            ("Age", (str(data.age) + " years") if data.age else "Not Found"),
        ]

        for label, value in fields:
            pdf.set_font("Arial", 'B', 10)
            pdf.set_text_color(90, 90, 90)
            pdf.cell(50, 9, txt=f"{label}:", ln=False)
            pdf.set_font("Arial", size=10)
            pdf.set_text_color(20, 20, 20)
            # FIX 2: Encode to latin-1, replacing unencodable chars (Bangla etc.)
            safe_value = value.encode('latin-1', errors='replace').decode('latin-1')
            pdf.cell(0, 9, txt=safe_value, ln=True)

        pdf.ln(8)

        # Benefits Section
        pdf.set_fill_color(235, 248, 242)
        pdf.set_font("Arial", 'B', 12)
        pdf.set_text_color(0, 106, 78)
        pdf.cell(0, 10, txt="  ELIGIBLE SERVICES & BENEFITS", ln=True, fill=True)
        pdf.ln(4)

        benefits = data.benefits or []
        if benefits:
            for b in benefits:
                # FIX 3: Strip non-ASCII (Bangla) characters — FPDF only supports latin-1
                clean_b = re.sub(r'[^\x00-\x7F]+', '', b).strip()
                clean_b = clean_b.split('(')[0].strip()
                if clean_b:
                    pdf.set_font("Arial", size=10)
                    pdf.set_text_color(20, 20, 20)
                    pdf.set_fill_color(210, 240, 228)
                    pdf.cell(8, 8, txt=" ", ln=False, fill=True)
                    pdf.cell(0, 8, txt=f"  {clean_b}", ln=True)
                    pdf.ln(1)
        else:
            pdf.set_font("Arial", size=10)
            pdf.cell(0, 8, txt="No benefits determined.", ln=True)

        # Footer
        pdf.set_y(-22)
        pdf.set_fill_color(0, 106, 78)
        pdf.rect(0, pdf.get_y(), 210, 22, 'F')
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Arial", 'I', 8)
        pdf.cell(0, 7, txt="This is an officially generated document by Smart-Nagorik Gateway System.", ln=True, align='C')
        pdf.cell(0, 5, txt="For verification, contact the Bangladesh National ID Authority.", ln=True, align='C')

        # FIX 4: fpdf2 output() returns bytearray, not string — handle both versions
        pdf_output = pdf.output()
        if isinstance(pdf_output, (bytes, bytearray)):
            pdf_bytes = bytes(pdf_output)
        else:
            pdf_bytes = pdf_output.encode('latin-1', errors='replace')

        filename = f"NID_Report_{data.nid_number or 'citizen'}.pdf"
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(pdf_bytes)),
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        logger.error(f"PDF Generation Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
