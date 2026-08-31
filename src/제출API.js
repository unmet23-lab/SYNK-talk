'use strict';
/**
 * 제출 API — 학생의 발화가 **서버에 닿는** 자리 (C0 §4-1 · §4-2 · S1-b 쓰기 절반).
 *
 * ■ 이 파일이 닫는 것
 *   여기까지 오기 전 학생 발화는 **기기 로컬에만** 남았다(`src/저장.js`). 앱을 지우면 사라지고,
 *   원장·검수자·엔진 어느 쪽도 볼 수 없었다. 「모든 버튼이 학습이 되게」의 첫 버튼이 이 통로다.
 *
 * ■ 순서가 계약이다 — **업로드 먼저, 사건 나중**(C0 §4-2)
 *   반대로 하면 참조가 가리키는 파일이 아직 없는 행이 생긴다. 서버는 그걸 `state:'missing'` 으로
 *   못 박지만(그래서 조용히 지나가진 않는다), 그 행은 나중에 「전사 실패」와 구분되지 않는다.
 *
 * ■ 보내기 전에 **자가검증**한다
 *   `lib/이벤트검증.js` 는 의존성 0 순수 함수라 앱 번들에도 얹힌다. 계약 위반을 왕복 없이 잡고,
 *   무엇보다 **재시도해도 소용없는 실패**(`send_final`)를 여기서 가른다 — 계약 위반은 100번
 *   보내도 계약 위반이라, 안 가르면 몽골 모바일 회선으로 같은 요청이 영원히 나간다.
 *   🔑 계약 JSON 을 넘기지 않는다(28KB 가 번들에 인라인된다 · `src/과제API.js` 참조).
 *   값목록 검사는 서버가 지고, 여기서는 **조합·필수·위조 금지**만 본다.
 *
 * ⚠ `EXPO_PUBLIC_*` 는 번들에 인라인된다 — 여기 있어도 되는 것은 **anon 키뿐**이다.
 */
import { 인증오류 } from './인증API.js';
import { 제출사건 } from '../lib/오늘과제.js';
import { 부르기, 사건보내기 } from './사건통로.js';
import { 음성크기, 음성올리기 } from './저장.js';
/* 🔑 학생이 읽는 글은 여기 안 박는다 — 정본은 `contents/문구_오류.js` 하나다. */
import { 말 } from '../contents/문구_오류.js';

/** 녹음 확장자 → `uploads/sign` 이 받는 content_type. 표에 없으면 올리지 않는다. */
const 타입표 = { m4a: 'audio/m4a', wav: 'audio/wav', aac: 'audio/aac', mp3: 'audio/mpeg' };

/**
 * 녹음 파일을 올리고 그 참조를 받는다 (C0 §4-2).
 * @returns {Promise<string>} `voice/{learner_id}/{uuid}.{ext}`
 */
export async function 음성올려받기(토큰, 경로) {
  const ext = String(경로).split('.').pop().toLowerCase();
  const content_type = 타입표[ext];
  // 모르는 확장자를 짐작해서 올리지 않는다 — 서버가 확장자를 **실제 그것**으로 적기 때문에,
  // 여기서 틀리면 나중에 헤더를 읽는 쪽이 전부 오판하고 그 오판은 파일이 멀쩡해서 안 드러난다.
  if (!content_type) throw new 인증오류('CONTRACT_VIOLATION', 말('err.upload.bad_format', { 채움: { ext } }), false);

  const byte_size = await 음성크기(경로);
  if (!byte_size) throw new 인증오류('NOT_FOUND', 말('err.upload.file_missing'), false);

  const 서명 = await 부르기('uploads/sign', 토큰, { kind: 'audio', content_type, byte_size });
  if (!서명.upload_url || !서명.audio_ref) {
    throw new 인증오류('SERVER_ERROR', 말('err.upload.no_url'), true);
  }
  await 음성올리기(경로, 서명.upload_url, content_type);
  return 서명.audio_ref;
}

/**
 * 로그 항목 하나를 서버로 보낸다. **던지지 않는다** — 결과를 그대로 로그에 적을 수 있게 돌려준다.
 *
 * 🔑 봉투 재료는 **항목이 들고 있다**(`task_meta`). 인자로 「지금 화면의 과제」를 받으면
 *   3일 밀린 항목이 오늘 과제에 붙는다 — 오류 없이, 조회할 때에야 어긋나 보인다.
 *
 * @param {string} 토큰
 * @param {object} 항목   `lib/제출로그.js` 의 항목
 * @returns {Promise<{event_id?: string, 오류?: string, 끝?: boolean}>}
 *   `끝: true` = 다시 보내도 소용없다(계약 위반·폴백 과제).
 */
export async function 발화보내기(토큰, 항목) {
  if (!토큰) return { 오류: 말('err.no_token'), 끝: false };
  /* 🔴 폴백(고정 과제) 날의 발화는 **보낼 수 없다** — 어느 과제에 대한 것인지도, 그때 급수도
   *   앱이 알 길이 없다(C0 §4-3 ①). 지어내면 큐와 안 이어진 행이 조용히 쌓인다.
   *   `끝: true` 로 못 박는다: 그날 배정이 없었다는 사실은 내일 다시 시도해도 바뀌지 않는다. */
  if (!항목.task_meta) return { 오류: 말('err.kept.no_task'), 끝: true };

  let audio_ref = null;
  if (항목.audio) {
    try {
      audio_ref = await 음성올려받기(토큰, 항목.audio);
    } catch (e) {
      // 업로드 실패면 **사건도 안 보낸다** — 텍스트만 먼저 보내면 그 행은 영영 음성 없이 남는다
      // (멱등키가 같아 나중에 성공한 업로드가 그 행을 못 고친다).
      return { 오류: 말('err.upload.failed', { 채움: { 원인: String(e.message || e) } }), 끝: e.retryable === false };
    }
  }

  /* 🔴 사건을 여기서 만들고 **통로에 넘긴다** — 통로가 만들면 재시도마다 새 멱등키가 난다.
   *   자가검증·`duplicate` 해석은 그 통로 하나가 진다(`src/사건통로.js`). */
  const 사건 = 제출사건(항목, audio_ref);
  return 사건보내기(토큰, 사건);
}
