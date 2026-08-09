/* 폐기 사유 닫힌 어휘 — **정본은 DB CHECK 하나**, 산문 둘은 그 사본이다.
 *
 * ■ 무엇이 갈라지나
 *   `pipeline_jobs.discard_reason`(20260809090000)의 어휘 6개가 네 곳에 산다:
 *     ① `pipeline_jobs_discard_reason_c10` CHECK  ← **정본**
 *     ② `docs/발주_수집파이프라인.md` §3  (` · ` 로 나열)
 *     ③ `docs/검수_내부계약.md` 표        (`·` 로 나열)
 *     ④ `src/검수API.js` 의 `폐기사유`    (검수 화면이 버튼으로 그린다 · 2026-08-09 넷째가 됐다)
 *   이 저장소에서 **정확히 이 모양**이 두 번 났다 — 계약 값목록을 산문이 통째로 베껴 두고
 *   정본만 움직인 자리(F285 · `L0_데이터계약.md` 「c6 12종」이 정본 c10·13종과 어긋난 건).
 *   증상이 없다는 것이 이 병의 특징이다: 산문은 언제까지고 초록으로 보인다.
 *
 * ■ 왜 「나열 금지」가 아니라 「대조」인가
 *   ②③ 은 사람이 읽는 자리다 — 검수자에게 「사유 여섯 개」를 안 보여 주고 CHECK 이름만
 *   가리키면 문서가 제 일을 안 하는 것이다. 그래서 **베끼는 것을 막지 않고, 베낀 것이
 *   어긋나면 빨개지게** 한다. 없앨 수 없는 사본은 기계에 물린다.
 *
 * ■ 맹점 대비(CLAUDE.md 가드 3맹점)
 *   ① 사람이 실제로 쓰는 표기로 검사한다 — 실제 문서 두 벌을 읽는다(구분자가 서로 다르다).
 *   ② 버그가 아직 있을 것을 요구하지 않는다 — 탐지력은 **픽스처 문자열**이 지고,
 *      실저장소에는 「지금 셋이 같은가」만 건다.
 *   ③ 「0건이면 조용히 죽는다」를 막는다 — 앵커가 안 잡히면 그 자체로 실패다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SQL = fs.readFileSync(path.join(ROOT, 'supabase', 'L0_스키마.sql'), 'utf8');
const 발주 = fs.readFileSync(path.join(ROOT, 'docs', '발주_수집파이프라인.md'), 'utf8');
const 내부계약 = fs.readFileSync(path.join(ROOT, 'docs', '검수_내부계약.md'), 'utf8');

const 제약이름 = 'pipeline_jobs_discard_reason_c10';

/* 정본 — CHECK 정의 안의 따옴표 값. `L0스키마.test.js` 의 `CHECK값목록_` 과 같은 수법이다
 * (판정을 두 곳에 적지 않으려면 합치는 게 맞지만, 그쪽은 `constraint <이름> check` 로
 *  시작하는 인라인 정의를 보고 이쪽은 `add constraint` 문이라 앵커가 다르다). */
function CHECK어휘() {
  const i = SQL.indexOf(`add constraint ${제약이름}`);
  assert.notEqual(i, -1, `SQL 에서 ${제약이름} 을 못 찾았다 — 이름이 바뀌었다면 이 검사도 함께 옮겨라`);
  const 끝 = SQL.indexOf(';', i);
  assert.notEqual(끝, -1, `${제약이름} 정의가 안 닫힌다`);
  const 값 = [...SQL.slice(i, 끝).matchAll(/'([^']+)'/g)].map((m) => m[1]);
  /* `status = 'discarded'` 의 값이 앞에 섞여 온다 — 어휘는 `in (...)` 안쪽뿐이다. */
  return 값.filter((v) => v !== 'discarded');
}

/* 산문에서 나열을 뽑는다 — 구분자가 문서마다 다르다(` · ` / `·`).
 * 값에 공백이 있다(`과제 불일치`)는 것이 이 추출기의 유일한 까다로운 점이다. */
const 나열 = /[가-힣]+(?:\s*·\s*[가-힣]+(?: [가-힣]+)*)+/;
const 최소항목 = 4;
function 산문어휘(본문, 앵커) {
  /* 🔴 앵커만으로는 못 고른다 — 발주서에는 `discard_reason` 을 든 줄이 **둘**이고
   *   그중 하나(§3 머리 「c11 선행」)는 나열이 아니라 **막힌 칸의 목록**이다
   *   (`` `supersedes`·승격 의사·판정 시점 검증 전사·`discard_reason` ``).
   *   그래서 「·이 몇 개인가」가 아니라 **한글 나열이 몇 항목인가**로 고른다.
   *   어휘가 3개 이하로 줄면 이 줄이 후보에서 빠져 「0개다」로 **크게** 실패한다(조용히 통과 아님). */
  const 후보 = 본문.split('\n')
    .filter((l) => l.includes(앵커))
    .map((l) => 나열.exec(l))
    .filter((m) => m && m[0].split('·').length >= 최소항목);
  assert.equal(후보.length, 1,
    `\`${앵커}\` 를 든 ${최소항목}항목 이상 나열이 ${후보.length}개다 — 1개여야 한다(0이면 검사가 조용히 죽고, 2 이상이면 어느 것이 사본인지 모른다)`);
  return 후보[0][0].split('·').map((s) => s.trim());
}

