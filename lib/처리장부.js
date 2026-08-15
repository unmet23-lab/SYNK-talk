'use strict';
/**
 * 처리 장부 — 건 단위 실패의 «왜» 를 `engine.pipeline_jobs` 에 남긴다.
 * (2026-08-15 · 유호 승인 「전부 진행」 · 조용한 실패 장부 ③)
 *
 * ■ 무엇이 빈칸이었나 (실측 2026-08-15)
 *   `correct/index.ts:423` 에 이렇게 적혀 있었다 — **「영구 실패도 못박을 칸이 없다
 *   (`corrections` 에 상태 열이 없다)」**. 그런데 칸은 **있었다**: `engine.pipeline_jobs` 는
 *   08-06 부터 `last_error text` · `attempt_count int` 를 들고 있고, 저장소 전체에서
 *   **writer 0 · reader 0** 이다(`git grep last_error -- supabase/functions lib tests` = 0건).
 *   작성자가 `corrections` 만 보고 판단했고, 그래서 건 단위 사유는 `console.error` 로만 갔다.
 *   무료 플랜 Edge 로그 보존은 **1일**이라 그 사유는 하루 뒤 흔적이 0이다([[벤더사유]] 머리말).
 *
 * ■ 🔴 `status` 는 **안 건드린다** — 값이 0이고 거짓 표식만 남는다
 *   `job_status` 에 `'failed'` 가 있지만, 그 값을 써도 두 소비자 어디에서도 안 빠진다:
 *     · `correct` 대기조건        `where j.status not in ('discarded','revoked','verified')`
 *     · `engine.review_queue`     같은 차단 목록 (20260809060000_review_c10.sql:125)
 *   즉 「실패로 못박았다」고 적어 놓고 그 행은 큐에도 남고 다음 회차도 다시 집는다.
 *   그렇다고 `failed` 를 **실제로 빠지게** 만들면, 한 번 죽은 발화가 영구 제외된다 — 그건
 *   `correct` 머리말(24~28행)이 명시적으로 금지한 오염이다(설정이 고쳐지는 날 못 집는다).
 *   그래서 이 장부는 **읽는 질의가 0곳인 두 칸만** 만진다. 쓰기가 어떤 동작도 안 바꾼다.
 *   🚫 「failed 를 차단 목록에 넣자」 — 그건 C0/c11 계약 판정이지 이 배선의 몫이 아니다.
 *
 * ■ ⚠ 이 장치의 대가 (CLAUDE.md 신뢰성 맹점 ④ — 새 장치엔 틀릴 때의 모습을 함께 적는다)
 *   ① `last_error` 는 **한 칸**이라 최신 실패가 이전 것을 덮는다. 「세 번 시도해 세 번 다르게
 *      죽었다」는 여기서 원리상 안 보인다 — 그건 회차 장부(④)의 몫이고, 이 파일이 그걸
 *      아는 척하면 안 된다. 여기서 답할 수 있는 것은 「지금 이 건은 왜 못 갔나」 하나다.
 *   ② 장부 쓰기 자체가 실패하면 `'장부실패'` 로만 세고 **사유는 여전히 로그에만** 남는다.
 *      장부가 파이프라인을 죽이는 것보다 낫다는 판단이다(아래 try/catch).
 *   ③ 성공 때도 한 번 UPDATE 한다 — 안 지우면 «이미 성공한 행이 영원히 실패로 보인다»가
 *      되는데, 그게 이 저장소가 반복해 물린 「맞는 얼굴로 틀린 값」이다. 대가는 새로 적힌
 *      교정 1건당 UPDATE 1회(재실행 no-op 에는 안 붙는다 — 부르는 자리가 INSERT 성공 갈래다).
 *   ④ **닫은 장치는 없다.** 이 자리를 덮던 장치가 애초에 0개라 닫을 것이 없다 —
 *      `버림` 계수기는 배치 단위라 남고(과녁이 다르다), 로그는 계약상 1일짜리 보조다.
 *
 * ⚠ 관측 전용이다. 상태도, 봉투의 상태 코드도 바꾸지 않는다.
 */

/** `last_error` 에 적는 길이 상한. 열은 `text` 지만 장부는 로그가 아니다 — 길면 그 자체가 사고다.
 *  벤더 본문은 부르는 쪽이 이미 `.slice(0, 300)` 해서 오므로 여기서 한 번 더 조인다. */
const 사유상한 = 400;

