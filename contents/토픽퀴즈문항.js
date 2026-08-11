'use strict';
/**
 * TOPIK 퀴즈 문항 팩 — 한국어 정본 v1 (라디오24 P0 ③ · 라디오24_설계 §0-6·§2-J).
 *
 * ■ 자리
 *   라디오 정시 미니퀴즈(설계 §2 J)와 **새 앱 퀴즈가 같은 팩**을 쓴다(§0-6 — 같은 규격이라
 *   이중 투자가 아니다). 기존 quiz 100행은 '문제|정답' 두 칸이라 보기·버전·태그가 0 —
 *   재사용이 아니라 신작이다(§0-6 실측). 이 파일은 **문항 데이터와 순수 조회만** 든다.
 *   라운드 개설·회전(미노출 우선→최장 미노출)·스냅샷 «조립»은 수집봇(P0 ④)·승격기 몫이다 —
 *   회전은 DB 상태(노출 이력)가 필요해 팩 밖이고, 스냅샷 키는 팩이 만들지 않는다(G1 §6-8
 *   규칙 3과 같은 축 · radio.quiz_round.task_snapshot 의 «값 재료»만 낸다).
 *
 * ■ 🔴 task_ref = `문항id` 그대로 (설계 §10 기각 4 — 접두 변형 금지)
 *   같은 문항이 앱에서 나가든 라디오에서 나가든 같은 id 다 — 접두를 붙여 출처를 가르면
 *   문항 단위 통계가 죽는다. 출처는 `source_kind`·`task_type` 이 진다.
 *
 * ■ 보기 = [{option_id, label}] (L0 §3-2 · C0 §156 — 문구 문자열 금지)
 *   `option_id` 는 **그 판(문항판)의 자리 표기**('o1'~'o4')다 — 행 해석은 각 행이 든
 *   `options_shown` 스냅샷(불변)이 지므로, 판 개정으로 문구·순서가 바뀌어도 옛 행은 자기
 *   보기를 그대로 들고 있다(경계는 행에서 갈린다 — G1 발주 §6-9 와 같은 논리 · 그래서 문구를
 *   고치면 `문항판` 이 오른다). 채팅 `!답 2` 의 「2」는 **자리(1부터)** 다 — 봇·승격기가
 *   `options_shown[자리-1].option_id` 로 해석한다(해석 정본 = lib/라디오채팅파서 `답해석` ·
 *   자리 규칙 = L0 §140 · lib/이벤트검증 ⑦이 자리↔id 일치를 기계로 잡는다).
 *
 * ■ 🔴 `정답` 은 원장까지만 — learning_events 에는 싣지 않는다
 *   정답 공개·60초 재도전 트리거(설계 §0-5)의 재료라 팩과 radio.quiz_round.task_snapshot
 *   에는 있다. 승격 스냅샷에는 안 실린다(C0 🚫is_correct — 정답 여부는 파생 · 이벤트검증
 *   허용 목록이 보기 층만 열어 두어 기계로 막는다).
 *
 * ■ skill_ids — 정본은 engine.skills (L0 §3-5) · 이 팩의 `스킬표`가 첫 시드 재료
 *   engine.skills 는 지금 0행이다. 팩을 만들며 태그를 붙이면 비용 0, 나중이면 100문항 사람
 *   재태깅(§0-6 — 셋 중 가장 늦게 비싸지는 칸). 시드 마이그레이션은 **여기서 미리 짓지
 *   않는다**(base_version 이 남의 조각에 밀려 낡는다 — 안전핀 4종 줄과 같은 이유) — Lane B
 *   승격기 커밋과 한 벌로 가고, 그 커밋의 회귀가 시드 SQL과 이 표를 텍스트로 대조한다
 *   (`functions/events` 가 승격 시 skill_ids 실재를 DB 로 대조하므로 시드가 승격보다 먼저
 *   서야 한다 — index.ts skill_ids 검증 참조). `스킬판` 은 계약 `skill_taxonomy_ver` 의 값.
 *
 * ■ 재도전 = 같은 skill 의 «다른» 문항 (설계 §4-1 retry_of_round_id)
 *   후보 목록은 `같은스킬다른문항()` 이 낸다(순수 · 팩 순서 그대로) — 그 위 회전은 봇 몫.
 *   회귀가 「전 문항에 후보 ≥1」을 못박는다 — 후보 0 인 문항은 재도전이 원리상 못 뜬다.
 *
 * ■ 정답 자리는 문항id 시드 셔플로 굽는다 — 저작 순서를 그대로 내보내지 않는다
 *   저작 튜플의 보기 순서는 사람이 읽기 좋은 순서고, 조립이 문항id 의 FNV 시드로 결정적으로
 *   섞는다(같은 id = 언제나 같은 순서 — 스냅샷 안정). 주기 배치(번호%4)를 쓰지 않는 이유:
 *   회전이 「미노출 우선」이라 방송 노출이 팩 순서를 따라가기 쉽고, 그러면 시청자가 화면에서
 *   1→2→3→4 순환을 학습한다(분리 반박 실측 — 저자 습관도 같은 구멍이다). 회귀가 자리별
 *   분포(각 15~35)와 주기꼴 부재를 기계로 잡는다.
 *
 * ■ 🔴 검수확정 false — 사람 검수(강사/원어민) 전엔 송출 라운드에 못 쓴다
 *   G1 팩의 검수확정과 같은 축이되 **몽골어 병기 축이 아니다** — TOPIK 문항은 한국어가
 *   본질이라 mn 키가 없다(오버레이 안내 문안의 몽골어 병기는 P3 오버레이 몫). 여기서 재는
 *   것은 «정답이 정말 하나뿐인가·문장이 자연스러운가»의 사람 확정이다. 수집봇(④)의 라운드
 *   개설 통로가 이 플래그를 게이트로 삼는 것이 그 커밋의 인수 조건이다(G1 §3 선례).
 *
 * ■ 일부러 뺀 것
 *   🚫 난도·급수 태그 — TOPIK 급수 대응을 지어내지 않는다(교재·급수 담당 몫 · G1 §4 같은
 *      축). 급수 분화는 실측 뒤 판 개정으로. 🚫 해설 — 정답 공개 문안은 오버레이/봇 몫이고
 *      몽골어 검수 의존을 팩에 들이지 않는다. 🚫 듣기·긴 지문 유형 — 오버레이 한 화면에
 *      못 싣는다(§2-J 운영 규칙의 화면 전제).
 *
 * ■ 이 파일은 CJS 다 — 동봉 기전(tools/원격배포.js)의 require풀기가 CJS 전용(G1 ①단계 축).
 *   문항 문구를 고치면 `문항판` 을 올린다 — 회귀가 내용 지문(FNV-1a)과 판을 결속한다.
 */

