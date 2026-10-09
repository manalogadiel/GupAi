// Real production UI + local model rehearsal. No @playwright/test dependency.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium, request } = require(process.env.GUPAI_PLAYWRIGHT_PATH || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root = process.cwd();
const base = process.env.GUPAI_TEST_ORIGIN || 'https://localhost:8443';
const lan = Object.values(os.networkInterfaces()).flat().find(n => n && n.family === 'IPv4' && !n.internal && n.address.startsWith('192.168.'))?.address;
const phoneBase = process.env.GUPAI_PHONE_ORIGIN || (lan ? `https://${lan}:8443` : base);
const output = path.join(root, '.local-backup', 'conversation-rehearsal');
fs.mkdirSync(output, { recursive: true });
const report = { mode: 'Real local Ollama, production frontend, synthetic photo/no-face manual recovery', started: new Date().toISOString(), scenes: [], timings: [], errors: [], externalRequests: [] };
const delay = ms => new Promise(r => setTimeout(r, ms));
async function poll(fn, message, timeout = 240000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await fn()) return; await delay(500); }
  throw new Error('Timed out: ' + message);
}
(async () => {
  const api = await request.newContext({ baseURL: base, ignoreHTTPSErrors: true, extraHTTPHeaders: { Origin: base } });
  async function call(method, endpoint, data) {
    const response = await api.fetch(endpoint, { method, data, headers: { 'Idempotency-Key': crypto.randomUUID() } });
    if (response.status() === 409 && data?.expected_revision !== undefined) {
      const conflict = await response.json();
      if (conflict.code === 'revision_conflict') return call(method, endpoint, { ...data, expected_revision: conflict.revision });
    }
    assert(response.ok(), `${method} ${endpoint}: ${response.status()} ${await response.text()}`);
    return response.json();
  }
  const health = await call('GET', '/api/health');
  assert(health.ollama && health.vision_model === 'qwen3.5:4b' && health.whisper && health.face_landmarker, JSON.stringify(health));
  report.health = health;
  const browser = await chromium.launch({ executablePath: process.env.GUPAI_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-proxy-server'] });
  const deskContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 680 }, reducedMotion: 'reduce' });
  const phoneContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 720 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const desk = await deskContext.newPage(); const mobile = await phoneContext.newPage();
  for (const page of [desk, mobile]) {
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404') && !m.text().includes('403')) report.errors.push(m.text()); });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (!['data:', 'blob:'].includes(url.protocol) && ![new URL(base).origin, new URL(phoneBase).origin].includes(url.origin)) {
        report.externalRequests.push(url.origin); await route.abort();
      } else await route.continue();
    });
  }
  const prior = process.env.GUPAI_RESUME_ID ? JSON.parse(fs.readFileSync(path.join(output, 'report.json'), 'utf8')) : null;
  const customer = prior ? { id: prior.customer } : await call('POST', '/api/customers', { display_name: 'QA local v2 ' + Date.now(), retention_consent: true });
  const c = prior ? await call('GET', '/api/consultations/' + prior.consultation) : await call('POST', '/api/consultations', { customer_id: customer.id, chair_label: 'QA v2' });
  report.consultation = c.id; report.customer = customer.id;
  const endpoint = '/api/consultations/' + c.id;
  const get = () => call('GET', endpoint);
  async function idle() {
    let quietSince = 0;
    await poll(async () => {
      const current = await get();
      const active = current.recent_jobs.filter(j => ['queued', 'running'].includes(j.status));
      if (active.length) { quietSince = 0; return false; }
      if (!quietSince) quietSince = Date.now();
      return Date.now() - quietSince >= 2500;
    }, 'inference jobs');
    const current = await get();
    const failed = current.recent_jobs.filter(j => j.status === 'failed');
    assert.equal(failed.length, 0, JSON.stringify(failed));
    for (const job of current.recent_jobs) if (!report.timings.some(t => t.id === job.id)) report.timings.push({ id: job.id, type: job.type, status: job.status, elapsed_s: job.elapsed_s, progress:job.progress, timing:job.timing });
    await delay(1700);
  }
  const pairing = await call('POST', endpoint + '/pair', {});
  await desk.goto(base + '/consult/' + c.id);
  await mobile.goto(phoneBase + new URL(pairing.url).pathname + new URL(pairing.url).search);
  await mobile.locator('header').waitFor();
  async function capture(stage) {
    await delay(700);
    for (const [page, kind] of [[desk,'laptop'],[mobile,'phone']]) {
      const measure = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.scrollingElement.scrollWidth, scrollHeight: document.scrollingElement.scrollHeight,
        clipped: [...document.querySelectorAll('button,textarea,input:not([type=file]):not([type=checkbox])')].filter(e => {
          const r = e.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(e).visibility === 'hidden') return false;
          return r.top < -1 || r.left < -1 || r.bottom > innerHeight + 1 || r.right > innerWidth + 1;
        }).map(e => (e.textContent || e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.tagName).trim().slice(0,100)) }));
      report.scenes.push({ stage, kind, ...measure });
      await page.screenshot({ path: path.join(output, `${stage}-${kind}.png`) });
      assert.equal(measure.clipped.length,0, `${stage}/${kind} clipped controls: ${measure.clipped.join(', ')}`);
      assert(measure.scrollHeight <= measure.height + 1 && measure.scrollWidth <= measure.width + 1, `${stage}/${kind} page scroll: ${JSON.stringify(measure)}`);
      console.log(`SCENE ${stage}/${kind}: ${measure.scrollWidth}×${measure.scrollHeight}, clipped controls: ${measure.clipped.join(', ') || 'none'}`);
    }
  }
  const photo = path.join(root, '.local-backup', 'synthetic.jpg');
  if (c.stage === 'photos') {
  await capture('photos');
  await mobile.locator('input[type=file]').setInputFiles(photo);
  await poll(async () => (await get()).photos.some(p => p.view === 'front'), 'front upload');
  await idle();
  await mobile.getByRole('radio', { name: 'Gilid', exact: true }).click();
  await mobile.locator('input[type=file]').setInputFiles(photo);
  await poll(async () => (await get()).photos.some(p => p.view === 'side'), 'side upload');
  await idle();
  await desk.getByRole('button', { name: 'Susunod: Usapan →', exact: true }).click();
  await poll(async () => (await get()).stage === 'goal', 'goal stage');
  }
  if (!(await get()).state.chat.some(t => t.role === 'ai')) {
  await mobile.getByPlaceholder('Sabihin o i-type…').fill('Para sa work. Gusto ko clean professional look, 5 minutes lang mag-ayos. Pumupuff ang gilid, pero huwag galawin ang fringe.');
  const chatStart = Date.now();
  await mobile.getByRole('button', { name: 'Send', exact: true }).click();
  await poll(async () => (await get()).recent_jobs.some(j => j.type === 'chat'), 'chat start');
  await poll(async () => (await get()).recent_jobs.some(j => j.type === 'chat' && j.partial_text), 'chat first token');
  report.chatFirstTokenObservedSeconds = (Date.now() - chatStart) / 1000;
  await idle();
  }
  let current = await get();
  assert(current.state.avoid.some(x => x.toLowerCase().includes('fringe')) || current.state.keep.some(x => x.toLowerCase().includes('fringe')), 'Negation lost');
  report.reply = current.state.chat.at(-1).text;
  await capture('goal');
  await desk.getByRole('button', { name: 'Susunod: Reveal →', exact: true }).click();
  await desk.getByRole('button', { name: /Ipakita ang resulta/ }).click();
  await poll(async () => (await get()).state.revealed, 'face reveal');
  current = await get();
  assert(!current.recent_jobs.some(j => j.type === 'recommend'), 'Reveal must not run recommendation');
  const shape = desk.getByRole('button', { name:'round (bilugan)', exact:true });
  const shapeResponse = desk.waitForResponse(response => response.url().endsWith('/contributions') && response.request().postDataJSON()?.kind === 'face_shape');
  await shape.click(); assert((await shapeResponse).ok());
  for (const o of (await get()).state.observations) {
    current=await get(); await call('POST', endpoint+'/contributions', {kind:'observation',observation_id:o.id,status:'rejected',expected_revision:current.revision});
  }
  await delay(1800);
  report.brief=(await get()).state.brief;
  assert(report.brief.occasion, 'Occasion not extracted from conversation');
  await capture('reveal');
  await desk.getByRole('button', { name: 'Susunod: Gilid →', exact: true }).click();
  await mobile.getByRole('button', { name: 'Hindi ko alam, i-suggest mo', exact: true }).click();
  await poll(async () => (await get()).recent_jobs.some(j => j.type === 'suggest'), 'sides suggestion');
  await idle();
  const sideOptions = (await get()).state.sides.options; report.sides=sideOptions;
  assert(sideOptions.length > 0);
  await mobile.getByRole('button').filter({ hasText: sideOptions[0].name }).last().click();
  await poll(async () => !!(await get()).state.sides.choice, 'side choice');
  await capture('sides');
  await desk.getByRole('button', { name: 'Susunod: Ibabaw →', exact: true }).click();
  await mobile.getByRole('button', { name: 'Hindi ko alam, i-suggest mo', exact: true }).click();
  await poll(async () => (await get()).recent_jobs.filter(j => j.type === 'suggest').length >= 2, 'top suggestion');
  await idle();
  const topOptions = (await get()).state.top.options; report.top=topOptions;
  assert(!topOptions.some(o => ['buzz','textured_crop'].includes(o.id)), 'Protected fringe violated');
  await mobile.getByRole('button').filter({ hasText: topOptions[0].name }).last().click();
  await poll(async () => !!(await get()).state.top.choice, 'top choice');
  await capture('top');
  await desk.getByRole('button', { name: 'Susunod: Final →', exact: true }).click();
  await capture('summary');
  await mobile.getByRole('button', { name: 'Customer: Ito ang gusto ko', exact: true }).click();
  await poll(async () => !!(await get()).agreement?.customer_confirmed_at, 'customer agreement');
  await desk.getByPlaceholder('Notes: hal. #2 guard, gunting sa ibabaw').fill('QA: follow agreed sides and keep fringe');
  await desk.getByRole('button', { name: 'Barbero: Kaya ko ’to', exact: true }).click();
  await poll(async () => (await get()).stage === 'cutting', 'two approvals');
  await capture('cutting');
  await mobile.getByRole('button', { name: 'Tapos na ang gilid: kunan', exact: true }).click();
  await mobile.locator('input[type=file]').setInputFiles(photo);
  await poll(async () => (await get()).recent_jobs.some(j => j.type === 'checkpoint'), 'checkpoint job');
  await idle();
  report.checkpoint = (await get()).state.checkpoints.sides;
  assert(report.checkpoint && ['ok','review','insufficient'].includes(report.checkpoint.status));
  await desk.getByRole('button', { name: 'Tapos na ang gupit →', exact: true }).click();
  await poll(async () => (await get()).stage === 'done', 'rating stage');
  await capture('done');
  await mobile.getByRole('radio', { name: '5 sa 5', exact: true }).click();
  await mobile.getByRole('button', { name: 'I-send ang rating', exact: true }).click();
  await desk.getByText('Rating mula sa phone ng customer · 5/5').waitFor();
  await desk.getByRole('button', { name: 'I-save at tapusin', exact: true }).click();
  await poll(async () => (await get()).status === 'completed', 'complete');
  await mobile.getByText(/Salamat! Tapos na ang konsultang ito/).waitFor();
  const profile = await call('GET', '/api/customers/' + customer.id);
  assert(profile.preferred && profile.visits.length === 1, 'Preferred visit did not persist');
  report.visit_id = profile.preferred.id;
  const returned = await call('POST', '/api/consultations', { customer_id:customer.id, from_visit_id:profile.preferred.id, chair_label:'QA return' });
  assert(returned.state.avoid.includes('fringe') || returned.state.keep.includes('fringe'));
  await call('POST', '/api/consultations/' + returned.id + '/abandon', {});
  // Real LAN authorization, not a localhost customer masquerading as the barber.
  const chairA = await call('POST', '/api/consultations', { chair_label:'QA chair A' });
  const chairB = await call('POST', '/api/consultations', { chair_label:'QA chair B' });
  const remoteA = await request.newContext({ baseURL:phoneBase, ignoreHTTPSErrors:true, extraHTTPHeaders:{Origin:phoneBase} });
  const remoteB = await request.newContext({ baseURL:phoneBase, ignoreHTTPSErrors:true, extraHTTPHeaders:{Origin:phoneBase} });
  for (const [chair,remote] of [[chairA,remoteA],[chairB,remoteB]]) {
    const pair = await call('POST', '/api/consultations/' + chair.id + '/pair', {});
    const pairPath = new URL(pair.url).pathname + new URL(pair.url).search;
    assert((await remote.get(pairPath)).ok());
    assert.equal((await remote.get(pairPath)).status(),410);
  }
  assert.equal((await remoteA.get('/api/consultations/' + chairB.id)).status(),404);
  assert.equal((await remoteB.get('/api/consultations/' + chairA.id)).status(),404);
  await call('POST', '/api/consultations/' + chairA.id + '/abandon', {});
  assert((await remoteB.get('/api/consultations/' + chairB.id)).ok());
  await call('POST', '/api/consultations/' + chairB.id + '/abandon', {});
  report.twoChairs = 'PASS: LAN phones isolated, pairing single-use, ending A preserves B';
  assert.equal(report.errors.length,0,JSON.stringify(report.errors));
  assert.equal(report.externalRequests.length,0,JSON.stringify(report.externalRequests));
  report.result = 'PASS';
  await browser.close(); await api.dispose();
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log('PASS: real local-AI v2 journey, phone rating, persisted return visit, two-chair LAN isolation');
})().catch(error => {
  report.result = 'FAIL'; report.failure = error.stack;
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.error(error.stack); process.exit(1);
});
