'use strict';
/* 감사 회귀 W2C2 — App.js·저장·인증·마스코트 배선 군단 시공 앵커.
 *   D7-3 오프라인 복원 카드(+자동 재시도) · D7-12 만료가 학생번호를 남긴다 ·
 *   D4-1 가이드(몽글/까몽/마린) 고르기→기기 파일→캐릭터 prop · G1-5 몽글문 배선.
 * ⚠ 몽글문 화면 자체는 tests/몽글문화면.test.js 가 진다 — 여기는 «배선»(도착확인·App)만.
 *
 * ■ 재는 법 둘
 *   · 소스 검사(코드만) — App.js 는 expo useFonts·키체인 탓에 첫 렌더 통로가 못 그린다
 *     (tests/감사회귀_W2C1.test.js 와 같은 판단).
 *   · vm 실왕복 — src/저장.js 는 expo 모듈 탓에 node 가 못 여는데, 세션·가이드 함수는
 *     «키체인/파일 어댑터»만 알면 순수하다. 그래서 그 함수 선언을 소스에서 그대로 떼어
 *     가짜 어댑터 위에서 실제로 돌린다(tests/기기비우기.test.js 의 AST 통로 · 같은 파서).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const parser = require('@babel/parser');
const { 코드만, 파일소스, 구간, 코드만픽스처 } = require('./lib/소스검사.js');
const { 그리기, ROOT } = require('./lib/화면세우기.js');

const 소스 = (상대) => 파일소스(path.join(ROOT, ...상대.split('/')));
const 앱원문 = 소스('App.js');
const 앱 = 코드만(앱원문);
const 저장원문 = fs.readFileSync(path.join(ROOT, 'src', '저장.js'), 'utf8');

test('주석 제거기가 산다 — 아래 소스 검사들이 설명을 코드로 읽지 않는다', () => {
  assert.equal(코드만(코드만픽스처.입력), 코드만픽스처.기대, '주석 제거기가 죽었다 — 이 파일 전체가 거짓 초록이 된다');
});

/* ── 소스에서 «이름난 선언»을 그대로 떼는 통로 (vm 실왕복의 재료) ── */
function 조각들(소스글, 이름들) {
  const ast = parser.parse(소스글, { sourceType: 'module', plugins: ['jsx'] });
  const 모음 = [];
  const 걷기 = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(걷기); return; }
    if (n.type === 'FunctionDeclaration' && n.id && 이름들.includes(n.id.name)) {
      모음.push(소스글.slice(n.start, n.end));
      return;
    }
    if (n.type === 'VariableDeclaration'
      && n.declarations.some((d) => d.id && 이름들.includes(d.id.name))) {
      모음.push(소스글.slice(n.start, n.end));
      return;
    }
    for (const k of Object.keys(n)) {
      if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
      걷기(n[k]);
    }
  };
  걷기(ast.program);
  return 모음;
}

function 저장세우기(이름들, 문맥) {
  const 코드 = 조각들(저장원문, 이름들).join('\n');
  const ctx = vm.createContext({ JSON, ...문맥 });
  vm.runInContext(코드, ctx);
  /* 못 뗀 선언은 «실행으로» 드러낸다(typeof) — 원문 낱말 존재 단언은 래칫이 막는 그 무늬다
     (tests/소스검사통로.test.js · 주석이 낱말을 쥐면 영원히 초록). */
  for (const 이름 of 이름들) {
    assert.notEqual(vm.runInContext(`typeof ${이름}`, ctx), 'undefined',
      `src/저장.js 에서 ${이름} 선언을 못 뗐다 — 이름이 바뀌었으면 이 검사도 따라가야 한다`);
  }
  return ctx;
}

/* ── D7-3 — 복원이 막힌 날의 오프라인 카드 + 자동 재시도 ── */

