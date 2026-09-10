'use strict';

/* 실제 전사 엔트리를 실행한다. DB·Storage·OpenAI는 합성 대역뿐이며 네트워크는 사용하지 않는다.
 * 동의 술어는 정본과 SQL을 대조하고, 질의 사이 철회·파일 삭제를 주입해 전송/쓰기 경계를 본다.
 * 이 시험은 PostgreSQL 잠금이나 운영 배포의 검증을 대신하지 않는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { 세우기: 서버세우기 } = require('./lib/서버함수세우기.js');
const 전사 = require('../lib/전사.js');
const 동의 = require('../lib/동의게이트.js');

const 방 = path.join(__dirname, '..', 'supabase', 'functions', 'transcribe');
const 소스 = fs.readFileSync(path.join(방, 'index.ts'), 'utf8');
const 동봉 = JSON.parse(fs.readFileSync(path.join(방, '동봉.json'), 'utf8'));
const 납작 = (s) => s.replace(/\s+/g, ' ').trim();
const 고정시각 = Date.parse('2026-09-11T00:00:00Z');
const 합성원문 = 'synthetic-secret 학생원문 sample@example.invalid voice/private/example.wav Bearer sample-token';

function 세우기(설정 = {}) {
  const 기록 = {
    queries: [], logs: [], storage: 0, vendor: 0, transcriptWrites: 0, rawWrites: 0,
    failedWrites: 0, consentChecks: 0, deleted: false, transcript: null,
    consent: { agreed_at: '2026-09-01T00:00:00Z', revoked_at: null },
  };
  Object.assign(기록, 설정.초기 || {});
  const 행 = {
    event_id: '00000000-0000-4000-8000-000000000001',
    learner_id: '00000000-0000-4000-8000-000000000002',
    audio_ref: 'voice/00000000-0000-4000-8000-000000000002/synthetic.wav',
  };
  const 유효 = () => 기록.consent
    && Date.parse(기록.consent.agreed_at) <= 고정시각
    && (기록.consent.revoked_at == null || Date.parse(기록.consent.revoked_at) > 고정시각);
  const 사용가능 = () => 유효() && !기록.deleted;
  const 훅 = (이름) => 설정[이름]?.(기록);

  function 보호술어(q) {
    assert.ok(q.includes(납작(동의.지금유효술어)), '정본과 같은 현재 동의 판정이어야 한다');
    assert.match(q, /engine\.consents/);
    assert.match(q, /k\.learner_id = e\.learner_id/);
    assert.match(q, /e\.event_id = s\.event_id/);
    assert.match(q, /audio_deleted_at is null/);
  }

  async function 실행(q) {
    기록.queries.push(q);
    if (q.startsWith('select count(')) {
      보호술어(q); 훅('분모조회');
      return [{ count: 사용가능() && !기록.transcript ? 1 : 0 }];
    }
    if (q.startsWith('select s.event_id, s.audio_ref')) {
      보호술어(q);
      const 결과 = 사용가능() && !기록.transcript ? [행] : [];
      훅('목록직후');
      return 결과;
    }
    if (q.startsWith('select consent_id, consent_ver')) {
      assert.ok(q.includes(납작(동의.지금유효술어)));
      기록.consentChecks += 1; 훅('동의조회');
      return 유효() ? [{ consent_id: 'synthetic-consent', consent_ver: 'synthetic-v1' }] : [];
    }
    if (q.startsWith('select s.event_id from engine.submissions')) {
      보호술어(q);
      assert.match(q, /s\.audio_ref = \?/);
      return 사용가능() && !기록.transcript ? [{ event_id: 행.event_id }] : [];
    }
    if (q.startsWith('update engine.submissions s set transcript_state')) {
      보호술어(q); 훅('실패저장');
      if (!사용가능() || 기록.transcript) return [];
      기록.failedWrites += 1;
      return [{ event_id: 행.event_id }];
    }
    if (q.startsWith('update engine.submissions s set transcript =')) {
      보호술어(q);
      assert.match(q, /transcript is null/);
      assert.match(q, /stt_segments =/);
      assert.match(q, /stt_confidence =/);
      훅('전사저장');
      if (!사용가능() || 기록.transcript) return [];
      기록.transcript = '합성 발화'; 기록.transcriptWrites += 1;
      return [{ event_id: 행.event_id }];
    }
    if (q.startsWith('insert into engine.stt_raw')) {
      보호술어(q); 훅('원신호저장');
      if (!사용가능()) return [];
      기록.rawWrites += 1;
      return [{ event_id: 행.event_id }];
    }
    throw new Error(`시험이 모르는 질의: ${q}`);
  }

  /* postgres 태그는 await할 때 실행한다. 중첩 조각도 조립하므로 실제 쿼리의 보호 조건을 본다. */
  function sql(줄, ...값) {
    const text = 납작(줄.reduce((s, 조각, i) => s + 조각
      + (i < 값.length ? (값[i]?.조각SQL ?? '?') : ''), ''));
    return { 조각SQL: text, then(resolve, reject) { return 실행(text).then(resolve, reject); } };
  }
  sql.json = (value) => ({ json: value });

  const modules = {
    'npm:postgres@3.4.4': () => sql,
    './전사.mjs': 전사,
    './동의게이트.mjs': 동의,
    './토큰.mjs': { 서비스역할: (req) => req.headers.get('Authorization') === 'Bearer synthetic-service-role' },
    './업로드경로.mjs': {
      버킷: 'learner-media', 저장소키흠: () => null,
      저장소헤더: () => ({ Authorization: 'Bearer synthetic-storage-key' }),
    },
  };
  const 핸들러 = 서버세우기(소스, {
    파일: 'synthetic-transcribe.ts',
    모듈: modules,
    환경: {
      SUPABASE_DB_URL: 'synthetic-db', SUPABASE_URL: 'https://storage.invalid',
      STORAGE_SIGN_KEY: 'synthetic-storage-key', OPENAI_API_KEY: 설정.키없음 ? '' : 'synthetic-api-key',
    },
    console: { error: (...args) => 기록.logs.push(args) },
    fetch: async (url, init) => {
      if (url.startsWith('https://storage.invalid/storage/v1/object/learner-media/')) {
        기록.storage += 1; 훅('다운로드');
        return new Response(new Uint8Array([1, 2, 3]));
      }
      assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions');
      assert.equal(init.body.get('model'), 'whisper-1');
      assert.equal(init.body.get('language'), 'ko');
      기록.vendor += 1; 훅('벤더왕복');
      if (설정.벤더상태) return new Response(합성원문, { status: 설정.벤더상태 });
      return Response.json({ text: '합성 발화', language: 'korean',
        segments: [{ start: 0, end: 1, text: '합성 발화', avg_logprob: -0.1, no_speech_prob: 0.01 }],
      });
    },
  });

  return {
    기록,
    async 호출({ 권한 = true, method = 'POST' } = {}) {
      const response = await 핸들러(new Request('https://function.invalid/transcribe', {
        method, headers: 권한 ? { Authorization: 'Bearer synthetic-service-role' } : {},
      }));
      return { status: response.status, body: await response.json() };
    },
  };
}

