'use strict';
// 실제 Deno 엔트리 + 합성 DB/벤더. 실학생·키·네트워크 0; PostgreSQL 잠금 실측은 별도다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { 세우기 } = require('./lib/서버함수세우기.js');
const engine = require('../lib/교정엔진.js');
const consent = require('../lib/동의게이트.js');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'supabase/functions/correct/index.ts'), 'utf8');
const bundled = require('../supabase/functions/correct/동봉.json');
const prompt = fs.readFileSync(path.join(root, 'prompts/교정.md'), 'utf8');
const sid = '00000000-0000-4000-8000-000000000001';
const aid = '00000000-0000-4000-8000-000000000002';
const raw = 'synthetic-private sample@example.invalid voice/private/sample.wav Bearer synthetic-secret';
const flatten = (s) => s.replace(/\s+/g, ' ').trim();

function setup(options = {}) {
  const state = { now: Date.parse('2026-09-11T00:00:00Z'), consent: true, deleted: false,
    status: 'pending', stored: false, lease: 0, batch: null, writes: 0, claims: 0,
    vendorPosts: 0, vendorGets: 0, receipt: null, logs: [], queries: [], sent: [], ...(options.initial || {}) };
  if (state.batch && !state.receipt) state.receipt = 'synthetic-batch';
  const eligible = () => state.consent && !state.deleted
    && !['discarded', 'revoked', 'verified'].includes(state.status) && !state.stored;
  function guards(q) {
    assert.ok(q.includes(flatten(consent.지금유효술어)), '현재 동의 술어 보존');
    assert.match(q, /audio_deleted_at is null/);
    assert.match(q, /submission.created/);
    assert.match(q, /discarded.*revoked.*verified/);
  }
  async function execute(q, values) {
    state.queries.push(q);
    if (q.startsWith('select count(*)')) { guards(q); return [{ count: eligible() ? 1 : 0 }]; }
    if (q.startsWith('select name')) return [{ name: '20260911070000_correct_automation_c16.sql' }];
    if (q.startsWith('select s.submission_id, j.attempt_id')) {
      guards(q); return eligible() && state.receipt ? [{ submission_id: sid, attempt_id: aid, correction_batch_id: state.receipt }] : [];
    }
    if (q.startsWith('select s.submission_id from') && q.includes('l.is_test = true')) {
      return options.notTest ? [] : [{ submission_id: sid }];
    }
    if (q.startsWith('select s.submission_id, btrim')) {
      guards(q); return eligible() && !state.receipt && state.lease <= state.now
        ? [{ submission_id: sid, 문장: '오늘 학교에 갔어요.', 급수: 'Lv1', 시즌목표: null }] : [];
    }
    if (q.startsWith('update engine.pipeline_jobs p')) {
      guards(q); assert.match(q, /p.lease_until is null or p.lease_until <= now\(\)/);
      if (!eligible() || state.lease > state.now || state.receipt) return [];
      state.claims++; state.lease = state.now + 23 * 3600_000; state.receipt = values[1];
      options.afterClaim?.(state);
      return [{ submission_id: sid, attempt_id: aid }];
    }
    if (q.startsWith('update engine.pipeline_jobs set correction_batch_id')) {
      if (options.receiptWriteError) throw new Error(raw);
      if (q.includes('correction_batch_id = null')) {
        assert.match(q, /attempt_id =/); assert.match(q, /and correction_batch_id =/);
        state.receipt = null; state.lease = 0; return [];
      }
      state.receipt = values[0]; return [{ submission_id: sid }];
    }
    if (q.startsWith('select s.submission_id from')) {
      guards(q); options.beforeEligibility?.(state);
      if (q.includes('j.attempt_id =') && !q.includes('any(')) assert.match(q, /j.correction_batch_id =/);
      return eligible() && !options.staleAttempt ? [{ submission_id: sid }] : [];
    }
    if (q.startsWith('select job_id')) {
      assert.match(q, /for update$/); return [{ job_id: aid }];
    }
    if (q.startsWith('insert into engine.corrections')) {
      guards(q); assert.match(q, /where not exists/);
      assert.match(q, /j.attempt_id =/); assert.match(q, /j.correction_batch_id is not distinct from/);
      options.beforeStore?.(state);
      if (options.writeError) throw new Error(raw);
      if (!eligible() || options.staleAtStore) return [];
      state.stored = true; state.writes++;
      state.correction = { correction_id: aid, submission_id: sid, corrected_text: values[1],
        error_tags: values[2], explanation: values[3], actor_kind: 'ai', confirmed_at: '2026-09-11T00:00:00Z' };
      return [{ correction_id: aid }];
    }
    throw new Error(`Unknown synthetic query: ${q}`);
  }
  function sql(strings, ...values) {
    const q = flatten(strings.reduce((s, part, i) => s + part
      + (i < values.length ? values[i]?.fragment || '?' : ''), ''));
    return { fragment: q, then(resolve, reject) { return execute(q, values).then(resolve, reject); } };
  }
  // 두 호출의 짧은 저장 트랜잭션을 직렬화한다. 실 DB의 FOR UPDATE 동작과 별도로 구분한다.
  let tail = Promise.resolve();
  sql.begin = async (run) => {
    const previous = tail; let release;
    tail = new Promise((resolve) => { release = resolve; });
    await previous;
    try { return await run(sql); } finally { release(); }
  };
  const modules = { 'npm:postgres@3.4.9': () => sql };
  for (const [name, relative] of Object.entries(bundled)) {
    modules['./' + name] = relative.endsWith('.md') ? prompt : require(path.join(root, relative));
  }
  modules['./토큰.mjs'] = { 서비스역할: (r) => r.headers.get('Authorization') === 'Bearer synthetic-service' };
  modules['./처리장부.mjs'] = {
    실패적기: async (_sql, _id, reason, message) => {
      assert.ok(!message); state.logs.push(reason); return '적힘';
    }, 성공적기: async () => '적힘',
  };
  const output = () => JSON.stringify({ 고친문장: '오늘 학교에 갔어요.', 오류태그: options.tags || ['오류없음'],
    오늘의포인트: 'Сайн байна.', 칭찬: 'Сайн байна.', 다음미션: 'Дахин хэлээрэй.' });
  const message = () => ({ model: engine.모델, usage: { input_tokens: 20, output_tokens: 50 },
    content: [{ type: 'text', text: output() }] });
  class Clock extends Date { static now() { return state.now; } }
  const handler = 세우기(source, {
    파일: 'synthetic-correct.ts', 모듈: modules, Date: Clock,
    환경: { SUPABASE_DB_URL: 'synthetic-db', ANTHROPIC_API_KEY: options.noKey ? '' : 'synthetic-api' },
    console: { error: (...a) => state.logs.push(a) },
    fetch: async (url, init = {}) => {
      assert.equal(init.redirect, 'error'); assert.ok(init.signal);
      if (init.method === 'POST') {
        state.vendorPosts++; const body = JSON.parse(init.body); state.sent.push(body);
        if (url === engine.메시지경로) return Response.json(message());
        assert.equal(url, engine.배치경로); assert.equal(body.requests.length, 1);
        assert.equal(body.requests[0].params.model, 'claude-sonnet-5');
        assert.equal(body.requests[0].params.thinking.type, 'disabled');
        assert.ok(body.requests[0].custom_id.length <= 64);
        assert.equal(body.requests[0].custom_id.includes(sid), false);
        state.batch = 'in_progress';
        if (options.uncertain) { if (options.notAccepted) state.batch = null; throw new Error(raw); }
        if (options.postStatus) return new Response(raw, { status: options.postStatus });
        return Response.json({ id: 'synthetic-batch' });
      }
      state.vendorGets++;
      if (url.includes('?limit=')) {
        if (options.forbidList) throw new Error('Shared-workspace listing is forbidden in ordinary path');
        if (options.listStatus) return new Response(raw, { status: options.listStatus });
        if (options.timeout) throw new Error(raw);
        if (options.endlessPages) return Response.json({ data: [], has_more: true, last_id: 'page' + state.vendorGets });
        if (options.deepPage && !url.includes('after_id=')) return Response.json({ data: [], has_more: true, last_id: 'synthetic-page' });
        return Response.json({ data: state.batch ? [{ id: 'synthetic-batch', processing_status: state.batch,
          created_at: '2026-09-11T00:00:00Z' }] : [], has_more: false });
      }
      if (url === engine.배치경로 + '/synthetic-batch') {
        if (options.listStatus) return new Response(raw, { status: options.listStatus });
        if (options.timeout) throw new Error(raw);
        return Response.json({ id: 'synthetic-batch', processing_status: state.batch });
      }
      assert.equal(url, engine.배치경로 + '/synthetic-batch/results');
      options.duringResults?.(state);
      if (options.resultsStatus) return new Response(raw, { status: options.resultsStatus });
      return new Response(JSON.stringify({ custom_id: `a${aid.replace(/-/g, '')}_${engine.교정요청판(prompt)}`,
        result: options.result || { type: 'succeeded', message: message() } }) + '\n');
    },
  });
  return { state, async call(query = '', authorized = true) {
    const r = await handler(new Request('https://function.invalid/correct' + query,
      { method: 'POST', headers: authorized ? { Authorization: 'Bearer synthetic-service' } : {} }));
    return { status: r.status, body: await r.json() };
  } };
}

