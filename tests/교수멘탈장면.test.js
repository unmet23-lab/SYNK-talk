'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { 장면만들기, 책갈피말 } = require('../contents/교수멘탈장면.js');
const { 문항들, 시드만들기, 펴기, 검수확정 } = require('../contents/교수멘탈문항.js');
const { 혼잣말캐릭터들 } = require('../lib/마스코트생명.js');
const { 세우기 } = require('./lib/앱모듈세우기.js');

const 사례들 = 문항들.flatMap((원천) => 원천.사유.flatMap((사유, s) =>
  원천.세부.map((세부, d) => ({ 원천, 사유, 세부, seed: 시드만들기(원천.문항id, s, d) }))));

test('45개 실제 문항 × 선택 친구 셋: 원문·사유·요청 세부가 뒤바뀌지 않는다', () => {
  assert.equal(사례들.length, 45);
  assert.deepEqual([...혼잣말캐릭터들], ['몽글', '까몽', '마린']);
  for (const { seed, 사유, 세부 } of 사례들) for (const 캐릭터 of 혼잣말캐릭터들) {
    const 문항 = 펴기(seed);
    const 장면 = 장면만들기({ prompt_seed: seed, 문항, 캐릭터 });
    assert.equal(장면.확인된시드, true, seed);
    assert.deepEqual(장면.원문, { 이름: 문항.이름, 질문: 문항.질문, 지시문: 문항.지시문 });
    assert(장면.단서.some((단서) => 단서.값 === 사유), seed);
    assert(장면.단서.some((단서) => 단서.값 === 세부), seed);
    assert.equal(장면.캐릭터, 캐릭터);
    assert.equal(장면.친구.이름, 캐릭터);
    assert(장면.교수.대사[0].startsWith(`${캐릭터}아, `));
  }
});

test('몸이 아팠던 5일 부탁은 어제 마감·몸 아픔·5일로 따로 드러난다', () => {
  const 장면 = 장면만들기({ prompt_seed: 'g1t01.s0d1', 캐릭터: '마린' });
  assert.deepEqual(장면.단서, [
    { 이름: '원래 마감', 값: '어제' },
    { 이름: '사정', 값: '갑자기 몸이 아파서' },
    { 이름: '부탁할 시간', 값: '5일' },
  ]);
  for (const 전략 of 장면.전략) {
    assert.match(전략.쓰기힌트, /5일/);
    assert.doesNotMatch(전략.쓰기힌트, /3일|일주일/);
  }
});

test('45개 세부값의 쓰기힌트: 받침 있는 기간·기한에 예요를 바로 붙이지 않는다', () => {
  const 확인한세부 = new Set();
  for (const { seed, 세부 } of 사례들) {
    const 장면 = 장면만들기({ prompt_seed: seed, 캐릭터: '마린' });
    const 받침있음 = (세부.codePointAt(세부.length - 1) - 0xac00) % 28 !== 0;
    for (const { 쓰기힌트 } of 장면.전략) {
      assert.equal(쓰기힌트.includes(`${세부}${받침있음 ? '예요' : '이에요'}`), false, `${seed}: ${쓰기힌트}`);
      if (쓰기힌트.includes(세부)) 확인한세부.add(세부);
    }
  }
  // 5일 하나뿐 아니라 받침이 다른 면담 시간과 추천서 기한도 실제 안내를 읽었다.
  for (const 세부 of ['3일', '5일', '일주일', '이번 주 목요일 오후', '다음 주 월요일 오전', '이번 주 금요일 수업 후', '다음 달 15일', '이달 말', '2주 뒤 월요일']) {
    assert(확인한세부.has(세부), 세부);
  }
});

test('파일 재제출과 면담·추천서에 마감 경과나 몸 아픔 이야기를 섞지 않는다', () => {
  for (const { seed, 원천 } of 사례들.filter(({ 원천 }) => 원천.문항id !== 'g1t01')) {
    const 장면 = 장면만들기({ prompt_seed: seed, 캐릭터: '까몽' });
    const 대사 = [...장면.교수.대사, ...장면.친구.대사].join(' ');
    assert.doesNotMatch(대사, /어제|몸이 아파|연애|과제가 아직 안/);
    assert.equal(장면.단서.some((단서) => 단서.이름 === '원래 마감'), false);
    if (원천.문항id === 'g1t03') assert.match(대사, /기한 안에/);
  }
});

