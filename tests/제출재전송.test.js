'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { 세우기 } = require('./lib/앱모듈세우기.js');
const { 요청해시 } = require('../lib/요청해시.js');
const { 업로드기록, 전송기록, 직렬화, 역직렬화 } = require('../lib/제출로그.js');

const ROOT = path.resolve(__dirname, '..');
const 항목 = (덧 = {}) => ({
  id: 'fixture-attempt', step: '답하기', attempt: 1, status: 'submitted',
  audio: 'file:///fixture.wav', created_at: '2026-09-09T00:00:00.000Z',
  correlation_id: 'b6f1c0a2-0000-4000-8000-000000000001',
  idempotency_key: 'b6f1c0a2-0000-4000-8000-000000000002',
  task_meta: { task_ref: 'fixture-task', level_snapshot: null, goal_snapshot: null,
    형식: { 답하기: '자유발화' }, task_snapshot: { fixture: true } },
  ...덧,
});

// 앱 API·사건 통로·계약 검증·요청 지문은 실제 모듈이다. 디스크와 HTTP 서버만 합성한다.
function 판({ 응답유실 = false, 업로드실패 = false } = {}) {
  const 행들 = new Map();
  const 요청들 = [];
  let 업로드수 = 0;
  let 서명수 = 0;
  let 사건수 = 0;
  const 응답 = (body) => ({ ok: true, status: 200, json: async () => body });
  const fetch가짜 = async (url, options) => {
    if (url.endsWith('uploads/sign')) {
      서명수++;
      return 응답({ upload_url: 'https://fixture.invalid/upload', audio_ref: `voice/fixture/${서명수}.wav` });
    }
    const 사건 = JSON.parse(options.body).events[0];
    요청들.push(사건);
    const hash = await 요청해시(사건);
    사건수++;
    const 기존 = 행들.get(사건.idempotency_key);
    let result;
    if (기존) {
      result = 기존.hash === hash
        ? { status: 'duplicate', event_id: 기존.id }
        : { status: 'rejected', error: { code: 'IDEMPOTENCY_CONFLICT', retryable: false } };
    } else {
      const id = `fixture-event-${행들.size + 1}`;
      행들.set(사건.idempotency_key, { id, hash, 사건 });
      result = { status: 'stored', event_id: id };
    }
    if (응답유실 && 사건수 === 1) throw new Error('합성: 저장 후 응답 유실');
    return 응답({ ok: true, results: [result] });
  };
  const 새API = () => {
    const 캐시 = new Map();
    캐시.set(path.join(ROOT, 'src', '저장.js'), {
      음성크기: async () => 128,
      음성올리기: async () => { 업로드수++; if (업로드실패) throw new Error('합성: 업로드 실패'); },
    });
    return 세우기(path.join(ROOT, 'src', '제출API.js'), fetch가짜, { 캐시 });
  };
  return { 새API, 행들, 요청들, 수: () => ({ 업로드수, 서명수, 사건수 }) };
}

test('저장 후 응답 유실 → 앱 재시작 → 재전송: 원본 업로드와 제출행은 각각 하나', async () => {
  const p = 판({ 응답유실: true });
  const 원본 = 항목();
  let 로그 = [원본];
  let 디스크;
  const 저장 = async (ref) => {
    const 다음 = 업로드기록(로그, 원본.id, ref);
    디스크 = 직렬화(다음);
    로그 = 다음;
  };
  const 첫 = await p.새API().발화보내기('fixture-token', 원본, 저장);
  assert.ok(첫.오류);
  assert.equal(첫.audio_ref, 'voice/fixture/1.wav', '사건 응답이 유실돼도 저장한 참조를 호출자에게 돌려준다');
  assert.equal(원본.audio_ref, undefined, '원본 객체를 기억 저장으로 바꾸지 않는다');
  const { 로그: 재시작로그, 깨진줄 } = 역직렬화(디스크);
  assert.equal(깨진줄, 0);
  const 다시 = await p.새API().발화보내기('fixture-token', 재시작로그[0]);
  assert.equal(다시.event_id, 'fixture-event-1');
  assert.equal(다시.audio_ref, 'voice/fixture/1.wav');
  assert.deepEqual(p.수(), { 업로드수: 1, 서명수: 1, 사건수: 2 });
  assert.equal(p.행들.size, 1);
  assert.deepEqual(p.요청들[0], p.요청들[1], '재전송 봉투 전체가 동일해야 한다');
  assert.equal(전송기록(재시작로그, 원본.id, 다시)[0].audio_ref, 'voice/fixture/1.wav');
});

