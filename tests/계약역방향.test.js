/* 계약 역방향 회귀 — 「서버가 **저장하는** 열이 계약에 있는가」 (C0 심문 B4 · 2026-08-09)
 *
 * ■ 무엇이 없어서 벌어졌나
 *   `tests/이벤트검증.test.js` 가 이미 두 방향을 잰다: ①필수로 건 이름이 계약에 실재하는가
 *   ②계약의 이름을 누군가 요구·서버칸·선택장부에 등재했는가. 둘 다 **계약에서 출발**한다.
 *   그래서 세 번째 방향 — **코드가 저장하는데 계약이 모르는 열** — 은 아무 데서도 안 빨갰고,
 *   `session_id`·`content_id`·`task_schema_ver`·`consent_id` 넷이 c10 내내 그렇게 벌어져 있었다
 *   (`docs/C0_API계약.md` 「필드 정본에는 없다」 절 · 심문 3벌 중 2벌이 다른 결론으로 짚었다).
 *   계약만 읽는 소비자(Apps Script·n8n·다음 세션)는 그 값이 실재하는 줄 모른다 — 증상이 없다.
 *
 * ■ 세 맹점을 의식하고 짰다 (CLAUDE.md)
 *   ① 사람이 실제로 쓰는 표기 — 픽스처는 `functions/events` 의 실제 SQL 모양 그대로다
 *      (여러 줄 · 열 목록 안 `/* *\/` 주석 · `${…}` 자리표시자).
 *   ② 버그가 아직 있을 것을 요구하지 않는다 — 탐지력은 **픽스처**가 지고, 실저장소에는
 *      거짓양성 검사만 건다(지금 초록인 것은 오늘 계약을 고쳤기 때문이다).
 *   ③ 자기 처방 — 차단 사유가 시키는 대로(계약에 올리거나 물리칸 장부에 적거나) 고치면 통과한다.
 *
 * ■ 초록은 분모와 함께 읽는다 (F207)
 *   스캔이 0건이어도 「미등재 0」은 초록으로 보인다. 그래서 **몇 파일에서 몇 개의 INSERT 를
 *   읽어 몇 개의 열을 쟀는지**를 먼저 못박는다 — 그 수가 0이면 그 자체로 실패다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const 계약 = JSON.parse(fs.readFileSync(path.join(ROOT, '계약', '수집_교정_계약.json'), 'utf8'));
const { 선택필드, 물리칸, 서버칸 } = require('../lib/이벤트검증.js');

/* 계약이 이름을 낸 표 둘. 🔑 여기를 늘릴 때는 그 표를 쓰는 통로도 같이 봐야 한다 —
 * 표를 안 늘리고 통로만 늘리면 이 검사가 조용히 좁아진다. */
const 대상표 = ['learning_events', 'submissions', 'corrections'];

/* ── 추출기 ────────────────────────────────────────────────────────────────
 * `insert into engine.<표> ( … ) values` 의 **열 목록 구간만** 읽는다.
 * 🔴 값 구간은 안 읽는다: 거기엔 `${…}::uuid` 와 긴 주석이 섞여 있어 이름처럼 보이는 것이
 *   수십 개 나온다. 우리가 재려는 것은 「무엇을 저장하는가」지 「어떻게 채우는가」가 아니다.
 * 🔴 닫는 괄호는 **주석을 건너뛰며** 찾는다 — 열 목록 안 주석에 `)` 가 들어 있으면 거기서
 *   잘려 열 절반이 안 보이고, 안 보이는 열은 언제나 「통과」다(이 파일이 막는 방향 그대로). */
