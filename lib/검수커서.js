/* 검수 큐의 **순서와 쪽** — 순수 규칙만 (docs/검수_내부계약.md §3).
 *
 * ■ 왜 배선(Edge Function)이 아니라 여기 사나
 *   이 규칙이 틀리면 증상이 **「화면이 잘 돈다」**다. 쪽 경계에서 한 건이 조용히 빠지거나
 *   같은 건이 두 번 오는데, 검수자는 자기가 못 본 발화가 있다는 것을 알 방법이 없다 —
 *   큐는 **줄어드는 목록**이라 「어제 19건이었는데 오늘 18건」이 정상이기 때문이다.
 *   배선 안에 두면 회귀가 문자열로만 닿고, 문자열로 닿는 검사는 다음 개정에서 조용히 죽는다.
 *
 * ■ 정렬 축은 셋인데 **방향이 섞여 있다** (§3 「감사 표본 우선 혼입 + 저신뢰 낮은 순」)
 *     is_audit_sample desc, stt_confidence asc nulls last, occurred_at asc
 *   그런데 keyset 페이지네이션의 행 비교(`(a,b,c) > (…)`)는 **한 방향**만 잇는다. 방향이
 *   섞이거나 null 이 섞이면 그 비교는 조용히 틀리거나(경계 유실) null 이 되어 **0행**이 된다.
 *   🔑 그래서 축을 **전부 오름차순으로 편다** — 그 변환이 이 파일의 전부다:
 *     ① `not is_audit_sample`      → false(감사 표본)가 앞
 *     ② `stt_confidence is null`   → false(잰 것)가 앞  ＝ nulls last
 *     ③ `coalesce(stt_confidence,0)` → 낮은 순 (②가 true 인 구간에선 전부 0이라 무해)
 *     ④ `occurred_at`              → 오래된 것부터
 *     ⑤ `submission_id`            → 동점을 가르는 **안정 키**
 *   ⑤가 없으면 같은 초에 선 둘이 쪽 경계에서 갈릴 때 한 건이 사라진다(`corrections` 커서가
 *   이미 물린 자리 · 거긴 append-only 라 되짚기라도 됐다).
 *
 * ■ offset 을 쓰지 않는 이유
 *   큐는 확정·폐기가 일어나는 **동안** 줄어든다. offset 은 그 사이 앞쪽이 빠지면 뒤 쪽에서
 *   건너뛴다 — 검수자가 한 번도 못 본 항목이 생기고 증상이 없다.
 */
'use strict';

const 기본쪽 = 10;
const 최소쪽 = 1;
const 최대쪽 = 20;

/** 쪽 크기 — `?limit=` (계약 §3 · 1~20 · 기본 10).
 *
 *  🔴 **범위 밖을 조용히 자르지 않는다.** `limit=1000` 을 20 으로 깎아 주면 읽는 쪽은
 *    「20건이 전부」로 읽는다 — 잘린 것과 없는 것이 같은 모양이 된다. 400 으로 되돌린다.
 *  @returns {{값: number|null, 이유: string|null}}
 */
function 쪽크기(raw) {
  if (raw === null || raw === undefined) return { 값: 기본쪽, 이유: null };
  if (!/^\d+$/u.test(String(raw))) {
    return { 값: null, 이유: `limit 은 1~${최대쪽} 의 정수입니다` };
  }
  const n = Number(raw);
  if (n < 최소쪽 || n > 최대쪽) {
    return { 값: null, 이유: `limit 은 ${최소쪽}~${최대쪽} 입니다(받은 값 ${n})` };
  }
  return { 값: n, 이유: null };
}

/* 커서 = `<감사 0|1>|<신뢰도 또는 빈칸>|<ISO 시각>|<uuid>`.
 * 🔑 정렬키를 **전부** 싣는다 — 하나라도 빠지면 그 축의 경계에서 되짚을 수가 없다.
 *   신뢰도 칸이 비면 「안 잰 것」(null)이다. 0.000 과 다르다 — 0 으로 적으면 「신뢰도 0」이
 *   되어 안 잰 행이 맨 앞으로 올라온다(뷰가 nulls last 로 밀어 둔 것을 커서가 되돌린다). */