test('service role 밖의 요청은 DB/벤더를 열지 않는다', async () => {
  const t = setup(); assert.equal((await t.call('', false)).status, 401);
  assert.equal(t.state.queries.length, 0); assert.equal(t.state.vendorPosts, 0);
});
for (const initial of [{ consent: false }, { deleted: true }, { status: 'revoked' }, { status: 'discarded' }, { status: 'verified' }]) {
  test('철회·삭제·제외된 원문은 새 전송과 회수 저장을 막는다: ' + JSON.stringify(initial), async () => {
    const t = setup({ initial: { ...initial, batch: 'ended' } }); await t.call();
    assert.equal(t.state.writes, 0); assert.equal(t.state.vendorPosts, 0); assert.equal(t.state.vendorGets, 0);
  });
}
test('빈 대기는 벤더 목록 조회조차 하지 않는다', async () => {
  const t = setup({ initial: { stored: true } }); const r = await t.call('?회수=1');
  assert.equal(r.body.이유, 'nothing_to_collect'); assert.equal(t.state.vendorGets, 0);
});
test('야간 제출 → 벤더 완료 → 회수-only 저장 → 재호출 no-op', async () => {
  const t = setup(); assert.equal((await t.call()).body.제출, 1);
  assert.equal(t.state.writes, 0); t.state.batch = 'ended';
  assert.equal((await t.call('?회수=1')).body.적음, 1);
  await t.call('?회수=1'); assert.equal(t.state.writes, 1); assert.equal(t.state.vendorPosts, 1);
});
test('회수-only는 즉시 파라미터가 같이 와도 벤더 POST를 하지 않는다', async () => {
  const t = setup({ initial: { batch: 'ended' } }); const r = await t.call('?회수=1&즉시=1');
  assert.equal(r.body.무시한즉시, true); assert.equal(t.state.vendorPosts, 0); assert.equal(t.state.writes, 1);
});
test('동시 신규 실행은 기존 lease를 한 번만 획득해 유료 제출도 한 번이다', async () => {
  const t = setup(); await Promise.all([t.call(), t.call()]);
  assert.equal(t.state.claims, 1); assert.equal(t.state.vendorPosts, 1);
});
test('동시 회수는 단건 잠금 뒤 NOT EXISTS를 다시 보아 한 번만 저장한다', async () => {
  const t = setup({ initial: { batch: 'ended' } }); await Promise.all([t.call('?회수=1'), t.call('?회수=1')]);
  assert.equal(t.state.writes, 1); assert.equal(t.state.vendorPosts, 0);
});
test('점유 직후 동의가 철회되면 HTTP를 보내지 않는다', async () => {
  const t = setup({ afterClaim: (s) => { if (s.claims === 1) s.consent = false; } }); await t.call();
  assert.equal(t.state.vendorPosts, 0); assert.equal(t.state.writes, 0);
  assert.equal(t.state.receipt, null); assert.equal(t.state.lease, 0);
  t.state.consent = true;
  assert.equal((await t.call()).body.제출, 1); assert.equal(t.state.vendorPosts, 1);
});