/** 재귀 동결 — 배열·중첩 객체까지. 얕은 freeze 는 결정성을 못 지킨다(G1 반박 C1 선례). */
function 깊이얼리기(값) {
  if (값 && typeof 값 === 'object' && !Object.isFrozen(값)) {
    Object.freeze(값);
    for (const 속 of Object.values(값)) 깊이얼리기(속);
  }
  return 값;
}

/** 문항판 — 문항 «자체»의 판(스냅샷 모양의 판 `task_schema_ver` 와 별개 · L0 §3-3). */
const 문항판 = '토픽퀴즈.v1';

/** 계약 `skill_taxonomy_ver` 의 값 재료 — 스킬표를 고치면 이 판을 올린다. */
const 스킬판 = 'skills.v1';

/** 사람 검수(정답 유일성·자연스러움) 확정 여부 — 확정 커밋에서만 true. 송출 게이트(④ 인수 조건). */
const 검수확정 = false;

/** engine.skills 시드 재료 (L0 §3-5 — skill_id 는 불변 · 이름이 아니라 ID 로 묶는다).
 *  label_mn 은 몽골어 검수 전이라 **키 자체가 없다**(값 없으면 키 없음 — G1 §6-8 규칙 1). */
const 스킬표 = 깊이얼리기([
  { skill_id: 'skill-ko-grammar-particle-topic', label_ko: '조사 — 은/는·이/가', domain: 'grammar' },
  { skill_id: 'skill-ko-grammar-particle-object', label_ko: '조사 — 을/를', domain: 'grammar' },
  { skill_id: 'skill-ko-grammar-particle-place', label_ko: '조사 — 에·에서', domain: 'grammar' },
  { skill_id: 'skill-ko-grammar-particle-range', label_ko: '조사 — 부터·까지·마다', domain: 'grammar' },
  { skill_id: 'skill-ko-grammar-particle-instrument', label_ko: '조사 — (으)로', domain: 'grammar' },
  { skill_id: 'skill-ko-grammar-particle-companion', label_ko: '조사 — 하고·와/과', domain: 'grammar' },
  { skill_id: 'skill-ko-grammar-particle-dative', label_ko: '조사 — 에게·한테·께', domain: 'grammar' },
  { skill_id: 'skill-ko-grammar-particle-focus', label_ko: '조사 — 만·도·밖에', domain: 'grammar' },
  { skill_id: 'skill-ko-grammar-connective-reason', label_ko: '연결어미 — -아/어서·-(으)니까', domain: 'grammar' },
  { skill_id: 'skill-ko-grammar-connective-contrast', label_ko: '연결어미 — -지만', domain: 'grammar' },
  { skill_id: 'skill-ko-grammar-connective-condition', label_ko: '연결어미 — -(으)면', domain: 'grammar' },
  { skill_id: 'skill-ko-grammar-connective-purpose', label_ko: '연결어미 — -(으)러·-(으)려고', domain: 'grammar' },
  { skill_id: 'skill-ko-grammar-connective-sequence', label_ko: '연결·순서 — -고 나서·전에·후에', domain: 'grammar' },
  { skill_id: 'skill-ko-grammar-tense-past', label_ko: '시제 — 과거(불규칙 포함)', domain: 'grammar' },
  { skill_id: 'skill-ko-grammar-tense-future', label_ko: '시제 — -(으)ㄹ 거예요', domain: 'grammar' },
  { skill_id: 'skill-ko-grammar-tense-progressive', label_ko: '시제 — -고 있다', domain: 'grammar' },
  { skill_id: 'skill-ko-grammar-honorific', label_ko: '높임 — -(으)시-·어휘 높임', domain: 'grammar' },
  { skill_id: 'skill-ko-grammar-negation', label_ko: '부정 — 안·못·-지 않다·-지 마세요', domain: 'grammar' },
  { skill_id: 'skill-ko-expression-ability', label_ko: '표현 — -(으)ㄹ 수 있다/없다', domain: 'expression' },
  { skill_id: 'skill-ko-expression-experience', label_ko: '표현 — -아/어 보다·-(으)ㄴ 적', domain: 'expression' },
  { skill_id: 'skill-ko-expression-desire', label_ko: '표현 — -고 싶다/싶어 하다', domain: 'expression' },
  { skill_id: 'skill-ko-expression-obligation', label_ko: '표현 — -아/어야 하다', domain: 'expression' },
  { skill_id: 'skill-ko-expression-permission', label_ko: '표현 — -아/어도 되다·-(으)면 안 되다', domain: 'expression' },
  { skill_id: 'skill-ko-vocab-verb-collocation', label_ko: '어휘 — 동사 짝(입다·신다·쓰다·켜다)', domain: 'vocab' },
  { skill_id: 'skill-ko-vocab-antonym', label_ko: '어휘 — 반대말', domain: 'vocab' },
  { skill_id: 'skill-ko-vocab-place', label_ko: '어휘 — 장소', domain: 'vocab' },
  { skill_id: 'skill-ko-vocab-time', label_ko: '어휘 — 시간·날짜', domain: 'vocab' },
  { skill_id: 'skill-ko-vocab-family', label_ko: '어휘 — 가족·호칭', domain: 'vocab' },
  { skill_id: 'skill-ko-vocab-counter', label_ko: '어휘 — 단위 명사', domain: 'vocab' },
  { skill_id: 'skill-ko-vocab-adverb', label_ko: '어휘 — 부사·호응', domain: 'vocab' },
]);

