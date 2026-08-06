/**
 * C0 API 계약(docs/C0_API계약.md) ↔ 수집 계약(계약/수집_교정_계약.json) 대조
 *
 * 왜 있나 — C0는 「앱이 무엇을 보내나」의 정본이라 예시에 값이 박힌다.
 *   그 값이 계약 값목록 밖으로 새면 **Codex가 문서대로 만들었는데 서버가 거부한다** —
 *   그리고 그건 화면을 다 만든 뒤에야 드러난다.
 *
 * 🔴 실측 근거: c1→c3에서 L0 초안과 계약 파일이 정확히 이렇게 갈라졌다(이름 4건 ·
 *   과업종류/task_type · 급수/level_snapshot · 강등여부/degraded · confidence 의미 충돌).
 *   그때는 사람이 대조해서 잡았다. 사람이 읽어야 발동하는 장치는 안 돈다.
 *
 * 파일이 따로인 이유 — `계약.test.js`는 교정 어휘 담당이고 여기는 API 문서 담당이다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const 계약 = JSON.parse(fs.readFileSync(path.join(ROOT, '계약', '수집_교정_계약.json'), 'utf8'));
const C0경로 = path.join(ROOT, 'docs', 'C0_API계약.md');

// JSON 예시에 실제로 박히는 표기만 뽑는다 — 설명 문장의 백틱 단어를 값으로 세지 않으려고
const 뽑기 = (text, 키) => [...new Set(
  [...text.matchAll(new RegExp(`"${키}"\\s*:\\s*"([^"]+)"`, 'g'))].map((m) => m[1]))];

test('뽑기 정규식이 살아 있다 (실문서가 깨끗한 것과 검사가 죽은 것이 같은 모양이면 안 된다)', () => {
  const 가짜 = '{ "event_type": "quiz.dropped", "task_type": "받아쓰기" }';
  assert.deepEqual(뽑기(가짜, 'event_type'), ['quiz.dropped']);
  assert.deepEqual(뽑기(가짜, 'task_type'), ['받아쓰기']);
  // 백틱 표기는 값이 아니다(§9의 c4 제안 3종이 여기 걸리면 안 된다)
  assert.deepEqual(뽑기('`event_type`은 무슨 일이 일어났나다', 'event_type'), []);
});

test('C0 예시의 event_type·task_type이 전부 계약 값목록 안에 있다', () => {
  const md = fs.readFileSync(C0경로, 'utf8');
  const 값목록 = 계약.learning_events.값목록;
  let 예시수 = 0;

  for (const 키 of ['event_type', 'task_type']) {
    const 쓰인 = 뽑기(md, 키);
    예시수 += 쓰인.length;
    assert.deepEqual(쓰인.filter((v) => !값목록[키].includes(v)), [],
      `C0 예시의 ${키}가 계약 값목록에 없다 — 문서대로 만든 앱이 보내는 값을 서버가 거부한다.\n` +
      '  고치는 법: 계약 파일에 값을 넣고(c4 개정) **두 저장소 모두에 같은 바이트로** 넣는다 — 문서만 고치지 않는다');
  }

  assert.ok(예시수 >= 2,
    `C0에서 값목록 예시를 ${예시수}개밖에 못 뽑았다 — 예시가 사라졌거나 문서 경로가 바뀌었다`);
});

// ─── 계약 판·오디오 포맷이 문서마다 갈라지는 것을 막는다 ──────────────────────
// 🔴 실측 근거(2026-08-06 GPT 이종 검수 failed_p0): 계약 파일이 c4로 개정된 뒤에도
//   C0 본문은 c3, 업로드 예시는 `audio/m4a`인데 발주서는 PCM WAV였다.
//   한 문서 안에서도 §9 이력은 「c4 실행됨」이라 적고 본문은 c3였다 —
//   **어느 문서를 읽느냐로 서로 다른 앱이 만들어지는 상태**였고, 그건 앱을 다 만든 뒤에 드러난다.
//   사람이 세 문서를 나란히 놓고 읽어야 발동하는 장치는 안 돈다.

const 발주경로 = path.join(ROOT, 'docs', '발주_수집파이프라인.md');
const 정본오디오 = 'audio/wav';   // PCM WAV 16k/16bit/mono — 소급 불가 배선①

test('탐지력 픽스처 — 낡은 판·압축 포맷을 실제로 잡는다 (검사가 죽은 것과 문서가 깨끗한 것은 다르다)', () => {
  assert.deepEqual(뽑기('{ "contract_ver": "c3" }', 'contract_ver'), ['c3']);
  assert.deepEqual(뽑기('{ "content_type": "audio/m4a" }', 'content_type'), ['audio/m4a']);
  assert.deepEqual(뽑기('`contract_ver`는 판 번호다', 'contract_ver'), []);
});

test('C0의 contract_ver 예시가 전부 계약 파일의 현행 판과 같다', () => {
  const md = fs.readFileSync(C0경로, 'utf8');
  const 쓰인 = 뽑기(md, 'contract_ver');
  assert.ok(쓰인.length > 0, 'C0에서 contract_ver 예시를 하나도 못 뽑았다 — 예시가 사라졌거나 문서 경로가 바뀌었다');
  assert.deepEqual(쓰인.filter((v) => v !== 계약.버전), [],
    `C0 예시가 낡은 판을 가리킨다(현행 ${계약.버전}). 구현자는 이 문서를 보고 헤더를 박는다.\n` +
    '  고치는 법: 계약 파일의 `버전`을 올렸으면 C0 본문 예시와 `X-Contract-Ver` 행을 같은 커밋에서 함께 올린다');

  // 헤더 표의 값도 같은 판이어야 한다(JSON 예시만 고치고 표를 두고 가는 것이 실제 사고 형태였다)
  const 헤더행 = md.match(/\|\s*`X-Contract-Ver`\s*\|\s*`([^`]+)`/);
  assert.ok(헤더행, '`X-Contract-Ver` 헤더 행을 못 찾았다 — 표가 바뀌었으면 이 검사부터 고친다');
  assert.equal(헤더행[1], 계약.버전, `\`X-Contract-Ver\` 행이 ${헤더행[1]} 인데 현행은 ${계약.버전} 이다`);
});

test('오디오 업로드 포맷이 C0와 발주서에서 갈라지지 않았다', () => {
  const md = fs.readFileSync(C0경로, 'utf8');
  const 쓰인 = 뽑기(md, 'content_type').filter((v) => v.startsWith('audio/'));
  assert.ok(쓰인.length > 0, 'C0에서 오디오 content_type 예시를 못 뽑았다 — §4-2가 사라졌거나 예시 표기가 바뀌었다');
  assert.deepEqual(쓰인.filter((v) => v !== 정본오디오), [],
    `C0가 정본(${정본오디오}) 아닌 오디오 포맷을 예시로 보여준다.\n` +
    '  압축 포맷은 떨림·미세 발음을 지우고, 지워진 신호는 원본이 없어 영영 복원되지 않는다(배선①).');

  if (!fs.existsSync(발주경로)) return;   // 발주서는 이 저장소 밖으로 옮겨질 수 있다
  const 발주 = fs.readFileSync(발주경로, 'utf8');
  assert.ok(/PCM WAV/.test(발주),
    '발주서가 PCM WAV를 요구하지 않는다 — C0와 갈라지면 구현자가 읽는 문서에 따라 다른 앱이 나온다');
  // 산문이 아니라 **스펙(코드 블록)만** 본다 — 과거 결함을 서술한 문장까지 잡으면
  // 거짓 경보가 되고, 거짓 경보를 내는 가드는 곧 꺼진다.
  const 스펙 = (발주.match(/```[\s\S]*?```/g) || []).join('\n');
  assert.ok(!/audio\/m4a|audio\/aac/.test(스펙),
    '발주서 스펙에 압축 오디오 포맷이 되살아났다 — 배선①(소급 불가)과 충돌한다');
});

/* 조회 3종이 내기로 한 이름. **정본은 C0 §4-3** 이고 여기는 그 이름이 문서·함수 두 곳에
 * 살아 있는지만 본다(값목록처럼 계약 파일에서 파생되는 종류가 아니라, 이 API 만의 이름이다). */
