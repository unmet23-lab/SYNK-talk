'use strict';
/**
 * 문구 반입 판정 — **순수 함수만**. 네트워크·파일 없이 회귀가 여기를 문다.
 *
 * ■ 🔴 이 파일이 지키는 단 하나 = **이미 감수된 번역을 조용히 낡게 두지 않는다**
 *   `engine.l10n_strings` 는 「우리 한국어 원문」의 사본이다. 원문이 바뀌면 그 번역은
 *   **그 순간 틀린 글**이 된다 — 그런데 행은 여전히 `verified` 라서 내보내기 파일에 실리고,
 *   앱에 붙고, 학생이 읽는다. **증상이 없다.**
 *   그래서 `on conflict do update` 를 쓰지 않는다. 원문이 바뀐 줄은 **세어서 사람에게 보이고**,
 *   덮을지는 그 자리에서 정한다(`--원문갱신`). 덮으면 상태가 `pending` 으로 되돌아간다.
 *
 * ■ 왜 갈래가 넷인가 — 「무엇이 바뀌었나」에 따라 **감수를 다시 해야 하는지**가 갈린다
 *   ① 새것        : DB 에 없다 → 넣는다(pending).
 *   ② 그대로      : 다섯 칸이 전부 같다 → 아무것도 안 한다(updated_at 도 안 건드린다).
 *   ③ 곁가지바뀜  : `context`·`max_len`·`draft_mn` 만 다르다 → 갱신한다.
 *                   🔑 번역문 자체가 아니라 **감수자에게 주는 안내**라 판정이 안 죽는다.
 *   ④ 원문바뀜    : `source_ko` 가 다르다 → 🔴 **판정이 죽는다.** 승인 없이는 안 건드린다.
 *   ⚠ ④ 안에 ③ 이 겹칠 수 있다 — 그때는 ④ 로 센다(더 무거운 쪽이 이긴다).
 *
 * ■ ⚠ `max_len` 이 좁아지는 것도 ③ 으로 접는다 — 번역이 새 예산을 넘을 수 있지만, 그건
 *   「감수를 다시 하라」가 아니라 「짧게 고쳐 달라」다. 그 자리는 화면이 실제로 넘칠 때
 *   드러나므로 여기서 상태를 되돌리지 않는다(되돌리면 멀쩡한 판정이 대량으로 죽는다).
 */

/** DB 로 가는 다섯 칸. `contents/문구_1차.js` 의 `반입칸` 과 **같아야 한다**(회귀가 잰다). */
const 칸 = Object.freeze(['string_id', 'source_ko', 'draft_mn', 'context', 'max_len']);

/** 원문이 바뀌면 판정이 죽는 칸. 나머지는 안내라 갱신해도 판정이 산다. */
const 판정을죽이는칸 = Object.freeze(['source_ko']);

const 같나 = (a, b) => (a ?? null) === (b ?? null);

/**
 * 목록과 DB 현재 상태를 맞대어 갈래를 낸다.
 *
 * @param {Array<object>} 목록  `contents/문구_1차.js` 의 줄들(여분 칸이 있어도 된다 — 다섯만 본다)
 * @param {Array<object>} 현재  DB 의 `string_id, source_ko, draft_mn, context, max_len, status`
 * @returns {{새것:object[], 그대로:object[], 곁가지바뀜:object[], 원문바뀜:object[]}}
 */
function 대조(목록, 현재) {
  const 있는것 = new Map((현재 || []).map((r) => [r.string_id, r]));
  const 판 = { 새것: [], 그대로: [], 곁가지바뀜: [], 원문바뀜: [] };

  for (const 줄 of 목록 || []) {
    const 값 = {};
    for (const k of 칸) 값[k] = 줄[k] ?? null;

    const 옛 = 있는것.get(값.string_id);
    if (!옛) { 판.새것.push(값); continue; }

    const 원문다름 = 판정을죽이는칸.some((k) => !같나(값[k], 옛[k]));
    const 곁가지다름 = 칸.some((k) => !판정을죽이는칸.includes(k) && k !== 'string_id' && !같나(값[k], 옛[k]));

    /* 🔑 «더 무거운 쪽이 이긴다» — 원문이 바뀌었으면 곁가지도 같이 바뀌었든 아니든 ④ 다.
     *   가벼운 쪽으로 접으면 판정이 죽은 줄이 조용히 갱신 대상에 섞인다. */
    if (원문다름) 판.원문바뀜.push({ ...값, 옛원문: 옛.source_ko, 옛상태: 옛.status ?? null });
    else if (곁가지다름) 판.곁가지바뀜.push(값);
    else 판.그대로.push(값);
  }
  return 판;
}

