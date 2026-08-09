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
  corrections: ['correction_id', 'submission_id', 'corrected_text', 'error_tags', 'explanation', 'confirmed_at'],
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

test('몽골어 해설이 DB에서 학생 눈까지 네 마디로 이어져 있다 (한 마디만 끊겨도 증상은 침묵이다)', () => {
  /* 왜 이 한 칸만 이렇게 파나 — `explanation` 은 **물리에 값이 있고 아무도 안 그리는** 형태로
   * c6 부터 살아 있었다(발주 §780 이 「화면에 그대로 나간다」고 적었는데 응답 목록에만 없었다).
   * 서버만 고치고 화면을 잊거나 그 반대여도 오류가 안 난다 — 학생 화면이 조용히 비고, 값은
   * 쌓이므로 나중에 「왜 아무도 해설을 안 봤나」로만 보인다.
   * ⚠ 위 `조회필드` 검사로는 이걸 못 잡는다: 그건 **이름이 파일에 있나**만 보므로, 산문이나
   *   select 한쪽에 이름이 남아 있으면 통과한다(그 검사가 스스로 적어 둔 한계). 그래서 여기서는
   *   **자리를 지목해서** 잰다. */
  const fn = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'corrections', 'index.ts'), 'utf8');
  const md = fs.readFileSync(C0경로, 'utf8');
  const 화면 = fs.readFileSync(path.join(ROOT, 'src', '답장화면.js'), 'utf8');

  // ① DB에서 꺼낸다
  assert.ok(/c\.explanation/.test(fn),
    'corrections 함수의 select 에 c.explanation 이 없다 — 꺼내지 않으면 뒤 세 마디가 다 헛돈다');
  // ② 응답에 싣는다 (select 에만 있으면 조용히 사라진다)
  assert.ok(/explanation: r\.explanation/.test(fn),
    'corrections 함수가 explanation 을 응답 data[] 에 안 싣는다 — 꺼내고 버리는 상태다');
  // ③ 계약 문서의 `data[]` **그 행**에 적혀 있다 (앱 구현자가 읽는 쪽)
  const data행 = md.split('\n').find((l) => l.includes('| `data[]` |') && l.includes('correction_id'));
  assert.ok(data행 && data행.includes('explanation'),
    'C0 §4-3 ② 의 data[] 행에 explanation 이 없다 — 산문에만 있으면 구현자는 못 본다');
  // ④ 화면이 그린다
  assert.ok(/교정\.explanation/.test(화면),
    'src/답장화면.js 가 explanation 을 읽지 않는다 — 서버가 내도 학생 화면에 안 나온다');

  /* 🔴 자형이 없는 폰트를 지정하면 두부(□□□)가 뜨고, 그 화면은 「글자가 안 왔다」와 구별이
   *   안 된다. 해설 줄이 `테마.몽골어`(fontFamily 없음)를 쓰는지 못박는다 — 킷 폰트 4종에
   *   키릴 자형이 없다(P0 §188 · Inter Tight cyrillic-ext 미탑재). */
  assert.ok(/해설: \{ \.\.\.몽골어/.test(화면),
    '해설 줄이 몽골어 스타일(시스템 폰트)을 안 쓴다 — 키릴이 두부로 뜬다');
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

/* 🔴 2026-08-07 절단문서 ①-4 — 인과 참조(`retry_of_event_id`·`parent_event_id`)가 **서버 발급
 *   event_id 만** 받아, 오프라인 큐에서 아직 안 올라간 앞을 가리킬 수단이 **아예 없었다.**
 *   고리가 틀리게 저장되는 게 아니라 **보낼 수 없어 사라진다** — 그래서 소급이 안 된다.
 *   곁들여 `parent_event_id` 는 존재 검사가 없어 FK 가 대신 터졌다: 400 이어야 할 것이 500 이고,
 *   5xx 는 `retryable` 이라 그 발화가 큐에서 영원히 재시도한다.
 * 🔑 여기서 재는 것은 **배선**뿐이다 — 「푼 값이 열로 가는가」·「둘이 같은 통로인가」.
 *   실제로 풀리는지는 `tools/왕복시험.js` ⑮ 가 잰다(자격증명이 필요해 CI 밖). 두 층은 서로를
 *   대신하지 못한다: 배선이 맞아도 쿼리가 틀릴 수 있고, 왕복은 이 저장소가 아니라 배포판을 잰다. */
const 인과배선 = (소스) => {
  const 흠 = [];
  const m = 소스.match(/insert into engine\.learning_events\s*\([^)]*\)\s*values\s*\(([\s\S]*?)\n\s*\)\n\s*on conflict/);
  if (!m) return ['INSERT values 구간을 못 찾았다 — 검사가 죽었다(문 모양이 바뀌었으면 이 정규식부터 고쳐라)'];
  for (const 칸 of ['retry_of_event_id', 'parent_event_id']) {
    // 열로 가는 값이 앱이 보낸 **원값**이면 그 칸은 event_id 만 받는 것이다(=①-4 그대로).
    if (new RegExp(`\\$\\{[^}]*사건\\.${칸}`).test(m[1])) 흠.push(`${칸}: 앱이 보낸 원값이 그대로 열로 간다`);
  }
  /* 통로가 하나인지는 **이름을 안 박고** 잰다 — 개명이 이 검사를 깨우면 안 된다.
   * 둘이 다른 함수를 타면 한쪽만 고쳐지고 증상은 「한 칸만 조용히 안 풀린다」다. */
  const 호출 = [...소스.matchAll(/await\s+([^\s(]+)\(사건\.(retry_of_event_id|parent_event_id)\)/g)];
  const 푼칸 = new Set(호출.map((h) => h[2]));
  for (const 칸 of ['retry_of_event_id', 'parent_event_id']) {
    if (!푼칸.has(칸)) 흠.push(`${칸}: 푸는 통로를 안 지난다`);
  }
  if (new Set(호출.map((h) => h[1])).size > 1) 흠.push('두 칸이 서로 다른 통로를 탄다 — 한쪽만 고쳐진다');
  // 푸는 자리가 두 이름을 다 보는가. 하나만 보면 오프라인 큐의 그 고리는 그대로 사라진다.
  const 풀이 = 소스.match(/select event_id, intervention_id from engine\.learning_events([\s\S]*?)`/);
  if (!풀이) 흠.push('푸는 조회를 못 찾았다 — 검사가 죽었다');
  else for (const 이름 of ['event_id = ', 'idempotency_key = ']) {
    if (!풀이[1].includes(이름)) 흠.push(`푸는 조회가 ${이름.trim()} 로 안 찾는다`);
  }
  // 못 풀었을 때 400 으로 접는가(그냥 넣으면 FK 가 500 을 낸다 = 영원한 재시도).
  if (!/field: 'parent_event_id'/.test(소스)) 흠.push('parent_event_id 를 못 풀었을 때 거절하는 자리가 없다');
  return 흠;
};

test('탐지력 픽스처 — ①-4 이전 모양을 실제로 잡는다 (초록이 「깨끗함」이지 「안 봄」이 아니어야 한다)', () => {
  const 옛판 = [
    "      if (사건.retry_of_event_id) {",
    '        const 원 = await tx`',
    // 조회 자체는 살려 두고 **한 조건만** 뺀다 — 그래야 「없다」가 아니라 「event_id 만 본다」를 잰다.
    '          select event_id, intervention_id from engine.learning_events',
    '           where learner_id = ${learner_id}::uuid and event_id = ${String(사건.retry_of_event_id)}::uuid`;',
    '      }',
    '      const 넣기 = await tx`',
    '        insert into engine.learning_events (',
    '          learner_id, retry_of_event_id, parent_event_id, turn_no',
    '        ) values (',
    '          ${learner_id}::uuid,',
    '          ${(사건.retry_of_event_id ?? null) as string | null}::uuid,',
    '          ${(사건.parent_event_id ?? null) as string | null}::uuid,',
    '          ${(사건.turn_no ?? null) as number | null}',
    '        )',
    '        on conflict (learner_id, idempotency_key) do nothing`;',
  ].join('\n');
  const 흠 = 인과배선(옛판);
  for (const 칸 of ['retry_of_event_id', 'parent_event_id']) {
    assert.ok(흠.some((s) => s.startsWith(`${칸}: 앱이 보낸 원값`)), `옛판의 ${칸} 원값 직결을 못 잡았다`);
    assert.ok(흠.some((s) => s === `${칸}: 푸는 통로를 안 지난다`), `옛판의 ${칸} 통로 부재를 못 잡았다`);
  }
  assert.ok(흠.some((s) => s.includes('idempotency_key')), '옛판 조회가 event_id 만 보는 것을 못 잡았다');
  assert.ok(흠.some((s) => s.includes('거절하는 자리가 없다')), '옛판의 parent_event_id 무검사를 못 잡았다');
  // 검사가 죽는 쪽도 초록이면 안 된다 — 못 찾았다는 통과가 아니다.
  assert.ok(인과배선('').length, '아무것도 없는 소스를 통과시켰다 — 그러면 파일이 바뀌는 날 조용히 초록이 된다');
});

