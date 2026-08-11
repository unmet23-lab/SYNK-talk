/* 라디오 승격기 — 원장(radio.*) → engine.learning_events 의 **판정층** (설계 §4-3·§2-2 · c11)
 *
 * ■ 왜 순수한가 (P0 ④ `lib/라디오수집.js` 와 같은 이유)
 *   Fn(`supabase/functions/radio-promote`)은 조회·insert 만 한다. 승격 판정(링크·동의·중복·
 *   마감·해석)을 fetch 옆에 두면 회귀가 원리상 못 닿고, 틀린 판정은 송출 «뒤»에야 드러난다 —
 *   여기 두면 원장 픽스처가 §9 「승격 왕복」의 판정 절반을 오늘 잰다(네트워크 0 · DB 0).
 *
 * ■ 파생 규칙
 *   · **파싱은 안 한다** — 원장 `command_kind`·`command_arg` 는 인제스트 Fn 이 혼자 만든 값이다
 *     (재파싱하면 파서판이 갈린다). 승격이 새로 하는 해석은 `답해석` 하나이고, 그것이 §9
 *     왕복시험 「원장 보증」이 이미 재는 바로 그 경로다.
 *   · `!답`의 「2」는 **자리(1부터)**다 — `options_shown[자리-1].option_id` 로 해석한다
 *     (문항 팩 머리말 · 자리가 보기 밖이면 지어내지 않고 승격 제외).
 *   · 멱등키 = `message_id`(§4-3 봉투) · correlation_id = 학생×몽골날짜 **결정적 uuid** —
 *     「한 앉음=한 학생」 보호(라운드 키 금지). 결정적인 이유: 재실행이 같은 앉음을 같은 키로
 *     다시 만나야 한 앉음이 두 앉음으로 안 갈라진다(무작위면 갈라지고 증상이 없다).
 *   · 날짜 경계 = `lib/오늘과제.js` 정본 그대로(원칙 8 — IANA 리터럴 재기입 금지).
 *   · 제외는 지우는 게 아니라 **세는 것**이다 — 원장은 그대로 남고(소급 가능), 분모(사유별
 *     건수)가 Fn 응답으로 나간다. 별도 제외 표는 안 만든다: 링크·동의·라운드가 전부 이력
 *     테이블이라 「그때 왜 제외됐나」는 언제든 재산출된다(원칙 10·11 — 파생은 저장하지 않는다).
 *
 * ■ 이 파일이 «안» 하는 것
 *   질문(`!질문`)·자발 발화는 승격 규격이 없다(§4-4 ⑤ 후보) — 원장 보존까지가 오늘의 전부다.
 *   개인 순위·개인 성적으로 이어지는 어떤 파생도 여기서 안 만든다(§8 영구 금지).
 */
'use strict';

const { 답해석 } = require('./라디오채팅파서.js');
const { 몽골날짜 } = require('./오늘과제.js');

const 승격판 = 'radio-promote.v1';

/* 명령 → 승격 사건 매핑 — §2-2 표의 기계 실체. 여기 없는 명령은 원장에만 남는다.
 * ⚠ 키는 파서 `명령표` 의 부분집합이어야 한다(회귀가 대조한다 — 어긋나면 그 명령은 영원히 0행). */
const 승격표 = Object.freeze({
  '답': 'quiz.answered',
  '빗소리': 'preference.stated',
  'asmr': 'preference.stated',
  '슬럼프': 'affect.reported',
  '출석': 'submission.created',
  '목표': 'submission.created',
});

/* ⓒⓓ의 제시문 폴백 — 그날 자막 카드가 없을 때의 과업 정본(있으면 카드가 이긴다 · §2-2 ⓓ).
 * 카드 없는 날의 `!출석` 은 「상시 안내 문구에 응답한 것」이라 이 스냅샷이 그때 학생이 본 것이다 —
 * 지어낸 게 아니라 명령 문법 자체가 과업이다(오버레이 P3 이 서면 카드 경로가 자동으로 이긴다). */
const 명령과업 = Object.freeze({
  목표선언: Object.freeze({
    task_ref: 'radio:cmd:목표선언:v1',
    task_snapshot: Object.freeze({ 지시문: '오늘의 목표를 한 문장으로 — !목표 <문장>', 판: 'radio-cmd.v1' }),
    task_schema_ver: 'radio-cmd.v1',
  }),
  자습체크인: Object.freeze({
    task_ref: 'radio:cmd:자습체크인:v1',
    task_snapshot: Object.freeze({ 지시문: '자습을 시작하며 한 문장 — !출석 <한 문장>', 판: 'radio-cmd.v1' }),
    task_schema_ver: 'radio-cmd.v1',
  }),
});

