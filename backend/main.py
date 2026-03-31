import os
import json
import cv2
import numpy as np
import easyocr
import re
import logging
import io  # CRITICAL for fixing 500 Internal Server Error
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from datetime import datetime
from typing import List, Dict
from fpdf import FPDF

# --- 1. HARDWARE STABILITY FIX ---
os.environ["CUDA_VISIBLE_DEVICES"] = "-1" 

# --- 2. INITIALIZATION ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Smart-Nagorik Gateway API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize OCR
try:
    reader = easyocr.Reader(['bn', 'en'], gpu=False)
    logger.info("OCR Engine loaded successfully.")
except Exception as e:
    logger.error(f"OCR Init Error: {e}")

# --- 3. DATABASE LOGIC ---
USER_DB = "users.json"
HISTORY_DB = "history.json"

class User(BaseModel):
    username: str
    password: str

def load_data(file_path):
    if not os.path.exists(file_path): return {}
    with open(file_path, "r", encoding='utf-8') as f: return json.load(f)

def save_data(file_path, data):
    with open(file_path, "w", encoding='utf-8') as f: json.dump(data, f, indent=4)

# --- 4. AUTH ENDPOINTS ---
@app.post("/register")
async def register(user: User):
    users = load_data(USER_DB)
    if user.username in users:
        raise HTTPException(status_code=400, detail="User already exists")
    users[user.username] = user.password
    save_data(USER_DB, users)
    return {"message": "User registered successfully"}

@app.post("/login")
async def login(user: User):
    users = load_data(USER_DB)
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
    services = ["Smart ID Services", "Digital Banking Access"]
    if age >= 18: services.append("Voter Registration (ভোটার নিবন্ধন)")
    if 18 <= age <= 35: services.append("Youth Training Grant (যুব উন্নয়ন)")
    if age >= 65: services.append("Old Age Allowance (বয়স্ক ভাতা)")
    return services

def parse_nid_data(text_list: List[str]) -> Dict:
    full_text = " ".join(text_list)
    nid_match = re.search(r'\d{10,17}', full_text)
    nid_no = nid_match.group(0) if nid_match else "Not Found"
    
    dob_match = re.search(r'\d{2} [A-Za-z]{3} \d{4}', full_text)
    dob = dob_match.group(0) if dob_match else "Not Found"

    # Restored high-accuracy Name Detection
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
    
    return {
        "name": name, 
        "nid_number": nid_no, 
        "dob": dob, 
        "benefits": benefits,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

@app.post("/extract-nid")
async def extract_nid(username: str, file: UploadFile = File(...)):
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        raw_results = reader.readtext(img, detail=0)
        final_data = parse_nid_data(raw_results)
        
        history = load_data(HISTORY_DB)
        if username not in history: history[username] = []
        history[username].append(final_data)
        save_data(HISTORY_DB, history)
        
        return {"status": "success", "data": final_data}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# --- 6. HISTORY & PDF LOGIC ---
@app.get("/history/{username}")
async def get_history(username: str):
    history = load_data(HISTORY_DB)
    return history.get(username, [])

@app.post("/generate-report")
async def generate_report(data: Dict):
    try:
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("Arial", 'B', 16)
        pdf.cell(200, 10, txt="Smart-Nagorik Official NID Report", ln=True, align='C')
        pdf.ln(10)
        
        pdf.set_font("Arial", size=12)
        pdf.cell(200, 10, txt=f"Full Name: {data.get('name')}", ln=True)
        pdf.cell(200, 10, txt=f"NID Number: {data.get('nid_number')}", ln=True)
        pdf.cell(200, 10, txt=f"Date of Birth: {data.get('dob')}", ln=True)
        pdf.ln(5)
        
        pdf.set_font("Arial", 'B', 12)
        pdf.cell(200, 10, txt="Eligible Benefits:", ln=True)
        pdf.set_font("Arial", size=11)
        for benefit in data.get('benefits', []):
            pdf.cell(200, 8, txt=f"- {benefit}", ln=True)

        # FIX: Send PDF from memory to avoid disk permission errors
        pdf_output = pdf.output(dest='S').encode('latin-1')
        return StreamingResponse(
            io.BytesIO(pdf_output),
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=NID_Report.pdf"}
        )
    except Exception as e:
        logger.error(f"PDF Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)