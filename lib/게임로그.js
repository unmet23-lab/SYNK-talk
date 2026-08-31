'use strict';
/**
 * 게임 사건 로그 — 게임 화면들의 **오프라인 큐**. 순수 함수만(파일 I/O 는 `src/저장.js`).
 *
 * ■ 🔑 큐를 새로 짓지 않는다 — `lib/제출로그.js` 의 일반 칸들을 그대로 쓴다
 *   `전송기록`·`밀린것`·`보낼것`·`직렬화`·`역직렬화` 는 항목의 `id`·`event_id`·`send_error`·
 *   `send_final` 만 본다. `lib/교정로그.js` 가 밟은 길 그대로다 — 판정을 두 벌로 적으면
 *   「아직 안 보냄」과 「거절당함」을 가르는 판정이 갈라지고, 갈라진 쪽은 조용히 영원히
 *   재시도한다. 막힌 학생의 것이 안 나가는 것(`보낼것`)도 같은 한 벌이다.
 *
 * ■ 🚫 제출 로그(`talk_log.jsonl`)·교정 로그에 섞지 않는다
 *   `학습출석`·`배달상태` 가 talk_log 의 모든 항목을 발화로 세므로, 메일 한 통이 발화 수를
 *   늘린다. 파일이 따로다(`game_log.jsonl` · `src/저장.js`).
 *
 * ■ 항목 id = **결정론** (`교정로그.항목id` 와 같은 판정)
 *   「한 앉음의 한 사건 종류」에 항목 하나 — `mail:{correlation_id}` 꼴. 그래서 화면이 몇 번
 *   다시 불러도 같은 앉음의 고름·제출·이탈이 두 벌 서지 않는다(앉음당 1번의 기계적 실체).
 *   `idempotency_key`(서버 중복 방지)와 다른 축이다 — 이건 기기 안 중복 방지다.
 *   🔴 **한 앉음에 턴이 여럿인 모듈**(G2 · 3문장)은 거기에 턴 칸이 붙는다(`mail:{앉음}#{문항}`) —
 *   근거·경계는 `항목id` 머리말. 앉음 단위로 세는 함수(`제출항목`·`다음시도번호`)도 같은 축으로
 *   **문항을 받는 갈래**가 있다: 안 주면 옛 뜻(배정 단위) 그대로다.
 *
 * ■ `사건` 을 통째로 들고 있는다
 *   다시 보낼 때 **그 객체 그대로** 보내야 멱등키가 같고, 같아야 서버가 `duplicate` 로 접는다
 *   (C0 §4-1 「한 번 정하고 안 바꾼다」). compose_meta·선택 payload 도 그 안에 있어 사흘 밀린
 *   항목이 그날 잰 값을 그대로 들고 올라간다.
 */
const { 전송기록, 밀린것, 보낼것, 직렬화, 역직렬화, 보존경계 } = require('./제출로그.js');
/* 「이 모듈은 한 앉음에 턴이 여럿이고 턴을 가르는 값은 이것이다」 — 판정은 모듈 표 한 곳이다.
 * 시도열쇠값 = 같은 표의 다음 층(재도전 루프 모듈의 attempt 축 · G4) — 여기 challenge_id 를
 * 다시 적으면 판정이 두 곳이 되고, 모듈이 늘어나는 날 갈린 쪽이 조용히 접는다. */
const { 턴열쇠값, 시도열쇠값 } = require('./게임스냅샷.js');

/* event_type → 항목 id 접두. 목록 밖 사건은 이 큐에 못 든다(어느 큐 소속인지가 이 표다).
 * 🔴 `quiz.answered` 는 G2 「고칠 곳 없음」·건너뜀의 통로다(`lib/보고서교정제출.무산출사건`).
 *   여기 없던 동안 그 사건은 `항목id() === null` 로 **담기에서 조용히 사라졌다** — 오류도 로그도
 *   없이 사라지고, 그것이 §9-③ 「멀쩡한 것을 멀쩡하다고 판정하는 능력」의 **유일한 재료**라
 *   과잉 교정 성향이 영원히 0으로 보였을 자리다(실측: 3턴 앉음이 큐에 1건).
 * 🔴 `estimate.responded` 가 같은 병을 **한 번 더** 밟았다(08-24 실측 · G11 잔여 정찰이 잡음) —
 *   Ⅲ⑥이 카드·조립기·계약·서버를 다 세웠는데 이 표만 안 늘려, 확인 카드의 답이 기기 로그에도
 *   서버에도 안 닿고 증발했다. 표가 늘어야 통로가 산다 — 사건 이름을 새로 열면 이 표부터. */
