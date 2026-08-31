/* 시즌 회고 ③④ — 굳힌 근거와 3갈래 라벨이 «같은 행»에 있어야 엔진에 닿는다.
 *
 * 정본 = appsscript `docs/시즌회고_설계.md` v3 §3-2·§4·§5·§7 (유호님 확정 6건 · 2026-08-12).
 *
 * ■ 이 검사가 지키는 여섯
 *   ① 🔴 **판정이 3갈래인가** — 2갈래로 접히면 목적 변경이 「멀어짐」이 되고 엔진은
 *      「학생이 목적을 바꾸는 것 = 나쁜 신호」를 배운다(철학 Ⅱ-4 를 정면으로 뒤집는 학습).
 *   ② 🔴 **lib 값목록과 DB CHECK 가 같은가** — 같은 판정이 두 층에 산다(하나는 JS·하나는 DDL).
 *      없앨 수 없는 사본은 기계에 물린다(`나침반문항.test.js` 선례). 갈리면 JS 는 통과시키고
 *      DB 가 거절하며, 그 거절은 화면에서 「저장이 안 된다」로만 보인다.
 *   ③ 🔴 **구간을 «반»으로 가르는가** — 창 30일 하나로는 시즌 뒤 절반만 보이고, 「초반에
 *      잘하다 말았다」와 「초반에 못하다 살아났다」가 같은 그림으로 뜬다(설계 §4-1).
 *   ④ 🔴 **`추정판`을 같이 굳히는가** — 축 정의가 v7 로 오른 날 옛 회고 행이 어떤 정의 위에서
 *      판정된 것인지 모르면 종단 대조가 통째로 죽는다(설계 §4).
 *   ⑤ **한 줄 사유를 요구하는가** — 라벨만 남고 「왜」가 사라지면 되짚을 수 없고, 되짚을 수
 *      없는 라벨은 엔진 재료로도 못 쓴다.
 *   ⑥ **굳힌 근거는 못 바꾸고 삭제도 막히는가** — DDL 트리거 두 개가 그 자리다.
 *
 * ■ 맹점 대비(CLAUDE.md)
 *   ① 사람이 쓰는 표기 — 실제 마이그레이션 원문을 읽는다(픽스처 문자열만 재지 않는다).
 *   ② 미실행이 통과와 같은 모양이면 안 된다 — 조각·제약을 못 찾으면 **거기서 실패**한다.
 *   ③ 탐지력은 픽스처로 못박는다 — 구간·굳히기는 손으로 만든 사건 배열로 검사한다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const 회고 = require('../lib/회고.js');
const {
  판정종류, 판정목록, 판정보기, 사유상한, 굳힌판,
  판정검사, 자기판정검사, 구간나누기, 굳히기, 집계정리,
} = 회고;
const { 추정판 } = require('../lib/학습자상태.js');

const 뿌리 = path.resolve(__dirname, '..');
const 조각경로 = path.join(뿌리, 'supabase', 'migrations', '20260812170000_season_review_c11.sql');
assert.ok(fs.existsSync(조각경로), `${조각경로} 가 없다 — ②⑥ 이 통째로 미실행이다`);

/** SQL 주석을 뗀다 — 안 떼면 머리말의 설명 문자열이 검사에 걸려 영원히 초록이 된다.
 *  ⚠ 줄 주석 `--` 도 뗀다: 블록만 떼던 옛 판은 한 줄 설명을 코드로 읽었다.
 *  JS 공용 통로(`tests/lib/소스검사.js`)는 **언어가 달라** 여기 못 쓴다. */
