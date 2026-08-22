/* Storage 경로 규칙 — 정본 L0 §9-3-1 · C0 §4-2 (🔴 소급 불가)
 *
 *   {voice|image}/{learner_id}/{uuid}.{ext}   — **비공개 버킷 1개** 안의 폴더 둘.
 *
 * ■ 왜 이 파일 한 곳인가
 *   경로를 만드는 쪽(`functions/uploads-sign`)과 받아 적는 쪽(`functions/events`)이 규칙을 각자
 *   적으면 갈라진다. 그리고 **갈라지는 방향은 언제나 「통과」다** — 규칙 밖 파일이 조용히 쌓이고,
 *   그 파일은 나중에 규칙을 고쳐도 **안 옮겨진다.** 동의문은 철회 시 「보관 중인 녹음을 모두 삭제」를
 *   약속하는데, 규칙 밖 파일이 하나라도 있으면 그 약속이 그날 거짓이 된다.
 *
 * ■ 왜 learner_id 인가 (student_code 가 아니라)
 *   **안 바뀌기 때문이다.** `SYNK-042` 는 사람이 읽기 쉽지만 재발급되면 옛 코드 밑 파일이 미아가
 *   되고 삭제 보증이 깨진다. 사람이 읽는 몫은 철회 절차 1번이 진다(L0 §9-3-2).
 *
 * ■ 왜 날짜로 안 나누나
 *   `voice/2026/08/` 로 쌓으면 한 학생의 파일이 **모든 달 폴더에 흩어져** 유호님이 손으로 지울 수가
 *   없다. learner 프리픽스면 **폴더 하나를 지우면 끝**이다.
 */
'use strict';

/** 비공개 버킷 이름 — 버킷은 **하나**고 voice·image 는 그 안의 폴더다. */
const 버킷 = 'learner-media';

/** 요청의 `kind` → 첫 칸(폴더). 이 표에 없는 kind 는 받지 않는다. */
const 폴더 = { audio: 'voice', image: 'image' };

/* content_type → 확장자.
 * 🔑 **규격 밖(m4a·aac)도 표에 있다.** C0 §4-2 가 「규격 밖이어도 업로드를 거부하지 않는다」로
 *   못박았기 때문이다 — 거부하면 학생의 발화가 영영 사라지고, 그건 「수집이 채점보다 우선」에
 *   어긋난다. 대신 확장자는 **실제 그것**으로 적는다. m4a 를 `.wav` 로 적어 두면 나중에 헤더를
 *   읽는 쪽이 전부 오판하고, 그 오판은 파일이 멀쩡해서 안 드러난다. */