test('전송 전 시간 소진은 fetch 0회이며 같은 attempt만 해제해 다음 회차가 집는다', async () => {
  let exhausted = false;
  const t = setup({ beforeEligibility: (s) => { if (!exhausted) { s.now += 120000; exhausted = true; } } });
  assert.equal((await t.call()).status, 503);
  assert.equal(t.state.vendorPosts, 0); assert.equal(t.state.receipt, null); assert.equal(t.state.lease, 0);
  assert.equal((await t.call()).body.제출, 1); assert.equal(t.state.vendorPosts, 1);
});
test('결과 다운로드 중 철회되면 교정을 저장하지 않는다', async () => {
  const t = setup({ initial: { batch: 'ended' }, duringResults: (s) => { s.consent = false; } }); await t.call('?회수=1');
  assert.equal(t.state.writes, 0);
});
test('저장 직전 철회·삭제도 마지막 SQL 술어가 막는다', async () => {
  for (const field of ['consent', 'deleted']) {
    const t = setup({ initial: { batch: 'ended' }, beforeStore: (s) => { s[field] = field === 'deleted'; } });
    await t.call('?회수=1'); assert.equal(t.state.writes, 0);
  }
});
test('불확실한 제출 응답은 lease 만료 뒤에도 접수 부재가 확인되기 전 재과금하지 않는다', async () => {
  const t = setup({ uncertain: true, notAccepted: true });
  assert.equal((await t.call()).status, 503); await t.call();
  assert.equal(t.state.vendorPosts, 1);
  t.state.now += 24 * 3600_000; await t.call();
  assert.equal(t.state.vendorPosts, 1, '목록 부재는 미접수 증명이 아니므로 자동 재과금 금지');
  assert.equal((await t.call('?회수=1')).body.needs_attention, true);
});
test('lease가 만료돼도 벤더가 처리 중이면 새 제출은 막는다', async () => {
  const t = setup({ uncertain: true }); await t.call();
  t.state.now += 24 * 3600_000; assert.equal((await t.call()).body.이유, 'batch_receipt_unresolved');
  assert.equal(t.state.vendorPosts, 1);
});
test('키·벤더 목록·제출 실패와 타임아웃은 회차 장부가 식별할 비정상 HTTP다', async () => {
  for (const config of [{ noKey: true }, { listStatus: 401, initial: { batch: 'ended' } },
    { postStatus: 429 }, { timeout: true, initial: { batch: 'ended' } }]) {
    const t = setup(config); const r = await t.call(); assert.ok(r.status >= 500);
    assert.equal(JSON.stringify([r, t.state.logs]).includes(raw), false);
  }
});
test('공급자 원문·DB 예외·학생 식별자는 응답/로그에 남지 않는다', async () => {
  const t = setup({ initial: { batch: 'ended' }, writeError: true }); const r = await t.call('?회수=1');
  const exposed = JSON.stringify([r.body, t.state.logs]);
  for (const forbidden of [raw, sid, 'sample@example.invalid', 'synthetic-secret']) assert.equal(exposed.includes(forbidden), false);
});
test('상충 태그는 자동 회수에서도 부분 저장하지 않는다', async () => {
  const t = setup({ initial: { batch: 'ended' }, tags: ['오류없음', '높임:주체'] }); const r = await t.call('?회수=1');
  assert.equal(t.state.writes, 0); assert.equal(r.body.버림.상충태그, 1);
  assert.equal(r.status, 502); assert.equal(r.body.needs_attention, true);
  t.state.now += 48 * 3600_000;
  const next = await t.call(); assert.equal(next.status, 502); assert.equal(next.body.needs_attention, true);
  assert.equal(next.body.이유, 'batch_result_needs_attention');
  assert.equal(t.state.vendorPosts, 0); assert.equal(t.state.receipt, 'synthetic-batch');
});

