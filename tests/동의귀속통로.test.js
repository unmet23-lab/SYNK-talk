'use strict';
/**
 * 동의 귀속·출처를 **쓰는 자가 전부 스탬프하는가** — 안전핀 ③이 조여지기 전의 선행 회귀.
 *
 * 🔴 왜 생겼나 (2026-08-10 실측)
 *   `20260807120000`(consent_id 열)과 `20260807140000`(recorded_by 열)은 둘 다 머리말에
 *   **「강제는 다음 조각 몫」**이라 적고 열만 열었다. 이유가 명시돼 있다 — *"지금 강제를 함께
 *   걸면 아직 안 고친 통로(동의발급·왕복시험·배달왕복시험·검증_마이그레이션)가 그 순간
 *   전부 죽는다"*. 그 「안 고친 통로」를 고치는 것이 이 파일이 지키는 상태다.
 *
 * 🔑 이 검사가 없으면 **다음에 새로 생기는 도구가 조용히 그 상태로 돌아간다.** 안전핀을 조이는
 *   날은 아직 안 왔고(마이그 조각은 붓는 날과 한 벌 — `base_version` 이 밀려 낡는다), 그때까지
 *   열 없이 INSERT 해도 아무 데서도 안 빨갛다. 그 창이 정확히 이 병이 자라는 구간이다.
 *
 * ⚠ **층을 밝힌다** — 이건 「소스에 열 이름이 있는가」다. 값이 옳은지(그 학생의 유효한 동의를
 *   가리키는지)는 실왕복이 진다. 열만 있고 null 을 넣는 코드는 여기서 안 잡힌다 — 그건 조이는
 *   날 DB 가 잡는다. 두 층을 섞어 「검증됐다」로 읽지 않는다.
 *
 * 🚫 기존 `tests/운영게이트수리.test.js` 에 얹지 않았다 — 그 파일은 **마이그 조각**이 무엇을
 *   선언했나를 재고(대상=조각·서버 3통로), 이 파일은 **저장소의 모든 쓰기 통로**를 훑는다.
 *   대상 집합이 다른 두 축을 한 파일에 섞으면 나중에 어느 쪽이 빨간지 못 가른다.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { 지금유효술어, 지금유효id식 } = require('../lib/동의게이트.js');

const ROOT = path.resolve(__dirname, '..');

/* 훑는 범위 = **쓰는 코드가 살 수 있는 모든 곳**. 파일 목록을 손으로 적지 않는다 —
 * 「라우팅은 훅보다 넓어야 한다」(CLAUDE.md 가드 맹점 ③): 목록으로 적으면 새 도구가
 * 목록 밖에서 태어나고, 새는 방향은 언제나 「통과」다. */
const 훑을곳 = ['tools', 'lib', path.join('supabase', 'functions')];

/** 대상 소스 전부. @returns {Array<[string, string]>} [저장소 상대경로, 본문] */
function 소스들() {
  const 모음 = [];
  const 훑기 = (rel) => {
    let 목록;
    try { 목록 = fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true }); } catch { return; }
    for (const e of 목록) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = path.join(rel, e.name);
      if (e.isDirectory()) 훑기(p);
      else if (/\.(js|mjs|ts|sh)$/.test(e.name)) {
        모음.push([p.split(path.sep).join('/'), fs.readFileSync(path.join(ROOT, p), 'utf8')]);
      }
    }
  };
  훑을곳.forEach(훑기);
  return 모음;
}

/**
 * 순수 판정 — 어느 INSERT 가 그 열을 빠뜨렸나. 픽스처로 탐지력을 못박기 위해 분리한다.
 * @returns {{건수: number, 위반: string[]}}
 */
/* «시대이전» 예외 — 이 표식이 INSERT 바로 위 3줄 안에 있으면 그 한 건만 면제한다.
 * 왜 있어야 하나(08-24 실측): 검증기 ⑥ 의 seed_lower 는 **그 열이 생기기 전**(c3/c4)
 * 스키마에 심는 타임머신이다 — 스탬프하면 column does not exist 로 죽고, 안 하면 이
 * 검사가 빨갛다. 두 진실이 다 옳으니 예외는 목록이 아니라 **그 자리 표식**으로 뚫는다
 * (목록은 파일 개명에 낡고, 표식은 리뷰 diff 에 그대로 보인다). 합본 스스로
 * 「null 은 이 열이 생기기 전에 선 행이다」라 못박은 그 유산 경로가 이것이다. */
const 시대이전표식 = '동의귀속:시대이전';

function 검사(소스들, 표, 열) {
  const re = new RegExp(`insert\\s+into\\s+engine\\.${표}\\s*\\(([^)]*)\\)`, 'gi');
  let 건수 = 0;
  const 위반 = [];
  for (const [이름, 글] of 소스들) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(글))) {
      건수 += 1;
      const 앞줄들 = 글.slice(0, m.index).split('\n');
      if (앞줄들.slice(-4).some((l) => l.includes(시대이전표식))) continue;
      const 열들 = m[1].split(',').map((s) => s.trim());
      if (!열들.includes(열)) {
        위반.push(`${이름}:${앞줄들.length} — engine.${표} INSERT 에 ${열} 이 없다`);
      }
    }
  }
  return { 건수, 위반 };
}

// ── 실저장소: 거짓양성만 본다(탐지력은 아래 픽스처가 진다) ──

test('🔴 engine.consents 를 넣는 자리 전부가 recorded_by 를 스탬프한다', () => {
  const { 건수, 위반 } = 검사(소스들(), 'consents', 'recorded_by');
  /* 🔑 **분모를 먼저 밝힌다** — 훑기가 0건을 내면 위반도 0이라 통과와 미실행이 같은 모양이다
   *   (CLAUDE.md 「초록은 분모와 함께만 읽는다」). 여기가 그 자리다. */
  assert.ok(건수 > 0, '동의 INSERT 를 한 건도 못 찾았다 — 훑기가 죽었다(그러면 이 검사는 언제나 초록)');
  assert.deepEqual(위반, [], `${건수}건 훑음 · ${위반.join(' / ')}`);
});