const 철회 = (r) => { r.consent.revoked_at = '2026-09-10T00:00:00Z'; };

test('전사 동봉은 실제 동의 정본을 가리키며 모든 import를 포함한다', () => {
  assert.equal(동봉['동의게이트.mjs'], 'lib/동의게이트.js');
  for (const m of 소스.matchAll(/from '\.\/([^']+\.mjs)'/g)) assert.ok(동봉[m[1]], m[1]);
});

test('유효한 동의는 실제 엔트리에서 원음→전사·구간→원신호를 처리한다', async () => {
  const h = 세우기(); const r = await h.호출();
  assert.equal(r.status, 200);
  assert.equal(r.body.전사, 1); assert.equal(r.body.구간, 1);
  assert.deepEqual([h.기록.storage, h.기록.vendor, h.기록.transcriptWrites, h.기록.rawWrites], [1, 1, 1, 1]);
  assert.equal(h.기록.consentChecks, 2);
});

test('인증되지 않은 호출과 잘못된 메서드는 DB·외부 전송을 시작하지 않는다', async () => {
  for (const [입력, status] of [[{ 권한: false }, 401], [{ method: 'GET' }, 405]]) {
    const h = 세우기(); assert.equal((await h.호출(입력)).status, status);
    assert.equal(h.기록.queries.length, 0); assert.equal(h.기록.storage + h.기록.vendor, 0);
  }
});

test('키가 없으면 대기 분모만 읽고 행을 변경하지 않는다', async () => {
  const h = 세우기({ 키없음: true }); const r = await h.호출();
  assert.equal(r.body.이유, 'no_api_key'); assert.equal(h.기록.queries.length, 1);
  assert.equal(h.기록.storage + h.기록.vendor + h.기록.transcriptWrites, 0);
});

