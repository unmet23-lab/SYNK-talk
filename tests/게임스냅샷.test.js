/* 게임스냅샷 회귀 — 미니게임 `task_snapshot` 조립기(`lib/게임스냅샷.js` · 발주_게임모듈.md §6-8).
 *
 * ■ 무엇을 지키나
 *   ① **키 집합이 정확히 §6-8 표다** — G1 = 6키(표 밖 키 0) · G2 = 오류 문항 6키 / **대조
 *      문항 5키**(`정답` 키 «부재»). 반쪽 객체 하나가 조인 키(「`정답` 유무」)를 깨뜨려
 *      과잉 교정률의 분모를 오염시킨다(§6-6 ① 집계 · §9 ①).
 *   ② **값 사본 0** — 지시문·질문·문항판·상수가 팩 산출과 문자열까지 같다. 조립기가 베껴 두면
 *      팩 개정이 스냅샷에 안 닿는데, 그 갈라짐은 저장 시점에 신호가 없다.
 *   ③ **반쪽 스냅샷 금지(규칙 1)** — 탐지력은 «재료를 비운 팩» 픽스처(바꾼소스)가 못박고,
 *      실팩에는 거짓양성 0 만 본다(버그가 아직 있을 것을 요구하는 회귀 금지 · CLAUDE.md).
 *   ④ **결정성** — 같은 시드·같은 문항 = 같은 스냅샷(배정↔제출이 같은 모양이어야 §6-7 ⑥이 선다).
 *   ⑤ **🔴 G2 `정답` 이 학생판에 안 샌다** — 정답이 학생 기기에 실리면 이 게임이 탐지 능력이
 *      아니라 「정답을 봤나」를 재게 된다(§9-③ 의 가장 빠른 판).
 *   ⑥ **🔴 등록 누락 구멍** — 등록부에 줄을 안 더한 모듈은 거름망에서 **통째로 벗겨진다**.
 *      앱은 그 게임을 원리상 못 보고 증상은 「오늘 과제를 읽지 못했어요」뿐이다(C1 사고 그대로).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { 세우기 } = require('./lib/앱모듈세우기.js');

const 뿌리 = path.resolve(__dirname, '..');
const 팩경로 = path.join(뿌리, 'contents', '교수멘탈문항.js');
const G2팩경로 = path.join(뿌리, 'contents', '보고서교정문항.js');
const 조립기경로 = path.join(뿌리, 'lib', '게임스냅샷.js');
const fetch금지 = () => { throw new Error('게임스냅샷은 fetch 를 부르지 않는다'); };

const 캐시 = new Map();
const 조립기 = 세우기(조립기경로, fetch금지, { 캐시 });
const {
  G1스냅샷, 스냅샷키들, G1스냅샷인가, 게임스냅샷인가, 학생판게임스냅샷, 등록challenge들,
  G2스냅샷, G2스냅샷키들, G2필수키들, G2스냅샷모양판, G2과제유형, G2학생공개키,
} = 조립기;
const 팩 = 세우기(팩경로, fetch금지, { 캐시 }); // 같은 캐시 = 조립기가 쓴 그 팩 인스턴스
const G2팩 = 세우기(G2팩경로, fetch금지, { 캐시 });
const { 학생판스냅샷 } = require('../lib/오늘과제.js'); // 실제 거름망 — 픽스처가 아니라 그 경로다

/* ══════════════════════ G1 ══════════════════════ */

test('§6-8 6키 정확히 — 표 밖 키 0 · 빈 값 0 · 한글 값 표기', () => {
  const 스냅샷 = G1스냅샷('g1t01.s0d0');
  assert.deepEqual(Object.keys(스냅샷).sort(), [...스냅샷키들].sort());
  assert.deepEqual([...스냅샷키들].sort(),
    ['challenge_id', 'addressee_level', '문항판', '지시문', '질문', 'prompt_seed'].sort(),
    '픽스처(교수멘탈문항.test.js 규칙 5)와 같은 표');
  for (const 키 of 스냅샷키들) {
    assert.ok(typeof 스냅샷[키] === 'string' && 스냅샷[키].trim() !== '', `${키} 비었다`);
  }
  assert.equal(스냅샷.challenge_id, 'g1-교수멘탈');
  assert.equal(스냅샷.addressee_level, '합쇼체', '규칙 2 — hapsyo 아님');
  assert.equal(스냅샷.prompt_seed, 'g1t01.s0d0');
  assert.ok(Object.isFrozen(스냅샷));
});