const 조회필드 = {
  progress: ['submission_count', 'retry_count', 'correction_retry'],
  corrections: ['correction_id', 'submission_id', 'corrected_text', 'error_tags', 'confirmed_at'],
  tasks: ['task_id', 'task_snapshot', 'task_format', 'degraded'],
};
const 빠진이름 = (소스, 문서, 키들) => 키들.filter((k) => !소스.includes(k) || !문서.includes(k));

test('탐지력 픽스처 — 이름이 사라지면 실제로 잡는다', () => {
  assert.deepEqual(빠진이름('{ a: 1 }', 'C0 문서에는 있다: retry_count', ['retry_count']), ['retry_count'],
    '함수에서 사라진 이름을 못 잡으면 아래 실저장소 초록은 「깨끗함」이 아니라 「안 봄」이다');
  assert.deepEqual(빠진이름('retry_count: 1', '문서에는 없다', ['retry_count']), ['retry_count'],
    '문서 쪽이 낡은 경우도 같은 사고다 — 앱은 문서를 읽는다');
  assert.deepEqual(빠진이름('retry_count: 1', 'retry_count', ['retry_count']), []);
});

test('조회 응답의 필드 이름이 C0와 함수 양쪽에 살아 있다 (없으면 증상은 「화면이 빈다」뿐이다)', () => {
  /* 왜 있나 — 조회 3종은 실왕복으로만 증명되는데 그 왕복은 **자격증명이 있어야 돌아** CI 에서
   * 안 돈다. 그래서 이름이 통째로 사라지는 것만이라도 파일 층에서 잡는다.
   * ⚠ **부분 개명은 여기서 못 잡는다** — `today` 만 갈고 `yesterday` 를 두면 파일에 이름이
   *   남아 있어 통과한다(2026-08-07 변이로 실측). 그 자리는 왕복 ⑩ 이 진다(두 날을 각각 잰다). */
  const md = fs.readFileSync(C0경로, 'utf8');
  for (const [이름, 키들] of Object.entries(조회필드)) {
    const 소스 = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 이름, 'index.ts'), 'utf8');
    assert.deepEqual(빠진이름(소스, md, 키들), [],
      `functions/${이름} 과 C0 §4-3 중 한쪽에만 있는 이름이 있다 — 앱은 문서를 읽고 서버는 코드대로 낸다`);
  }
});