const 접두 = Object.freeze({
  'submission.created': 'mail',
  'choice.selected': 'choice',
  'session.abandoned': 'abandon',
  'quiz.answered': 'quiz',
  'estimate.responded': 'estimate',   // Ⅲ⑥ 확인 답 — 스냅샷 없는 사건이라 앉음당 1항목(이중 탭 자연 접힘)
  'goal.responded': 'goal',           // c14 목표 답 — 확인 답과 같은 결(앉음당 1항목 · 이 표에 없으면 답이 증발한다 — 위 🔴)
});

/**
 * 항목 id — 앉음×사건종류×**턴**당 하나. 모양이 아니면 null.
 *
 * 🔴 턴 칸이 왜 필요한가 — 「한 앉음 = 한 제출」은 G1 의 모양이었다.
 *   G2 는 한 앉음이 3턴이고 계약이 셋 다 **같은 `correlation_id`** 를 요구한다(발주 G2 §6-1 ·
 *   「3문장이 한 자리에서 나왔다는 사실은 그 순간에만 안다」). 그래서 앉음 키만으로 접으면 2·3턴이
 *   1턴과 같은 id 를 받아 **정상 반환값(`새것:false`)으로 사라진다** — 화면은 멀쩡하고 큐도
 *   멀쩡하고 사건만 없다.
 * 🔑 턴을 가르는 값은 **모듈 표(`lib/게임스냅샷.등록부`)가 낸다** — 여기에 challenge_id 를 다시
 *   적으면 판정이 두 곳이 되고, 모듈이 셋이 되는 날 갈린 쪽이 조용히 통과한다.
 * 🔑 턴 열쇠가 없는 사건(G1 전부 · G2 이탈 · 스냅샷 없는 옛 항목)은 **한 글자도 안 바뀐다** —
 *   기기에 남은 미전송 항목이 새 id 로 두 벌이 되면 같은 메일이 두 번 나간다.
 */
function 항목id(사건) {
  if (!사건 || !사건.correlation_id) return null;
  const p = 접두[사건.event_type];
  if (!p) return null;
  const snap = 사건.submission && 사건.submission.task_snapshot;
  const 턴 = 턴열쇠값(snap);
  /* 재도전 루프 모듈(G4)은 같은 턴이 attempt 를 올려 여러 번 나간다 — 시도 칸이 없으면 attempt
   * 2+ 가 첫 시도에 접혀 「재시도 후 자기수정」(그 모듈의 유일한 결과 변수)이 **정상 반환값으로**
   * 사라진다. 판정은 모듈 표(`시도열쇠값`)가 진다 — 축이 없는 모듈·옛 항목은 id 가 한 글자도
   * 안 바뀐다(턴 칸과 같은 근거: 미전송 항목이 새 id 로 두 벌이 되면 같은 사건이 두 번 나간다).
   * 🔑 시도 칸은 턴 칸 «위»에만 앉는다 — 턴 없는 사건(이탈)은 앉음당 하나로 접히는 것이 옳다. */
  const 시도 = 턴 ? 시도열쇠값(snap, 사건.payload) : null;
  if (!턴) return `${p}:${사건.correlation_id}`;
  return 시도 ? `${p}:${사건.correlation_id}#${턴}@${시도}` : `${p}:${사건.correlation_id}#${턴}`;
}

/**
 * 사건을 항목으로 붙인 **새 배열**을 돌려준다. 이미 있으면 그대로(`교정로그` 와 같은 접기 —
 * 「이미 냈나」를 호출부마다 묻게 두면 한 곳이 잊고, 잊은 쪽은 조용히 사건을 늘린다).
 *
 * `task_meta` = **로컬 닻**(전송되지 않는 큐 항목 칸 · `제출로그` 의 task_meta 와 같은 무늬).
 * 고름 항목이 자기 배정(`task_ref`·스냅샷 둘)을 들고 있어야, 앱이 죽어 cleanup 이 못 돈 날의
 * 이탈을 `죽은배정들` 이 지어내지 않고 걷는다(발주 §6-6 ⑩ C5). 접힌 재호출은 첫 닻을 못 바꾼다.
 * @returns {{로그: object[], 항목: object|null, 새것: boolean}}
 */
function 항목추가(로그, 사건, task_meta = null) {
  const id = 항목id(사건);
  if (!id) return { 로그, 항목: null, 새것: false };
  const 이미 = 로그.find((e) => e.id === id);
  if (이미) return { 로그, 항목: 이미, 새것: false };
  const 항목 = {
    id,
    event_type: 사건.event_type,
    사건,
    event_id: null,
    send_error: null,
    send_final: false,
    ...(task_meta ? { task_meta } : {}),
  };
  return { 로그: 로그.concat([항목]), 항목, 새것: true };
}