test('종료된 벤더 오류는 receipt를 보존하고 비정상/주의로 보고해 몰래 재과금하지 않는다', async () => {
  const t = setup({ initial: { batch: 'ended' }, result: { type: 'errored', error: { type: 'api_error', message: raw } } });
  const r = await t.call('?회수=1'); assert.equal(r.status, 502); assert.equal(r.body.needs_attention, true);
  assert.equal(r.body.결과실패, 1); assert.equal(t.state.receipt, 'synthetic-batch');
  assert.equal(t.state.writes, 0); assert.equal(t.state.vendorPosts, 0);
  assert.equal(JSON.stringify([r, t.state.logs]).includes(raw), false);
});

test('확정 영수증은 workspace 목록 밖에 있어도 직접 회수한다', async () => {
  const t = setup({ initial: { batch: 'ended' }, forbidList: true });
  assert.equal((await t.call('?회수=1')).body.적음, 1);
  assert.equal(t.state.vendorGets, 2); assert.equal(t.state.vendorPosts, 0);
});

test('미확정 접수는 다음 페이지의 같은 시도 결과로 복구하고 재과금하지 않는다', async () => {
  const t = setup({ uncertain: true, deepPage: true }); await t.call();
  t.state.batch = 'ended';
  const r = await t.call('?회수=1');
  assert.equal(r.status, 200); assert.equal(r.body.적음, 1); assert.equal(r.body.needs_attention, false);
  assert.equal(t.state.vendorPosts, 1); assert.equal(t.state.receipt, 'synthetic-batch');
});

test('무한 페이지 응답은 20페이지에서 멈추며 실패/미확정을 드러낸다', async () => {
  const t = setup({ initial: { receipt: 'submitting' }, endlessPages: true });
  const r = await t.call('?회수=1'); assert.equal(r.status, 502); assert.equal(r.body.needs_attention, true);
  assert.equal(t.state.vendorGets, 20); assert.equal(t.state.vendorPosts, 0);
});

