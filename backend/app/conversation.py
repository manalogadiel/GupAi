"""Evidence-backed customer brief and JSON reply streaming; no network or database I/O."""
import json

FIELDS=('problem_detail','occasion','desired_cut','preferences','desired_impression','change_level','styling_minutes','maintenance_preference','dress_rules','inspiration')
VERBATIM=('problem_detail','preferences','dress_rules','maintenance_preference','inspiration')
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
    """Kuya Gup's interview agenda: problem, occasion, cut, look (dating), keep/avoid, routine. Then the scan."""
    if not problems and not brief.get('problem_detail'): return 'problem'
    if not brief.get('occasion'): return 'occasion'
    if not brief.get('desired_cut'): return 'desired_cut'
    if not brief.get('desired_impression'): return 'desired_impression'
    if not brief.get('preferences'): return 'keep_avoid'
    if brief.get('styling_minutes') is None and not brief.get('maintenance_preference'): return 'styling_minutes'
    return 'done'

def interview_complete(brief, problems):
    return next_slot(brief, problems)=='done'

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


def _cut_pattern():
    """Every catalog cut name, plus everyday words, longest first so 'low fade' beats 'fade'."""
    import re
    from pathlib import Path
    parts=json.loads((Path(__file__).resolve().parents[2]/'knowledge/parts.json').read_text(encoding='utf-8-sig'))
    names={o['id'].replace('_',' ') for g in parts.values() for o in g}
    names|={re.sub(r"\s*\(.*\)","",o['name']).casefold() for g in parts.values() for o in g}
    names|={'fade','kalbo','semi-kalbo','crew cut','mohawk','mullet'}
    return r"\b(?:"+"|".join(re.escape(n) for n in sorted(names,key=len,reverse=True))+r")\b"
CUT_PATTERN=_cut_pattern()

NUMBER_WORDS={'isang':1,'dalawang':2,'tatlong':3,'apat na':4,'limang':5,'anim na':6,'pitong':7,'walong':8,'siyam na':9,
              'sampung':10,'labing-limang':15,'labinlimang':15,'dalawampung':20,'tatlumpung':30}

def explicit_brief_updates(turns):
    """Recover stated facts only, never map an occasion to a haircut."""
    import re
    updates=[]
    for turn in turns:
        if turn.get('speaker')!='customer': continue
        text=turn['text']
        if re.search(r"\bwala(?:ng| naman)?\s+(?:naman\s+)?problema",text,re.I):
            updates.append({'field':'problem_detail','value':'wala','source_text':'wala'})
        for match in re.finditer(r"\b(school|eskwela|work|trabaho|opisina|birthday|kasal|party|date|graduation|interview|everyday|araw-araw)\b",text,re.I):
            before=text[max(0,match.start()-25):match.start()].casefold()
            if re.search(r"(?:hindi|not|ayaw|no)\b[^.!?]*$",before): continue
            updates.append({'field':'occasion','value':match.group().casefold(),'source_text':match.group()})
        for match in re.finditer(r"\b(\d{1,2})\s*(?:minutes?|mins?|minuto)\b",text,re.I):
            updates.append({'field':'styling_minutes','value':int(match.group(1)),'source_text':match.group()})
        # Voice transcripts spell numbers out ("limang minuto"), so read Tagalog number words too.
        match=re.search(r"\b("+"|".join(NUMBER_WORDS)+r")\s+minuto\b|\bkalahating oras\b",text,re.I)
        if match:
            value=30 if match.group(1) is None else NUMBER_WORDS[match.group(1).casefold()]
            updates.append({'field':'styling_minutes','value':value,'source_text':match.group()})
        if re.search(r"\b(?:hilamos lang|hindi ako nag-?aayos|walang ayos)\b",text,re.I):
            phrase=re.search(r"hilamos lang|hindi ako nag-?aayos|walang ayos",text,re.I).group()
            updates.append({'field':'styling_minutes','value':0,'source_text':phrase})
        cuts=[m.group() for m in re.finditer(CUT_PATTERN,text,re.I)]
        if cuts:
            updates.append({'field':'desired_cut','value':', '.join(dict.fromkeys(c.casefold() for c in cuts)),'source_text':cuts[0]})
        elif re.search(r"\b(?:bahala (?:ka|na)|ikaw na(?:ng)? bahala|kahit ano|wala pa(?:ng)? (?:naiisip|plano))",text,re.I):
            phrase=re.search(r"bahala (?:ka|na)|ikaw na(?:ng)? bahala|kahit ano|wala pa(?:ng)? (?:naiisip|plano)",text,re.I).group()
            updates.append({'field':'desired_cut','value':'bahala si Kuya Gup','source_text':phrase})
        match=re.search(r"(?:gusto ko|want(?: a)?)\s+(?:na\s+)?([^.!?,]{1,60}?)\s+(?:look|tingnan|dating)\b",text,re.I)
        if match: updates.append({'field':'desired_impression','value':match.group(1).strip(),'source_text':match.group()})
    latest={update['field']:update for update in updates}
    return validate_brief_updates(list(latest.values()),turns)
