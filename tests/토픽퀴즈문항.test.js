/* TOPIK 퀴즈 문항 팩 회귀 — `contents/토픽퀴즈문항.js` (라디오24 P0 ③ · 설계 §0-6·§2-J).
 *
 * ■ 무엇을 지키나 (G1 팩 회귀 선례 — tests/교수멘탈문항.test.js)
 *   ① 문항 모양 전수 — 키 집합·id 꼴·보기 4벌({option_id,label} · o1~o4 자리 순서)·정답 실재.
 *      **보기 label 중복 금지**가 급소다: 같은 문구 둘이면 「정답이 둘」이 되는 문항이 조용히 산다.
 *   ② 빈 값 금지 전수(규칙 1) — 하드코딩 목록이 아니라 재귀로 돈다.
 *   ③ 지시문↔질문 결속 — 빈칸형은 `(___)` 정확히 1개, 반대말형은 «» 인용, 뜻형은 빈칸 0.
 *   ④ 정답 자리 분포 — 한 자리 몰림(각 15~35 밖)을 기계로 잡는다(암기 신호·찍기 이득 방지).
 *   ⑤ 스킬 커버리지 — 쓰는 스킬 = 스킬표 전체(죽은 행·미등록 태그 0) · **스킬마다 문항 ≥2**
 *      (재도전 = 같은 skill 다른 문항 — 후보 0 이면 그 문항의 재도전이 원리상 못 뜬다 §0-5).
 *   ⑥ 문항판↔내용 지문 결속 — 문구만 고치고 판을 안 올리면 빨개진다.
 *   ⑦ 금칙어 0(synk-brand 바닥 검사 — G1 과 같은 검사기 꼴) · ⑧ 깊은 동결 · ⑨ 탐지력.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { 세우기 } = require('./lib/앱모듈세우기.js');

const 뿌리 = path.resolve(__dirname, '..');
const fetch금지 = () => { throw new Error('문항 팩은 fetch 를 부르지 않는다'); };
const 팩 = 세우기(path.join(뿌리, 'contents', '토픽퀴즈문항.js'), fetch금지);

/* ── 검사기(순수) — 실팩과 위반 픽스처가 같은 검사기를 지난다(탐지력의 전제) ── */

/** 재귀 빈 값 수집(규칙 1) — 빈 문자열·null·빈 배열. */
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

/** 금칙어·결핍 구문(synk-brand 바닥 검사 — G1 검사기와 같은 꼴). */
const 금칙꼴 = [/패배/, /졌다/, /실패/, /불운/, /하락/, /부족/, /안\s?됨/, /늦/,
  /아직[^.]{0,20}(밖에|못)/];
function 금칙위반(문자열들) {
  const 위반 = [];
  for (const 글 of 문자열들) {
    for (const 꼴 of 금칙꼴) if (꼴.test(글)) 위반.push(`「${글}」 ← ${꼴}`);
  }
  return 위반;
}

/** 보기 모양 위반 — 4벌·o1~o4 자리 순서·label 유일·정답 실재. */
function 보기위반(문항) {
  const 위반 = [];
  if (!Array.isArray(문항.보기) || 문항.보기.length !== 4) 위반.push(`${문항.문항id}: 보기 4개 아님`);
  else {
    문항.보기.forEach((o, i) => {
      if (o.option_id !== `o${i + 1}`) 위반.push(`${문항.문항id}: 자리 ${i + 1} 의 id 가 o${i + 1} 아님`);
      if (Object.keys(o).sort().join(',') !== 'label,option_id') 위반.push(`${문항.문항id}: 보기 키 집합 위반`);
    });
    const 라벨들 = 문항.보기.map((o) => o.label);
    if (new Set(라벨들).size !== 라벨들.length) 위반.push(`${문항.문항id}: label 중복 — 정답이 둘이 된다`);
    if (!문항.보기.some((o) => o.option_id === 문항.정답)) 위반.push(`${문항.문항id}: 정답 ${문항.정답} 이 보기에 없다`);
  }
  return 위반;
}

