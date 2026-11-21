// Concept boards ("样张"): paint a target UI/presentation over real game frames with an image-edit model (via Monid),
// so the look is chosen before it is built.
//   node tools/concept_gen.mjs [--spec tools/concept/moments.json] [--only A_title,B_combat] [--quality low|medium|high] [--max-usd 1.2] [--dry]
import { readFileSync, writeFileSync, mkdirSync, statSync, appendFileSync } from 'node:fs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const ONLY = arg('only', '') ? String(arg('only')).split(',') : null, Q = arg('quality', 'medium'), DRY = !!arg('dry', false), MAX = +arg('max-usd', 1.2);
const spec = JSON.parse(readFileSync(arg('spec', 'tools/concept/spec.json'), 'utf8'));
const KEY = (process.env.MONID_KEY || readFileSync('tools/.monid_key', 'utf8')).trim();

const api = async (path, body) => {
  for (let i = 0; i < 6; i++) {
    const r = await fetch('https://api.monid.ai' + path, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 5000)); continue; }
    const j = await r.json().catch(() => ({}));
    if (r.status >= 400 && r.status !== 408) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 300)}`);
    return j;
  }
  throw new Error('rate limited');
};
const run = async (body) => {
  let r = await api('/v1/run', body);
  while (r.runId && ['READY', 'RUNNING', 'STOPPING'].includes(r.status)) { await new Promise((s) => setTimeout(s, 3000)); r = await api(`/v1/runs/${r.runId}`); }
  return r;
};
const find = (o, re) => {
  if (!o || typeof o !== 'object') return null;
  for (const [k, v] of Object.entries(o)) { if (typeof v === 'string' && re.test(k) && /^https?:/.test(v)) return v; const f = find(v, re); if (f) return f; }
  return null;
};

const urls = {};
function publicUrl(file) { // Monid file storage: put -> signed upload, cat -> signed public link
  return (urls[file] ||= (async () => {
    const path = `sandline/concept/${file.split('/').pop()}`;
    const put = await run({ provider: 'sfs', endpoint: '/put', input: { body: { path, sizeBytes: statSync(file).size, ttl: "1d" } } });
    const up = find(put.output, /upload/i); if (!up) throw new Error('no upload url ' + JSON.stringify(put).slice(0, 400));
    const pr = await fetch(up, { method: 'PUT', body: readFileSync(file) }); if (!pr.ok) throw new Error('upload ' + pr.status + ' ' + (await pr.text()).slice(0, 200));
    const cat = await run({ provider: 'sfs', endpoint: '/cat', input: { body: { path, ttl: "1d" } } });
    const u = find(cat.output, /url|link/i); if (!u) throw new Error('no cat url ' + JSON.stringify(cat).slice(0, 400));
    return u;
  })());
}

mkdirSync('out/concept', { recursive: true });
let spent = 0;
const jobs = [];
for (const d of spec.directions) for (const b of spec.boards) { const id = `${d.id}_${b.id}`; if (!ONLY || ONLY.includes(id)) jobs.push({ id, d, b }); }
console.log(jobs.map((j) => j.id).join(' '), `(${jobs.length} boards, quality ${Q})`);
if (DRY) process.exit(0);

await Promise.all(jobs.map(async (j, n) => {
  await new Promise((s) => setTimeout(s, n * 1500));
  try {
    const img = await publicUrl(`out/concept/base/${j.b.base}.jpg`);
    const prompt = `${spec.preamble}\n\nART DIRECTION — ${j.d.name}: ${j.d.style}\n\nSCREEN — ${j.b.name}: ${j.b.layout}\n\n${spec.rules}`;
    if (spent > MAX) throw new Error('spend cap');
    const r = await run({ provider: 'openai', endpoint: '/v1/image/gpt-image-2.6-sunburst-edit', input: { body: { prompt, size: spec.size, quality: Q, images: [img] } }, maxCost: 0.2, tag: `sandline-concept-${j.id}` });
    const c = +(r.cost?.value ?? 0) || 0; spent += c;
    appendFileSync('tools/concept/ledger.jsonl', JSON.stringify({ t: new Date().toISOString(), id: j.id, runId: r.runId, status: r.status, cost: c }) + '\n');
    if (r.status !== 'COMPLETED') throw new Error(`${r.status} ${JSON.stringify(r.reason || r.error || r.output || '').slice(0, 300)}`);
    const u = find(r.output, /download|url|link/i); if (!u) throw new Error('no image ' + JSON.stringify(r.output).slice(0, 400));
    writeFileSync(`out/concept/${j.id}.png`, Buffer.from(await (await fetch(u)).arrayBuffer()));
    console.log('ok', j.id, `$${c}`);
  } catch (e) { console.error('FAIL', j.id, e.message); }
}));
console.log(`spent ~$${spent.toFixed(3)}`);