test('값 사본 0 — 팩 산출과 문자열까지 같다(전 시드 45벌 결정성 동봉)', () => {
  for (const 문항 of 팩.문항들) {
    for (let s = 0; s < 문항.사유.length; s++) {
      for (let d = 0; d < 문항.세부.length; d++) {
        const 시드 = 팩.시드만들기(문항.문항id, s, d);
        const 펴진 = 팩.펴기(시드);
        const 스냅샷 = G1스냅샷(시드);
        assert.equal(스냅샷.지시문, 펴진.지시문, 시드);
        assert.equal(스냅샷.질문, 펴진.질문, 시드);
        assert.equal(스냅샷.문항판, 펴진.문항판, 시드);
        assert.deepEqual(G1스냅샷(시드), 스냅샷, `같은 시드 = 같은 스냅샷: ${시드}`);
      }
    }
  }
});

test('못 펴는 시드는 null — 지어내지 않는다', () => {
  for (const 시드 of ['g1t99.s0d0', 'g1t01.s9d0', 'g1t01', '', null, undefined, 7]) {
    assert.equal(G1스냅샷(시드), null, String(시드));
  }
});

test('탐지력 — 재료가 빈 팩이면 키를 빼는 게 아니라 스냅샷 자체가 null(규칙 1)', () => {
  const 원문 = fs.readFileSync(팩경로, 'utf8');
  const 비운팩 = 원문.replace('지시문: 채우기(문항.지시문틀),', "지시문: '',");
  assert.notEqual(비운팩, 원문, '픽스처 치환이 실제로 일어났다');
  const 바꾼소스 = new Map([[팩경로, 비운팩]]);
  const 조립기2 = 세우기(조립기경로, fetch금지, { 캐시: new Map(), 바꾼소스 });
  assert.equal(조립기2.G1스냅샷('g1t01.s0d0'), null,
    '지시문이 빈 채 나가면 「그날 안 보였다」로 읽힌다 — 통째로 거부해야 한다');
});

/* ══════════════════════ G2 「보고서 교정」 ══════════════════════ */

test('① G2 오류 문항 = §6-8 6키 정확히 — 구명 `문항`·`문항버전` 은 폐기(규칙 3)', () => {
  const snap = G2스냅샷('g2t01');
  assert.deepEqual(Object.keys(snap).sort(), [...G2스냅샷키들].sort());
  assert.deepEqual([...G2스냅샷키들].sort(),
    ['challenge_id', '문항판', '지시문', '질문', '보기', '정답'].sort(),
    '§6-8 공통층 4 + 조건층 2(보기·정답). addressee_level·prompt_seed 는 G2 키가 아니다');
  assert.equal('문항' in snap, false, '구명 `문항` 은 폐기 — 오류문은 공통층 `질문` 이다');
  assert.equal('문항버전' in snap, false, '구명 `문항버전` 은 폐기 — 판은 `문항판` 이다');
  assert.equal(snap.challenge_id, 'g2-보고서교정');
  assert.equal(snap.질문, G2팩.문항들[0].오류문, '값 사본 0');
  assert.equal(snap.지시문, G2팩.지시문);
  assert.equal(snap.문항판, G2팩.문항판);
  assert.equal(G2스냅샷모양판, 'g2스냅샷.v1', '스냅샷 «모양»의 판 — G1 g1스냅샷.v1 과 다른 축');
  assert.ok(Object.isFrozen(snap) && Object.isFrozen(snap.보기) && Object.isFrozen(snap.정답));
});