/* ⓐⓑ 선호 규격(§2-2 · c11 ③). `stated_option` 은 v1 에서 **id=문구**다(S1-5 가 옛 문자열
 * 보기를 살린 것과 같은 규칙) — BGM 팩(P1)이 트랙 id 를 갖고 서는 날 그 판이 매핑을 올린다.
 * 🔑 이름을 `selected_option` 으로 안 쓴 이유: 그 이름은 선택로그 어휘라 「보여준 목록에서
 *   자리로 골랐다」는 계약을 지고 있고(검증기 ⑦ — options_shown·position 을 같이 요구한다),
 *   방송 명령 선언은 보여준 목록이 없다. 같은 이름을 쓰면 ⑦을 깎아야 하는데 그 검사는 G2
 *   통로까지 덮는 가드라 깎을 수 없다 — 뜻이 다르면 이름을 가른다(affect ⓔ와 같은 판정).
 * `options_shown` 도 안 싣는다 — v1 오버레이는 선택지를 보여주지 않으므로(P3), 안 보여준
 * 것을 보여줬다고 적으면 그 축이 거짓이 된다(검증기 널허용 recommended_option 과 같은 판정). */
const 선호규격 = Object.freeze({
  '빗소리': Object.freeze({ 차원: 'study_environment', 고정선택: '빗소리', 인자는이유: true }),
  'asmr': Object.freeze({ 차원: 'asmr_track', 고정선택: 'asmr', 인자는이유: false }),
});

/* 결정적 uuid — FNV-1a 64bit 두 레인을 이어 붙여 v4 모양(버전·변형 니블만 고정)으로 접는다.
 * 의존성 0 · Node/Deno 동일 결과. 충돌 확률은 학생×날짜 규모(수천/년)에서 무시 가능. */
function 결정적uuid(글) {
  const 레인 = (씨앗) => {
    let h = 씨앗;
    for (let i = 0; i < 글.length; i += 1) {
      h ^= BigInt(글.charCodeAt(i));
      h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
    }
    return h.toString(16).padStart(16, '0');
  };
  const 손 = 레인(0xcbf29ce484222325n) + 레인(0x84222325cbf29ce4n);
  return (
    손.slice(0, 8) + '-' + 손.slice(8, 12) + '-4' + 손.slice(13, 16) + '-'
    + ((parseInt(손[16], 16) & 0x3) | 0x8).toString(16) + 손.slice(17, 20) + '-' + 손.slice(20, 32)
  );
}

const 때 = (v) => new Date(v).getTime();

/* sent_at 시점 활성 링크(§4-3) — confirmed_at ≤ t < unlinked_at. 활성 링크는 채널당 1(부분
 * 유일 인덱스)이지만 이력엔 여러 행이 있어 시점으로 거른다. */
function 활성링크(링크들, channel_id, t) {
  const 시각 = 때(t);
  const 맞음 = (링크들 || []).filter((l) => l.channel_id === channel_id
    && 때(l.confirmed_at) <= 시각
    && (l.unlinked_at == null || 시각 < 때(l.unlinked_at)));
  return 맞음.length ? 맞음[맞음.length - 1].learner_id : null;
}

/* occurred_at 시점 유효 동의 — `functions/events` ① 과 같은 술어(사후 동의 금지 + 철회 뒤엔
 * 과거 시각을 주장해도 새 «승격»이 없다 — 저장은 지금 벌어지는 일이다). */
function 유효동의(동의목록, t, 지금) {
  const 시각 = 때(t);
  const 이제 = 때(지금);
  const 산것 = (동의목록 || [])
    .filter((c) => 때(c.agreed_at) <= 시각
      && (c.revoked_at == null || (때(c.revoked_at) > 시각 && 때(c.revoked_at) > 이제)))
    .sort((a, b) => 때(a.agreed_at) - 때(b.agreed_at));
  return 산것.length ? 산것[산것.length - 1] : null;
}

/* sent_at 이 속한 라운드 — shown_at ≤ t 인 것 중 가장 최근. 마감 판정은 호출부가 가른다
 * (「라운드 없음」과 「마감 후」는 분모에서 다른 사유다). */
