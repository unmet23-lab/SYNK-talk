'use strict';
// 실제 teach 엔트리 + 현재 동의/계약 모듈을 합성 DB로 실행한다. 운영 권한·DB 실측을 대신하지 않는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { 세우기 } = require('./lib/서버함수세우기.js');
const root = path.join(__dirname, '..');
const file = path.join(root, 'supabase/functions/teach/index.ts');
const source = fs.readFileSync(file, 'utf8');
const bundle = JSON.parse(fs.readFileSync(path.join(root, 'supabase/functions/teach/동봉.json'), 'utf8'));
const learner = '10000000-0000-4000-8000-000000000001';
const staff = '20000000-0000-4000-8000-000000000001';
const when = '2026-09-10T03:00:00Z';
const consent = require('../lib/동의게이트.js');
const secret = 'synthetic-private-original audio/private/example.wav contact@example.invalid';

function setup(options = {}) {
  const seen = { queries: [], audit: 0, vendor: 0, consentChecks: 0, consentClocks: [] };
  async function execute(q, args, insideTransaction) {
    seen.queries.push(q);
    if (q.startsWith('select (select staff_id')) {
      assert.match(q, /role = any/);
      return [{ staff_id: options.notStaff ? null : staff, 최신조각: '20260911070000_engine_c16.sql' }];
    }
    if (q.startsWith('select l.learner_id')) {
      assert.match(q, /engine.staff_classes sc/); assert.match(q, /sc.staff_id = \?/);
      assert.match(q, /c.active/); assert.match(q, /l.active/);
      if (q.includes('l.learner_id =')) assert.ok(args.includes(learner));
      return options.unassigned ? [] : [{ learner_id: learner, display_name: '합성 학생',
        student_code: 'DEMO-RECORD', level_current: 'Lv2', class_key: 'DEMO', class_name: '합성 반',
        body_original: secret, phone: secret, risk: secret }];
    }
    if (q.startsWith('select e.occurred_at')) {
      assert.match(q, /observation.noted/); assert.match(q, /actor_kind = 'teacher'/);
      assert.ok(args.includes(learner));
      return options.empty ? [] : Array.from({ length: options.many ? 11 : 1 }, () => ({
        occurred_at: when, area: '태도', note_text: '짝의 말을 기다린 뒤 말했어요.', body_original: secret,
      }));
    }
    if (q.startsWith('select consent_id, consent_ver')) {
      seen.consentChecks += 1;
      // PostgreSQL now(): 같은 tx는 03:00:00 고정, tx 뒤 새 질의는 03:00:10.
      // 철회가 03:00:05이면 tx 안에서 두 번 읽어도 둘 다 유효라고 나오는 결함을 재현한다.
      const now = insideTransaction ? '2026-09-11T03:00:00Z' : '2026-09-11T03:00:10Z';
      seen.consentClocks.push(now);
      if (!insideTransaction && options.finalConsentError) throw new Error('synthetic final consent failure');
      const revoked = options.revokeDuring ? '2026-09-11T03:00:05Z' : null;
      return options.noConsent || (revoked && Date.parse(revoked) <= Date.parse(now)) ? [] : [{ consent_id: 'synthetic-consent' }];
    }
    if (q.startsWith('select exists (select consent_id, consent_ver')) {
      assert.equal(insideTransaction, false, '최종 동의는 감사 tx가 끝난 뒤의 새 statement여야 한다');
      assert.match(q, /from unnest\(\?::timestamptz\[\]\) as t\(occurred_at\)/);
      assert.match(q, /where not exists \(select consent_id, consent_ver/);
      assert.match(q, /agreed_at <= t.occurred_at/);
      seen.consentChecks += 1; seen.consentClocks.push('2026-09-11T03:00:10Z');
      if (options.finalConsentError) throw new Error('synthetic final consent failure');
      const now = Date.parse('2026-09-11T03:00:10Z');
      const consents = options.noConsent ? [] : [{ agreed_at: '2026-09-01T00:00:00Z',
        revoked_at: options.revokeDuring || options.reconsentDuring ? '2026-09-11T03:00:05Z' : null }];
      if (options.reconsentDuring) consents.push({ agreed_at: '2026-09-11T03:00:09Z', revoked_at: null });
      const current = consents.some((c) => Date.parse(c.agreed_at) <= now
        && (c.revoked_at === null || Date.parse(c.revoked_at) > now));
      const sourceTimes = args.find(Array.isArray);
      assert.ok(sourceTimes, '실제 응답의 발화 시각들을 최종 질의에 실어야 한다');
      const historical = sourceTimes.every((time) => consents.some((c) => consent.그때유효평가(c, Date.parse(time), now)));
      return [{ valid: current && historical }];
    }
    if (q.startsWith('select s.occurred_at')) {
      assert.ok(args.includes(learner)); assert.match(q, /submission.created/);
      assert.match(q, /exists \(select consent_id, consent_ver from engine.consents/);
      assert.match(q, /agreed_at <= s.occurred_at/); assert.match(q, /revoked_at > now\(\)/);
      return options.empty || options.historicalConsentDenied ? [] : [{ occurred_at: when, task_format: '낭독', audio_ref: secret, transcript: secret }];
    }
    if (q.startsWith('select n.created_at')) {
      assert.ok(args.includes(learner)); assert.match(q, /e.event_id = s.event_id/);
      assert.match(q, /exists \(select consent_id, consent_ver from engine.consents/);
      assert.match(q, /agreed_at <= s.occurred_at/); assert.match(q, /revoked_at > now\(\)/);
      return options.empty || options.historicalConsentDenied ? [] : [{ created_at: when, submitted_at: when, updated_at: null, body: '다음에는 문장 끝을 천천히 말해 봐요.', disposition: 'retry', body_original: secret }];
    }
    if (q.startsWith('insert into engine.staff_access_log')) {
      if (options.auditFail) throw new Error('synthetic audit failure');
      seen.audit += 1; return [];
    }
    throw new Error('시험이 모르는 질의');
  }
  function tag(insideTransaction) {
    return function (parts, ...args) {
      const q = parts.reduce((s, p, i) => s + p + (i < args.length ? (args[i]?.query || '?') : ''), '').replace(/\s+/g, ' ').trim();
      return { query: q, then(resolve, reject) { return execute(q, args, insideTransaction).then(resolve, reject); } };
    };
  }
  const sql = tag(false);
  sql.begin = (run) => run(tag(true));
  sql.json = (value) => value;
  const modules = Object.fromEntries(Object.entries(bundle).map(([name, src]) => ['./' + name, require(path.join(root, src))]));
  modules['npm:postgres@3.4.4'] = () => sql;
  modules['./토큰.mjs'] = {
    토큰주체: (req) => req.headers.has('Authorization') ? staff : null,
    발급시각: () => 1, 살아있는직원: () => ({ query: 'active_staff' }),
  };
  const handle = 세우기(source, {
    파일: file, 모듈: modules, 환경: { SUPABASE_DB_URL: 'synthetic' },
    fetch: async () => { seen.vendor += 1; throw new Error('학생 기록은 외부 API를 부르면 안 된다'); },
    console: { error() {} },
  });
  return {
    seen,
    async call({ endpoint = `records/student?learner_id=${learner}`, auth = true, method = 'GET' } = {}) {
      const result = await handle(new Request('https://synthetic.invalid/teach/' + endpoint, {
        method, headers: { 'X-Contract-Ver': 'c16', ...(auth ? { Authorization: 'Bearer synthetic' } : {}) },
      }));
      return { status: result.status, body: await result.json() };
    },
  };
}

test('학생 기록은 기존 직원 인증·담당 반을 통과한다', async () => {
  assert.equal((await setup().call({ auth: false })).status, 401);
  assert.equal((await setup({ notStaff: true }).call()).status, 403);
  const denied = setup({ unassigned: true });
  assert.equal((await denied.call()).status, 403);
  assert.equal(denied.seen.queries.some((q) => q.startsWith('select e.occurred_at')), false);
});
test('담당 학생 기록은 현재 근거만 반환하고 개인정보·학생 원문은 싣지 않는다', async () => {
  const service = setup(); const reply = await service.call();
  assert.equal(reply.status, 200); assert.equal(reply.body.student.learner_id, learner);
  assert.equal(reply.body.observations.items.length, 1); assert.equal(reply.body.submissions.items.length, 1);
  assert.equal(reply.body.feedback.items.length, 1); assert.equal(reply.body.learning_access, 'available');
  assert.equal(JSON.stringify(reply.body).includes(secret), false);
  assert.equal(service.seen.audit, 1); assert.equal(service.seen.vendor, 0);
});
test('현재 동의가 없으면 관찰만 남고 학습·피드백은 조회하지 않는다', async () => {
  const service = setup({ noConsent: true }); const { body } = await service.call();
  assert.equal(body.learning_access, 'consent_required'); assert.equal(body.observations.items.length, 1);
  assert.equal(body.submissions.items.length, 0); assert.equal(body.feedback.items.length, 0);
  assert.equal(service.seen.queries.some((q) => q.startsWith('select s.occurred_at')), false);
});
test('조회 도중 철회된 학습·피드백은 응답에서도 빠진다', async () => {
  const service = setup({ revokeDuring: true }); const { body } = await service.call();
  assert.equal(service.seen.consentChecks, 2); assert.equal(body.learning_access, 'consent_required');
  assert.deepEqual(service.seen.consentClocks, ['2026-09-11T03:00:00Z', '2026-09-11T03:00:10Z']);
  assert.equal(body.submissions.items.length, 0); assert.equal(body.feedback.items.length, 0);
});
test('tx 뒤 동의 재조회가 실패하면 이미 읽은 기록을 보내지 않는다', async () => {
  const reply = await setup({ finalConsentError: true }).call();
  assert.equal(reply.status, 500); assert.equal(reply.body.student, undefined);
});
test('조회 도중 철회 후 재동의해도 과거 발화가 재동의보다 앞이면 기록을 되살리지 않는다', async () => {
  const service = setup({ reconsentDuring: true }); const { body } = await service.call();
  assert.equal(body.learning_access, 'consent_required');
  assert.equal(body.submissions.items.length, 0); assert.equal(body.feedback.items.length, 0);
});
test('현재 동의가 있어도 발화 시점의 유효 동의가 없는 학습은 조회하지 않는다', async () => {
  const { body } = await setup({ historicalConsentDenied: true }).call();
  assert.equal(body.learning_access, 'available');
  assert.equal(body.submissions.items.length, 0); assert.equal(body.feedback.items.length, 0);
});
test('빈 기록과 잘린 기록은 서로 다르다', async () => {
  const empty = await setup({ empty: true }).call();
  assert.equal(empty.body.observations.items.length, 0); assert.equal(empty.body.observations.has_more, false);
  const many = await setup({ many: true }).call();
  assert.equal(many.body.observations.items.length, 10); assert.equal(many.body.observations.has_more, true);
});
test('조회 감사 실패는 성공이나 빈 기록으로 반환되지 않는다', async () => {
  const reply = await setup({ auditFail: true }).call();
  assert.equal(reply.status, 500); assert.equal(reply.body.student, undefined);
});
test('잘못된 학생·추가 쿼리·쓰기 메서드는 거절한다', async () => {
  assert.equal((await setup().call({ endpoint: 'records/student?learner_id=bad' })).status, 400);
  assert.equal((await setup().call({ endpoint: `records/student?learner_id=${learner}&role=director` })).status, 400);
  assert.equal((await setup().call({ method: 'POST' })).status, 405);
});
test('학생 목록도 담당 반과 별도의 조회 감사 경로를 쓴다', async () => {
  const service = setup(); const reply = await service.call({ endpoint: 'records/roster' });
  assert.equal(reply.status, 200); assert.equal(reply.body.roster.length, 1); assert.equal(service.seen.audit, 1);
});
