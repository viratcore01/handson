# Adaptive Handwriting Coach

**Phone-camera photo → Gemini AI scores → targeted practice → progress tracking.**

A full-stack MVP for scoring handwriting worksheets and generating matched practice sheets. Students scan worksheets, get AI-powered analysis, practice targeted weaknesses, and track progress over time. Teachers see class heatmaps and can override scores. Parents get plain-language reports.

---

## Live Demo Flow

```
Student scans worksheet
  → Gemini AI analyzes handwriting
  → Detects weakest skill (alignment/spacing/curves)
  → Recommends matching exercise + worksheet
  → Stores results in Cloudflare D1
  → Teacher reviews heatmap, overrides scores if needed
  → Parent downloads PDF progress report
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + Vite + Tailwind CSS + Recharts |
| **Backend** | FastAPI (Python) |
| **AI** | Google Gemini (dual-endpoint: Interactions API + legacy) |
| **Database** | Cloudflare D1 (or local SQLite in dev) |
| **Storage** | Cloudflare R2 (or data-URL placeholders in dev) |
| **PDF** | ReportLab |

---

## Quick Start (Development — No Cloudflare Needed)

### Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **A Google Gemini API key** (free tier available)

### Step 1: Clone the Repository

```bash
git clone https://github.com/NoOneOwO/handwriting.git
cd handwriting
```

### Step 2: Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv

# Windows:
.venv\Scripts\activate

# Mac/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create your environment file
cp .env.example .env
```

### Step 3: Get Your Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Click **"Create API key"**
3. Copy the key

### Step 4: Configure `.env`

Edit `backend/.env` and paste your Gemini key:

```env
# REQUIRED — paste your Gemini API key here:
GEMINI_API_KEY=your-google-gemini-api-key

# Everything else can stay as-is for dev mode:
GEMINI_MODEL=gemini-2.5-flash
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_D1_DATABASE_ID=
CLOUDFLARE_R2_BUCKET=
CF_R2_ACCESS_KEY_ID=
CF_R2_SECRET_ACCESS_KEY=
FRONTEND_URL=http://localhost:5173
```

### Step 5: Start the Backend

```bash
uvicorn main:app --reload --port 8000
```

You should see:
```
Starting Adaptive Handwriting Coach — mode=dev (local SQLite), model=gemini-2.5-flash
Gemini=configured, R2=dev mode
SQLite dev database initialized
```

### Step 6: Frontend Setup (New Terminal)

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

### Step 7: Open the App

Go to **http://localhost:3000** in your browser.

- Select **Student** → Practice and scan worksheets
- Select **Teacher** → View class heatmap and override scores  
- Select **Parent** → View progress summary and download PDF report

---

## Full Setup with Cloudflare (Production)

If you want real data persistence, follow these additional steps:

### Step A: Create Cloudflare Account

