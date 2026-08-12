/* 강사 반 단위 피드백 — 어휘와 검사. (정본 = `docs/강사_반단위_피드백_설계.md` v2 §4·§6)
 *
 * ■ 이 파일이 정본인 것 둘
 *   ① **갈래**(`origin`) — 강사가 보낸 글이 어디서 왔나: AI 문장 그대로 · 고쳤다 · 직접 썼다.
 *   ② **처분**(`disposition`) — 그 산출물을 어떻게 할까: 확인 · 다시 해보자.
 *   DB CHECK 는 이 목록의 **사본**이다(마이그 `20260812210000_teacher_notes_c11`). SQL 에는
 *   include 가 없어 사본을 없앨 수 없으니, 없앨 수 없는 사본은 기계에 문다 —
 *   `tests/반피드백.test.js` 가 두 소스를 글자로 대조한다. 갈리면 증상이 조용하다:
 *   JS 는 통과시키고 DB 가 거절하며, 강사 화면엔 「저장이 안 된다」로만 보인다.
 *
 * ■ 🔴 갈래를 «지금» 두는 이유 — 설계 §6 도전안이 아직 ⏳유호님 판정이다
 *   「피드백의 기본 동작이 쓰기냐 고르기냐」는 취향·교육관이라 내가 안 정한다. 그런데 그 답이
 *   무엇이든 **행에 갈래를 안 적어 두면 이미 쌓인 것의 갈래는 영원히 복원 못 한다.**
 *   그래서 물리와 어휘는 셋 다 지금 세우고, 답이 나면 **화면 버튼 구성만** 갈린다.
 *
 * ■ 🚫 여기 없는 것
 *   `actor_kind` 값(설계 §2 — 강사는 `corrections` 에 안 쓴다) · 점수·등급·정렬 축
 *   (설계 §5 — 정렬 축이 곧 비교다. 학생끼리 비교하지 않는다 · 철학 ㉢).
 */
'use strict';

/** 강사가 보낸 글의 출처. 화면 버튼 셋과 1:1 이다. */
const 갈래 = ['as_is', 'edited', 'written'];

/** 그 산출물의 처분. 화면 버튼 둘과 1:1 이다. */
const 처분 = ['confirmed', 'retry'];

/* 한 마디 길이 상한. 회고 사유(400)보다 길게 잡는다 — 저건 라벨에 붙는 메모고 이건 학생이
 * 읽는 글 자체다. ⚠ 상한이 없으면 화면이 아니라 **DB 가** 거절하고, 그 거절은 강사에게
 * 「저장이 안 된다」로만 보인다(어디까지 줄여야 하는지 알 길이 없다). */
const 본문상한 = 600;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** uuid 한 칸을 읽는다. 모양이 아니면 null — 지어내지 않는다. */
function uuid읽기(값) {
  const s = typeof 값 === 'string' ? 값.trim() : '';
  return UUID.test(s) ? s.toLowerCase() : null;
}

/**
 * `POST feedback/give` 본문 검사.
 *
 * 🔑 **거절을 한 자리에 모은다** — 라우트마다 검사하면 새 라우트가 하나를 빠뜨리고, 빠진
 *   방향은 언제나 「통과」다. 통과하면 값목록 밖 문자열이 DB CHECK 에 가서 500 이 된다
 *   (400 이어야 할 것이 500 으로 나오면 호출자는 재시도한다).
 *
 * @returns {{거절: string, 문구: string, 칸: string} | {값: {submission_id: string, body: string, origin: string, disposition: string}}}
 */
function 한마디검사(몸) {
  const 본 = 몸 && typeof 몸 === 'object' ? 몸 : {};

  const submission_id = uuid읽기(본.submission_id);
  if (!submission_id) {
    return { 거절: 'CONTRACT_VIOLATION', 문구: 'submission_id 가 uuid 가 아닙니다', 칸: 'submission_id' };
  }

  /* ⚠ `trim` 뒤로 재는 이유 — 공백만 든 글은 DB CHECK(`btrim(body) <> ''`)가 거절하는데,
   *   여기서 안 막으면 그 거절이 500 으로 나온다. 재는 층과 막는 층을 같게 둔다. */
  const body = typeof 본.body === 'string' ? 본.body.trim() : '';
  if (!body) {
    return { 거절: 'CONTRACT_VIOLATION', 문구: '한 마디가 비어 있습니다', 칸: 'body' };
  }
  if (body.length > 본문상한) {
    return {
      거절: 'CONTRACT_VIOLATION',
      문구: `한 마디는 ${본문상한}자까지입니다(지금 ${body.length}자)`,
      칸: 'body',
    };
  }

  const origin = typeof 본.origin === 'string' ? 본.origin : '';
  if (!갈래.includes(origin)) {
    return { 거절: 'CONTRACT_VIOLATION', 문구: `origin 은 ${갈래.join('·')} 중 하나입니다`, 칸: 'origin' };
  }

  const disposition = typeof 본.disposition === 'string' ? 본.disposition : '';
  if (!처분.includes(disposition)) {
    return { 거절: 'CONTRACT_VIOLATION', 문구: `disposition 은 ${처분.join('·')} 중 하나입니다`, 칸: 'disposition' };
  }

  return { 값: { submission_id, body, origin, disposition } };
}

/**
 * 반 카드 한 장의 «지금» 한 줄 (설계 §5 ⓑ — 목록이 아니라 카드다).
 *
 * 🔴 **여기서 나가는 것에 점수·등수·평균이 없다.** 카드에 실을 수 있는 수는 두 개뿐이다:
 *   반 인원(👥)과 내 일감의 수(●). 기다린 시간은 학생의 속성이 아니라 **내 일감의 나이**라
 *   비교가 아니다 — 그 축을 성적으로 바꾸는 순간 이 화면이 등수표가 된다(철학 ㉢).
 *
 * @param {{학생수: number, 기다림: number}} 반
 */
function 카드요약(반) {
  const 학생수 = Number(반 && 반.학생수) || 0;
  const 기다림 = Number(반 && 반.기다림) || 0;
  return {
    학생수,
    기다림,
    /* 「다 봤다」와 「반이 비었다」를 가른다 — 같은 `● 0` 으로 접으면 강사가 빈 반을 보고
     * 「내가 다 봤구나」로 읽는다. 빈 반이 정상 상태라는 것은 §8-1 이 이미 못박았다. */
    모양: 학생수 === 0 ? 'empty' : 기다림 > 0 ? 'waiting' : 'clear',
  };
}

module.exports = { 갈래, 처분, 본문상한, uuid읽기, 한마디검사, 카드요약 };