function 열목록(소스, 시작) {
  let i = 시작;
  let 담기 = '';
  while (i < 소스.length) {
    if (소스.startsWith('/*', i)) {
      const 끝 = 소스.indexOf('*/', i + 2);
      i = 끝 === -1 ? 소스.length : 끝 + 2;
      담기 += ' ';
      continue;
    }
    if (소스.startsWith('--', i)) {
      const 끝 = 소스.indexOf('\n', i);
      i = 끝 === -1 ? 소스.length : 끝;
      담기 += ' ';
      continue;
    }
    if (소스[i] === ')') return { 원문: 담기, 끝: i };
    담기 += 소스[i];
    i += 1;
  }
  return null;   // 닫히지 않았다 — 부른 쪽이 「못 읽었다」로 다룬다
}

/** @returns {{표: string, 열들: string[], 위치: number}[]} */
function 저장열들(소스) {
  const 결과 = [];
  for (const 표 of 대상표) {
    const re = new RegExp(`insert\\s+into\\s+engine\\.${표}\\s*\\(`, 'g');
    let m;
    while ((m = re.exec(소스))) {
      const 잘린것 = 열목록(소스, m.index + m[0].length);
      if (!잘린것) continue;
      const 열들 = 잘린것.원문.split(',').map((s) => s.trim()).filter(Boolean);
      결과.push({ 표, 열들, 위치: m.index });
    }
  }
  return 결과;
}

/* 운영 쓰기 통로 — **글로 적은 목록이 아니라 훑어서 찾는다.**
 * 목록으로 두면 새 함수가 생기는 날 이 검사가 그것만 못 보고, 새는 방향은 언제나 통과다.
 * 🚫 `tools/` 는 뺀다 — 왕복시험·마이그레이션 검증 픽스처라 계약의 «소비자»가 아니라
 *   계약을 시험하는 쪽이고, 일부러 부분 집합만 넣는다(넣으면 그 부분성이 거짓양성이 된다).
 *   ⚠ 그래서 이 검사는 **운영 통로만** 잰다 — 한계이지 무결이 아니다. */
function 통로파일들() {
  const 모음 = [];
  const 걷기 = (dir, 재귀, 확장) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (재귀) 걷기(p, 재귀, 확장); }
      else if (확장.some((x) => e.name.endsWith(x))) 모음.push(p);
    }
  };
  걷기(path.join(ROOT, 'supabase', 'functions'), true, ['.ts']);
  걷기(path.join(ROOT, 'lib'), false, ['.js']);
  return 모음;
}

const 계약필드 = () => {
  const s = new Set();
  for (const v of Object.values(계약.learning_events.필드 || {})) {
    if (Array.isArray(v)) v.forEach((n) => s.add(n));
  }
  return s;
};

/** 저장하는데 계약에도 물리칸 장부에도 없는 열 — 이 검사의 산출물. */
const 미등재 = (열들, 필드 = 계약필드(), 장부 = 물리칸) =>
  [...new Set(열들)].filter((n) => !필드.has(n) && !(n in 장부));

/* ── 탐지력: 픽스처 ────────────────────────────────────────────────────── */

/* `functions/events` 의 실제 모양 그대로 — 여러 줄, 열 목록 안에 `)` 가 든 주석, `${…}` 값. */
const 가짜소스 = (열목록문자열) => `
      const 넣기 = await tx\`
        insert into engine.learning_events (
          ${열목록문자열}
        ) values (
          \${learner_id}::uuid, \${String(사건.event_type)}
        )
        returning event_id\`;
`;

test('탐지력 — 저장하는데 계약에 없는 열은 잡힌다 (이 파일이 생긴 이유)', () => {
  const 소스 = 가짜소스('learner_id, event_type, occurred_at, 새로_생긴_열');
  const 읽은것 = 저장열들(소스);
  assert.equal(읽은것.length, 1, '추출기가 INSERT 를 못 찾았다');
  assert.deepEqual(미등재(읽은것[0].열들), ['새로_생긴_열']);
});

test('자기 처방 — 물리칸 장부에 사유와 함께 적으면 통과한다', () => {
  const 읽은것 = 저장열들(가짜소스('learner_id, 새로_생긴_열'));
  const 장부 = { ...물리칸, 새로_생긴_열: '서버가 파생하는 칸이라 앱 봉투가 아니다.' };
  assert.deepEqual(미등재(읽은것[0].열들, 계약필드(), 장부), []);
});