test('① G2 대조 문항 = 5키 — `정답` 키가 «없다»(§6-8 규칙 1 · 반쪽 객체 금지)', () => {
  const 대조id = G2팩.문항들.filter((m) => !('교정문' in m))[0].문항id;
  const snap = G2스냅샷(대조id);
  assert.deepEqual(Object.keys(snap).sort(), [...G2필수키들].sort());
  assert.equal('정답' in snap, false,
    '🔴 `정답: null`·빈 객체·{오류태그:"오류없음"} 어느 것이든 조인 키를 깨뜨린다(§6-6 ① 집계)');
  assert.ok(Array.isArray(snap.보기) && snap.보기.length > 0,
    '대조 문항도 보기는 있다 — 없으면 「짚었다」의 분모가 사라진다(§6-2)');
});

test('① G2 전수 — 63문항이 표대로 서고, 빈 값 0 · 값 표기 한글 · 정답 3칸', () => {
  const 표키 = new Set(G2스냅샷키들);
  let 오류수 = 0;
  let 대조수 = 0;
  for (const 문항 of G2팩.문항들) {
    const snap = G2스냅샷(문항.문항id);
    assert.ok(snap, `${문항.문항id}: 스냅샷이 안 선다`);
    for (const 키 of Object.keys(snap)) assert.ok(표키.has(키), `${문항.문항id}: 표 밖 키 ${키}`);
    for (const 키 of G2필수키들) assert.ok(키 in snap, `${문항.문항id}: 필수 키 ${키} 없음`);
    for (const 키 of ['지시문', '질문', '문항판', 'challenge_id']) {
      assert.ok(typeof snap[키] === 'string' && snap[키].trim() !== '', `${문항.문항id}.${키} 비었다`);
    }
    assert.equal(snap.보기.length, 문항.오류문.trim().split(/\s+/).length, `${문항.문항id} 보기 수`);
    for (const 칸 of snap.보기) {
      assert.deepEqual(Object.keys(칸).sort(), ['label', 'option_id'],
        `${문항.문항id}: 보기 칸에 표 밖 키가 있다 — 허용 목록 «안쪽» 층이 샌다(②-20)`);
      assert.ok(칸.label.trim() !== '' && /^w\d+$/.test(칸.option_id));
    }
    if ('정답' in snap) {
      assert.deepEqual(Object.keys(snap.정답).sort(), ['교정문', '오류자리', '오류태그']);
      assert.equal(snap.정답.교정문, 문항.교정문, '값 사본 0');
      assert.equal(snap.정답.오류태그, 문항.오류태그);
      const 후보 = new Set(snap.보기.map((o) => o.option_id));
      assert.ok(후보.has(snap.정답.오류자리), `${문항.문항id}: 정답 자리가 보기 밖이다`);
      오류수 += 1;
    } else 대조수 += 1;
    assert.deepEqual(G2스냅샷(문항.문항id), snap, `${문항.문항id}: 같은 문항 = 같은 스냅샷(결정성)`);
  }
  assert.equal(오류수, 42, '분모 — 오류 문항');
  assert.equal(대조수, 21, '분모 — 대조 문항');
});

test('G2 못 펴는 문항은 null — 지어내지 않는다', () => {
  for (const id of ['g2t99', 'g1t01.s0d0', '', null, undefined, 7]) {
    assert.equal(G2스냅샷(id), null, String(id));
  }
});

test('G2 과제유형은 «둘»이다 — 무산출은 퀴즈응답이다(§6-6 ① 문안 확정 3)', () => {
  assert.deepEqual(Object.keys(G2과제유형).sort(), ['무산출', '짚음']);
  assert.equal(G2과제유형.짚음, '숙제제출', '어절을 짚어 고쳐 낸 제출(G2 §6-1)');
  assert.equal(G2과제유형.무산출, '퀴즈응답',
    '🔴 「고칠 곳 없음」을 submission.created 로 보내면 전건 400 이고 증상은 조용함뿐이다');
  const 계약 = JSON.parse(fs.readFileSync(path.join(뿌리, '계약', '수집_교정_계약.json'), 'utf8'));
  for (const v of Object.values(G2과제유형)) {
    assert.ok(new Set(계약.learning_events.값목록.task_type).has(v), `${v} 가 계약 값목록에 없다`);
  }
});

