'use strict';
/**
 * 교정 API — 학생이 **받은 교정을 보고 답하는** 자리 (C0 §4-3 ② · P0 §5 S1-8).
 *
 * ■ 이 파일이 닫는 것 — 결과축 생산자 0
 *   `correction.viewed`·`correction.responded` 는 이름(c8)·물리(열+FK+CHECK+트리거)·검증기·
 *   서버 INSERT 까지 **전부 서 있는데 내는 코드가 0줄**이었다(appsscript
 *   `docs/_ops/학습데이터_전층감사.md` 발견 A). 아래층 초록은 왕복시험까지 전부 **합성 사건**의
 *   초록이라 앱이 사건을 안 내도 아무것도 안 깨진다 — 새는 방향은 언제나 통과다.
 *   계약이 스스로 적었듯 결과 변수가 비면 엔진은 **상관만 배우고 처방을 못 배운다**.
 *   🔴 손실은 **학생이 교정을 처음 보는 날** 시작되고 그날 이후는 소급이 없다 — 「봤는지」는
 *   그때만 안다. 그래서 화면 미학보다 이 통로가 먼저다(감사 도전안).
 *
 * ■ 사건은 **여기서 한 번 만들고, 보낼 때 만들지 않는다**
 *   `idempotency_key` 는 항목이 들고 간다(C0 §4-1 · 절단문서 ①-5). 화면은 학생이 누른 순간
 *   사건 객체를 한 번 만들어 쥐고, 재전송은 **그 객체를 그대로** 다시 보낸다 — 그래야 회선이
 *   끊길 때마다 같은 열람이 여러 벌 쌓이지 않는다(서버는 `duplicate` 로 접는다).
 *   ⚠ 천장: 이 사건은 아직 **디스크에 안 남는다.** 앱이 전송 전에 죽으면 그 한 건은 사라진다
 *     (오늘의 손실 100% → 「전송 전에 앱이 죽은 순간」으로 줄어든 것이지 0이 아니다).
 *     윗길은 제출 로그(`talk_log.jsonl`)와 같은 지속 큐이고, 그건 큐를 일반화하는 별건이다.
 *
 * ■ 읽기는 사건을 만들지 않는다 (C0 §4-3 ②)
 *   목록 조회는 `correction.viewed` 를 겸하지 않는다. 겸하면 재시도 한 번이 곧 데이터 오염이고,
 *   무엇보다 **받은 것**과 **본 것**이 같은 값이 되어 결과축이 통째로 뜻을 잃는다.
 *
 * ■ `무시` 판정 — `발주_게임모듈.md` §998 이 「구현 착수 시 앱 1곳에서 확정」으로 미룬 자리
 *   §191 은 「`무시`는 앱이 보내지 않는다 — 무반응은 그냥 이벤트가 없는 것」이라 적었고, 그러면
 *   4모듈 전부에서 `무시` 가 영영 안 들어온다는 것이 §998 의 지적이다. 여기서 확정한다:
 *   **`무시` 는 학생이 「무시」를 실제로 누른 경우에만 실린다.** 근거 — 「안 눌렀다」는 이미
 *   `correction.viewed` 만 있고 `responded` 가 없는 모양으로 남으므로 §191 의 뜻(무반응 = 사건
 *   없음)은 그대로 지켜진다. 반대로 **누른 것은 관측**이라, 안 보내면 관측이 부재로 위장되고
 *   「열어보고 접었다」와 「열어만 봤다」가 영영 한 모양이 된다. 값을 고르는 것은 화면이고
 *   이 파일은 계약 값목록만 지킨다 — 「무시」 버튼을 둘지는 모듈별 연출 판정이다.
 *
 * ⚠ `EXPO_PUBLIC_*` 는 번들에 인라인된다 — 여기 있어도 되는 것은 **anon 키뿐**이다.
 */
import { 인증오류 } from './인증API.js';
import { 계약판 } from './과제API.js';
import { 사건보내기 } from './사건통로.js';
import { 흐름id } from '../lib/제출로그.js';

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * `learner_response` 값목록(계약 §값목록).
 *
 * 🔑 계약 JSON 을 import 하지 않는다 — 28KB 가 번들에 인라인된다(`src/과제API.js` 와 같은 근거).
 *   대신 손 상수를 두고 **`tests/교정API.test.js` 가 정본과 같은지 기계로 묶는다.** 갈라진 채
 *   나가면 증상은 400 `CONTRACT_VIOLATION`(`retryable:false`)이고, 그 응답은 **다시 보내지지도
 *   않는다** — 학생이 누른 답이 조용히 사라진다.
 */
export const 학생응답값 = Object.freeze(['채택', '무시', '수정']);

