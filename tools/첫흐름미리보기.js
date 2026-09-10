#!/usr/bin/env node
'use strict';
// 합성 자료로 실제 Expo 웹 빌드를 확인한다. 원격 서비스·실학생·AI 호출 없음.
// node tools/첫흐름미리보기.js --빌드
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { 스냅샷, 몽골날짜 } = require('../lib/오늘과제.js');
const { 표정컷 } = require('../lib/마스코트생명.js');
const { 인자게이트 } = require('../lib/플래그.js');
const 마스코트컷 = [...new Set(Object.values(표정컷).flatMap(Object.values))];

// 남은 구 파일의 존재만 보지 않고, 현재 HTML의 번들이 실제 참조하는 그림을 대조한다.
function 마스코트빌드일치(root, dir, 컷들 = 마스코트컷) {
  try {
    const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)];
    if (!scripts.length || !컷들.length) return false;
    const bundle = scripts.map(([, src]) => {
      const p = path.resolve(dir, '.' + new URL(src, 'http://localhost/').pathname);
      if (!p.startsWith(dir + path.sep)) throw new Error('미리보기 밖의 번들');
      return fs.readFileSync(p, 'utf8');
    }).join('\n');
    const images = [...bundle.matchAll(/(?:\buri|"uri")\s*:\s*("(?:\\.|[^"\\])*")/g)]
      .map(([, value]) => JSON.parse(value))
      .filter((uri) => uri.startsWith('/assets/assets/마스코트/'));
    const sha = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    return 컷들.every((컷) => {
      const sourceSha = sha(path.join(root, 'assets', '마스코트', `${컷}.webp`));
      const refs = images.filter((uri) => path.basename(uri).startsWith(`${컷}.`) && uri.endsWith('.webp'));
      return refs.length > 0 && refs.every((uri) => sha(path.join(dir, uri)) === sourceSha);
    });
  } catch (_) {
    return false; // 누락·손상된 빌드는 서비스 전에 기존 export로 다시 만든다.
  }
}

function 미리보기시작() {
const 아는플래그 = ['--빌드'];
const 플래그오류 = 인자게이트('첫흐름미리보기', process.argv.slice(2), 아는플래그);
if (플래그오류) { console.error(플래그오류); process.exit(1); }
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'dist', 'first-flow-preview');
const base = 'http://127.0.0.1:18769';
if (process.argv.includes('--빌드') || !마스코트빌드일치(root, dir)) {
  console.log('현행 마스코트 자산으로 첫 흐름 미리보기를 생성합니다.');
  const r = spawnSync(process.execPath, ['tools/앱시작.js', 'export', '--clear', '--platform', 'web', '--output-dir', 'dist/first-flow-preview'], {
    cwd: root, stdio: 'inherit', env: { ...process.env,
      EXPO_PUBLIC_SUPABASE_URL: base, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-preview' },
  });
  if (r.status !== 0) process.exit(r.status || 1);
}
if (!마스코트빌드일치(root, dir)) throw new Error('빌드의 마스코트가 현재 자산과 다릅니다. 미리보기를 시작하지 않습니다.');
const id = '11111111-2222-4333-8444-555555555555';
let 답장있음 = false;
const counts = { corrections: 0, events: 0 };
const controls = `<aside style="position:fixed;right:12px;bottom:12px;z-index:99999;background:#FBF7F0;color:#26313B;padding:12px;border:1px solid #26313B;font:13px sans-serif;max-width:280px">
<b>합성 자료 · 첫 흐름 확인</b><p>SYNK-042 / preview-only<br>실제 계정이나 비밀번호를 입력하지 마세요.</p>
<button id="fixture-reply">답장 도착 후 앱 복귀 재현</button>
<p id="fixture-result">처음에는 답장이 없습니다.</p></aside>
<script>document.getElementById('fixture-reply').onclick=async()=>{
 await fetch('/__fixture/reply',{method:'POST'});
 // React Native Web AppState가 받는 visibilitychange를 합성한다.
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
 document.dispatchEvent(new Event('visibilitychange'));
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
 document.dispatchEvent(new Event('visibilitychange'));
 delete document.visibilityState;
 document.getElementById('fixture-result').textContent='앱을 다시 시작하지 않고 답장 링크가 나타나는지 확인하세요.';
};</script>`;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.ttf': 'font/ttf', '.webp': 'image/webp', '.wav': 'audio/wav', '.ico': 'image/x-icon' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, base);
  const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  if (url.pathname === '/__fixture/reply' && req.method === 'POST') { 답장있음 = true; return json({ ok: true }); }
  if (url.pathname === '/__fixture/status') return json({ synthetic: true, 답장있음, counts });
  if (url.pathname === '/auth/v1/token') return json({ access_token: 'synthetic-session', refresh_token: 'synthetic-refresh', user: { id, user_metadata: { level: 3 } } });
  if (url.pathname.startsWith('/functions/v1/')) {
    const route = url.pathname.slice('/functions/v1/'.length);
    if (route === 'corrections') {
      counts.corrections++;
      return json({ ok: true, contract_ver: 'c16', blocked: null, next_cursor: null,
        data: 답장있음 ? [{ correction_id: id, submission_id: id, corrected_text: '저는 어제 커피를 마셨어요.',
          error_tags: ['조사 오류'], explanation: null, growth_note: null, actor_kind: 'ai', confirmed_at: new Date().toISOString() }] : [] });
    }
    if (route === 'tasks') return json({ ok: true, contract_ver: 'c16', blocked: null, assignment_status: '있음', data: [{
      task_id: id, task_ref: id, level_snapshot: 3, goal_snapshot: '한국어로 내 하루를 말하기', degraded: false,
      task_snapshot: 스냅샷(몽골날짜(), '저는 오늘 커피를 마셨어요.', '도입', '오늘 무엇을 마셨어요?'),
    }] });
    if (route === 'events') {
      let body = ''; for await (const chunk of req) body += chunk;
      const events = JSON.parse(body || '{}').events || []; counts.events += events.length;
      return json({ ok: true, contract_ver: 'c16', results: events.map((e) => ({ status: 'accepted', event_id: id, idempotency_key: e.idempotency_key })) });
    }
    if (route === 'progress') return json({ ok: true, contract_ver: 'c16', 견줌: null, 오늘의확인: null });
    return json({ ok: false, error: { code: 'NOT_FOUND', message: '합성 미리보기의 범위 밖입니다.', retryable: false } }, 404);
  }
  const decoded = decodeURIComponent(url.pathname);
  const file = path.resolve(dir, '.' + (decoded === '/' ? '/index.html' : decoded));
  if (!file.startsWith(dir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return json({ error: 'not found' }, 404);
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(ext === '.html' ? fs.readFileSync(file, 'utf8').replace('</body>', controls + '</body>') : fs.readFileSync(file));
}).listen(18769, '127.0.0.1', () => console.log('합성 자료 미리보기: ' + base));
}

if (require.main === module) 미리보기시작();
module.exports = { 마스코트빌드일치 };