/** 지시문 정본 — 유형 셋뿐. 빈칸형은 질문에 `(___)` 하나, 반대말형은 «» 인용, 뜻형은 빈칸 없음. */
const 지시문표 = 깊이얼리기({
  빈칸: '빈칸에 들어갈 말을 고르세요.',
  반대: '«» 안의 말과 뜻이 반대인 것을 고르세요.',
  뜻: '뜻이 같은 문장을 고르세요.',
});

/* 원시 문항 — [문항id, 지시문키, 질문, 보기 라벨 4, 정답 자리(1~4 · 저작 순서 기준), skill_ids].
 * 서빙 순서는 조립이 문항id 시드로 섞고(머리말), option_id 는 서빙 자리 순서로 'o1'~'o4'.
 * ⚠ 오답은 전부 «그 자리에서 문장이 성립하지 않는 것»으로만 골랐다 — 음운(을/를·이/가 꼴),
 *   형태(불규칙 오활용), 호응(별로+긍정), 의미(문맥 모순) 중 하나로 죽는다. 두 개가 자연스러운
 *   문항은 검수(분리 반박)에서 죽이는 것이 이 팩의 첫 인수 조건이다 — 1차 반박이 치명 3
 *   (tq004·tq023·tq070)·경미 16을 잡아 반영했다. 남긴 판정 2: tq029(-아/어서+명령 불가 —
 *   표준 문법 제약이 정답 근거인 것이 정석) · tq039(-(으)려고 하다 는 러/려고 스킬의 정규 범위). */