for (const [이름, 초기] of [
  ['동의 없음', { consent: null }],
  ['미래 동의', { consent: { agreed_at: '2026-09-12T00:00:00Z', revoked_at: null } }],
  ['이미 철회', { consent: { agreed_at: '2026-09-01T00:00:00Z', revoked_at: '2026-09-10T00:00:00Z' } }],
  ['지금 철회', { consent: { agreed_at: '2026-09-01T00:00:00Z', revoked_at: '2026-09-11T00:00:00Z' } }],
  ['파일 삭제 표식', { deleted: true }],
]) {
  test(`${이름}: 대기 대상에서 제외하여 원음을 읽거나 보내지 않는다`, async () => {
    const h = 세우기({ 초기 }); const r = await h.호출();
    assert.equal(r.body.대기, 0); assert.equal(r.body.집음, 0);
    assert.equal(h.기록.storage + h.기록.vendor + h.기록.transcriptWrites, 0);
  });
}

test('미래 철회는 현재 유효하다는 공용 동의 의미를 보존한다', async () => {
  const h = 세우기({ 초기: { consent: { agreed_at: '2026-09-01T00:00:00Z', revoked_at: '2026-09-12T00:00:00Z' } } });
  assert.equal((await h.호출()).body.전사, 1);
});

test('대기 목록을 읽은 직후 철회돼도 다운로드 전에 재확인한다', async () => {
  const h = 세우기({ 목록직후: 철회 }); const r = await h.호출();
  assert.equal(r.body.사유.이용중단, 1); assert.equal(h.기록.storage + h.기록.vendor, 0);
});

for (const [이름, 수정] of [['철회', 철회], ['파일 삭제', (r) => { r.deleted = true; }]]) {
  test(`다운로드 도중 ${이름}되면 OpenAI 전송 직전 다시 막는다`, async () => {
    const h = 세우기({ 다운로드: 수정 }); const r = await h.호출();
    assert.equal(h.기록.storage, 1); assert.equal(h.기록.vendor, 0);
    assert.equal(r.body.사유.이용중단, 1);
  });
  test(`벤더 왕복 도중 ${이름}되면 전사·원신호를 쓰지 않는다`, async () => {
    const h = 세우기({ 벤더왕복: 수정 }); const r = await h.호출();
    assert.equal(h.기록.vendor, 1); assert.equal(h.기록.transcriptWrites + h.기록.rawWrites, 0);
    assert.equal(r.body.전사, 0); assert.equal(r.body.사유.저장제외, 1);
  });
}

test('전사 저장 뒤 원신호 저장 전에 철회되면 두 번째 쓰기도 막는다', async () => {
  const h = 세우기({ 원신호저장: 철회 }); const r = await h.호출();
  assert.equal(h.기록.transcriptWrites, 1); assert.equal(h.기록.rawWrites, 0);
  assert.equal(r.body.사유.원신호저장제외, 1);
});

test('실패 응답을 받은 동안 철회되면 실패 표식도 쓰지 않는다', async () => {
  const h = 세우기({ 벤더상태: 400, 벤더왕복: 철회 }); const r = await h.호출();
  assert.equal(h.기록.failedWrites, 0); assert.equal(r.body.못박음, 0);
  assert.equal(r.body.사유.저장제외, 1);
});

test('벤더 오류 본문은 로그·배치 응답에 노출되지 않고 고정 코드만 남는다', async () => {
  const h = 세우기({ 벤더상태: 400 }); const r = await h.호출();
  assert.equal(r.body.벤더사유, 'vendor_http_400'); assert.equal(r.body.못박음, 1);
  assert.deepEqual(h.기록.logs, [['[transcribe]', 'vendor_http', 400]]);
  assert.ok(!JSON.stringify([r, h.기록.logs]).includes(합성원문));
});

for (const 단계 of ['분모조회', '동의조회', '다운로드', '벤더왕복', '전사저장', '원신호저장']) {
  test(`${단계} 예외의 원문은 외부 로그·응답으로 전달되지 않는다`, async () => {
    const h = 세우기({ [단계]: () => { throw new Error(합성원문); } }); const r = await h.호출();
    assert.ok(!JSON.stringify([r, h.기록.logs]).includes(합성원문));
    assert.ok(h.기록.logs.length > 0);
    for (const [접두, 코드] of h.기록.logs) {
      assert.equal(접두, '[transcribe]');
      assert.ok(['batch_failed', 'unexpected_error', 'raw_store_failed'].includes(코드));
    }
    if (단계 === '분모조회') assert.equal(r.status, 503);
    if (단계 === '동의조회') assert.equal(h.기록.storage + h.기록.vendor, 0);
  });
}
