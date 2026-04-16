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
from typing import List, Dict, Optional
from fpdf import FPDF

os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Smart-Nagorik Gateway API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    reader = easyocr.Reader(['bn', 'en'], gpu=False)
    logger.info("OCR Engine loaded.")
except Exception as e:
    logger.error(f"OCR Init Error: {e}")
    reader = None

USER_DB    = "users.json"
HISTORY_DB = "history.json"

def load_db(path):
    if not os.path.exists(path): return {}
    with open(path, "r", encoding="utf-8") as f: return json.load(f)

def save_db(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

# ── AUTH ──────────────────────────────────────────────
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

# ── NID HELPERS ───────────────────────────────────────
def calculate_age(dob_str: str) -> Optional[int]:
    try:
        dob = datetime.strptime(dob_str, "%d %b %Y")
        today = datetime.today()
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    except:
        return None

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
        if any(k in line for k in ["Name", "nid"]):
            if ":" in line and len(line.split(":")[-1].strip()) > 3:
                name = line.split(":")[-1].strip(); break
            elif i + 1 < len(text_list):
                name = text_list[i + 1].strip(); break
    dob = dob_match.group(0) if dob_match else "Not Found"
    age = calculate_age(dob)
    return {
        "name":      name,
        "nid_number": nid_match.group(0) if nid_match else "Not Found",
        "dob":       dob,
        "age":       age,
        "benefits":  get_eligibility(age),
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }

@app.post("/extract-nid")
async def extract_nid(username: str, file: UploadFile = File(...)):
    try:
        if reader is None: raise HTTPException(500, "OCR engine not initialized")
        contents = await file.read()
        img = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)
        if img is None: raise HTTPException(400, "Invalid image file")
        raw_text = reader.readtext(img, detail=0)
        result = parse_nid_data(raw_text)
        history = load_db(HISTORY_DB)
        if username not in history: history[username] = []
        history[username].append({"type": "nid", **result})
        save_db(HISTORY_DB, history)
        return {"status": "success", "data": result}
    except HTTPException: raise
    except Exception as e:
        logger.error(f"NID extract error: {e}")
        return {"status": "error", "message": str(e)}


# ── BIRTH CERTIFICATE HELPERS ─────────────────────────
def strip_bengali(text: str) -> str:
    cleaned = re.sub(r'[\u0980-\u09FF]+', '', text)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned

def is_english_only(line: str) -> bool:
    english_chars = re.sub(r'[\u0980-\u09FF\s]', '', line)
    return len(english_chars) >= 2

def calc_age(dob: str) -> Optional[int]:
    for fmt in ["%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d %B %Y", "%d %b %Y"]:
        try:
            dp = datetime.strptime(dob, fmt)
            today = datetime.today()
            return today.year - dp.year - ((today.month, today.day) < (dp.month, dp.day))
        except:
            continue
    return None

