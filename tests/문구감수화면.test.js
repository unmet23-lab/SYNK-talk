'use strict';
/* 문구 감수 화면·API 회귀 — **소스에서** 잰다(RN 을 node 로 못 여는 자리라 그렇다).
 *
 * 🔴 이 파일이 지키는 가장 큰 것 = **자원 격리**
 *   이 통로를 «따로» 낸 유일한 이유가 그것이다: 감수자는 외부 계약자고, 학생 데이터에 못 닿는
 *   것이 권한 설정이 아니라 스키마·통로의 모양으로 보장돼야 한다. 그 전제가 깨지는 모습은
 *   하나뿐이다 — 누군가 편의로 학생 자원을 끌어오는 것. **그때 증상은 없다**(잘 돌아간다).
 *   `tests/문구감수.test.js` ⑩ 이 Edge Fn 쪽을 진다. 여기는 **앱 쪽**을 진다.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { 코드만, 파일소스 } = require('./lib/소스검사.js');
const { VERDICT, 원문결함 } = require('../lib/문구감수.js');

const 소스 = (p) => 코드만(파일소스(path.join(__dirname, '..', ...p.split('/'))));
const 화면 = 소스('src/문구감수화면.js');
const api = 소스('src/문구감수API.js');

test('① 🔴 앱 쪽 통로가 학생 자원에 닿는 낱말을 한 번도 안 쓴다', () => {
  const 금지 = [
    'submission', 'learner', 'correction', 'learning_event', 'staff_access_log',
    'review/queue', 'review/approve', '오디오', '전사', '학생번호',
  ];
  const 걸린것 = [];
  for (const [이름, 본문] of [['화면', 화면], ['API', api]]) {
    for (const n of 금지) if (본문.includes(n)) 걸린것.push(`${이름} ← ${n}`);
  }
  assert.deepEqual(걸린것, [],
    `문구 감수 통로가 학생 자원에 닿는다: ${걸린것.join(', ')}\n`
    + '  이 통로는 외부 계약자가 쓴다 — 자원 격리가 이 통로의 존재 이유다.');
  /* 탐지력 — 검사가 살아 있나(가짜 소스에 넣으면 반드시 잡혀야 한다). */
  assert.ok(금지.some((n) => 'const x = 오디오서명받기(토큰, submission_id)'.includes(n)),
    '검사가 죽었다 — 금지 낱말을 넣어도 안 걸린다');
});

test('② 🔴 이 화면엔 소리가 없다 — 발화 검수 화면과 가장 크게 다른 점', () => {
  for (const n of ['expo-av', 'Audio', 'Sound', '청취', '재생']) {
    assert.equal(화면.includes(n), false, `화면이 소리를 든다: ${n}`);
  }
});

test('③ API 가 주소도 키도 안 든다 — 학생 통로와 «같은 문»을 지난다', () => {
  /* `fetch` 를 따로 쓰면 봉투 해석·계약판 헤더·401 재갱신·네트워크 구분이 두 벌이 되고,
     갈라진 쪽은 조용하다(`src/검수API.js` 머리말과 같은 규율). */
  assert.match(api, /from '\.\/사건통로\.js'/, '공용 문을 안 쓴다');
  for (const n of ['fetch(', 'EXPO_PUBLIC', 'apikey', 'supabase.co']) {
    assert.equal(api.includes(n), false, `API 가 자기 통로를 팠다: ${n}`);
  }
});

test('④ 🔑 판정 어휘의 사본이 0개다 — 화면이 lib 에서 그대로 끌어 쓴다', () => {
  /* `VERDICT` 가 DB CHECK 의 사본이고, 그 사본은 lib 하나뿐이어야 한다. 화면이 목록을 따로
     들면 갈라지고, 그때 증상은 400 이 아니라 **500** 이다(DB 가 CHECK 밖 값을 받고 죽는다). */
  assert.match(화면, /VERDICT/, '화면이 공용 어휘를 안 쓴다');
  for (const v of VERDICT) {
    /* 리터럴로 다시 적으면 안 된다. 단 `원문결함` 은 **상수로** 참조하는 것이 정상이므로
       낱말 자체가 아니라 «따옴표에 싸인 리터럴»만 잡는다. */
    assert.equal(화면.includes(`'${v}'`), false, `화면이 판정 어휘를 리터럴로 다시 적었다: ${v}`);
    assert.equal(화면.includes(`"${v}"`), false, `화면이 판정 어휘를 리터럴로 다시 적었다: ${v}`);
  }
  assert.match(화면, /원문결함/, '「원문을 고쳐야 한다」를 상수로 안 쓴다');
  assert.equal(원문결함, VERDICT[2]);
});