test('D7-3 복원 catch — retryable 갈래는 키체인을 안 지우고 복원막힘만 세운다', () => {
  const 캐치 = 구간(앱원문, 'const 남은 = await 세션읽기();', '} finally {');
  assert.ok(!/세션지우기/.test(캐치), '복원 catch 가 세션지우기를 부른다 — 만료에도 학생번호를 남기는 문(만료시지우기)이 정문이다(D7-12)');
  assert.match(캐치, /if \(e && !e\.retryable\) \{/, '만료/오프라인을 가르는 retryable 분기가 없다');
  assert.match(캐치, /await 만료시지우기\(\)/, '비-retryable(만료) 갈래가 만료시지우기를 안 부른다');
  const 넘어가는갈래 = 캐치.slice(캐치.indexOf('} else'));
  assert.ok(!/만료시지우기|세션지우기/.test(넘어가는갈래),
    'retryable 갈래에서 키체인을 지운다 — 비행기 모드의 학생이 이유 없이 자격을 잃는다');
  assert.match(넘어가는갈래, /set복원막힘\(true\)/, 'retryable 갈래가 복원막힘을 안 세운다 — 오프라인 카드가 영영 안 뜬다');
});

test('D7-3 오프라인 카드 배선 — !세션 && 복원막힘 이면 인증화면 대신 카드, 손으로가기는 폼으로 내려보낸다', () => {
  assert.match(앱, /import 오프라인카드 from '\.\/src\/오프라인카드';/, '오프라인카드를 안 들여온다');
  assert.ok(앱.includes('<오프라인카드 손으로가기={() => set복원막힘(false)} />'),
    '카드의 출구(손으로가기 → 복원막힘 해제 → 로그인 폼)가 지시서 모양이 아니다');
  const 인증분기 = 구간(앱원문, 'if (!세션) {', '<오류경계');
  assert.match(인증분기, /if \(복원막힘\) \{/, '복원막힘 분기가 인증 분기(!세션) 안에 없다');
  assert.ok(인증분기.indexOf('오프라인카드') < 인증분기.indexOf('<인증화면'),
    '카드가 인증화면보다 뒤다 — 막힌 날에도 로그인 폼이 먼저 선다');
});

test('D7-3 자동 재시도 — AppState active 에서 복원막힘·!세션이면 복원세대를 올리고, 복원 효과가 그 세대를 문다', () => {
  assert.match(앱, /import \{ AppState \} from 'react-native';/, 'AppState 를 안 들여온다');
  assert.match(앱, /AppState\.addEventListener\('change'/, 'AppState 구독이 없다 — 재시도 통로가 0이다');
  assert.match(앱, /상태 === 'active' && 복원막힘 && !세션\) set복원세대\(\(n\) => n \+ 1\)/,
    '재시도 조건(active·복원막힘·!세션)이 지시서 모양이 아니다');
  assert.match(앱, /\}, \[복원세대\]\);/, '복원 효과 deps 가 [복원세대] 가 아니다 — 세대를 올려도 다시 안 돈다');
  const 효과머리 = 구간(앱원문, 'let 살아있음 = true;', 'const 남은 = await 세션읽기();');
  assert.match(효과머리, /set복원막힘\(false\)/, '효과 머리의 복원막힘 리셋이 없다 — 만료로 끝난 재시도 뒤에도 카드가 남는다');
});

test('D7-3 오프라인카드 — 로딩 화면 문법(색.바탕 + 기호 56 · 폰트 안 탐) · 출구는 잉크_보조 · 첫 렌더에 선다', () => {
  const 카드 = 코드만(소스('src/오프라인카드.js'));
  assert.match(카드, /<기호 크기=\{56\} \/>/, '브랜드 기호(56)가 없다 — 로딩 화면과 같은 문법이어야 한다');
  assert.match(카드, /backgroundColor: 색\.바탕/, '바탕이 Navy(색.바탕)가 아니다');
  assert.match(카드, /출구글: \{[^}]*color: 색\.잉크_보조/, '출구 글자가 잉크_보조가 아니다');
  assert.ok(!/색\.신호/.test(카드), '오프라인 카드에 코랄이 올라갔다 — 이 화면에 신호 1점 자리가 없다');
  const 글 = 그리기('src/오프라인카드.js', { 손으로가기() {} });
  assert.match(글, /인터넷이 연결되면 자동으로 들어가요/, '본문 문구가 안 섰다');
  assert.match(글, /다른 계정으로 들어가기/, '기기 넘김 출구가 안 섰다');
});

