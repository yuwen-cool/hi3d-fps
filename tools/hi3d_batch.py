#!/usr/bin/env python3
"""Batch: concept image(s) via Hi3D image gen -> Hi3D 3D generation -> download.

  python3 hi3d_batch.py assets.json [name ...]   # run listed (or all pending) assets
State per asset: assets/hi3d/<name>.state.json (resumable, never re-pays a finished step).
Ledger: assets/ledger.jsonl
"""
import json, os, sys, time, urllib.request, threading, concurrent.futures as cf
import importlib.util
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('h', os.path.join(HERE, 'hi3d_client.py'))
h = importlib.util.module_from_spec(spec); spec.loader.exec_module(h)
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'assets', 'hi3d')
LEDGER = os.path.join(ROOT, 'assets', 'ledger.jsonl')
lock = threading.Lock()

STYLE = ("Pure light-gray seamless background, soft even studio lighting, no cast shadows, "
         "no visual effects, no text, no logos, single object centered and fully visible.")


_orig_call = h.MCP.call
def _call_retry(self, tool, args, _n=0):
    try:
        return _orig_call(self, tool, args)
    except RuntimeError as e:
        if ('429' in str(e) or 'Too many' in str(e)) and _n < 12:
            time.sleep(20 + 10 * _n); return _call_retry(self, tool, args, _n + 1)
        raise
h.MCP.call = _call_retry


def log(name, *a):
    with lock:
        print(time.strftime('%H:%M:%S'), f'[{name}]', *a, flush=True)


def ledger(entry):
    with lock:
        with open(LEDGER, 'a') as f:
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')


def load(name):
    p = os.path.join(OUT, f'{name}.state.json')
    return json.load(open(p)) if os.path.exists(p) else {}


def save(name, st):
    json.dump(st, open(os.path.join(OUT, f'{name}.state.json'), 'w'), ensure_ascii=False, indent=1)


def wait(m, tid, name, limit=3600):
    t0 = time.time()
    while time.time() - t0 < limit:
        t = m.call('get_task', {'task_id': tid})
        if t.get('status') in ('succeeded', 'failed'):
            return t
        time.sleep(max(6, int(t.get('next_poll_after') or 10)))
    raise RuntimeError('timeout')


def urls(outs):
    res = []
    for a in (outs.get('assets') or outs.get('images') or []):
        u = a.get('url') or a.get('original_url')
        if u:
            res.append(u)
    return res


def run(a):
    name = a['name']
    st = load(name)
    m = h.MCP()
    # 1) concept image(s)
    if 'img_task' not in st:
        q = m.call('quote_image_generation', {
            'prompt': a['prompt'] + ' ' + STYLE, 'model_name': a.get('img_model', 'Nano-Banana-Pro'),
            'multi_view': bool(a.get('multi_view')), 'aspect_ratio': a.get('aspect', '1:1')})
        c = m.call('create_image_generation', {'quote_id': q['quote_id'], 'confirmed': True})
        st['img_task'] = c.get('task_id') or c.get('task', {}).get('task_id'); save(name, st)
        log(name, 'image task', st['img_task'], 'est', q.get('estimated_points'))
    if 'img_files' not in st:
        t = wait(m, st['img_task'], name)
        if t.get('status') != 'succeeded':
            log(name, 'IMAGE FAILED', t.get('error')); st.pop('img_task'); save(name, st); return
        outs = m.call('get_task_outputs', {'task_id': st['img_task']})
        files = []
        for k, u in enumerate(urls(outs)):
            p = os.path.join(OUT, 'concept', f'{name}_{k}.png'); os.makedirs(os.path.dirname(p), exist_ok=True)
            urllib.request.urlretrieve(u, p); files.append(p)
        st['img_files'] = files; st['img_points'] = t.get('actual_points'); save(name, st)
        ledger({'name': name, 'step': 'image', 'task': st['img_task'], 'points': t.get('actual_points')})
        log(name, 'images', len(files))
    if a.get('image_only'):
        return
    # 2) 3D
    if 'model_task' not in st:
        n = len(st['img_files'])
        src = [{'task_id': st['img_task'], 'image_index': i} for i in range(min(n, 4))] if a.get('multi_view') \
            else [{'task_id': st['img_task'], 'image_index': 0}]
        q = m.call('quote_generation', {'source_images': src, 'version': 'v3.0',
                                        'model_type': a.get('quality', 'high_quality'),
                                        'generation_type': 'model_with_texture', 'pbr': True, 'license': 'private'})
        pts = q.get('estimated_points')
        if pts is None or pts > a.get('max_points', 200):
            log(name, 'quote too high / missing', pts); return
        c = m.call('create_generation', {'quote_id': q['quote_id'], 'confirmed': True})
        st['model_task'] = c.get('task_id') or c.get('task', {}).get('task_id'); st['model_est'] = pts; save(name, st)
        log(name, 'model task', st['model_task'], 'est', pts)
    if 'model_file' not in st:
        t = wait(m, st['model_task'], name)
        if t.get('status') != 'succeeded':
            log(name, 'MODEL FAILED', t.get('error')); st.pop('model_task'); save(name, st); return
        outs = m.call('get_task_outputs', {'task_id': st['model_task']})
        for a_ in (outs.get('assets') or []):
            u = a_.get('url')
            if not u:
                continue
            path = urllib.parse.urlparse(u).path
            ext = os.path.splitext(path)[1]
            kind = 'preview' if '/preview/' in path else ('cover' if '/cover/' in path else 'model')
            p = os.path.join(OUT, f'{name}_{kind}{ext}')
            urllib.request.urlretrieve(u, p + '.part'); os.replace(p + '.part', p)   # atomic: the bake queue polls for this file
            if kind == 'model' and ext == '.glb':
                st['model_file'] = p
        st['model_points'] = t.get('actual_points'); st['page'] = t.get('model_page_url'); save(name, st)
        ledger({'name': name, 'step': 'model', 'task': st['model_task'], 'points': t.get('actual_points')})
        log(name, 'DONE model', st.get('model_file'), t.get('actual_points'))


if __name__ == '__main__':
    import urllib.parse
    specs = json.load(open(sys.argv[1]))
    want = set(sys.argv[2:])
    todo = [a for a in specs if (not want or a['name'] in want)]
    os.makedirs(OUT, exist_ok=True)
    with cf.ThreadPoolExecutor(max_workers=int(os.environ.get('HI3D_PAR', '5'))) as ex:
        futs = {ex.submit(run, a): a['name'] for a in todo}
        for f in cf.as_completed(futs):
            try:
                f.result()
            except Exception as e:
                log(futs[f], 'ERROR', repr(e)[:400])
