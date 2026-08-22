from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
import os
import json
import uuid
import base64
import time
import sqlite3
from datetime import datetime, timezone
from collections import Counter
from io import BytesIO
import logging

import httpx
from dotenv import load_dotenv

load_dotenv()

# -----------------------------------------------------------
# Logging
# -----------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("handwriting-coach")

# -----------------------------------------------------------
# Configuration
# -----------------------------------------------------------

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

CF_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID")
CF_API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN")
CF_D1_DATABASE_ID = os.getenv("CLOUDFLARE_D1_DATABASE_ID")
CF_R2_BUCKET = os.getenv("CLOUDFLARE_R2_BUCKET")
CF_R2_ACCESS_KEY_ID = os.getenv("CF_R2_ACCESS_KEY_ID", "")
CF_R2_SECRET_ACCESS_KEY = os.getenv("CF_R2_SECRET_ACCESS_KEY", "")
CF_R2_ENDPOINT = os.getenv("CF_R2_ENDPOINT", "")

USE_CLOUDFLARE = bool(CF_ACCOUNT_ID and CF_API_TOKEN and CF_D1_DATABASE_ID and CF_R2_BUCKET)

if not USE_CLOUDFLARE:
    logger.warning("DEV MODE — local SQLite, data-URL R2 placeholders")

# -----------------------------------------------------------
# Image MIME detection
# -----------------------------------------------------------