/* ── D7-12 — 만료가 refresh_token 만 버리고 학생번호는 남긴다 (vm 실왕복) ── */

test('D7-12 만료시지우기 뒤 세션읽기()===null 이면서 학생번호읽기()가 번호를 돌려준다', async () => {
  const 창고 = new Map();
  const ctx = 저장세우기(['세션키', '세션읽기_원시', '세션읽기', '만료시지우기', '학생번호읽기'], {
    웹: false,
    SecureStore: {
      async getItemAsync(k) { return 창고.has(k) ? 창고.get(k) : null; },
      async setItemAsync(k, v) { 창고.set(k, String(v)); },
      async deleteItemAsync(k) { 창고.delete(k); },
    },
  });
  const 키 = vm.runInContext('세션키', ctx);
  창고.set(키, JSON.stringify({ refresh_token: 'r1', 학생번호: 'SYNK-042' }));

  await vm.runInContext('만료시지우기()', ctx);
  assert.equal(await vm.runInContext('세션읽기()', ctx), null,
    '만료 뒤에도 세션읽기가 값을 준다 — 죽은 refresh_token 으로 갱신을 또 시도한다');
  assert.equal(await vm.runInContext('학생번호읽기()', ctx), 'SYNK-042',
    '만료가 학생번호까지 지웠다 — 재로그인 날 첫 칸이 빈다(D7-12 가 막는 그 자리)');
  assert.ok(!String(창고.get(키)).includes('r1'),
    '만료 뒤 키체인에 refresh_token 이 남아 있다 — 버렸다는 말이 거짓이다');

  /* 첫 사용 기기(키체인 비어 있음)도 조용히 지나간다 — 던지면 로그인 화면에 못 닿는다. */
  창고.clear();
  await vm.runInContext('만료시지우기()', ctx);
  assert.equal(await vm.runInContext('학생번호읽기()', ctx), null, '빈 키체인에서 번호가 지어졌다');
});

test('D7-12 배선 — App 이 만료 갈래에서 번호를 상태로 들고 인증화면 첫 칸에 내린다', () => {
  assert.match(앱, /const 남은번호 = await 학생번호읽기\(\)\.catch\(\(\) => null\);/, '만료 갈래가 남은 번호를 안 읽는다');
  assert.match(앱, /<인증화면 로그인성공=\{세션세움\} 초기학생번호=\{초기번호\} \/>/, '로그인 폼에 초기학생번호를 안 내린다');
  const 인증 = 코드만(소스('src/인증화면.js'));
  assert.match(인증, /초기학생번호 = null/, '인증화면 서명에 초기학생번호가 없다');
  assert.match(인증, /useState\(초기학생번호 \|\| ''\)/, '학생번호 칸이 초기값을 안 받는다 — prop 이 장식이 된다');
});

test('D7-12 기기 넘김 정문은 그대로 전부 지운다 — 기기비우기는 세션지우기(만료시지우기 아님)를 부른다', () => {
  const 비우기 = 구간(저장원문, 'export async function 기기비우기', null);
  assert.match(비우기, /await 세션지우기\(\);/, '기기비우기가 세션지우기를 안 부른다 — 다음 학생에게 앞 학생 번호가 남는다');
  assert.ok(!/만료시지우기/.test(비우기), '기기비우기가 만료시지우기를 쓴다 — 기기 넘김에는 학생번호도 남으면 안 된다');
});

