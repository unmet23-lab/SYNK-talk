/* 복습 스케줄러(FSRS-6) 회귀 — 설계 §6 인수 조건을 상시 기계로
 *   (정본 = appsscript docs/복습스케줄러_설계.md · 확정 다섯 = 유호 08-22 「권고 채택」).
 *
 * ■ 무엇을 재나
 *   ① 순수·결정적 — 같은 리뷰 열 → 같은 due(fuzz 0 · 단기 단계 0 · 시각 축은 리뷰 시각 하나).
 *   ② 매핑 한 곳 + `null` 확신도가 Easy 로 안 간다 — 근거 주석(학습자상태 「안 물렸다」)과 정합.
 *   ③ 확정값이 코드에 그대로 산다 — 0.9 · 60일 · fuzz 끔(값이 바뀌면 판정이 바뀐 날이다).
 *   ④ 🔴 상한 가둠 — ts-fsrs 5.4.1 실측: maximum_interval 60 을 줘도 Easy 연타에서 62일이
 *      나왔다(08-22). 계약이 60이면 60은 우리 기계가 보장한다 — 이 검사가 그 실측의 재현이다.
 *   ⑤ due 목록이 결정적 순서다(가장 흐려진 것 먼저 · 동률은 card_id) — 「왜 오늘 이 카드인가」를
 *      사람이 되짚을 수 있어야 한다.
 *   ⑥ 시각 없는 리뷰를 조용히 안 삼킨다(`버린수`) — 파생층 결함이 침묵으로 통과하지 않게. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { 복습설정, 복습등급, 카드접기, 학생카드접기, due카드들, Rating } = require('../lib/복습스케줄.js');

const 리뷰 = (at, 정답, 확신도 = null, card_id = '조사:은는') => ({ card_id, at, 정답, 확신도 });
const 열 = [
  리뷰('2026-08-22T10:00:00Z', true),
  리뷰('2026-08-25T10:00:00Z', true, 'low'),
  리뷰('2026-08-30T10:00:00Z', false),
  리뷰('2026-09-01T10:00:00Z', true, 'guess'),
];

test('① 결정성 — 같은 리뷰 열이면 due·상태가 같고, 입력 순서를 섞어도 같다(시각이 축이다)', () => {
  const a = 카드접기(열);
  const b = 카드접기(열);
  assert.equal(a.due.toISOString(), b.due.toISOString());
  assert.equal(a.stability, b.stability);
  const 섞음 = [열[2], 열[0], 열[3], 열[1]];
  const c = 카드접기(섞음);
  assert.equal(c.due.toISOString(), a.due.toISOString(), '집합이 같은데 순서에 따라 due 가 갈렸다 — 시각 정렬이 죽었다');
  assert.equal(a.reps, 4); assert.equal(a.lapses, 1);
});

test('② 매핑 — 틀림 Again · guess/low Hard · null Good · Easy 는 이 매핑이 절대 안 낸다 (유호 확정 ⓒ)', () => {
  assert.equal(복습등급(false, null), Rating.Again);
  assert.equal(복습등급(false, 'low'), Rating.Again, '틀렸으면 확신도와 무관하게 Again 이다');
  assert.equal(복습등급(true, 'guess'), Rating.Hard);
  assert.equal(복습등급(true, 'low'), Rating.Hard);
  assert.equal(복습등급(true, null), Rating.Good, 'null 은 「안 물렸다」 — 잘한 것으로 세면 곡선이 낙관이 된다');
  assert.equal(복습등급(true, undefined), Rating.Good);
  assert.equal(복습등급(true, ''), Rating.Good);
  for (const 정답 of [true, false]) for (const c of [null, 'low', 'guess', '', undefined]) {
    assert.notEqual(복습등급(정답, c), Rating.Easy, 'Easy 가 나왔다 — 걸린 시간 없는 재료로 등급을 올리지 않는다');
  }
  /* 근거 주석과의 정합 — 매핑의 «왜»는 학습자상태 자기인식축 주석이 정본이다. 그 문구가 사라지면
   * 이 매핑이 근거를 잃은 채 산다(느슨한 낱말 대조 — 문구 다듬기에는 안 깨지게 핵심 낱말만). */
  const 상태원문 = fs.readFileSync(path.join(__dirname, '..', 'lib', '학습자상태.js'), 'utf8');
  assert.ok(/안 물/.test(상태원문), '학습자상태의 「(확신도 null =) 안 물렸다」 근거 주석이 사라졌다 — 매핑 근거를 다시 세워라');
});

test('③ 확정값 — 0.9 · 60일 · fuzz 0 · 단기 단계 0 (값이 바뀌는 날은 판정이 바뀐 날이다)', () => {
  assert.equal(복습설정.request_retention, 0.9);
  assert.equal(복습설정.maximum_interval, 60);
  assert.equal(복습설정.enable_fuzz, false);
  assert.equal(복습설정.enable_short_term, false, '단기 단계가 켜지면 하루 1회 앱에 10분 뒤 due 가 선다');
});