/**
 * 계수 갈래 + 벤더가 말한 한 줄 → `last_error` 한 줄.
 *
 * 🔑 **갈래를 앞에 둔다.** 뒤에 두면 벤더 본문이 상한을 먹어 치우는 날 갈래가 통째로 잘리고,
 *   그러면 「무엇이 죽었나」가 사라진 채 「벤더가 뭐라 했나」만 남는다 — 처방이 안 나온다.
 * 🔑 벤더말이 없어도 **빈손으로 돌아오지 않는다**(갈래만이라도 적는다). 「사유가 없다」와
 *   「못 적었다」가 같은 모양이면 안 된다.
 *
 * @param {string} 갈래 `'벤더_영구:401'` 처럼 이미 계수기에 쓰는 이름
 * @param {string|null} [벤더말] `벤더사유()` 의 산출(없으면 생략)
 * @returns {string|null} 적을 한 줄 · 갈래가 비었으면 null(빈 문자열로 위장하지 않는다)
 */
function 사유줄(갈래, 벤더말) {
  const g = String(갈래 == null ? '' : 갈래).trim();
  if (!g) return null;
  const v = String(벤더말 == null ? '' : 벤더말).trim();
  return (v ? `${g} · ${v}` : g).slice(0, 사유상한);
}

/**
 * 건 하나의 실패 사유를 잡 행에 적는다.
 *
 * 🔴 **던지지 않는다.** 장부는 관측이라, 관측이 실패했다고 이미 성공한 왕복을 되돌리거나
 *   배치를 세우면 안 된다. 못 적은 것은 부르는 쪽이 `'장부실패'` 로 세어 봉투에 드러낸다.
 *
 * @param {Function} sql postgres.js 태그드 템플릿
 * @param {string|null|undefined} submissionId 없으면 `'대상없음'`(배치 줄이 구조적으로 깨져
 *   `custom_id` 를 못 푼 갈래 — 그 실패는 어느 건에도 못 붙인다)
 * @param {string} 갈래
 * @param {string|null} [벤더말]
 * @returns {Promise<'적힘'|'잡없음'|'대상없음'|'장부실패'>} 부르는 쪽이 **이 값을 그대로 센다** —
 *   `적음`(교정을 몇 건 적었나)과 헷갈리지 않게 수동태로 뒀다.
 */
async function 실패적기(sql, submissionId, 갈래, 벤더말) {
  if (!submissionId) return '대상없음';
  const 사유 = 사유줄(갈래, 벤더말);
  if (!사유) return '대상없음';
  try {
    const 쓴것 = await sql`
      update engine.pipeline_jobs
         set last_error = ${사유},
             attempt_count = attempt_count + 1,
             updated_at = now()
       where submission_id = ${submissionId}::uuid
      returning job_id`;
    /* 🔑 0행은 통과가 아니다. 제출은 있는데 잡이 없다 = 생성 트리거(`submissions_enqueue_job`)가
     *   안 돌았다는 뜻이고, 그건 이 실패보다 큰 사고다 — 갈라서 센다. */
    return 쓴것.length > 0 ? '적힘' : '잡없음';
  } catch (e) {
    console.error('[처리장부] 실패 사유를 못 적었다', submissionId, String((e && e.message) || e));
    return '장부실패';
  }
}

/**
 * 건 하나가 **성공했다**는 사실로 장부를 정리한다 — 이전 실패 사유를 지운다.
 *
 * 🔴 안 지우면 「이미 성공한 행이 영원히 실패로 보인다」가 된다. `last_error is not null` 로
 *   찾는 쪽에서 그 행이 계속 잡히고, 그 목록은 **맞는 얼굴로 틀린 값**이다.
 * 🔑 부르는 자리는 **교정행이 실제로 새로 적힌 갈래**뿐이다(INSERT 0행인 재실행에는 안 붙는다) —
 *   안 그러면 매 회차가 모든 행을 한 번씩 더 쓴다.
 *
 * @param {Function} sql
 * @param {string|null|undefined} submissionId
 * @returns {Promise<'적힘'|'잡없음'|'대상없음'|'장부실패'>}
 */
async function 성공적기(sql, submissionId) {
  if (!submissionId) return '대상없음';
  try {
    const 쓴것 = await sql`
      update engine.pipeline_jobs
         set last_error = null,
             attempt_count = attempt_count + 1,
             updated_at = now()
       where submission_id = ${submissionId}::uuid
      returning job_id`;
    return 쓴것.length > 0 ? '적힘' : '잡없음';
  } catch (e) {
    console.error('[처리장부] 성공 정리를 못 했다', submissionId, String((e && e.message) || e));
    return '장부실패';
  }
}

module.exports = { 사유상한, 사유줄, 실패적기, 성공적기 };
