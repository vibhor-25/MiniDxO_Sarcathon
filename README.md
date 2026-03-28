# MiniDxO (Sarcathon)

MiniDxO is a hackathon project that combines a **medical-chat backend** with a **React/Vite frontend** to provide an interactive “mini DxO”-style experience.

## Repo structure
- `backend-medchat/` — Flask-based backend (AI/ML + API)
- `final/frontend/` — Vite + React + TypeScript UI (shadcn/ui + Tailwind ecosystem)
- `MiniDxo presentation.pdf` — project deck / explanation

## Tech stack
- **Backend:** Python, Flask, Flask-CORS, python-dotenv  
  (plus ML/LLM-related deps like `sentence-transformers`, `torch`, etc.)
- **Frontend:** Vite, React, TypeScript, React Router, TanStack Query, Supabase client, Radix UI components

## Quick start

### Backend
```bash
cd backend-medchat
python -m venv .venv
source .venv/bin/activate   # (Windows: .venv\Scripts\activate)
pip install -r requirements.txt
python app.py  