test('자기 처방 — 계약 필드로 올려도 통과한다 (둘 중 하나면 된다)', () => {
  const 읽은것 = 저장열들(가짜소스('learner_id, 새로_생긴_열'));
  const 필드 = new Set([...계약필드(), '새로_생긴_열']);
  assert.deepEqual(미등재(읽은것[0].열들, 필드), []);
});

/* 🔴 실사고 모양 — 열 목록 «안»의 주석에 닫는 괄호가 있으면 순진한 파서는 거기서 자른다.
 *   잘린 뒤의 열은 안 보이고, 안 보이는 열은 검사를 언제나 통과한다. */
test('탐지력 — 열 목록 안 주석의 괄호에 안 속는다 (잘리면 뒤쪽 열이 통째로 안 보인다)', () => {
  const 소스 = 가짜소스([
    'learner_id,',
    '/* c8 교정 고리 (없으면 두 사건이 거절된다) — 이 주석 안의 괄호가 함정이다 */',
    'correction_id, 새로_생긴_열',
  ].join('\n          '));
  const 읽은것 = 저장열들(소스);
  assert.deepEqual(읽은것[0].열들.sort(), ['correction_id', 'learner_id', '새로_생긴_열']);
  assert.deepEqual(미등재(읽은것[0].열들), ['새로_생긴_열']);
});

/* ── `engine.corrections` — 셋째 표 (2026-08-09) ─────────────────────────────
 * 그 표는 08-09 까지 이 검사 «밖»이었고, 넣자마자 미등재 열이 **열둘** 나왔다. 아래 픽스처가
 * 탐지력을 진다 — 실저장소는 오늘 열둘을 처분해서 초록이라, 실저장소만으로는 이 검사가
 * 「돈다」를 증명하지 못한다(초록은 분모와 함께 · F207).
 * 🔴 `values` 가 아니라 **`select`** 로 넣는 통로가 실재한다(`functions/correct` 의 멱등 INSERT).
 *   추출기를 `values` 로 좁히는 날 그 통로가 통째로 안 보이고, 안 보이는 열은 언제나 통과다. */
const 가짜교정소스 = (열목록문자열, 꼬리 = 'values (\\${submissionId}::uuid)') => `
  const 쓴것 = await sql\`
    insert into engine.corrections (
      ${열목록문자열}
    )
    ${꼬리}
    returning correction_id\`;
`;

test('탐지력 — `engine.corrections` 도 잰다 (셋째 표를 넣은 이유)', () => {
  const 읽은것 = 저장열들(가짜교정소스('submission_id, corrected_text, 검수자_새칸'));
  assert.equal(읽은것.length, 1, '추출기가 corrections INSERT 를 못 찾았다');
  assert.equal(읽은것[0].표, 'corrections');
  assert.deepEqual(미등재(읽은것[0].열들), ['검수자_새칸']);
});

test('탐지력 — `insert … select` 형태도 읽는다 (`functions/correct` 의 멱등 INSERT 모양)', () => {
  const 꼬리 = [
    "select \\${submissionId}::uuid, 'ai'::engine.actor_kind",
    ' where not exists (',
    "        select 1 from engine.corrections c",
    "         where c.submission_id = \\${submissionId}::uuid and c.actor_kind = 'ai')",
  ].join('\n    ');
  const 읽은것 = 저장열들(가짜교정소스('submission_id, corrected_text, 검수자_새칸', 꼬리));
  assert.equal(읽은것.length, 1, '`values` 가 없으면 못 읽는다 — 그 통로가 통째로 사각이 된다');
  assert.deepEqual(미등재(읽은것[0].열들), ['검수자_새칸']);
});