def parse_birth_cert_data(raw_lines: List[str]) -> Dict:
    logger.info("=== RAW OCR LINES ===")
    for i, l in enumerate(raw_lines):
        logger.info(f"  [{i:02d}] {repr(l)}")

    # Pass 1: English-only filtered lines (used for DOB, Gender, BRN)
    english_lines = []
    for i, line in enumerate(raw_lines):
        c = strip_bengali(line).strip()
        if c and is_english_only(c):
            english_lines.append((i, c))

    texts = [l for _, l in english_lines]
    full_text_eng = " ".join(texts)

    # Pass 2: All lines with English content (used for Name, Mother, Father etc.)
    cleaned = []
    for line in raw_lines:
        c = strip_bengali(line).strip()
        if re.search(r'[a-zA-Z0-9]', c):
            cleaned.append(c)
        elif c.startswith(':'):
            val_part = c[1:].strip()
            if re.search(r'[a-zA-Z0-9]', val_part):
                cleaned.append(c)

    logger.info("=== ENGLISH-ONLY LINES ===")
    for i, l in enumerate(texts): logger.info(f"  [{i:02d}] {repr(l)}")
    logger.info("=== CLEANED ALL LINES ===")
    for i, l in enumerate(cleaned): logger.info(f"  [{i:02d}] {repr(l)}")

    # ── BRN ───────────────────────────────────────────────────────────────
    brn = "Not Found"
    brn_m = re.search(r'\b(\d{17,18})\b', full_text_eng)
    if brn_m:
        brn = brn_m.group(1)
    else:
        for line in texts:
            d = re.sub(r'\s', '', line)
            if re.fullmatch(r'\d{15,18}', d):
                brn = d; break

    # ── Date of Birth ─────────────────────────────────────────────────────
    SKIP_LINES = re.compile(
        r'Date\s*of\s*Registration|Date\s*of\s*Issuance|Date\s*of\s*Issue',
        re.IGNORECASE
    )
    dob = "Not Found"

    # Pass 1: "Date of Birth" label + date on same line
    for line in raw_lines:
        lc = strip_bengali(line).strip()
        if not lc or SKIP_LINES.search(lc): continue
        if not re.search(r'Date\s*of\s*Birth', lc, re.IGNORECASE): continue
        after = re.split(r'Date\s*of\s*Birth\s*:?\s*', lc, flags=re.IGNORECASE, maxsplit=1)
        if len(after) >= 2:
            dm = re.search(r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})', after[1])
            if dm:
                dob = f"{dm.group(1).zfill(2)}/{dm.group(2).zfill(2)}/{dm.group(3)}"
                break

    # Pass 2: label on one line, date on next line
    if dob == "Not Found":
        for i, line in enumerate(raw_lines):
            lc = strip_bengali(line).strip()
            if SKIP_LINES.search(lc): continue
            if re.search(r'Date\s*of\s*Birth', lc, re.IGNORECASE):
                for j in range(i + 1, min(i + 4, len(raw_lines))):
                    nxt = strip_bengali(raw_lines[j]).strip()
                    if SKIP_LINES.search(nxt): continue
                    dm = re.search(r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})', nxt)
                    if dm and 1900 <= int(dm.group(3)) <= 2020:
                        dob = f"{dm.group(1).zfill(2)}/{dm.group(2).zfill(2)}/{dm.group(3)}"
                        break
                if dob != "Not Found": break

    # Pass 3: last resort — any non-skip line with a plausible birth year
    if dob == "Not Found":
        for line in raw_lines:
            lc = strip_bengali(line).strip()
            if not lc or SKIP_LINES.search(lc): continue
            for m in re.finditer(r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})', lc):
                if 1900 <= int(m.group(3)) <= 2020:
                    dob = f"{m.group(1).zfill(2)}/{m.group(2).zfill(2)}/{m.group(3)}"
                    break
            if dob != "Not Found": break

    age = calc_age(dob)

    # ── Gender ────────────────────────────────────────────────────────────
    gender = "Not Found"
    for line in texts:
        sm = re.search(r'Sex\s*[:\-]\s*(\w+)', line, re.IGNORECASE)
        if sm: gender = sm.group(1).capitalize(); break
    if gender == "Not Found":
        for line in texts:
            if re.search(r'\bFemale\b', line, re.IGNORECASE): gender = "Female"; break
            if re.search(r'\bMale\b',   line, re.IGNORECASE): gender = "Male";   break

    # ── Generic label→value extractor ────────────────────────────────────
    def get_value(label_re: str, lines: List[str], exclude_re: str = None) -> str:
        for i, line in enumerate(lines):
            if exclude_re and re.search(exclude_re, line, re.IGNORECASE): continue
            if not re.search(label_re, line, re.IGNORECASE): continue
            all_m = list(re.finditer(label_re, line, re.IGNORECASE))
            after = line[all_m[-1].end():]
            if ':' in after:
                val = after.split(':', 1)[1].strip()
                val = re.sub(r'^[\s:\-]+', '', val).strip()
                val = re.split(r'\s{3,}|\bNationality\b', val, flags=re.IGNORECASE)[0].strip()
                if len(val) > 1 and re.search(r'[a-zA-Z]', val):
                    return val
            for j in range(i + 1, min(i + 3, len(lines))):
                nxt_c = lines[j].strip()
                if not re.search(r'[a-zA-Z0-9]', nxt_c): continue
                is_label = re.search(
                    r'\b(Date|Name|Mother|Father|Nationality|Place|Permanent|'
                    r'Sex|Birth|Registration|Issuance|In\s*Word|Government|'
                    r'Office|Rule|Certificate)\b', nxt_c, re.IGNORECASE)
                if is_label: break
                if nxt_c.startswith(':'):
                    val = nxt_c[1:].strip()
                    val = re.sub(r'^[\s:\-]+', '', val).strip()
                    val = re.split(r'\s{3,}|\bNationality\b', val, flags=re.IGNORECASE)[0].strip()
                    if len(val) > 1 and re.search(r'[a-zA-Z]', val):
                        return val
                if re.search(r'[a-zA-Z]{2,}', nxt_c) and len(nxt_c) > 3:
                    return re.split(r'\s{3,}|\bNationality\b', nxt_c, flags=re.IGNORECASE)[0].strip()
        return "Not Found"

    name           = get_value(r'(?<![a-zA-Z])Name(?![a-zA-Z])', cleaned,
                               exclude_re=r'\b(Mother|Father|Registration|Permanent)\b')
    mother_name    = get_value(r'\bMother\b',      cleaned, exclude_re=r'\bNationality\b')
    father_name    = get_value(r'\bFather\b',      cleaned, exclude_re=r'\bNationality\b')
    place_of_birth = get_value(r'Place\s*of\s*Birth', cleaned)

    nationality = "BANGLADESHI"
    nat_val = get_value(r'\bNationality\b', cleaned)
    if nat_val != "Not Found":
        first = nat_val.split()[0] if nat_val.split() else ""
        if len(first) > 2:
            nationality = first.upper()

    def _sanitize_field(s: str) -> str:
        """Strip OCR special chars that break fpdf latin-1 encoding."""
        if not s or s == "Not Found":
            return s
        # Replace common Unicode punctuation with ASCII equivalents
        for ch, r in {'\u2013':'-','\u2014':'-','\u2018':"'",'\u2019':"'",'\u00a0':' ','\u200b':''}.items():
            s = s.replace(ch, r)
        s = re.sub(r'[\u0980-\u09FF]', '', s)  # Bengali
        s = re.sub(r'[^\x00-\xFF]', '', s)      # anything above latin-1
        return re.sub(r'\s+', ' ', s).strip() or "Not Found"

    result = {
        "name":                 _sanitize_field(name),
        "father_name":          _sanitize_field(father_name),
        "mother_name":          _sanitize_field(mother_name),
        "place_of_birth":       _sanitize_field(place_of_birth),
        "dob":                  _sanitize_field(dob),
        "age":                  age,
        "registration_no":      _sanitize_field(brn),
        "registration_book_no": "N/A",
        "personal_id_no":       _sanitize_field(brn),
        "gender":               _sanitize_field(gender),
        "nationality":          _sanitize_field(nationality),
        "timestamp":            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    logger.info(f"=== PARSED RESULT === {result}")
    return result


@app.post("/extract-birth-cert")
async def extract_birth_cert(username: str, file: UploadFile = File(...)):
    try:
        if reader is None:
            raise HTTPException(500, "OCR engine not initialized")
        contents = await file.read()
        img = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            raise HTTPException(400, "Invalid image file")
        h, w = img.shape[:2]
        if w < 1800:
            scale = 1800 / w
            img = cv2.resize(img, (int(w * scale), int(h * scale)),
                             interpolation=cv2.INTER_CUBIC)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        gray = cv2.fastNlMeansDenoising(gray, h=8)
        thresh = cv2.adaptiveThreshold(gray, 255,
                                       cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                       cv2.THRESH_BINARY, 31, 10)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
        sharpen_k = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
        sharpened = cv2.filter2D(thresh, -1, sharpen_k)
        img_for_ocr = cv2.cvtColor(sharpened, cv2.COLOR_GRAY2BGR)
        raw_text = reader.readtext(img_for_ocr, detail=0, paragraph=False)
        logger.info(f"Birth cert OCR — {len(raw_text)} raw lines")
        result = parse_birth_cert_data(raw_text)
        history = load_db(HISTORY_DB)
        if username not in history:
            history[username] = []
        history[username].append({"type": "birth_cert", **result})
        save_db(HISTORY_DB, history)
        return {"status": "success", "data": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Birth cert extract error: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}


# ── HISTORY & ANALYTICS ───────────────────────────────
@app.get("/history/{username}")
async def get_history(username: str):
    return load_db(HISTORY_DB).get(username, [])

@app.get("/admin/analytics")
async def get_analytics():
    history = load_db(HISTORY_DB)
    all_scans = [item for sublist in history.values() for item in sublist]
    stats = {
        "total_scans":       len(all_scans),
        "nid_scans":         len([s for s in all_scans if s.get("type") == "nid"]),
        "birth_cert_scans":  len([s for s in all_scans if s.get("type") == "birth_cert"]),
        "age_groups":        {"Youth (18-35)": 0, "Middle (36-64)": 0, "Senior (65+)": 0},
        "service_demand":    {}
    }
    for scan in all_scans:
        age = scan.get("age")
        if age:
            if age <= 35:   stats["age_groups"]["Youth (18-35)"] += 1
            elif age <= 64: stats["age_groups"]["Middle (36-64)"] += 1
            else:           stats["age_groups"]["Senior (65+)"] += 1
        for b in scan.get("benefits", []):
            stats["service_demand"][b] = stats["service_demand"].get(b, 0) + 1
    return stats


# ══════════════════════════════════════════════════════
#  PDF HELPERS
#  Root cause of PDF failures:
#  - fpdf's multi_cell() moves the cursor to the next line AND resets X to 0,
#    so mixing cell() + multi_cell() on the same logical row corrupts layout.
#  - set_y(-22) for the footer can overlap body text when content is long.
#
#  Fix:
#  - Use only cell() for all rows (values are short enough after we removed
#    the permanent address field).
#  - Encode all strings to latin-1 (fpdf1 limitation) with error replacement.
#  - Add a page break check before the footer so it never overlaps content.
#  - Produce bytes with pdf.output(dest='S') which is reliable across
#    fpdf versions, then encode to bytes consistently.
# ══════════════════════════════════════════════════════

def _safe(value: str) -> str:
    """
    Make a string safe for fpdf1 (Arial/Helvetica = latin-1 subset).
    Steps:
      1. Replace common Unicode punctuation with ASCII equivalents.
      2. Strip Bengali and other non-latin characters.
      3. Encode to latin-1 with 'replace' as a final safety net.
    """
    if not value:
        return "Not Found"
    # Common Unicode → ASCII replacements
    replacements = {
        '\u2013': '-',   # en-dash
        '\u2014': '-',   # em-dash
        '\u2018': "'",   # left single quote
        '\u2019': "'",   # right single quote
        '\u201c': '"',   # left double quote
        '\u201d': '"',   # right double quote
        '\u2026': '...', # ellipsis
        '\u00b7': '.',   # middle dot
        '\u2022': '*',   # bullet
        '\u00a0': ' ',   # non-breaking space
        '\u200b': '',    # zero-width space
    }
    for ch, repl in replacements.items():
        value = value.replace(ch, repl)
    # Strip Bengali and any remaining non-latin-1 characters
    value = re.sub(r'[\u0980-\u09FF]', '', value)   # Bengali block
    value = re.sub(r'[^\x00-\xFF]', '', value)       # anything above latin-1
    value = re.sub(r'\s+', ' ', value).strip()
    # Final safety net encode/decode
    return value.encode('latin-1', errors='replace').decode('latin-1') or "Not Found"

def _pdf_header(pdf: FPDF, title: str, subtitle: str, r: int, g: int, b: int):
    pdf.set_fill_color(r, g, b)
    pdf.rect(0, 0, 210, 42, 'F')
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Arial", 'B', 17)
    pdf.set_xy(0, 10)
    pdf.cell(210, 10, txt=title, ln=True, align='C')
    pdf.set_font("Arial", size=9)
    pdf.cell(210, 6, txt=subtitle, ln=True, align='C')
    pdf.set_text_color(30, 30, 30)
    pdf.ln(14)

def _pdf_timestamp(pdf: FPDF, ts: str):
    pdf.set_font("Arial", 'I', 9)
    pdf.set_text_color(120, 120, 120)
    pdf.cell(0, 6, txt=f"Generated: {ts}", ln=True, align='R')
    pdf.ln(5)

def _pdf_section(pdf: FPDF, title: str, r: int, g: int, b: int):
    pdf.set_fill_color(r, g, b)
    pdf.set_font("Arial", 'B', 12)
    pdf.set_text_color(13, 71, 161)
    pdf.cell(0, 10, txt=f"  {title}", ln=True, fill=True)
    pdf.ln(4)

def _pdf_row(pdf: FPDF, label: str, value: str):
    """Single row: label cell + value cell, both on the same line."""
    pdf.set_font("Arial", 'B', 10)
    pdf.set_text_color(90, 90, 90)
    pdf.cell(60, 9, txt=f"{label}:", ln=False)
    pdf.set_font("Arial", size=10)
    pdf.set_text_color(20, 20, 20)
    pdf.cell(0, 9, txt=_safe(value), ln=True)

def _pdf_footer(pdf: FPDF, line1: str, line2: str, r: int, g: int, b: int):
    """Draw footer — ensure at least 25mm of space, else add a new page."""
    if pdf.get_y() > 265:
        pdf.add_page()
    pdf.set_y(-22)
    pdf.set_fill_color(r, g, b)
    pdf.rect(0, pdf.get_y(), 210, 22, 'F')
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Arial", 'I', 8)
    pdf.cell(0, 7, txt=line1, ln=True, align='C')
    pdf.cell(0, 5, txt=line2, ln=True, align='C')

def _pdf_to_bytes(pdf: FPDF) -> bytes:
    """Reliably convert fpdf output to bytes."""
    out = pdf.output(dest='S')
    if isinstance(out, str):
        return out.encode('latin-1', errors='replace')
    return bytes(out)


# ── NID PDF ───────────────────────────────────────────
class NIDReportData(BaseModel):
    name:       Optional[str]       = "Not Found"
    nid_number: Optional[str]       = "Not Found"
    dob:        Optional[str]       = "Not Found"
    age:        Optional[int]       = None
    benefits:   Optional[List[str]] = []
    timestamp:  Optional[str]       = None

@app.post("/generate-report")
async def generate_report(data: NIDReportData):
    try:
        pdf = FPDF()
        pdf.add_page()

        _pdf_header(pdf, "SMART-NAGORIK CITIZEN REPORT",
                    "Bangladesh National ID Verification Gateway",
                    0, 106, 78)
        _pdf_timestamp(pdf, data.timestamp or datetime.now().strftime('%Y-%m-%d %H:%M:%S'))

        _pdf_section(pdf, "CITIZEN INFORMATION", 235, 248, 242)
        _pdf_row(pdf, "Full Name",     data.name)
        _pdf_row(pdf, "NID Number",    data.nid_number)
        _pdf_row(pdf, "Date of Birth", data.dob)
        _pdf_row(pdf, "Age",           f"{data.age} years" if data.age else "N/A")
        pdf.ln(8)

        _pdf_section(pdf, "ELIGIBLE SERVICES & BENEFITS", 235, 248, 242)
        for b in (data.benefits or []):
            clean = re.sub(r'[^\x00-\x7F]+', '', b).split('(')[0].strip()
            if clean:
                pdf.set_font("Arial", size=10)
                pdf.set_text_color(20, 20, 20)
                pdf.cell(0, 8, txt=f"  * {clean}", ln=True)

        _pdf_footer(pdf,
                    "Official document — Smart-Nagorik Gateway System",
                    "For verification contact the Bangladesh National ID Authority",
                    0, 106, 78)

        pdf_bytes = _pdf_to_bytes(pdf)
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="NID_{_safe(data.nid_number)}.pdf"'}
        )
    except Exception as e:
        logger.error(f"NID PDF error: {e}", exc_info=True)
        raise HTTPException(500, f"PDF failed: {str(e)}")