const 원시 = [
  // ── 조사: 은/는·이/가 ──
  ['tq001', '빈칸', '이 식당에서 뭐(___) 제일 맛있어요?', ['가', '는', '를', '에'], 1, ['skill-ko-grammar-particle-topic']],
  ['tq002', '빈칸', '동생은 키가 커요. 저(___) 키가 작아요.', ['은', '는', '이', '를'], 2, ['skill-ko-grammar-particle-topic']],
  ['tq003', '빈칸', '방 안에 고양이(___) 있어요.', ['를', '을', '가', '의'], 3, ['skill-ko-grammar-particle-topic']],
  ['tq004', '빈칸', '바트 씨(___) 몽골에서 온 유학생이에요.', ['이', '를', '을', '는'], 4, ['skill-ko-grammar-particle-topic']],
  // ── 조사: 을/를 ──
  ['tq005', '빈칸', '주말에 친구하고 영화(___) 봤어요.', ['를', '을', '가', '에'], 1, ['skill-ko-grammar-particle-object']],
  ['tq006', '빈칸', '아침에 빵(___) 먹었어요.', ['를', '을', '이', '에서'], 2, ['skill-ko-grammar-particle-object']],
  ['tq007', '빈칸', '내일 시내에서 친구(___) 만날 거예요.', ['을', '과', '를', '에게'], 3, ['skill-ko-grammar-particle-object']],
  // ── 조사: 에·에서 ──
  ['tq008', '빈칸', '도서관(___) 책을 읽어요.', ['에', '으로', '까지', '에서'], 4, ['skill-ko-grammar-particle-place']],
  ['tq009', '빈칸', '수업이 끝나고 집(___) 가요.', ['에', '를', '이', '과'], 1, ['skill-ko-grammar-particle-place']],
  ['tq010', '빈칸', '책상 위(___) 사전이 있어요.', ['에서', '에', '를', '이'], 2, ['skill-ko-grammar-particle-place']],
  ['tq011', '빈칸', '저는 몽골(___) 왔어요.', ['를', '가', '에서', '하고'], 3, ['skill-ko-grammar-particle-place']],
  // ── 조사: 부터·까지·마다 ──
  ['tq012', '빈칸', '월요일(___) 금요일까지 학교에 가요.', ['까지', '마다', '처럼', '부터'], 4, ['skill-ko-grammar-particle-range']],
  ['tq013', '빈칸', '집에서 학교(___) 걸어서 십 분 걸려요.', ['까지', '부터', '에서', '마다'], 1, ['skill-ko-grammar-particle-range']],
  ['tq014', '빈칸', '토요일(___) 한국어 수업을 들어요.', ['에게', '마다', '처럼', '를'], 2, ['skill-ko-grammar-particle-range']],
  // ── 조사: (으)로 ──
  ['tq015', '빈칸', '젓가락(___) 라면을 먹어요.', ['로', '에서', '으로', '가'], 3, ['skill-ko-grammar-particle-instrument']],
  ['tq016', '빈칸', '이 버스는 시내(___) 가요.', ['으로', '과', '의', '로'], 4, ['skill-ko-grammar-particle-instrument']],
  ['tq017', '빈칸', '사거리에서 왼쪽(___) 도세요.', ['으로', '로', '에', '이'], 1, ['skill-ko-grammar-particle-instrument']],
  // ── 조사: 하고·와/과 ──
  ['tq018', '빈칸', '주말에 친구(___) 같이 등산을 했어요.', ['과', '하고', '에게', '의'], 2, ['skill-ko-grammar-particle-companion']],
  ['tq019', '빈칸', '서점에서 책(___) 공책을 샀어요.', ['와', '를', '과', '에서'], 3, ['skill-ko-grammar-particle-companion']],
  ['tq020', '빈칸', '동생은 저(___) 성격이 많이 달라요.', ['과', '를', '부터', '와'], 4, ['skill-ko-grammar-particle-companion']],
  // ── 조사: 에게·한테·께 ──
  ['tq021', '빈칸', '생일에 친구(___) 선물을 받았어요.', ['한테', '를', '과', '이'], 1, ['skill-ko-grammar-particle-dative']],
  ['tq022', '빈칸', '저는 할머니(___) 안부 전화를 드렸어요.', ['께서', '께', '를', '에서'], 2, ['skill-ko-grammar-particle-dative']],
  ['tq023', '빈칸', '형이 동생(___) 몽골어를 가르쳐 줬어요.', ['이', '가', '에게', '에서'], 3, ['skill-ko-grammar-particle-dative']],
  // ── 조사: 만·도·밖에 ──
  ['tq024', '빈칸', '저는 아침에 커피(___) 마셔요. 다른 것은 안 마셔요.', ['도', '가', '에', '만'], 4, ['skill-ko-grammar-particle-focus']],
  ['tq025', '빈칸', '지갑에 천 원(___) 없어요.', ['밖에', '를', '로', '과'], 1, ['skill-ko-grammar-particle-focus']],
  ['tq026', '빈칸', '저는 유학생이에요. 바트 씨(___) 유학생이에요.', ['를', '도', '에서', '의'], 2, ['skill-ko-grammar-particle-focus']],
  // ── 연결어미: 이유 ──
  ['tq027', '빈칸', '비가 (___) 우산을 썼어요.', ['오지만', '오려고', '와서', '오거나'], 3, ['skill-ko-grammar-connective-reason']],
  ['tq028', '빈칸', '길이 (___) 지하철을 탔어요.', ['막히지만', '막히려고', '막히거나', '막혀서'], 4, ['skill-ko-grammar-connective-reason']],
  ['tq029', '빈칸', '(___) 밖에서 뛰지 마세요.', ['위험하니까', '위험해서', '위험하려고', '위험하거나'], 1, ['skill-ko-grammar-connective-reason']],
  ['tq030', '빈칸', '(___) 약을 먹었어요.', ['감기에 걸리지만', '감기에 걸려서', '감기에 걸리러', '감기에 걸리거나'], 2, ['skill-ko-grammar-connective-reason']],
  // ── 연결어미: 대조 ──
  ['tq031', '빈칸', '한국어는 어렵지만 (___).', ['어려워요', '쉬워요', '재미있어요', '힘들어요'], 3, ['skill-ko-grammar-connective-contrast']],
  ['tq032', '빈칸', '어제는 더웠지만 오늘은 (___).', ['더워요', '더웠어요', '덥습니다', '시원해요'], 4, ['skill-ko-grammar-connective-contrast']],
  ['tq033', '빈칸', '이 옷은 (___) 품질이 좋아요.', ['비싸지만', '비싸지먼', '비싼지만', '비싸시만'], 1, ['skill-ko-grammar-connective-contrast']],
  // ── 연결어미: 조건 ──
  ['tq034', '빈칸', '봄이 (___) 꽃이 피어요.', ['왔지만', '오면', '오거나', '오도록'], 2, ['skill-ko-grammar-connective-condition']],
  ['tq035', '빈칸', '시간이 (___) 전화해 주세요.', ['있면', '있어면', '있으면', '있을면'], 3, ['skill-ko-grammar-connective-condition']],
  ['tq036', '빈칸', '내일 날씨가 (___) 소풍을 갈 거예요.', ['좋도록', '좋지만', '좋거나', '좋으면'], 4, ['skill-ko-grammar-connective-condition']],
  // ── 연결어미: 목적 ──
  ['tq037', '빈칸', '한국어를 (___) 한국에 왔어요.', ['배우러', '배우면', '배워도', '배우지만'], 1, ['skill-ko-grammar-connective-purpose']],
  ['tq038', '빈칸', '점심을 (___) 학생 식당에 가요.', ['먹기', '먹으러', '먹지만', '먹러'], 2, ['skill-ko-grammar-connective-purpose']],
  ['tq039', '빈칸', '내년에 대학교에 (___) 해요.', ['들어가러', '들어가서', '들어가려고', '들어가며'], 3, ['skill-ko-grammar-connective-purpose']],
  ['tq040', '빈칸', '운동화를 (___) 백화점에 갔어요.', ['사면', '사도', '사거나', '사러'], 4, ['skill-ko-grammar-connective-purpose']],
  // ── 연결·순서 ──
  ['tq041', '빈칸', '극장에 들어가기 (___) 휴대폰을 껐어요.', ['전에', '후에', '다음에', '나서'], 1, ['skill-ko-grammar-connective-sequence']],
  ['tq042', '빈칸', '숙제를 다 (___) 후에 게임을 해요.', ['하는', '한', '하기', '할'], 2, ['skill-ko-grammar-connective-sequence']],
  ['tq043', '빈칸', '세수를 하고 (___) 아침을 먹어요.', ['전에', '중에', '나서', '사이에'], 3, ['skill-ko-grammar-connective-sequence']],
  // ── 시제: 과거 ──
  ['tq044', '빈칸', '어제 친구 집에서 김밥을 (___).', ['만들어요', '만들 거예요', '만들고 있어요', '만들었어요'], 4, ['skill-ko-grammar-tense-past']],
  ['tq045', '빈칸', '주말에 공원에서 오래 (___).', ['걸었어요', '걷었어요', '걸랐어요', '걷았어요'], 1, ['skill-ko-grammar-tense-past']],
  ['tq046', '빈칸', '어젯밤에 라디오를 (___).', ['듣었어요', '들었어요', '듣았어요', '들랐어요'], 2, ['skill-ko-grammar-tense-past']],
  ['tq047', '빈칸', '아침에 부모님께 편지를 (___).', ['쓰었어요', '씄어요', '썼어요', '쓸었어요'], 3, ['skill-ko-grammar-tense-past']],
  // ── 시제: 미래 ──
  ['tq048', '빈칸', '내일 가족에게 전화(___).', ['했어요', '하고 있어요', '한 적이 있어요', '할 거예요'], 4, ['skill-ko-grammar-tense-future']],
  ['tq049', '빈칸', '오늘 저녁에 불고기를 (___).', ['먹을 거예요', '먹를 거예요', '먹 거예요', '먹기 거예요'], 1, ['skill-ko-grammar-tense-future']],
  ['tq050', '빈칸', '다음 방학에 무엇을 (___)?', ['했어요', '할 거예요', '하고 있어요', '한 후예요'], 2, ['skill-ko-grammar-tense-future']],
  // ── 시제: 진행 ──
  ['tq051', '빈칸', '지금 동생이 방에서 (___).', ['자었어요', '자고 없어요', '자고 있어요', '잘 고 있어요'], 3, ['skill-ko-grammar-tense-progressive']],
  ['tq052', '빈칸', '지금 밖에 비가 (___).', ['왔고 있어요', '오고 였어요', '올고 있어요', '오고 있어요'], 4, ['skill-ko-grammar-tense-progressive']],
  ['tq053', '빈칸', '어제 친구가 전화했을 때 저는 숙제를 (___).', ['하고 있었어요', '하고 있어요', '할 거예요', '하세요'], 1, ['skill-ko-grammar-tense-progressive']],
  // ── 높임 ──
  ['tq054', '빈칸', '할아버지께서 지금 신문을 (___).', ['봐요', '보세요', '본다', '봐'], 2, ['skill-ko-grammar-honorific']],
  ['tq055', '빈칸', '할머니께서는 매일 아홉 시에 (___).', ['자요', '주무해요', '주무세요', '잠자요'], 3, ['skill-ko-grammar-honorific']],
  ['tq056', '빈칸', '선생님, 여기 앉으셔서 차 좀 (___).', ['먹어요', '먹는다', '먹자', '드세요'], 4, ['skill-ko-grammar-honorific']],
  ['tq057', '빈칸', '교수님께서 지금 연구실에 (___).', ['계세요', '있어요', '이에요', '계시요'], 1, ['skill-ko-grammar-honorific']],
  // ── 부정 ──
  ['tq058', '빈칸', '박물관에서는 사진을 (___) 마세요.', ['찍어', '찍지', '찍고', '찍으러'], 2, ['skill-ko-grammar-negation']],
  ['tq059', '빈칸', '감기에 걸려서 어제 학교에 가지 (___).', ['못해요', '마세요', '못했어요', '못할 거예요'], 3, ['skill-ko-grammar-negation']],
  ['tq060', '빈칸', '이 옷은 별로 (___).', ['비싸요', '비쌉니다', '비싼다', '비싸지 않아요'], 4, ['skill-ko-grammar-negation', 'skill-ko-vocab-adverb']],
  ['tq061', '빈칸', '매운 음식을 전혀 (___).', ['먹지 않아요', '먹어요', '잘 먹어요', '자주 먹어요'], 1, ['skill-ko-grammar-negation', 'skill-ko-vocab-adverb']],
  // ── 표현: 가능 ──
  ['tq062', '빈칸', '저는 몽골 음식을 만들 수 (___).', ['해요', '있어요', '이에요', '돼요'], 2, ['skill-ko-expression-ability']],
  ['tq063', '빈칸', '피아노를 (___) 수 있어요?', ['치는', '치기', '칠', '친'], 3, ['skill-ko-expression-ability']],
  ['tq064', '뜻', '여기에서 사진을 찍을 수 없어요.', ['사진을 찍어야 해요.', '사진을 찍고 싶어요.', '사진을 찍은 적이 있어요.', '사진을 못 찍어요.'], 4, ['skill-ko-expression-ability', 'skill-ko-grammar-negation']],
  // ── 표현: 경험 ──
  ['tq065', '빈칸', '몽골 전통 음식을 (___) 봤어요?', ['먹어', '먹은', '먹기', '먹을'], 1, ['skill-ko-expression-experience']],
  ['tq066', '빈칸', '한복을 (___) 적이 있어요?', ['입어 볼', '입어 본', '입어 보는', '입어 봤'], 2, ['skill-ko-expression-experience']],
  ['tq067', '빈칸', '이 노래를 한번 (___) 보세요. 정말 좋아요.', ['듣어', '들라', '들어', '듣기'], 3, ['skill-ko-expression-experience']],
  // ── 표현: 희망 ──
  ['tq068', '빈칸', '방학에 몽골에 (___) 싶어요.', ['가러', '가서', '가면', '가고'], 4, ['skill-ko-expression-desire']],
  ['tq069', '빈칸', '목이 말라서 시원한 물을 (___).', ['마시고 싶어요', '마셔 싶어요', '마시러 싶어요', '마시게 싶어요'], 1, ['skill-ko-expression-desire']],
  ['tq070', '빈칸', '동생은 새 자전거를 (___).', ['사고 싶해요', '사고 싶어 해요', '사서 싶어 해요', '사면 싶어요'], 2, ['skill-ko-expression-desire']],
  // ── 표현: 의무 ──
  ['tq071', '빈칸', '내일 시험이 있어서 오늘 열심히 공부(___).', ['하야 해요', '해도 해요', '해야 해요', '하러 해요'], 3, ['skill-ko-expression-obligation']],
  ['tq072', '빈칸', '약속 시간을 꼭 (___).', ['지키야 해요', '지켜도 해요', '지킬 해요', '지켜야 해요'], 4, ['skill-ko-expression-obligation']],
  ['tq073', '뜻', '박물관에서는 조용히 해야 해요.', ['박물관에서는 떠들면 안 돼요.', '박물관에서는 떠들어도 돼요.', '박물관에서는 떠들고 싶어요.', '박물관에서는 떠들 수 있어요.'], 1, ['skill-ko-expression-obligation', 'skill-ko-expression-permission']],
  // ── 표현: 허락 ──
  ['tq074', '빈칸', '선생님, 창문을 (___) 돼요? 조금 더워요.', ['열으도', '열어도', '여러도', '열도'], 2, ['skill-ko-expression-permission']],
  ['tq075', '빈칸', '이 자리에 (___) 돼요?', ['앉으도', '안자도', '앉아도', '앉기도'], 3, ['skill-ko-expression-permission']],
  ['tq076', '뜻', '도서관에서 음식을 먹으면 안 돼요.', ['도서관에서 음식을 먹어도 돼요.', '도서관에서 음식을 먹고 싶어요.', '도서관에서 음식을 먹을 수 있어요.', '도서관에서 음식을 먹지 마세요.'], 4, ['skill-ko-expression-permission']],
  // ── 어휘: 동사 짝 ──
  ['tq077', '빈칸', '날씨가 추워서 두꺼운 코트를 (___).', ['입었어요', '썼어요', '신었어요', '했어요'], 1, ['skill-ko-vocab-verb-collocation']],
  ['tq078', '빈칸', '새로 산 운동화를 (___).', ['입었어요', '신었어요', '썼어요', '꼈어요'], 2, ['skill-ko-vocab-verb-collocation']],
  ['tq079', '빈칸', '햇빛이 강해서 모자를 (___).', ['입었어요', '신었어요', '썼어요', '닫았어요'], 3, ['skill-ko-vocab-verb-collocation']],
  ['tq080', '빈칸', '방이 어두워서 불을 (___).', ['껐어요', '열었어요', '닫았어요', '켰어요'], 4, ['skill-ko-vocab-verb-collocation']],
  // ── 어휘: 반대말 ──
  ['tq081', '반대', '이 가방은 아주 «가벼워요».', ['무거워요', '작아요', '얇아요', '짧아요'], 1, ['skill-ko-vocab-antonym']],
  ['tq082', '반대', '형은 키가 «커요».', ['짧아요', '작아요', '좁아요', '낮아요'], 2, ['skill-ko-vocab-antonym']],
  ['tq083', '반대', '오늘은 날씨가 «더워요».', ['따뜻해요', '맑아요', '추워요', '흐려요'], 3, ['skill-ko-vocab-antonym']],
  ['tq084', '반대', '이 옷은 너무 «비싸요».', ['사요', '커요', '많아요', '싸요'], 4, ['skill-ko-vocab-antonym']],
  // ── 어휘: 장소 ──
  ['tq085', '빈칸', '감기약을 사러 (___)에 갔어요.', ['약국', '서점', '문구점', '꽃집'], 1, ['skill-ko-vocab-place']],
  ['tq086', '빈칸', '통장을 만들러 (___)에 가요.', ['극장', '은행', '공원', '미용실'], 2, ['skill-ko-vocab-place']],
  ['tq087', '빈칸', '비행기를 타러 (___)에 가요.', ['기차역', '항구', '공항', '우체국'], 3, ['skill-ko-vocab-place']],
  // ── 어휘: 시간·날짜 ──
  ['tq088', '빈칸', '오늘은 금요일이에요. 내일은 (___)이에요.', ['일요일', '목요일', '월요일', '토요일'], 4, ['skill-ko-vocab-time']],
  ['tq089', '빈칸', '오늘은 5월 5일이에요. 모레는 5월 (___)이에요.', ['7일', '6일', '4일', '8일'], 1, ['skill-ko-vocab-time']],
  ['tq090', '빈칸', '일 년은 모두 (___) 달이에요.', ['열', '열두', '스물', '여덟'], 2, ['skill-ko-vocab-time']],
  // ── 어휘: 가족·호칭 ──
  ['tq091', '빈칸', '아버지의 어머니를 (___)라고 해요.', ['할아버지', '이모', '할머니', '고모'], 3, ['skill-ko-vocab-family']],
  ['tq092', '빈칸', '어머니의 여동생을 (___)라고 해요.', ['고모', '숙모', '언니', '이모'], 4, ['skill-ko-vocab-family']],
  ['tq093', '빈칸', '저는 여학생이에요. 저보다 나이가 많은 남자 형제는 제 (___)예요.', ['오빠', '누나', '이모', '언니'], 1, ['skill-ko-vocab-family']],
  // ── 어휘: 단위 명사 ──
  ['tq094', '빈칸', '가게에서 사과 두 (___) 주세요.', ['명', '개', '마리', '권'], 2, ['skill-ko-vocab-counter']],
  ['tq095', '빈칸', '우리 반에는 학생이 열 (___) 있어요.', ['개', '대', '명', '장'], 3, ['skill-ko-vocab-counter']],
  ['tq096', '빈칸', '고양이 두 (___)를 키워요.', ['명', '권', '켤레', '마리'], 4, ['skill-ko-vocab-counter']],
  // ── 어휘: 부사·호응 ──
  ['tq097', '빈칸', '숙제가 많아서 요즘 (___) 바빠요.', ['아주', '별로', '전혀', '과연'], 1, ['skill-ko-vocab-adverb']],
  ['tq098', '빈칸', '저는 커피를 (___) 마시지 않아요.', ['제일', '전혀', '아주', '방금'], 2, ['skill-ko-vocab-adverb']],
  ['tq099', '빈칸', '버스가 곧 출발해요. (___) 오세요.', ['천천히', '조용히', '빨리', '멀리'], 3, ['skill-ko-vocab-adverb']],
  ['tq100', '빈칸', '어제보다 오늘이 (___) 따뜻해요.', ['자주', '꼭', '아까', '더'], 4, ['skill-ko-vocab-adverb']],
];

