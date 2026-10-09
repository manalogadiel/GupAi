"""Evidence-backed customer brief and JSON reply streaming; no network or database I/O."""
import json

FIELDS=('problem_detail','occasion','desired_impression','change_level','styling_minutes','maintenance_preference','dress_rules','inspiration')
VERBATIM=('problem_detail','dress_rules','maintenance_preference','inspiration')
def brief_defaults():
    return {**{field:None for field in FIELDS},'desired_impression':[],'evidence':[]}

def validate_brief_updates(updates, source_turns):
    valid=[]
    for update in updates[:5]:
        field=update.get('field'); quote=str(update.get('source_text','')).strip()
        source=next((t for t in reversed(source_turns) if t.get('speaker')=='customer' and quote and
                     quote.casefold() in t['text'].casefold()),None)
        if field not in FIELDS or source is None: continue
        value=update.get('value')
        if field in VERBATIM and (not isinstance(value,str) or value.strip().casefold() not in quote.casefold()): continue
        if field=='styling_minutes':
            try: value=int(value)
            except (ValueError,TypeError): continue
            if isinstance(update.get('value'),(bool,float)) or not 0<=value<=60: continue
        elif field=='desired_impression':
            value=[v.strip()[:60] for v in (value if isinstance(value,list) else str(value).split(',')) if str(v).strip()][:5]
        elif not isinstance(value,str) or not value.strip() or len(value)>120: continue
        elif field=='change_level' and value not in ('subtle','noticeable','bold'): continue
        valid.append({'field':field,'value':value,'source_text':quote[:160],
                      'speaker':'customer','contribution_id':source.get('id')})
    return valid

def next_slot(brief, problems):
    """Kuya Gup's interview agenda: problem, purpose, impression, routine, then keep/avoid."""
    if not problems and not brief.get('problem_detail'): return 'problem'
    if not brief.get('occasion'): return 'occasion'
    if not brief.get('desired_impression'): return 'desired_impression'
    if brief.get('styling_minutes') is None: return 'styling_minutes'
    return 'keep_avoid'

def merge_brief(brief, updates):
    out={**brief_defaults(),**(brief or {})}
    out['evidence']=list(out['evidence'])
    for update in updates:
        field=update['field']; out[field]=update['value']
        out['evidence']=[e for e in out['evidence'] if e['field']!=field]+[
            {k:update[k] for k in ('field','source_text','speaker','contribution_id')}]
    return out

def reply_prefix(buffer):
    """Decode only a top-level reply string, even with escaped Unicode or reordered keys."""
    decoder=json.JSONDecoder(); depth=0; i=0
    while i<len(buffer):
        char=buffer[i]
        if char=='"':
            try: key,end=decoder.raw_decode(buffer,i)
            except ValueError: return ''
            if depth==1 and key=='reply':
                j=end
                while j<len(buffer) and buffer[j].isspace(): j+=1
                if j>=len(buffer) or buffer[j]!=':': i=end; continue
                j+=1
                while j<len(buffer) and buffer[j].isspace(): j+=1
                if j>=len(buffer) or buffer[j]!='"': return ''
                try:
                    value,_=decoder.raw_decode(buffer,j)
                    return value if isinstance(value,str) else ''
                except ValueError:
                    partial=buffer[j+1:]
                    for trim in range(min(7,len(partial))+1):
                        candidate=partial[:len(partial)-trim] if trim else partial
                        try: return json.loads('"'+candidate+'"')
                        except ValueError: pass
                    return ''
            i=end; continue
        if char in '{[': depth+=1
        elif char in '}]': depth-=1
        i+=1
    return ''


def explicit_brief_updates(turns):
    """Recover stated facts only, never map an occasion to a haircut."""
    import re
    updates=[]
    for turn in turns:
        if turn.get('speaker')!='customer': continue
        text=turn['text']
        for match in re.finditer(r"\b(school|work|birthday|interview|everyday)\b",text,re.I):
            before=text[max(0,match.start()-25):match.start()].casefold()
            if re.search(r"(?:hindi|not|ayaw|no)\b[^.!?]*$",before): continue
            updates.append({'field':'occasion','value':match.group().casefold(),'source_text':match.group()})
        for match in re.finditer(r"\b(\d{1,2})\s*(?:minutes?|mins?|minuto)\b",text,re.I):
            updates.append({'field':'styling_minutes','value':int(match.group(1)),'source_text':match.group()})
        match=re.search(r"(?:gusto ko|want(?: a)?)\s+(?:na\s+)?([^.!?,]{1,60}?)\s+(?:look|tingnan|dating)\b",text,re.I)
        if match: updates.append({'field':'desired_impression','value':match.group(1).strip(),'source_text':match.group()})
    latest={update['field']:update for update in updates}
    return validate_brief_updates(list(latest.values()),turns)
