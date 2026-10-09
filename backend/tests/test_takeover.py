"""Regression coverage for v2 takeover integration defects."""
import json
import pytest
from backend.tests.test_v2_flow import (
    barber, create, contribute, seed, saved, summary, confirm, post, phone,
    RECOMMEND, SUGGEST, start_job,
)
from backend.app import consult, db, ai, stt, jobs
from backend.app.errors import APIError

def test_hidden_results_in_mutations_and_active(barber):
    c = create(barber)
    seed(c['id'], face_shape={'confirmed': 'round'}, recommendations=RECOMMEND)
    result = contribute(barber, c, kind='problem', id='cowlick').json()
    assert result['state']['face_shape'] is None
    assert result['state']['recommendations'] is None
    assert barber.get('/api/consultations/active').json()['state']['face_shape'] is None
    assert saved(c['id'])['face_shape']['confirmed'] == 'round'

def test_customer_rating_sync_and_completion(barber):
    customer = post(barber, '/api/customers', {'display_name':'Rating test', 'retention_consent': True}).json()
    c = summary(barber, create(barber, customer_id=customer['id']))
    remote = phone(barber, c['id'], '192.168.1.2')
    c = confirm(barber, c, 'customer').json()
    c = confirm(barber, c, 'barber').json()
    c = contribute(barber, c, kind='stage', stage='done').json()
    rated = contribute(remote, c, kind='rating', score=4, tags=['Maayos kausap'])
    assert rated.status_code == 200, rated.text
    c = barber.get('/api/consultations/' + c['id']).json()
    assert c['state']['rating'] == {'score':4, 'tags':['Maayos kausap']}
    response = post(barber, '/api/consultations/' + c['id'] + '/complete',
        {'actual_notes':'Taper', 'save_as_preferred':True, 'keep_photos':False})
    assert response.status_code == 200, response.text
    with db.connect() as conn:
        row = conn.execute('SELECT rating,rating_tags FROM visits WHERE id=?', (response.json()['visit_id'],)).fetchone()
        assert row['rating'] == 4 and json.loads(row['rating_tags']) == ['Maayos kausap']

@pytest.mark.parametrize('score', [0,6,True])
def test_invalid_shared_rating_leaves_state_unchanged(barber, score):
    c = create(barber)
    seed(c['id'], stage='done')
    before = saved(c['id'])
    assert contribute(barber, c, kind='rating', score=score, tags=[]).status_code == 422
    assert saved(c['id']) == before

@pytest.mark.parametrize('change', [
    {'kind':'problem','id':'cowlick'},
    {'kind':'choose_part','part':'top','custom':'Buzz'},
    {'kind':'text','speaker':'customer','input_type':'typed','text':'Change it'},
])
def test_plan_edits_during_cutting_rejected_without_stranding_visit(barber, change):
    c = summary(barber, create(barber))
    c = confirm(barber, c, 'customer').json()
    c = confirm(barber, c, 'barber').json()
    before = saved(c['id'])
    assert contribute(barber, c, **change).status_code == 409
    assert saved(c['id']) == before
    assert post(barber, '/api/consultations/' + c['id'] + '/complete',
        {'actual_notes':'', 'save_as_preferred':False, 'keep_photos':False}).status_code == 200

def test_constraint_change_clears_v2_recommendations(barber):
    c = create(barber)
    seed(c['id'], recommendations=RECOMMEND, selected_style='side_part',
        sides={**SUGGEST,'choice':{'id':'taper','custom':None}})
    c = contribute(barber, c, kind='chip', speaker='customer', field='avoid', value='fringe').json()
    internal = saved(c['id'])
    assert internal['recommendations'] is None and internal['selected_style'] is None
    assert internal['sides']['options'] == [] and internal['sides']['choice'] is None

def test_custom_part_choice_survives_new_suggestions():
    state = consult.empty_state()
    state['sides']['choice'] = {'id':None,'custom':'Keep my length'}
    result = consult.merge_job_result(state, 'suggest', SUGGEST, part='sides')
    assert result['sides']['choice'] == state['sides']['choice']

def test_protected_fringe_excludes_buzz_and_crop():
    state = consult.empty_state()
    state['keep'] = ['fringe']
    options = ai.rank_parts(ai.load_parts()['top'], state)
    assert not {'buzz','textured_crop'} & {o['id'] for o in options}

def test_whisper_missing_cache_fails_without_download(monkeypatch):
    import faster_whisper
    seen = []
    def missing(*args, **kwargs):
        seen.append(kwargs)
        raise FileNotFoundError('missing cached weights')
    monkeypatch.setattr(faster_whisper, 'WhisperModel', missing)
    monkeypatch.setattr(stt, '_model', None)
    with pytest.raises(APIError): stt._load()
    assert seen[0].get('local_files_only') is True

def test_whisper_readiness_requires_complete_cached_files(monkeypatch, tmp_path):
    import huggingface_hub
    monkeypatch.setattr(huggingface_hub, 'snapshot_download', lambda *a, **kw: str(tmp_path))
    assert stt.available() is False
    for filename in ('model.bin','config.json','tokenizer.json','vocabulary.txt'):
        (tmp_path/filename).write_text('cached')
    assert stt.available() is True

