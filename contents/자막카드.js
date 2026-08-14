'use strict';
/**
 * 「오늘의 표현」 자막 카드 팩 — 한국어 정본 v1 (라디오24 발전 트랙 ④ · 설계 §2-B·§2-2 ⓖ).
 *
 * ■ 왜 이 파일이 ④의 **첫 칸**인가 — 착수 실측이 문서와 갈렸다
 *   설계 §2-2 ⓖ 는 「그날 자막 카드의 표현을 소리 내어 읽는다」를 계약 개정 0 으로 세웠고,
 *   `radio.subtitle_card_log` 도 08-11 에 섰다(주석까지 「낭독 과제의 제시문 원천」이라 적혀 있다).
 *   그런데 **카드 자체를 만드는 곳이 저장소에 0 벌**이었다 — 원장은 「무엇이 언제 화면에 떴나」를
 *   적는 로그지 문안을 낳는 곳이 아니고, 송출이 0 이라 그 표는 앞으로도 빈다.
 *   즉 ④를 막고 있던 것은 앱 화면이 아니라 **제시문의 생산자**였다. 이 파일이 그 칸이다.
 *
 * ■ 🔴 낭독은 숙제 ②와 **다른 통로**여야 한다 (lib/오늘과제.js:62 가 이미 못박은 것)
 *   숙제의 ②낭독 문장은 **첫날도 강등도 같은 것**을 쓴다 — 같은 문장을 읽어야 성립하는
 *   종단 대조가 그 축의 전부이기 때문이다. 라디오 카드를 그 자리에 밀어 넣으면 그 대조가
 *   조용히 죽는다(증상은 없고, 몇 달 뒤 「발음이 늘었나」를 물을 근거만 사라진다).
 *   그래서 이 팩은 숙제를 대체하지 않고 **자기 통로**로 선다(`lib/라디오낭독.js`).
 *
 * ■ `content_ref` = `radio:card:<카드id>` — 접두를 붙인 이유
 *   설계 §10 기각 4 가 금지한 것은 **문항** `task_ref` 접두다(같은 문항이 앱·라디오로 나가는데
 *   접두가 갈리면 문항 단위 통계가 죽는다). 자막 카드는 라디오에만 사는 물건이라 갈릴 정체성이
 *   없고, 승격기가 이미 같은 무늬를 쓴다(`radio:cmd:자습체인:v1` — lib/라디오승격.js `명령과업`).
 *   원장 `subtitle_card_log.content_ref` 가 이 값을 그대로 들도록 오버레이(P3)가 이 팩을 읽는다.
 *
 * ■ 🔴 몽골어를 **지어내지 않는다** — 뜻 칸은 비워 두고 발주로 남긴다
 *   설계 §7-4 가 오버레이·자막 문안을 몽골어 병기 검수 발주 목록에 올려 뒀다. 번역이 서기 전에
 *   칸을 채우면 그 문장은 「검수된 것」과 바이트가 같아지고, 아무도 다시 안 본다(① 트랙이 해설
 *   칸에서 같은 판정을 냈다 — 「번역이 서기 전엔 한국어만 낸다」).
 *   🔑 그리고 **낭독은 뜻 없이도 성립한다** — 학생이 하는 일은 한국어를 소리 내어 읽는 것이라
 *   뜻 칸은 이해를 돕는 곁들임이지 과업의 재료가 아니다. 그래서 이 팩은 비워 둔 채로 선다.
 *
 * ■ ⚠ 팩 상수 하나로 전량을 막지 않는다 (① 트랙이 산 교훈 · talk 50aca03)
 *   퀴즈 팩은 `검수확정` 이 팩 전체에 걸린 하나라 100 문항 중 3 개가 걸리면 97 개까지 막혔다.
 *   여기서 같은 실수를 되풀이하지 않되, **막을 것이 다르다**는 것도 같이 적는다:
 *   퀴즈의 검수는 «정답 유일성»이라 틀리면 학생이 맞는 답을 틀렸다고 듣는다. 낭독 카드에는
 *   정답이 없고 위험은 «한국어가 틀린 문장을 소리 내어 굳히는 것» 하나다. 그 위험은 문안
 *   저작 시점에 닫혔고(아래 저작 원칙), 남은 검수는 몽골어 병기뿐이라 **통로를 막지 않는다.**
 *
 * ■ 저작 원칙 — 낭독은 「읽는 것」이라 문장 조건이 퀴즈와 다르다
 *   ① 한 호흡에 읽힌다(대략 10~20 음절 · 한 문장). 길면 낭독이 아니라 읽기 시험이 된다.
 *   ② 실제로 입에서 나오는 말 — 문어체·설명문 금지(TOPIK I 대화체).
 *   ③ 스킬 하나가 **소리로 드러나는** 문장. 조사 하나 차이가 눈으로만 보이는 문장은 낭독 재료로
 *      약하다(그건 퀴즈 팩의 자리다).
 *   ④ 학원·일상 맥락 — 학생이 그날 실제로 쓸 수 있는 말(철학 「실사용 한국어」 게이트).
 *
 * ■ `skill_ids` 정본은 **퀴즈 팩의 스킬표 하나**다 — 여기서 다시 적지 않는다
 *   두 팩이 각자 표를 들면 스킬을 하나 늘린 날 조용히 갈라지고, 갈라진 태그는 개념별 숙련도를
 *   반으로 쪼갠다. 그래서 require 로 읽고, 아래 회귀가 「이 팩의 태그 ⊂ 스킬표」를 기계로 묶는다.
 */