/* ── D4-1 — 가이드 고르기(첫등록) → 기기 파일 → 캐릭터 prop ── */

test('D4-1 가이드 왕복 — 쓰기→읽기 · 깨진 파일/정본 밖 이름/부재 → 몽글 폴백 (vm 실왕복)', async () => {
  const 파일들 = new Map();
  class 가짜파일 {
    constructor(_, 이름) { this.이름 = String(이름); }
    get exists() { return 파일들.has(this.이름); }
    textSync() { return 파일들.get(this.이름); }
    write(글) { 파일들.set(this.이름, String(글)); }
    delete() { 파일들.delete(this.이름); }
  }
  const { 혼잣말캐릭터들 } = require(path.join(ROOT, 'lib', '마스코트생명.js'));
  const ctx = 저장세우기(['메모리가이드', '가이드읽기', '가이드쓰기', '가이드지우기'], {
    웹: false, 혼잣말캐릭터들, FS: { File: 가짜파일, Paths: { document: 'doc' } },
  });

  assert.equal(await vm.runInContext('가이드읽기()', ctx), '몽글', '부재의 폴백이 몽글이 아니다');
  await vm.runInContext("가이드쓰기('까몽')", ctx);
  assert.equal(await vm.runInContext('가이드읽기()', ctx), '까몽', '쓰기→읽기 왕복이 안 돈다');
  파일들.set('guide_choice.json', '{깨짐');
  assert.equal(await vm.runInContext('가이드읽기()', ctx), '몽글',
    '깨진 파일이 몽글 폴백이 아니다 — 마스코트 실패 모드는 조용함이다');
  await vm.runInContext("가이드쓰기('보라')", ctx);
  assert.equal(await vm.runInContext('가이드읽기()', ctx), '몽글', '정본 밖 이름이 그대로 살았다 — 어휘는 혼잣말캐릭터들 하나다');
  await vm.runInContext("가이드쓰기('마린')", ctx);
  await vm.runInContext('가이드지우기()', ctx);
  assert.equal(await vm.runInContext('가이드읽기()', ctx), '몽글', '가이드지우기가 파일을 안 지운다 — 기기비우기 합류가 장식이다');
});

test('D4-1 기기비우기 합류 — 가이드 파일도 학생 귀속으로 지운다(세션보다 먼저)', () => {
  const 비우기 = 구간(저장원문, 'export async function 기기비우기', null);
  assert.match(비우기, /await 가이드지우기\(\);/, '기기비우기가 가이드를 안 지운다 — 다음 사람이 앞사람의 가이드로 시작한다');
  assert.ok(비우기.indexOf('가이드지우기') < 비우기.indexOf('await 세션지우기'),
    '가이드가 세션보다 뒤에 지워진다 — 앞이 실패하면 로그인이 남아 다시 시도하는 규약(순서)을 어긴다');
});

test('D4-1 첫등록 — 가이드 고르기 줄(몽글·까몽 활성 + 마린 비활성)과 로그인성공 «직전» 가이드쓰기', () => {
  const 인증원문 = 소스('src/인증화면.js');
  const 인증 = 코드만(인증원문);
  assert.match(인증, /누구랑 같이 공부할래요\?/, '가이드 문항이 화면에 없다');
  assert.match(인증, /보기=\{가이드보기\} 값=\{가이드고름\}/, '가이드 줄이 고르기 컴포넌트를 재사용하지 않는다');
  assert.match(인증, /\{ 값: '마린', 라벨: '마린 · 곧 와요', 라벨_mn: null, 비활성: true \}/,
    '마린 칸이 비활성 「곧 와요」가 아니다 — 그림 외주가 오기 전의 약속 자리다');
  assert.match(인증, /disabled=\{Boolean\(b\.비활성\)\}/, '고르기가 비활성 보기를 안 잠근다');
  const 첫등록 = 구간(인증원문, '[단계.첫등록]:', '[단계.임시]:');
  assert.ok(첫등록.indexOf('가이드쓰기(가이드고름)') >= 0, '첫등록 실행이 가이드를 안 남긴다');
  assert.ok(첫등록.indexOf('가이드쓰기(가이드고름)') < 첫등록.indexOf('로그인성공(새세션)'),
    '가이드쓰기가 로그인성공 뒤다 — App 의 [세션] 가이드 읽기가 옛 값을 줍는다');
  assert.ok(!/가이드고름/.test(구간(인증원문, 'await API.첫등록({', '});')),
    '가이드가 서버 첫등록 페이로드에 실렸다 — lib/가입문항 🚫 새 문항 금지(auth 동봉)를 어긴다');
});