/**
 * 이 실행이 **DB 를 건드리나**. 미리보기에서 「할 일 없음」을 정확히 말하기 위한 자리 —
 * 「없다」와 「안 재봤다」가 같은 화면이면 그 도구는 있으나 마나다.
 * @param {{새것:any[], 곁가지바뀜:any[], 원문바뀜:any[]}} 판
 * @param {boolean} 원문갱신  `--원문갱신` 이 붙었나
 */
function 할일수(판, 원문갱신) {
  return 판.새것.length + 판.곁가지바뀜.length + (원문갱신 ? 판.원문바뀜.length : 0);
}

/**
 * 승인 없이 못 지나가는 것이 있나 — 있으면 사람이 읽을 한 줄을 준다(없으면 null).
 * 🔑 **막는 것은 도구 몫**이다(die 의 모양이 도구마다 다르다) — `lib/플래그.js` 와 같은 규율.
 */
function 막힘(판, 원문갱신) {
  if (원문갱신 || !판.원문바뀜.length) return null;
  return `원문이 바뀐 문장이 ${판.원문바뀜.length}건 있다 — 이 줄들의 «이미 끝난 감수»는 무효다.\n`
    + '     덮으면 그 줄의 상태가 pending 으로 돌아가고 감수자가 다시 본다(그게 맞는 동작이다).\n'
    + '     확인했으면: --원문갱신 을 함께 준다.';
}

/** SQL 리터럴 — 홑따옴표만 겹친다(값은 한국어·키릴이 정상이라 이스케이프를 넓히지 않는다). */
function 따옴(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

/**
 * 붓는 SQL 한 덩이. **한 트랜잭션**이다 — 반쯤 들어간 목록은 다음 실행의 대조를 거짓말로 만든다.
 * @param {{새것:any[], 곁가지바뀜:any[], 원문바뀜:any[]}} 판
 * @param {boolean} 원문갱신
 * @returns {string|null} 할 일이 없으면 null
 */
function SQL(판, 원문갱신) {
  if (!할일수(판, 원문갱신)) return null;
  const 줄들 = [];

  const 행 = (v) => `(${칸.map((k) => 따옴(v[k])).join(', ')})`;

  if (판.새것.length) {
    줄들.push(
      `insert into engine.l10n_strings (${칸.join(', ')})\nvalues\n  ${판.새것.map(행).join(',\n  ')};`);
  }
  if (판.곁가지바뀜.length) {
    /* 🔑 `status` 를 안 건드린다 — 안내만 바뀌었으므로 판정은 그대로 산다. */
    for (const v of 판.곁가지바뀜) {
      줄들.push(`update engine.l10n_strings set draft_mn = ${따옴(v.draft_mn)}, `
        + `context = ${따옴(v.context)}, max_len = ${따옴(v.max_len)}, updated_at = now() `
        + `where string_id = ${따옴(v.string_id)};`);
    }
  }
  if (원문갱신 && 판.원문바뀜.length) {
    /* 🔴 `status = 'pending'` 이 이 줄의 핵심이다 — 원문이 바뀌었으니 옛 판정은 무효다.
     *   판정 «이력»은 `l10n_reviews` 가 append-only 로 그대로 쥔다(지우지 않는다). */
    for (const v of 판.원문바뀜) {
      줄들.push(`update engine.l10n_strings set source_ko = ${따옴(v.source_ko)}, `
        + `draft_mn = ${따옴(v.draft_mn)}, context = ${따옴(v.context)}, max_len = ${따옴(v.max_len)}, `
        + `status = 'pending', updated_at = now() where string_id = ${따옴(v.string_id)};`);
    }
  }
  return `begin;\n${줄들.join('\n')}\ncommit;`;
}

module.exports = { 칸, 판정을죽이는칸, 대조, 할일수, 막힘, SQL, 따옴 };