function 라운드찾기(라운드들, t) {
  const 시각 = 때(t);
  const 후보 = (라운드들 || []).filter((r) => 때(r.shown_at) <= 시각)
    .sort((a, b) => 때(a.shown_at) - 때(b.shown_at));
  return 후보.length ? 후보[후보.length - 1] : null;
}

function 카드찾기(카드들, t) {
  const 시각 = 때(t);
  const 후보 = (카드들 || []).filter((c) => 때(c.shown_from) <= 시각
    && (c.shown_to == null || 시각 < 때(c.shown_to)));
  return 후보.length ? 후보[후보.length - 1] : null;
}

/* 원장 한 묶음 → 승격 계획. 순수 — 입력에 없는 것은 지어내지 않고 «제외»로 센다.
 * 재료 = { 메시지들, 라운드들, 링크들, 동의들(learner→[]), 학생들(learner→{level_current,goal_track}),
 *          카드들, 이미승격키(Set<message_id>), 이미승격라운드(Set<`${learner}:${round_id}`>), 지금 } */
function 승격계획(재료) {
  const {
    메시지들 = [], 라운드들 = [], 링크들 = [], 동의들 = {}, 학생들 = {},
    카드들 = [], 이미승격키 = new Set(), 이미승격라운드 = new Set(), 지금,
  } = 재료 || {};
  if (!지금) throw new Error('승격계획: 지금(승격 시점)이 없다 — 동의 술어가 벽시계를 직접 읽으면 회귀가 못 잰다');

  const 계획 = [];
  const 제외 = [];
  const 이번라운드응답 = new Set(); // `${learner}:${round_id}` — 한 묶음 안의 「첫 응답 1건」

  const 빼기 = (m, 사유) => 제외.push({ message_id: m.message_id, command_kind: m.command_kind, 사유 });

  const 정렬 = [...메시지들].sort((a, b) => 때(a.sent_at) - 때(b.sent_at));
  for (const m of 정렬) {
    const 사건이름 = 승격표[m.command_kind];
    if (!사건이름) continue; // 승격 대상 아님 — 원장 보존까지가 오늘의 전부(질문·연동·자발 발화)

    if (이미승격키.has(m.message_id)) { 빼기(m, '이미승격'); continue; }

    const learner_id = 활성링크(링크들, m.channel_id, m.sent_at);
    if (!learner_id) { 빼기(m, '비링크'); continue; }

    const 동의 = 유효동의(동의들[learner_id], m.sent_at, 지금);
    if (!동의) { 빼기(m, '무동의'); continue; }

    const 학생 = 학생들[learner_id] || {};
    const 봉투 = {
      learner_id,
      event_type: 사건이름,
      occurred_at: m.sent_at,
      idempotency_key: m.message_id,
      correlation_id: 결정적uuid(`radio:${learner_id}:${몽골날짜(new Date(m.sent_at))}`),
      level_snapshot: 학생.level_current ?? null,
      goal_snapshot: 학생.goal_track ?? null,
      consent_id: 동의.consent_id,
      consent_ver: 동의.consent_ver,
    };

    if (m.command_kind === '답') {
      if (m.command_arg == null) { 빼기(m, '인자없음'); continue; }
      const 해석 = 답해석(m.command_arg);
      if (!해석) { 빼기(m, '해석불가'); continue; }
      const 라운드 = 라운드찾기(라운드들, m.sent_at);
      if (!라운드) { 빼기(m, '라운드없음'); continue; }
      if (라운드.closed_at != null && 때(m.sent_at) > 때(라운드.closed_at)) { 빼기(m, '마감후'); continue; }
      const 스냅 = 라운드.task_snapshot || {};
      const 보기 = Array.isArray(스냅.보기) ? 스냅.보기 : null;
      if (!보기 || !보기.length) { 빼기(m, '스냅샷불량'); continue; }
      const 자리 = Number(해석.선택);
      if (!Number.isInteger(자리) || 자리 < 1 || 자리 > 보기.length) { 빼기(m, '자리없음'); continue; }
      const 라운드키 = `${learner_id}:${라운드.round_id}`;
      if (이미승격라운드.has(라운드키) || 이번라운드응답.has(라운드키)) { 빼기(m, '중복응답'); continue; }
      이번라운드응답.add(라운드키);

      const payload = {
        round_id: String(라운드.round_id), // 원장 참조 — 재실행 중복 판정과 재도전 고리의 열쇠
        options_shown: 보기,
        selected_option: String(보기[자리 - 1].option_id),
        /* ⑦ 검사(「골랐다고 적었으면 자리도 그 자리여야 한다」)와 한 벌 — 라디오는 학생이
         * 자리 «그 자체»를 쳤으니(`!답 2`) 이 칸이 관측 원문이다. 지어낸 값이 아니다. */
        position: 자리,
      };
      if (해석.확신도) payload.confidence = 해석.확신도; // 'low' | 'guess' — 안 물린 표기는 안 싣는다

      계획.push({
        ...봉투,
        task_type: '라디오퀴즈',
        skill_ids: Array.isArray(스냅.skill_ids) ? 스냅.skill_ids : [],
        skill_taxonomy_ver: 스냅.스킬판 ?? null,
        payload,
        submission: {
          task_ref: 라운드.task_ref,
          task_snapshot: 스냅,
          task_schema_ver: 'radio-round.v1', // 스냅샷 «모양»의 판 — 문항 자체의 판(문항버전)은 스냅샷 안에 있다

          task_format: '응답',
          body_original: m.command_arg, // `!답` 뒤 원문 그대로 — 정답 파생의 반쪽(§4-3)
        },
        /* 60초 재도전 고리 — 이 라운드가 재도전이면 1차 라운드의 «이 학생» 승격 행을 가리킨다.
         * event_id 는 DB 만 아니 Fn 이 (learner, round_id)로 푼다(같은 묶음 안이면 방금 넣은 행). */
        retry_parent_round_id: 라운드.retry_of_round_id != null ? String(라운드.retry_of_round_id) : null,
      });
      continue;
    }

    if (사건이름 === 'preference.stated') {
      const 규격 = 선호규격[m.command_kind];
      const payload = {
        preference_dimension: 규격.차원,
        stated_option: 규격.인자는이유 ? 규격.고정선택 : ((m.command_arg || '').trim() || 규격.고정선택),
        stated_via: 'radio_chat',
      };
      /* ㉠ 확정 — 인자를 쓴 사람만 이유를 남긴다. 안 물었으면 키 자체가 없다(빈칸≠0). */
      if (규격.인자는이유 && m.command_arg) payload.selection_reason = m.command_arg;
      계획.push({ ...봉투, payload });
      continue;
    }

    if (사건이름 === 'affect.reported') {
      /* 자유 서술(인자)은 payload 로 안 올린다 — 원장 body 에 그대로 있고 재파싱 가능(계약 사유). */
      계획.push({ ...봉투, payload: { affect_kind: 'slump', stated_via: 'radio_chat' } });
      continue;
    }

    // submission.created — ⓒ목표선언 · ⓓ자습체크인
    if (m.command_arg == null) { 빼기(m, '인자없음'); continue; }
    const 통로 = m.command_kind === '목표' ? '목표선언' : '자습체크인';
    /* ⓓ의 제시문은 그날 자막 카드다(§2-2). 카드가 안 뜬 시각이면 명령 문법 자체가 과업이다 —
     * ⓒ목표는 상시 안내라 언제나 명령과업. 카드 스냅샷은 원장 원문 그대로 싣는다(불변). */
    const 카드 = 통로 === '자습체크인' ? 카드찾기(카드들, m.sent_at) : null;
    const 과업 = 카드
      ? { task_ref: 카드.content_ref, task_snapshot: 카드.content_snapshot, task_schema_ver: 'radio-card.v1' }
      : 명령과업[통로];
    /* payload 는 비운다 — 「어느 표면인가」는 task_type(통로 축)이 이미 말한다. `stated_via` 를
     * 여기 또 실으면 같은 사실이 두 칸에 살고, c11 이 그 칸을 preference·affect 전용으로 냈다. */
    계획.push({
      ...봉투,
      task_type: 통로,
      payload: {},
      submission: {
        task_ref: 과업.task_ref,
        task_snapshot: 과업.task_snapshot,
        task_schema_ver: 과업.task_schema_ver,
        task_format: '자유발화',
        body_original: m.command_arg,
      },
    });
  }

  return { 계획, 제외, 승격판 };
}

module.exports = { 승격판, 승격표, 명령과업, 선호규격, 결정적uuid, 활성링크, 유효동의, 라운드찾기, 카드찾기, 승격계획 };
