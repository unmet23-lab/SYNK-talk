/* 기술선택 — 생성이 겨냥할 `skill_ids` 를 «입력에서 먼저» 고르는 순수 회전
 *   (정본 = appsscript docs/상태기반_과제선택_설계.md §6-0 · §16-1 선행 #4 · 2026-08-21).
 *
 * ■ 왜 «입력에서 먼저»인가(㉡ 채택) — 모델이 응답에 skill_id 를 내게 하면 지어낸 ID 가
 *   append-only 원본에 남고(소급 불가), §8-B 채점자가 출력에 맞는 기술을 갖다 붙일 수 있어
 *   「기술 연결」 축이 아무것도 재지 않게 된다. 겨냥을 먼저 저장해야 채점이 «겨냥 대비 적중»을 잰다.
 *
 * ■ 이 값의 정체 — **처치 가설의 기록**이지 실력 관찰이 아니다(H2 · v5.3 L2-19).
 *   원천이 약점이 아니라 «회전»이다: 상태·오류태그는 입력이 아니고(계약 v3.6 조건 3),
 *   소비자가 이 칸을 「그 학생의 약한 기술」로 읽는 순간 가설이 관찰로 굳는다.
 *   🚫 이 결과를 다음 job 선택 규칙에 되먹이지 않는다(불변식 5 — 되먹임은 사람이 시즌 회고에서).
 *
 * ■ 순수 — DB 0. 후보 목록·겨냥 이력은 **오케스트레이터**가 같은 as_of 경계로 조회해 넘긴다
 *   (v5.5 B6 — 회전의 입력이 회전의 출력보다 뒤에 읽히는 역전을 막는 자리가 거기다).
 *   · 후보 조회는 `order by skill_id`(§6-0 C1 — 불변식별자 정렬 · SQL 은 order by 없이 순서를
 *     보장하지 않는다). 이 함수는 받은 배열을 **다시 정렬해** 그 전제를 스스로 지킨다 —
 *     조회층이 잊어도 회전은 결정적이다(잊음이 조용히 비결정이 되는 것을 막는다).
 *   · 겨냥 이력 = 최근 `중복창_일` 안 `intervention.delivered` 의 `skill_ids`(이중 cutoff —
 *     occurred_at ≤ as_of AND ingested_at ≤ as_of · §6-0 이력 조회 범위). 폴백 행엔 그 칸이
 *     없으므로(E3) 「안 나간 겨냥」은 여기 안 들어온다 — 넘기는 쪽 규칙이고 이 함수는 집합만 받는다.
 *
 * ■ 회전 규격(전부 §6-0 표의 명문 — 한 칸도 재량이 없다):
 *   · 해시 = SHA-256(`${learner_id}:${assign_date}`) 의 앞 8바이트를 big-endian **BigInt** 로
 *     읽어 후보 수로 나눈 나머지 = 시작 위치(D6·E3 — Number 는 2^53 밖이라 구현마다 갈린다).
 *   · 결합 = ⓐ(v5.7 C1): 정렬 목록 위를 시작 위치부터 순회하며 겨냥분을 건너뛴다.
 *     ⓑ(안 겨냥 부분집합에 mod)는 금지 — 부분집합 크기가 날마다 달라 mod 분모가 흔들린다.
 *   · 개수 = 안 겨냥 ≥2 → 2 · 1 → 1 · 0(창 안에 다 돌았다) → 시작 위치부터 순서대로 2.
 *     재량(「보통 1개, 가끔 2개」) 금지 — 재현을 깨고 §8-B 층화의 분모를 흔든다.
 *   · `[]` 의 뜻 = 후보 0(시드가 깨졌다) 하나뿐. 생산 «실패»는 값으로 안 뭉갠다 —
 *     그건 부르는 쪽이 `generation_outcome='내부오류'` 로 낸다(§6-0).
 *
 * ■ 이 파일의 해시가 `policy_ver` 재료 8 이다(§5-1) — 급수→기술 매핑이 서는 날(⏳유호 E2)
 *   이 파일 하나만 고치면 되고, 그 갈림은 판이 오르는 것으로 드러난다. */
'use strict';
const { 바이트 } = require('./sha256.js');

