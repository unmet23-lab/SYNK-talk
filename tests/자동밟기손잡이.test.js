'use strict';
/**
 * 자동 밟기 손잡이(testID) 회귀 — **흐름과 소스가 갈라지는 것**을 잡는다.
 *
 * ■ 🔴 이 파일이 없으면 무슨 일이 벌어지나
 *   `.maestro/*.yaml` 은 이 저장소의 어떤 테스트도 안 읽는다. Maestro CLI 는 CI 에서 안 돌고
 *   (Actions 소진 · 그리고 실기기·에뮬레이터가 필요하다), 그래서 누가 화면에서 `testID` 를
 *   지워도 **저장소는 전부 초록이다.** 깨진 것은 다음에 흐름을 돌리는 사람이 알게 된다 —
 *   그게 개원 직전이면 그때 고칠 시간이 없다.
 *   ⇒ 흐름이 «부르는 이름»과 화면이 «내는 이름»을 여기서 맞대 본다. 이건 문법 검사가 아니라
 *     **참조 무결성 검사**다.
 *
 * ■ 무엇을 안 재나 (정직하게)
 *   🚫 YAML 문법 · Maestro 명령어의 유효성 — 그건 CLI 만 안다. 여기서는 «어떤 id 를 부르는가»만 본다.
 *   🚫 흐름이 실제로 통과하는가 — 기기가 필요하다. 이 파일이 초록이어도 흐름은 깨질 수 있다.
 *      **이 초록을 「자동 밟기가 돈다」로 읽지 않는다.**
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { 코드만 } = require('./lib/소스검사.js');

const ROOT = path.join(__dirname, '..');
const 흐름칸 = path.join(ROOT, '.maestro');

/** 화면 소스를 통째로 이어 붙인 것 — 손잡이가 어디에 있든 한 번에 본다. */
const 화면코드 = fs.readdirSync(path.join(ROOT, 'src'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => 코드만(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')))
  .join('\n');

/** 흐름 파일이 `id: "..."` 로 부르는 이름 전부. */
function 흐름이부르는손잡이() {
  const 목록 = new Set();
  for (const f of fs.readdirSync(흐름칸).filter((f) => f.endsWith('.yaml'))) {
    const 원문 = fs.readFileSync(path.join(흐름칸, f), 'utf8');
    for (const m of 원문.matchAll(/^\s*id:\s*"([^"]+)"/gm)) 목록.add(m[1]);
  }
  return [...목록];
}

/**
 * 그 손잡이를 화면이 실제로 낼 수 있는가.
 * 🔑 동적으로 조립되는 것들(`입력-${id}` · `답장-${값}`)이 있어서 **접두마다 근거가 다르다** —
 *   그냥 문자열로 찾으면 동적 손잡이는 전부 「없다」로 나온다(거짓 적색).
 */
function 소스가내는가(손잡이, 소스 = 화면코드) {
  const [접두, ...나머지] = 손잡이.split('-');
  const 꼬리 = 나머지.join('-');

  // ① 조립형 — 조립하는 자리 + 그 값을 넘기는 호출부, **둘 다** 있어야 산다
  if (접두 === '입력') {
    return /testID=\{\s*id\s*\?\s*`입력-\$\{id\}`/.test(소스) && new RegExp(`id="${꼬리}"`).test(소스);
  }
  if (접두 === '곁길') {
    return /testID=\{\s*id\s*\?\s*`곁길-\$\{id\}`/.test(소스) && new RegExp(`id="${꼬리}"`).test(소스);
  }
  // ② 계약값형 — 손잡이가 계약 값목록에서 나온다(`학생응답값`). 카피가 아니라 계약이라 안 흔들린다.
  if (접두 === '답장') {
    return /testID=\{`답장-\$\{값\}`\}/.test(소스) && new RegExp(`'${꼬리}'`).test(소스);
  }
  /* ③ 리터럴형. ⚠ 첫 판에서 여기가 **거짓 적색**을 냈다 — `testID={녹음중 ? '녹음-끝' : …}`
     처럼 표현식 «안»에 있는 리터럴을 못 봤다. 그래서 `testID=` 뒤의 중괄호 표현식 내부까지
     본다(줄바꿈 포함). 조립형 ①②를 먼저 거르고 오므로 여기서 넓혀도 그쪽이 안 샌다. */
  return new RegExp(`testID=(\\{[\\s\\S]{0,120}?)?['"\`]${손잡이}['"\`]`).test(소스);
}

test('① 흐름이 부르는 손잡이가 화면에 전부 있다', () => {
  const 부름 = 흐름이부르는손잡이();
  assert.ok(부름.length > 0, '.maestro 에서 손잡이를 하나도 못 뽑았다 — 추출기가 죽었다');

  const 없는것 = 부름.filter((h) => !소스가내는가(h));
  assert.deepEqual(없는것, [],
    `흐름이 부르는데 화면이 안 내는 손잡이 — 이 흐름은 기기에서 반드시 죽는다: ${없는것.join(', ')}`);
});

test('② 탐지력 — 없는 손잡이를 부르면 반드시 빨개진다 (픽스처)', () => {
  /* 실저장소에서 「전부 있다」만 확인하면 검사가 죽어도 초록이다(지침 신뢰성 ②). */
  assert.equal(소스가내는가('말하기-없는버튼'), false, '리터럴형 검사가 아무거나 통과시킨다');
  assert.equal(소스가내는가('입력-없는칸'), false, '조립형(입력) 검사가 호출부를 안 본다');
  assert.equal(소스가내는가('곁길-없는길'), false, '조립형(곁길) 검사가 호출부를 안 본다');
  assert.equal(소스가내는가('답장-없는값'), false, '계약값형 검사가 값목록을 안 본다');

  /* 조립하는 자리가 지워지면(호출부만 남으면) 죽어야 한다 — 실제로 가장 흔한 회귀다 */
  const 조립없앰 = 화면코드.replace(/testID=\{\s*id\s*\?\s*`입력-\$\{id\}`[^}]*\}/g, '');
  assert.equal(소스가내는가('입력-학생번호', 조립없앰), false,
    '검사가 죽었다 — testID 조립부를 지워도 통과한다');
});

test('③ 급소 흐름이 실제로 녹음 두 상태를 다 부른다', () => {
  /* 시작만 누르고 끝을 안 보면 「눌렸다」까지만 재는 흐름이 된다 — 녹음이 안 시작돼도 초록이다. */
  const 부름 = 흐름이부르는손잡이();
  assert.ok(부름.includes('녹음-시작'), '흐름이 녹음 시작을 안 부른다');
  assert.ok(부름.includes('녹음-끝'), '흐름이 녹음 «중» 상태를 확인하지 않는다 — 눌림만 재게 된다');
});

test('④ 흐름이 부르는 다른 흐름(runFlow)이 실제로 있다', () => {
  /* 파일명을 바꾸면 `runFlow:` 참조가 조용히 끊긴다 — 실측으로 한 번 났다(커밋 가드가
     `01_로그인.yaml` 을 자격증명 파일명으로 오탐해 `01_인증.yaml` 로 고치면서 02·03 의
     참조가 같이 안 따라올 뻔했다). 손으로 고치고 끝내면 다음 개명에서 또 난다. */
  for (const f of fs.readdirSync(흐름칸).filter((f) => f.endsWith('.yaml'))) {
    const 원문 = fs.readFileSync(path.join(흐름칸, f), 'utf8');
    for (const m of 원문.matchAll(/^\s*-?\s*runFlow:\s*([^\s#]+\.yaml)/gm)) {
      assert.ok(fs.existsSync(path.join(흐름칸, m[1])),
        `${f} 가 없는 흐름을 부른다: ${m[1]}`);
    }
  }
});

test('⑤ 흐름 파일에 실제 학생 자격이 박혀 있지 않다', () => {
  /* 합성 계정이라도 값을 파일에 박으면 그건 git 에 남는 자격이다 — 환경변수로만 받는다. */
  for (const f of fs.readdirSync(흐름칸).filter((f) => f.endsWith('.yaml'))) {
    const 원문 = fs.readFileSync(path.join(흐름칸, f), 'utf8');
    const 박힘 = 원문.match(/^\s*(inputText|inputRandomText):\s*(?!\$\{)(?!$)\S.*/gm) || [];
    assert.deepEqual(박힘.map((s) => s.trim()), [],
      `${f} 에 값이 직접 박혔다 — \${MAESTRO_*} 환경변수로 받는다`);
  }
});