test('🔴 engine.learning_events 를 넣는 자리 전부가 consent_id 를 스탬프한다', () => {
  const { 건수, 위반 } = 검사(소스들(), 'learning_events', 'consent_id');
  assert.ok(건수 > 0, '사건 INSERT 를 한 건도 못 찾았다 — 훑기가 죽었다');
  assert.deepEqual(위반, [], 위반.join('\n'));
});

test('훑기가 실제로 두 저장소 층을 다 본다 — 도구와 서버 함수 양쪽', () => {
  /* 범위가 조용히 좁아지면(경로 상수 오타·폴더 개명) 위 둘이 「위반 0」으로 초록이 된다.
   * 그래서 **각 층에서 최소 한 건씩 잡혔는지**를 따로 본다. */
  const 소스 = 소스들();
  const 경로 = 소스.map(([이름]) => 이름);
  assert.ok(경로.some((p) => p.startsWith('tools/')), 'tools/ 를 못 훑었다');
  assert.ok(경로.some((p) => p.startsWith('supabase/functions/')), 'supabase/functions/ 를 못 훑었다');
  assert.ok(경로.some((p) => p.endsWith('.sh')), '.sh 를 못 훑었다 — CI 시드가 사각으로 빠진다');
});

// ── 픽스처: 탐지력을 여기서 못박는다 ──

test('픽스처 — 열이 빠진 구판을 실제로 잡는다(양방향)', () => {
  const 구판 = [
    ['한 줄 형태', `insert into engine.consents (learner_id, consent_ver, agreed_at, schema_ver)\nvalues (1)`],
    ['개행 형태', `insert into engine.consents(\n  consent_id, learner_id, consent_ver\n) values (1)`],
  ];
  for (const [이름, 글] of 구판) {
    assert.equal(검사([['픽스처', 글]], 'consents', 'recorded_by').위반.length, 1, `못 잡았다: ${이름}`);
  }
  const 사건구판 = `insert into engine.learning_events\n  (learner_id, event_type, consent_ver, schema_ver)\nvalues (1)`;
  assert.equal(검사([['픽스처', 사건구판]], 'learning_events', 'consent_id').위반.length, 1,
    '사건 구판을 못 잡았다');
});

test('픽스처 — 열이 있으면 통과한다(거짓양성 없음)', () => {
  const 신판 = `insert into engine.consents (learner_id, consent_ver, agreed_at, schema_ver, recorded_by)\nvalues (1)`;
  assert.deepEqual(검사([['픽스처', 신판]], 'consents', 'recorded_by').위반, []);
  /* 열 목록 끝에 템플릿 조건절이 붙는 실제 모양(`교정왕복시험.js` 의 `사건()`)도 통과해야 한다 —
   * 여기서 거짓양성이 나면 그 파일을 못 고치고 검사를 끄게 된다. */
  const 조건부 = 'insert into engine.learning_events\n  (learner_id, consent_ver, consent_id, schema_ver${지목 ? \', correction_id\' : \'\'})\nvalues (1)';
  assert.deepEqual(검사([['픽스처', 조건부]], 'learning_events', 'consent_id').위반, []);
});

test('픽스처 — 훑을 소스가 없으면 「위반 0」이 아니라 건수 0으로 드러난다', () => {
  assert.equal(검사([], 'consents', 'recorded_by').건수, 0);
  assert.equal(검사([['빈 파일', '']], 'learning_events', 'consent_id').건수, 0);
});

test('픽스처 — «시대이전» 표식은 그 한 건만 면제하고, 멀리 있으면 안 통한다', () => {
  const 면제 = `# ${시대이전표식}: c3 스키마에 심는 씨앗\ninsert into engine.consents (learner_id, consent_ver)\nvalues (1)`;
  const r1 = 검사([['픽스처', 면제]], 'consents', 'recorded_by');
  assert.equal(r1.건수, 1, '면제해도 분모에는 센다 — 훑기가 죽은 것과 가른다');
  assert.deepEqual(r1.위반, []);
  /* 표식이 3줄보다 위에 있으면 무효 — 파일 머리에 한 번 적고 전 건을 면제받는 구멍을 막는다. */
  const 멀리 = `# ${시대이전표식}\n\n\n\n\ninsert into engine.consents (learner_id, consent_ver)\nvalues (1)`;
  assert.equal(검사([['픽스처', 멀리]], 'consents', 'recorded_by').위반.length, 1,
    '멀리 있는 표식이 통했다 — 파일 단위 면제가 된다');
});

// ── 정본 무결성 — 술어가 한 곳에서 파생되는가 ──

test('🔴 지금유효id식 은 정본 술어에서 파생된다 — 다섯 번째 사본이 아니다', () => {
  const 식 = 지금유효id식(`'x'::uuid`);
  const 납작 = (s) => s.replace(/\s+/g, ' ').trim();
  assert.ok(납작(식).includes(납작(지금유효술어)),
    '지금유효id식 이 정본 술어를 안 담고 있다 — 도구들이 정본과 갈라진 조건으로 동의를 고른다');
  assert.match(식, /select consent_id from engine\.consents/, 'id 를 고르는 식이 아니다');
  assert.match(식, /order by agreed_at desc limit 1/, '최신 1행이 아니다 — 여러 행이면 subquery 가 죽는다');
  assert.ok(식.includes(`'x'::uuid`), 'learner 식을 안 받는다');
});
