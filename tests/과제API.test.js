'use strict';
/**
 * 과제 API 회귀 (C0 §4-3 ①) — **「왜 비었나」가 앱까지 닿는가**.
 *
 * 왜 있나 (F176 ①): `GET /v1/tasks` 는 막힌 학생에게 `data: []` + `blocked` 를 준다.
 * 서버가 이유를 실어도 **이 파일이 버리면 화면은 여전히 이유를 모른다** — 그 상태의 증상은
 * 「오늘 받은 과제가 아직 없어요」 하나뿐이라, 배치가 안 돈 날과 구별이 안 되고 학생은 기다린다.
 * 실왕복(`tools/배달왕복시험.js` ⑧)은 서버 응답까지만 재고 이 모듈은 지나가지 않는다.
 *
 * 🔴 `src/*.js` 는 ESM 인데 이 저장소의 테스트는 CJS 다 — `인증API.test.js` 와 같은 이유로
 *   @babel/core(Expo 가 이미 들고 있다)로 바꿔 **실제로 돌린다**. 새 의존성 0.
 * ⚠ 네트워크는 안 탄다 — `fetch` 를 가짜로 심는다.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const vm = require('vm');
const babel = require('@babel/core');

const SRC = path.join(__dirname, '..', 'src', '과제API.js');

/** 응답 하나를 주는 가짜 fetch 와 함께 모듈을 세운다. */
function 세우기(몸, status = 200) {
  const { code } = babel.transformFileSync(SRC, {
    babelrc: false,
    configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const module_ = { exports: {} };
  vm.runInNewContext(code, {
    module: module_,
    exports: module_.exports,
    require: (p) => require(path.resolve(path.dirname(SRC), p)),
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon' } },
    fetch: async () => ({ ok: status < 400, status, json: async () => 몸 }),
    console,
  });
  return module_.exports;
}

test('🔴 막힘이 앱까지 그대로 온다 — 서버가 실은 이유를 이 층에서 버리지 않는다', async () => {
  const API = 세우기({ ok: true, data: [], blocked: { code: 'CONSENT_MISSING' }, contract_ver: 'c8' });
  const r = await API.오늘과제받기('토큰');
  assert.equal(r.항목, null, '빈 배열은 그대로 빈 것이다 — 여기서 던지면 화면이 「고장」이 된다');
  assert.deepEqual(r.막힘, { code: 'CONSENT_MISSING' });
});

test('🔴 과제가 있어도 막힘을 잰다 — 배정 뒤 철회한 학생은 과제를 보면서 업로드만 막힌다', async () => {
  const API = 세우기({ ok: true, data: [{ task_id: 't1' }], blocked: { code: 'CONSENT_MISSING' } });
  const r = await API.오늘과제받기('토큰');
  assert.equal(r.항목.task_id, 't1');
  assert.deepEqual(r.막힘, { code: 'CONSENT_MISSING' },
    '🔴 「비었을 때만」 읽으면 막힘이 측정이 아니라 추측이 된다');
});

test('막히지 않은 날은 null 이다 — 없는 것을 있는 척하지 않는다', async () => {
  const API = 세우기({ ok: true, data: [{ task_id: 't1' }], blocked: null });
  assert.equal((await API.오늘과제받기('토큰')).막힘, null);
});
