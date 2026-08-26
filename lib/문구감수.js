'use strict';
/**
 * 문구 감수 판정 — `l10n` 통로가 쓰는 **순수 함수**만 (docs/검수_내부계약.md §1 외부 검수자 갈래).
 *
 * ■ 왜 lib 인가 (`lib/검수확정.js` 와 같은 축)
 *   같은 판정을 **문이 둘**에서 쓴다 — Edge Function(`functions/l10n`)과 앞으로 설 반입 도구
 *   (`tools/문구반입.js`). 문이 둘이어도 규칙은 한 벌이어야 한다(F269 — 규칙이 갈라지면 증상은
 *   「반입은 됐는데 앱에서 안 보인다」 하나뿐이라 원인이 규칙에 있는 줄 모른다).
 *   화면글·SQL·네트워크는 각 문의 몫이다 — 여기는 순수 함수만 산다(회귀가 여기를 문다).
 *
 * ■ 🔴 `verdict` 는 **서버가 파생하지 않는다** — 검수 콘솔과 다른 점
 *   학생 발화 검수는 세 텍스트를 비교해 서버가 verdict 를 냈다(§5-1). 문구 감수는 그렇게 못 한다:
 *   「원문을 고쳐야 한다」는 **텍스트 비교로 안 나오는 판단**이다(몽골어로 옮길 수 없는 한국어라는
 *   뜻이고, 그건 사람만 안다). 그래서 여기서는 사람이 고르고, 대신 **셋이 서로 배타적임을 기계가
 *   지킨다** — 「못 고친다」면서 번역을 내는 것 같은 두 말을 막는다(DB CHECK 와 이중으로).
 *
 * ■ 상태 전이 — 「원문을 고쳐야 한다」가 왜 discarded 인가
 *   그 판정이 나오면 감수자가 다시 봐도 소용없다(고칠 것은 우리 한국어다). 그래서 큐에서 내린다.
 *   `discarded` 의 뜻은 「버렸다」가 아니라 **「감수 대상에서 내려왔다」**이다 — 원문을 고치면
 *   같은 행의 `source_ko` 를 갱신하고 `status` 를 `pending` 으로 되돌려 다시 큐에 올린다.
 *   🔑 그때 앞 판정은 지우지 않는다(`l10n_reviews` 는 append-only) — 「왜 그렇게 정했나」가 남는다.
 */

/** 🔒 닫힌 어휘 — 정본은 DB CHECK(`l10n_reviews_verdict_c13`)다. 여기 것은 **둘째 사본**이고
 *  그 사실을 숨기지 않는다: 화면이 버튼 셋을 그리려면 어휘를 알아야 하는데 서버는 그것을
 *  내주는 경로가 없다(🚫 값목록용 엔드포인트 신설 — 검수 계약 §0 이 이미 기각했다).
 *  없앨 수 없는 사본은 **기계에 물린다** — `tests/문구감수.test.js` 가 마이그레이션의 CHECK 와
 *  이 상수를 한자리에서 대조한다. 갈라지면 증상은 400 이 아니라 **500**(DB 가 CHECK 에 없는
 *  값을 받고 그 자리에서 죽는다)이라 더 늦게 발견된다. */
const VERDICT = ['초벌이 맞다', '고쳤다', '원문을 고쳐야 한다'];

/** 원문을 고쳐야 하는 판정 — 이 값일 때만 `final_mn` 이 비어야 한다. */
const 원문결함 = '원문을 고쳐야 한다';

/** `string_id` 꼴 — **ASCII 만**(마이그레이션 `l10n_strings_id_ascii_c13` 와 같은 규칙).
 *  🔴 까닭은 관례가 아니라 실측이다: 2026-08-26 에 Sentry 태그 키가 한글이라 **이벤트는 200 으로
 *  통과하고 태그만 조용히 사라지는** 버그를 열하루 만에 찾았다. 이 id 는 앱·문서·내보내기 파일을
 *  오가는 «바깥으로 나가는 키»라 같은 병에 걸릴 자리다(memory `workflow-schema-ascii-keys`).
 *  값(한국어·몽골어)은 한글 그대로 둔다 — 막히는 것은 언제나 키다. */
const ID꼴 = /^[a-z0-9]+([._-][a-z0-9]+)+$/;

const uuid꼴 = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const 쪽기본 = 20;
const 쪽상한 = 100;

/** 문자열인가 — `null`·수·객체를 텍스트 칸에 넣는 것을 막는다. */
const 글인가 = (v) => typeof v === 'string';
/** 비어 있지 않은 글인가(공백만인 것도 비었다고 본다). */
const 찬글인가 = (v) => 글인가(v) && v.trim() !== '';

/**
 * `?limit=` 판정. 순수 함수.
 * @param {string|null} raw
 * @returns {{값: number|null, 이유: string|null}} 값이 null 이면 이유가 선다
 */
function 쪽크기(raw) {
  if (raw === null || raw === undefined || raw === '') return { 값: 쪽기본, 이유: null };
  if (!/^\d+$/.test(String(raw))) return { 값: null, 이유: 'limit 은 1~100 의 정수입니다' };
  const n = Number(raw);
  if (n < 1 || n > 쪽상한) return { 값: null, 이유: `limit 은 1~${쪽상한} 입니다` };
  return { 값: n, 이유: null };
}