test('미확인 시드와 시드 없는 원문은 그대로 보존하고 일반 안내만 낸다', () => {
  const 문항 = { 이름: '새 부탁', 질문: '모레 자료를 받기로 했어요.', 지시문: '상황을 읽고 직접 써 보세요.',
    요구문형: { 비공개: '정답 문장을 여기에서 꺼내면 안 된다' } };
  for (const seed of [undefined, '', 'g1t99.s0d0', 'g1t01.s9d9', 42]) {
    const 장면 = 장면만들기({ prompt_seed: seed, 문항, 캐릭터: '마린' });
    assert.equal(장면.확인된시드, false);
    assert.deepEqual(장면.원문, { 이름: 문항.이름, 질문: 문항.질문, 지시문: 문항.지시문 });
    assert.deepEqual(장면.단서, []);
    assert.match(장면.교수.대사[0], /편지를 쓰려는구나/);
    assert.doesNotMatch(JSON.stringify(장면), /연애|과제가 아직|몸이 아파|5일|요구문형|정답 문장/);
  }
});

test('유효 시드라도 제공 원문이 다른 판이면 그 원문에 옛 사실을 덧씌우지 않는다', () => {
  const 원본 = 펴기('g1t01.s0d1');
  for (const 변경 of [
    { 질문: '몸이 아팠지만 과제는 기한 안에 냈어요.' },
    { 지시문: '하루만 더 부탁해 보세요.' },
    { 문항판: '다른판' },
    { 문항id: 'g1t05' },
  ]) {
    const 문항 = { ...원본, ...변경 };
    const 장면 = 장면만들기({ prompt_seed: 'g1t01.s0d1', 문항, 캐릭터: '몽글' });
    assert.equal(장면.확인된시드, false);
    assert.equal(장면.원문.질문, 문항.질문);
    assert.equal(장면.원문.지시문, 문항.지시문);
    assert.deepEqual(장면.단서, []);
    assert.doesNotMatch(장면.교수.대사.join(' '), /과제가 아직|연애/);
  }
});

test('미선택·미지원 가이드를 몽글로 바꾸거나 호명하지 않는다', () => {
  for (const 캐릭터 of [undefined, null, '', '고양이', 'mongle', 'constructor']) {
    const 장면 = 장면만들기({ prompt_seed: 'g1t01.s0d1', 캐릭터 });
    assert.equal(장면.캐릭터, null);
    assert.equal(장면.친구, null);
    assert.doesNotMatch(JSON.stringify(장면), /몽글|까몽|마린|이 몸|전설의 용/);
  }
});

test('친구는 셋의 말투로 다르되 교수의 성격과 사실은 같다', () => {
  for (const { seed } of 사례들) {
    const [몽글, 까몽, 마린] = 혼잣말캐릭터들.map((캐릭터) => 장면만들기({ prompt_seed: seed, 캐릭터 }));
    const 교수본문 = (장면) => [장면.교수.대사[0].replace(`${장면.캐릭터}아, `, ''), ...장면.교수.대사.slice(1)];
    assert.deepEqual(교수본문(몽글), 교수본문(까몽));
    assert.deepEqual(교수본문(까몽), 교수본문(마린));
    assert.deepEqual(몽글.단서, 마린.단서);
    assert.match(몽글.친구.대사.join(' '), /같이/);
    assert.match(까몽.친구.대사.join(' '), /이 몸|전설의 용/);
    assert.doesNotMatch(JSON.stringify(까몽.친구), /고양이|야옹/);
    const 마린말 = [...마린.친구.대사, ...마린.전략.map((전략) => 전략.미리보기)];
    for (const 문장 of 마린말) {
      assert.doesNotMatch(문장, /[!?！？]/);
      assert.match(문장, /확인|기록|탐색|접수|근거|정리|별건/);
    }
  }
});

test('세 소품은 기존 API의 선택 ID·라벨을 유지하고 안내와 말투 예문을 구별한다', () => {
  const { 사과전략 } = 세우기(path.join(__dirname, '..', 'lib/게임제출.js'), () => { throw Error('원격 호출 금지'); });
  for (const { seed } of 사례들) {
    const 장면 = 장면만들기({ prompt_seed: seed, 캐릭터: '몽글' });
    assert.deepEqual(장면.전략.map(({ option_id, 제목 }) => ({ option_id, label: 제목 })),
      JSON.parse(JSON.stringify(사과전략.보기들)));
    assert.equal(new Set(장면.전략.map((전략) => 전략.소품)).size, 3);
    const 안내 = { ...장면, 전략: 장면.전략.map(({ 예문, ...나머지 }) => 나머지) };
    assert.doesNotMatch(JSON.stringify(안내), /요구문형|정답|죄송합니다|주시면 감사하겠습니다|○○○ 올림/);
    const 직렬 = JSON.stringify(장면);
    assert.doesNotMatch(직렬, /요구문형|정답|주시면 감사하겠습니다|○○○ 올림/);
    assert.doesNotMatch(직렬, /승낙했|허락했|연장됐|읽었어요|합격/);
  }
  assert.equal(검수확정, false);
});

