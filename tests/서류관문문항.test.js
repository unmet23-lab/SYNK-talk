/* G4 문항 팩 회귀 — `contents/서류관문문항.js` (발주_게임모듈.md §G4 · §6-8 규칙 5).
 *
 * ■ 무엇을 지키나 (G1~G3 팩 회귀와 같은 규율 — 사본이 아니라 상속. G4 고유 축 넷을 더한다)
 *   ① 시드 결정성·깊은 동결(변조 저항) ② 스냅샷 픽스처를 §6-8 표와 대조(빈칸 턴 7키 ·
 *   변환 턴 5키) ③ 빈 값 금지 전수 ④ 금칙어 0 — 틀·조각·펴진 19턴 전량 ⑤ 검수확정↔mn 결속
 *   ⑥ 문항판↔내용 지문 결속 ⑦ 탐지력(위반본이 실제로 빨개지는가)
 *   ⑧ 🔴 G4 고유: `재는축` 은 계약 오류태그 24종의 실명(§3-① — 목록 사본 0 · 계약 JSON 대조) ·
 *      정답집합∩오답집합 = ∅(§9-1 ⓐ — 겹치면 3갈래가 순서 운에 갈린다) ·
 *      보기 선택형 아님(§8 — `보기` 키 0) · 빈칸지시문 전 관문 한 벌(§6-9 규율 상속).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { 세우기 } = require('./lib/앱모듈세우기.js');

const 뿌리 = path.resolve(__dirname, '..');
const fetch금지 = () => { throw new Error('문항 팩은 fetch 를 부르지 않는다'); };
const 팩 = 세우기(path.join(뿌리, 'contents', '서류관문문항.js'), fetch금지);
const 계약 = JSON.parse(fs.readFileSync(path.join(뿌리, '계약', '수집_교정_계약.json'), 'utf8'));

/* ── 검사기(순수) — 실팩과 위반 픽스처가 같은 검사기를 지난다(탐지력 ⑦의 전제) ── */

/** 객체·배열을 재귀로 돌아 「빈 문자열·null·빈 배열」 자리를 모은다(규칙 1). */
function 빈값위반(값, 길 = '') {
  if (값 === null || 값 === undefined) return [`${길}=null`];
  if (typeof 값 === 'string') return 값.trim() === '' ? [`${길}=빈문자열`] : [];
  if (Array.isArray(값)) {
    if (값.length === 0) return [`${길}=빈배열`];
    return 값.flatMap((v, i) => 빈값위반(v, `${길}[${i}]`));
  }
  if (typeof 값 === 'object') {
    return Object.entries(값).flatMap(([k, v]) => 빈값위반(v, 길 ? `${길}.${k}` : k));
  }
  return [];
}

/** 금칙어·결핍 구문(synk-brand — 바닥 검사. G1~G3 회귀와 같은 자 — 예외 신설 금지). */
const 금칙꼴 = [/패배/, /졌다/, /실패/, /불운/, /하락/, /부족/, /안\s?됨/, /늦/,
  /아직[^.]{0,20}(밖에|못)/];
function 금칙위반(문자열들) {
  const 위반 = [];
  for (const 글 of 문자열들) {
    for (const 꼴 of 금칙꼴) if (꼴.test(글)) 위반.push(`「${글}」 ← ${꼴}`);
  }
  return 위반;
}

/** 검수확정↔mn 결속(발주_게임콘텐츠팩 §3) — G4 는 `mn` 이 변환 스테이지 속에 살 수 있어
 *  (§6-8 조건층) 꼭대기만 보면 눈이 먼다. **재귀로** /^mn/ 키를 걷는다. */
function mn키걷기(값, 길 = '') {
  if (!값 || typeof 값 !== 'object') return [];
  if (Array.isArray(값)) return 값.flatMap((v, i) => mn키걷기(v, `${길}[${i}]`));
  return Object.entries(값).flatMap(([k, v]) => {
    const 자리 = 길 ? `${길}.${k}` : k;
    return (/^mn/.test(k) ? [자리] : []).concat(mn키걷기(v, 자리));
  });
}
function 검수결속위반(검수확정, 문항들) {
  const 위반 = [];
  for (const 관문 of 문항들) {
    const mn키 = mn키걷기(관문, 관문.관문id);
    if (!검수확정 && mn키.length) 위반.push(`확정 전 mn 병기: ${mn키}`);
    if (검수확정 && mn키.length === 0) 위반.push(`${관문.관문id}: mn 없이 확정`);
  }
  return 위반;
}