test('탐지력 — 다른 표에 넣는 것은 세지 않는다 (넓게 잡으면 거짓양성으로 곧 꺼진다)', () => {
  const 소스 = 가짜소스('learner_id').replace('engine.learning_events', 'engine.staff_access_log');
  assert.deepEqual(저장열들(소스), []);
});

test('탐지력 — 닫히지 않은 INSERT 는 「읽었다」고 세지 않는다', () => {
  assert.deepEqual(저장열들('insert into engine.submissions ( event_id, task_ref'), []);
});

/* ── 실저장소: 거짓양성만 · 분모와 함께 ───────────────────────────────── */

const 실측 = (() => {
  const 파일들 = 통로파일들();
  const 본것 = [];
  for (const f of 파일들) {
    for (const it of 저장열들(fs.readFileSync(f, 'utf8'))) 본것.push({ ...it, 파일: path.relative(ROOT, f) });
  }
  return { 파일수: 파일들.length, 문장들: 본것, 열수: 본것.reduce((n, x) => n + x.열들.length, 0) };
})();

test('분모 — 실제로 몇 개를 쟀는지 먼저 못박는다 (0건은 통과와 같은 모양이다)', () => {
  assert.ok(실측.파일수 >= 5, `운영 통로 파일을 ${실측.파일수}개밖에 못 찾았다 — 훑는 경로가 틀렸다`);
  assert.ok(실측.문장들.length >= 5, `INSERT 를 ${실측.문장들.length}개만 읽었다 — 추출기가 실물 모양을 놓쳤다`);
  assert.ok(실측.열수 >= 50, `열을 ${실측.열수}개만 읽었다 — 열 목록이 중간에 잘렸을 수 있다`);
  const 표들 = new Set(실측.문장들.map((x) => x.표));
  assert.deepEqual([...표들].sort(), [...대상표].sort(), '두 표 중 한쪽 통로를 못 읽었다');
});

test('🔴 운영 쓰기 통로가 저장하는 열은 전부 계약 xor 물리칸 장부다', () => {
  const 필드 = 계약필드();
  const 새는것 = [];
  for (const it of 실측.문장들) {
    for (const n of 미등재(it.열들, 필드)) 새는것.push(`${it.파일}: ${it.표}.${n}`);
  }
  assert.deepEqual(새는것, [], [
    '계약도 물리칸 장부도 모르는 열을 저장하고 있다:',
    ...새는것.map((s) => `  · ${s}`),
    '→ 학습 재료가 될 값이면 계약/수집_교정_계약.json 의 필드 목록에 올린다.',
    '→ 서버 파생·물리 전용이면 lib/이벤트검증.js 의 `물리칸` 에 **계약 밖인 이유**를 적는다.',
  ].join('\n'));
});

test('두 곳 등재 금지 — 물리칸 장부와 계약 필드가 겹치면 어느 쪽이 정본인지 갈린다', () => {
  const 필드 = 계약필드();
  const 겹침 = Object.keys(물리칸).filter((n) => 필드.has(n));
  assert.deepEqual(겹침, [], `물리칸 장부와 계약에 둘 다 있는 이름: ${겹침.join(', ')}`);
});

test('낡은 줄 금지 — 물리칸 장부의 이름은 실제로 어딘가가 저장한다 (양방향)', () => {
  const 저장중 = new Set(실측.문장들.flatMap((x) => x.열들));
  const 안쓰는것 = Object.keys(물리칸).filter((n) => !저장중.has(n));
  assert.deepEqual(안쓰는것, [], `장부에만 남은 이름(통로가 사라졌다): ${안쓰는것.join(', ')}`);
});

test('물리칸 사유는 「아직 안 적었다」가 아니다 — 계약 밖인 이유를 요구한다', () => {
  for (const [이름, 사유] of Object.entries(물리칸)) {
    assert.equal(typeof 사유, 'string', `${이름} 의 사유가 문자열이 아니다`);
    assert.ok(사유.length >= 30, `${이름} 의 사유가 너무 짧다 — 계약 밖인 이유를 적는다`);
    assert.ok(!/나중에|추후|TODO|미정/.test(사유), `${이름} 의 사유가 유예다 — 그런 칸은 계약에 올릴 것이지 여기 둘 것이 아니다`);
  }
});