# ── BIRTH CERT PDF ────────────────────────────────────
class BirthCertReportData(BaseModel):
    name:                 Optional[str] = "Not Found"
    father_name:          Optional[str] = "Not Found"
    mother_name:          Optional[str] = "Not Found"
    place_of_birth:       Optional[str] = "Not Found"
    dob:                  Optional[str] = "Not Found"
    age:                  Optional[int] = None
    registration_no:      Optional[str] = "Not Found"
    registration_book_no: Optional[str] = "N/A"
    personal_id_no:       Optional[str] = "Not Found"
    gender:               Optional[str] = "Not Found"
    nationality:          Optional[str] = "Bangladeshi"
    timestamp:            Optional[str] = None

@app.post("/generate-birth-cert-report")
async def generate_birth_cert_report(data: BirthCertReportData):
    try:
        pdf = FPDF()
        pdf.add_page()

        _pdf_header(pdf, "BIRTH CERTIFICATE REPORT",
                    "People's Republic of Bangladesh — Smart-Nagorik Gateway",
                    13, 71, 161)
        _pdf_timestamp(pdf, data.timestamp or datetime.now().strftime('%Y-%m-%d %H:%M:%S'))

        _pdf_section(pdf, "REGISTRATION DETAILS", 232, 240, 254)
        _pdf_row(pdf, "Birth Registration No.", data.personal_id_no)
        pdf.ln(6)

        _pdf_section(pdf, "PERSONAL INFORMATION", 232, 240, 254)
        _pdf_row(pdf, "Full Name",      data.name)
        _pdf_row(pdf, "Date of Birth",  data.dob)
        _pdf_row(pdf, "Age",            f"{data.age} years" if data.age else "N/A")
        _pdf_row(pdf, "Gender",         data.gender)
        _pdf_row(pdf, "Nationality",    data.nationality)
        _pdf_row(pdf, "Place of Birth", data.place_of_birth)
        pdf.ln(6)

        _pdf_section(pdf, "FAMILY INFORMATION", 232, 240, 254)
        _pdf_row(pdf, "Father's Name",  data.father_name)
        _pdf_row(pdf, "Mother's Name",  data.mother_name)

        _pdf_footer(pdf,
                    "Official document — Smart-Nagorik Gateway System",
                    "For verification contact the Bangladesh Birth & Death Registration Authority",
                    13, 71, 161)

        pdf_bytes = _pdf_to_bytes(pdf)
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="BirthCert_{_safe(data.personal_id_no)}.pdf"'}
        )
    except Exception as e:
        logger.error(f"Birth cert PDF error: {e}", exc_info=True)
        raise HTTPException(500, f"PDF failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)