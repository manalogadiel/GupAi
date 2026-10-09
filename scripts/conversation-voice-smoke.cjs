const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium,request}=require('C:/Users/Diel/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='https://localhost:8443',root=process.cwd(),report={input:'Synthetic Windows speech through actual browser MediaRecorder; not a human accuracy test'};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const api=await request.newContext({baseURL:base,ignoreHTTPSErrors:true,extraHTTPHeaders:{Origin:base}});
 const post=async(url,data)=>{const r=await api.post(url,{data,headers:{'Idempotency-Key':crypto.randomUUID()}});assert(r.ok(),await r.text());return r.json();};
 const c=await post('/api/consultations',{chair_label:'QA browser mic temporary'}),endpoint='/api/consultations/'+c.id;
 let browser;
 try {
  await post(endpoint+'/contributions',{kind:'stage',stage:'goal',expected_revision:c.revision});
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--no-proxy-server','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+path.join(root,'.local-backup/speech-smoke.wav')]});
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:680},permissions:['microphone']});const page=await context.newPage();
  await page.goto(base+'/consult/'+c.id);
  report.samples=[];const seenJobs=new Set();
  for(let sample=0;sample<3;sample++){
  await page.getByRole('button',{name:'Magsalita (record)',exact:true}).click();
  await delay(6000);const started=Date.now();await page.getByRole('button',{name:'Itigil at isalin ang recording',exact:true}).click();
  let job;const end=Date.now()+120000;
  while(Date.now()<end){const r=await api.get(endpoint);const s=await r.json();job=s.recent_jobs.find(j=>j.type==='transcribe'&&!seenJobs.has(j.id));if(job&&['done','failed'].includes(job.status))break;await delay(500);}
  assert.equal(job?.status,'done',JSON.stringify(job));
  await page.getByText('Galing sa boses. I-edit kung may mali bago i-send.').waitFor();
  await page.waitForFunction(()=>{const text=document.querySelector('#talk-input')?.value;return !!text&&text!=='Edited transcript for verification';});
  const input=page.locator('#talk-input');const text=await input.inputValue();assert(text.trim());
  await input.fill('Edited transcript for verification');assert.equal(await input.inputValue(),'Edited transcript for verification');
  const state=await (await api.get(endpoint)).json();assert(!state.recent_jobs.some(j=>j.type==='chat'),'Recording must remain reviewable before Send');
  report.samples.push({job:job.id,transcript:text,transcriptionJobSeconds:job.elapsed_s,stopToReviewSeconds:(Date.now()-started)/1000});seenJobs.add(job.id);
  }
  report.result='PASS';report.editable=true;report.notAutomaticallySent=true;
 } finally {if(browser)await browser.close();await post(endpoint+'/abandon',{});await api.dispose();}
 fs.writeFileSync(path.join(root,'.local-backup/browser-voice-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;});
