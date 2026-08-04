/**
 * 수집층(SYNK-appsscript)과의 계약 회귀 (계약/수집_교정_계약.json)
 *
 * 왜 있나 — 이 앱의 교정·채점 어휘는 우리가 정한 것이 아니라 **수집층에서 물려받은 것**이다.
 *   학원 앱이 2년간 학생 문장에 붙이는 오류태그와 여기 프롬프트의 통제 어휘가 갈라지면,
 *   2년치가 쌓인 뒤에 「집계가 안 읽힌다」로 드러난다 — 그때는 되돌릴 수 없다.
 *
 * 🔴 원래 이걸 지키던 것은 `prompts/교정.md` 안의 경고 한 줄이었다
 *   ("이 어휘는 HW_ERROR_TAGS와 같아야 한다"). 사람이 읽어야 발동하는 장치는 안 돈다.
 *
 * 🔑 저장소가 둘이라 서로의 CI가 상대를 못 본다. 그래서 계약을 파일 하나로 뽑고
 *   양쪽이 각자 자기 구현을 그 파일과 대조한다 — 한쪽만 고치면 그쪽 CI가 빨개진다.
 *   형제 저장소 실물 대조는 있으면 하고 없으면 **skip으로 드러낸다**(CI엔 형제가 없다).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const 계약경로 = path.join(ROOT, '계약', '수집_교정_계약.json');
const 계약 = JSON.parse(fs.readFileSync(계약경로, 'utf8'));

test('교정 프롬프트의 통제 어휘가 계약의 오류태그와 정확히 같다', () => {
  const md = fs.readFileSync(path.join(ROOT, 'prompts', '교정.md'), 'utf8');
  const i = md.indexOf('## 오류태그 통제 어휘');
  assert.notEqual(i, -1, '프롬프트에서 통제 어휘 절을 못 찾았다 — 제목이 바뀌었다면 이 테스트도 함께 옮겨라');
  const 절 = md.slice(i, md.indexOf('\n## ', i + 5));

  // 백틱으로 감싼 항목만 뽑는다 — 설명 문장의 단어를 태그로 세지 않으려고
  const 뽑힌 = [...절.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim())
    .filter((s) => s !== 'HW_ERROR_TAGS');

  assert.deepEqual(뽑힌, 계약.오류태그,
    '프롬프트 어휘가 수집층과 갈라졌다 — 학생 문장에 붙는 태그와 교정 엔진이 쓰는 태그가 달라진다.\n' +
    '  고치는 법: 계약 파일을 고치고 **두 저장소 모두에 같은 바이트로** 넣는다');
});

test('평가 픽스처가 계약이 약속한 항목 필드를 갖는다', () => {
  const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'evals', '픽스처.json'), 'utf8'));
  assert.ok(Array.isArray(fx.항목) && fx.항목.length, '픽스처에 항목이 없다');

  // 채점기가 실제로 읽는 필드가 픽스처에 있어야 한다. 없으면 그 검사를 조용히 건너뛴다
  // (`fx.포함 || []` 같은 폴백이라 「검사 통과」와 「검사 안 함」이 같은 모양이 된다).
  // ⚠ 이 목록은 손으로 적은 것이라 **빠뜨릴 수 있다** — 실제로 c1에서 「불변」이 빠져 있었고,
  //   그게 정확히 이 주석이 경고하는 사고였다(수집층이 안 만들었고 아무도 몰랐다).
  //   그래서 아래에서 채점기 소스를 직접 읽어 `fx.X` 참조를 뽑아 대조한다.
  const 채점기가_읽는 = ['id', '종류', '입력', '기대태그', '기대교정', '포함', '불포함', '불변'];
  for (const f of 채점기가_읽는) {
    assert.ok(계약.픽스처_항목필드.includes(f),
      `채점기가 「${f}」를 읽는데 계약에 없다 — 수집층이 그 필드를 안 만들어도 아무도 모른다`);
  }
  for (const it of fx.항목) {
    for (const f of ['id', '종류', '입력']) {
      assert.ok(f in it, `픽스처 항목 ${it.id || '(id 없음)'}에 필수 필드 「${f}」가 없다`);
    }
  }
});

test('채점기 소스가 읽는 fx 필드가 전부 계약에 있다 (손으로 적은 목록이 또 빠뜨리는 것을 막는다)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'eval-score.js'), 'utf8');
  const 읽는 = [...new Set([...src.matchAll(/\bfx\.([가-힣A-Za-z_][가-힣A-Za-z0-9_]*)/g)].map((m) => m[1]))];
  assert.ok(읽는.length >= 6, `채점기에서 fx 필드를 ${읽는.length}개밖에 못 뽑았다 — 정규식이 죽었다면 이 검사는 무용지물이다`);
  const 빠진 = 읽는.filter((f) => !계약.픽스처_항목필드.includes(f));
  assert.deepEqual(빠진, [],
    `채점기가 읽는데 계약에 없는 필드: ${빠진.join(', ')} — 수집층이 그 필드를 안 만들어도 검사가 조용히 건너뛴다.\n` +
    '  고치는 법: 계약 파일에 넣고 **두 저장소 모두에 같은 바이트로** 넣는다');
});

test('「종류: 정상」이면 `불변`이 없어도 거짓양성으로 채점한다 (수집층 픽스처가 실제로 그랬다)', () => {
  const { scoreOne } = require(path.join(ROOT, 'tools', 'eval-score.js'));
  assert.equal(typeof scoreOne, 'function', 'scoreOne을 못 가져왔다 — export가 빠지면 이 검사가 무용지물이다');
  // 수집층이 내보내던 모양: 종류만 '정상'이고 불변 없음 + 포함/불포함 비어 있음.
  // 옛 채점기는 이걸 오류 항목으로 보내 **무조건 통과**시켰다(과교정이 만점).
  const fx = { id: 'X01', 종류: '정상', 입력: '저는 학생입니다.', 기대태그: ['오류없음'], 기대교정: '저는 학생입니다.', 포함: [], 불포함: [] };
  /* ⚠ 태그는 「오류없음」 그대로 두고 **문장만** 바꾼다. 태그까지 틀리게 하면 오류 항목 채점의
   *   태그 검사가 우연히 잡아내서, 거짓양성 분기가 죽어 있어도 테스트가 통과한다
   *   (08-04 실측 — 이 테스트의 첫 판이 정확히 그랬고 변이가 그것을 드러냈다). */
  const 망가뜨림 = scoreOne(fx, { 고친문장: '저는 학생이에요.', 오류태그: ['오류없음'] });
  assert.equal(망가뜨림.통과, false,
    '맞는 문장을 고쳤는데 통과로 채점됐다 — 거짓양성 검사가 통째로 죽는다(제품에서 더 나쁜 실패다)');
  assert.equal(망가뜨림.판정.불변, false, '불변 판정 자체가 안 매겨졌다 — 요약의 거짓양성 건수가 이 값으로 세어진다');
  const 안건드림 = scoreOne(fx, { 고친문장: '저는 학생입니다.', 오류태그: ['오류없음'] });
  assert.equal(안건드림.통과, true, '멀쩡히 둔 경우까지 실패로 채점한다 — 반대 방향으로 틀렸다');
});