/**
 * `?after=` 판정 — 커서는 **`string_id` 하나**다.
 * 🔑 검수 큐처럼 복합 커서(감사표본·신뢰도·시각)를 쓰지 않는 까닭: 이 큐의 정렬축이 `string_id`
 *   하나이고 그것이 PK 라 **동률이 원리상 없다.** 축이 하나면 커서도 하나여야 한다 — 칸을 더
 *   두면 두 커서가 서로를 통과하는 사고가 생긴다(반 커서가 실제로 그랬다 · 계약 §3-2).
 * @param {string|null} raw
 * @returns {{값: string|null, 이유: string|null}}
 */
function 커서(raw) {
  if (raw === null || raw === undefined || raw === '') return { 값: null, 이유: null };
  if (!글인가(raw) || !ID꼴.test(raw)) return { 값: null, 이유: 'after 는 string_id 꼴이어야 합니다' };
  return { 값: raw, 이유: null };
}

/**
 * 확정 요청 판정 — 모양·배타성을 여기서 전부 본다(서버가 DB 에 닿기 **전에**).
 * @param {unknown} 본문
 * @returns {{값: object|null, 이유: string|null, 칸: string|null}}
 */
function 확정요청(본문) {
  const 거절 = (이유, 칸) => ({ 값: null, 이유, 칸 });
  if (!본문 || typeof 본문 !== 'object' || Array.isArray(본문)) return 거절('본문이 객체가 아닙니다', null);
  const b = /** @type {Record<string, unknown>} */ (본문);

  if (!글인가(b.string_id) || !ID꼴.test(b.string_id)) return 거절('string_id 가 없거나 꼴이 아닙니다', 'string_id');
  if (!글인가(b.verdict) || !VERDICT.includes(b.verdict)) {
    return 거절(`verdict 는 ${VERDICT.join(' · ')} 중 하나입니다`, 'verdict');
  }

  /* 🔴 배타성 — DB CHECK 와 **이중으로** 지킨다. 여기서 막는 것이 값싸고(왕복 0), DB 가
     막는 것이 확실하다(직접 SQL 도 못 지난다). 둘 중 하나만 두면 새는 방향이 생긴다. */
  if (b.verdict === 원문결함) {
    if (b.final_mn !== undefined && b.final_mn !== null) {
      return 거절('「원문을 고쳐야 한다」에는 번역을 싣지 않습니다 — 두 말을 한 번에 할 수 없습니다', 'final_mn');
    }
    if (!찬글인가(b.note)) {
      return 거절('「원문을 고쳐야 한다」에는 까닭(note)이 필요합니다 — 그것이 이 판정의 산출물입니다', 'note');
    }
  } else if (!찬글인가(b.final_mn)) {
    return 거절('final_mn 이 비었습니다', 'final_mn');
  }

  if (b.note !== undefined && b.note !== null && !글인가(b.note)) return 거절('note 가 글이 아닙니다', 'note');
  if (b.supersedes !== undefined && b.supersedes !== null) {
    if (!글인가(b.supersedes) || !uuid꼴.test(b.supersedes)) return 거절('supersedes 가 uuid 가 아닙니다', 'supersedes');
  }

  return {
    값: {
      string_id: b.string_id,
      verdict: b.verdict,
      final_mn: b.verdict === 원문결함 ? null : String(b.final_mn).trim(),
      note: 찬글인가(b.note) ? String(b.note).trim() : null,
      supersedes: b.supersedes ?? null,
    },
    이유: null,
    칸: null,
  };
}

/**
 * 판정 → 문장이 가는 자리. 순수 함수.
 * @param {string} verdict
 * @returns {'verified'|'discarded'}
 */
function 상태전이(verdict) {
  return verdict === 원문결함 ? 'discarded' : 'verified';
}

/**
 * 내보내기 질의 — **문 둘이 같은 것을 본다**.
 *
 * 🔴 왜 여기 사는가
 *   이 질의를 읽는 곳이 둘이다: ⓐ Edge Fn `GET /l10n/export`(감수 화면·직원용)
 *   ⓑ `tools/문구내보내기.js`(운영자가 파일로 뽑는 자리 · Management API 로 DB 를 직접 읽는다).
 *   ⓑ 를 ⓐ 위에 얹을 수는 없다 — Edge Fn 은 직원 **로그인 세션**을 요구하는데 CLI 에는
 *   그 세션이 없다(왕복시험만 합성 계정으로 만든다). 그렇다고 질의를 두 벌 적으면
 *   **갈라지고, 갈라진 쪽은 조용하다** — 이 저장소가 가장 많이 데인 무늬다.
 *   👉 그래서 «문»은 둘로 두고 «질의»는 하나로 둔다. 회귀가 양쪽에 리터럴이 없음을 잰다.
 *
 * 🔑 「원문을 고쳐야 한다」로 끝난 것도 싣는다 — 빼면 파일만 보는 사람에게 그 문장이
 *   **아직 감수 전인 것처럼** 보인다. 대신 verdict 를 실어 갈래를 알린다.
 * 🔑 `pending` 은 뺀다 — 아직 판정이 없어 실을 것이 없다.
 * ⚠ 파라미터가 없다(고정 질의). 그래서 `sql.unsafe()` 로 그대로 돌려도 주입 자리가 없다.
 */
const 내보내기질의 = `
    select s.string_id, s.source_ko, s.status,
           r.verdict, r.final_mn, r.note, r.created_at as reviewed_at
      from engine.l10n_strings s
      join lateral (
        select verdict, final_mn, note, created_at
          from engine.l10n_reviews r2
         where r2.string_id = s.string_id
         order by r2.created_at desc, r2.review_id desc
         limit 1
      ) r on true
     where s.status <> 'pending'
     order by s.string_id`;

module.exports = { VERDICT, 원문결함, ID꼴, 쪽크기, 커서, 확정요청, 상태전이, 쪽기본, 쪽상한, 내보내기질의 };