test('탐지력 — G2 도 반쪽을 안 낸다(재료를 비운 팩 · 한 어절 규칙을 깬 팩)', () => {
  const 원문 = fs.readFileSync(G2팩경로, 'utf8');

  const 비운팩 = 원문.replace("오류문: '회의 시간을 오후 세 시로 정해졌습니다.',", "오류문: '   ',");
  assert.notEqual(비운팩, 원문, '픽스처 치환이 실제로 일어났다');
  assert.equal(세우기(조립기경로, fetch금지, { 캐시: new Map(), 바꾼소스: new Map([[G2팩경로, 비운팩]]) })
    .G2스냅샷('g2t01'), null, '질문이 비면 스냅샷 자체가 없다(규칙 1)');

  /* 🔴 두 어절이 달라진 교정문 — 그 문항은 화면에서 «정답 자리가 없는 채로» 배정되고
   *   증상은 「아무 데를 짚어도 자리틀림」뿐이다. 조립 층에서 통째로 거부해야 한다. */
  const 깬팩 = 원문.replace("교정문: '회의 시간이 오후 세 시로 정해졌습니다.',",
    "교정문: '회의 시간이 오후 세 시에 정해졌습니다.',");
  assert.notEqual(깬팩, 원문, '픽스처 치환이 실제로 일어났다');
  assert.equal(세우기(조립기경로, fetch금지, { 캐시: new Map(), 바꾼소스: new Map([[G2팩경로, 깬팩]]) })
    .G2스냅샷('g2t01'), null, '한 어절 차이가 아니면 정답 자리가 없다');
});

/* ══════════════════════ 학생판 거름망 · 등록부 ══════════════════════ */

test('⑤ 🔴 G2 `정답` 이 학생판에 안 샌다 — 다섯 키만 나간다', () => {
  const snap = G2스냅샷('g2t01');
  const 학생판 = 학생판게임스냅샷(snap);
  assert.deepEqual(Object.keys(학생판).sort(), [...G2학생공개키].sort());
  assert.equal('정답' in 학생판, false,
    '🔴 정답이 기기에 실리면 이 게임이 탐지 능력이 아니라 「정답을 봤나」를 잰다(§9-③)');
  assert.equal('정답' in snap, true, '원본은 안 건드린다 — 행에는 그대로 남는다');
  assert.equal(학생판.보기.length, snap.보기.length, '보기는 나간다 — 없으면 화면이 못 선다');
  for (const 칸 of 학생판.보기) assert.deepEqual(Object.keys(칸).sort(), ['label', 'option_id']);
  // 실제 거름망(GET /v1/tasks) 경로도 같은 판을 낸다
  assert.deepEqual(학생판스냅샷(snap), 학생판, '거름망이 게임 판을 게임 거름망에 위임한다(C1)');
});

test('⑤ 보기 «안»의 표 밖 키도 벗겨진다 — 허용 키 안쪽 층은 아무도 안 본다(②-20)', () => {
  /* 🔑 픽스처로 잰다: 지금 조립기는 보기 칸을 두 키로만 만들어서, 실팩만 보면 이 층 거르기를
   *   통째로 빼도 초록이다(변이시험이 잡았다 · 2026-08-12). 그런데 이 자리는 「가정」이 아니라
   *   「예정」이다 — 옛 행·남의 판이 섞여 들어오는 날 그 속에 무엇이 있어도 그대로 샌다. */
  const 심은판 = {
    ...G2스냅샷('g2t01'),
    보기: [{ option_id: 'w1', label: '회의', 정답표시: true }, { option_id: 'w2', label: '시간을' }],
  };
  const 학생판 = 학생판게임스냅샷(심은판);
  assert.deepEqual(학생판.보기, [{ option_id: 'w1', label: '회의' }, { option_id: 'w2', label: '시간을' }],
    '보기 칸 «안»의 표 밖 키가 학생 응답으로 샜다');
  assert.equal(심은판.보기[0].정답표시, true, '원본은 안 건드린다');
});

