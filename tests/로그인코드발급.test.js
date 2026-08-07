'use strict';
/**
 * 학생 계정 발급 CLI 회귀 — L0 §4-1·§4-2 · P0 §403
 *
 * 왜 있나 — 이 도구가 조용히 틀리면 **학생이 멈춘 채로 남는다**:
 *   ① 계정만 만들고 동의를 안 넣으면 그 학생은 업로드 403(`CONSENT_MISSING`)이고 배정에서도
 *      빠진다(P0 §345). 증상은 양쪽 다 「앱이 비어 있다」뿐이라 아무도 원인을 못 본다.
 *      유호님 확정(2026-08-07): 동의는 **등록 직후**. 그래서 발급 화면이 그 한 걸음을
 *      **명령 그대로** 들고 있어야 한다(F103 — 막거나 시키려면 따라갈 처방을 함께 준다).
 *   ② 반대로 이 도구가 동의를 **대신 만들면** 그건 편의가 아니라 위조다. 받은 사실이 없는데
 *      근거 행이 생기는 것이라, 구조로 못박는다.
 *   ③ 거절이 종료코드 127 로 나가면 셸에서 「그런 명령이 없다」가 되어 정상적인 거절이
 *      설치 사고로 읽힌다(`교정확정.js` 2026-08-07 실측 · 이 도구도 같은 모양이었다).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { 다음걸음, 따옴표, 코드생성 } = require('../tools/로그인코드발급.js');
const { 길이, 집합, 형식맞나, 표기형 } = require('../lib/로그인코드.js');

const ROOT = path.resolve(__dirname, '..');
const 소스 = fs.readFileSync(path.join(ROOT, 'tools', '로그인코드발급.js'), 'utf8');
const 주석뺀소스 = 소스.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

test('🔴 동의 0건이면 **따라갈 명령 그대로** 준다 — 등록 직후가 유호님 확정이다', () => {
  const 글 = 다음걸음('SYNK-001', 0);
  assert.match(글, /node tools\/동의발급\.js SYNK-001 /,
    '「동의가 필요하다」만 적고 명령을 안 주면 다음 사람이 그 자리에서 멈춘다(F103)');
  assert.match(글, /--적용/, '미리보기 명령만 주면 아무 일도 안 일어나고 끝난다');
  assert.match(글, /403/, '왜 지금 해야 하는지가 없으면 나중으로 밀린다');
});

test('이미 동의가 있으면 새로 넣으라고 하지 않는다 — 같은 판 중복이 그렇게 생긴다', () => {
  const 글 = 다음걸음('SYNK-001', 2);
  assert.match(글, /--현황 --학생 SYNK-001/, '있는 걸 확인하는 쪽으로 보낸다');
  assert.ok(!/--적용/.test(글), '이미 있는데 --적용 을 권하면 중복 발급을 시키는 것이다');
  assert.match(글, /2건/, '몇 건인지 안 보이면 사람이 판단할 재료가 없다');
});

test('🔴 발급기는 동의를 **직접 만들지 않는다** — 받은 적 없는 근거가 생기면 그건 위조다', () => {
  assert.ok(!/insert\s+into\s+engine\.consents/i.test(주석뺀소스),
    '이 도구가 consents 행을 만들면 대면 동의 없이 법적 근거가 선다. 통로는 tools/동의발급.js 하나다');
});

test('동의 유무 질의는 학생 코드를 따옴표로 감싼다 (신뢰 경계)', () => {
  assert.match(주석뺀소스, /from engine\.consents where learner_id/,
    '동의 유무를 안 세면 「이력 N건」 갈래가 늘 거짓이 된다');
  /* 🔴 「어느 한 곳이라도 안전하면 통과」로 쓰면 안 된다 — 이 파일엔 `student_code =` 질의가
   * 둘이고(계정 유무·동의 유무), 하나만 보면 다른 하나가 뚫려도 초록이다. 변이 시험이
   * 정확히 그 구멍으로 살아남았다(2026-08-07 실측). **전부** 감싸는지를 센다. */
  const 자리 = (주석뺀소스.match(/student_code\s*=\s*/g) || []).length;
  const 감싼것 = (주석뺀소스.match(/student_code\s*=\s*\$\{따옴표\(student\)\}/g) || []).length;
  assert.ok(자리 >= 2, `student_code 질의를 ${자리}곳밖에 못 찾았다 — 추출이 낡으면 이 검사가 빈다`);
  assert.equal(감싼것, 자리,
    `student_code 질의 ${자리}곳 중 ${감싼것}곳만 따옴표로 감쌌다 — 나머지는 사람이 친 값이 SQL 이 된다`);
  assert.equal(따옴표("SYNK-001'; drop table engine.learners; --"),
    "'SYNK-001''; drop table engine.learners; --'");
});

test('🔴 거절은 종료코드 1 로 나간다 — process.exit() 는 fetch 중에 127(abort)을 낸다', () => {
  assert.ok(!/process\.exit\s*\(/.test(주석뺀소스), 'process.exit() 대신 process.exitCode 를 세운다');
  assert.match(주석뺀소스, /process\.exitCode = 1/);
});

test('🔴 코드는 암호학적 난수로 만든다 — 이건 비밀번호다', () => {
  /* 주석은 먼저 벗긴다 — 소스가 「Math.random 을 쓰면 안 된다」고 **적어둔 것**을 위반으로
   * 잡으면 거짓양성이고, 거짓양성 가드는 다음 사람이 끈다(교정확정 테스트와 같은 규칙). */
  assert.ok(!/Math\.random/.test(주석뺀소스), 'Math.random 은 예측 가능하다 — 계정 탈취 경로가 된다');
  assert.match(주석뺀소스, /crypto\.randomInt/);

  const 뽑기 = Array.from({ length: 64 }, () => 코드생성());
  뽑기.forEach((c) => {
    assert.equal(c.length, 길이, `코드 길이가 ${길이}가 아니다: ${c}`);
    assert.ok([...c].every((ch) => 집합.includes(ch)), `집합 밖 글자가 섞였다: ${c}`);
    assert.ok(형식맞나(c), `형식 검사를 통과 못 하는 코드를 만든다: ${표기형(c)}`);
  });
  assert.ok(new Set(뽑기).size > 60, '64번 뽑아 겹치는 게 많다 — 난수원이 죽었을 수 있다');
});

test('module 로 불러도 main 이 안 돈다 — 검사가 운영 DB 를 건드리면 안 된다', () => {
  assert.match(소스, /require\.main === module/,
    '가드가 없으면 이 테스트 파일을 부르는 것만으로 계정 발급이 시도된다');
});