/**
 * 나에게 온 교정 목록 (C0 §4-3 ②).
 *
 * 🔴 빈 배열은 오류가 아니다 — 교정이 아직 없는 날이 정상이다(`src/과제API.js` 와 같은 규칙).
 * @param {string} 토큰
 * @param {string} [커서] 앞선 응답의 `next_cursor` 를 **그대로** 싣는다(서버가 모양을 본다).
 * @returns {Promise<{목록: object[], 다음커서: string|null, contract_ver: string|null}>}
 */
export async function 교정목록받기(토큰, 커서) {
  if (!URL_ || !ANON) throw new 인증오류('CONFIG', '서버 설정이 없어요', false);

  const 질의 = 커서 ? `?since=${encodeURIComponent(커서)}` : '';
  let r;
  try {
    r = await fetch(`${URL_}/functions/v1/corrections${질의}`, {
      method: 'GET',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${토큰}`,
        'X-Contract-Ver': 계약판,
      },
    });
  } catch {
    // 네트워크 없음은 서버 오류와 **다른 사건**이다 — 다르게 말해야 다시 시도할 수 있다.
    throw new 인증오류('NETWORK', '인터넷 연결을 확인해 주세요', true);
  }

  const 몸 = await r.json().catch(() => ({}));
  if (!r.ok || 몸.ok === false) {
    const e = 몸.error || {};
    throw new 인증오류(e.code, e.message, e.retryable);
  }
  return {
    목록: Array.isArray(몸.data) ? 몸.data : [],
    다음커서: 몸.next_cursor || null,
    contract_ver: 몸.contract_ver || null,
  };
}

/**
 * 교정을 보는 **한 앉음**을 연다 — 그 앉음의 `correlation_id`(P0 §3-1 ④).
 *
 * 🔴 사건마다 새로 짓지 않는다. 한 번에 세 장을 넘겨 본 것과 사흘에 걸쳐 한 장씩 본 것은
 *   끈기·집중 축에서 다른 신호인데, 앉음 키가 없으면 `occurred_at` 정렬로 되짚어야 하고
 *   그 시계는 기기 것이라 못 믿는다(C0 §4-1).
 */
export function 교정앉음() {
  return 흐름id();
}

/**
 * 두 사건의 공통 봉투. 🔴 `correlation_id` 를 지어내지 않는다 — 없으면 **만들지 않는다**.
 * 지어낸 키는 흩어진 것을 「한 앉음」이라고 거짓말하고, 그 거짓은 나중에 못 가려낸다(①-10).
 */
function 봉투(event_type, { correction_id, correlation_id, level_snapshot, occurred_at }) {
  if (!correction_id || !correlation_id) return null;
  return {
    idempotency_key: 흐름id(),
    event_type,
    occurred_at: occurred_at || new Date().toISOString(),
    correlation_id,
    /* 널허용 칸 — 「모른다」와 「앱이 빠뜨렸다」를 가른다(C0 §4-3 ① ⓑ · 유호님 확정 2026-08-07).
     * 교정 화면은 급수를 손에 안 들고 있을 수 있고, 그때 `null` 이 유일하게 정확한 값이다. */
    level_snapshot: level_snapshot === undefined ? null : level_snapshot,
    correction_id,
    payload: { ver: 1 },
  };
}

/**
 * 「이 교정을 봤다」 — S1-8 의 첫 신호. 화면에 카드가 **실제로 뜬 순간** 한 번 만든다.
 * @returns {object|null} 보낼 사건. 재료가 없으면 `null`(=만들지 않는다)
 */
export function 열람사건(재료) {
  return 봉투('correction.viewed', 재료 || {});
}

/**
 * 「이 교정에 이렇게 답했다」 — 결과축의 값이 실리는 유일한 자리.
 * @param {object} 재료  열람사건과 같은 재료 + `학생응답`(계약 값목록 중 하나)
 * @returns {object|null}
 */
export function 응답사건(재료) {
  const r = 재료 || {};
  // 목록 밖 값은 **보내지 않는다.** 보내면 서버가 400 으로 접고 그 답은 재시도도 안 된다.
  if (!학생응답값.includes(r.학생응답)) return null;
  const 사건 = 봉투('correction.responded', r);
  if (!사건) return null;
  사건.payload.learner_response = r.학생응답;
  return 사건;
}

/**
 * 만들어 둔 교정 사건 하나를 보낸다.
 *
 * 🔑 통로는 제출과 **같은 것 하나**(`src/사건통로.js`) — 자가검증과 `duplicate` 해석을
 *   여기 따로 적으면 두 판정이 갈라지고, 갈라진 쪽은 조용히 통과한다.
 * @returns {Promise<{event_id?: string, 오류?: string, 끝?: boolean}>} `끝: true` = 다시 보내도 소용없다
 */
export async function 교정사건보내기(토큰, 사건) {
  return 사건보내기(토큰, 사건);
}
