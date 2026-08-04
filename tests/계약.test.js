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

test('대조 근거가 하나도 없는 오류 항목은 통과가 아니라 「판정불가」다 (없으면 「바나나」도 만점이다)', () => {
  const { scoreOne } = require(path.join(ROOT, 'tools', 'eval-score.js'));
  /* 수집층이 실제로 만들 수 있는 모양 — 전면 재작성이면 포함·불포함을 일부러 비우고
   * (추측을 확신처럼 적지 않는다), 오류태그 열까지 비어 있으면 셋이 다 빈다.
   * 검사들이 전부 「기대한 것이 없으면 통과」라 무엇을 내놓든 통과가 됐다(08-04 실측). */
  const fx = { id: 'U01', 종류: '오류', 입력: '어제 친구 만나서 밥 먹고 영화 봤다', 기대태그: [], 기대교정: '어제는 친구를 만나 저녁을 먹었습니다', 포함: [], 불포함: [] };
  const r = scoreOne(fx, { 고친문장: '바나나', 오류태그: [] });
  assert.equal(r.판정불가, true, '대조 근거가 없는데 판정불가로 표시되지 않았다');
  assert.notEqual(r.통과, true,
    '엉뚱한 출력이 통과로 세어졌다 — 채점 못 하는 항목이 만점으로 들어가 점수를 부풀린다');

  // 근거가 하나라도 있으면 정상 채점 경로로 가야 한다(반대 방향으로 틀리지 않았는지)
  const 태그만 = scoreOne({ ...fx, 기대태그: ['어순'] }, { 고친문장: '바나나', 오류태그: [] });
  assert.ok(!태그만.판정불가 && 태그만.통과 === false, '근거가 있는데도 판정불가로 빠졌다 — 채점이 통째로 비어버린다');
});

test('판정불가는 분모에서 빠지고 따로 보고된다 (감추면 「표본 부족」이 「점수 좋음」으로 읽힌다)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'eval-score.js'), 'utf8');
  const i = src.indexOf('function main(');
  const main = src.slice(i);
  assert.ok(/판정불가/.test(main), 'main이 판정불가를 아예 모른다 — 채점 대상에 섞여 분모를 늘린다');
  assert.ok(/채점대상/.test(main) && /전체통과: 채점대상/.test(main),
    '전체통과를 전체 행에서 센다 — 판정불가가 통과로도 실패로도 안 세어지면서 분모만 채운다');
  assert.equal(/요약\.전체통과 === rows\.length/.test(main), false,
    '종료 코드가 rows.length와 비교한다 — 판정불가가 하나라도 있으면 영원히 1(실패)이 된다');
});

test('실학생 픽스처를 따로 채점할 수 있다 (합성 픽스처를 덮으면 유형 커버리지를 영영 못 묻는다)', () => {
  const { main } = require(path.join(ROOT, 'tools', 'eval-score.js'));
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'eval-score.js'), 'utf8');
  assert.ok(/--fixture/.test(src), '픽스처를 고를 수 없다 — 수집층이 올린 실학생 픽스처를 채점할 방법이 없다');
  // 기본값은 합성이어야 한다(실학생 파일이 아직 없어도 기존 채점이 그대로 돌아야 한다)
  assert.equal(main(['evals/출력_v1.json']), 0, '인자 없이 부르면 합성 픽스처로 채점돼야 한다');
  // 없는 픽스처를 조용히 통과시키면 「검사 안 함」이 「점수 좋음」이 된다
  assert.equal(main(['evals/출력_v1.json', '--fixture', 'evals/없는파일.json']), 2,
    '없는 픽스처인데 실패로 끝나지 않는다 — 채점을 안 한 것이 성공으로 보인다');
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