/**
 * 그 항목이 「이 배정의 **이 턴**」인가 — 짚음(`submission.created`)·무산출(`quiz.answered`)
 * 두 갈래를 **한 판정으로** 본다. 한 턴은 둘 중 하나로만 끝나므로(§6-1), 한 갈래만 보면
 * 「고칠 곳 없음」으로 끝낸 턴이 안 끝난 것으로 보여 화면이 그 턴을 다시 연다.
 */
function 턴사건인가(e, task_ref, 문항id) {
  if (e.event_type !== 'submission.created' && e.event_type !== 'quiz.answered') return false;
  const sub = e.사건 && e.사건.submission;
  if (!sub || sub.task_ref !== task_ref) return false;
  return 턴열쇠값(sub.task_snapshot) === 문항id;
}

/**
 * 이 배정의 **그 턴**이 이미 나갔나 — 한 앉음에 턴이 여럿인 모듈(G2)의 「이미 냈다」 판정.
 * 없으면 null. 🔑 `제출항목`(배정 단위 · G1)과 갈라 둔다 — 한 이름이 두 뜻을 지면 부르는 쪽이
 * 어느 축을 물었는지 안 보이고, G2 화면이 1턴 뒤에 통째로 잠긴다(실측한 그 자리다).
 */
function 턴항목(로그, task_ref, 문항id) {
  if (!문항id) return null; // 턴을 모르면 판정하지 않는다 — 지어내지 않는다
  return 로그.find((e) => 턴사건인가(e, task_ref, 문항id)) || null;
}

/**
 * 이 배정(`task_ref`)의 다음 attempt 번호 — 1부터. 같은 배정 안의 재제출만 센다.
 * 날을 건넌 재제출은 **새 배정**(새 task_ref)이라 1로 시작하고, 사슬은 `retry_of_event_id` 가
 * 잇는다(`lib/제출로그.다음시도번호` 가 날짜·호흡으로 센 것과 같은 눈금 — 사슬 길이를 로컬이
 * 지어내지 않는다).
 *
 * 🔴 `문항id` 를 주면 **그 문항 안의 재시도만** 센다(발주 G2 §5 A행 「문항 내 재시도 = 같은
 *   문항 다시 짚기」). 안 주면 뜻은 배정 단위 그대로다(G1). 3턴 앉음에서 이 인자를 빠뜨리면
 *   2턴이 `attempt_no=2` 로 나가 **다른 문항을 「자기 교정 루프」로 적는다** — 그 성향 축이
 *   통째로 거짓이 되고, 값이 있으니 아무 데서도 안 빨개진다.
 */
function 다음시도번호(로그, task_ref, 문항id = null) {
  let n = 0;
  for (const e of 로그) {
    if (문항id) {
      if (턴사건인가(e, task_ref, 문항id)) n += 1;
    } else if (e.event_type === 'submission.created'
      && e.사건 && e.사건.submission && e.사건.submission.task_ref === task_ref) n += 1;
  }
  return n + 1;
}

/**
 * 이 배정의 제출 항목 — 화면이 「이미 보냈다」를 판정하는 근거(다시 열면 대기 화면으로 간다).
 * 없으면 null.
 */
function 제출항목(로그, task_ref) {
  return 로그.find((e) => e.event_type === 'submission.created'
    && e.사건 && e.사건.submission && e.사건.submission.task_ref === task_ref) || null;
}

/**
 * 죽은 배정 — **고름은 남겼는데 그날이 지나도록 제출도 이탈도 없는** 배정(H2 「다음 마운트 발견」).
 * cleanup 생산자(화면 언마운트)는 「자정을 넘겨 산 채로 닫힌 화면」에서만 발화해 사실상 0이라,
 * 이 판정이 다음 마운트에서 그 자리를 진다 — 재료만 낸다(이탈사건 조립·전송은 배선 몫).
 *
 * 🔴 기준은 **서버 task_ref 끼리의 대조**다(배정 task_ref = 날짜 스코프 · 발주 §6-6 ⑩) —
 *   기기 시계는 이 판정에 안 들어간다(어느 쪽 날짜를 파싱해도 H2 의 시계 혼용이 되살아난다).
 *   오늘 배정을 모르면(서버를 못 받은 날) **걷지 않는다** — 오귀속보다 0건이 낫고, 다음 열림이
 *   다시 걷는다.
 * 🔑 배정 단위지 앉음 단위가 아니다 — 같은 날 고르고 나갔다 다시 연 앉음(고아 고름)은 그날
 *   제출이 섰으면 이탈이 아니다. 닻은 그 배정의 **마지막 고름** 앉음이다.
 * 🔑 `task_meta` 없는 옛 항목은 못 걷는다 — 지어내지 않는다(그 배정은 분모로만 남는다).
 * @returns {{correlation_id: string, task_meta: object}[]}
 */