const 확장자표 = {
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/vnd.wave': 'wav',
  'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a', 'audio/mp4': 'm4a',
  'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/webm': 'webm',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/webp': 'webp',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** kind 와 content_type 이 서로 맞는가 — audio 로 이미지를 올리면 폴더가 어긋난다. */
function 확장자(kind, content_type) {
  const ext = 확장자표[String(content_type || '').toLowerCase().split(';')[0].trim()];
  if (!ext) return null;
  const 앞 = kind === 'audio' ? 'audio/' : 'image/';
  return String(content_type).toLowerCase().startsWith(앞) ? ext : null;
}

/**
 * 규칙대로 경로를 만든다. 규칙 밖이면 `null` 과 이유.
 * @returns {{ref: string|null, 이유: string|null}}
 */
function 경로만들기({ kind, content_type, learner_id, uuid }) {
  if (!폴더[kind]) return { ref: null, 이유: `kind 는 ${Object.keys(폴더).join('|')} 중 하나입니다` };
  if (!UUID.test(String(learner_id || ''))) return { ref: null, 이유: 'learner_id 가 uuid 가 아닙니다' };
  if (!UUID.test(String(uuid || ''))) return { ref: null, 이유: '파일 uuid 가 uuid 가 아닙니다' };
  const ext = 확장자(kind, content_type);
  if (!ext) return { ref: null, 이유: `${kind} 로 받을 수 없는 content_type 입니다: ${content_type}` };
  return { ref: `${폴더[kind]}/${learner_id}/${uuid}.${ext}`, 이유: null };
}

/**
 * 받은 참조가 **이 학생의** 규칙 안 경로인가. `events` 가 저장 전에 쓴다.
 * 🔴 남의 learner_id 밑을 가리키는 참조를 받으면, 그 학생이 철회했을 때 우리 폴더 삭제가
 *   **다른 학생의 행이 가리키던 파일**을 지운다 — 두 사람의 보증이 한 번에 깨진다.
 * @returns {{ok: boolean, 이유: string|null}}
 */
function 경로검사(ref, learner_id) {
  const 칸 = String(ref || '').split('/');
  if (칸.length !== 3) return { ok: false, 이유: '경로는 {voice|image}/{learner_id}/{uuid}.{ext} 세 칸입니다' };
  if (!Object.values(폴더).includes(칸[0])) return { ok: false, 이유: `첫 칸은 ${Object.values(폴더).join('|')} 입니다` };
  if (칸[1] !== learner_id) return { ok: false, 이유: '둘째 칸이 이 학생의 learner_id 가 아닙니다' };
  const m = 칸[2].match(/^(.+)\.([a-z0-9]+)$/i);
  if (!m || !UUID.test(m[1])) return { ok: false, 이유: '파일 이름은 {uuid}.{ext} 입니다' };
  if (!Object.values(확장자표).includes(m[2].toLowerCase())) return { ok: false, 이유: `모르는 확장자입니다: ${m[2]}` };
  return { ok: true, 이유: null };
}

/* ── Storage 를 부르는 법 — 키 형식에 안 매이게 ──────────────────────
 *
 * ■ 🔴 실측 표 (2026-08-22 리허설 · 쓰기=업로드 서명 POST · 읽기=객체 GET)
 *                        Auth 단독      apikey 단독     **둘 다**
 *     레거시 service_role JWT   ✅            ❌ 400        ✅
 *     신형 시크릿 sb_secret_    ❌ JWS오류     ✅            ✅
 *   ⇒ **두 형식 모두 통하는 조합은 「둘 다」 하나뿐이다.** 그래서 여기서 헤더를 만든다.
 *
 * ■ 왜 이 표가 «다시» 필요했나 — 08-06 의 실측이 낡았다
 *   그날은 신형 키가 세 조합 전부 400 이었고(`tools/스토리지키_설정.js` 머리말), 그래서
 *   「통과한 것은 레거시 JWT 뿐」이라는 결론과 `STORAGE_SIGN_KEY` 라는 우회가 섰다.
 *   플랫폼이 그 사이 바뀌었다 — 낡은 실측을 그대로 두면 **폐기일에 업로드가 통째로 죽는다**
 *   (레거시 anon·service_role JWT 는 2026년 말 폐기 예고). 지금 형식에 안 매이게 해 둔다.
 *
 * ■ 🔴 읽기 갈래의 인증 실패는 **`Bucket not found` 로 위장한다**(실측)
 *   401 도 403 도 아니고 「버킷이 없다」로 온다 — 설정 오류처럼 보이는 인증 오류다.
 *   그래서 키 모양을 **부르기 전에** 본다. 안 그러면 사람이 버킷부터 뒤진다.
 */

/** Storage 요청 헤더 — 두 키 형식 모두 통하는 유일한 조합(위 표). */
function 저장소헤더(키) {
  return { apikey: String(키 == null ? '' : 키), Authorization: `Bearer ${키}` };
}

/** 이 키로 Storage 를 부를 수 있나 — 못 부르면 **사유**, 쓸 수 있으면 `null`.
 *
 * 🔴 공개 키(`sb_publishable_…`)는 여기서 막는다 — 그 값은 **학생 앱 번들에 들어 있고**,
 *   Storage 는 그것도 「진짜 키」로 받는다(등급을 게이트웨이가 안 가른다 · `lib/토큰.js` 머리말).
 *   비공개 버킷을 앱에 든 키로 여는 갈래를 만들지 않는다. */
function 저장소키흠(키) {
  const k = String(키 == null ? '' : 키);
  if (!k) return '없음';
  if (k.startsWith('sb_publishable_')) return '공개 키다(비공개 버킷을 열 수 없다)';
  if (k.startsWith('sb_secret_')) return null;          // 신형 시크릿
  if (k.split('.').length === 3) return null;           // 레거시 JWT
  return '모르는 형식이다(레거시 JWT 도 sb_secret_ 도 아니다)';
}

module.exports = { 버킷, 폴더, 확장자표, 확장자, 경로만들기, 경로검사, 저장소헤더, 저장소키흠 };