test('D4-1 캐릭터 prop 배선 — App→말하기·답장, 두 화면→마스코트 전 자리, 강사화면은 몽글 고정', () => {
  const 말하기렌더 = 구간(앱원문, "화면 === '말하기' && (", "화면 === '답장' && (");
  assert.match(말하기렌더, /캐릭터=\{캐릭터\}/, 'App 이 말하기화면에 캐릭터를 안 내린다');
  const 답장렌더 = 구간(앱원문, "화면 === '답장' && (", "화면 === '시스템' && ");
  assert.match(답장렌더, /캐릭터=\{캐릭터\}/, 'App 이 답장화면에 캐릭터를 안 내린다');
  assert.match(앱, /가이드읽기\(\)\.then/, 'App 이 가이드를 안 읽는다 — 골라도 전부 몽글로 돈다');

  for (const p of ['src/말하기화면.js', 'src/답장화면.js']) {
    const 화면글 = 코드만(소스(p));
    const 등장들 = 화면글.match(/<마스코트[\s\S]*?\/>/g) || [];
    assert.ok(등장들.length >= 1, `${p} 에서 마스코트가 사라졌다 — 픽스처가 낡았다`);
    for (const 등장 of 등장들) {
      assert.match(등장, /캐릭터=\{캐릭터\}/, `${p} 의 마스코트가 캐릭터를 안 받는다 — 까몽을 골라도 몽글이 선다(빨간 데 0인 회귀)`);
    }
  }
  /* 강사판은 비서(몽글) 고정이다 — 학생 취향이 직원 화면을 갈아입히지 않는다. */
  const 강사 = 코드만(소스('src/강사화면.js'));
  for (const 등장 of 강사.match(/<마스코트[\s\S]*?\/>/g) || []) {
    assert.ok(!/캐릭터=/.test(등장), '강사화면 마스코트에 캐릭터가 실렸다 — 몽글 고정 유지(D4-1)');
  }
});

/* ── G1-5 — 몽글문 배선 (화면 자체는 tests/몽글문화면.test.js) ── */

test('G1-5 배선 — 도착확인 줄버튼(숨기지 않는다)과 App 라우트(시스템으로 돌아간다)', () => {
  const 도착 = 코드만(소스('src/도착확인.js'));
  assert.match(도착, /onPress=\{\(\) => 가기\('몽글'\)\}/, '도착확인에 몽글 문이 없다 — 문고리 0줄(G1-5)이 되돌아온다');
  assert.match(도착, /몽글에게 묻기 \(원장·강사\)/, '줄버튼 문구가 지시서와 다르다');
  assert.match(앱, /import 몽글문화면 from '\.\/src\/몽글문화면';/, 'App 이 몽글문화면을 안 들여온다');
  const 라우트 = 구간(앱원문, "화면 === '몽글' && (", "화면 === '어제' && ");
  assert.match(라우트, /<몽글문화면 토큰=\{세션\.access_token\} 돌아가기=\{\(\) => set화면\('시스템'\)\} \/>/,
    '몽글 라우트가 지시서 모양(토큰·시스템 복귀)이 아니다');
});