def detect_image_mime(data: bytes) -> Optional[str]:
    if not data or len(data) < 12:
        return None
    if data[0:3] == b'\xff\xd8\xff':
        return 'image/jpeg'
    if data[0:8] == b'\x89PNG\r\n\x1a\n':
        return 'image/png'
    if data[0:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'image/webp'
    if data[0:6] in (b'GIF87a', b'GIF89a'):
        return 'image/gif'
    if data[0:2] == b'BM':
        return 'image/bmp'
    return None


ALLOWED_MIMES = {'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'}
MAX_FILE_SIZE = 10 * 1024 * 1024


def validate_image(file_bytes: bytes, filename: str) -> str:
    mime = detect_image_mime(file_bytes)
    if mime not in ALLOWED_MIMES:
        raise HTTPException(status_code=400, detail=f"Invalid image: {mime or 'unknown'}. Use JPG/PNG/WEBP.")
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large ({len(file_bytes) // 1024 // 1024}MB). Max 10MB.")
    return mime


# -----------------------------------------------------------
# D1 abstraction
# -----------------------------------------------------------

_local_db: Optional[sqlite3.Connection] = None


def _init_local_db() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    migration_path = os.path.join(os.path.dirname(__file__), "migrations", "0001_initial.sql")
    with open(migration_path) as f:
        sql = f.read()
    conn.executescript(sql)
    conn.commit()
    logger.info("SQLite dev database initialized")
    return conn


def d1_query(sql: str, params: list | None = None) -> list[dict]:
    if USE_CLOUDFLARE:
        return _d1_query_cloudflare(sql, params)
    return _d1_query_sqlite(sql, params)


def d1_insert(table: str, row: dict) -> dict:
    if USE_CLOUDFLARE:
        return _d1_insert_cloudflare(table, row)
    return _d1_insert_sqlite(table, row)


def d1_update(table: str, updates: dict, condition: str, condition_params: list | None = None) -> None:
    if USE_CLOUDFLARE:
        return _d1_update_cloudflare(table, updates, condition, condition_params)
    return _d1_update_sqlite(table, updates, condition, condition_params)


# --- Cloudflare D1 ---

D1_BASE_URL = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{CF_D1_DATABASE_ID}" if CF_ACCOUNT_ID and CF_D1_DATABASE_ID else ""


def _d1_query_cloudflare(sql: str, params: list | None = None) -> list[dict]:
    url = f"{D1_BASE_URL}/query"
    body = {"sql": sql}
    if params:
        body["params"] = params
    with httpx.Client(timeout=15.0) as client:
        resp = client.post(url, json=body, headers={"Authorization": f"Bearer {CF_API_TOKEN}", "Content-Type": "application/json"})
        resp.raise_for_status()
        data = resp.json()
    if not data.get("success"):
        raise RuntimeError(f"D1 failed: {data.get('errors')}")
    results = data.get("result", [])
    return results[0].get("results", []) if results else []


def _d1_insert_cloudflare(table: str, row: dict) -> dict:
    cols = ", ".join(row.keys())
    placeholders = ", ".join(["?"] * len(row))
    _d1_query_cloudflare(f"INSERT INTO {table} ({cols}) VALUES ({placeholders})", list(row.values()))
    return row


def _d1_update_cloudflare(table: str, updates: dict, condition: str, condition_params: list | None = None) -> None:
    set_clause = ", ".join([f"{k} = ?" for k in updates.keys()])
    _d1_query_cloudflare(f"UPDATE {table} SET {set_clause} WHERE {condition}", list(updates.values()) + (condition_params or []))


# --- Local SQLite ---

def _get_local_db() -> sqlite3.Connection:
    global _local_db
    if _local_db is None:
        _local_db = _init_local_db()
    return _local_db


def _d1_query_sqlite(sql: str, params: list | None = None) -> list[dict]:
    conn = _get_local_db()
    return [dict(row) for row in conn.execute(sql, params or []).fetchall()]


def _d1_insert_sqlite(table: str, row: dict) -> dict:
    conn = _get_local_db()
    cols = ", ".join(row.keys())
    conn.execute(f"INSERT INTO {table} ({cols}) VALUES ({', '.join(['?'] * len(row))})", list(row.values()))
    conn.commit()
    return row


def _d1_update_sqlite(table: str, updates: dict, condition: str, condition_params: list | None = None) -> None:
    conn = _get_local_db()
    conn.execute(f"UPDATE {table} SET {', '.join([f'{k} = ?' for k in updates])} WHERE {condition}",
                 list(updates.values()) + (condition_params or []))
    conn.commit()


# -----------------------------------------------------------
# R2 abstraction
# -----------------------------------------------------------

r2_client = None

if USE_CLOUDFLARE and CF_R2_ACCESS_KEY_ID and CF_R2_SECRET_ACCESS_KEY:
    import boto3
    R2_ENDPOINT = CF_R2_ENDPOINT or f"https://{CF_ACCOUNT_ID}.r2.cloudflarestorage.com"
    r2_client = boto3.client("s3", endpoint_url=R2_ENDPOINT, aws_access_key_id=CF_R2_ACCESS_KEY_ID,
                             aws_secret_access_key=CF_R2_SECRET_ACCESS_KEY, region_name="auto")


def r2_upload(key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    if r2_client and CF_R2_BUCKET and CF_ACCOUNT_ID:
        r2_client.put_object(Bucket=CF_R2_BUCKET, Key=key, Body=data, ContentType=content_type)
        return f"https://{CF_R2_BUCKET}.{CF_ACCOUNT_ID}.r2.dev/{key}"
    b64 = base64.b64encode(data).decode("utf-8")
    return f"data:{content_type};base64,{b64}"


# -----------------------------------------------------------
# FastAPI app
# -----------------------------------------------------------

app = FastAPI(title="Adaptive Handwriting Coach API")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", FRONTEND_URL).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
)


# -----------------------------------------------------------
# Data models
# -----------------------------------------------------------

class ScanResult(BaseModel):
    alignment: int = Field(ge=0, le=100)
    spacing: int = Field(ge=0, le=100)
    curves: int = Field(ge=0, le=100)
    explanation_alignment: str = Field(min_length=5, max_length=500)
    explanation_spacing: str = Field(min_length=5, max_length=500)
    explanation_curves: str = Field(min_length=5, max_length=500)
    is_fallback: bool = False

    @field_validator("explanation_alignment", "explanation_spacing", "explanation_curves")
    @classmethod
    def no_medical_content(cls, v: str) -> str:
        prohibited = ["diagnos", "disorder", "impairment", "deficit", "dysgraphia", "adhd", "autism"]
        for term in prohibited:
            if term in v.lower():
                raise ValueError(f"Prohibited medical term: '{term}'")
        return v


class ScanResponse(BaseModel):
    id: str
    student_id: str
    image_url: str
    alignment: int
    spacing: int
    curves: int
    explanation_alignment: str
    explanation_spacing: str
    explanation_curves: str
    teacher_confirmed: bool
    created_at: str
    is_fallback: bool = False
    recommended_exercise: Optional[str] = None
    recommended_worksheet_skill: Optional[str] = None


class Student(BaseModel):
    id: str
    name: str
    classroom_id: str


class ScanOverride(BaseModel):
    alignment: Optional[int] = Field(default=None, ge=0, le=100)
    spacing: Optional[int] = Field(default=None, ge=0, le=100)
    curves: Optional[int] = Field(default=None, ge=0, le=100)


class WorksheetGenerateRequest(BaseModel):
    skill: str
    title: Optional[str] = None


class ReportRequest(BaseModel):
    student_id: str
    period_start: Optional[str] = None
    period_end: Optional[str] = None


# -----------------------------------------------------------
# Gemini analysis
# -----------------------------------------------------------

GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
GEMINI_LEGACY_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

SCAN_PROMPT = """Analyze this handwriting worksheet image. Rate three skills from 0-100:
1. alignment: How level the writing sits on the line
2. spacing: Consistency of gaps between letters and words
3. curves: Smoothness of curved strokes

Return ONLY valid JSON with these exact keys:
{"alignment": 0-100, "spacing": 0-100, "curves": 0-100, "explanation_alignment": "brief plain language note", "explanation_spacing": "brief plain language note", "explanation_curves": "brief plain language note"}

Do not include any other text or markdown formatting."""


def _extract_text_from_response(data: dict) -> Optional[str]:
    if "output_text" in data:
        return data["output_text"]
    if "output" in data and isinstance(data["output"], list):
        for item in data["output"]:
            if isinstance(item, dict) and item.get("type") == "text":
                return item.get("content", "")
    if "steps" in data:
        for step in data["steps"]:
            if step.get("type") == "model_output":
                content = step.get("content", [])
                for item in content:
                    if isinstance(item, dict) and item.get("type") == "text":
                        return item.get("text", "") or item.get("content", "")
    if "candidates" in data:
        try:
            return data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError):
            pass
    return None


def call_gemini(image_bytes: bytes, mime_type: str) -> Optional[ScanResult]:
    if not GEMINI_API_KEY:
        logger.warning("No GEMINI_API_KEY — skipping AI analysis")
        return None

    b64_data = base64.b64encode(image_bytes).decode("utf-8")

    interactions_payload = {
        "model": GEMINI_MODEL,
        "input": [
            {"type": "text", "text": SCAN_PROMPT},
            {"type": "image", "data": b64_data, "mime_type": mime_type},
        ],
        "generation_config": {"temperature": 0.2},
    }

    legacy_payload = {
        "contents": [{"parts": [
            {"text": SCAN_PROMPT},
            {"inlineData": {"mimeType": mime_type, "data": b64_data}},
        ]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 300},
    }

    last_error = None
    for attempt in range(2):
        try:
            with httpx.Client(timeout=45.0) as client:
                resp = client.post(GEMINI_INTERACTIONS_URL, json=interactions_payload,
                                   headers={"x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json"})
                if resp.status_code == 404:
                    logger.info("Interactions API 404, falling back to legacy generateContent")
                    resp = client.post(GEMINI_LEGACY_URL.format(model=GEMINI_MODEL), json=legacy_payload,
                                       headers={"Content-Type": "application/json"}, params={"key": GEMINI_API_KEY})
                if resp.status_code != 200:
                    logger.error(f"Gemini {resp.status_code}: {resp.text[:500]}")
                    last_error = f"HTTP {resp.status_code}"
                    if attempt == 0:
                        continue
                    break
                data = resp.json()

            text = _extract_text_from_response(data)
            if not text:
                last_error = "No text in response"
                if attempt == 0:
                    continue
                break

            text = text.strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            text = text.strip()

            parsed = json.loads(text)
            return ScanResult(
                alignment=max(0, min(100, int(parsed.get("alignment", 0)))),
                spacing=max(0, min(100, int(parsed.get("spacing", 0)))),
                curves=max(0, min(100, int(parsed.get("curves", 0)))),
                explanation_alignment=parsed.get("explanation_alignment", "Keep writing level on the line."),
                explanation_spacing=parsed.get("explanation_spacing", "Maintain even gaps between letters."),
                explanation_curves=parsed.get("explanation_curves", "Practice smooth rounded strokes."),
                is_fallback=False,
            )
        except json.JSONDecodeError as e:
            logger.error(f"Gemini JSON error: {e}")
            last_error = f"JSON: {e}"
        except Exception as e:
            logger.error(f"Gemini error: {type(e).__name__}: {e}")
            last_error = f"{type(e).__name__}: {e}"
        if attempt == 0:
            continue
        break

    logger.error(f"Gemini failed after 2 attempts: {last_error}")
    return None


# -----------------------------------------------------------
# Weakness detection and exercise matching
# -----------------------------------------------------------

SKILL_TO_EXERCISE = {
    "alignment": {"exercise_id": "ex_align_1", "exercise_type": "spiral", "exercise_title": "Galaxy Spiral", "worksheet_skill": "alignment"},
    "spacing":   {"exercise_id": "ex_space_1", "exercise_type": "bug",    "exercise_title": "Laser Bug Chase", "worksheet_skill": "spacing"},
    "curves":    {"exercise_id": "ex_curves_1", "exercise_type": "wand",  "exercise_title": "Magic Wand Memory", "worksheet_skill": "curves"},
}


def detect_weakness(scores: ScanResult) -> str:
    return min({"alignment": scores.alignment, "spacing": scores.spacing, "curves": scores.curves}, key=lambda k: {"alignment": scores.alignment, "spacing": scores.spacing, "curves": scores.curves}[k])


def recommend_for_weakness(weakness: str) -> dict:
    return SKILL_TO_EXERCISE.get(weakness, SKILL_TO_EXERCISE["alignment"])


# -----------------------------------------------------------
# PDF report generation (uses reportlab, no Gemini dependency)
# -----------------------------------------------------------

def generate_report_pdf(student_name: str, scans: list[dict], latest_scores: dict) -> bytes:
    """Generate a PDF progress report from stored D1 data. No Gemini needed."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm)
    styles = getSampleStyleSheet()
    elements = []

    # Title
    title_style = ParagraphStyle('Title2', parent=styles['Title'], fontSize=20, spaceAfter=10)
    elements.append(Paragraph(f"Progress Report: {student_name}", title_style))
    elements.append(Paragraph(f"Generated {datetime.now(timezone.utc).strftime('%B %d, %Y')}", styles['Normal']))
    elements.append(Spacer(1, 10 * mm))

    # Summary
    elements.append(Paragraph("<b>Summary</b>", styles['Heading2']))
    elements.append(Paragraph(f"Total scans: {len(scans)}", styles['Normal']))
    if latest_scores:
        elements.append(Paragraph(
            f"Latest scores — Alignment: {latest_scores.get('alignment', 'N/A')}/100, "
            f"Spacing: {latest_scores.get('spacing', 'N/A')}/100, "
            f"Curves: {latest_scores.get('curves', 'N/A')}/100",
            styles['Normal']
        ))
    elements.append(Spacer(1, 8 * mm))

    # Score history table
    if scans:
        elements.append(Paragraph("<b>Score History</b>", styles['Heading2']))
        table_data = [["Date", "Alignment", "Spacing", "Curves", "Confirmed"]]
        for s in scans[:20]:  # Last 20 scans
            created = s.get("created_at", "")
            if "T" in created:
                created = created.split("T")[0]
            table_data.append([
                created,
                str(s.get("alignment", "")),
                str(s.get("spacing", "")),
                str(s.get("curves", "")),
                "Yes" if s.get("teacher_confirmed") else "No",
            ])
        t = Table(table_data, colWidths=[90, 70, 70, 70, 70])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4F46E5')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#EEF0FF')]),
        ]))
        elements.append(t)
        elements.append(Spacer(1, 8 * mm))

    # Weakness & recommendations
    if latest_scores:
        entries = [(k, v) for k, v in latest_scores.items() if v is not None]
        if entries:
            entries.sort(key=lambda x: x[1])
            weakest = entries[0][0]
            strongest = entries[-1][0]

            elements.append(Paragraph("<b>Recommendations</b>", styles['Heading2']))
            elements.append(Paragraph(
                f"<b>Strongest area:</b> {strongest.title()} ({latest_scores[strongest]}/100). "
                f"Keep up the great work!",
                styles['Normal']
            ))
            elements.append(Paragraph(
                f"<b>Area to practice:</b> {weakest.title()} ({latest_scores[weakest]}/100). "
                f"A few minutes of practice several times a week is recommended.",
                styles['Normal']
            ))
            rec = recommend_for_weakness(weakest)
            elements.append(Paragraph(
                f"<b>Recommended exercise:</b> {rec['exercise_title']} (skill: {weakest})",
                styles['Normal']
            ))

    elements.append(Spacer(1, 10 * mm))
    elements.append(Paragraph(
        "<i>This report is for practice support only and is not a medical or educational diagnosis.</i>",
        ParagraphStyle('Disclaimer', parent=styles['Normal'], fontSize=8, textColor=colors.grey)
    ))

    doc.build(elements)
    return buf.getvalue()


# -----------------------------------------------------------
# Helpers
# -----------------------------------------------------------

def _row_to_scan(r: dict) -> dict:
    return {
        "id": r["id"], "student_id": r["student_id"], "image_url": r["image_url"],
        "alignment": r["alignment"], "spacing": r["spacing"], "curves": r["curves"],
        "explanation_alignment": r["explanation_alignment"],
        "explanation_spacing": r["explanation_spacing"],
        "explanation_curves": r["explanation_curves"],
        "teacher_confirmed": bool(r.get("teacher_confirmed", 0)),
        "is_fallback": bool(r.get("is_fallback", 0)),
        "created_at": r["created_at"],
    }


def _scan_with_recommendation(scan_dict: dict) -> dict:
    try:
        sr = ScanResult(**{k: scan_dict[k] for k in ScanResult.model_fields})
        weakness = detect_weakness(sr)
        rec = recommend_for_weakness(weakness)
        scan_dict["recommended_exercise"] = rec["exercise_id"]
        scan_dict["recommended_worksheet_skill"] = rec["worksheet_skill"]
    except Exception:
        scan_dict["recommended_exercise"] = None
        scan_dict["recommended_worksheet_skill"] = None
    return scan_dict


# -----------------------------------------------------------
# API Routes
# -----------------------------------------------------------

@app.get("/api/health")
async def health():
    db_ok = False
    try:
        d1_query("SELECT 1")
        db_ok = True
    except Exception:
        pass
    return {
        "status": "ok",
        "mode": "cloudflare" if USE_CLOUDFLARE else "dev",
        "database": "ok" if db_ok else "error",
        "gemini": bool(GEMINI_API_KEY),
        "gemini_model": GEMINI_MODEL,
        "r2": bool(r2_client),
    }


# --- Students ---

@app.get("/api/students", response_model=List[Student])
async def get_students():
    return [Student(id=r["id"], name=r["name"], classroom_id=r["classroom_id"])
            for r in d1_query("SELECT id, name, classroom_id FROM students")]


@app.get("/api/students/{student_id}")
async def get_student(student_id: str):
    rows = d1_query("SELECT id, name, classroom_id FROM students WHERE id = ?", [student_id])
    if not rows:
        raise HTTPException(status_code=404, detail="Student not found")
    r = rows[0]
    return Student(id=r["id"], name=r["name"], classroom_id=r["classroom_id"])


@app.get("/api/students/{student_id}/scans")
async def get_student_scans(student_id: str):
    rows = d1_query(
        "SELECT id, student_id, image_url, alignment, spacing, curves, "
        "explanation_alignment, explanation_spacing, explanation_curves, "
        "teacher_confirmed, is_fallback, created_at "
        "FROM scans WHERE student_id = ? ORDER BY created_at DESC", [student_id])
    return [_row_to_scan(r) for r in rows]


# --- Scans ---

@app.post("/api/scans", response_model=ScanResponse)
async def create_scan(student_id: str, file: UploadFile = File(...)):
    student = await get_student(student_id)
    image_bytes = await file.read()
    detected_mime = validate_image(image_bytes, file.filename or "upload")

    file_ext = detected_mime.split("/")[-1].replace("jpeg", "jpg")
    r2_key = f"scans/{student_id}/{uuid.uuid4()}.{file_ext}"
    try:
        image_url = r2_upload(r2_key, image_bytes, content_type=detected_mime)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")

    scores = call_gemini(image_bytes, detected_mime)
    is_fallback = False
    if scores is None:
        scores = ScanResult(alignment=0, spacing=0, curves=0,
            explanation_alignment="AI analysis unavailable. Teacher review needed.",
            explanation_spacing="AI analysis unavailable. Teacher review needed.",
            explanation_curves="AI analysis unavailable. Teacher review needed.",
            is_fallback=True)
        is_fallback = True

    weakness = detect_weakness(scores)
    recommendation = recommend_for_weakness(weakness)

    scan_id = f"scan_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    d1_insert("scans", {
        "id": scan_id, "student_id": student_id, "image_url": image_url,
        "alignment": scores.alignment, "spacing": scores.spacing, "curves": scores.curves,
        "explanation_alignment": scores.explanation_alignment,
        "explanation_spacing": scores.explanation_spacing,
        "explanation_curves": scores.explanation_curves,
        "teacher_confirmed": 0, "is_fallback": 1 if is_fallback else 0, "created_at": now,
    })

    return ScanResponse(id=scan_id, student_id=student_id, image_url=image_url,
        alignment=scores.alignment, spacing=scores.spacing, curves=scores.curves,
        explanation_alignment=scores.explanation_alignment,
        explanation_spacing=scores.explanation_spacing,
        explanation_curves=scores.explanation_curves,
        teacher_confirmed=False, created_at=now, is_fallback=is_fallback,
        recommended_exercise=recommendation["exercise_id"],
        recommended_worksheet_skill=recommendation["worksheet_skill"])


@app.get("/api/scans/{scan_id}", response_model=ScanResponse)
async def get_scan(scan_id: str):
    rows = d1_query(
        "SELECT id, student_id, image_url, alignment, spacing, curves, "
        "explanation_alignment, explanation_spacing, explanation_curves, "
        "teacher_confirmed, is_fallback, created_at FROM scans WHERE id = ?", [scan_id])
    if not rows:
        raise HTTPException(status_code=404, detail="Scan not found")
    return ScanResponse(**_scan_with_recommendation(_row_to_scan(rows[0])))


@app.patch("/api/scans/{scan_id}", response_model=ScanResponse)
async def override_scan(scan_id: str, override: ScanOverride):
    """Teacher overrides scan scores. Persists to D1. Does NOT call Gemini."""
    updates = {}
    if override.alignment is not None:
        updates["alignment"] = override.alignment
    if override.spacing is not None:
        updates["spacing"] = override.spacing
    if override.curves is not None:
        updates["curves"] = override.curves
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    updates["teacher_confirmed"] = 1
    d1_update("scans", updates, "id = ?", [scan_id])
    logger.info(f"Teacher override on scan {scan_id}: {updates}")
    return await get_scan(scan_id)


# --- Class heatmap ---

@app.get("/api/classes/{class_id}/heatmap")
async def get_class_heatmap(class_id: str):
    students = d1_query("SELECT id, name FROM students WHERE classroom_id = ?", [class_id])
    heatmap = []
    weakness_counter = Counter()
    for student in students:
        scans = d1_query(
            "SELECT alignment, spacing, curves, created_at FROM scans WHERE student_id = ? ORDER BY created_at DESC LIMIT 1",
            [student["id"]])
        latest = scans[0] if scans else None
        heatmap.append({
            "student_id": student["id"],
            "student_name": student["name"],
            "latest_scan": {
                "alignment": latest["alignment"] if latest else None,
                "spacing": latest["spacing"] if latest else None,
                "curves": latest["curves"] if latest else None,
                "created_at": latest["created_at"] if latest else None,
            },
        })
        if latest:
            scores = {"alignment": latest["alignment"], "spacing": latest["spacing"], "curves": latest["curves"]}
            non_null = {k: v for k, v in scores.items() if v is not None}
            if non_null:
                weakness_counter[min(non_null, key=non_null.get)] += 1

    # Common weaknesses across class
    common_weaknesses = [{"skill": k, "count": v} for k, v in weakness_counter.most_common(3)]

    return {"students": heatmap, "common_weaknesses": common_weaknesses}


# --- Worksheets ---

@app.get("/api/worksheets/{skill}")
async def get_worksheet(skill: str):
    skill_lower = skill.lower()
    rows = d1_query("SELECT id, skill, title, url, r2_key FROM worksheets WHERE skill = ?", [skill_lower])
    if rows:
        r = rows[0]
        url = r.get("url") or (f"https://{CF_R2_BUCKET}.{CF_ACCOUNT_ID}.r2.dev/{r['r2_key']}" if r.get("r2_key") and CF_R2_BUCKET and CF_ACCOUNT_ID else None)
        return {"url": url or ""}
    raise HTTPException(status_code=404, detail="Worksheet not found")


@app.post("/api/worksheets/generate")
async def generate_worksheet(req: WorksheetGenerateRequest):
    skill = req.skill.lower()
    if skill not in ("alignment", "spacing", "curves"):
        raise HTTPException(status_code=400, detail="skill must be alignment, spacing, or curves")

    existing = d1_query("SELECT id FROM worksheets WHERE skill = ?", [skill])
    ws_id = existing[0]["id"] if existing else f"ws_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    title = req.title or f"{skill.capitalize()} Practice Worksheet"
    r2_key = f"worksheets/{skill}/{ws_id}.pdf"

    insert_data = {"id": ws_id, "skill": skill, "title": title, "description": f"Practice worksheet for {skill}",
                   "r2_key": r2_key, "url": "", "is_template": 1, "created_at": now}
    try:
        d1_insert("worksheets", insert_data)
    except Exception:
        pass

    rows = d1_query("SELECT id, skill, title, url, r2_key FROM worksheets WHERE id = ?", [ws_id])
    if rows:
        r = rows[0]
        url = r.get("url") or (f"https://{CF_R2_BUCKET}.{CF_ACCOUNT_ID}.r2.dev/{r['r2_key']}" if r.get("r2_key") and CF_R2_BUCKET and CF_ACCOUNT_ID else "")
        return {"id": ws_id, "skill": skill, "title": title, "url": url}
    return {"id": ws_id, "skill": skill, "title": title, "url": ""}


# --- Reports ---

@app.get("/api/students/{student_id}/report")
async def get_student_report(student_id: str):
    scans = await get_student_scans(student_id)
    student = await get_student(student_id)
    latest_scores = {}
    if scans:
        latest = scans[0]
        latest_scores = {"alignment": latest.get("alignment"), "spacing": latest.get("spacing"), "curves": latest.get("curves")}
    return {"student_name": student.name, "total_scans": len(scans), "latest_scores": latest_scores, "scans": scans}


@app.post("/api/reports/generate")
async def generate_report(req: ReportRequest):
    """Generate PDF report from D1 data, upload to R2, return URL."""
    student = await get_student(req.student_id)
    scans = await get_student_scans(req.student_id)
    latest_scores = {}
    if scans:
        latest = scans[0]
        latest_scores = {"alignment": latest.get("alignment"), "spacing": latest.get("spacing"), "curves": latest.get("curves")}

    pdf_bytes = generate_report_pdf(student.name, scans, latest_scores)

    report_id = f"rpt_{uuid.uuid4().hex[:12]}"
    r2_key = f"reports/{req.student_id}/{report_id}.pdf"
    try:
        pdf_url = r2_upload(r2_key, pdf_bytes, content_type="application/pdf")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to store report: {e}")

    now = datetime.now(timezone.utc).isoformat()
    d1_insert("reports", {
        "id": report_id, "student_id": req.student_id, "r2_key": r2_key,
        "url": pdf_url, "report_type": "progress",
        "period_start": req.period_start, "period_end": req.period_end, "generated_at": now,
    })

    return {"id": report_id, "url": pdf_url, "student_name": student.name, "generated_at": now}


@app.get("/api/students/{student_id}/report/pdf")
async def download_report_pdf(student_id: str):
    """Generate and download PDF report directly."""
    student = await get_student(student_id)
    scans = await get_student_scans(student_id)
    latest_scores = {}
    if scans:
        latest = scans[0]
        latest_scores = {"alignment": latest.get("alignment"), "spacing": latest.get("spacing"), "curves": latest.get("curves")}

    pdf_bytes = generate_report_pdf(student.name, scans, latest_scores)
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{student.name.replace(" ", "_")}_report.pdf"'})


# --- Exercise results ---

@app.post("/api/exercise-results")
async def save_exercise_result(data: dict):
    """Save a game/exercise tracing result to D1."""
    result_id = f"er_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    d1_insert("exercise_results", {
        "id": result_id,
        "student_id": data.get("student_id", ""),
        "exercise_id": data.get("exercise_id", ""),
        "scan_id": data.get("scan_id"),
        "raw_points": json.dumps(data.get("raw_points", [])),
        "kinematics": json.dumps(data.get("kinematics", {})),
        "dtw_distance": data.get("dtw_distance"),
        "validation_status": data.get("validation_status", "SUCCESS"),
        "validation_reason": data.get("validation_reason"),
        "score": data.get("score"),
        "completed_at": now,
    })
    return {"id": result_id, "status": "saved"}


@app.get("/api/students/{student_id}/exercise-results")
async def get_exercise_results(student_id: str):
    rows = d1_query(
        "SELECT er.*, e.title as exercise_title, e.skill "
        "FROM exercise_results er LEFT JOIN exercises e ON er.exercise_id = e.id "
        "WHERE er.student_id = ? ORDER BY er.completed_at DESC", [student_id])
    return rows


# -----------------------------------------------------------
# Rate limiting
# -----------------------------------------------------------

_rate_buckets: dict = {}


def _check_rate(key: str, max_calls: int, window_sec: int) -> bool:
    now = int(time.time())
    bucket = _rate_buckets.setdefault(key, [])
    bucket[:] = [t for t in bucket if t > now - window_sec]
    if len(bucket) >= max_calls:
        return False
    bucket.append(now)
    return True


@app.middleware("http")
async def rate_limit_middleware(request, call_next):
    path = request.url.path
    # Stricter limit for AI endpoints (scan creation)
    if request.method == "POST" and path == "/api/scans":
        ip = request.client.host if request.client else "unknown"
        if not _check_rate(f"scan:{ip}", max_calls=15, window_sec=60):
            raise HTTPException(status_code=429, detail="Too many scan requests. Wait a minute.")
    # Moderate limit for report generation
    if request.method == "POST" and "/reports/" in path:
        ip = request.client.host if request.client else "unknown"
        if not _check_rate(f"report:{ip}", max_calls=5, window_sec=60):
            raise HTTPException(status_code=429, detail="Too many report requests. Wait a minute.")
    return await call_next(request)


# -----------------------------------------------------------
# Startup
# -----------------------------------------------------------

@app.on_event("startup")
async def startup_validation():
    mode = "cloudflare" if USE_CLOUDFLARE else "dev (local SQLite)"
    logger.info(f"Starting Adaptive Handwriting Coach — mode={mode}, model={GEMINI_MODEL}")
    logger.info(f"Gemini={'configured' if GEMINI_API_KEY else 'NOT SET'}, R2={'configured' if r2_client else 'dev mode'}")
    logger.info(f"CORS origins: {ALLOWED_ORIGINS}")
