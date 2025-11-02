# server.py
"""
Robust medical chatbot backend (Flask) using Anthropic Claude + local embeddings for retrieval.
Features:
- Semantic symptom extraction (sentence-transformers)
- Dynamic candidate generation from disease_symptom.csv (fallback map)
- Evidence retrieval (snippets.json) using local embeddings
- Emergency detection: keyword + semantic check (Claude)
- Role-based prompts: Questioner, Diagnoser, Verifier
- Structured JSON responses: follow_up, diagnosis, emergency, general
"""

import os
import json
import re
import time
import math
from pathlib import Path
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
from sentence_transformers import SentenceTransformer, util

# Anthropic SDK
from anthropic import Anthropic

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
if not ANTHROPIC_API_KEY:
    raise SystemExit("Missing ANTHROPIC_API_KEY in .env")

# Configure / tune these
MODEL_CANDIDATES = [
    "claude-3-5-sonnet-latest",
    "claude-3-5-sonnet-20241022",
    "claude-3-sonnet-20240229",
    "claude-3-haiku-20240307",
    "claude-4-sonnet"
]
# If your key supports a specific model, it will be auto-selected at runtime.

# Filepaths
SNIPPETS_FILE = Path("snippets.json")
SNIPPETS_INDEX_FILE = Path("snippets_index.json")
DISEASE_CSV = Path("disease_symptom.csv")

# Embedding model (local, free)
EMBED_MODEL_NAME = "all-MiniLM-L6-v2"  # small & good for semantic match

# Emergency keyword list (exact phrases)
EMERGENCY_KEYWORDS = [
    "shortness of breath", "severe chest pain", "unconscious", "passing out",
    "loss of consciousness", "severe bleeding", "unable to breathe",
    "blue lips", "seizure", "not breathing", "stroke", "losing consciousness",
    "very faint", "collapse"
]

# Small-talk / greetings detection
GREETINGS_RE = re.compile(r"\b(hi|hello|hey|good morning|good evening|greetings)\b", re.I)
SMALLTALK_RE = re.compile(r"\b(thanks?|thank you|how are you|what's up|sup)\b", re.I)

# Thresholds & constants
SYMPTOM_SIM_THRESHOLD = 0.55   # similarity threshold to consider a symptom present
TOP_SYMPTOM_MATCHES = 6
TOP_SNIPPETS = 3

# Initialize libs
print("Loading SentenceTransformer model:", EMBED_MODEL_NAME)
embed_model = SentenceTransformer(EMBED_MODEL_NAME)

print("Initializing Anthropic client")
anthropic_client = Anthropic(api_key=ANTHROPIC_API_KEY)

app = Flask(__name__)
CORS(app)

# -------------------------
# Utilities
# -------------------------
def cosine_sim(a, b):
    return float(util.cos_sim(a.astype(np.float32), b.astype(np.float32)).item())


def robust_json_parse(s):
    """Try to parse JSON from a model response. Attempts to extract {...} substring."""
    if not isinstance(s, str):
        raise ValueError("Expected string from model")
    s = s.strip()
    # try direct
    try:
        return json.loads(s)
    except Exception:
        # find first JSON-like substring
        m = re.search(r"(\{[\s\S]*\})", s)
        if m:
            try:
                return json.loads(m.group(1))
            except Exception:
                pass
        # try replacing single quotes -> double (best-effort)
        try:
            return json.loads(s.replace("'", '"'))
        except Exception as e:
            raise ValueError("Failed to parse JSON from model output: " + str(e))

def try_models_call(prompt, max_tokens=700, temperature=0.2):
    """
    Call Claude and guarantee a clean JSON string back.
    """
    last_err = None
    for model in MODEL_CANDIDATES:
        try:
            resp = anthropic_client.messages.create(
                model=model,
                messages=[{"role": "user", "content": prompt + "\n\nRespond ONLY with valid JSON. No commentary, no markdown, nothing outside the JSON braces."}],
                max_tokens=max_tokens,
                temperature=temperature
            )
            text = ""
            try:
                text = resp.content[0].text
            except Exception:
                text = str(resp)
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end != -1 and end > start:
                text = text[start:end+1]
            return text
        except Exception as e:
            last_err = e
            continue
    raise RuntimeError(f"All Claude models failed. Last error: {last_err}")