def test_no_new_plan_jobs_after_cutting(barber):
    c = create(barber)
    seed(c['id'], stage='cutting')
    assert post(barber, '/api/consultations/' + c['id'] + '/jobs',
        {'type':'chat', 'expected_revision':0}).status_code == 409


def test_pairing_from_localhost_uses_private_lan(barber, monkeypatch):
    from backend.app import pairing
    monkeypatch.delenv('GUPAI_PAIR_BASE_URL', raising=False)
    monkeypatch.setattr(pairing.socket, 'getaddrinfo', lambda *a, **kw: [
        (2,1,6,'',('127.0.0.1',0)), (2,1,6,'',('192.168.68.110',0))])
    c = create(barber)
    result = post(barber, '/api/consultations/' + c['id'] + '/pair', {}).json()
    assert result['url'].startswith('https://192.168.68.110:8443/pair?code=')

def test_chat_finishes_with_one_question(monkeypatch):
    monkeypatch.setattr(ai, 'stream_json', lambda *a, **kw: {'reply':'Anong look ang gusto mo?', 'brief_updates':[], 'proposed_changes':[]})
    monkeypatch.setattr(ai, 'extract', lambda texts: {'goal':'','proposed_changes':[]})
    result = ai.chat_reply(consult.empty_state(), ['Pumupuff ang gilid'], lambda token: None)
    assert result['reply'].endswith('?') and result['reply'].count('?') == 1

def test_delayed_chat_cannot_change_cutting_plan(barber, monkeypatch):
    c = create(barber)
    job = start_job(barber, c, 'chat')
    seed(c['id'], stage='cutting', keep=['fringe'])
    monkeypatch.setattr(ai, 'chat_reply', lambda *args: {'reply':'Sige?', 'goal':'buzz',
        'problems_detected':[], 'proposed_changes':[]})
    jobs._process(job['id'])
    assert barber.get('/api/jobs/' + job['id']).json()['status'] == 'stale'
    assert saved(c['id'])['keep'] == ['fringe'] and saved(c['id'])['goal'] == ''

def test_goal_uses_customer_words_instead_of_invented_summary(monkeypatch):
    text = 'Gusto ko malinis sa gilid pero huwag galawin ang fringe.'
    state = consult.empty_state()
    state['chat'] = [{'role':'customer','text':text}]
    monkeypatch.setattr(ai,'stream_json',lambda *a, **kw:{'reply':'Sige. Gaano kaikli?', 'brief_updates':[], 'proposed_changes':[]})
    monkeypatch.setattr(ai,'extract',lambda texts:{'goal':'Add puff to the top','proposed_changes':[]})
    assert ai.chat_reply(state,[text],lambda token:None)['goal'] == text

def test_face_note_cannot_invent_face_shape(monkeypatch):
    state = consult.empty_state()
    state['face_shape'] = {'confirmed':'round'}
    monkeypatch.setattr(ai,'chat',lambda *a, **kw:{'face_note':'Mukhang pambato ang mukha mo.', 'whys':[]})
    result = ai.recommend(state)
    assert 'round' in result['face_note'] and 'pambato' not in result['face_note']
def test_readiness_requires_the_model_inference_actually_uses(barber, monkeypatch):
    import httpx
    from backend.app import health
    real_client = httpx.AsyncClient
    monkeypatch.setattr(health.httpx,'AsyncClient',lambda **kw:real_client(
        transport=httpx.MockTransport(lambda req:httpx.Response(200,json={'models':[{'name':'qwen3.5:2b'}]})), **kw))
    assert barber.get('/api/health').json()['vision_model'] is None

def test_recommendation_reasons_cannot_invent_anatomy(monkeypatch):
    state = consult.empty_state()
    state['keep'] = ['fringe']
    state['face_shape'] = {'confirmed':'round'}
    monkeypatch.setattr(ai,'chat',lambda *a, **kw:{'whys':[{'catalog_id':'side_part','why':'Ilipat ang dila sa gilid.'}], 'reason_choices':[{'id':'side_part','index':999}]})
    result = ai.recommend(state)
    assert 'dila' not in result['top_pick']['why']
    assert result['top_pick']['why'].endswith('.')
    assert 'fringe' in result['top_pick']['why']

def test_part_reasons_are_catalog_evidence_even_without_shape(monkeypatch):
    state = consult.empty_state()
    monkeypatch.setattr(ai,'chat',lambda *a, **kw:{'choices':[{'id':'skin_fade','evidence_index':0,'factor':'none'}], 'intro':'Ito lang ang solusyon.'})
    result = ai.suggest(state,'sides')
    assert all(o['why'] and 'Cures' not in o['why'] for o in result['options'])
    assert result['intro'].endswith('?')


def test_browser_audio_decodes_to_whisper_samples_without_removed_pyav_keyword(tmp_path):
    import wave
    import numpy as np
    path = tmp_path/'voice.wav'
    samples = (np.sin(np.arange(22050)*2*np.pi*440/22050)*16000).astype('<i2')
    with wave.open(str(path),'wb') as recording:
        recording.setnchannels(1); recording.setsampwidth(2); recording.setframerate(22050)
        recording.writeframes(samples.tobytes())
    result = stt._decode_audio(path)
    assert result.dtype == np.float32 and result.ndim == 1
    assert 15900 <= len(result) <= 16100
    assert 0.1 < float(np.max(np.abs(result))) < 1