const 커서꼴 = /^([01])\|(\d+(?:\.\d+)?)?\|([^|]+)\|([0-9a-fA-F-]{36})$/u;

/** 앞선 응답의 `next_cursor` 를 되읽는다. 없으면 `{값:null, 이유:null}`(첫 쪽).
 *  @returns {{값: {감사:boolean, 신뢰:string|null, 시각:string, id:string}|null, 이유: string|null}}
 */
function 커서읽기(raw) {
  if (raw === null || raw === undefined) return { 값: null, 이유: null };
  const m = 커서꼴.exec(String(raw));
  /* 🔴 모양을 **여기서** 본다. 안 보면 `cursor=어제` 가 Postgres 까지 내려가 `22007` 로 죽고,
   *   400 이어야 할 것이 500 이 된다 — 5xx 는 `retryable` 이라 앱이 영구 오류를 무한 재시도한다
   *   (`corrections` 가 같은 자리를 이미 못박았다). */
  if (!m || !Number.isFinite(Date.parse(m[3]))) {
    return { 값: null, 이유: 'cursor 는 앞선 응답의 next_cursor 를 그대로 실어야 합니다' };
  }
  return { 값: { 감사: m[1] === '1', 신뢰: m[2] ?? null, 시각: m[3], id: m[4] }, 이유: null };
}

/** 그 쪽의 **마지막 행**을 다음 커서로 굳힌다. 행이 없으면 `null`.
 *
 *  ⚠ `stt_confidence` 는 `numeric(6,3)` 이라 postgres.js 가 **문자열**로 준다 — 그대로 싣는다.
 *    Number 로 접으면 `1.000` 이 `1` 이 되고, 그 값이 되돌아올 때 비교는 여전히 맞지만
 *    커서 문자열이 판마다 달라져 「같은 쪽인데 다른 커서」가 로그에 남는다. */
function 커서만들기(행) {
  if (!행) return null;
  const 시각 = 행.occurred_at instanceof Date ? 행.occurred_at : new Date(행.occurred_at);
  if (!Number.isFinite(시각.getTime())) return null;
  const 신뢰 = 행.stt_confidence === null || 행.stt_confidence === undefined ? '' : String(행.stt_confidence);
  return `${행.is_audit_sample ? 1 : 0}|${신뢰}|${시각.toISOString()}|${행.submission_id}`;
}

/** 커서를 **SQL 이 그대로 비교할 튜플**로 편다(머리말 ①~⑤ · 전부 오름차순).
 *  🔑 이 변환이 한 곳에 있어야 `order by` 와 `where` 가 같은 축을 쓴다 — 갈라지면 그 쪽만
 *    조용히 비고, 증상은 「그 검수자에게만 큐가 짧다」다. */
function 커서키(값) {
  if (!값) return null;
  return {
    감사키: !값.감사,                       // false 가 앞 = 감사 표본 우선
    널키: 값.신뢰 === null,                 // false 가 앞 = 잰 것 우선(nulls last)
    신뢰키: 값.신뢰 === null ? '0' : 값.신뢰,
    시각: 값.시각,
    id: 값.id,
  };
}

/* ── 반 모드 커서 (검수_내부계약 §3-2 · 숙제서클 §10-3) ──────────────────────
 * 반 모드의 정렬은 감사·저신뢰가 아니라 **교사의 동선**이다: 조 → 좌석 → 시각.
 * 교사는 조 옆에 앉아 그 조 4명의 초안을 순서대로 넘긴다(설계 §4) — 저신뢰 우선으로 섞으면
 * 화면이 조를 건너뛰며 뛰고, 교사는 눈앞의 학생과 다른 조의 초안을 보게 된다.
 * 축은 여기도 **전부 오름차순으로 편다**(기본 커서와 같은 이유 · nulls last 둘):
 *   ① `group_no is null`        → false(조 있음)가 앞 — 편성 전 학생은 맨 뒤
 *   ② `coalesce(group_no, 0)`   → 1조부터
 *   ③ `seat_no is null`         → false(좌석 있음)가 앞
 *   ④ `coalesce(seat_no, 0)`    → 좌석 순
 *   ⑤ `occurred_at`             → 같은 학생의 여러 제출은 오래된 것부터
 *   ⑥ `submission_id`           → 동점 안정 키
 */

