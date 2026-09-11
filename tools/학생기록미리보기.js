'use strict';
// 기존 Expo/Metro로 실제 화면을 묶고 localhost에서 합성 응답만 제공한다.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'dist/student-records-preview');
const base = 'http://127.0.0.1:18782';
const ids = ['정상 기록', '아직 기록 없음', '동의 확인 필요', '조회 실패'].map((name, i) => ({
  learner_id: `10000000-0000-4000-8000-00000000000${i + 1}`, display_name: `합성 · ${name}`,
  student_code: `DEMO-${i + 1}`, class_name: '합성 반', class_key: 'DEMO', level_current: 'Lv2',
}));
fs.mkdirSync(dir, { recursive: true });
if (process.argv.includes('--빌드') || !fs.existsSync(path.join(dir, 'records.js'))) {
  const result = spawnSync(process.execPath, ['tools/앱시작.js', 'export:embed', '--platform', 'web', '--dev', 'false', '--reset-cache',
    '--entry-file', 'tools/학생기록미리보기화면.js', '--bundle-output', 'dist/student-records-preview/records.js',
    '--assets-dest', 'dist/student-records-preview'], { cwd: root, stdio: 'inherit', env: { ...process.env,
    EXPO_PUBLIC_SUPABASE_URL: base, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-preview' } });
  if (result.status !== 0) process.exit(result.status || 1);
}
const html = '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SYNK 학생 기록 · 합성 미리보기</title><style>html,body,#root{height:100%;margin:0}#root{display:flex;flex-direction:column}</style><div id="root"></div><script src="/records.js"></script></html>';
const mime = { '.js': 'text/javascript; charset=utf-8', '.ttf': 'font/ttf', '.png': 'image/png', '.webp': 'image/webp' };
http.createServer((req, res) => {
  const url = new URL(req.url, base);
  const json = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  if (url.pathname === '/functions/v1/teach/records/roster') return json({ ok: true, contract_ver: 'c16', roster: ids });
  if (url.pathname === '/functions/v1/teach/records/student') {
    const student = ids.find((s) => s.learner_id === url.searchParams.get('learner_id'));
    if (!student) return json({ ok: false, error: { code: 'NOT_ASSIGNED', message: '현재 담당 학생의 기록만 볼 수 있습니다' } }, 403);
    const index = ids.indexOf(student);
    if (index === 3) return json({ ok: false, error: { code: 'INTERNAL', message: '잠시 뒤 다시 시도해 주세요', retryable: true } }, 500);
    const empty = { items: [], has_more: false };
    return json({ ok: true, contract_ver: 'c16', student, retrieved_at: '2026-09-11T03:00:00Z', limit: 10,
      learning_access: index === 2 ? 'consent_required' : 'available',
      observations: index === 1 ? empty : { has_more: false, items: [
        { occurred_at: '2026-09-11T02:00:00Z', area: '태도', note_text: '짝의 말을 끝까지 기다린 뒤 자기 생각을 말했어요. 지난 수업에서는 말하기를 망설였지만, 오늘은 스스로 첫 문장을 시작했어요.' },
        { occurred_at: '2026-09-10T02:30:00Z', area: '발음', note_text: '받침이 있는 문장을 천천히 다시 말했어요.' },
      ] },
      submissions: index ? empty : { has_more: false, items: [{ occurred_at: '2026-09-11T01:00:00Z', task_format: '낭독' }] },
      feedback: index ? empty : { has_more: false, items: [{ created_at: '2026-09-11T02:40:00Z', updated_at: null, disposition: 'retry', body: '문장 끝을 조금 더 천천히 말해 봐요. 숨을 한 번 고르고 다시 말해도 괜찮아요.' }] },
    });
  }
  if (url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(html); }
  let decoded; try { decoded = decodeURIComponent(url.pathname); } catch { return json({ error: 'bad path' }, 400); }
  const file = path.resolve(dir, '.' + decoded);
  if (!file.startsWith(dir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return json({ error: 'not found' }, 404);
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(fs.readFileSync(file));
}).listen(18782, '127.0.0.1', () => console.log('실제 학생 기록 컴포넌트 · 합성 자료: ' + base));
