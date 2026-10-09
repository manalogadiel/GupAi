import json
import pytest
from backend.app import ai, consult
from backend.app.conversation import brief_defaults, validate_brief_updates, reply_prefix

def test_brief_updates_need_customer_source_and_valid_types():
    turns=[{'id':'a','speaker':'customer','text':'Birthday ko, bold look. May 10 minutes ako.'}]
    valid=validate_brief_updates([
        {'field':'occasion','value':'birthday','source_text':'Birthday ko'},
        {'field':'styling_minutes','value':10,'source_text':'10 minutes'},
        {'field':'dress_rules','value':'no fade','source_text':'school rules'},
        {'field':'change_level','value':'invented','source_text':'bold look'}],turns)
    assert [u['field'] for u in valid]==['occasion','styling_minutes']
    assert valid[0]['contribution_id']=='a'
    assert validate_brief_updates([{'field':'occasion','value':'birthday','source_text':'Birthday ko'}],
        [{'id':'b','speaker':'barber','text':'Birthday ko'}])==[]

@pytest.mark.parametrize('reply',['Hello \"friend\"?','May puyo ka?','Line\nnext?', 'Buhok \u2728?'])
def test_stream_decoder_handles_chunks_and_property_order(reply):
    payload=json.dumps({'updates':[], 'reply':reply},ensure_ascii=True)
    previous=''
    for i in range(1,len(payload)+1):
        text=reply_prefix(payload[:i])
        assert reply.startswith(text) and text.startswith(previous)
        previous=text
    assert previous==reply

def test_nested_reply_does_not_stream_as_customer_reply():
    assert reply_prefix('{"nested":{"reply":"bad"},"reply":"Good?"}')=='Good?'

def test_summary_no_longer_requires_separate_style_pick():
    state=consult.empty_state()
    state['sides']['choice']={'id':None,'custom':'Taper'}
    state['top']['choice']={'id':None,'custom':'Keep fringe'}
    consult.require_summary(state)

def test_reveal_accepts_unknown_shape():
    state={**consult.empty_state(),'stage':'goal','revision':0}
    result=consult.apply_contribution(state,{'kind':'stage','stage':'reveal'},0)
    assert result['stage']=='reveal'

def test_all_eligible_parts_reach_ai_with_customer_brief(monkeypatch):
    state=consult.empty_state(); state['brief']=brief_defaults()
    state['brief'].update(occasion='birthday',desired_impression=['bold'])
    seen=[]
    def fake(system,user,schema,**kwargs):
        seen.append(json.loads(user))
        return {'choices':[{'id':'quiff','evidence_index':0,'factor':'occasion'}]}
    monkeypatch.setattr(ai,'chat',fake)
    result=ai.suggest(state,'top')
    assert result['recommended_id']=='quiff'
    assert len(seen[0]['options'])==6
    assert seen[0]['brief']['occasion']=='birthday'
    assert 'birthday' in result['options'][0]['why']

def test_invalid_personalized_choice_is_an_error_not_fixed_ranking(monkeypatch):
    from backend.app.errors import APIError
    monkeypatch.setattr(ai,'chat',lambda *a,**kw:{'choices':[{'id':'invented','evidence_index':0,'factor':'occasion'}]})
    with pytest.raises(APIError): ai.suggest(consult.empty_state(),'sides')

def test_chat_only_calls_one_model_and_does_not_extract_again(monkeypatch):
    state=consult.empty_state(); state['chat']=[{'role':'customer','text':'Birthday ko.'}]
    monkeypatch.setattr(ai,'stream_json',lambda *a,**kw:{'reply':'Anong dating ang gusto mo?', 'brief_updates':[
        {'field':'occasion','value':'birthday','source_text':'Birthday ko'}],'proposed_changes':[]})
    monkeypatch.setattr(ai,'extract',lambda *a:pytest.fail('Second model extraction call'))
    result=ai.chat_reply(state,['Birthday ko.'],lambda piece:None)
    assert result['brief_updates'][0]['value']=='birthday'

