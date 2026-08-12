/* 옛 글자(한자·가나) 런타임 게이트 — 학생에게 나갈 글을 «내보내기 직전»에 잰다.
 *
 * 나눔의 근거(가드 세 맹점 ②): **탐지력은 픽스처가 지고, 실저장소는 거짓양성만 본다.**
 * 실저장소에 「지금 한자가 섞여 있다」를 요구하면 그 검사는 **버그가 아직 있을 것을 요구**하게
 * 되고, 고치는 날 빨개진다. 그래서 잡아내는 힘은 손으로 조립한 문자열이 지고, 실물엔
 * 「지금 사본이 갈라져 있지 않다」와 「동봉 표에 올라 있다」만 묻는다.
 *
 * 🔴 **이 파일에도 그 글자를 적지 않는다** — 적으면 형제 저장소의 파일 스캔이 이 소스에 걸린다.
 *   전부 `String.fromCodePoint` 로 조립한다(F298: 위반을 신고하는 글이 새 위반이 되는 자리).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { 옛글자, 찾기, 짚기, 첫걸림 } = require('../lib/옛글자.js');
const { 교정값 } = require('../lib/교정엔진.js');
const 태그목록 = require('../계약/수집_교정_계약.json').오류태그;

/* 실측 재현용 — `evals/출력_v6.json` 의 `E17` 이 물고 나온 바로 그 자리(키릴 낱말 한복판). */
const 한자 = String.fromCodePoint(0x683c);            // 한자(통합)
const 확장A = String.fromCodePoint(0x3400);           // 한자(확장A)
const 히라가나 = String.fromCodePoint(0x3042);
const 가타카나 = String.fromCodePoint(0x30a2);
const 실측문장 = `тусах${한자}ийн нөлөөлөл`;

// ── 픽스처: 탐지력 ────────────────────────────────────────────────────────

test('[탐지] 한자·가나 네 갈래를 모두 잡는다', () => {
  for (const [이름, 글자] of [['한자', 한자], ['확장A', 확장A],
    ['히라가나', 히라가나], ['가타카나', 가타카나]]) {
    assert.equal(찾기(`깨끗한 문장 ${글자} 뒤`).length, 1, `${이름} 를 놓쳤다`);
  }
});

test('[탐지] 키릴 낱말 한복판에 박힌 한 자 — 실측 E17 의 모양', () => {
  const 코드 = 찾기(실측문장);
  assert.deepEqual(코드, [0x683c]);
  assert.equal(짚기(코드), 'U+683C');
});

test('[탐지] 같은 입력을 두 번 물어도 같은 답이다', () => {
  /* 전역 정규식의 `.test()`/`.exec()` 는 `lastIndex` 를 들고 다녀 **번갈아 참·거짓**을 낸다.
   * `찾기` 는 `match` 를 쓰므로 안 걸리지만, 뒷사람이 `.test()` 로 바꾸면 여기서 죽는다. */
  assert.deepEqual(찾기(실측문장), 찾기(실측문장));
  assert.equal(옛글자.test(실측문장), 옛글자.test(실측문장));
});

test('[거짓양성] 한글·키릴·라틴·숫자·문장부호는 안 잡는다', () => {
  /* ⚠ 한국어 «인용»은 결함이 아니다 — 학생이 찾을 글자를 몽골어 문장 «안에» 넣는 것이 설계다. */
  const 깨끗 = ['저는 한국어를 공부해요.', 'Би сурана',
    'TOPIK 3 level — ok?', '«제가» гэж бичсэн'];
  for (const s of 깨끗) assert.deepEqual(찾기(s), [], `거짓양성: ${s}`);
});

test('[보고] 짚기 는 글자를 담지 않는다 — 신고하는 글이 새 위반이 되면 안 된다', () => {
  const 표기 = 짚기(찾기(`${한자}${히라가나}`));
  assert.deepEqual(찾기(표기), [], '신고 문자열에 그 글자가 그대로 들어갔다');
  assert.match(표기, /^U\+[0-9A-F]{4} · U\+[0-9A-F]{4}$/);
});

test('[첫걸림] 걸린 «칸 이름»을 돌려주고, 깨끗하면 null 이다', () => {
  assert.deepEqual(첫걸림({ 고친문장: '깨끗해요.', 오늘의포인트: 실측문장 }),
    { 칸: '오늘의포인트', 짚음: 'U+683C' });
  assert.equal(첫걸림({ 고친문장: '깨끗해요.', 오늘의포인트: null }), null);
  assert.equal(첫걸림({}), null);
  /* 문자열이 아닌 칸을 «건너뛰지» 않는다 — 건너뛰면 「안 잰 칸」과 「깨끗한 칸」이 같아진다. */
  assert.equal(첫걸림({ 수: 3, 없음: null, 참: true }), null);
});

// ── 픽스처: 제품 통로(`교정값`)가 실제로 막나 ─────────────────────────────

/** 모델이 낼 법한 응답 한 덩이. 태그는 계약에서 집는다(프롬프트 통제 어휘와 갈리지 않게). */
function 응답(칸들) {
  return JSON.stringify({
    고친문장: '저는 한국어를 공부해요.',
    오류태그: [태그목록[0]],
    오늘의포인트: '깨끗한 해설.',
    ...칸들,
  });
}

