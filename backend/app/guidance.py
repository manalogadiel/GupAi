"""Small offline topic retrieval; no extra model or runtime browsing."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def retrieve_guidance(brief, problems, part):
    records=json.loads((ROOT/'knowledge/consultation_guidance.json').read_text(encoding='utf-8'))
    terms=set(problems)
    for key,value in (brief or {}).items():
        if value and key!='evidence': terms.add(key); terms.update(str(value).casefold().split())
    ranked=sorted(records,key=lambda r: -sum(topic in terms for topic in r['topics']))
    return ranked[:4]