def test_top_only_refinement_preserves_agreed_sides():
    state=consult.empty_state(); state['revision']=0
    state['sides']['choice']={'id':None,'custom':'Low taper'}
    result=consult.merge_job_result(state,'chat',{'reply':'Texture sa top, tama?','phase':'top',
        'brief_updates':[],'problems_detected':[],'proposed_changes':[
            {'field':'change','op':'add','value':'texture top','negated':False}]})
    assert result['sides']['choice']['custom']=='Low taper'
    assert 'texture top' in result['change']

def test_customer_correction_replaces_brief_without_guessing_rules():
    from backend.app.conversation import merge_brief
    brief=brief_defaults(); brief['occasion']='school'
    updates=validate_brief_updates([{'field':'occasion','value':'birthday','source_text':'Birthday pala'}],
        [{'id':'correction','speaker':'customer','text':'Birthday pala, hindi school.'}])
    result=merge_brief(brief,updates)
    assert result['occasion']=='birthday' and result['dress_rules'] is None
    assert result['evidence'][0]['contribution_id']=='correction'

def test_explicit_customer_facts_survive_model_omission():
    from backend.app.conversation import explicit_brief_updates
    turns=[{'id':'a','speaker':'customer','text':'Para sa work. Gusto ko clean professional look, 5 minutes lang mag-ayos.'}]
    values={u['field']:u['value'] for u in explicit_brief_updates(turns)}
    assert values['occasion']=='work' and values['styling_minutes']==5
    assert 'clean professional' in values['desired_impression']
    assert 'dress_rules' not in values

def test_negated_occasion_is_not_assigned_by_fallback():
    from backend.app.conversation import explicit_brief_updates
    values={u['field']:u['value'] for u in explicit_brief_updates([
        {'id':'a','speaker':'customer','text':'Hindi para sa school. Birthday pala.'}])}
    assert values['occasion']=='birthday'

def test_unwanted_puffy_sides_does_not_protect_sides_from_cutting():
    state=consult.empty_state(); state['avoid']=['puffy_sides']; state['keep']=['fringe']
    choices=ai.eligible_parts(ai.load_parts()['sides'],state)
    assert len(choices)==len(ai.load_parts()['sides'])
    assert all(o['id'] not in ('buzz','textured_crop') for o in ai.eligible_parts(ai.load_parts()['top'],state))

def test_latest_explicit_correction_survives_many_turns():
    from backend.app.conversation import explicit_brief_updates
    turns=[{'speaker':'customer','text':'For school, 5 minutes. I want a clean look.'}]*3
    turns.append({'speaker':'customer','text':'For birthday, 10 minutes. I want a bold look.'})
    values={u['field']:u['value'] for u in explicit_brief_updates(turns)}
    assert values['occasion']=='birthday' and values['styling_minutes']==10

def test_local_guidance_and_parts_reference_known_sources():
    from pathlib import Path
    root=Path(__file__).resolve().parents[2]
    sources={s['id'] for s in json.loads((root/'knowledge/sources.json').read_text())}
    guidance=json.loads((root/'knowledge/consultation_guidance.json').read_text())
    for record in guidance + ai.load_parts()['sides'] + ai.load_parts()['top']:
        assert record['source_ids'] and set(record['source_ids']) <= sources

def test_occasion_quote_cannot_invent_a_dress_policy():
    assert validate_brief_updates([{'field':'dress_rules','value':'no fades allowed','source_text':'school'}],
        [{'speaker':'customer','text':'Para sa school.'}])==[]
    assert validate_brief_updates([{'field':'dress_rules','value':'no fades allowed','source_text':'no fades allowed'}],
        [{'speaker':'customer','text':'School rule: no fades allowed.'}])[0]['value']=='no fades allowed'