const { 스킬표, 스킬판 } = require('./토픽퀴즈문항.js');

/** 카드판 — 문안이 바뀌면 이 값을 올린다(옛 행은 자기 `task_snapshot` 을 그대로 들고 있다). */
const 카드판 = '자막카드.v1';

/** 🔴 몽골어 병기 검수 — 아직 0 벌이다. 통로를 막지 않지만 «안 했다»를 숨기지도 않는다. */
const 몽골어검수확정 = false;

function 깊이얼리기(값) {
  if (값 && typeof 값 === 'object' && !Object.isFrozen(값)) {
    Object.freeze(값);
    for (const 속 of Object.values(값)) 깊이얼리기(속);
  }
  return 값;
}

/* 카드 한 장 = { 카드id, 표현, 상황, skill_ids }
 *   `상황` = 「언제 쓰는 말인가」. 낭독 전에 한 줄로 붙는다 — 뜻 없이도 맥락이 서게 하는 칸이고,
 *   몽골어 검수가 서기 전까지 이해를 떠받치는 유일한 자리다(그래서 한국어로 짧게).
 *   순서는 팩 순서 그대로가 정본이다 — 회전은 `lib/라디오낭독.js` 가 날짜 씨앗으로 낸다. */
const 카드들 = 깊이얼리기([
  { 카드id: 'sc001', 표현: '오늘은 날씨가 정말 좋아요.', 상황: '아침에 인사하며', skill_ids: ['skill-ko-grammar-particle-topic'] },
  { 카드id: 'sc002', 표현: '저는 매일 한국어를 공부해요.', 상황: '자기소개할 때', skill_ids: ['skill-ko-grammar-particle-object'] },
  { 카드id: 'sc003', 표현: '내일 도서관에서 친구를 만나요.', 상황: '약속을 말할 때', skill_ids: ['skill-ko-grammar-particle-place'] },
  { 카드id: 'sc004', 표현: '아홉 시부터 열두 시까지 수업이 있어요.', 상황: '하루 일정을 말할 때', skill_ids: ['skill-ko-grammar-particle-range'] },
  { 카드id: 'sc005', 표현: '학교까지 버스로 삼십 분 걸려요.', 상황: '오는 길을 말할 때', skill_ids: ['skill-ko-grammar-particle-instrument'] },
  { 카드id: 'sc006', 표현: '어제 친구하고 같이 밥을 먹었어요.', 상황: '주말 이야기를 할 때', skill_ids: ['skill-ko-grammar-particle-companion'] },
  { 카드id: 'sc007', 표현: '선생님께 질문이 하나 있어요.', 상황: '수업 중에 손을 들고', skill_ids: ['skill-ko-grammar-particle-dative'] },
  { 카드id: 'sc008', 표현: '저는 아침에 커피만 마셔요.', 상황: '식사 이야기를 할 때', skill_ids: ['skill-ko-grammar-particle-focus'] },
  { 카드id: 'sc009', 표현: '배가 고파서 식당에 갔어요.', 상황: '이유를 말할 때', skill_ids: ['skill-ko-grammar-connective-reason'] },
  { 카드id: 'sc010', 표현: '한국어는 어렵지만 재미있어요.', 상황: '공부 이야기를 할 때', skill_ids: ['skill-ko-grammar-connective-contrast'] },
  { 카드id: 'sc011', 표현: '시간이 있으면 같이 갈까요?', 상황: '같이 하자고 말할 때', skill_ids: ['skill-ko-grammar-connective-condition'] },
  { 카드id: 'sc012', 표현: '저는 한국어를 배우러 왔어요.', 상황: '온 이유를 말할 때', skill_ids: ['skill-ko-grammar-connective-purpose'] },
  { 카드id: 'sc013', 표현: '숙제를 하고 나서 잘 거예요.', 상황: '저녁 계획을 말할 때', skill_ids: ['skill-ko-grammar-connective-sequence'] },
  { 카드id: 'sc014', 표현: '어제 친구를 만나서 이야기를 많이 했어요.', 상황: '어제 한 일을 말할 때', skill_ids: ['skill-ko-grammar-tense-past'] },
  { 카드id: 'sc015', 표현: '주말에 영화를 볼 거예요.', 상황: '계획을 말할 때', skill_ids: ['skill-ko-grammar-tense-future'] },
  { 카드id: 'sc016', 표현: '지금 한국어를 공부하고 있어요.', 상황: '지금 하는 일을 말할 때', skill_ids: ['skill-ko-grammar-tense-progressive'] },
  { 카드id: 'sc017', 표현: '할아버지께서 신문을 읽으세요.', 상황: '어른 이야기를 할 때', skill_ids: ['skill-ko-grammar-honorific'] },
  { 카드id: 'sc018', 표현: '저는 아직 밥을 안 먹었어요.', 상황: '점심때 대답할 때', skill_ids: ['skill-ko-grammar-negation'] },
  { 카드id: 'sc019', 표현: '저는 한국 노래를 부를 수 있어요.', 상황: '할 줄 아는 것을 말할 때', skill_ids: ['skill-ko-expression-ability'] },
  { 카드id: 'sc020', 표현: '저는 김치를 먹어 본 적이 있어요.', 상황: '경험을 말할 때', skill_ids: ['skill-ko-expression-experience'] },
  { 카드id: 'sc021', 표현: '저는 한국에서 일하고 싶어요.', 상황: '꿈을 말할 때', skill_ids: ['skill-ko-expression-desire'] },
  { 카드id: 'sc022', 표현: '내일까지 숙제를 내야 해요.', 상황: '해야 할 일을 말할 때', skill_ids: ['skill-ko-expression-obligation'] },
  { 카드id: 'sc023', 표현: '여기에서 사진을 찍어도 돼요?', 상황: '허락을 물을 때', skill_ids: ['skill-ko-expression-permission'] },
  { 카드id: 'sc024', 표현: '오늘은 모자를 쓰고 나왔어요.', 상황: '옷차림을 말할 때', skill_ids: ['skill-ko-vocab-verb-collocation'] },
  { 카드id: 'sc025', 표현: '이 가방은 크지만 저 가방은 작아요.', 상황: '물건을 고를 때', skill_ids: ['skill-ko-vocab-antonym'] },
  { 카드id: 'sc026', 표현: '약국은 병원 옆에 있어요.', 상황: '길을 알려 줄 때', skill_ids: ['skill-ko-vocab-place'] },
  { 카드id: 'sc027', 표현: '제 생일은 시월 십오 일이에요.', 상황: '생일을 말할 때', skill_ids: ['skill-ko-vocab-time'] },
  { 카드id: 'sc028', 표현: '우리 가족은 모두 다섯 명이에요.', 상황: '가족을 소개할 때', skill_ids: ['skill-ko-vocab-family'] },
  { 카드id: 'sc029', 표현: '사과 세 개하고 우유 한 병 주세요.', 상황: '가게에서 살 때', skill_ids: ['skill-ko-vocab-counter'] },
  { 카드id: 'sc030', 표현: '저는 아침을 거의 안 먹어요.', 상황: '습관을 말할 때', skill_ids: ['skill-ko-vocab-adverb'] },
  { 카드id: 'sc031', 표현: '죄송하지만 다시 한번 말씀해 주세요.', 상황: '못 알아들었을 때', skill_ids: ['skill-ko-grammar-honorific'] },
  { 카드id: 'sc032', 표현: '조금 천천히 말해 주시면 좋겠어요.', 상황: '부탁할 때', skill_ids: ['skill-ko-expression-desire', 'skill-ko-vocab-adverb'] },
  { 카드id: 'sc033', 표현: '수업이 끝난 후에 도서관에 갈 거예요.', 상황: '수업 뒤 계획을 말할 때', skill_ids: ['skill-ko-grammar-connective-sequence', 'skill-ko-grammar-tense-future'] },
  { 카드id: 'sc034', 표현: '이 단어는 어떻게 읽어요?', 상황: '모르는 말을 물을 때', skill_ids: ['skill-ko-vocab-adverb'] },
  { 카드id: 'sc035', 표현: '매일 조금씩 연습하면 늘어요.', 상황: '공부 이야기를 할 때', skill_ids: ['skill-ko-grammar-connective-condition'] },
  { 카드id: 'sc036', 표현: '오늘 배운 표현을 한번 써 볼게요.', 상황: '수업을 마치며', skill_ids: ['skill-ko-expression-experience'] },
]);