test('45개 상황의 말투 예문은 현재 사유·세부를 지키고 짧은 세 방법으로 갈린다', () => {
  for (const { seed, 사유, 세부, 원천 } of 사례들) {
    const 장면 = 장면만들기({ prompt_seed: seed, 캐릭터: '마린' });
    const 찾기 = (갈래) => 장면.전략.find(s => s.option_id === `g1-사과-${갈래}`);
    assert.ok(찾기('솔직').예문.includes(사유), seed);
    if (원천.문항id === 'g1t03') assert.ok(찾기('솔직').예문.includes(세부), seed);
    else assert.ok(찾기('간결').예문.includes(세부), seed);
    assert.equal(new Set(장면.전략.map(s => s.예문)).size, 3);
    for (const 전략 of 장면.전략) {
      assert.ok(전략.설명 && 전략.예문.length > 10 && 전략.예문.length <= 100, seed);
      assert.ok(전략.예문.split(/[.?!]+/).filter(Boolean).length <= 2, seed);
      assert.doesNotMatch(전략.예문, /안녕하십니까|감사합니다|올림|승낙했|허락했|연장됐|합격/);
    }
    if (원천.문항id === 'g1t03') assert.doesNotMatch(찾기('솔직').예문, /기한을|제출하지 못/);
    if (원천.문항id === 'g1t04' || 원천.문항id === 'g1t05') {
      assert.doesNotMatch(장면.전략.map(s => s.예문).join(' '), /과제|잘못|몸이 아파/);
    }
  }
});

test('면담 대안 예문은 오전·오후·수업 후에 맞는 조사로 시간과 면담을 잇는다', () => {
  const 면담들 = 사례들.filter(({ 원천 }) => 원천.문항id === 'g1t04');
  assert.equal(면담들.length, 9);
  for (const { seed, 세부 } of 면담들) {
    const { 예문 } = 장면만들기({ prompt_seed: seed, 캐릭터: '마린' }).전략.find(s => s.option_id === 'g1-사과-대안');
    assert.ok(예문.includes(`${세부}에 면담`), `${seed}: ${예문}`);
    assert.doesNotMatch(예문, /오전가/, seed);
  }
});

test('장면은 결정적이고 깊게 동결되며 호출자가 원문을 바꿔도 앞선 결과는 바뀌지 않는다', () => {
  const 입력 = { ...펴기('g1t01.s0d1') };
  const 장면 = 장면만들기({ prompt_seed: 'g1t01.s0d1', 문항: 입력, 캐릭터: '까몽' });
  assert.deepEqual(장면, 장면만들기({ prompt_seed: 'g1t01.s0d1', 문항: 입력, 캐릭터: '까몽' }));
  assert.throws(() => 장면.친구.대사.push('다른 말'), TypeError);
  assert.throws(() => { 장면.전략[0].option_id = '다른선택'; }, TypeError);
  입력.질문 = '다른 원문';
  assert.notEqual(장면.원문.질문, 입력.질문);
  assert.equal(Object.isFrozen(입력), false);
});

test('책갈피 다섯 칸은 친구의 말투로 생각을 돕고 쓸 문장을 대신 주지 않는다', () => {
  const 칸들 = Object.keys(펴기('g1t01.s0d1').요구문형);
  assert.deepEqual(칸들, ['인사', '사과', '이유', '요청', '맺음']);
  for (const 칸 of 칸들) {
    const 말들 = 혼잣말캐릭터들.map((캐릭터) => 책갈피말(캐릭터, 칸));
    assert.equal(new Set(말들).size, 3);
    assert.match(말들[0], /같이/);
    assert.match(말들[1], /이 몸/);
    assert.match(말들[2], /확인/);
    assert.doesNotMatch(말들[2], /[!?！？]/);
    for (const 말 of 말들) assert.doesNotMatch(말, /안녕하십니까|죄송합니다|감사합니다|감사하겠습니다|올림|-아\/-어|-아\/어/);
  }
  for (const 캐릭터 of [undefined, null, '', '고양이', 'constructor']) {
    for (const 칸 of 칸들) {
      assert.equal(책갈피말(캐릭터, 칸), 책갈피말(null, 칸));
      assert.match(책갈피말(캐릭터, 칸), /보세요\.$/);
    }
  }
  for (const 칸 of [undefined, '점수', 'constructor']) assert.equal(책갈피말('마린', 칸), '편지에 어떤 마음을 담을지 생각해 보세요.');
});