test('⑤ 전수 — 63벌 어느 것에도 정답·교정문·오류태그가 학생판에 안 남는다', () => {
  let 검사수 = 0;
  for (const 문항 of G2팩.문항들) {
    const 학생판 = 학생판스냅샷(G2스냅샷(문항.문항id));
    const 글 = JSON.stringify(학생판);
    assert.equal('정답' in 학생판, false, 문항.문항id);
    if ('교정문' in 문항) {
      assert.ok(!글.includes(문항.교정문), `${문항.문항id}: 기준 교정문이 학생판에 있다`);
      assert.ok(!글.includes(문항.오류태그), `${문항.문항id}: 심은 태그가 학생판에 있다`);
    }
    검사수 += 1;
  }
  assert.equal(검사수, 63, '분모');
});

test('G1 학생판은 종전 그대로 — 6키 전부 나간다(열린 쓰기라 보기·정답이 애초에 없다)', () => {
  const snap = G1스냅샷('g1t01.s0d1');
  assert.deepEqual(학생판게임스냅샷(snap), { ...snap });
  assert.deepEqual(학생판스냅샷(snap), { ...snap });
});

test('두 판정을 이름으로 가른다 — 넓은 쪽/좁은 쪽을 바꿔 쓰면 사고가 갈린다', () => {
  const g1 = G1스냅샷('g1t01.s0d0');
  const g2 = G2스냅샷('g2t01');
  assert.equal(게임스냅샷인가(g1), true);
  assert.equal(게임스냅샷인가(g2), true, '거름망은 «등록된 게임 전부»를 알아야 한다');
  assert.equal(G1스냅샷인가(g1), true);
  assert.equal(G1스냅샷인가(g2), false,
    '🔴 라우팅이 넓으면 G1 화면이 G2 배정을 연다 — 문항 팩이 달라 화면이 빈 채로 뜬다');
  for (const 아닌것 of [null, undefined, 7, [], { ver: 1, 호흡: [] }]) {
    assert.equal(게임스냅샷인가(아닌것), false, String(아닌것));
    assert.equal(G1스냅샷인가(아닌것), false, String(아닌것));
  }
});

test('⑥ 🔴 등록 누락 구멍 — 등록 안 한 모듈은 학생판이 통째로 벗겨진다(픽스처)', () => {
  /* 픽스처 = 「스냅샷은 만들었는데 등록부에 줄을 안 더한」 모듈. 증상이 없다는 것이 급소다:
   * 저장도 되고 배정도 되고 서버 로그도 멀쩡한데, 앱만 그 게임을 원리상 못 본다. */
  const 미등록 = {
    challenge_id: 'g9-미등록모듈',
    지시문: '이 지시문은 학생에게 닿지 않는다',
    질문: '이 문장도 닿지 않는다',
    문항판: 'g9문항.v1',
    보기: [{ option_id: 'w1', label: '이' }],
  };
  assert.equal(게임스냅샷인가(미등록), false, '등록부에 없다');
  assert.deepEqual(학생판스냅샷(미등록), {},
    '거름망이 말하기 허용목록으로 흘려 전부 벗긴다 — 그게 C1 사고 그대로다');
  assert.deepEqual(학생판게임스냅샷(미등록), 미등록,
    '게임 거름망은 모르는 판에 손대지 않는다 — 내보낼지 말지는 부르는 쪽 판정이다');
  // 같은 모양인데 등록된 G2 는 산다 — 가르는 것은 등록부 한 줄뿐이다
  assert.ok(Object.keys(학생판스냅샷(G2스냅샷('g2t01'))).length > 0);
});

test('⑥ 등록부는 «의식적으로» 늘린다 — 새 모듈은 이 줄을 함께 고치게 된다', () => {
  /* 🔑 자동 수집으로 만들지 않는다: 새 모듈의 기본값이 「안 나감」이어야 화면이 비어 그날
   *   사람이 오고, 그 자리에서 「이 키를 학생이 봐도 되나」를 정한다(②-20 허용 목록의 설계).
   *   그래서 목록을 여기 못박아 둔다 — 등록만 하고 공개 키를 안 정하는 길을 막는다. */
  assert.deepEqual([...등록challenge들], ['g1-교수멘탈', 'g2-보고서교정']);
  assert.equal(G2학생공개키.length, 5, '정답을 빼고 다섯');
});