/** 정답집합∩오답집합 — 겹침·집합 안 중복을 모은다(§9-1 ⓐ 3갈래의 전제). */
function 집합위반(빈칸, 길) {
  const 위반 = [];
  for (const 키 of ['정답집합', '오답집합']) {
    if (new Set(빈칸[키]).size !== 빈칸[키].length) 위반.push(`${길}.${키} 중복`);
  }
  const 정답 = new Set(빈칸.정답집합);
  for (const 값 of 빈칸.오답집합) {
    if (정답.has(값)) 위반.push(`${길} 겹침 「${값}」 — 맞음/축오답이 순서 운에 갈린다`);
  }
  return 위반;
}

/** 문항 내용 지문 — FNV-1a. 문구가 바뀌면 값이 바뀐다(판 결속 ⑥의 재료). */
function 지문(글) {
  let h = 0x811c9dc5;
  for (let i = 0; i < 글.length; i++) {
    h ^= 글.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** 문자열 전량 — 객체에서 재귀로 뽑는다(목록 사본 없음). */
function 문자열전량(값) {
  const 모음 = [];
  const 걷기 = (v) => {
    if (typeof v === 'string') 모음.push(v);
    else if (Array.isArray(v)) v.forEach(걷기);
    else if (v && typeof v === 'object') Object.values(v).forEach(걷기);
  };
  걷기(값);
  return 모음;
}

/** 재귀 키 전량 — 「보기 선택형 아님」(§8) 검사의 재료. */
function 키전량(값) {
  const 모음 = [];
  const 걷기 = (v) => {
    if (Array.isArray(v)) v.forEach(걷기);
    else if (v && typeof v === 'object') {
      for (const [k, 속] of Object.entries(v)) { 모음.push(k); 걷기(속); }
    }
  };
  걷기(값);
  return 모음;
}

/* ── 실팩 검사 ── */

test('모듈 상수 — §6-8 표가 못박은 값 그대로 · addressee_level 없음(조건층 — G1·G3 몫)', () => {
  assert.equal(팩.모듈상수.challenge_id, 'g4-서류관문');
  assert.equal('addressee_level' in 팩.모듈상수, false,
    'G4 에 이 키를 만들면 §6-8 조건층과 갈린다 — 값이 없으면 키를 만들지 않는다(규칙 1)');
});

test('관문 4벌 — 키 화이트리스트·id 규칙·빈칸 3~5·변환 1(높임전환만)', () => {
  assert.equal(팩.문항들.length, 4);
  const 허용키 = ['관문id', '이름', '지문', '빈칸', '변환'];
  const ids = new Set();
  for (const 관문 of 팩.문항들) {
    assert.deepEqual(Object.keys(관문).sort(), [...허용키].sort(), `${관문.관문id} 키 집합`);
    assert.match(관문.관문id, /^g4t\d{2}$/);
    assert.ok(!ids.has(관문.관문id), `관문id 중복: ${관문.관문id}`);
    ids.add(관문.관문id);
    assert.ok(관문.빈칸.length >= 3 && 관문.빈칸.length <= 5,
      `빈칸 3~5(발주 G4 §4): ${관문.관문id} = ${관문.빈칸.length}`);
    assert.deepEqual(Object.keys(관문.변환).sort(), ['변환id', '제시문', '지시문', '형식'].sort());
    assert.equal(관문.변환.변환id, 't1', '변환은 관문당 하나다(§4)');
    assert.equal(관문.변환.형식, '높임전환',
      'v1 은 전부 높임전환 — 번역(mn)은 몽골어 검수 확정 커밋 몫(팩 머리말·DB CHECK)');
  }
});

test('빈칸 원소 — 필수 6키+힌트 쌍 규율·빈칸id 자리 결속·{빈칸} 자리 정확히 1개', () => {
  const 필수 = ['빈칸id', '문장틀', '재는축', '정답집합', '오답집합', '해설'];
  const 허용 = new Set([...필수, '힌트유형', '힌트']);
  for (const 관문 of 팩.문항들) {
    관문.빈칸.forEach((빈칸, i) => {
      const 길 = `${관문.관문id}.${빈칸.빈칸id}`;
      for (const 키 of 필수) assert.ok(키 in 빈칸, `${길}: 필수 키 ${키} 없음`);
      for (const 키 of Object.keys(빈칸)) assert.ok(허용.has(키), `${길}: 허용 밖 키 ${키}`);
      /* 🔴 빈칸id = 자리다 — `관문편성`·`펴기` 가 «자리»(b{i+1})로 펴므로 id 와 자리가
       *   갈리면 행의 `task_ref`·빈칸id 가 다른 빈칸을 가리킨다(조용한 거짓 라벨). */
      assert.equal(빈칸.빈칸id, `b${i + 1}`, `${길}: 빈칸id ↔ 자리 결속`);
      assert.equal(빈칸.문장틀.split('{빈칸}').length, 2, `${길}: {빈칸} 자리 정확히 1개`);
      const 힌트짝 = ('힌트유형' in 빈칸) === ('힌트' in 빈칸);
      assert.ok(힌트짝, `${길}: 힌트유형·힌트는 한 쌍이다(규칙 1 — 없는 값의 키를 안 만든다)`);
      if ('힌트유형' in 빈칸) {
        assert.equal(빈칸.힌트유형, '기본형',
          `${길}: v1 힌트는 「기본형」 괄호까지다(§8) — 새 유형은 여기 의식적으로 등재한다`);
      }
    });
  }
});

test('🔴 재는축 ↔ 계약 오류태그 24종 대조 — 목록 사본 0 · 「오류없음」은 축이 아니다', () => {
  const 태그들 = new Set(계약.오류태그);
  assert.equal(계약.오류태그.length, 24, '계약이 24종이 아니면 이 대조의 전제부터 갈렸다');
  let 수 = 0;
  for (const 관문 of 팩.문항들) {
    for (const 빈칸 of 관문.빈칸) {
      const 길 = `${관문.관문id}.${빈칸.빈칸id}`;
      assert.ok(태그들.has(빈칸.재는축),
        `${길}: 재는축 「${빈칸.재는축}」 이 계약 밖이다 — 여기 적힌 채 행이 나가면 집계 축이 죽는다`);
      assert.notEqual(빈칸.재는축, '오류없음', `${길}: 「오류없음」은 채점 산출이지 재는 축이 아니다`);
      수 += 1;
    }
  }
  assert.equal(수, 15, '분모 — 빈칸 전수');
});

test('🔴 정답집합 ∩ 오답집합 = ∅ — 겹치면 3갈래(§9-1 ⓐ)가 순서 운에 갈린다', () => {
  for (const 관문 of 팩.문항들) {
    for (const 빈칸 of 관문.빈칸) {
      assert.deepEqual(집합위반(빈칸, `${관문.관문id}.${빈칸.빈칸id}`), []);
    }
  }
});

test('빈 값 금지 — 관문 전체 재귀 전수(§6-8 규칙 1)', () => {
  for (const 관문 of 팩.문항들) {
    assert.deepEqual(빈값위반(관문, 관문.관문id), []);
  }
});

test('보기 선택형 아님 — `보기` 키 0(§8 · §6-8 「G4 는 이 키를 만들지 않는다」)', () => {
  assert.equal(키전량(팩.문항들).filter((k) => k === '보기').length, 0);
  for (const 시드 of ['g4t01.b1', 'g4t01.t1']) {
    assert.equal('보기' in 팩.펴기(시드), false, `${시드}: 펴진 턴에도 보기가 없다`);
  }
});

test('깊은 동결 — 변조가 결정성을 못 깬다(G1 반박 C1 재현 방지)', () => {
  const 관문 = 팩.문항들[0];
  assert.ok(Object.isFrozen(팩.문항들) && Object.isFrozen(관문) && Object.isFrozen(관문.빈칸)
    && Object.isFrozen(관문.빈칸[0]) && Object.isFrozen(관문.빈칸[0].정답집합),
    '중첩까지 얼어 있다');
  // ⚠ 팩은 vm 렐름에서 선다(앱모듈세우기) — TypeError 클래스 동일성이 렐름을 못 건너므로 이름으로 잡는다
  assert.throws(() => { 관문.빈칸[0].정답집합.push('오염'); }, { name: 'TypeError' });
  assert.throws(() => { 관문.지문 = '오염'; }, { name: 'TypeError' });
  const 한번 = 팩.펴기('g4t01.b1');
  assert.ok(Object.isFrozen(한번), '반환값도 얼어 나간다');
  assert.throws(() => { 한번.질문 = '오염'; }, { name: 'TypeError' });
  assert.deepEqual(팩.펴기('g4t01.b1'), 한번, '변조 시도 뒤에도 같은 시드 = 같은 산출');
});

test('시드 왕복 — 편성 순서·결정성·역복원·빈칸 15·변환 4·턴 19', () => {
  let 빈칸수 = 0;
  let 변환수 = 0;
  for (const 관문 of 팩.문항들) {
    const 편성 = 팩.관문편성(관문.관문id);
    assert.equal(편성.length, 관문.빈칸.length + 1, `${관문.관문id}: 빈칸 전부 + 변환 마지막`);
    assert.equal(편성[편성.length - 1], `${관문.관문id}.t1`, '변환이 마지막(발주 G4 §4)');
    편성.forEach((시드, i) => {
      const 한번 = 팩.펴기(시드);
      assert.ok(한번, `못 편다: ${시드}`);
      assert.deepEqual(팩.펴기(시드), 한번, `같은 시드 = 같은 산출: ${시드}`);
      assert.equal(한번.관문id, 관문.관문id, '시드에서 관문이 역복원된다');
      assert.equal(한번.문항판, 팩.문항판);
      assert.equal(한번.질문.trim() === '', false);
      if (i < 관문.빈칸.length) {
        assert.equal(한번.종류, '빈칸');
        assert.equal(한번.질문, 관문.지문, '빈칸 턴의 질문 = 안내문 원문(§6-8 공통층)');
        assert.deepEqual(한번.빈칸, 관문.빈칸[i], `${시드}: 그 자리의 원소 하나`);
        빈칸수 += 1;
      } else {
        assert.equal(한번.종류, '변환');
        assert.equal(한번.질문, 관문.변환.제시문, '변환 턴의 질문 = 제시문');
        assert.equal('빈칸' in 한번, false, '변환 턴에 채점 근거가 없다(규칙 1)');
        변환수 += 1;
      }
    });
  }
  assert.equal(빈칸수, 15, '관문 4벌 빈칸 합');
  assert.equal(변환수, 4);
});

test('빈칸지시문 전 관문 한 벌 — 어느 축을 재는지 지시문이 말하지 않는다(§6-9 규율)', () => {
  assert.equal(팩.빈칸지시문, '안내문을 읽고, 문장의 빈칸에 들어갈 말을 직접 써 보세요.',
    '문구를 바꾸려면 여기와 함께 — 회차·문항별로 갈면 문항 유형이 지시문에서 샌다');
  for (const 관문 of 팩.문항들) {
    for (let i = 1; i <= 관문.빈칸.length; i++) {
      assert.equal(팩.펴기(`${관문.관문id}.b${i}`).지시문, 팩.빈칸지시문);
    }
  }
});

test('문항판 ↔ 내용 지문 결속 — 문구만 바꾸면 여기서 빨개진다', () => {
  /* 🔑 빈칸지시문도 재료에 넣는다 — G1~G3 과 달리 지시문이 문항들 «밖» 상수라, 문항들만
   *   지문에 넣으면 지시문 개정이 판 인상 없이 지나간다. */
  const 내용 = JSON.stringify(팩.문항들) + 팩.빈칸지시문 + 팩.문항판;
  assert.equal(`${팩.문항판}:${지문(내용)}`, 'g4문항.v1:db0927cf');
});

test('금칙어 0 — 틀·조각 + 펴진 19턴 전량(역할극 예외 없음)', () => {
  const 전부 = 팩.문항들.flatMap(문자열전량);
  for (const 관문 of 팩.문항들) {
    for (const 시드 of 팩.관문편성(관문.관문id)) {
      const 펴진 = 팩.펴기(시드);
      전부.push(펴진.지시문, 펴진.질문);
    }
  }
  assert.deepEqual(금칙위반(전부), []);
});

test('검수확정 ↔ mn 결속 — 확정 전 mn 병기 불가(재귀 — 변환 속까지)', () => {
  assert.equal(팩.검수확정, false, '몽골어 원어민 검수 전이다(발주_게임콘텐츠팩 §3)');
  assert.deepEqual(검수결속위반(팩.검수확정, 팩.문항들), []);
});

test('스냅샷 픽스처 — §6-8 표와 정확히 대조(규칙 5): 빈칸 턴 7키 · 변환 턴 5키', () => {
  // 조립기(lib/게임스냅샷.G4스냅샷)가 할 조립을 픽스처로 재현한다 — 공통층 4 + prompt_seed + 모듈층 2
  const b = 팩.펴기('g4t01.b1');
  const 빈칸턴 = {
    지시문: b.지시문, 질문: b.질문, 문항판: b.문항판,
    challenge_id: 팩.모듈상수.challenge_id, prompt_seed: 'g4t01.b1',
    빈칸: b.빈칸, 채점기판본: 'g4채점.v1',
  };
  assert.deepEqual(Object.keys(빈칸턴).sort(),
    ['challenge_id', 'prompt_seed', '문항판', '빈칸', '지시문', '질문', '채점기판본'].sort(),
    '표 밖 키 0 — 이름·힌트는 빈칸 원소 안에 산다');
  assert.deepEqual(빈값위반(빈칸턴, '빈칸턴'), []);
  assert.equal(빈칸턴.challenge_id, 'g4-서류관문');

  const t = 팩.펴기('g4t01.t1');
  const 변환턴 = {
    지시문: t.지시문, 질문: t.질문, 문항판: t.문항판,
    challenge_id: 팩.모듈상수.challenge_id, prompt_seed: 'g4t01.t1',
  };
  assert.deepEqual(Object.keys(변환턴).sort(),
    ['challenge_id', 'prompt_seed', '문항판', '지시문', '질문'].sort(),
    '`빈칸`·`채점기판본` 키 «부재» — 열린 산출이라 닫힌 채점 근거가 없다(규칙 1)');
  assert.deepEqual(빈값위반(변환턴, '변환턴'), []);
});

test('모양 위반은 null — 지어내지 않는다', () => {
  for (const 시드 of ['g4t99.b1', 'g4t01.b0', 'g4t01.b9', 'g4t01.t2', 'g4t01.t0', 'g4t01',
    'g4t01.x1', '', null, undefined, 7, 'g3t01.s0d0', 'g4t01.b1 ', 'g4t01.b-1']) {
    assert.equal(팩.펴기(시드), null, `통과하면 안 되는 시드: ${시드}`);
  }
  assert.equal(팩.관문편성('g4t99'), null);
  assert.equal(팩.관문편성(''), null);
  assert.equal(팩.관문편성(null), null);
});

/* ── 탐지력 — 위반본이 실제로 빨개지는가(「지킨다」는 얼굴만 남는 검사 방지) ── */

test('탐지력 — 검사기들이 위반 픽스처에서 실제로 운다', () => {
  assert.ok(빈값위반({ 빈칸id: 'b1', 해설: '' }, 'x').length > 0);
  assert.ok(빈값위반({ 정답집합: [] }, 'x').length > 0, '빈 배열');
  assert.ok(빈값위반({ 이름: null }, 'x').length > 0, 'null');
  // 금칙어: G4 의 지뢰는 /부족/ 이다 — 「서류 부족」 상황을 문구로 되살리면 여기서 운다
  assert.ok(금칙위반(['서류가 부족해서 다시 오셔야 해요']).length > 0);
  assert.ok(금칙위반(['신청이 안 됨']).length > 0);
  // 집합 겹침·중복: 순서 운 판정의 픽스처
  assert.ok(집합위반({ 정답집합: ['에서'], 오답집합: ['에', '에서'] }, 'x').length > 0, '겹침');
  assert.ok(집합위반({ 정답집합: ['에', '에'], 오답집합: ['로'] }, 'x').length > 0, '중복');
  // 검수 결속: 변환 «속»에 숨긴 mn 도 잡는다(꼭대기만 보면 눈이 먼다)
  assert.ok(검수결속위반(false, [{ 관문id: 'g4t98', 변환: { mn_제시문: '…' } }]).length > 0);
  assert.ok(검수결속위반(true, [{ 관문id: 'g4t97', 변환: { 형식: '높임전환' } }]).length > 0,
    'mn 없이 확정');
  // 지문: 문구 한 글자가 값을 바꾼다
  assert.notEqual(지문('가'), 지문('각'));
});
