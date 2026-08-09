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

/* 저신뢰의 경계는 여기 안 적는다 — 정본은 `lib/검수확정.js 저신뢰문턱` 하나다. 생산자가
 * 자기 문턱을 들면 「무엇을 저신뢰로 칠할까」가 두 곳에서 갈리고, 갈린 증상은 **화면이 칠한
 * 구간과 서버가 요구하는 문턱이 다른데 아무도 안 빨간 것**이다. 여기서는 재료만 낸다. */

/**
 * Whisper `verbose_json` 의 `segments` → `submissions.stt_segments` · `.stt_confidence`.
 *
 * ■ 이 함수가 닫는 것 — 생산자 0
 *   `stt_segments` 는 열(c6)·검수 큐 select·소비자 **셋**(구간 칩 `src/검수화면.js` · 청취
 *   게이트 ① `청취문턱` · 저신뢰 문턱 `세그먼트펴기`)까지 다 서 있는데 **쓰는 코드가 0줄**이었다
 *   (2026-08-09 실측). 그래서 게이트 ①의 문턱은 언제나 하한 3초였고, 그것은 「게이트가 선다」가
 *   아니라 **0초 승인만 막는 상태**다(`lib/검수확정.js` 머리말이 정직하게 적어 둔 자리).
 *   🔑 재료가 없어서가 아니었다 — `transcribe` 는 이미 `response_format=verbose_json` 을 요청해
 *   세그먼트를 **받고 있었고**, `전사값` 이 `text` 만 꺼내며 나머지를 버렸다.
 *
 * ■ 🔴 벤더 원값을 지우지 않는다 — 파생은 **곁에** 적는다
 *   `avg_logprob`·`no_speech_prob` 를 그대로 싣는다(검수의뢰_엔진수집설계 §228 이 적은 모양).
 *   파생만 남기면 나중에 신뢰도 해석을 고칠 때 옛 행을 다시 계산할 수 없고, 그 손실은 소급
 *   불가다. 반대로 원값만 남기면 소비자가 각자 해석해 갈린다 — 그래서 **둘 다** 적는다.
 *
 * ■ 🔴 `confidence` 는 설계 §228 목록에 **없는데** 소비자가 그 키를 읽는다
 *   `세그먼트펴기` 는 `조각.confidence` 만 보고, 없으면 「안 잰 것」으로 쳐서 저신뢰가 원리상
 *   0이 된다. 즉 문서가 적은 모양 그대로 저장하면 **생산자를 세워도 게이트는 그대로 0** 이고,
 *   증상은 「초록인데 아무것도 안 걸린다」 하나뿐이다. 그래서 설계 모양의 **상위집합**으로 낸다.
 *
 * ■ 신뢰도 = `exp(avg_logprob)` — 지어낸 눈금이 아니다
 *   `avg_logprob` 은 그 구간 토큰 로그확률의 평균이라, 지수를 취한 값이 곧 **토큰 확률의
 *   기하평균**이다(0~1). 눈금을 새로 만든 것이 아니라 벤더 값의 정의를 그대로 옮긴 것이다.
 *   🚫 `no_speech_prob` 를 여기 섞지 않는다 — 섞으면 두 값의 가중치가 **실측 없이 정해진 상수**가
 *      되고, 그 상수는 「신뢰도」라는 이름 뒤에 숨어 다시는 안 재진다. 원값으로 실어 두었으니
 *      무음 판정이 필요해지는 날 그때 재서 정한다.
 *
 * ■ 무발화·형식 밖을 가른다 (`전사값` 과 같은 축)
 *   무음 녹음에서 Whisper 는 `segments: []` 를 준다 — 그건 **값이다**(`[]` 로 적는다).
 *   `segments` 가 배열이 아니면 우리가 아는 모양이 아니므로 `null` 을 내고, 부르는 쪽은
 *   그 칸을 **안 건드린다**(0 이나 `[]` 로 적으면 「쟀는데 없었다」로 거짓말이 된다).
 *
 * @param {unknown} 본문 Whisper `verbose_json` 응답
 * @returns {{stt_segments: object[], stt_confidence: number|null}|null} null = 세그먼트 형식 밖
 */
function 세그먼트값(본문) {
  if (!본문 || typeof 본문 !== 'object') return null;
  const 원본 = 본문.segments;
  if (!Array.isArray(원본)) return null;

  const 조각들 = [];
  for (const s of 원본) {
    if (!s || typeof s !== 'object') continue;
    const 시작 = Number(s.start);
    const 끝 = Number(s.end);
    /* 시간에 못 놓는 조각은 어느 소비자에게도 쓸모가 없고, 남겨 두면 아래 길이 가중이
     * 정의되지 않는다. **버리는 것도 판정이라** 조용히 안 버린다 — 개수 차이는 원 응답과
     * 대조하면 드러난다(우리가 지어낸 조각은 하나도 없다). */
    if (!Number.isFinite(시작) || !Number.isFinite(끝) || 끝 <= 시작) continue;
    const lp = Number(s.avg_logprob);
    const 신뢰 = Number.isFinite(lp) ? Math.min(1, Math.max(0, Math.exp(lp))) : null;
    조각들.push({
      start: 시작,
      end: 끝,
      text: typeof s.text === 'string' ? s.text : null,
      avg_logprob: Number.isFinite(lp) ? lp : null,
      no_speech_prob: Number.isFinite(Number(s.no_speech_prob)) ? Number(s.no_speech_prob) : null,
      /* 파생. 원값(`avg_logprob`)이 바로 위에 있어 언제든 다시 계산된다. */
      confidence: 신뢰,
    });
  }

  return { stt_segments: 조각들, stt_confidence: 발화신뢰도(조각들) };
}

/**
 * 발화 하나의 신뢰도 — 구간 **길이로 가중한** 평균. 재료가 없으면 `null`.
 *
 * 🔑 단순 평균이 아니다: 0.3초짜리 추임새와 12초짜리 문장이 같은 무게를 가지면, 짧은 조각이
 *   많은 더듬는 발화일수록 값이 그 조각들 쪽으로 끌려간다 — 정확히 우리가 **잘 재야 할** 발화다.
 * 🔴 신뢰도를 못 읽은 조각은 분모에서도 뺀다. 0 으로 접으면 「안 쟀다」가 「나빴다」가 되고,
 *   그 오독은 검수 우선순위를 조용히 뒤집는다.
 */
function 발화신뢰도(조각들) {
  let 무게 = 0; let 합 = 0;
  for (const s of 조각들) {
    if (s.confidence === null) continue;
    const w = s.end - s.start;
    무게 += w;
    합 += s.confidence * w;
  }
  if (무게 <= 0) return null;
  /* 열이 `numeric(6,3)` 이라 세 자리를 넘겨 봐야 DB 가 반올림한다 — 여기서 맞춰 두면
   * 우리가 적은 값과 DB 에 있는 값이 같다(다르면 대조가 매번 거짓 불일치를 낸다). */
  return Math.round((합 / 무게) * 1000) / 1000;
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

module.exports = { 상태, 전사대상, 전사값, 세그먼트값, 전사실패, 최대글자 };
