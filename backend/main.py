import cv2
import numpy as np
import easyocr
import re
import logging
import os
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
from typing import List, Dict

# --- SETUP ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Force CPU usage to prevent DLL/GPU errors seen on some Windows machines
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"

app = FastAPI(title="Smart-Nagorik NID Gateway")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize OCR (Bangla + English) - gpu=False is critical here
try:
    reader = easyocr.Reader(['bn', 'en'], gpu=False)
except Exception as e:
    logger.error(f"OCR Init Error: {e}")

# --- LOGIC & FORM FILLING ENGINE ---

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
    
    # NID Number (10-17 digits)
    nid_match = re.search(r'\d{10,17}', full_text)
    nid_no = nid_match.group(0) if nid_match else "Not Found"

    # DOB (Example: 01 Jan 1990)
    dob_match = re.search(r'\d{2} [A-Za-z]{3} \d{4}', full_text)
    dob = dob_match.group(0) if dob_match else "Not Found"

    # Smarter Name Extraction
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
        "eligible_benefits": benefits
    }

@app.post("/extract-nid")
async def extract_nid(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # Step 1: Raw OCR Extraction
        raw_results = reader.readtext(img, detail=0)

        # Step 2: Logic Parsing
        final_data = parse_nid_data(raw_results)

        return {"status": "success", "data": final_data}
    except Exception as e:
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)