test('[게이트] 깨끗한 응답은 그대로 행이 선다', () => {
  const r = 교정값(응답({}), 태그목록);
  assert.equal(r.사유, null);
  assert.equal(r.corrected_text, '저는 한국어를 공부해요.');
  assert.equal(r.explanation, '깨끗한 해설.');
});

test('[게이트] 해설에 옛 글자가 있으면 «행 전체»를 버리고 사유를 남긴다', () => {
  const r = 교정값(응답({ 오늘의포인트: 실측문장 }), 태그목록);
  assert.equal(r.사유, '옛글자:오늘의포인트:U+683C');
  assert.equal(r.corrected_text, undefined, '버린 행에 값이 실렸다 — 반쯤 적기다');
});

test('[게이트] 고친문장에 옛 글자가 있어도 버린다', () => {
  const r = 교정값(응답({ 고친문장: `저는 ${한자}국어를 공부해요.` }), 태그목록);
  assert.equal(r.사유, `옛글자:고친문장:U+683C`);
});

test('[게이트] 버려지는 칸(칭찬·다음미션)은 재지 않는다 — 안 나가는 글로 행을 죽이지 않는다', () => {
  /* 재는 칸 = 적는 칸. 이 둘은 `교정값` 이 계약 열이 없어 버리므로 학생에게 안 나간다. */
  const r = 교정값(응답({ 칭찬: `잘했어요 ${한자}`, 다음미션: `${히라가나} 써 보세요` }), 태그목록);
  assert.equal(r.사유, null, '안 나가는 칸 때문에 행이 죽었다');
});

test('[게이트] 사유는 «버려진 이유»를 한 줄로 나른다 — 부르는 쪽이 세는 값이다', () => {
  /* `교정배치` 는 사유가 있으면 `continue` 로 넘긴다. 모양이 바뀌면 그 자리가 조용히 샌다. */
  const r = 교정값(응답({ 오늘의포인트: 실측문장 }), 태그목록);
  assert.match(r.사유, /^옛글자:[^:]+:U\+[0-9A-F]{4}/);
});

// ── 실저장소: 거짓양성만 본다 ─────────────────────────────────────────────

test('🔴 배포 동봉 표에 옛글자 가 올라 있다 — 없으면 `원격배포` 가 던진다', () => {
  /* `lib/교정엔진.js` 가 `require('./옛글자.js')` 를 들었으므로 동봉 표에 없으면 배포가 멈춘다.
   * 그 멈춤을 배포 순간이 아니라 **여기로 앞당긴다** — 게이트를 세운 커밋과 같은 자리에서 본다. */
  const 표 = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'supabase', 'functions', 'correct', '동봉.json'), 'utf8'));
  assert.equal(표['옛글자.mjs'], 'lib/옛글자.js');
});

test('🔴 형제(SYNK-appsscript)의 문자 클래스와 갈라지지 않았다', (t) => {
  /* ⚠ 형제가 없는 기계에서는 **skip 이지 fail 이 아니다**(F207·F364) — 못 잰 것을 「깨끗함」으로
   *   접으면 이 대조는 가장 필요한 날 사라지고, fail 로 두면 CI 가 남의 저장소를 요구한다. */
  const 형제 = path.join(ROOT, '..', 'SYNK-appsscript', '.claude', 'hooks', 'lib', '옛글자.js');
  if (!fs.existsSync(형제)) return t.skip('형제 저장소가 없다 — 대조 «못 했다»');
  assert.equal(옛글자.source, require(형제).옛글자.source,
    '런타임 사본이 형제의 정본과 갈라졌다 — 갈라지는 방향은 언제나 「통과」다');
});

test('🔴 이 저장소 안에서 같은 클래스를 든 자리가 지금 갈라져 있지 않다', () => {
  /* 런타임 사본(`lib/옛글자.js`)과 채점기(`tools/eval-score.js`)가 같은 문자 클래스를 각자
   * 들고 있다. 합치는 것은 그 파일 주인의 몫이라 여기서는 **갈라지면 빨개지게만** 해 둔다. */
  const 규범 = 옛글자.source;
  const 클래스 = /\[[^\]]*u3040[^\]]*\]/g;
  const 본 = [];
  (function 훑기(디렉터리) {
    for (const e of fs.readdirSync(디렉터리, { withFileTypes: true })) {
      if (['node_modules', '.git', 'evals'].includes(e.name)) continue;
      const p = path.join(디렉터리, e.name);
      if (e.isDirectory()) { 훑기(p); continue; }
      if (!/\.(js|mjs|ts)$/.test(e.name)) continue;
      const src = fs.readFileSync(p, 'utf8');
      for (const m of src.match(클래스) || []) {
        본.push([path.relative(ROOT, p), m.replace(/\\\\/g, '\\')]);
      }
    }
  })(ROOT);

  assert.ok(본.length >= 2, `사본을 못 찾았다 — 훑기 범위가 좁아졌다(찾은 것 ${본.length}개)`);
  for (const [파일, 값] of 본) assert.equal(값, 규범, `${파일} 의 문자 클래스가 갈라졌다`);
});
