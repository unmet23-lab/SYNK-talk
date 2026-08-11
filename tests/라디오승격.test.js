/* 라디오 승격 판정층 회귀 — §9 「승격 왕복」의 판정 절반을 원장 픽스처로 잰다(DB 0).
 * 🔑 계획 행은 **실계약 검증기**(lib/이벤트검증.검증 · 주체 server)를 직접 지난다 — 기대 모양을
 *   여기 베끼면 판이 갈린다(S1-5 선택로그 회귀와 같은 규칙). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  승격표, 명령과업, 결정적uuid, 승격계획,
} = require('../lib/라디오승격.js');
const { 명령표 } = require('../lib/라디오채팅파서.js');
const { 검증 } = require('../lib/이벤트검증.js');
const { 스킬표, 스킬판 } = require('../contents/토픽퀴즈문항.js');
const 계약 = require('../계약/수집_교정_계약.json');

/* ── 어휘 대조 — 승격표가 파서 명령표 밖의 명령을 지어내면 그 사건은 영원히 0행이다 ── */
test('승격표의 모든 명령이 파서 명령표에 실재한다', () => {
  const 밖 = Object.keys(승격표).filter((k) => !명령표[k]);
  assert.deepEqual(밖, [], `파서가 모르는 명령을 승격하려 한다: ${밖.join(', ')}`);
});

test('승격표의 사건 이름이 전부 계약 값목록 안이다', () => {
  const 값들 = 계약.learning_events.값목록.event_type;
  const 밖 = [...new Set(Object.values(승격표))].filter((et) => !값들.includes(et));
  assert.deepEqual(밖, [], `계약에 없는 사건으로 승격하려 한다: ${밖.join(', ')}`);
});

test('명령과업 task_type 이 계약 값목록 안이다', () => {
  const 값들 = 계약.learning_events.값목록.task_type;
  for (const 통로 of Object.keys(명령과업)) {
    assert.ok(값들.includes(통로), `명령과업 통로가 계약 밖이다: ${통로}`);
  }
});

/* ── c11 시드 ↔ 스킬표 텍스트 대조(문항 팩 머리말이 예고한 회귀) ─────────────────────
 * 시드는 마이그레이션 SQL 이고 정본은 팩 스킬표다 — 둘이 갈리면 승격 skill 대조가
 * 「시드에 없는 skill」로 조용히 전건 제외를 만든다(증상은 분모뿐). */
