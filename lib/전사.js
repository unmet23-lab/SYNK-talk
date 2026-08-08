/* 전사(STT) 판정 — `submissions.transcript` 를 채우는 배치의 **머리**. (P0 §6-4 · L0 §9-2)
 *
 * ■ 왜 지금 서나 — 이 칸은 열·자물쇠·검수판 22열까지 다 서 있는데 **채우는 코드가 0줄**이었다
 *   `transcript` 는 트리거로 덮어쓰기까지 막아 두었고 검수 큐가 그 열을 그린다. 그런데 값을
 *   넣는 코드가 저장소 전체에 없어서, 검수자는 **오디오만** 받는다(비원어민 전사 계수 =
 *   오디오 1분당 4~6분 · `검수의뢰_엔진수집설계` 실측). AI 교정 1차안도 텍스트가 없으면 못 돈다.
 *   즉 이 빈칸 하나가 「반자동 10행 = 여기가 해자다」의 입구를 통째로 막고 있었다.
 *
 * ■ 왜 배치인가 (동기 아님)
 *   P0 §6-4 강등표가 정한 그대로다 — 「`transcript_state=pending` 으로 두고 나중에 재실행 ·
 *   저장은 영향 없음」. 제출 응답 안에서 전사하면 학생이 몽골 회선으로 25MB 를 올린 **뒤에**
 *   다시 수 초~수십 초를 기다리고, STT 벤더가 죽는 날엔 **제출 자체가 실패한다.**
 *   수집이 최우선인 제품에서 그건 가장 비싼 교환이다.
 *
 * ■ 🔴 두 칸의 뜻을 뒤집지 않는다 (L0 §9-2 · P0 §5)
 *   여기서 채우는 것은 **기계 전사(`transcript`)** 뿐이다. 사람이 「들린 대로」 되돌린 값은
 *   `transcript_verified` 로 가고, 두 칸의 diff 가 곧 ASR 오류 학습쌍이다. Whisper 는 오발음을
 *   표준어로 **고쳐 듣는다**(「작다」→「적다」) — 한 칸에 합치면 파인튜닝의 **입력 쪽(학생의
 *   실제 오류)이 소실**된다. 그래서 DB 트리거가 `transcript` 의 덮어쓰기를 막고, 이 파일은
 *   **null → 값 첫 채움**만 한다.
 */
'use strict';

/** `transcript_state` 값 목록 — 정본은 여기 하나다(계약에 CHECK 는 아직 안 건다: writer 가 오늘 처음 선다). */
const 상태 = Object.freeze({
  대기: 'pending',   // 전사 대상인데 아직 안 돌았다 — 배치가 집어 갈 행
  기계: 'machine',   // 기계 전사가 들어왔다(무발화면 빈 문자열 · 아래 `전사값` 참조)
  실패: 'failed',    // 🔴 **재시도해도 같은** 실패만 여기로 온다(아래 `전사실패` 참조)
});

/**
 * 이 제출은 전사 대상인가 — `functions/events` 가 INSERT 시점에 한 번 정한다.
 *
 * 🔑 **분모를 여기서 만든다.** 안 적으면 「아직 전사 안 함」과 「전사 대상이 아님」이 둘 다
 *   `null` 로 같은 모양이 되고, 그러면 「몇 건이 전사를 기다리나」를 영원히 못 센다(F207 —
 *   미실행은 통과와 같은 모양으로 온다).
 * ⚠ `missing` 만 제외한다 — 파일이 없다고 ingest 가 못박은 행이라(C0 §4-2 파수꾼) 전사가
 *   원리상 불가능하고, pending 으로 두면 배치가 매일 집어 가 영원히 실패한다.
 *   `unmeasured`(측정 키 누락·fetch 실패)는 **파일이 없다는 뜻이 아니라 모른다는 뜻**이라
 *   대기로 둔다: 못 잰 날의 발화를 통째로 영구 미전사로 만드는 쪽이 훨씬 비싸다.
 *
 * @param {string|null|undefined} audio_ref
 * @param {unknown} server  `capture_meta.server`(`lib/음성헤더.js` 가 잰 봉투)
 * @returns {string|null} `상태.대기` 또는 null
 */
function 전사대상(audio_ref, server) {
  if (typeof audio_ref !== 'string' || !audio_ref) return null;
  const state = server && typeof server === 'object' ? server.state : null;
  if (state === 'missing') return null;
  return 상태.대기;
}

/* 전사 상한 — Whisper 는 이보다 긴 글을 낼 수 없다(오디오 25MB 상한 · 발화 수십 초).
 * 이 수를 넘는 응답은 **벤더가 딴것을 돌려준 것**이라, 검수판에 붓기 전에 여기서 끊는다. */
const 최대글자 = 20000;

/**
 * Whisper `verbose_json` 응답 → 저장할 전사 문자열.
 *
 * 🔑 **무발화는 실패가 아니다.** 학생이 아무 말도 안 한 녹음은 실제로 나오고(`session.abandoned`
 *   가 못 잡는 「눌렀는데 안 말함」), 그때 Whisper 는 빈 `text` 를 준다. 그것을 실패로 접으면
 *   그 행은 매일 재시도되고 「전사했더니 비어 있었다」는 관측은 영영 안 남는다. 그래서 빈
 *   문자열도 **값으로** 적는다 — `null`(아직 안 함)과 `''`(해 봤더니 없음)이 갈려야 한다.
 * ⚠ 그러니 이 함수가 null 을 주는 것은 **응답이 우리가 아는 모양이 아닐 때**뿐이다.
 *
 * @returns {{transcript: string, 언어: string|null}|null} null = 응답 형식 밖
 */
function 전사값(본문) {
  if (!본문 || typeof 본문 !== 'object') return null;
  if (typeof 본문.text !== 'string') return null;
  const t = 본문.text.trim();
  if (t.length > 최대글자) return null;
  return { transcript: t, 언어: typeof 본문.language === 'string' ? 본문.language : null };
}

/**
 * 벤더 실패를 「못박을 것」과 「다음에 다시」로 가른다.
 *
 * 🔴 **`failed` 는 재시도해도 같은 것에만 쓴다.** 이 판정이 느슨하면 키가 하루 늦게 오거나
 *   레이트 리밋이 한 번 걸린 날의 발화가 전부 `failed` 로 못박히고, 그 행은 두 번 다시 안
 *   집어진다 — 원본 음성은 남지만 **자동 통로에서는 영구 소멸**한 것과 같다.
 *   그래서 기본값은 「다시」이고, 못박는 것은 파일 자체가 벤더를 못 지나는 경우뿐이다.
 * ⚠ 401·403 을 `failed` 로 접지 않는다 — 그건 **우리 설정 문제**지 그 발화의 문제가 아니다.
 *
 * @param {number} status HTTP 상태
 * @returns {{state: string|null, 재시도: boolean}} state=null 이면 행을 **그대로 둔다**(pending 유지)
 */
function 전사실패(status) {
  // 400/422 = 벤더가 이 파일을 원리상 못 읽는다(형식·길이). 내일도 같다.
  if (status === 400 || status === 422) return { state: 상태.실패, 재시도: false };
  // 나머지 전부(401·403 키 · 429 레이트 · 5xx 일시 · 네트워크)는 **행을 안 건드린다.**
  return { state: null, 재시도: true };
}

module.exports = { 상태, 전사대상, 전사값, 전사실패, 최대글자 };