test('⑤ 🔑 검증 규칙의 사본이 0개다 — 서버가 쓰는 확정요청을 화면이 그대로 부른다', () => {
  /* 두 곳에 적으면 갈리고, 갈린 날 감수자는 화면이 통과시킨 것을 서버가 400 으로 되받는다. */
  assert.match(화면, /확정요청\(/, '화면이 공용 검증을 안 부른다');
  /* 화면이 자기 판단을 다시 적었나 — lib 이 이미 지는 규칙 둘을 겨눈다. */
  assert.equal(/final_mn 이 비었습니다/.test(화면), false, '거절 문구를 화면이 다시 적었다');
  assert.equal(/까닭\(note\)이 필요합니다/.test(화면), false, '거절 문구를 화면이 다시 적었다');
});

test('⑥ 🔴 「원문을 고쳐야 한다」에는 번역을 안 싣는다 — 두 말을 한 번에 할 수 없다', () => {
  /* 화면이 그 갈래에서 `final_mn` 을 실으면 서버가 400 을 준다(DB CHECK 도 막는다).
     그 자리는 요청을 만드는 삼항 하나뿐이라, 그 모양을 여기서 못박는다. */
  assert.match(화면, /verdict === 원문결함\s*\n?\s*\?\s*\{ string_id: 줄\.string_id, verdict, note: 까닭 \}/,
    '원문결함 갈래의 요청 모양이 바뀌었다 — final_mn 이 섞이면 서버가 거절한다');
});

test('⑦ 큐 커서는 string_id 하나다 — 남의 커서 꼴을 만들지 않는다', () => {
  assert.match(api, /after=\$\{encodeURIComponent\(옵션\.커서\)\}/,
    '커서 파라미터 이름이 바뀌었다(서버는 `after` 를 읽는다)');
  assert.equal(/\|\|/.test(api.match(/커서[^\n]*/g)?.join('\n') ?? ''), false,
    '복합 커서(`1||시각|uuid`)를 조립하는 자리가 생겼다 — 두 커서가 서로를 통과한다');
});

test('⑧ 화면이 App 과 도착확인에 **둘 다** 배선돼 있다 — 하나만 있으면 아무도 못 연다', () => {
  /* 통로만 서고 여는 자리가 없으면 처리량은 원리상 0이다(`강사화면` 이 그 실측이었다). */
  const app = 소스('App.js');
  const 허브 = 소스('src/도착확인.js');
  assert.match(app, /import 문구감수화면 from '\.\/src\/문구감수화면'/);
  assert.match(app, /화면 === '문구감수'/);
  assert.match(허브, /가기\('문구감수'\)/, '허브에 여는 줄이 없다 — 화면이 서 있어도 못 연다');
});

test('⑨ 미확정 카드에 상한이 있다 — TextInput 수십 장이 무한히 쌓이지 않는다', () => {
  /* 더받기는 누적이고 제거는 확정뿐이라, 상한이 없으면 「더 불러오기」 연타가 ScrollView 에
     TextInput 을 무한히 쌓는다. 상한 정의는 **한 곳**이어야 한다 — 둘이면 갈린다. */
  assert.match(화면, /목록\.length\s*<\s*미확정상한/, '「더 불러오기」가 상한을 안 본다');
  const 정의 = 화면.match(/const 미확정상한/g) || [];
  assert.equal(정의.length, 1, `미확정상한 정의가 ${정의.length}곳이다 — 정확히 1곳이어야 한다`);
});
