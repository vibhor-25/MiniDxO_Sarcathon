# prompts.py
def QUESTIONER_PROMPT(symptoms, history):
    return f"""
You are Questioner. Goal: propose at most one follow-up question that will reduce diagnostic uncertainty.
Inputs:
- Symptoms: {symptoms}
- Q&A history: {history} (list of {{'q','a'}})

Output only JSON with keys:
{{
 "follow_up": <string|null>,        // one question to ask user, or null if no follow-up needed
 "rationale": <string>             // 1-2 sentence reason why this reduces uncertainty
}}
Be concise and factual. Return JSON only.
"""

def DIAGNOSER_PROMPT(symptoms, history, top_candidates):
    return f"""
You are Diagnoser.
Inputs:
- Symptoms: {symptoms}
- Q&A history: {history}
- Candidate diagnoses: {top_candidates}

Task: Update probabilities for each candidate and pick top diagnosis.
Output only JSON with keys:
{{
 "top_diagnosis": "<string>",
 "confidence": <number between 0 and 1>,
 "reasoning": ["short step 1", "short step 2", "short step 3"]
}}
Make reasoning very short (<=20 words each). Use the inputs; do not invent new symptoms. Return JSON only.
"""

def VERIFY_PROMPT(diagnosis, evidence_snippets):
    # evidence_snippets: list of dicts with text/title/source/url
    return f"""
You are EvidenceVerifier.
Inputs:
- Diagnosis: "{diagnosis}"
- Evidence snippets: {evidence_snippets}

Task: For the diagnosis above, output only JSON:
{{
 "support_score": <number 0-1>,     // how well the snippets support the diagnosis
 "supporting_quote": "<short excerpt maximum 25 words>"
}}
Be precise and do not hallucinate. Return JSON only.
"""
