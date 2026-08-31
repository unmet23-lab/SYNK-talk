'use strict';
/* 오류 문구 표 회귀 — `contents/문구_오류.js` 가 **번역이 착지할 자리**를 정말 쥐고 있나.
 *
 * 🔴 이 파일이 막는 사고 셋(전부 증상이 없다):
 *   ① 감수자가 옮긴 문장이 **갈 곳 없이** 파일에만 남는다(표에 그 id 가 없다).
 *   ② 표에만 있고 감수 목록엔 없는 줄 — 영영 한국어로 남는데 아무도 모른다.
 *   ③ 서버 `message` 와 표의 `ko` 가 갈라진다 — 두 벌은 «어쩔 수 없이» 있으므로(서버는
 *      앱 아닌 호출자에게도 답해야 한다) 기계가 맞춰 준다.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { 코드만, 파일소스 } = require('./lib/소스검사.js');
const { 문구, 코드별, 말, 줄들, 코드로말, 아는코드 } = require('../contents/문구_오류.js');
const { 문구_1차 } = require('../contents/문구_1차.js');

const 목록err = 문구_1차.filter((e) => e.string_id.startsWith('err.'));
const 소스 = (p) => 코드만(파일소스(path.join(__dirname, '..', ...p.split('/'))));

test('① 🔴 감수 목록의 err.* 와 표가 **1:1** 이다 — 한쪽에만 있으면 번역이 길을 잃는다', () => {
  const 목록id = 목록err.map((e) => e.string_id).sort();
  const 표id = Object.keys(문구).sort();
  assert.deepEqual(표id, 목록id,
    `표에만 있음: ${표id.filter((x) => !목록id.includes(x)).join(' · ') || '없음'}\n`
    + `  목록에만 있음: ${목록id.filter((x) => !표id.includes(x)).join(' · ') || '없음'}`);
  assert.ok(목록id.length >= 15, `err.* 가 ${목록id.length}줄이다 — 분모가 깨졌다`);
});

test('② 표의 한국어가 감수 목록의 원문과 **한 글자도 안 다르다**', () => {
  /* 갈라지면 감수자는 A 를 옮기고 학생은 B 를 읽는다. 둘 다 우리 글이라 어느 쪽도 안 빨개진다. */
  for (const e of 목록err) {
    assert.equal(문구[e.string_id].ko, e.source_ko, `${e.string_id} 의 원문이 갈라졌다`);
  }
});

test('③ 몽골어는 아직 전부 비어 있다 — 지어낸 번역이 섞이면 여기서 걸린다', () => {
  /* 🔑 감수가 끝나면 이 검사를 **지우는 게 아니라** 「감수 통과분만 차 있다」로 바꾼다.
     지금 지키는 것은 하나다: 기계 번역·임시 번역이 조용히 들어오지 않는 것. */
  const 찬것 = Object.entries(문구).filter(([, v]) => String(v.mn || '').trim());
  assert.deepEqual(찬것.map(([k]) => k), [],
    '출처 없는 몽골어가 표에 들어왔다 — 감수를 지난 것만 여기 온다(틀린 몽골어는 없는 것보다 나쁘다)');
});

test('④ 몽골어가 비면 한 줄만 낸다 — 빈 줄은 화면에서 버그처럼 보인다', () => {
  const 글 = 말('err.network');
  assert.equal(글, '인터넷 연결을 확인해 주세요');
  assert.equal(글.includes('\n'), false, '빈 mn 때문에 줄이 하나 더 생겼다');

  /* 차면 두 줄이 된다 — 표만 채우면 화면 코드가 안 바뀐다는 약속을 여기서 확인한다. */
  const 짝 = { ko: '가', mn: 'Сайн' };
  const 두줄 = [짝.ko, 짝.mn].filter(Boolean).join('\n');
  assert.equal(두줄.split('\n').length, 2);
});

test('④-병기 `줄들` — mn 채운 짝은 두 줄, 빈 mn 은 한 줄(화면 줄배열 병기의 가르는 자)', () => {
  /* 화면(인증·말하기·답장)이 이 함수로 갈라 그리므로, 여기가 갈라지면 병기 렌더가 통째로 갈린다. */
  const 두줄짝 = [{ ko: '가', mn: 'Сайн' }.ko, { ko: '가', mn: 'Сайн' }.mn].filter(Boolean).join('\n');
  assert.deepEqual(줄들(두줄짝), ['가', 'Сайн'], 'mn 채운 짝이 두 줄로 안 갈라진다');
  assert.deepEqual(줄들(말('err.network')), ['인터넷 연결을 확인해 주세요'], '빈 mn 인데 한 줄이 아니다');
  assert.deepEqual(줄들(''), [], '빈 글에서 빈 줄을 지어냈다');
  assert.deepEqual(줄들(null), [], 'null 에서 던지거나 줄을 지어냈다');
});