/** 서빙 순서 — 문항id 의 FNV-1a 시드로 결정적 Fisher-Yates(머리말 「정답 자리」 문단).
 *  같은 문항id = 언제나 같은 순서. Date/Math.random 없음 — 판이 같으면 스냅샷도 같다. */
function 자리섞기(문항id) {
  let h = 0x811c9dc5;
  const 글 = String(문항id);
  for (let i = 0; i < 글.length; i++) {
    h ^= 글.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const 순서 = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0; // LCG 한 걸음
    const j = h % (i + 1);
    [순서[i], 순서[j]] = [순서[j], 순서[i]];
  }
  return 순서;
}

/* 조립 — 원시 튜플을 정본 모양으로 편다. 모양이 어긋나면 로드에서 죽는다(조용한 결손 금지). */
const 스킬id들 = new Set(스킬표.map((s) => s.skill_id));
const 문항들 = 깊이얼리기(원시.map(([문항id, 지시문키, 질문, 라벨들, 정답자리, skill_ids]) => {
  const 지시문 = 지시문표[지시문키];
  if (!지시문) throw new Error(`지시문키 모름: ${문항id} ${지시문키}`);
  if (!Array.isArray(라벨들) || 라벨들.length !== 4) throw new Error(`보기 4개 아님: ${문항id}`);
  if (!Number.isInteger(정답자리) || 정답자리 < 1 || 정답자리 > 4) throw new Error(`정답 자리 범위 밖: ${문항id}`);
  for (const id of skill_ids) if (!스킬id들.has(id)) throw new Error(`스킬표 밖 태그: ${문항id} ${id}`);
  const 순서 = 자리섞기(문항id);
  const 정답서빙자리 = 순서.indexOf(정답자리 - 1) + 1;
  return {
    문항id,
    지시문,
    질문,
    보기: 순서.map((저작자리, i) => ({ option_id: `o${i + 1}`, label: 라벨들[저작자리] })),
    정답: `o${정답서빙자리}`,
    skill_ids,
  };
}));

