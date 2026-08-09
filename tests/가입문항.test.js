'use strict';
/**
 * 가입 1회 문항 회귀 (L0 §704 · §850 · 발주_수집파이프라인 [CHK-4]).
 *
 * 이 파일이 지키는 것은 **한 번뿐인 자리**다 — 세 칸(`home_aimag`·`gender`·`goal_track`)은
 * 첫 등록에서만 물을 수 있고, 놓치면 되물어도 그때 값이 안 나온다(`goal_track` 은 덮어써지는
 * 칸이라 나중에 물으면 **오늘의 목적**이 나온다). 그래서 검사도 「값이 맞나」보다
 * **「통로가 끊기지 않았나」**를 두껍게 본다 — 끊긴 통로의 증상은 오류가 아니라 **빈 칸**이고,
 * 빈 칸은 등록 200 과 함께 온다.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { 문항, 아이막, 성별, 목표, 답검사 } = require('../lib/가입문항.js');

const ROOT = path.join(__dirname, '..');
const 읽기 = (상대) => fs.readFileSync(path.join(ROOT, 상대), 'utf8');

/* 주석을 걷어낸 판. 🔴 **이 한 줄이 없으면 이 파일의 배선 검사가 전부 거짓 초록이다** — 변이
 * 시험 실측(2026-08-09): `const 문항오류 = 답검사(본문);` 를 `= null; // 답검사(본문)` 로
 * 바꿨는데 「답검사를 부른다」가 그대로 통과했다. 낱말이 남아 있었기 때문이다(CLAUDE.md
 * 「가드는 자기 전처리에도 눈이 먼다」). 문자열 속 `//` 도 같이 잘리지만 여기 검사는 **어느
 * 호출이 있나·먼저인가**만 보므로 그 손상은 결과를 안 바꾼다. */
const 코드만 = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const 온전한답 = () => ({ home_aimag: 'ulaanbaatar', gender: 'undisclosed', goal_track: 'study' });

// ── 값목록 ──────────────────────────────────────────────────
test('목적 3값이 계약([CHK-4])과 같다 — 갈라지면 서버가 앱의 답을 400 으로 접는다', () => {
  assert.deepEqual(목표.map((x) => x.값), ['study', 'work', 'culture']);
});

test('성별에 「밝히지 않음」 자리가 있다 — 기록된 비공개는 빈 칸과 다르다', () => {
  /* 이 보기를 지우면 성별을 밝히기 싫은 학생은 등록을 못 하거나(강제) 칸이 비고(선택),
     빈 칸은 「안 물어봤다」와 구별이 안 돼 분포 점검이 응답률과 성비를 못 가른다. */
  assert.ok(성별.some((x) => x.값 === 'undisclosed'), '🔴 밝히지 않음 보기가 사라졌다');
  assert.equal(답검사({ ...온전한답(), gender: 'undisclosed' }), null);
});

test('아이막은 21 + 울란바토르 = 22, 값은 중복 없고 라벨이 다 있다', () => {
  assert.equal(아이막.length, 22);
  assert.equal(new Set(아이막.map((x) => x.값)).size, 22, '🔴 값이 겹치면 두 지역이 한 칸이 된다');
  assert.ok(아이막.every((x) => x.라벨 && x.라벨[0] === x.라벨[0].toUpperCase()));
  assert.ok(아이막.some((x) => x.값 === 'ulaanbaatar'));
});

test('보기 값은 전부 ASCII — 라벨을 고쳐도 쌓인 행이 안 흔들린다', () => {
  for (const q of 문항) {
    for (const b of q.보기) {
      assert.ok(/^[a-z][a-z-]*$/.test(b.값), `🔴 ${q.필드} 의 값 ${JSON.stringify(b.값)} 이 코드가 아니다`);
    }
  }
});

// ── 검사기 ──────────────────────────────────────────────────
test('세 칸이 다 차야 통과한다', () => {
  assert.equal(답검사(온전한답()), null);
});

test('🔴 빈 값은 통과가 아니다 — 통과시키면 그 학생의 세 칸이 조용히 null 로 남는다', () => {
  for (const 필드 of ['home_aimag', 'gender', 'goal_track']) {
    const 답 = 온전한답();
    delete 답[필드];
    assert.equal(답검사(답)?.필드, 필드, `${필드} 가 비었는데 통과했다`);
  }
  assert.ok(답검사(null));
  assert.ok(답검사(undefined));
  assert.ok(답검사('study'));
});

test('값목록 밖은 막고, 어느 칸인지 말한다', () => {
  assert.equal(답검사({ ...온전한답(), goal_track: 'hobby' })?.필드, 'goal_track');
  assert.equal(답검사({ ...온전한답(), home_aimag: '울란바토르' })?.필드, 'home_aimag');
  assert.equal(답검사({ ...온전한답(), gender: '' })?.필드, 'gender');
});