test('인과 참조는 앱이 든 idempotency_key 로도 가리킬 수 있다 (오프라인 큐의 앞 항목은 event_id 가 없다 · ①-4)', () => {
  const 소스 = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'events', 'index.ts'), 'utf8');
  assert.deepEqual(인과배선(소스), [],
    '인과 고리 배선이 ①-4 이전으로 돌아갔다 — 증상은 오류가 아니라 「그 고리가 없다」다.\n' +
    '  오프라인 큐(lib/제출로그.js)는 3일 뒤에 올라가는 항목이 있고, 그 앞 항목은 event_id 가 아직 없다.');
});

/* 🔴 F272(2026-08-09 실측) — 날 `md.includes(v)` 는 산문의 낱말도 값으로 셌다.
 * learner_response 값이 「채택·무시·수정」이라, 교정 수용을 설명하는 이 문서에서
 * 흩어진 평문 세 낱말이 3/3 을 채워 빨개졌다(문서에 값목록은 없는데). 위반 아닌 것을
 * 막는 가드는 낱말 회피를 정상 통로로 만든다(F103 축) — 실제로 이 문서는 「무시」를
 * 「그냥 지나치고」로 바꿔 달고 통과한 상태다.
 * 반대로 표기(백틱·JSON)로 좁히면 이 저장소가 실제로 쓰는 복사 모양을 놓친다 —
 * L0 값목록 줄·표 칸·SQL CHECK 는 전부 **백틱 없는 한글 나열**이다(반박 검토 실측 08-09).
 * 🔑 「통째 복사」의 신호는 표기가 아니라 **근접성**이다: 복사본은 키 이름 곁 한 자리에
 *   전 값이 모이고, 산문의 동음어는 문서 곳곳에 흩어진다. 키가 등장하는 자리마다
 *   짧은 창(앞 80자·뒤 400자 — 값마다 한 행인 표까지 덮는 크기)을 열어 그 안의
 *   서로 다른 값 수를 재고, 표기는 아예 안 본다(백틱을 벗겨도 판정이 같다).
 * ⚠ 긴 값 우선 비겹침 매칭 — 「퀴즈응답」 하나가 「응답」까지 두 값으로 세어지면
 *   창 하나가 저절로 차오른다(거짓 빨강의 새 자리라 여기서 막는다). */
