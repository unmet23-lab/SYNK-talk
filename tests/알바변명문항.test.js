/* G3 문항 팩 회귀 — `contents/알바변명문항.js` (발주_게임모듈.md §G3 · §6-8 규칙 5).
 *
 * ■ 무엇을 지키나 (G1 팩 회귀와 같은 규율 — 사본이 아니라 상속. G3 고유 축 셋을 더한다)
 *   ① 시드 결정성·깊은 동결(변조 저항) ② 스냅샷 픽스처를 §6-8 표와 대조 ③ 빈 값 금지 전수
 *   ④ 금칙어 0 — 틀·조각·펴진 45벌 전량(사장님 대사 포함 — 역할극 예외 없음 · F103 계열)
 *   ⑤ 검수확정↔mn 결속 ⑥ 문항판↔내용 지문 결속 ⑦ 탐지력(위반본이 실제로 빨개지는가)
 *   ⑧ 🔴 G3 고유: 지시문에 문형 표기 0(§3-① 「문법은 채점 축이지 지시가 아니다」 —
 *      적는 순간 `task_format='자유발화'` 가 거짓이 된다) · 20~30초 표기(발주 §0 확정) ·
 *      질문 = 상황문+사장님 대사의 결정적 합(§6-8 「G3: 사장님 대사+상황문」).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { 세우기 } = require('./lib/앱모듈세우기.js');

const 뿌리 = path.resolve(__dirname, '..');
const fetch금지 = () => { throw new Error('문항 팩은 fetch 를 부르지 않는다'); };
const 팩 = 세우기(path.join(뿌리, 'contents', '알바변명문항.js'), fetch금지);

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

/** 금칙어·결핍 구문(synk-brand — 바닥 검사. G1 회귀와 같은 자 — 예외 신설 금지).
 *  ⚠ /늦/ 이 있어서 「지각」 낱말로 상황을 세웠다 — 금칙꼴을 좁혀 통과시키지 않는다. */
const 금칙꼴 = [/패배/, /졌다/, /실패/, /불운/, /하락/, /부족/, /안\s?됨/, /늦/,
  /아직[^.]{0,20}(밖에|못)/];
function 금칙위반(문자열들) {
  const 위반 = [];
  for (const 글 of 문자열들) {
    for (const 꼴 of 금칙꼴) if (꼴.test(글)) 위반.push(`「${글}」 ← ${꼴}`);
  }
  return 위반;
}

