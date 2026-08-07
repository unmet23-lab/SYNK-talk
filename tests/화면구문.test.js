'use strict';
/**
 * 소스 구문 검사 — 이 저장소에서 `node --check` 가 **못 보는 파일들**이 실제로 파싱되는가.
 *
 * 🔴 **왜 새로 만드나 — `node --check` 는 이 파일들을 검사하지 못한다.**
 *   2026-08-07 실측: 함수 안에 든 JSX 를 `node --check` 가 **그대로 통과시켰다**(exit 0).
 *   즉 화면 파일에 대해서는 「구문검사를 돌렸다」가 **아무것도 안 본 것**과 같은 모양이었고,
 *   `src/` 540줄짜리 화면이 여태 그 상태로 있었다. 통과와 미실행이 같은 모양이면 안 된다.
 *   그래서 JSX 를 아는 파서(@babel/parser · Expo 가 이미 들고 있다)로 직접 판다.
 *
 * 🔴 **범위가 구멍이었다 — 2026-08-07 두 번째 실사고.**
 *   이 검사가 `src/` 만 보는 사이 `supabase/functions/<이름>/index.ts` 는 아무도 안 팠다.
 *   (표기 주의 — 여기에 glob 을 그대로 적으면 `*` 와 `/` 가 이 주석을 끊는다 · F156)
 *   `events/index.ts` 의 SQL 템플릿 리터럴 **안**에 백틱을 쓴 주석이 들어가 문자열이
 *   거기서 끊겼는데, 회귀 370/370 이 초록인 채로 **함수는 번들조차 되지 않았다**
 *   (Supabase 배포가 HTTP 400 으로 거절 — 초록과 「배포 불가」가 공존했다).
 *   같은 파일형·같은 실패 모양인데 필터만 좁았다 = 그 자체가 구멍(CLAUDE.md 신뢰성 ③).
 *   그래서 대상 목록을 **한 곳에서 파생**시킨다 — 두 곳에 적으면 다시 갈라진다(④).
 *
 * ⚠ 이건 **구문**만 본다. 렌더가 맞는지는 화면을, 도는지는 배포를 띄워야 안다(다른 층이다).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const ROOT = path.join(__dirname, '..');
const JSX옵션 = { sourceType: 'module', plugins: ['jsx'] };
const TS옵션 = { sourceType: 'module', plugins: ['typescript'] };

/** 검사 대상 — 한 곳에서만 만든다. 새 층이 생기면 여기만 늘린다. */
function 대상들() {
  const 목록 = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'src'))) {
    if (f.endsWith('.js')) 목록.push({ 이름: `src/${f}`, 경로: path.join(ROOT, 'src', f), 옵션: JSX옵션 });
  }
  const FN = path.join(ROOT, 'supabase', 'functions');
  for (const d of fs.readdirSync(FN, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const p = path.join(FN, d.name, 'index.ts');
    if (fs.existsSync(p)) 목록.push({ 이름: `supabase/functions/${d.name}/index.ts`, 경로: p, 옵션: TS옵션 });
  }
  return 목록;
}

const 목록 = 대상들();

test('대상이 두 층 다 잡힌다 (0개면 아래 검사가 무엇이든 통과한다)', () => {
  const 화면 = 목록.filter((t) => t.이름.startsWith('src/')).length;
  const 함수 = 목록.filter((t) => t.이름.startsWith('supabase/')).length;
  assert.ok(화면 >= 4, `src/*.js 가 ${화면}개다 — 목록 규칙이 낡았다`);
  assert.ok(함수 >= 3, `Edge Function 이 ${함수}개다 — 배포 대상이 검사 밖으로 샜다`);
});

for (const t of 목록) {
  test(`구문: ${t.이름}`, () => {
    const src = fs.readFileSync(t.경로, 'utf8');
    assert.doesNotThrow(() => parser.parse(src, t.옵션), `${t.이름} 가 파싱되지 않는다`);
  });
}

test('탐지력 픽스처 — 깨진 JSX 를 실제로 잡는다', () => {
  /* 실저장소를 픽스처로 쓰지 않는다. 여기서 못박는 것은 **파서가 실제로 판다**는 사실이다 —
   * 이 단언이 없으면 위 검사들은 파서가 무엇이든 삼켜도 초록이다. */
  assert.throws(() => parser.parse('export default () => (<View><Text>안녕</View>);', JSX옵션),
    '닫는 태그가 어긋났는데 통과했다 — 파서가 JSX 를 안 보고 있다');
  assert.throws(() => parser.parse('const a = {;', JSX옵션),
    '평범한 구문 오류도 못 잡는다');
  assert.doesNotThrow(() => parser.parse('export default () => (<View><Text>안녕</Text></View>);', JSX옵션),
    '멀쩡한 JSX 를 막으면 위 검사가 거짓 경보가 된다');
});

test('탐지력 픽스처 — 템플릿 리터럴 안의 백틱 주석을 실제로 잡는다 (실사고 재현)', () => {
  /* 사고 그대로의 축소판: SQL 템플릿 안에 `/* … *\/` 주석을 두고 그 안에서 낱말을
   * 백틱으로 감쌌다. 사람 눈에는 주석이지만 JS 에게는 **문자열의 끝**이다. */
  const 사고 = [
    'const q = tx`insert into t (a) values (',
    '  /* 이 한 칸이 빠져 `x.viewed`·`x.responded` 가 거절됐다 */',
    '  ${v}',
    ')`;',
  ].join('\n');
  assert.throws(() => parser.parse(사고, TS옵션),
    '템플릿 안 백틱을 통과시켰다 — 이 검사는 사고를 못 잡는다');

  const 고침 = 사고.replace(/`x\.viewed`·`x\.responded`/, '「x.viewed」·「x.responded」');
  assert.doesNotThrow(() => parser.parse(고침, TS옵션),
    '멀쩡한 주석을 막으면 위 검사가 거짓 경보가 된다');

  /* 타입 주석을 실제로 파는지 — plugins 를 빼먹으면 위 단언들이 다른 이유로 통과한다. */
  assert.doesNotThrow(() => parser.parse('const a = (b ?? null) as string | null;', TS옵션),
    'TS 를 안 보고 있다 — 옵션이 틀렸다');
});
