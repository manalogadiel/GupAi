"""Job progress and raw-audio cleanup against an isolated SQLite database."""
import json
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from backend.app import db, media, main, jobs, consult, stt, ai

@pytest.fixture
def setup(tmp_path,monkeypatch):
    monkeypatch.setattr(db,'DB_PATH',tmp_path/'test.db')
    monkeypatch.setattr(media,'MEDIA_DIR',tmp_path/'media')
    monkeypatch.setattr(jobs,'_ensure_worker',lambda:None)
    jobs._transient.clear()
    with TestClient(main.app,base_url='https://localhost:8443',client=('127.0.0.1',1)) as client:
        c=client.post('/api/consultations',json={},headers={'Origin':'https://localhost:8443','Idempotency-Key':str(uuid4())}).json()
        yield client,c,tmp_path
    jobs._transient.clear()

def insert_job(c,jid,status='queued',kind='chat',media_id=None):
    with db.connect() as conn:
        conn.execute('INSERT INTO jobs(id,consultation_id,type,requested_revision,status,result_json) VALUES(?,?,?,?,?,?)',
            (jid,c['id'],kind,0,status,json.dumps({'media_id':media_id,'part':None})))

def test_queue_position_and_elapsed_exclude_queue_wait(setup):
    client,c,_=setup
    insert_job(c,'first','running');insert_job(c,'second')
    job=client.get('/api/jobs/second').json()
    assert job['progress']['phase']=='queued' and job['progress']['queued_ahead']==1
    assert job['elapsed_s']==0 and job['progress']['first_token_ms'] is None

def test_metrics_whitelist_excludes_customer_data():
    ai._record_metrics({'eval_count':4,'load_duration':12,'prompt':'private','audio':'private'})
    assert ai._metrics.last=={'eval_count':4,'load_duration':12}

def test_cancelled_queued_transcription_deletes_audio(setup):
    client,c,tmp=setup
    import wave,io
    buf=io.BytesIO()
    with wave.open(buf,'wb') as wav:
        wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(16000);wav.writeframes(b'\0\0'*1600)
    uploaded=client.post('/api/consultations/'+c['id']+'/media',data={'kind':'audio'},files={'file':('sample.wav',buf.getvalue(),'audio/wav')},headers={'Origin':'https://localhost:8443'}).json()
    insert_job(c,'cancelled',kind='transcribe',media_id=uploaded['id'])
    response=client.delete('/api/jobs/cancelled',headers={'Origin':'https://localhost:8443','Idempotency-Key':str(uuid4())})
    assert response.json()['status']=='cancelled'
    assert client.get('/api/media/'+uploaded['id']).status_code==404
    with db.connect() as conn:
        assert conn.execute('SELECT id FROM media WHERE id=?',(uploaded['id'],)).fetchone() is None
    assert not list(media.MEDIA_DIR.glob(uploaded['id']+'*'))

def test_empty_transcript_shows_error_and_deletes_audio(setup,monkeypatch):
    client,c,tmp=setup
    import wave,io
    buf=io.BytesIO()
    with wave.open(buf,'wb') as wav:
        wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(16000);wav.writeframes(b'\0\0'*1600)
    uploaded=client.post('/api/consultations/'+c['id']+'/media',data={'kind':'audio'},files={'file':('sample.wav',buf.getvalue(),'audio/wav')},headers={'Origin':'https://localhost:8443'}).json()
    insert_job(c,'empty',kind='transcribe',media_id=uploaded['id'])
    from types import SimpleNamespace
    monkeypatch.setattr(stt,'_load',lambda:SimpleNamespace(transcribe=lambda *a,**kw:([],SimpleNamespace(language='tl'))))
    jobs._process('empty')
    job=client.get('/api/jobs/empty').json()
    assert job['status']=='failed' and 'boses' in job['error']['message']
    assert client.get('/api/media/'+uploaded['id']).status_code==404
    with db.connect() as conn:
        assert conn.execute('SELECT id FROM media WHERE id=?',(uploaded['id'],)).fetchone() is None
    assert not list(media.MEDIA_DIR.glob(uploaded['id']+'*'))