/* 반 커서 = `g|<조 또는 빈칸>|<좌석 또는 빈칸>|<ISO 시각>|<uuid>`.
 * 빈칸 = null(편성 전)이다 — 0 으로 적으면 「0조」가 되어 nulls last 를 커서가 되돌린다
 * (기본 커서의 신뢰도 빈칸과 같은 판단).
 *
 * 🔴 **머리의 `g|` 는 장식이 아니라 두 모드를 가르는 못이다**(반박 P1-① · 실측).
 *   그전엔 칸 수·칸 모양이 같아 두 꼴이 **서로를 통과했다**:
 *     · 기본 커서 `1||<시각>|<uuid>`(신뢰 미측정 — 현 데이터에 흔한 꼴)가 반커서읽기를 통과해
 *       조=1·좌석=null 로 읽혔다 → keyset 이 1조의 좌석 있는 행을 **전부 건너뛴다**.
 *     · 반 커서 `1|3|…` 은 기본 커서읽기를 통과해 신뢰='3' 으로 읽혔다 → 잰 행 전부 건너뜀.
 *   400 이 나야 할 자리에서 **200 + 빠진 목록**이 나온다 — 큐는 줄어드는 목록이라 검수자는
 *   자기가 못 본 발화가 있다는 것을 알 방법이 없다(이 파일 머리말의 그 이유 그대로).
 *   🔑 고치는 방향을 「교차 파싱 거부」가 아니라 **꼴을 서로소로 만들기**로 잡았다 — 거부는
 *     검사를 한 벌 더 얹는 일이고(두 곳에 적으면 갈라진다), 머리글자는 정규식 하나가 진다:
 *     `g` 는 기본 커서의 첫 칸 `[01]` 을 못 통과하고, 기본 커서엔 `g|` 머리가 없다.
 *   ⚠ 기본 커서 꼴은 **안 건드린다** — 그건 이미 라이브에 나가 앱 손에 들려 있다(반 모드는
 *     운영 도달 0 이라 이 개정의 비용이 0 인 지금이 유일한 창이다). */
const 반커서꼴 = /^g\|(\d{1,2})?\|(\d{1,2})?\|([^|]+)\|([0-9a-fA-F-]{36})$/u;

/** 반 모드의 `next_cursor` 를 되읽는다. 없으면 `{값:null, 이유:null}`(첫 쪽). */
function 반커서읽기(raw) {
  if (raw === null || raw === undefined) return { 값: null, 이유: null };
  const m = 반커서꼴.exec(String(raw));
  if (!m || !Number.isFinite(Date.parse(m[3]))) {
    return { 값: null, 이유: 'cursor 는 앞선 응답의 next_cursor 를 그대로 실어야 합니다' };
  }
  return {
    값: {
      조: m[1] === undefined ? null : Number(m[1]),
      좌석: m[2] === undefined ? null : Number(m[2]),
      시각: m[3],
      id: m[4],
    },
    이유: null,
  };
}

/** 반 모드 쪽의 마지막 행을 다음 커서로 굳힌다. 행이 없으면 `null`. */
function 반커서만들기(행) {
  if (!행) return null;
  const 시각 = 행.occurred_at instanceof Date ? 행.occurred_at : new Date(행.occurred_at);
  if (!Number.isFinite(시각.getTime())) return null;
  const 조 = 행.group_no === null || 행.group_no === undefined ? '' : String(행.group_no);
  const 좌석 = 행.seat_no === null || 행.seat_no === undefined ? '' : String(행.seat_no);
  return `g|${조}|${좌석}|${시각.toISOString()}|${행.submission_id}`;
}

/** 반 커서를 SQL 이 그대로 비교할 튜플로 편다(위 ①~⑥ · 전부 오름차순). */
function 반커서키(값) {
  if (!값) return null;
  return {
    조널키: 값.조 === null,
    조키: 값.조 === null ? 0 : 값.조,
    좌석널키: 값.좌석 === null,
    좌석키: 값.좌석 === null ? 0 : 값.좌석,
    시각: 값.시각,
    id: 값.id,
  };
}

module.exports = {
  쪽크기, 커서읽기, 커서만들기, 커서키, 기본쪽, 최소쪽, 최대쪽,
  반커서읽기, 반커서만들기, 반커서키,
};