test('로컬 업로드 참조 쓰기 실패면 사건을 보내지 않고 다시 시도할 수 있다', async () => {
  const p = 판();
  const 원본 = 항목();
  const r = await p.새API().발화보내기('fixture-token', 원본, async () => { throw new Error('합성: 디스크 쓰기 실패'); });
  assert.ok(r.오류);
  assert.equal(r.끝, false);
  assert.equal(r.audio_ref, undefined, '지속 저장 실패한 참조를 성공한 것처럼 반환하지 않는다');
  assert.equal(원본.audio_ref, undefined);
  assert.deepEqual(p.수(), { 업로드수: 1, 서명수: 1, 사건수: 0 });
  let 저장항목;
  const 다시 = await p.새API().발화보내기('fixture-token', 원본, async (ref) => {
    저장항목 = 업로드기록([원본], 원본.id, ref)[0];
  });
  assert.equal(다시.event_id, 'fixture-event-1');
  assert.equal(저장항목.audio_ref, p.요청들[0].submission.audio_ref);
});

test('동시에 같은 항목을 보내도 업로드·로컬 기록·사건 송신이 각각 한 번', async () => {
  const p = 판();
  const api = p.새API();
  let 기록수 = 0;
  const 저장 = async () => { 기록수++; };
  const 원본 = 항목();
  const [a, b] = await Promise.all([
    api.발화보내기('fixture-token', 원본, 저장),
    api.발화보내기('fixture-token', { ...원본 }, 저장),
  ]);
  assert.equal(a.event_id, b.event_id);
  assert.equal(기록수, 1);
  assert.deepEqual(p.수(), { 업로드수: 1, 서명수: 1, 사건수: 1 });
});

test('재마운트한 화면이 진행 중 요청을 공유해도 각 화면의 로그에 음성 참조가 보존된다', async () => {
  const p = 판({ 응답유실: true });
  const api = p.새API();
  let 첫화면로그 = [항목()];
  let 새화면로그 = [항목()];
  let 새화면저장수 = 0;
  const [a, b] = await Promise.all([
    api.발화보내기('fixture-token', 첫화면로그[0], async (ref) => {
      첫화면로그 = 업로드기록(첫화면로그, 'fixture-attempt', ref);
    }),
    api.발화보내기('fixture-token', 새화면로그[0], async () => { 새화면저장수++; }),
  ]);
  assert.equal(새화면저장수, 0, '공유 요청은 첫 화면의 저장 콜백만 실행한다');
  첫화면로그 = 전송기록(첫화면로그, 'fixture-attempt', a);
  새화면로그 = 전송기록(새화면로그, 'fixture-attempt', b);
  assert.deepEqual(새화면로그, 첫화면로그);
  assert.equal(새화면로그[0].audio_ref, 'voice/fixture/1.wav');
  const 다시 = await p.새API().발화보내기('fixture-token', 새화면로그[0]);
  assert.equal(다시.event_id, 'fixture-event-1');
  assert.equal(p.수().업로드수, 1);
  assert.equal(p.행들.size, 1);
});

test('저장 통로 누락·음성 업로드 실패 모두 사건 송신 전에 멈춘다', async () => {
  const p = 판();
  assert.ok((await p.새API().발화보내기('fixture-token', 항목())).오류);
  assert.deepEqual(p.수(), { 업로드수: 0, 서명수: 0, 사건수: 0 });
  const 실패판 = 판({ 업로드실패: true });
  let 기록수 = 0;
  assert.ok((await 실패판.새API().발화보내기('fixture-token', 항목(), async () => { 기록수++; })).오류);
  assert.equal(기록수, 0);
  assert.equal(실패판.수().사건수, 0);
});

test('음성 참조 기록은 다른 시도·원본을 보존하며 참조 교체와 없는 항목 기록을 거부한다', () => {
  const 원본 = 항목();
  const 다른시도 = 항목({ id: 'second-attempt', attempt: 2 });
  const 새로그 = 업로드기록([원본, 다른시도], 원본.id, 'voice/fixture/1.wav');
  assert.equal(새로그[1], 다른시도);
  assert.equal(원본.audio_ref, undefined);
  assert.throws(() => 업로드기록(새로그, 원본.id, 'voice/fixture/2.wav'));
  assert.throws(() => 업로드기록(새로그, '없는항목', 'voice/fixture/1.wav'));
  assert.throws(() => 전송기록(새로그, 원본.id, { audio_ref: 'voice/fixture/2.wav', event_id: 'other-event' }));
  assert.equal(새로그[0].audio_ref, 'voice/fixture/1.wav');
});

test('무발화 음성은 이탈 사건 그대로 재사용하고 텍스트 제출은 업로드를 요구하지 않는다', async () => {
  const p = 판();
  const abandoned = await p.새API().발화보내기('fixture-token', 항목({ status: 'abandoned', audio_ref: 'voice/fixture/saved.wav' }));
  assert.ok(abandoned.event_id);
  assert.equal(p.요청들[0].event_type, 'session.abandoned');
  assert.equal(p.요청들[0].submission.audio_ref, 'voice/fixture/saved.wav');
  const 글판 = 판();
  const 글 = await 글판.새API().발화보내기('fixture-token', 항목({ audio: null, text: '오늘은 학교에 가요.' }));
  assert.ok(글.event_id);
  assert.deepEqual(글판.수(), { 업로드수: 0, 서명수: 0, 사건수: 1 });
});