const 값찾기 = (창, 값전부) => {
  const 정렬 = [...new Set(값전부)].sort((a, b) => b.length - a.length);
  let 남은 = 창;
  const 맞음 = new Set();
  for (const v of 정렬) if (남은.includes(v)) { 맞음.add(v); 남은 = 남은.split(v).join('\0'); }
  return 맞음;
};
const 키창들 = (md, 키) => {
  const 창 = [];
  for (let i = md.indexOf(키); i !== -1; i = md.indexOf(키, i + 키.length)) {
    창.push(md.slice(Math.max(0, i - 80), i + 키.length + 400));
  }
  return 창;
};
/** 키 이름 곁 한 창에 모인 서로 다른 값의 최대 개수 — 전부 모이면 그 창이 곧 복사본이다. */
const 창최대값수 = (md, 키, 값들, 값전부) => Math.max(0, ...키창들(md, 키)
  .map((창) => { const 맞음 = 값찾기(창, 값전부); return 값들.filter((v) => 맞음.has(v)).length; }));

test('창최대값수가 살아 있다 (탐지력은 픽스처가 진다 — 실문서가 깨끗한 것과 검사가 죽은 것이 같은 모양이면 안 된다)', () => {
  const LR = ['채택', '무시', '수정'];
  const TT = ['숙제제출', '다시쓰기', '퀴즈응답', '대화턴', '발화녹음', '출석발화'];
  const 전부 = [...LR, ...TT, '응답'];
  // 탐지력: 이 저장소가 실제로 쓰는 복사 모양 5종 — 표기와 무관하게 전부 만석으로 세어진다
  assert.equal(창최대값수('**`task_type` 값목록**(c3): 숙제제출 · 다시쓰기 · 퀴즈응답 · 대화턴 · 발화녹음 · 출석발화',
    'task_type', TT, 전부), 6, 'L0 식 값목록 줄(백틱 없는 한글 나열)을 놓쳤다');
  assert.equal(창최대값수('"task_type": ["숙제제출", "다시쓰기", "퀴즈응답", "대화턴", "발화녹음", "출석발화"]',
    'task_type', TT, 전부), 6, 'JSON 블록 복사를 놓쳤다');
  assert.equal(창최대값수("task_type in ('숙제제출','다시쓰기','퀴즈응답','대화턴','발화녹음','출석발화')",
    'task_type', TT, 전부), 6, 'SQL CHECK 복사를 놓쳤다');
  assert.equal(창최대값수('| `learner_response` | 채택·무시·수정 |', 'learner_response', LR, 전부), 3,
    '표 한 칸 나열을 놓쳤다');
  assert.equal(창최대값수('| `learner_response` | 뜻 |\n| 채택 | 반영 |\n| 무시 | 넘김 |\n| 수정 | 고침 |',
    'learner_response', LR, 전부), 3, '값마다 한 행인 표를 놓쳤다');
  // F272 거짓양성 회귀 — 신고 그 모양: 키 곁엔 한 낱말뿐이고 나머지 동음어는 멀리 흩어져 있다
  assert.equal(창최대값수('`learner_response` — 학생의 응답. 모르는 칸을 무시하고 넘어간다.'
    + 'ㅇ'.repeat(500) + '채택 여부는 검수가 정한다.' + 'ㅇ'.repeat(500) + '이 열은 DB 직접 수정뿐이다.',
    'learner_response', LR, 전부), 1, '흩어진 산문 동음어를 값목록으로 셌다 — F272 그 거짓양성이다');
  // 부분열 회귀 — 「퀴즈응답」만 있는 창에서 「응답」을 세면 안 된다
  assert.equal(창최대값수('`task_format` 예: 퀴즈응답 과업', 'task_format', ['응답'], 전부), 0,
    '긴 값 안의 짧은 값을 따로 셌다(비겹침 매칭이 죽었다)');
});

test('C0가 값목록을 통째로 복사하지 않았다 (복사본은 계약이 개정되는 날 갈라진다)', () => {
  const md = fs.readFileSync(C0경로, 'utf8');
  const 값목록 = 계약.learning_events.값목록;
  const 값전부 = Object.values(값목록).flat();
  for (const [키, 값들] of Object.entries(값목록)) {
    assert.ok(창최대값수(md, 키, 값들, 값전부) < 값들.length,
      `C0의 ${키} 이름 곁 한 창(±수백 자)에 값 ${값들.length}종이 전부 모여 있다 — 그 자리가 곧 값목록 복사본이고, 계약이 개정되면 이 문서만 낡는다.\n` +
      '  고치는 법: 목록을 지우고 계약 파일(계약/수집_교정_계약.json)을 가리킨다(예시 1~2개는 괜찮다).\n' +
      '  ⚠ 백틱을 벗기거나 낱말을 바꿔 다는 것은 수리가 아니다 — 이 검사는 표기를 안 본다(F272).');
  }
});