/** 검수확정↔mn 결속(발주_게임콘텐츠팩 §3): 확정 전 mn 금지 · mn 없이 확정 금지. */
function 검수결속위반(검수확정, 문항들) {
  const 위반 = [];
  for (const 문항 of 문항들) {
    const mn키 = Object.keys(문항).filter((k) => /^mn/.test(k));
    if (!검수확정 && mn키.length) 위반.push(`${문항.문항id}: 확정 전 mn 병기(${mn키})`);
    if (검수확정 && mn키.length === 0) 위반.push(`${문항.문항id}: mn 없이 확정`);
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

/** 학생 노출층 + 내부층 문자열 전량 — 문항 객체에서 재귀로 뽑는다(목록 사본 없음). */
function 문자열전량(문항) {
  const 모음 = [];
  const 걷기 = (v) => {
    if (typeof v === 'string') 모음.push(v);
    else if (Array.isArray(v)) v.forEach(걷기);
    else if (v && typeof v === 'object') Object.values(v).forEach(걷기);
  };
  걷기(문항);
  return 모음;
}

/* ── 실팩 검사 ── */

test('모듈 상수 — §6-8 표가 못박은 값 그대로(한글 표기 · g3-alba-excuse 폐기)', () => {
  assert.equal(팩.모듈상수.challenge_id, 'g3-알바변명');
  assert.equal(팩.모듈상수.addressee_level, '합쇼체');
});

test('문항 5벌 — 키 화이트리스트·id 규칙·변주 자리·사장님 대사', () => {
  assert.equal(팩.문항들.length, 5);
  const 허용키 = ['문항id', '이름', '상황틀', '지시문틀', '사장님대사', '사유', '세부'];
  const ids = new Set();
  for (const 문항 of 팩.문항들) {
    // 키 집합을 정확히 못박는다 — 새 필드(mn 등)는 여기서 의식적으로 등재해야 지나간다
    assert.deepEqual(Object.keys(문항).sort(), [...허용키].sort(), `${문항.문항id} 키 집합`);
    assert.match(문항.문항id, /^g3t\d{2}$/);
    assert.ok(!ids.has(문항.문항id), `문항id 중복: ${문항.문항id}`);
    ids.add(문항.문항id);
    assert.equal(문항.사유.length, 3);
    assert.equal(문항.세부.length, 3);
    assert.ok(문항.상황틀.includes('{사유}'), `{사유} 자리: ${문항.문항id}`);
    assert.ok(문항.상황틀.includes('{세부}'), `{세부} 자리: ${문항.문항id}`);
    // 사장님 대사는 변주 축이 없다 — 사장님은 아직 사정을 모르는 첫마디다
    assert.ok(!문항.사장님대사.includes('{'), `사장님 대사에 변주 자리: ${문항.문항id}`);
  }
});

test('🔴 지시문에 문형 표기 0 — 문법은 채점 축이지 지시가 아니다(§3-①)', () => {
  for (const 문항 of 팩.문항들) {
    assert.ok(!/[-‐–]\s?[가-힣(]/.test(문항.지시문틀),
      `지시문에 문형 표기: ${문항.문항id} 「${문항.지시문틀}」 — 자유발화가 거짓이 된다`);
    assert.ok(!문항.지시문틀.includes('핵심 어휘'),
      `G3 는 어휘 괄호가 없다(쓰기 모듈의 장치): ${문항.문항id}`);
    assert.ok(문항.지시문틀.includes('(20~30초)'),
      `발화 길이 표기(발주 §0 확정): ${문항.문항id}`);
  }
});

test('빈 값 금지 — 문항 전체 재귀 전수(§6-8 규칙 1)', () => {
  for (const 문항 of 팩.문항들) {
    assert.deepEqual(빈값위반(문항, 문항.문항id), []);
  }
});

test('사유 축은 이유절만 — 축이 섞이면 시드 역해석이 거짓(G1 반박 C5 승계)', () => {
  for (const 문항 of 팩.문항들) {
    for (const 절 of 문항.사유) {
      assert.match(절, /(서|느라|다가)$/, `이유절 꼴 아님: ${문항.문항id} 「${절}」`);
    }
  }
});

test('깊은 동결 — 변조가 결정성을 못 깬다(G1 반박 C1 재현 방지)', () => {
  const 문항 = 팩.문항들[0];
  assert.ok(Object.isFrozen(팩.문항들) && Object.isFrozen(문항) && Object.isFrozen(문항.사유),
    '중첩까지 얼어 있다');
  // ⚠ 팩은 vm 렐름에서 선다(앱모듈세우기) — TypeError 클래스 동일성이 렐름을 못 건너므로 이름으로 잡는다
  assert.throws(() => { 문항.사유.push('오염'); }, { name: 'TypeError' });
  assert.throws(() => { 문항.상황틀 = '오염'; }, { name: 'TypeError' });
  const 한번 = 팩.펴기('g3t01.s0d0');
  assert.ok(Object.isFrozen(한번), '반환값도 얼어 나간다');
  assert.throws(() => { 한번.질문 = '오염'; }, { name: 'TypeError' });
  assert.deepEqual(팩.펴기('g3t01.s0d0'), 한번, '변조 시도 뒤에도 같은 시드 = 같은 산출');
});

test('시드 왕복 — 전 조합 결정적·역복원·빈 값 0·변주 실채움·질문 합성', () => {
  let 조합수 = 0;
  for (const 문항 of 팩.문항들) {
    for (let s = 0; s < 문항.사유.length; s++) {
      for (let d = 0; d < 문항.세부.length; d++) {
        const 시드 = 팩.시드만들기(문항.문항id, s, d);
        assert.ok(시드, `시드 실패: ${문항.문항id} s${s}d${d}`);
        const 한번 = 팩.펴기(시드);
        assert.deepEqual(팩.펴기(시드), 한번, '같은 시드 = 같은 산출(결정성)');
        assert.equal(한번.문항id, 문항.문항id, '시드에서 문항이 역복원된다');
        assert.equal(한번.문항판, 팩.문항판);
        for (const 키 of ['지시문', '질문', '상황문', '사장님대사']) {
          assert.ok(한번[키].trim() !== '', `${키} 비었다`);
          assert.ok(!한번[키].includes('{'), `${키} 변주 자리 미채움: ${한번[키]}`);
        }
        // 🔴 질문 = 상황문 + 사장님 대사의 결정적 합(§6-8) — 화면 연출용 두 조각이 합에서 나온다
        assert.ok(한번.질문.includes(한번.상황문), '질문이 상황문을 담는다');
        assert.ok(한번.질문.includes(한번.사장님대사), '질문이 사장님 대사를 담는다');
        조합수++;
      }
    }
  }
  assert.equal(조합수, 45, '5문항 × 사유 3 × 세부 3');
});

test('변주가 산출을 실제로 가른다', () => {
  const a = 팩.펴기('g3t01.s0d0');
  assert.notEqual(팩.펴기('g3t01.s1d0').질문, a.질문, '사유 변주가 상황문을 가른다');
  assert.notEqual(팩.펴기('g3t01.s0d1').질문, a.질문, '세부 변주가 상황문을 가른다');
});

test('스냅샷 픽스처 1벌 — §6-8 키 집합과 정확히 대조(규칙 5)', () => {
  const 시드 = 'g3t01.s0d0';
  const 펴진 = 팩.펴기(시드);
  // 조립기(lib/게임스냅샷.G3스냅샷)가 할 조립을 픽스처로 재현한다 — 공통층 4 + 조건층 G3 몫 2
  const 스냅샷 = {
    지시문: 펴진.지시문,
    질문: 펴진.질문,
    문항판: 펴진.문항판,
    challenge_id: 팩.모듈상수.challenge_id,
    addressee_level: 팩.모듈상수.addressee_level,
    prompt_seed: 시드,
  };
  assert.deepEqual(Object.keys(스냅샷).sort(),
    ['challenge_id', 'addressee_level', '문항판', '지시문', '질문', 'prompt_seed'].sort(),
    '표 밖 키 0 — 이름·상황문·사장님대사는 스냅샷 밖(둘은 질문 안에 합으로 산다)');
  assert.deepEqual(빈값위반(스냅샷, '스냅샷'), []);
  assert.equal(스냅샷.challenge_id, 'g3-알바변명');
  assert.equal(스냅샷.addressee_level, '합쇼체');
});

test('문항판 ↔ 내용 지문 결속 — 문구만 바꾸면 여기서 빨개진다', () => {
  const 내용 = JSON.stringify(팩.문항들) + 팩.문항판;
  // 문구·판을 함께 바꾸는 커밋에서만 이 상수를 갱신한다(발주_게임콘텐츠팩 §2 문항판 규칙).
  assert.equal(`${팩.문항판}:${지문(내용)}`, 'g3문항.v1:d88c24e0');
});

test('금칙어 0 — 틀·조각 + 펴진 45벌 전량(사장님 대사 포함 · 역할극 예외 없음)', () => {
  const 전부 = 팩.문항들.flatMap(문자열전량);
  for (const 문항 of 팩.문항들) {
    for (let s = 0; s < 3; s++) {
      for (let d = 0; d < 3; d++) {
        const 펴진 = 팩.펴기(팩.시드만들기(문항.문항id, s, d));
        전부.push(펴진.지시문, 펴진.질문);
      }
    }
  }
  assert.deepEqual(금칙위반(전부), []);
});

test('검수확정 ↔ mn 결속 — 확정 전 mn 병기 불가·mn 없이 확정 불가', () => {
  assert.equal(팩.검수확정, false, '몽골어 원어민 검수 전이다(발주_게임콘텐츠팩 §3)');
  assert.deepEqual(검수결속위반(팩.검수확정, 팩.문항들), []);
});

test('모양 위반은 null — 지어내지 않는다', () => {
  for (const 시드 of ['g3t99.s0d0', 'g3t01.s9d0', 'g3t01.s0d9', 'g3t01', '', null, undefined,
    'g1t01.s0d0', 'g3t01.s0d0 ', 'g3t01.s-1d0']) {
    assert.equal(팩.펴기(시드), null, `통과하면 안 되는 시드: ${시드}`);
  }
  assert.equal(팩.시드만들기('g3t99', 0, 0), null);
  assert.equal(팩.시드만들기('g3t01', 3, 0), null, '범위 밖 변주');
  assert.equal(팩.시드만들기('g3t01', 0.5, 0), null, '정수 아님');
  assert.equal(팩.시드만들기('g3t01', -1, 0), null, '음수');
});

/* ── 탐지력 — 위반본이 실제로 빨개지는가(「지킨다」는 얼굴만 남는 검사 방지) ── */

test('탐지력 — 검사기들이 위반 픽스처에서 실제로 운다', () => {
  assert.ok(빈값위반({ 문항id: 'g3t99', mn: '' }, 'g3t99').length > 0);
  assert.ok(빈값위반({ 사유: [] }, 'x').length > 0, '빈 배열');
  assert.ok(빈값위반({ 이름: null }, 'x').length > 0, 'null');
  // 금칙어: G3 의 지뢰는 /늦/ 이다 — 「지각」으로 세운 상황을 「늦-」으로 되돌리면 여기서 운다
  assert.ok(금칙위반(['아르바이트에 30분 늦은 상황이에요']).length > 0);
  assert.ok(금칙위반(['이번에도 실패했어요']).length > 0);
  assert.ok(금칙위반(['아직 반밖에 못 했어요']).length > 0);
  // 문형 표기 탐지: 지시문 검사기와 같은 꼴
  assert.ok(/[-‐–]\s?[가-힣(]/.test('「-아/어서」를 쓰세요'), '문형 표기 검사기가 산다');
  // 검수 결속: 두 방향 다
  assert.ok(검수결속위반(false, [{ 문항id: 'g3t98', mn_상황: '…' }]).length > 0, '확정 전 mn');
  assert.ok(검수결속위반(true, [{ 문항id: 'g3t97' }]).length > 0, 'mn 없이 확정');
  // 지문: 문구 한 글자가 값을 바꾼다
  assert.notEqual(지문('가'), 지문('각'));
});