// ── 배선 — 끊기면 증상이 「빈 칸」뿐이라 여기서 못박는다 ────────────
test('🔴 auth 가 세 열을 **등록을 잇는 그 UPDATE** 에 적는다 (두 번째 쓰기로 미루면 반쪽이 남는다)', () => {
  const src = 읽기('supabase/functions/auth/index.ts');
  const 이음 = src.slice(src.indexOf('update engine.learners\n         set auth_user_id'));
  const 문장 = 이음.slice(0, 이음.indexOf('returning'));
  assert.ok(문장, '등록을 잇는 UPDATE 를 못 찾았다 — 이 검사가 무엇을 재는지부터 깨졌다');
  for (const 열 of ['home_aimag', 'gender', 'goal_track']) {
    assert.ok(new RegExp(`${열}\\s*=\\s*\\$\\{`).test(문장),
      `🔴 ${열} 이 그 UPDATE 에 없다 — 등록은 200 인데 그 칸은 영원히 빈다`);
  }
});

test('🔴 검사가 계정을 만들기 **전에** 돈다 — 뒤로 밀면 거절당한 학생이 빈 칸인 채 등록된다', () => {
  const src = 코드만(읽기('supabase/functions/auth/index.ts'));
  /* 🔑 「부른다」가 아니라 **「그 결과로 갈라진다」**를 잰다 — 부르기만 하고 값을 버리면
     검사는 있는데 아무것도 안 막는다(그 모양이 실제로 변이에서 살아남았다). */
  const 호출 = src.search(/const\s+문항오류\s*=\s*답검사\(본문\)\s*;/);
  assert.ok(호출 > 0, '🔴 서버가 답검사의 결과를 안 받는다');
  assert.ok(/if\s*\(문항오류\)\s*\{[\s\S]{0,400}?CONTRACT_VIOLATION/.test(src),
    '🔴 문항오류를 받아 놓고 거절하지 않는다 — 검사가 통과 방향으로 샌다');
  assert.ok(호출 < src.indexOf('계정만들기(주소'),
    '🔴 답검사가 계정 생성 뒤로 밀렸다 — 그 학생은 다시 이 통로에 못 들어온다(이미 등록됨 = 게이트 실패)');
});

test('🔴 동봉 표에 가입문항이 있다 — 없으면 배포는 성공하고 함수가 import 에서 죽는다', () => {
  const 표 = JSON.parse(읽기('supabase/functions/auth/동봉.json'));
  assert.equal(표['가입문항.mjs'], 'lib/가입문항.js');
});

test('🔴 값목록을 서버가 다시 적지 않는다 — 두 곳에 적으면 갈라지고 증상은 「어떤 학생만」이다', () => {
  const src = 읽기('supabase/functions/auth/index.ts');
  for (const 값 of ['study', 'work', 'culture', 'undisclosed']) {
    assert.ok(!new RegExp(`['"]${값}['"]`).test(src), `🔴 auth 가 ${값} 를 직접 적었다`);
  }
});

test('🔴 화면은 세 문항을 다 고르기 전에 버튼을 열지 않는다 (선택이면 건너뛴 학생이 영구 null)', () => {
  const src = 읽기('src/인증화면.js');
  const 첫등록칸 = src.slice(src.indexOf('[단계.첫등록]'), src.indexOf('[단계.임시]'));
  assert.ok(/쓸수있나:[^\n]*답검사\(가입답\)/.test(첫등록칸),
    '🔴 첫 등록 버튼이 가입답을 안 본다');
  assert.ok(src.includes("from '../lib/가입문항.js'"),
    '🔴 화면이 값목록을 스스로 적고 있다 — 서버와 갈라진다');
});

test('🔴 첫 등록 요청에 세 값이 실린다 (실리는 자리가 여기 하나뿐이다)', () => {
  const src = 읽기('src/인증API.js');
  const 첫등록 = src.slice(src.indexOf('export async function 첫등록'));
  assert.ok(/\.\.\.\(가입답 \|\| \{\}\)/.test(첫등록.slice(0, 첫등록.indexOf('return 로그인'))),
    '🔴 첫등록 본문에 가입답이 안 실린다 — 화면이 물어도 서버엔 안 간다');
});

test('🔴 왕복시험 두 도구가 세 값을 싣는다 — 안 실으면 첫 등록에서 멈춰 뒤 관문이 전부 미측정이다', () => {
  for (const 도구 of ['tools/왕복시험.js', 'tools/인증왕복시험.js']) {
    const src = 읽기(도구);
    assert.ok(/home_aimag:/.test(src) && /goal_track:/.test(src), `🔴 ${도구} 가 가입 문항을 안 싣는다`);
  }
});