test('픽스처에 「정상」 표본이 있다 (거짓양성을 못 재면 과교정이 만점으로 보인다)', () => {
  const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'evals', '픽스처.json'), 'utf8'));
  const 정상 = fx.항목.filter((x) => x.종류 === '정상');
  assert.ok(정상.length >= 3,
    `정상 표본이 ${정상.length}건뿐이다 — 제품에서 더 나쁜 실패는 「맞게 쓴 문장을 고치는 것」인데 그걸 잴 표본이 없다`);
});

test('계약 파일이 비지 않았다 (빈 계약은 모든 검사를 통과시킨다)', () => {
  assert.equal(계약.오류태그.length, 23, `오류태그 수가 23이 아니다(${계약.오류태그.length})`);
  assert.ok(new Set(계약.오류태그).size === 계약.오류태그.length, '오류태그에 중복이 있다');
});

test('형제 저장소 SYNK-appsscript의 계약 파일이 이것과 같다 (줄바꿈만 제외)', (t) => {
  const 형제 = path.join(ROOT, '..', 'SYNK-appsscript', '계약', '수집_교정_계약.json');
  if (!fs.existsSync(형제)) {
    return t.skip('형제 저장소 SYNK-appsscript가 이 기계에 없다 — 실물 대조는 로컬에서만');
  }
  /* 줄바꿈만 정규화한다 — SYNK-appsscript는 autocrlf=true라 클론 상태에 따라 CRLF일 수 있다.
   * 거짓 경보를 내는 가드는 곧 꺼진다. 줄바꿈 차이는 계약의 분열이 아니다. */
  const 정규화 = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  assert.equal(정규화(형제), 정규화(계약경로),
    '수집층의 계약 파일이 다르다 — 한쪽만 고쳤다. 같은 내용이어야 계약이 계약이다');
});