test('정본 CHECK 가 닫힌 어휘 6개를 든다', () => {
  const 어휘 = CHECK어휘();
  assert.equal(어휘.length, 6,
    `폐기 사유가 ${어휘.length}개다: ${어휘.join('·')} — 6개가 아니면 어휘가 바뀐 것이고, 그러면 아래 두 문서도 같은 커밋에서 함께 움직여야 한다`);
});

test('발주서 §3 나열이 CHECK 와 같다 (순서까지)', () => {
  assert.deepEqual(산문어휘(발주, 'discard_reason'), CHECK어휘(),
    'DB 와 발주서가 갈라졌다 — 고치는 법: CHECK 를 먼저 정하고 산문을 그것에 맞춘다(정본은 CHECK 다)');
});

test('검수 내부계약 표의 나열이 CHECK 와 같다 (순서까지)', () => {
  assert.deepEqual(산문어휘(내부계약, 'discard_reason'), CHECK어휘(),
    'DB 와 검수 내부계약이 갈라졌다 — 검수자가 읽는 표라 여기가 낡으면 사람이 없는 사유를 고른다');
});

test('앱 상수 `src/검수API.js` 의 폐기사유가 CHECK 와 같다 (순서까지)', () => {
  /* 🔴 **네 번째 사본**이고 없앨 수가 없다 — 검수자가 여섯 중 하나를 눌러야 하는데 서버는
   *   이 어휘를 내주는 경로가 없다(`review` 는 넷뿐이고 새 엔드포인트는 🚫). 순서까지 보는
   *   이유는 화면이 이 배열을 그대로 그리기 때문이다.
   * 🔴 갈라졌을 때의 증상이 **400 이 아니라 500** 이다: 서버는 CHECK 정의를 읽어 대조하는데
   *   목록에 없는 값이 오면 그 자리에서 죽는다(`review/discard`). 그래서 더 늦게 발견된다.
   * ⚠ 앱 파일은 ESM 이라 `require` 로 못 연다 — 소스에서 배열을 뽑는다(정규식 하나뿐이라
   *   `앱모듈세우기` 를 끌어오는 것보다 이 검사가 원인에 가깝다). 뽑히는 게 0개면 실패다. */
  const 소스 = fs.readFileSync(path.join(ROOT, 'src', '검수API.js'), 'utf8');
  const m = /export const 폐기사유 = Object\.freeze\(\[([^\]]*)\]\)/.exec(소스);
  assert.ok(m, '`export const 폐기사유 = Object.freeze([...])` 를 못 찾았다 — 이름이나 모양이 바뀌었다면 이 검사도 함께 옮겨라');
  const 앱어휘 = [...m[1].matchAll(/'((?:[^']|\\')*)'/g)].map((x) => x[1]);
  assert.ok(앱어휘.length > 0, '앱 상수에서 값을 하나도 못 뽑았다 — 추출기가 죽었다(통과 아님)');
  assert.deepEqual(앱어휘, CHECK어휘(),
    'DB 와 앱이 갈라졌다 — 검수자가 고른 사유가 서버에서 500 으로 죽는다(400 이 아니라 500 이다)');
});

/* 탐지력 — 실저장소가 지금 맞다는 것만으로는 이 검사가 도는지 알 수 없다.
 * 「통과」와 「미실행」이 같은 모양이면 안 된다. */
test('탐지력 픽스처 — 값이 빠지거나 늘어난 산문을 실제로 잡는다', () => {
  const 정상 = '| `pipeline_jobs.discard_reason` | 닫힌 어휘 6(무음·손상·중복·과제 불일치·타인 음성·판정 불가). |';
  assert.deepEqual(산문어휘(정상, 'discard_reason'),
    ['무음', '손상', '중복', '과제 불일치', '타인 음성', '판정 불가']);

  const 하나빠짐 = 정상.replace('·중복', '');
  assert.deepEqual(산문어휘(하나빠짐, 'discard_reason'),
    ['무음', '손상', '과제 불일치', '타인 음성', '판정 불가'], '빠진 값을 못 봤다');

  const 하나늘어남 = 정상.replace('·판정 불가', '·판정 불가·기타');
  assert.deepEqual(산문어휘(하나늘어남, 'discard_reason'),
    ['무음', '손상', '중복', '과제 불일치', '타인 음성', '판정 불가', '기타'], '늘어난 값을 못 봤다');
});

test('탐지력 픽스처 — 공백이 든 값(`과제 불일치`)이 두 조각으로 갈라지지 않는다', () => {
  /* 여기가 이 추출기의 급소다. `[가-힣]+` 만 쓰면 `과제`·`불일치` 로 갈려
   * 어휘가 7개로 보이고, 그 상태에서도 「6개가 아니다」가 아니라 **엉뚱한 값**으로 빨개진다. */
  const 띄어쓰기 = '(`discard_reason`): 무음 · 손상 · 중복 · 과제 불일치 · 타인 음성 · 판정 불가.';
  assert.deepEqual(산문어휘(띄어쓰기, 'discard_reason'),
    ['무음', '손상', '중복', '과제 불일치', '타인 음성', '판정 불가']);
});

test('탐지력 픽스처 — 앵커가 0건이면 통과가 아니라 실패다', () => {
  assert.throws(() => 산문어휘('아무 관련 없는 문서', 'discard_reason'),
    /1개여야 한다/, '앵커를 못 찾았는데 조용히 지나가면 이 검사는 죽은 것이다');
});