test('회수 HTTP 오류는 비정상 회차이며 새 배치를 내보내지 않는다', async () => {
  const t = setup({ initial: { batch: 'ended' }, resultsStatus: 500 }); const r = await t.call();
  assert.equal(r.status, 502); assert.equal(r.body.버림['회수실패:500'], 1);
  assert.equal(t.state.writes, 0); assert.equal(t.state.vendorPosts, 0);
});

test('유령 워커의 이전 시도는 조회/저장 fence 각각에서 차단된다', async () => {
  for (const option of ['staleAttempt', 'staleAtStore']) {
    const t = setup({ initial: { batch: 'ended' }, [option]: true }); await t.call('?회수=1');
    assert.equal(t.state.writes, 0);
  }
});

test('시험제출은 실제 학생이면 거절하고 시험 제출만 한정한다', async () => {
  const t = setup({ notTest: true }); assert.equal((await t.call('?시험제출=' + sid)).status, 403);
  assert.equal(t.state.vendorPosts, 0);
  const yes = setup(); assert.equal((await yes.call('?시험제출=' + sid)).body.제출, 1);
  assert.ok(yes.state.queries.some((q) => q.startsWith('select count') && /s.submission_id =/.test(q)));
  assert.ok(yes.state.queries.some((q) => q.startsWith('select s.submission_id, btrim') && /s.submission_id =/.test(q)));
});

test('명시적 벤더 접수 거절은 원문을 못박지 않고 다음 회차 재시도를 허용한다', async () => {
  const t = setup({ postStatus: 429 }); assert.equal((await t.call()).status, 502);
  assert.equal(t.state.receipt, null); assert.equal(t.state.lease, 0);
  assert.equal(t.state.vendorPosts, 1, '같은 호출 안에서는 재시도하지 않는다');
});

test('배치 저장 → 학생 corrections API → 앱 교정 API/답장 갱신에서 ai 표시를 보존한다', async () => {
  const t = setup(); await t.call(); t.state.batch = 'ended'; await t.call('?회수=1');
  const bundle = require('../supabase/functions/corrections/동봉.json');
  const modules = {};
  const learner = '00000000-0000-4000-8000-000000000003';
  function sql(strings, ...values) {
    const q = flatten(strings.reduce((s, part, i) => s + part + (i < values.length ? values[i]?.fragment || '?' : ''), ''));
    return { fragment: q, then(resolve, reject) {
      const result = (async () => {
        if (q.startsWith('select (select learner_id')) return [{ learner_id: learner, 최신조각: '20260911070000_correct_automation_c16.sql' }];
        assert.match(q, /e.learner_id =/); assert.ok(values.includes(learner), '학생은 토큰에서 온 자기 행만 읽는다');
        if (q.startsWith('select c.correction_id, c.submission_id')) {
          assert.doesNotMatch(q, /actor_kind = 'teacher'/);
          return [t.state.correction];
        }
        if (q.startsWith('select c.correction_id, c.error_tags')) return [];
        throw new Error('Unexpected student read query');
      })(); return result.then(resolve, reject);
    } };
  }
  modules['npm:postgres@3.4.9'] = () => sql;
  for (const [name, relative] of Object.entries(bundle)) modules['./' + name] = require(path.join(root, relative));
  modules['./토큰.mjs'] = { 토큰주체: () => learner, 발급시각: () => 1,
    살아있는학생: () => sql`auth_id = ${learner}::uuid` };
  modules['./동의게이트.mjs'] = { 지금유효: async () => [{ consent_ver: 'v1' }], 거절몸통: { code: 'CONSENT_MISSING' } };
  const server = 세우기(fs.readFileSync(path.join(root, 'supabase/functions/corrections/index.ts'), 'utf8'),
    { 모듈: modules, 환경: { SUPABASE_DB_URL: 'synthetic-db' }, console: { error: () => {} } });
  const app = require('./lib/앱모듈세우기.js').세우기(path.join(root, 'src/교정API.js'),
    async (url, init) => server(new Request(url, init)));
  const reply = await new Promise((resolve, reject) => {
    const refresh = require('../lib/답장갱신.js').답장갱신기({ 읽기: () => app.교정목록받기('synthetic-student'),
      받기: (r) => { refresh.종료(); resolve(r); }, 오류: reject }); refresh.새로읽기();
  });
  assert.equal(reply.목록.length, 1);
  assert.equal(reply.목록[0].actor_kind, 'ai');
  assert.equal(reply.목록[0].corrected_text, '오늘 학교에 갔어요.');
  assert.equal(t.state.vendorPosts, 1, '앱 조회는 추가 AI 호출이 아니다');
});