# -------------------------
# Load / index snippets (RAG)
# -------------------------
def load_snippets_and_index():
    if not SNIPPETS_FILE.exists():
        print("Warning: snippets.json not found. Retrieval disabled.")
        return [], None
    with open(SNIPPETS_FILE, "r", encoding="utf8") as f:
        snippets = json.load(f)
    # If index exists, load embeddings
    if SNIPPETS_INDEX_FILE.exists():
        try:
            with open(SNIPPETS_INDEX_FILE, "r", encoding="utf8") as f:
                indexed = json.load(f)
            # confirm embeddings exist
            if indexed and "embedding" in indexed[0]:
                print("Loaded existing snippets_index.json")
                # convert to numpy arrays for speed
                for s in indexed:
                    s["embedding"] = np.array(s["embedding"], dtype=float)
                return indexed, embed_model
        except Exception:
            pass
    # otherwise compute embeddings
    print("Computing embeddings for snippets (this may take a bit)...")
    out = []
    texts = [s.get("text","") for s in snippets]
    embs = embed_model.encode(texts, show_progress_bar=True, convert_to_numpy=True)
    for s, emb in zip(snippets, embs):
        ss = s.copy()
        ss["embedding"] = emb.tolist()
        out.append(ss)
    with open(SNIPPETS_INDEX_FILE, "w", encoding="utf8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    # convert embedding back to numpy for runtime use
    for s in out:
        s["embedding"] = np.array(s["embedding"], dtype=float)
    print("Wrote", SNIPPETS_INDEX_FILE)
    return out, embed_model

SNIPPETS_INDEX, _emb_model = load_snippets_and_index()

# -------------------------
# Load disease-symptom mapping
# -------------------------
def load_disease_symptom_csv():
    if DISEASE_CSV.exists():
        try:
            import pandas as pd
            df = pd.read_csv(DISEASE_CSV)
            # Normalize columns
            if 'disease' in df.columns and 'symptom' in df.columns:
                df = df[['disease','symptom']].dropna()
                # lowercase normalized symptom strings
                df['symptom_norm'] = df['symptom'].astype(str).str.lower()
                print(f"Loaded disease_symptom.csv with {len(df)} rows")
                return df
        except Exception as e:
            print("Failed to load disease_symptom.csv:", e)
    # Fallback small map
    print("Using fallback candidate_map")
    import pandas as pd
    rows = [
        ("Common cold", "runny nose"),
        ("Common cold", "sore throat"),
        ("Influenza", "fever"),
        ("Strep throat", "white patches"),
        ("Strep throat", "sore throat"),
        ("Gastroenteritis", "diarrhea"),
        ("Gastroenteritis", "vomiting"),
        ("Bleeding disorder", "severe bleeding"),
        ("MI (heart attack)", "chest pain")
    ]
    df = pd.DataFrame(rows, columns=["disease","symptom"])
    df['symptom_norm'] = df['symptom'].astype(str).str.lower()
    return df

DISEASE_DF = load_disease_symptom_csv()
# build unique symptom list for semantic matching
SYMPTOM_VOCAB = sorted(list(set(DISEASE_DF['symptom_norm'].tolist())))
print("Symptom vocab size:", len(SYMPTOM_VOCAB))
SYMPTOM_EMBS = embed_model.encode(SYMPTOM_VOCAB, convert_to_numpy=True)

# -------------------------
# Semantic symptom extraction
# -------------------------
def extract_symptoms_semantic(history_text, current_message):
    """
    Use semantic similarity between user message and known symptom vocabulary.
    Returns list of matched symptom strings (normalized).
    """
    combined = (history_text + " " + current_message).strip()
    if not combined:
        return []
    q_emb = embed_model.encode(combined, convert_to_numpy=True)
    sims = util.cos_sim(q_emb, SYMPTOM_EMBS).cpu().numpy()[0]  # shape (vocab,)
    matches = []
    for idx, score in enumerate(sims):
        if score >= SYMPTOM_SIM_THRESHOLD:
            matches.append((SYMPTOM_VOCAB[idx], float(score)))
    # Sort by score desc, return unique symptom names
    matches.sort(key=lambda x: -x[1])
    return [m[0] for m in matches[:TOP_SYMPTOM_MATCHES]]

# -------------------------
# Candidate generation
# -------------------------
def get_candidate_diseases(symptoms):
    if not symptoms:
        # fallback: top frequent diseases or common things
        return list(DISEASE_DF['disease'].value_counts().head(6).index)
    # find rows matching any symptom
    matches = DISEASE_DF[DISEASE_DF['symptom_norm'].isin(symptoms)]
    if matches.empty:
        # fallback broad list
        return list(DISEASE_DF['disease'].value_counts().head(6).index)
    # rank diseases by number of matching symptoms
    ranked = matches['disease'].value_counts().index.tolist()
    return ranked[:12]


def retrieve_top_snippets(query, k=TOP_SNIPPETS):
    if not SNIPPETS_INDEX:
        return []
    q_emb = embed_model.encode(query, convert_to_numpy=True)
    scored = []
    for s in SNIPPETS_INDEX:
        score = cosine_sim(q_emb, s["embedding"])
        scored.append((score, s))
    scored.sort(key=lambda x: -x[0])
    top = [ {"id": s["id"], "title": s.get("title",""), "source": s.get("source",""), "url": s.get("url",""), "text": s.get("text",""), "score": float(score)} for score,s in scored[:k] ]
    return top

# -------------------------
# Prompts (role templates)
# -------------------------
def questioner_prompt(symptoms, history, candidates, evidence_snips):
    """Return a JSON-only prompt asking for at most one follow-up question."""
    hist_text = json.dumps(history, ensure_ascii=False)
    cand_text = ", ".join(candidates) if candidates else "None"
    evidence_text = "\n".join([f"- {s['source']}: {s['text'][:200]}" for s in evidence_snips]) if evidence_snips else ""
    p = f"""
You are a cautious medical assistant whose job is to ask AT MOST ONE clarifying question that will most reduce diagnostic uncertainty.
Respond with JSON ONLY.

Inputs:
- Symptoms (normalized): {json.dumps(symptoms)}
- Candidate diagnoses: {cand_text}
- Conversation history: {hist_text}
- Evidence snippets: {evidence_text}

Rules:
1) If the input is a greeting or small talk, return:
   {{ "type":"general", "assistant_text":"Hi! Please describe your symptoms so I can help." }}
2) If you need to ask a clarifying medical question, output:
   {{ "follow_up": "<one concise question>", "rationale": "<1 short sentence why>" }}
3) If no follow-up is needed and you have insufficient info, prefer asking one clarification.
4) Do NOT attempt to diagnose here; only propose a question or return null.
Output example:
{{"follow_up":"Do you have white patches on your tonsils?","rationale":"White patches suggest bacterial strep."}}
"""
    return p

def diagnoser_prompt(symptoms, history, candidates, evidence_snips):
    hist_text = json.dumps(history, ensure_ascii=False)
    cand_text = ", ".join(candidates)
    evidence_text = "\n".join([f"- {s['source']}: {s['text'][:300]}" for s in evidence_snips]) if evidence_snips else ""
    p = f"""
You are a careful medical diagnostician. Output JSON ONLY.

Inputs:
- Symptoms (normalized): {json.dumps(symptoms)}
- Candidate diagnoses: {cand_text}
- Conversation history: {hist_text}
- Evidence snippets (trusted sources): {evidence_text}

Task:
1) Return top diagnosis, numeric confidence (0-1), and 2-4 short reasoning steps (<=20 words each).
2) If symptoms are ambiguous or you need more info, return {{ "need_more_info": true, "questions":[... ] }} instead of a diagnosis.
3) If the input is a greeting or unrelated, return {{ "type":"general", "assistant_text":"Please describe symptoms." }}
4) If you detect an emergency, return {{ "type":"emergency", "assistant_text":"..." }}

Output schema example:
{{ "top_diagnosis":"Strep throat", "confidence":0.82, "reasoning":["Fever and sore throat","White patches indicate bacterial"], "notes":"" }}
"""
    return p

def verifier_prompt(diagnosis, evidence_snips):
    evidence_text = "\n".join([f"- {s['source']}: {s['text'][:300]}" for s in evidence_snips]) if evidence_snips else ""
    p = f"""
You are EvidenceVerifier. Inputs:
- Diagnosis: "{diagnosis}"
- Evidence snippets: {evidence_text}

Task:
Return JSON only: {{ "support_score": <0-1>, "supporting_quote": "<short quote (<=25 words) from snippets or empty>" }}
Be conservative; if no snippet supports the claim, return support_score: 0 and supporting_quote:"".
"""
    return p

# -------------------------
# Emergency semantic check using Claude
# -------------------------
def semantic_emergency_check(message):
    check_prompt = f"""
You are a triage classifier. Classify the following message as EXACTLY one of: EMERGENCY or NORMAL.
Message: \"{message}\"

If the message indicates immediate life-threatening signs (e.g., can't breathe, heavy uncontrolled bleeding, chest pain with fainting), reply only with EMERGENCY. Otherwise reply ONLY NORMAL.
"""
    try:
        out = try_models_call(check_prompt, max_tokens=80)
        if out:
            if "EMERGENCY" in out.upper():
                return True
            return False
    except Exception:
        # on error, be conservative: if any keyword found, treat as emergency; else False
        return False
    return False

# -------------------------
# Greeting / general detection
# -------------------------
def is_greeting_or_smalltalk(message):
    if GREETINGS_RE.search(message) or SMALLTALK_RE.search(message):
        return True
    return False

# -------------------------
# Main endpoint
# -------------------------
@app.route("/api/message", methods=["POST"])
def handle_message():
    try:
        payload = request.get_json(force=True)
        message = (payload.get("message") or "").strip()
        history = payload.get("history", []) or []
        answered_follow_up = bool(payload.get("answered_follow_up", False))

        # quick sanitization
        if not isinstance(history, list):
            history = []

        # 0) Greeting / small talk
        if is_greeting_or_smalltalk(message) and not any(h.get("role")=="assistant" for h in history):
            return jsonify({
                "type": "general",
                "assistant_text": "Hi! Please describe your symptoms briefly (example: 'sore throat and fever for 2 days')."
            })

        # 1) Emergency detection (keywords)
        lowmsg = message.lower()
        for kw in EMERGENCY_KEYWORDS:
            if kw in lowmsg:
                # confirm with semantic check for fuzzier phrases
                return jsonify({
                    "type": "emergency",
                    "assistant_text": "Detected possible emergency sign (keyword). Please seek immediate medical attention (call emergency services).",
                    "reasoning": []
                })

        # 1b) Emergency semantic check (catch phrases like 'bleeding a lot', 'losing blood fast')
        try:
            sem_em = semantic_emergency_check(message)
        except Exception:
            sem_em = False
        if sem_em:
            return jsonify({
                "type": "emergency",
                "assistant_text": "Detected possible emergency by semantic triage. This system is not a substitute for emergency care — please seek immediate help.",
                "reasoning": []
            })

        # 2) Extract symptoms semantically using the symptom vocab
        hist_user_text = " ".join([h.get("text","") for h in history if h.get("role")=="user"])
        symptoms = extract_symptoms_semantic(hist_user_text, message)

        # 3) Candidate diseases (dynamic)
        candidates = get_candidate_diseases(symptoms)

        # 4) Evidence retrieval (RAG) — use top snippets for diagnosis & questioner
        retrieval_query = message + " " + " ".join(symptoms)
        top_snips = retrieve_top_snippets(retrieval_query, k=TOP_SNIPPETS)

        # 5) If not answered_follow_up: run Questioner role
        if not answered_follow_up:
            q_prompt = questioner_prompt(symptoms, history, candidates, top_snips)
            try:
                q_raw = try_models_call(q_prompt, max_tokens=300, temperature=0.0)
                try:
                    q_json = robust_json_parse(q_raw)
                except Exception:
                    print("Claude invalid JSON:", q_raw)
                    q_json = {}

            except Exception:
                # fallback conservative follow-up
                q_json = {"follow_up": "How long have you had these symptoms?", "rationale": "Duration helps refine probable causes."}
            # If questioner returned general message
            if q_json.get("type") == "general":
                return jsonify({"type":"general", "assistant_text": q_json.get("assistant_text","Please describe symptoms.")})
            follow_up = q_json.get("follow_up")
            if follow_up:
                return jsonify({
                    "type": "follow_up",
                    "assistant_text": follow_up,
                    "rationale": q_json.get("rationale","")
                })
            # else fall through to diagnoser (if questioner returned null)

        # 6) Diagnoser role (we are either answering follow-up or questioner returned no follow-up)
        d_prompt = diagnoser_prompt(symptoms, history, candidates, top_snips)
        try:
            d_raw = try_models_call(d_prompt, max_tokens=500, temperature=0.0)
            d_json = robust_json_parse(d_raw)
        except Exception:
            d_json = {"top_diagnosis": "Uncertain", "confidence": 0.0, "reasoning": ["Could not parse model output."]}

        # If diagnoser says need_more_info
        if d_json.get("need_more_info"):
            return jsonify({
                "type": "follow_up",
                "assistant_text": "I need more information. " + (" ".join(d_json.get("questions", ["How long have you had symptoms?"]))),
                "rationale": "More details required to narrow diagnosis."
            })

        # If diagnoser returned general or emergency
        if d_json.get("type") == "general":
            return jsonify({"type":"general","assistant_text": d_json.get("assistant_text","Please describe symptoms.")})
        if d_json.get("type") == "emergency":
            return jsonify({"type":"emergency","assistant_text": d_json.get("assistant_text","Seek emergency care."), "reasoning": []})

        top_diag = d_json.get("top_diagnosis", "Uncertain")
        confidence = float(d_json.get("confidence", 0.0))
        reasoning = d_json.get("reasoning", []) or []

        # 7) Evidence verifier
        v_prompt = verifier_prompt(top_diag, top_snips)
        try:
            v_raw = try_models_call(v_prompt, max_tokens=180, temperature=0.0)
            v_json = robust_json_parse(v_raw)
        except Exception:
            v_json = {"support_score": 0.0, "supporting_quote": ""}

        # 8) Compose final assistant text
        assistant_text = f"Probable diagnosis: {top_diag}. Confidence: {round(confidence,2)}.\n\nShort reasoning:\n"
        if reasoning:
            assistant_text += "\n".join([f"{i+1}. {r}" for i, r in enumerate(reasoning)])
        else:
            assistant_text += "I need more information to be certain."

        citations = [{"source": s["source"], "url": s.get("url",""), "excerpt": s["text"][:240], "score": s["score"]} for s in top_snips]

        return jsonify({
            "type": "diagnosis",
            "assistant_text": assistant_text,
            "reasoning": reasoning,
            "diagnosis": top_diag,
            "confidence": confidence,
            "citations": citations,
            "verifier": v_json
        })

    except Exception as e:
        # Always return JSON to frontend to avoid crashes
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    print("Starting enhanced Flask medical AI backend on port 4000")
    app.run(host="0.0.0.0", port=4000, debug=True)