/** 정답 자리 분포 — 자리별 개수. */
function 자리분포(문항들) {
  const 분포 = { o1: 0, o2: 0, o3: 0, o4: 0 };
  for (const q of 문항들) 분포[q.정답] = (분포[q.정답] ?? 0) + 1;
  return 분포;
}

/** 번호%4 순환과의 일치 수 — 네 위상 전부(주기 배치 회귀의 재료). */
function 주기일치(문항들) {
  return [0, 1, 2, 3].map((r) => ({
    r,
    일치: 문항들.filter((q) => q.정답 === `o${((Number(q.문항id.slice(2)) - 1 + r) % 4) + 1}`).length,
  }));
}

/** 문항 내용 지문 — FNV-1a(판 결속 재료 · G1 과 같은 꼴). */
function 지문(글) {
  let h = 0x811c9dc5;
  for (let i = 0; i < 글.length; i++) {
    h ^= 글.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** 문항의 모든 문자열(재귀 — 목록 사본 없음). */
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

/* ── 실팩 검사 ── */

test('판·검수확정 — 정본 값 그대로', () => {
  assert.equal(팩.문항판, '토픽퀴즈.v1');
  assert.equal(팩.스킬판, 'skills.v1');
  assert.equal(팩.검수확정, false, '사람 검수(정답 유일성) 확정 전 — 송출 라운드 게이트(④ 인수 조건)');
});

test('스킬표 — id 꼴·유일·label_ko·domain·mn 없음(검수 전)', () => {
  const ids = new Set();
  for (const 줄 of 팩.스킬표) {
    assert.deepEqual(Object.keys(줄).sort(), ['domain', 'label_ko', 'skill_id'],
      `스킬표 키 집합: ${줄.skill_id} — label_mn 은 몽골어 검수 확정 커밋에서만 는다`);
    assert.match(줄.skill_id, /^skill-ko-[a-z]+(-[a-z0-9]+)+$/, 'L0 §3-5 예시 꼴');
    assert.ok(!ids.has(줄.skill_id), `skill_id 중복: ${줄.skill_id}`);
    ids.add(줄.skill_id);
    assert.ok(['grammar', 'expression', 'vocab'].includes(줄.domain), `domain 값: ${줄.domain}`);
  }
  assert.equal(팩.스킬표.length, 30);
});

test('문항 100벌 — 키 집합·id 꼴·유일·보기 모양·태그 실재', () => {
  assert.equal(팩.문항들.length, 100, '§2-J 재고 산술(하루 4~6라운드+재도전)의 전제');
  const 허용키 = ['문항id', '지시문', '질문', '보기', '정답', 'skill_ids'];
  const 스킬id들 = new Set(팩.스킬표.map((s) => s.skill_id));
  const ids = new Set();
  for (const 문항 of 팩.문항들) {
    assert.deepEqual(Object.keys(문항).sort(), [...허용키].sort(), `${문항.문항id} 키 집합`);
    assert.match(문항.문항id, /^tq\d{3}$/);
    assert.ok(!ids.has(문항.문항id), `문항id 중복: ${문항.문항id}`);
    ids.add(문항.문항id);
    assert.deepEqual(보기위반(문항), []);
    assert.ok(문항.skill_ids.length >= 1, `${문항.문항id}: 태그 0 — 승격이 축 없이 나간다`);
    for (const s of 문항.skill_ids) assert.ok(스킬id들.has(s), `${문항.문항id}: 스킬표 밖 태그 ${s}`);
  }
});

test('빈 값 금지 — 전 문항 재귀 전수(규칙 1)', () => {
  for (const 문항 of 팩.문항들) assert.deepEqual(빈값위반(문항, 문항.문항id), []);
});

test('지시문 ↔ 질문 결속 — 유형 셋뿐, 유형이 요구하는 모양대로', () => {
  const 정본들 = Object.values(팩.지시문표);
  for (const 문항 of 팩.문항들) {
    assert.ok(정본들.includes(문항.지시문), `${문항.문항id}: 지시문표 밖 지시문`);
    const 빈칸수 = (문항.질문.match(/\(___\)/g) ?? []).length;
    if (문항.지시문 === 팩.지시문표.빈칸) {
      assert.equal(빈칸수, 1, `${문항.문항id}: 빈칸형은 (___) 정확히 1개`);
    } else if (문항.지시문 === 팩.지시문표.반대) {
      assert.match(문항.질문, /«[^»]+»/, `${문항.문항id}: 반대말형은 «» 인용`);
      assert.equal(빈칸수, 0);
    } else {
      assert.equal(빈칸수, 0, `${문항.문항id}: 뜻형은 빈칸이 없다`);
    }
  }
});

test('정답 자리 분포 — 몰림 금지(각 15~35)', () => {
  const 분포 = 자리분포(팩.문항들);
  for (const 자리 of ['o1', 'o2', 'o3', 'o4']) {
    assert.ok(분포[자리] >= 15 && 분포[자리] <= 35,
      `자리 ${자리} 에 ${분포[자리]}개 — 몰리면 찍기 이득·암기 신호가 생긴다`);
  }
});

test('주기꼴 부재 — 번호%4 순환(네 위상 전부)이 정답 자리를 못 맞힌다(분리 반박 실측)', () => {
  // 회전(미노출 우선)이 팩 순서를 따라가면 주기 배치는 화면에서 1→2→3→4 로 학습된다.
  // 균등 무작위 기대는 25 — 40 을 넘으면 배치가 공식으로 돌아간 것이다(공식이면 한 위상이 100).
  for (const 위상 of 주기일치(팩.문항들)) {
    assert.ok(위상.일치 <= 40, `위상 ${위상.r}: ${위상.일치}개 일치 — 주기 배치로 돌아갔다`);
  }
});

test('스킬 커버리지 — 죽은 행·미등록 태그 0 · 스킬마다 문항 ≥2(재도전 전제)', () => {
  const 사용 = new Map();
  for (const 문항 of 팩.문항들) {
    for (const s of 문항.skill_ids) 사용.set(s, (사용.get(s) ?? 0) + 1);
  }
  assert.deepEqual([...사용.keys()].sort(), 팩.스킬표.map((r) => r.skill_id).sort(),
    '쓰는 스킬 집합 = 스킬표 집합 — 죽은 시드 행도, 표 밖 태그도 없다');
  for (const [s, n] of 사용) {
    assert.ok(n >= 2, `${s}: 문항 ${n}개 — 같은 skill 다른 문항이 없어 재도전이 못 뜬다(§0-5)`);
  }
});

test('재도전 후보 — 전 문항 ≥1 · 자기 제외 · 결정적 · 같은 skill 만', () => {
  for (const 문항 of 팩.문항들) {
    const 후보 = 팩.같은스킬다른문항(문항.문항id);
    assert.ok(Array.isArray(후보) && 후보.length >= 1, `${문항.문항id}: 재도전 후보 0`);
    assert.ok(!후보.includes(문항.문항id), `${문항.문항id}: 자기 자신이 후보다`);
    assert.deepEqual(팩.같은스킬다른문항(문항.문항id), 후보, '같은 입력 = 같은 산출');
    for (const id of 후보) {
      const 상대 = 팩.찾기(id);
      assert.ok(상대.skill_ids.some((s) => 문항.skill_ids.includes(s)), `${문항.문항id}→${id}: 공유 스킬 0`);
    }
  }
  assert.equal(팩.같은스킬다른문항('tq999'), null, '모르는 문항은 null — 지어내지 않는다');
  assert.equal(팩.찾기('tq999'), null);
  assert.equal(팩.찾기(null), null);
});

test('깊은 동결 — 변조가 다음 소비자에게 안 남는다(G1 반박 C1 선례)', () => {
  const 문항 = 팩.문항들[0];
  assert.ok(Object.isFrozen(팩.문항들) && Object.isFrozen(문항) && Object.isFrozen(문항.보기)
    && Object.isFrozen(문항.보기[0]) && Object.isFrozen(문항.skill_ids) && Object.isFrozen(팩.스킬표[0]));
  // ⚠ 팩은 vm 렐름에서 선다(앱모듈세우기) — TypeError 클래스 동일성이 렐름을 못 건너므로 이름으로 잡는다
  assert.throws(() => { 문항.보기.push({ option_id: 'o5', label: '오염' }); }, { name: 'TypeError' });
  assert.throws(() => { 문항.정답 = 'o9'; }, { name: 'TypeError' });
  const 후보 = 팩.같은스킬다른문항('tq001');
  assert.ok(Object.isFrozen(후보), '반환값도 얼어 나간다');
  assert.throws(() => { 후보.push('오염'); }, { name: 'TypeError' });
});

test('문항판 ↔ 내용 지문 결속 — 문구만 바꾸면 여기서 빨개진다', () => {
  const 내용 = JSON.stringify(팩.문항들) + JSON.stringify(팩.스킬표) + 팩.문항판 + 팩.스킬판;
  // 문구·판을 함께 바꾸는 커밋에서만 이 상수를 갱신한다(머리말 문항판 규칙).
  assert.equal(`${팩.문항판}:${지문(내용)}`, '토픽퀴즈.v1:3d86190d');
});

test('금칙어 0 — 지시문·질문·보기 label 전량(synk-brand 바닥 검사)', () => {
  const 전부 = 팩.문항들.flatMap(문자열전량).concat(팩.스킬표.flatMap(문자열전량));
  assert.deepEqual(금칙위반(전부), []);
});

/* ── 탐지력 — 위반본이 실제로 빨개지는가(「지킨다」는 얼굴만 남는 검사 방지) ── */

test('탐지력 — 검사기들이 위반 픽스처에서 실제로 운다', () => {
  // 빈 값
  assert.ok(빈값위반({ 문항id: 'tq999', 질문: '' }, 'tq999').length > 0);
  assert.ok(빈값위반({ skill_ids: [] }, 'x').length > 0, '빈 배열');
  assert.ok(빈값위반({ 정답: null }, 'x').length > 0, 'null');
  // 보기 모양: label 중복(정답이 둘) · 정답 부재 · 자리 어긋난 id
  const 정상보기 = [{ option_id: 'o1', label: '가' }, { option_id: 'o2', label: '나' },
    { option_id: 'o3', label: '다' }, { option_id: 'o4', label: '라' }];
  assert.ok(보기위반({ 문항id: 'x', 보기: 정상보기.map((o) => ({ ...o, label: '가' })), 정답: 'o1' }).length > 0);
  assert.ok(보기위반({ 문항id: 'x', 보기: 정상보기, 정답: 'o5' }).length > 0);
  assert.ok(보기위반({ 문항id: 'x', 보기: [...정상보기].reverse(), 정답: 'o1' }).length > 0);
  assert.deepEqual(보기위반({ 문항id: 'x', 보기: 정상보기, 정답: 'o2' }), [], '정상본은 통과');
  // 분포: 한 자리 몰림
  const 몰림 = Array.from({ length: 100 }, () => ({ 정답: 'o1' }));
  assert.equal(자리분포(몰림).o1, 100);
  // 주기꼴: 공식 배치를 넣으면 그 위상이 100 으로 운다
  const 공식 = Array.from({ length: 100 }, (_, i) => ({
    문항id: `tq${String(i + 1).padStart(3, '0')}`, 정답: `o${(i % 4) + 1}`,
  }));
  assert.ok(주기일치(공식).some((v) => v.일치 === 100));
  // 금칙어(활용형까지 — G1 선례 그대로)
  assert.ok(금칙위반(['수업에 늦었어요']).length > 0);
  assert.ok(금칙위반(['시험에 실패했어요']).length > 0);
  assert.ok(금칙위반(['아직 반밖에 못 왔어요']).length > 0);
  // 지문: 한 글자가 값을 바꾼다
  assert.notEqual(지문('가'), 지문('각'));
});