test('c11 engine.skills 시드가 문항 팩 스킬표 30종과 글자까지 같다', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', '20260812120000_engine_c11.sql'), 'utf8');
  assert.equal(스킬표.length, 30, '스킬표가 30이 아니다 — 시드·팩·설계(§0-6)가 같이 움직여야 한다');
  for (const s of 스킬표) {
    const 줄 = `('${s.skill_id}', '${s.label_ko}', '${s.domain}', 'c11')`;
    assert.ok(sql.includes(줄), `시드에 스킬표 행이 없다(글자 대조): ${줄}`);
  }
  const 개수 = [...sql.matchAll(/\('skill-ko-[^']+', '[^']+', '[^']+', 'c11'\)/g)].length;
  assert.equal(개수, 30, `시드 행 수가 30이 아니다: ${개수} — 표에 없는 행을 시드가 지어냈다`);
  assert.ok(스킬판 === 'skills.v1', '스킬판이 바뀌었다 — 시드·계약 skill_taxonomy_ver 재료가 낡는다');
});

/* ── 픽스처 ──────────────────────────────────────────────────────────────── */
const 지금 = '2026-08-12T13:00:00Z';
const L1 = '11111111-1111-4111-8111-111111111111';
const L2 = '22222222-2222-4222-8222-222222222222';

const 스냅 = Object.freeze({
  질문: '빈칸에 들어갈 말을 고르세요. 저는 학교(___) 갑니다.',
  보기: [{ option_id: 'o1', label: '이' }, { option_id: 'o2', label: '에' },
        { option_id: 'o3', label: '를' }, { option_id: 'o4', label: '와' }],
  정답: 'o2',
  지시문: '빈칸에 들어갈 말을 고르세요.',
  문항버전: '토픽퀴즈.v1',
  skill_ids: ['skill-ko-grammar-particle-place'],
  스킬판: 'skills.v1',
});

const 기본재료 = () => ({
  라운드들: [
    { round_id: 71, task_ref: 'tq003', task_snapshot: 스냅, shown_at: '2026-08-12T12:00:00Z', closed_at: '2026-08-12T12:05:00Z', retry_of_round_id: null },
    { round_id: 72, task_ref: 'tq004', task_snapshot: 스냅, shown_at: '2026-08-12T12:06:00Z', closed_at: null, retry_of_round_id: 71 },
  ],
  링크들: [
    { channel_id: 'ch-a', learner_id: L1, confirmed_at: '2026-08-01T00:00:00Z', unlinked_at: null },
    { channel_id: 'ch-b', learner_id: L2, confirmed_at: '2026-08-01T00:00:00Z', unlinked_at: '2026-08-10T00:00:00Z' },
  ],
  동의들: {
    [L1]: [{ consent_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', consent_ver: 'v18.10', agreed_at: '2026-08-01T00:00:00Z', revoked_at: null }],
    [L2]: [{ consent_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', consent_ver: 'v18.10', agreed_at: '2026-08-01T00:00:00Z', revoked_at: null }],
  },
  학생들: { [L1]: { level_current: '2급', goal_track: '유학' }, [L2]: { level_current: null, goal_track: null } },
  카드들: [{ content_ref: 'card-041', content_snapshot: { 표현: '~에 가다', 판: 'card.v1' }, shown_from: '2026-08-12T00:00:00Z', shown_to: null }],
  이미승격키: new Set(),
  이미승격라운드: new Set(),
  지금,
});

const 채팅 = (id, kind, arg, sent_at, channel = 'ch-a') => ({
  message_id: id, channel_id: channel, body: `!${kind} ${arg ?? ''}`, sent_at, command_kind: kind, command_arg: arg ?? null,
});

const 사유들 = (r) => r.제외.map((x) => x.사유);

test('퀴즈 정상 승격 — 자리→option_id·confidence·skill·라운드 참조·검증기 통과', () => {
  const r = 승격계획({ ...기본재료(), 메시지들: [채팅('m1', '답', '２번??', '2026-08-12T12:01:00Z')] });
  assert.equal(r.계획.length, 1, `계획이 1이 아니다: ${JSON.stringify(r.제외)}`);
  const 행 = r.계획[0];
  assert.equal(행.event_type, 'quiz.answered');
  assert.equal(행.task_type, '라디오퀴즈');
  assert.equal(행.payload.selected_option, 'o2', '전각 「２번」이 둘째 보기 id 로 안 풀렸다');
  assert.equal(행.payload.position, 2, '학생이 친 자리(관측 원문)가 안 실렸다 — ⑦ 검사의 한 벌');
  assert.equal(행.payload.confidence, 'guess');
  assert.equal(행.payload.round_id, '71');
  assert.deepEqual(행.skill_ids, ['skill-ko-grammar-particle-place']);
  assert.equal(행.skill_taxonomy_ver, 'skills.v1');
  assert.equal(행.submission.task_format, '응답');
  assert.equal(행.submission.body_original, '２번??', '원문 그대로가 아니다 — 정답 파생의 반쪽이 사라진다');
  assert.equal(행.level_snapshot, '2급');
  assert.equal(행.idempotency_key, 'm1');
  const v = 검증(행, 계약, { 주체: 'server' });
  assert.ok(v.ok, `실계약 검증기가 거절했다: ${JSON.stringify(v.오류들)}`);
});

test('확신 표기가 없으면 confidence 키 자체가 없다 — 지어내지 않는다', () => {
  const r = 승격계획({ ...기본재료(), 메시지들: [채팅('m1', '답', '2', '2026-08-12T12:01:00Z')] });
  assert.ok(!('confidence' in r.계획[0].payload), '안 물린 표기가 값으로 실렸다');
});

test('마감 후·라운드 없음·자리 밖·해석 불가·인자 없음은 각자의 사유로 제외된다', () => {
  const 재료 = 기본재료();
  const r = 승격계획({
    ...재료,
    메시지들: [
      채팅('m1', '답', '2', '2026-08-12T12:05:30Z'),  // 라운드 71 마감(12:05) 뒤·72 시작(12:06) 전
      채팅('m2', '답', '2', '2026-08-11T00:00:00Z'),  // 어떤 라운드도 없던 시각
      채팅('m3', '답', '9', '2026-08-12T12:01:00Z'),  // 보기 4개 — 자리 9 없음
      채팅('m4', '답', '아마 2', '2026-08-12T12:02:00Z'),
      채팅('m5', '답', null, '2026-08-12T12:03:00Z'),
    ],
  });
  assert.equal(r.계획.length, 0);
  assert.deepEqual(사유들(r).sort(), ['라운드없음', '마감후', '인자없음', '자리없음', '해석불가'].sort());
});

test('학생×라운드 첫 응답 1건 — 뒤 응답과 앞선 실행분은 중복으로 센다', () => {
  const 재료 = 기본재료();
  const r = 승격계획({
    ...재료,
    메시지들: [
      채팅('m1', '답', '2', '2026-08-12T12:01:00Z'),
      채팅('m2', '답', '3', '2026-08-12T12:02:00Z'),  // 같은 학생 같은 라운드 — 후속 정정은 원장 보존
    ],
  });
  assert.equal(r.계획.length, 1);
  assert.equal(r.계획[0].idempotency_key, 'm1', '첫 응답이 아니라 뒤 응답이 이겼다');
  assert.deepEqual(사유들(r), ['중복응답']);

  const r2 = 승격계획({
    ...재료,
    이미승격라운드: new Set([`${L1}:71`]),
    메시지들: [채팅('m3', '답', '2', '2026-08-12T12:01:30Z')],
  });
  assert.deepEqual(사유들(r2), ['중복응답'], '앞선 실행이 승격한 라운드를 다시 승격하려 했다');
});

test('재도전 라운드는 부모 라운드 참조를 든다 — 고리는 Fn 이 (학생,라운드)로 푼다', () => {
  const r = 승격계획({
    ...기본재료(),
    메시지들: [
      채팅('m1', '답', '2', '2026-08-12T12:01:00Z'),
      채팅('m2', '답', '2', '2026-08-12T12:07:00Z'),  // 라운드 72(재도전 · retry_of 71)
    ],
  });
  assert.equal(r.계획.length, 2);
  assert.equal(r.계획[0].retry_parent_round_id, null);
  assert.equal(r.계획[1].retry_parent_round_id, '71');
});

test('비링크·해제 뒤·무동의·철회는 승격하지 않고 사유로 센다', () => {
  const 재료 = 기본재료();
  재료.동의들[L1] = [{ consent_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', consent_ver: 'v18.10', agreed_at: '2026-08-01T00:00:00Z', revoked_at: '2026-08-12T00:00:00Z' }];
  const r = 승격계획({
    ...재료,
    메시지들: [
      채팅('m1', '슬럼프', null, '2026-08-12T12:01:00Z', 'ch-없음'),   // 링크된 적 없는 채널
      채팅('m2', '슬럼프', null, '2026-08-12T12:01:00Z', 'ch-b'),     // 08-10 해제 뒤
      채팅('m3', '슬럼프', null, '2026-08-11T00:00:00Z'),             // 철회(08-12) 전 시각이어도 지금 죽은 동의
    ],
  });
  assert.equal(r.계획.length, 0);
  assert.deepEqual(사유들(r).sort(), ['무동의', '비링크', '비링크'].sort());
});

test('선호 ⓐⓑ — 빗소리 인자는 이유, asmr 인자는 선택이고 안 물었으면 키가 없다', () => {
  const r = 승격계획({
    ...기본재료(),
    메시지들: [
      채팅('m1', '빗소리', '집중이 잘돼서', '2026-08-12T12:01:00Z'),
      채팅('m2', '빗소리', null, '2026-08-12T12:02:00Z'),
      채팅('m3', 'asmr', '장작 소리', '2026-08-12T12:03:00Z'),
      채팅('m4', 'asmr', null, '2026-08-12T12:04:00Z'),
    ],
  });
  assert.equal(r.계획.length, 4, JSON.stringify(r.제외));
  const [a, b, c, d] = r.계획.map((p) => p.payload);
  assert.equal(a.preference_dimension, 'study_environment');
  assert.equal(a.stated_option, '빗소리');
  assert.equal(a.selection_reason, '집중이 잘돼서');
  assert.ok(!('selection_reason' in b), '안 적은 이유가 실렸다 — 빈칸은 0이 아니다');
  assert.equal(c.preference_dimension, 'asmr_track');
  assert.equal(c.stated_option, '장작 소리', 'asmr 인자는 이유가 아니라 선택이다(ⓑ)');
  assert.ok(!('selection_reason' in c));
  assert.equal(d.stated_option, 'asmr');
  assert.ok(!('selected_option' in a), '선언이 선택로그 이름을 썼다 — ⑦ 계약과 충돌한다(개명 사유)');
  for (const 행 of r.계획) {
    const v = 검증(행, 계약, { 주체: 'server' });
    assert.ok(v.ok, `선호 행이 실계약에서 거절됐다: ${JSON.stringify(v.오류들)}`);
    assert.equal(행.payload.stated_via, 'radio_chat');
  }
});

test('슬럼프 — affect_kind 만 싣고 자유 서술은 payload 에 안 올린다', () => {
  const r = 승격계획({
    ...기본재료(),
    메시지들: [채팅('m1', '슬럼프', '요즘 너무 힘들어요', '2026-08-12T12:01:00Z')],
  });
  assert.equal(r.계획.length, 1);
  const 행 = r.계획[0];
  assert.equal(행.event_type, 'affect.reported');
  assert.deepEqual(행.payload, { affect_kind: 'slump', stated_via: 'radio_chat' },
    '자유 서술이 payload 로 샜다 — 원장 body 가 그 자리다(계약 affect_kind 사유)');
  assert.ok(검증(행, 계약, { 주체: 'server' }).ok);
});

test('ⓒⓓ — 출석은 그날 카드가 과업이고 카드가 없으면 명령과업, 목표는 언제나 명령과업', () => {
  const 재료 = 기본재료();
  const r = 승격계획({
    ...재료,
    메시지들: [
      채팅('m1', '출석', '오늘도 화이팅', '2026-08-12T12:01:00Z'),
      채팅('m2', '목표', '단어 20개', '2026-08-12T12:02:00Z'),
    ],
  });
  assert.equal(r.계획.length, 2, JSON.stringify(r.제외));
  const [출석, 목표] = r.계획;
  assert.equal(출석.task_type, '자습체크인');
  assert.equal(출석.submission.task_ref, 'card-041', '그날 카드가 있는데 명령과업으로 접었다(§2-2 ⓓ)');
  assert.equal(출석.submission.task_format, '자유발화');
  assert.equal(목표.task_type, '목표선언');
  assert.equal(목표.submission.task_ref, 명령과업.목표선언.task_ref);
  for (const 행 of r.계획) {
    const v = 검증(행, 계약, { 주체: 'server' });
    assert.ok(v.ok, `제출 행이 실계약에서 거절됐다: ${JSON.stringify(v.오류들)}`);
  }

  const 무카드 = { ...재료, 카드들: [] };
  const r2 = 승격계획({ ...무카드, 메시지들: [채팅('m3', '출석', '시작합니다', '2026-08-12T12:03:00Z')] });
  assert.equal(r2.계획[0].submission.task_ref, 명령과업.자습체크인.task_ref);
});

test('멱등 — 이미 승격된 message_id 는 제외로 센다', () => {
  const r = 승격계획({
    ...기본재료(),
    이미승격키: new Set(['m1']),
    메시지들: [채팅('m1', '슬럼프', null, '2026-08-12T12:01:00Z')],
  });
  assert.deepEqual(사유들(r), ['이미승격']);
});

test('correlation_id — 같은 학생 같은 몽골 날짜는 같고, 학생·날짜가 갈리면 다르다(결정적)', () => {
  const r = 승격계획({
    ...기본재료(),
    메시지들: [
      채팅('m1', '슬럼프', null, '2026-08-12T12:01:00Z'),
      채팅('m2', '빗소리', null, '2026-08-12T13:30:00Z'),
      채팅('m3', '슬럼프', null, '2026-08-13T22:01:00Z'), // UB(+08) 기준 다음날
    ],
  });
  const [a, b, c] = r.계획.map((p) => p.correlation_id);
  assert.equal(a, b, '같은 앉음(학생×날)이 두 앉음으로 갈라졌다');
  assert.notEqual(a, c);
  for (const id of [a, c]) {
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      'uuid 모양이 아니다 — DB uuid 캐스트가 거절한다');
  }
  assert.equal(결정적uuid('radio:x:2026-08-12'), 결정적uuid('radio:x:2026-08-12'));
});

test('승격 대상 밖 명령(질문·연동)과 자발 발화는 계획에도 제외에도 없다 — 원장 보존이 전부다', () => {
  const r = 승격계획({
    ...기본재료(),
    메시지들: [
      채팅('m1', '질문', '은/는 언제 써요?', '2026-08-12T12:01:00Z'),
      채팅('m2', '연동', null, '2026-08-12T12:02:00Z'),
      { message_id: 'm3', channel_id: 'ch-a', body: '선생님 안녕하세요', sent_at: '2026-08-12T12:03:00Z', command_kind: null, command_arg: null },
    ],
  });
  assert.equal(r.계획.length, 0);
  assert.equal(r.제외.length, 0, '승격 규격이 없는 것을 분모에 세면 「빠졌다」로 오독된다');
});

test('지금(승격 시점) 없이 부르면 던진다 — 동의 술어가 벽시계를 직접 읽으면 회귀가 못 잰다', () => {
  assert.throws(() => 승격계획({ 메시지들: [] }), /지금/);
});