/** 앞 8바이트 big-endian BigInt — §6-0 해시 규격 전용(E3 · 64비트라 Number 금지). */
function 앞8바이트BE(입력) {
  const b = 바이트(입력);
  let v = 0n;
  for (let i = 0; i < 8; i += 1) v = v * 256n + BigInt(b[i]);
  return v;
}

/**
 * 결정적 회전으로 겨냥 기술을 고른다.
 *
 * @param {object} 재료
 * @param {string} 재료.learner_id   학생 UUID
 * @param {string} 재료.assign_date  배정일 `YYYY-MM-DD`(몽골 기준 — 조립하는 쪽이 든다)
 * @param {Array<{skill_id: string}|string>} 재료.후보  `engine.skills` domain='grammar' 전량
 *   (§7-1 — 이번 판은 급수 필터 0 · 행 객체든 id 문자열이든 받는다)
 * @param {Iterable<string>} [재료.최근겨냥]  중복창 안에 이미 겨냥한 skill_id 들
 * @returns {{skill_ids: string[], 시작위치: number}}  후보 0 이면 `{skill_ids: [], 시작위치: 0}`
 */
function 기술선택(재료) {
  const { learner_id, assign_date, 후보, 최근겨냥 } = 재료 || {};
  if (!learner_id) throw new TypeError('기술선택: learner_id 가 필요하다');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(assign_date))) {
    throw new TypeError('기술선택: assign_date 는 YYYY-MM-DD 여야 한다');
  }

  /* 정렬을 여기서 다시 건다(불변식별자 · §6-0 C1) — 받은 순서를 믿으면 조회층의 잊음이
   * 조용히 비결정이 된다. localeCompare 금지 — 로캘이 순서를 바꾼다. 코드포인트 비교 하나. */
  const ids = (Array.isArray(후보) ? 후보 : [])
    .map((s) => String(s && typeof s === 'object' ? s.skill_id : s))
    .filter((s) => s && s !== 'undefined' && s !== 'null')
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (new Set(ids).size !== ids.length) throw new TypeError('기술선택: 후보에 중복 skill_id 가 있다');
  if (ids.length === 0) return { skill_ids: [], 시작위치: 0 };   // 시드가 깨진 것 — §6-0 「[] 의 뜻」

  const 겨냥됨 = new Set([...(최근겨냥 || [])].map(String));
  const 시작위치 = Number(앞8바이트BE(`${learner_id}:${assign_date}`) % BigInt(ids.length));

  /* 결합 ⓐ — 시작 위치부터 한 바퀴, 겨냥분을 건너뛰며 담는다. */
  const 안겨냥수 = ids.reduce((n, s) => n + (겨냥됨.has(s) ? 0 : 1), 0);
  const 목표개수 = 안겨냥수 >= 2 ? 2 : 안겨냥수 === 1 ? 1 : 2;
  const 고른 = [];
  if (안겨냥수 === 0) {
    /* 창 안에 전부 돌았다 — 시작 위치부터 순서대로(§6-0 개수 규칙의 셋째 갈래). */
    for (let k = 0; k < 목표개수 && k < ids.length; k += 1) 고른.push(ids[(시작위치 + k) % ids.length]);
  } else {
    for (let k = 0; k < ids.length && 고른.length < 목표개수; k += 1) {
      const s = ids[(시작위치 + k) % ids.length];
      if (!겨냥됨.has(s)) 고른.push(s);
    }
  }
  return { skill_ids: 고른, 시작위치 };
}

/* 분류판(`skill_taxonomy_ver`)의 코드 정본 — v5.13-b. `engine.skills` 엔 판 칸이 없어(§13 v5.10
 * 「분류판 소속 검사」 유보) 값의 원천이 어디에도 없었다 — 오케스트레이터·워커가 각자 적으면
 * 첫 계보가 갈린다. 기술 축의 규칙 정본이 이 파일이라 판도 여기 하나에서 산다.
 * 값의 근거: c6 시드(`L0_스키마.sql:6685` = 첫 판)가 지금 판이다 — 시드를 갈면 이 값을 올린다. */
const 분류판 = 'skills.v1';

module.exports = { 기술선택, 앞8바이트BE, 분류판 };
