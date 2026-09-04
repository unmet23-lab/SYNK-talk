/* 강사 담당 반(`engine.staff_classes`)이 서는 자리를 잰다.
 *
 * 🔴 **왜 생겼나 (2026-09-05 실측)**: 관찰 통로 셋(`observe/roster`·`draft`·`note`)이 08-31 에
 *   섰고 회귀 62개가 초록인데, 그 통로는 **아무 학생도 못 준다**. `observe/roster` 가 학생을
 *   찾는 길이 `learners.class_id → classes → staff_classes → staff` 3단 조인인데,
 *   `staff_classes` 에 행을 넣는 **운영 통로가 0개**였다(insert 는 시험 도구 둘뿐).
 *   증상이 고약하다 — 담당이 없으면 403 이 아니라 **빈 목록**이라(그게 옳은 설계다) 화면은
 *   정상으로 보이고 강사는 「학생이 없네」로 읽는다. `docs/관찰태그_자동화_설계.md` §5 선행 1.
 *
 * 🔑 **자를 어디 두나** — 순수 함수는 «불러서» 재고, 배선은 «구간을 잘라» 잰다.
 *   `담당지는가`·`반갈래` 는 실제로 호출한다. 문(Deno·DB)은 여기서 못 부르므로 소스를 읽되
 *   ①**주석을 먼저 벗기고**(`코드만` — 공용 통로 하나 · F401) ②**강사 구간만** 잘라 본다.
 *   둘 다 안 하면 이 파일 자체가 병에 걸린다: 위 구간에 달린 긴 주석에 「`insert into
 *   engine.classes`」 같은 낱말이 적히는 순간, 「새 반을 안 만든다」 검사가 **주석을 보고**
 *   빨개지거나(거짓 적색) 반대로 코드에서 지운 낱말이 주석에 남아 영원히 초록이 된다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { 담당지는가, 반갈래 } = require(path.join(ROOT, 'lib/명부규칙.js'));
const { 코드만, 구간, 파일소스 } = require('./lib/소스검사.js');

const 문경로 = path.join(ROOT, 'supabase/functions/roster-ingest/index.ts');

/** roster-ingest 의 **강사 담당 반 구간**(주석 벗긴 코드)만 잘라 낸다.
 *  🔑 앵커를 **코드로** 잡는다 — 주석을 앵커로 쓰면 `코드만` 뒤에 사라져 구간이 안 잡힌다.
 *  🔑 끝을 다음 절(`무동의`)로 못박는다 — 파일 끝까지 자르면 뒤 절의 문장이 섞여 든다.
 *  ⚠ `구간` 은 앵커를 못 찾으면 **던진다**(조용한 빈 문자열은 미실행을 초록으로 만든다). */
function 강사구간() {
  return 구간(코드만(파일소스(문경로)), 'const 강사행', 'let 무동의');
}

test('담당지는가 — 강사·원장은 담당을 지고, 학생·학부모는 아니다', () => {
  for (const 값 of ['teacher', 'director', '강사', '원장', 'Teacher', ' TEACHER ']) {
    assert.ok(담당지는가(값), `${값} 은 담당을 져야 한다`);
  }
  for (const 값 of ['student', '학생', 'parent', '학부모', '', 'inspector']) {
    assert.ok(!담당지는가(값), `${값} 에 담당을 주면 남의 반 학생이 열린다`);
  }
});

test('🔴 담당 목록은 «닫아 둔 채» 넓힌다 — 모르는 역할은 담당을 못 진다', () => {
  /* 넓은 기본값(「학생만 아니면 강사」)은 조용히 남의 반을 여는 방향이다. 시트에 새 역할이
   * 생기는 날 이 검사가 먼저 걸려야 한다 — 통과가 아니라 «고치게» 만드는 것이 목적이다. */
  for (const 값 of ['admin', '조교', 'ta', 'staff', '알바']) {
    assert.ok(!담당지는가(값), `모르는 역할 ${값} 이 담당을 졌다 — 목록을 손으로 넓힌 뒤에만 통과해야 한다`);
  }
});