/** `content_ref` 조립 — **여기 하나**다. 두 곳에서 문자열을 이으면 오버레이와 앱이 갈린다. */
function 카드참조(카드id) {
  return `radio:card:${String(카드id ?? '')}`;
}

const 색인 = new Map(카드들.map((카드) => [카드.카드id, 카드]));
const 참조색인 = new Map(카드들.map((카드) => [카드참조(카드.카드id), 카드]));

/** 카드 조회 — 없는 id 는 null(지어내지 않는다). 반환값은 동결된 정본 그 객체다. */
function 찾기(카드id) {
  return 색인.get(String(카드id ?? '')) ?? null;
}

/** `content_ref` 로 조회 — 원장 행이 가리키는 카드를 팩에서 되찾는 자리. */
function 참조로찾기(content_ref) {
  return 참조색인.get(String(content_ref ?? '')) ?? null;
}

/**
 * 카드 → `content_snapshot`(= 낭독 제출의 `task_snapshot`).
 *
 * 🔴 **그때 학생이 본 것**이라 판을 함께 싣는다 — 문안을 고쳐 `카드판` 이 올라도 옛 행은
 *   자기 스냅샷을 그대로 들고 있어야 「그때 무엇을 읽었나」가 남는다(L0 §3-3 · 계약 c4 판정).
 * 🔑 원장(`radio.subtitle_card_log.content_snapshot`)도 **이 모양**을 넣는다 — 오버레이가 이
 *   함수를 불러 적으므로, 방송 유래 행과 팩 유래 행의 스냅샷이 같은 열쇠를 갖는다.
 */
function 카드스냅샷(카드) {
  if (!카드 || !카드.카드id) return null;
  return 깊이얼리기({
    지시문: '오늘의 표현이에요. 소리 내어 읽어 보세요.',
    표현: 카드.표현,
    상황: 카드.상황,
    skill_ids: [...카드.skill_ids],
    판: 카드판,
    스킬판,
  });
}

module.exports = {
  카드판, 스킬판, 몽골어검수확정, 카드들, 카드참조, 찾기, 참조로찾기, 카드스냅샷,
};