/* 🔑 B4 가 실제로 벌어졌던 다섯 이름을 **이름으로** 못박는다. 위 검사들은 「새로 생기는 것」을
 * 막지만, 그 다섯이 다시 계약에서 빠지면 이 파일은 그것도 새 위반으로 잡을 뿐 **왜 중요한지**를
 * 잃는다. 여기 적어 두면 되돌린 사람이 그 자리에서 이유를 읽는다. */
test('B4 — 뒤늦게 등재한 다섯은 계약에 그대로 있다', () => {
  const 필드 = 계약필드();
  for (const n of ['session_id', 'content_id', 'task_schema_ver', 'image_refs', 'consent_id']) {
    assert.ok(필드.has(n), `${n} 이 계약 필드에서 다시 빠졌다 — c10 내내 저장되면서 계약에만 없던 자리다(C0 심문 B4)`);
  }
  assert.ok(서버칸.includes('consent_id'), 'consent_id 는 앱이 못 보내는 서버칸이다 — 빠지면 기기가 자기 동의를 선언한다');
  for (const n of ['session_id', 'content_id', 'task_schema_ver', 'image_refs']) {
    assert.ok(n in 선택필드, `${n} 이 선택장부에서 빠졌다 — 계약에 이름만 있고 아무도 안 채우는 상태로 되돌아간다`);
  }
});

/* 🔑 위 B4 절과 같은 이유로 **이름으로** 못박는다 — 위 검사들은 「새로 생기는 것」을 막지만,
 * 처분된 열둘이 원래 자리에서 빠지면 그것도 그냥 새 위반으로만 잡히고 **왜 그쪽이었는지**를
 * 잃는다. 여기 적어 두면 되돌린 사람이 그 자리에서 가른 기준을 읽는다. */
const 교정칸_계약 = ['explanation', 'transcript_at_review', 'verdict', 'reviewer_confidence', 'l1_source_phrase', 'rubric_scores'];
const 교정칸_물리 = ['submission_id', 'reviewed_correction_id', 'supersedes', 'reviewer', 'review_listened_ms', 'promotion_intent'];

test('corrections 열둘 — 계약 여섯은 계약에, 물리칸 여섯은 장부에 (가른 자 = 엔진이 배우는가)', () => {
  const 필드 = 계약필드();
  for (const n of 교정칸_계약) {
    assert.ok(필드.has(n), `${n} 이 계약 필드에서 빠졌다 — 학습 재료인데 계약만 읽는 소비자가 못 본다`);
    assert.ok(n in 선택필드, `${n} 이 선택장부에서 빠졌다 — 계약에 이름만 있고 아무도 안 채우는 상태가 된다`);
  }
  for (const n of 교정칸_물리) {
    assert.ok(n in 물리칸, `${n} 이 물리칸 장부에서 빠졌다 — 계약 밖인 이유가 사라지면 다음 사람이 계약으로 올린다`);
  }
});

test('🔴 `reviewer` 와 `promotion_intent` 는 계약에 «없어야» 한다 (되돌리면 닫힌 판정이 열린다)', () => {
  const 필드 = 계약필드();
  assert.ok(!필드.has('reviewer'), '검수자 식별자가 계약 필드로 올라갔다 — 학습 재료 이름 정본에 사람 식별자가 들어가면 비식별 산출물 조립 목록에 그대로 실린다(코어엔진 불변식 4)');
  assert.ok(!필드.has('promotion_intent'), '훈련 승격 의사가 계약 필드로 올라갔다 — 「이 행을 훈련에 써도 되나」를 말하는 열을 이름만 바꿔 되살린 것이다(`필드로_만들지_않는다.privacy_class` 유호님 기각)');
});