test('⑤ `{n}` 은 채워지고, 안 채우면 그대로 남는다', () => {
  assert.equal(말('err.password_too_short', { 채움: { n: 6 } }), '비밀번호는 6자 이상으로 정해 주세요');
  assert.equal(말('err.password_too_short'), '비밀번호는 {n}자 이상으로 정해 주세요',
    '못 채운 칸을 지웠다 — 지우면 문장이 조용히 말을 바꾼다');
});

test('⑥ 🔴 모르는 코드는 서버 말이 이긴다 — 일반 문구로 덮으면 원인이 사라진다(F176)', () => {
  assert.equal(코드로말('LOGIN_FAILED', '서버가 준 말'), '학생번호 또는 비밀번호가 맞지 않습니다',
    '아는 코드인데 서버 말을 썼다');
  assert.equal(코드로말('처음보는코드', '서버가 준 말'), '서버가 준 말');
  assert.equal(코드로말(null, '서버가 준 말'), '서버가 준 말', '코드 없는 갈래(게이트웨이 401)도 서버 말이 산다');
  assert.equal(코드로말('처음보는코드', ''), '잠시 뒤 다시 해주세요', '둘 다 없으면 마지막 기본값이 선다');
  assert.equal(아는코드('LOGIN_FAILED'), true);
  assert.equal(아는코드('CONTRACT_VIOLATION'), false,
    'CONTRACT_VIOLATION 을 표에 넣었다 — 그 코드 하나가 여러 말을 해서 엉뚱한 문장이 나간다');
});

test('⑦ 🔴 서버 message 와 표의 ko 가 갈라지지 않는다 — 두 벌은 어쩔 수 없으므로 기계가 맞춘다', () => {
  /* 서버는 앱 아닌 호출자에게도 답해야 해서 자기 문장을 계속 든다. 앱은 번역을 붙이려고
     자기 표를 든다. 그래서 사본 둘이 «정당하게» 존재한다 — 갈라지는 것만 막으면 된다. */
  const fn = 소스('supabase/functions/auth/index.ts');
  /* 🔑 **서버에 남은 다섯을 전부** 센다 — 셋만 재던 것을 08-27 검토에서 넓혔다.
     분모를 좁히면 안 잰 둘이 「맞다」와 구별이 안 된다. */
  const 대조 = [
    'err.signup_gate_failed', 'err.auth_required', 'err.id_format', 'err.password_too_long',
  ];
  let 잰것 = 0;
  for (const id of 대조) {
    assert.ok(fn.includes(문구[id].ko), `서버에 없는 문장을 표가 들고 있다: ${id}\n`
      + `  표: ${문구[id].ko}\n  → 서버가 문장을 고쳤다면 표도 같이 고친다(감수 목록도 함께).`);
    잰것 += 1;
  }
  assert.equal(잰것, 대조.length, '분모가 깨졌다 — 아무것도 안 재고 통과할 뻔했다');

  /* `{n}` 짜리는 템플릿이라 접어서 본다. */
  assert.ok(fn.replace(/\$\{[^}]*\}/g, '{n}').includes(문구['err.password_too_short'].ko));
});

test('⑧ 🔑 화면·통로에 오류 문장 리터럴이 다시 생기지 않는다 — 사본이 갈라지는 유일한 길', () => {
  /* 문장이 화면 파일로 되돌아가면 몽골어가 붙는 날 그 자리만 한국어로 남는다(증상 없음).
     주석은 걷고 본다 — 안 그러면 이 검사가 자기 설명 때문에 빨개진다. */
  const 겨눌것 = ['src/사건통로.js', 'src/인증API.js', 'src/인증화면.js', 'src/제출API.js'];
  const 문장들 = Object.values(문구).map((v) => v.ko).filter((s) => s.length >= 8);
  const 걸린것 = [];
  for (const p of 겨눌것) {
    const src = 소스(p);
    for (const 문장 of 문장들) if (src.includes(문장)) 걸린것.push(`${p} ← ${문장}`);
  }
  assert.deepEqual(걸린것, [], `오류 문장이 코드에 다시 박혔다:\n  ${걸린것.join('\n  ')}`);

  /* 탐지력 — 이 검사가 살아 있나(픽스처로 못박는다 · 실저장소 0건과 미실행은 같은 모양이다). */
  assert.ok(문장들.length >= 10, `겨눈 문장이 ${문장들.length}개다 — 표가 비었다`);
  assert.ok(문장들.some((s) => '앱 설정이 아직 연결되지 않았어요. 학원에 알려 주세요.'.includes(s)),
    '탐지 대상 문장을 하나도 안 골랐다');
});