function 죽은배정들(로그, 오늘task_ref) {
  if (!오늘task_ref) return [];
  const 끝난 = new Set(); // 제출·이탈이 이미 적힌 배정 — 걷을 것이 없다(이중 계상 방지)
  for (const e of 로그) {
    const ref = e.사건 && e.사건.submission && e.사건.submission.task_ref;
    if (ref && (e.event_type === 'submission.created' || e.event_type === 'session.abandoned')) 끝난.add(ref);
  }
  const 닻들 = new Map(); // task_ref → 마지막 고름 항목
  for (const e of 로그) {
    if (e.event_type !== 'choice.selected') continue;
    const meta = e.task_meta;
    if (!meta || !meta.task_ref) continue;
    if (meta.task_ref === String(오늘task_ref)) continue;
    if (끝난.has(meta.task_ref)) continue;
    닻들.set(meta.task_ref, e);
  }
  return Array.from(닻들.values(), (e) => ({ correlation_id: e.사건.correlation_id, task_meta: e.task_meta }));
}

/**
 * 로그 압축 — `제출로그.압축` 과 같은 무늬(G2-9 · 파일이 영영 자라는 것을 막는 실효 처방).
 *
 * 🔴 이 큐는 **행을 하나도 지우지 않는다** — 제출로그와 갈리는 자리다. 여기 행들은 정체가 곧
 *   집계 재료라서다: `다음시도번호` 가 행 수를 세고, `죽은배정들` 이 전 행을 훑어 「끝난 배정」
 *   (submission/이탈의 task_ref)과 닻(고름의 task_meta)을 가른다 — 행을 지우면 끝난 배정이
 *   「죽은 배정」으로 되살아나 **없던 이탈이 지어져 나간다.** 걷는 것은 무게(사건 payload)뿐이다.
 *
 * 남기는 규칙:
 *   · **미final(`밀린것` 판정) 행은 통째로 그대로** — `사건` 을 그 객체 그대로 다시 보내야
 *     멱등키가 같다(머리말). 닻 있는 고름의 미final 도 여기에 든다.
 *   · 끝난 행(닿았거나 `send_final`)이 창 밖(`사건.occurred_at` 날짜 < 경계)이면 `사건` 을
 *     골격으로 — 남기는 칸 = idempotency_key·event_type·occurred_at·correlation_id·
 *     submission{task_ref·task_format·task_snapshot}. 소비자(`턴사건인가`·`제출항목`·
 *     `죽은배정들`)가 읽는 칸 전부다. 행의 `task_meta`(닻)·배달 칸은 손대지 않는다.
 *   · 날짜를 모르는 사건은 안 걷는다(지어내지 않는다).
 *
 * @returns {object[]} 걷을 것이 없으면 **원본 그대로**(참조 동일) — 호출부가 「다르면 쓰기」로 가른다.
 */
function 압축(로그, 오늘, 보존일수 = 14) {
  if (!Array.isArray(로그) || 로그.length === 0) return 로그;
  const 경계 = 보존경계(오늘, 보존일수);
  if (!경계) return 로그;
  let 바뀜 = false;
  const 결과 = 로그.map((e) => {
    if (!e || (!e.event_id && !e.send_final)) return e; // 미final — 절대 안 걷는다
    const 사건 = e.사건;
    if (!사건 || typeof 사건 !== 'object') return e;
    const 날 = String(사건.occurred_at || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(날) || 날 >= 경계) return e;
    /* 이미 골격 — 다시 만들면 매 호출이 「다르다」가 되어 쓰기가 영영 돈다. 조립기 셋
       (게임제출.js)은 payload 를 늘 실으므로 payload 없음 = 이미 걷었다. */
    if (!('payload' in 사건) && !('level_snapshot' in 사건)) return e;
    const sub = 사건.submission;
    바뀜 = true;
    return {
      ...e,
      사건: {
        idempotency_key: 사건.idempotency_key,
        event_type: 사건.event_type,
        occurred_at: 사건.occurred_at,
        correlation_id: 사건.correlation_id,
        ...(sub && typeof sub === 'object' ? {
          submission: {
            task_ref: sub.task_ref,
            ...(sub.task_format !== undefined ? { task_format: sub.task_format } : {}),
            ...(sub.task_snapshot !== undefined ? { task_snapshot: sub.task_snapshot } : {}),
          },
        } : {}),
      },
    };
  });
  return 바뀜 ? 결과 : 로그;
}

module.exports = { 항목id, 항목추가, 다음시도번호, 제출항목, 턴항목, 죽은배정들, 전송기록, 밀린것, 보낼것, 직렬화, 역직렬화, 압축 };