const SQL = fs.readFileSync(조각경로, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

const 하루 = 24 * 60 * 60 * 1000;
const 사건 = (종류, 언제, 나머지 = {}) => ({
  event_id: `e${Math.round(new Date(언제).getTime() / 1000)}-${종류}`,
  event_type: 종류, occurred_at: new Date(언제).toISOString(), ...나머지,
});

/* ── ① 판정 3갈래 ────────────────────────────────────────────────────── */

test('판정은 정확히 3갈래다 — 2갈래면 엔진이 목적 변경을 실패로 배운다(설계 §5)', () => {
  assert.deepEqual(판정목록, ['closer', 'same', 'redirected']);
  assert.equal(판정종류.방향바꿈, 'redirected');
  assert.equal(판정보기.length, 3, '화면에 보일 갈래 수가 값목록과 갈렸다');
  assert.deepEqual(판정보기.map((o) => o.코드), 판정목록, '보기 순서·코드가 값목록과 갈렸다');
});

test('보기 문구가 강사·학생 두 벌이다 — 한 문장이면 한쪽이 반드시 어색해진다', () => {
  for (const o of 판정보기) {
    assert.ok(o.라벨 && o.라벨_학생, `${o.코드} 문구가 비었다`);
  }
  const 바꿈 = 판정보기.find((o) => o.코드 === 판정종류.방향바꿈);
  /* 🔴 목적 변경은 정상 경로다(철학 Ⅱ-4) — 문구가 부정어를 물면 코드값이 3갈래여도
   *   사람 머릿속에서 다시 2갈래가 된다. */
  for (const 금칙 of ['못', '실패', '멀어']) {
    assert.ok(!바꿈.라벨.includes(금칙) && !바꿈.라벨_학생.includes(금칙),
      `redirected 문구에 「${금칙}」이 들어갔다 — 목적 변경을 실패로 그린다`);
  }
});

test('몽골어 문구를 지어 넣지 않았다 — 검수 선행(학생이 «직접» 누르는 칸이다)', () => {
  for (const o of 판정보기) {
    assert.equal(o.라벨_mn, null, `${o.코드} 몽골어(강사)가 미검수 상태로 채워졌다`);
    assert.equal(o.라벨_mn_학생, null, `${o.코드} 몽골어(학생)가 미검수 상태로 채워졌다`);
    assert.ok('라벨_mn_학생' in o, '학생용 몽골어 «칸» 자체가 없다 — 검수 오는 날 화면을 고치게 된다');
  }
});

/* ── ② lib ↔ DB CHECK 대조 ───────────────────────────────────────────── */

function 체크값들(이름) {
  const m = SQL.match(new RegExp(`constraint\\s+${이름}[\\s\\S]*?in \\(([^)]*)\\)`));
  assert.ok(m, `${이름} 을 조각에서 못 찾았다 — 이 대조가 통째로 미실행이다`);
  return m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
}

test('DB CHECK 두 개가 lib 의 3갈래와 «글자까지» 같다 — 갈리면 DB 만 거절한다', () => {
  assert.deepEqual(체크값들('season_review_verdict_c11'), 판정목록);
  assert.deepEqual(체크값들('season_review_self_c11'), 판정목록);
});

test('판정·사유·주체·시각을 «한 벌»로 묶는 CHECK 가 있다 — 갈라지면 라벨로 못 쓴다', () => {
  const m = SQL.match(/constraint\s+season_review_decided_c11 check \(([\s\S]*?)\n\s*\)/);
  assert.ok(m, 'season_review_decided_c11 이 없다');
  for (const 칸 of ['note', 'decided_by', 'decided_at']) {
    assert.ok(m[1].includes(칸), `한 벌 CHECK 가 ${칸} 을 안 본다`);
  }
  assert.ok(m[1].includes("btrim(note) <> ''"), '빈 사유가 통과한다 — 라벨만 남고 「왜」가 사라진다');
});

test('학생×시즌 1행이다 — 두 행이 서면 어느 라벨이 그 시즌의 것인지 모른다', () => {
  assert.match(SQL, /constraint season_review_once_c11 unique \(learner_id, season_id\)/);
});

test('`record_snapshot` 이 not null 이다 — 근거 없이 라벨만 적어 두는 문을 안 연다', () => {
  assert.match(SQL, /record_snapshot jsonb not null/);
});

/* ── ⑥ 굳힌 것 불변 · 순서 · 삭제 금지 (DDL 트리거) ──────────────────── */

test('굳힌 근거·대상·연 시각을 update 가 못 바꾼다 — 프로즈가 아니라 트리거다', () => {
  const m = SQL.match(/function engine\.season_review_freeze\(\)[\s\S]*?\$freeze\$;/);
  assert.ok(m, 'season_review_freeze 함수가 없다 — ⑥ 이 통째로 미실행이다');
  const 본문 = m[0];
  for (const 칸 of ['record_snapshot', 'learner_id', 'season_id', 'opened_at', 'opened_by']) {
    assert.ok(본문.includes(`new.${칸} is distinct from old.${칸}`), `${칸} 변경을 안 막는다`);
  }
  /* 🔴 메아리 차단 — 강사 판정 «뒤»에 학생 칸을 쓰면 대조군이 아니라 메아리다(설계 §7). */
  assert.ok(본문.includes('old.verdict is not null')
    && 본문.includes('new.verdict_by_self is distinct from old.verdict_by_self'),
  '강사 판정 뒤 학생 칸 개서를 안 막는다 — 대조군이 그 자리에서 죽는다');
  assert.match(SQL, /create trigger season_review_freeze\s*\n\s*before update on engine\.season_review/);
});

test('삭제는 막고 개서는 «막지 않는다» — 둘 다 막으면 우회가 정상 통로가 된다(F103)', () => {
  assert.match(SQL, /create trigger season_review_protect\s*\n\s*before delete on engine\.season_review/);
  /* 개서를 막는 트리거가 없어야 한다: before update 트리거는 freeze 하나뿐이다. */
  const 업데이트훅 = SQL.match(/before update on engine\.season_review/g) || [];
  assert.equal(업데이트훅.length, 1, 'update 트리거가 둘이다 — 하나가 개서를 통째로 막고 있을 수 있다');
});

test('RLS 를 켰다 — 나중에 노출하는 날 잊어도 «닫힌 채로» 실패한다', () => {
  assert.match(SQL, /alter table engine\.season_review enable row level security/);
});

/* ── ⑤ 사유·판정 검사 ────────────────────────────────────────────────── */

test('강사 판정은 3갈래 + 한 줄 사유가 «둘 다» 있어야 통과한다', () => {
  assert.equal(판정검사('closer', '발화가 눈에 띄게 늘었다'), null);
  assert.equal(판정검사('closser', '오타 라벨')?.필드, 'verdict');
  assert.equal(판정검사(null, '사유만')?.필드, 'verdict');
  assert.equal(판정검사('same', '')?.필드, 'note');
  assert.equal(판정검사('same', '   ')?.필드, 'note', '공백만 있는 사유가 통과한다');
  assert.equal(판정검사('same', 'ㄱ'.repeat(사유상한 + 1))?.필드, 'note');
  assert.equal(판정검사('same', 'ㄱ'.repeat(사유상한)), null, '상한 «정확히»가 거절된다');
});

test('학생 자기 판정은 클릭 하나뿐이고, `null` 은 이 통로를 «안 부르는» 것이다', () => {
  assert.equal(자기판정검사('redirected'), null);
  assert.equal(자기판정검사(null)?.필드, 'verdict_by_self',
    'null 을 통과시키면 「안 눌렀다」와 「눌렀는데 값이 없다」가 같은 모양이 된다');
  assert.equal(자기판정검사('closser')?.필드, 'verdict_by_self');
});

/* ── ③ 구간 가르기 ───────────────────────────────────────────────────── */

test('시즌을 «반»으로 가른다 — 창 30 을 고정해 넘기지 않는다(설계 §4-2 ⚠)', () => {
  const 구간 = 구간나누기({ starts_on: '2027-03-01', ends_on: '2027-04-30' }, '2027-05-02');
  assert.equal(구간.진행중, false);
  assert.ok(Math.abs(구간.전체일수 - 61) < 0.1, `시즌 길이가 61일이 아니다: ${구간.전체일수}`);
  assert.ok(Math.abs(구간.전반창 - 구간.후반창) < 0.001, '반으로 안 갈렸다');
  assert.ok(구간.전반창 > 30, '두 창이 30일에 못 미친다 — 기본 창을 그대로 쓴 것과 같아진다');
  assert.equal(구간.중간 - 구간.시작, 구간.끝 - 구간.중간);
});

test('끝이 «오늘 이후»로 넘어가지 않는다 — 넘기면 후반 분모가 달력 때문에 부푼다', () => {
  const 구간 = 구간나누기({ starts_on: '2027-03-01', ends_on: '2027-04-30' }, '2027-03-31');
  assert.ok(구간.끝 <= Date.parse('2027-03-31T00:00:00.000Z') + 1);
});

test('`ends_on` 이 null 이면 끝은 «오늘»이고 진행중으로 표시된다(교재를 아직 안 뗐다)', () => {
  const 구간 = 구간나누기({ starts_on: '2027-03-01', ends_on: null }, '2027-04-01T00:00:00Z');
  assert.equal(구간.진행중, true);
  assert.equal(구간.끝, Date.parse('2027-04-01T00:00:00Z'));
});

test('시작을 못 읽거나 시즌이 아직 시작 전이면 «던진다» — 조용히 0으로 재지 않는다', () => {
  assert.throws(() => 구간나누기({ starts_on: null, ends_on: null }, '2027-04-01'), /starts_on/);
  assert.throws(() => 구간나누기({ starts_on: '2027-05-01', ends_on: null }, '2027-04-01'),
    /시작되지 않았다/);
});

/* ── ④ 굳히기 ────────────────────────────────────────────────────────── */

const 시즌픽스처 = {
  season_id: '11111111-1111-1111-1111-111111111111',
  code: '2027-S1', textbook: '한국어 1권',
  starts_on: '2027-03-01', ends_on: '2027-04-30',
};
const 지금픽스처 = '2027-05-01T00:00:00.000Z';

test('전·후반을 «따로» 굳힌다 — 한 층이면 「올라갔다」를 못 만든다(설계 §4-1)', () => {
  /* 앞 절반엔 제출 0, 뒤 절반에 제출 3 — 전형적인 「살아났다」 곡선. */
  const 사건들 = [
    사건('task.assigned', '2027-04-10'), 사건('submission.created', '2027-04-11'),
    사건('task.assigned', '2027-04-12'), 사건('submission.created', '2027-04-13'),
    사건('task.assigned', '2027-04-14'), 사건('submission.created', '2027-04-15'),
  ];
  const 굳힌 = 굳히기(사건들, 시즌픽스처, 집계정리({ 제출수: 3 }), 지금픽스처);
  /* 🔑 표본 0인 축은 `null` 이다(「0이었다」가 아니라 「잴 것이 없었다」 — `학습자상태` 규약).
   *   그 구분이 여기서 값이다: 앞 절반은 잴 것이 없었고 뒤 절반은 3건이었다. */
  assert.equal(굳힌.axes_전반.축.끈기, null, '앞 절반에 없던 제출이 잡혔다');
  assert.equal(굳힌.axes_후반.축.끈기.n, 3, '뒤 절반의 제출 3건이 안 잡혔다');
  /* 🔴 이 대조가 이 설계의 알맹이다 — 두 층을 평균 내면 이 차이가 사라진다. */
  assert.notEqual(굳힌.axes_전반.표본충분도, 굳힌.axes_후반.표본충분도);
});

test('굳힌 것이 «판»을 함께 든다 — 없으면 v7 이 온 날 종단 대조가 죽는다(설계 §4)', () => {
  const 굳힌 = 굳히기([], 시즌픽스처, 집계정리({}), 지금픽스처);
  assert.equal(굳힌.추정판, 추정판, '축 정의 판을 손 사본으로 적었다');
  assert.equal(굳힌.굳힌판, 굳힌판);
  assert.equal(굳힌.굳힌시각, new Date(지금픽스처).toISOString());
  for (const 칸 of ['axes_전반', 'axes_후반', 'season_totals', '구간']) {
    assert.ok(굳힌[칸], `${칸} 이 없다 — 사후확인 쿼리의 「근거없는라벨」이 이 모양을 센다`);
  }
});

test('두 층이 «창 경계와 근거»를 스스로 말한다 — 없으면 재현 대조가 아무것도 증명 못 한다', () => {
  const 굳힌 = 굳히기([사건('submission.created', '2027-04-20')], 시즌픽스처, 집계정리({}), 지금픽스처);
  for (const 층 of [굳힌.axes_전반, 굳힌.axes_후반]) {
    assert.ok(층.as_of && 층.evidence_refs && typeof 층.창일수 === 'number');
    assert.equal(층.evidence_refs.as_of, 층.as_of);
  }
  assert.ok(굳힌.axes_전반.as_of < 굳힌.axes_후반.as_of, '두 층의 기준시각이 같다 — 같은 구간을 두 번 쟀다');
});

test('구간이 시즌 «행»에서 나온다 — 교재 이름·진행 여부까지 행에 남는다', () => {
  const 굳힌 = 굳히기([], { ...시즌픽스처, ends_on: null }, 집계정리({}), 지금픽스처);
  assert.equal(굳힌.구간.textbook, '한국어 1권');
  assert.equal(굳힌.구간.season_id, 시즌픽스처.season_id);
  assert.equal(굳힌.구간.시즌_진행중, true, '진행 중이라는 사실을 숨기면 나중에 다른 값이 나온 이유를 모른다');
});

test('집계는 분자·분모를 «둘 다» 남긴다 — 비율만 담으면 왜곡이 영영 안 보인다', () => {
  const c = 집계정리({ 제출수: 10, 배정수: 12, 교정수: 8, 열람수: 2, 급수_시작: '2', 급수_끝: '3' });
  assert.equal(c.교정수, 8);
  assert.equal(c.열람수, 2);
  assert.equal(c.교정열람률, 0.25);
  assert.equal(집계정리({}).교정열람률, null, '분모 0을 0% 로 접었다 — 「안 봤다」와 「없었다」가 섞인다');
  assert.equal(집계정리(null).제출수, 0);
});

/* ── 화면·통로가 어휘 사본을 안 들었나 ───────────────────────────────── */

test('화면·API 에 판정 코드값 사본이 0개다 — 문구는 서버가 준다', () => {
  for (const 이름 of ['src/회고화면.js', 'src/회고API.js']) {
    const 소스 = fs.readFileSync(path.join(뿌리, 이름), 'utf8');
    for (const 값 of 판정목록) {
      assert.ok(!소스.includes(`'${값}'`) && !소스.includes(`"${값}"`),
        `${이름} 이 판정 코드값 '${값}' 을 손으로 들었다 — 정본이 둘이 된다`);
    }
  }
});

/* ── 사유 상한도 어휘와 같은 규칙이다 — 서버가 안 주면 null 이지, 200 을 지어내지 않는다(G1-12).
 *   손 폴백 200 은 lib/회고.js 상한이 바뀌는 날 화면만 옛 자로 자르는 두 번째 정본이었다. */
test('열기: note_max 가 안 오면 사유상한은 null 이다 — 화면이 서버 상수를 손으로 안 적는다', async () => {
  const { 세우기 } = require('./lib/앱모듈세우기.js');
  const 가짜 = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, learner_id: 'x' }) });
  const api = 세우기(path.join(뿌리, 'src', '회고API.js'), 가짜);
  const r = await api.열기('T', 'SYNK-001');
  assert.equal(r.사유상한, null, '없는 값을 200 으로 접었다 — 폴백이 서버 상한과 갈려도 증상이 없다');
});