1. Sign up at [cloudflare.com](https://cloudflare.com) (free tier works)
2. Install Wrangler CLI:
   ```bash
   npm install -g wrangler
   wrangler login
   ```

### Step B: Create D1 Database

```bash
wrangler d1 create handwriting-db
```

Copy the `database_id` from the output.

### Step C: Create R2 Bucket

```bash
wrangler r2 bucket create handwriting-r2
```

### Step D: Run the Migration

```bash
wrangler d1 execute handwriting-db --file=./backend/migrations/0001_initial.sql
```

This creates all 9 tables and seeds 4 demo students + 10 exercises.

### Step E: Create Cloudflare API Token

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **My Profile** → **API Tokens**
2. Click **"Create Token"**
3. Use the **"Edit Cloudflare Workers"** template, or create custom with:
   - **Account** → **D1** → **Read** and **Edit**
   - **Account** → **R2** → **Read** and **Edit**
4. Copy the token → set as `CLOUDFLARE_API_TOKEN` in `.env`

### Step F: Create R2 API Token

1. Go to **R2** → **Manage R2 API Tokens** → **Create API Token**
2. Permissions: **Object Read & Write** for the `handwriting-r2` bucket
3. Copy the **Access Key ID** → set as `CF_R2_ACCESS_KEY_ID`
4. Copy the **Secret Access Key** → set as `CF_R2_SECRET_ACCESS_KEY` (shown only once!)

### Step G: Enable R2 Public Access

1. Go to **R2** → **Settings** → **Public Access**
2. Enable the `r2.dev` subdomain

### Step H: Update `.env`

```env
GEMINI_API_KEY=your-google-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash

CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token
CLOUDFLARE_D1_DATABASE_ID=your-d1-database-id

CLOUDFLARE_R2_BUCKET=handwriting-r2
CF_R2_ACCESS_KEY_ID=your-r2-access-key
CF_R2_SECRET_ACCESS_KEY=your-r2-secret-key

FRONTEND_URL=http://localhost:5173
```

### Step I: Restart the Backend

```bash
uvicorn main:app --reload --port 8000
```

You should now see:
```
Starting Adaptive Handwriting Coach — mode=cloudflare, model=gemini-2.5-flash
Gemini=configured, R2=configured
```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | **Yes** | Google Gemini API key ([get one here](https://aistudio.google.com/apikey)) |
| `GEMINI_MODEL` | No | Model name (default: `gemini-2.5-flash`) |
| `CLOUDFLARE_ACCOUNT_ID` | For production | Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | For production | Cloudflare API token with D1+R2 permissions |
| `CLOUDFLARE_D1_DATABASE_ID` | For production | D1 database ID from `wrangler d1 create` |
| `CLOUDFLARE_R2_BUCKET` | For production | R2 bucket name |
| `CF_R2_ACCESS_KEY_ID` | For production | R2 S3-compatible access key |
| `CF_R2_SECRET_ACCESS_KEY` | For production | R2 S3-compatible secret key |
| `FRONTEND_URL` | No | Frontend origin for CORS (default: `http://localhost:5173`) |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins |

---

## Project Structure

```
handwriting/
├── backend/
│   ├── main.py                    # FastAPI app (all endpoints)
│   ├── requirements.txt           # Python dependencies
│   ├── .env.example               # Environment template
│   ├── wrangler.toml              # Cloudflare D1/R2 binding config
│   └── migrations/
│       └── 0001_initial.sql       # D1 schema + seed data + indexes
├── frontend/
│   ├── src/
│   │   ├── App.jsx                # Router + API base
│   │   ├── services/api.js        # Centralized API client
│   │   ├── pages/
│   │   │   ├── Welcome.jsx        # Role selector
│   │   │   ├── StudentHome.jsx    # Student dashboard
│   │   │   ├── Scan.jsx           # Camera capture → upload
│   │   │   ├── Results.jsx        # AI scores + weakness → practice
│   │   │   ├── Practice.jsx       # Worksheet viewer + download
│   │   │   ├── Games.jsx          # 5 live tracing games
│   │   │   ├── Progress.jsx       # Recharts line chart
│   │   │   ├── TeacherDashboard.jsx # Heatmap + weaknesses
│   │   │   ├── StudentProfile.jsx # Scans + overrides
│   │   │   └── ParentView.jsx     # Report + PDF download
│   │   └── index.css              # Tailwind + design tokens
│   ├── package.json
│   ├── vite.config.js             # Dev proxy to backend
│   └── tailwind.config.js         # Design system
├── render.yaml                    # Render deployment config
├── vercel.json                    # Vercel routing config
└── README.md
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check (DB, Gemini, R2 status) |
| `GET` | `/api/students` | List all students |
| `GET` | `/api/students/{id}` | Get student by ID |
| `GET` | `/api/students/{id}/scans` | Scan history for student |
| `GET` | `/api/students/{id}/report` | JSON progress report |
| `GET` | `/api/students/{id}/report/pdf` | Download PDF report |
| `GET` | `/api/students/{id}/exercise-results` | Exercise history |
| `POST` | `/api/scans` | Upload image → Gemini analysis → store |
| `GET` | `/api/scans/{id}` | Get scan with recommendations |
| `PATCH` | `/api/scans/{id}` | Teacher override scores |
| `GET` | `/api/classes/{id}/heatmap` | Class heatmap + common weaknesses |
| `GET` | `/api/worksheets/{skill}` | Get worksheet URL |
| `POST` | `/api/worksheets/generate` | Generate worksheet entry |
| `POST` | `/api/reports/generate` | Generate PDF report → R2 |
| `POST` | `/api/exercise-results` | Save exercise tracing result |

---

## D1 Database Schema

9 tables created by `0001_initial.sql`:

| Table | Purpose |
|-------|---------|
| `classrooms` | Class groups with teacher names |
| `students` | Individual students (seeded: 4 demo students) |
| `scans` | Uploaded images + Gemini analysis scores |
| `exercises` | Pattern/tracing exercise definitions (seeded: 10 exercises) |
| `exercise_results` | Student tracing/game outcomes with kinematics |
| `worksheets` | Generated/predefined worksheet PDFs |
| `teacher_overrides` | Manual score corrections |
| `progress` | Aggregated per-student progress snapshots |
| `reports` | Generated PDF reports stored in R2 |

---

## R2 Storage Structure

```
scans/
  {student_id}/{uuid}.jpg        # Uploaded worksheet images
worksheets/
  {skill}/{id}.pdf                # Practice worksheets
reports/
  {student_id}/{report_id}.pdf    # Generated progress reports
```

---

## Deployment

### Backend (Render)

The `render.yaml` is pre-configured:

1. Connect your GitHub repo to [Render](https://render.com)
2. Render auto-detects `render.yaml`
3. Add environment variables in Render dashboard
4. Backend URL will be something like `https://your-app.onrender.com`

### Frontend (Vercel)

The `vercel.json` proxies API calls to Render:

1. Connect your GitHub repo to [Vercel](https://vercel.com)
2. Set `VITE_API_URL` to your Render backend URL
3. Frontend deploys automatically

---

## Troubleshooting

### "No GEMINI_API_KEY — skipping AI analysis"
→ Set your Gemini key in `backend/.env`. Get one free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

### "DEV MODE — local SQLite, data-URL R2 placeholders"
→ Cloudflare env vars not set. This is normal for development. Data resets on restart.

### Scan shows 0/0/0 scores
→ Gemini API call failed. Check the backend logs for the specific error. Common causes: invalid API key, quota exceeded, network issues.

### Frontend can't connect to backend
→ Ensure backend is running on port 8000. The Vite dev server proxies `/api` → `http://localhost:8000`.

### "Failed to upload image"
→ In dev mode, images are stored as data-URLs (works fine). In production, check R2 credentials and bucket permissions.

---

## License

MIT