/* 🔴 2026-08-07 F179 — 검증기가 **필수로 요구하는 필드를 서버가 저장하지 않았다.**
 *   `correction_id` 가 `functions/events` 의 INSERT 열 목록에서 통째로 빠져 있었고, DB CHECK
 *   (`learning_events_correction_target_c8`)는 그 두 사건에 not null 을 걸어서
 *   `correction.viewed`·`correction.responded` 는 **API 로는 100% 거절**됐다.
 *   검증기·서버·DB 세 층이 서로 다른 계약을 믿었고, 세 층 다 자기 층에서는 초록이었다.
 * ☠️ 「실왕복 12/12」가 못 잡은 이유: `tools/교정왕복시험.js` 가 **직접 SQL 로 insert** 한다 —
 *   DB 를 증명한 것이지 앱이 쓰는 통로를 증명한 게 아니었다. 그래서 그 층은 여기서 잡는다.
 * 🔑 필드 하나가 아니라 **형태 전체**를 건다: 검증기가 요구하는 최상위 필드는 전부 열이어야 한다. */
test('검증기가 요구하는 최상위 필드는 전부 events INSERT 열 목록에 있다 (한 칸만 빠져도 그 사건은 DB 가 전건 거절한다)', () => {
  const 검증 = require(path.join(ROOT, 'lib', '이벤트검증.js'));
  const 소스 = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'events', 'index.ts'), 'utf8');

  /* 🔑 파일 전체가 아니라 **열 목록만** 판다. 이 파일 주석에도 `correction_id` 가 여러 번 나오므로
   *   `소스.includes(이름)` 로 재면 열이 지워져도 초록이다 — 가드가 자기 전처리에 눈이 머는 자리. */
  const m = 소스.match(/insert into engine\.learning_events\s*\(([^)]*)\)/);
  assert.ok(m, 'events 의 learning_events INSERT 를 못 찾았다 — 검사가 죽었다(문 모양이 바뀌었으면 이 정규식부터 고쳐라)');
  const 열 = m[1].split(',').map((s) => s.trim()).filter(Boolean);
  assert.ok(열.length > 10, `열 목록 추출이 깨졌다(${열.length}칸) — 빈 목록은 아래 검사를 통째로 무력화한다`);
  assert.ok(열.includes('learner_id'), '열 목록에 learner_id 가 없다 — 엉뚱한 구간을 팠다');

  // 점이 없는 경로 = learning_events 의 칸. `payload.*` 는 jsonb 안, `submission.*` 은 다른 표다.
  const 필수 = [...검증.공통필수, ...Object.values(검증.이벤트별필수).flat(2)]
    .filter((p) => typeof p === 'string' && !p.includes('.'));

  for (const 이름 of new Set(필수)) {
    assert.ok(열.includes(이름),
      `검증기는 '${이름}' 을 필수로 요구하는데 events INSERT 열 목록에 없다 — 앱이 보낸 값을 서버가 버린다.\n` +
      '  증상은 조용하지 않다(DB CHECK 가 걸면 그 사건이 전건 거절된다) — 다만 왕복시험이 직접 SQL 이면 안 보인다.');
  }
});

test('C0가 값목록을 통째로 복사하지 않았다 (복사본은 계약이 개정되는 날 갈라진다)', () => {
  const md = fs.readFileSync(C0경로, 'utf8');
  const 값목록 = 계약.learning_events.값목록;
  for (const [키, 값들] of Object.entries(값목록)) {
    const 등장 = 값들.filter((v) => md.includes(v)).length;
    assert.ok(등장 < 값들.length,
      `C0에 ${키} 값목록 ${값들.length}종이 전부 적혀 있다 — 계약 파일이 개정되면 이 문서만 낡는다.\n` +
      '  고치는 법: 목록을 지우고 계약 파일을 가리킨다(예시 1~2개는 괜찮다)');
  }
});