test('④ 🔴 상한 가둠 — Easy 연타에도 간격이 60일을 절대 안 넘는다 (ts-fsrs 62일 실측의 재현)', () => {
  // 라이브러리를 직접 돌리면 62가 나오는 그 열 — 우리 접기는 60에서 가둬야 한다.
  const easy연타 = [];
  let t = Date.parse('2026-08-22T10:00:00Z');
  for (let i = 0; i < 10; i += 1) {
    easy연타.push({ card_id: 'x', at: new Date(t).toISOString(), 정답: true, 확신도: null });
    t += 55 * 86400000;   // 매번 상한 근처에서 복습 — 간격이 최대로 자란다
  }
  const s = 카드접기(easy연타);
  const 간격일 = (s.due.getTime() - s.last_review.getTime()) / 86400000;
  assert.ok(간격일 <= 60 + 1e-9, `due 간격 ${간격일}일 — 계약 상한 60을 넘었다(시즌을 넘는 약속은 뜻이 없다)`);
});

test('⑤ due카드들 — 흐려진 순 · 동률은 card_id 순 · 기준 시각은 호출자가 든다', () => {
  const 리뷰들 = [
    리뷰('2026-08-01T10:00:00Z', true, null, '조사:은는'),
    리뷰('2026-08-02T10:00:00Z', true, null, '어미:높임'),
    리뷰('2026-08-20T10:00:00Z', true, null, '아직멀었다'),
  ];
  const 상태들 = 학생카드접기(리뷰들);
  assert.equal(상태들.size, 3);
  const due = due카드들(상태들, '2026-09-30T00:00:00Z');
  assert.deepEqual(due, ['조사:은는', '어미:높임', '아직멀었다'].filter((id) => 상태들.get(id).due.getTime() <= Date.parse('2026-09-30T00:00:00Z')));
  for (let i = 1; i < due.length; i += 1) {
    assert.ok(상태들.get(due[i - 1]).due.getTime() <= 상태들.get(due[i]).due.getTime(), '흐려진 순이 아니다');
  }
  assert.deepEqual(due카드들(상태들, '2026-08-01T00:00:00Z'), [], '아무도 안 흐려진 날은 빈 목록이다');
  assert.deepEqual(due카드들(상태들, 'not-a-date'), [], '기준 시각이 깨지면 빈 목록 — 전부 due 로 읽지 않는다');
});

test('⑥ 정직성 — 시각 없는 리뷰는 세어서 드러내고, 리뷰 0·card_id 없는 리뷰는 카드가 아니다', () => {
  const s = 카드접기([리뷰('2026-08-22T10:00:00Z', true), { card_id: 'x', at: '깨진 시각', 정답: true }]);
  assert.equal(s.리뷰수, 1); assert.equal(s.버린수, 1, '깨진 리뷰가 조용히 사라졌다 — 파생층 결함이 침묵 통과한다');
  assert.equal(카드접기([]), null);
  assert.equal(학생카드접기([{ at: '2026-08-22T10:00:00Z', 정답: true }]).size, 0, 'card_id 없는 리뷰가 카드가 됐다');
});

/* G7 봉인(엔진심문 0822 · 유호 확정 「잔여 전부 진행해」) — 이 계산기는 **소비자 0 인 파생층**인데
 * 행동층 래칫(이벤트검증)은 «사건 부품» 축이라 이 파일을 원리상 못 센다. 그래서 소비자 명부를
 * 여기 못박는다: 파생층(사건→리뷰 파생 명세가 선 뒤의 소비 코드)이 생기면 이 목록에 그 파일을
 * 더한다 — 안 더하면 빨강이라, G1(장부가 실물을 못 따라오는 병)이 이 파일에서 재발하지 않는다.
 * ⚠ 「소비자 0」은 결함이 아니라 현행 확정이다(유호 08-22 ⓓ 개원 전 «배선만» — 병행 출력·교체 없음). */
test('⑦ 소비자 명부 — 파생층이 생기면 이 목록부터 는다(G7 · 장부-실물 동기)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const ROOT = path.resolve(__dirname, '..');
  const 아는소비자 = ['tests/복습스케줄.test.js'];   // 자기 시험뿐 = 소비자 0 (import 축 — 문자열 언급은 안 센다)
  const 훑을곳 = ['lib', 'src', 'tools', 'contents', 'supabase', 'tests'];
  const 실소비자 = [];
  const 걷기 = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') 걷기(p); continue; }
      if (!/\.(js|ts|mjs)$/.test(e.name)) continue;
      const rel = path.relative(ROOT, p).split(path.sep).join('/');
      if (rel === 'lib/복습스케줄.js') continue;
      if (/(?:require\(|import\(|from)\s*['"`][^'"`]*복습스케줄[^'"`]*['"`]/.test(fs.readFileSync(p, 'utf8'))) 실소비자.push(rel);
    }
  };
  for (const d of 훑을곳) { if (fs.existsSync(path.join(ROOT, d))) 걷기(path.join(ROOT, d)); }
  assert.deepEqual(실소비자.sort(), [...아는소비자].sort(),
    '복습스케줄의 소비자 실물이 명부와 다르다 — 파생층을 세웠으면 이 목록과 트랙.md ④칸을 같은 커밋에서 갱신한다(늘리는 쪽) / 소비자를 지웠으면 여기서도 지운다(줄이는 쪽)');
});