test('반갈래 — 한 칸의 여러 반을 가르고, 빈 칸은 «없음»이다', () => {
  assert.deepStrictEqual(반갈래('초급A, 초급B'), ['초급A', '초급B']);
  assert.deepStrictEqual(반갈래('초급A·중급C/고급D'), ['초급A', '중급C', '고급D']);
  assert.deepStrictEqual(반갈래('  초급A  '), ['초급A']);
  assert.deepStrictEqual(반갈래(''), []);
  assert.deepStrictEqual(반갈래(null), []);
  assert.deepStrictEqual(반갈래('초급A,,초급B'), ['초급A', '초급B'], '빈 조각은 반이 아니다');
});

test('🔴 담당은 «번호»로 잇는다 — 이름으로 이으면 동명이인이 남의 반을 연다', () => {
  const 구간 = 강사구간();
  assert.ok(구간.includes('직원번호맞나'), '직원 번호 규격 검사가 없다 — 아무 문자열이나 계정을 가리킨다');
  assert.ok(구간.includes('이메일('), '번호→계정 변환이 없다');
  assert.ok(!/join engine\.staff[\s\S]{0,200}display_name\s*=/.test(구간),
    '이름으로 직원을 찾고 있다 — 동명이인 하나가 남의 반 학생 원문을 연다');
});

test('🔴 여기서 새 반을 만들지 않는다 — 반의 정본은 학생 명부다', () => {
  const 구간 = 강사구간();
  assert.ok(!/insert\s+into\s+engine\.classes/i.test(구간),
    '강사 행의 오타로 반이 서면 유령 반에 담당이 붙고, 그 강사는 아무 학생도 못 보는데 화면은 정상으로 보인다');
});

test('🔴 여기서 직원 «계정»을 만들지 않는다 (F269 와 같은 결)', () => {
  const 구간 = 강사구간();
  assert.ok(!/insert\s+into\s+engine\.staff(?!_classes)/i.test(구간),
    '시트를 고칠 수 있는 사람이 직원을 만들 수 있게 되면 그 시트가 곧 권한 통로다');
  assert.ok(!/insert\s+into\s+auth\.users/i.test(구간), '계정이 서는 자리는 첫 등록 하나다');
});

test('🔴 스냅샷이다 — 시트에서 빠진 담당을 지운다(담당 = 권한)', () => {
  const 구간 = 강사구간();
  assert.ok(/delete\s+from\s+engine\.staff_classes/i.test(구간),
    '지우지 않으면 반이 바뀐 강사가 남의 반 학생을 계속 본다 — 담당은 곧 학생 이름·관찰 원문의 열쇠다');
  assert.ok(구간.includes('실린직원'),
    '삭제 범위가 «이번 판에 실린 강사»로 좁혀져 있지 않다 — 시트 밖 계정의 담당까지 지운다');
});

test('🔴 강사 행이 하나도 없는 판은 «무동작»이다 — 「모른다」와 「없다」를 가른다', () => {
  const 구간 = 강사구간();
  assert.ok(/if\s*\(\s*강사행\.length\s*\)/.test(구간),
    '역할 열을 아직 안 쓰는 시트(옛 스윕)에서 담당이 통째로 지워진다');
});

test('🔴 못 세운 담당은 «사유와 함께» 되돌린다 — 조용한 실패가 가장 비싸다', () => {
  const 구간 = 강사구간();
  const 사유수 = (구간.match(/사유:/g) || []).length;
  assert.ok(사유수 >= 3, `되돌리는 사유가 ${사유수} 개뿐이다 — 규격·계정·반 셋은 각각 다른 고침을 요구한다`);
  assert.ok(구간.includes('줄:'), '시트 줄 번호가 없으면 고칠 사람이 어디를 고쳐야 할지 모른다');
});

test('응답이 담당을 «센다» — 0건 처리와 안 읽음이 같은 모양이면 안 된다(F207)', () => {
  const 봉투 = 구간(코드만(파일소스(문경로)), 'return 봉투(200,', null);
  for (const 칸 of ['담당새로', '담당해제', '담당문제']) {
    assert.ok(봉투.includes(칸), `응답에 ${칸} 이 없다 — 스윕이 무엇을 했는지 호출자가 못 센다`);
  }
});