/* 내부 색인 — 목록 하나에서 파생한다(두 곳에 적으면 갈라진다). */
const 색인 = new Map(문항들.map((문항) => [문항.문항id, 문항]));

/** 문항 조회 — 없는 id 는 null(지어내지 않는다). 반환값은 동결된 정본 그 객체다. */
function 찾기(문항id) {
  return 색인.get(String(문항id ?? '')) ?? null;
}

/**
 * 재도전 후보 — 같은 skill 을 하나라도 공유하는 «다른» 문항의 id 목록(팩 순서 그대로 · 결정적).
 * 미노출 우선·최장 미노출 회전은 이 목록 위에서 봇이 한다(§2-J — DB 상태는 팩 밖).
 * @returns {readonly string[]|null} 모르는 문항이면 null.
 */
function 같은스킬다른문항(문항id) {
  const 기준 = 색인.get(String(문항id ?? ''));
  if (!기준) return null;
  return 깊이얼리기(문항들
    .filter((q) => q.문항id !== 기준.문항id && q.skill_ids.some((s) => 기준.skill_ids.includes(s)))
    .map((q) => q.문항id));
}

module.exports = { 문항판, 스킬판, 검수확정, 스킬표, 지시문표, 문항들, 찾기, 같은스킬다른문항 };
