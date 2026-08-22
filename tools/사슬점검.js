#!/usr/bin/env node
'use strict';
/**
 * 사슬 점검 — 수집 → 축 계산 → 스탬프 → 회수가 **끝까지 도는지** 한 바퀴 돌려 본다.
 *
 * ■ 왜 필요한가 (유호님 지시 2026-08-12 「둘 다 해줘」 · 철학×시스템 점검의 도전안)
 *   개원은 2027-02-25 이고 오늘 학생은 **0명**이다. 그래서 이 사슬은 **한 번도 끝까지 돈 적이
 *   없다.** 첫날 16명이 들어오면 그날부터 소급 불가 데이터가 흐르는데, 그때 파이프가 처음
 *   도는 것이면 첫 시즌 두 달이 통째로 디버깅 기간이 된다(첫 시즌 나침반 답은 첫 시즌에만 적힌다).
 *   → 값이 아니라 **어디서 끊기는지**를 지금 본다. 값은 합성이라 뜻이 없고, 끊긴 자리는 진짜다.
 *
 * ■ 🔴 이 도구가 재는 것과 **안** 재는 것 (안 가르면 초록이 거짓말을 한다)
 *   잰다   = 순수 계산층 — `lib/학습자상태.js`(성향 축 전부) · `lib/성과회수.js`(관측·창별·연결률).
 *            재료를 **다 준** 이상적 조건에서 축이 실제로 값을 내는가.
 *   안 잰다 = DB·Edge Function·앱 왕복. 그 층은 리허설 배포와 왕복시험이 진다
 *            (`tools/배달왕복시험.js`). 여기가 초록이라고 라이브가 도는 것이 **아니다**.
 *   🔑 그래서 이 도구의 초록은 「코드가 준비됐다」이고, 빨강은 「재료를 다 줘도 안 된다」다.
 *      뒤엣것이 훨씬 값어치가 크다 — 그건 라이브를 켜도 안 될 것이라는 뜻이기 때문이다.
 *
 * ■ 실행: node tools/사슬점검.js  ·  자세히: node tools/사슬점검.js --자세히
 */

const { 학습자상태, 창일수, 추정판, 쓰는사건: 상태가쓰는사건 } = require('../lib/학습자상태.js');
/* 🔴 집중띠 축(v7)은 **현지 시각**을 쓰고, 안 넘기면 그 축만 null 이라 이 도구가 「사슬이 끊겼다」로
 * 읽는다(실측 2026-08-12 — 축을 늘린 그 자리에서 이 검사가 먼저 빨개졌다 = 래칫이 도는 증거).
 * IANA 이름은 여기 다시 적지 않는다 — `lib/오늘과제.js` 가 정본이다. */
const { 시간대 } = require('../lib/오늘과제.js');
const { 회수요약, 성과회수, 회수창, 쓰는사건: 회수가쓰는사건 } = require('../lib/성과회수.js');
const { 칸들: 작성칸들 } = require('../lib/작성과정.js');
/* G4 표식의 정본 — 강제산출축(v9)이 이 챌린지로 행을 가른다. 리터럴 사본을 두면 팩이 id 를
 * 간 날 합성 이력만 옛 표식을 들고 남는다(추정판을 안 베끼는 것과 같은 이유). */
const { 모듈상수: 서류관문상수 } = require('../contents/서류관문문항.js');
const { 인자게이트 } = require('../lib/플래그.js');   // 모르는 낱말 거절(공용 판정 · F435)

/* 🎯 조준 축은 **없다** — 합성 이력으로 코드만 재는 도구다(DB·Edge Fn·자격증명 0). */
const 아는플래그 = ['--자세히'];

const 일 = 86400000;
const 날수 = 60;
/* 🔴 고정 기점을 쓴다 — `Date.now()` 로 돌리면 같은 코드가 날마다 다른 답을 내고, 그러면
 *   「어제는 초록이었는데」의 원인이 코드인지 날짜인지 영원히 못 가른다. */
const 기점 = Date.UTC(2026, 5, 1);
const t = (일수) => new Date(기점 + 일수 * 일).toISOString();
const 끝시각 = t(날수);

/* ── 합성 이력 — 계약 c9·c10·c11 이 요구하는 «읽히는 칸»만 채운다.
 * ⚠ 계약 전량이 아니다(검증기 통과가 목적이 아니라 축이 값을 내는지가 목적이다). 그 차이를
 *   여기 적어 둔다 — 안 적으면 다음 사람이 이 파일을 「계약 픽스처」로 오해해 베낀다. */
function 합성이력() {
  const 행들 = [];
  const 개입들 = [];
  let n = 0;
  const id = (p) => `${p}-${(n += 1).toString().padStart(3, '0')}`;

  for (let d = 0; d < 날수; d += 1) {
    /* ① 배정 — 리듬축의 분모이자 마감(`due_at`)의 유일한 원본(c10). */
    행들.push({ event_id: id('a'), event_type: 'task.assigned', occurred_at: t(d),
      due_at: t(d + 1), task_type: '발화녹음' });

    /* ② 개입 — 회수의 닻. 배달층이 상태를 스탬프한 행 그대로의 모양이다. */
    const iv = id('iv');
    행들.push({ event_id: iv, event_type: 'intervention.delivered', occurred_at: t(d + 0.05),
      /* 판 이름은 **베끼지 않는다** — 리터럴로 두면 축을 늘려 판을 올린 날 합성 이력만 옛 판을
       * 들고 남고, 그 어긋남은 어디서도 안 빨개진다(2026-08-12 v7 에서 실제로 그럴 뻔했다). */
      intervention_id: `IV-${d}`, policy_ver: '오늘과제.v3', estimator_version: 추정판 });
    개입들.push({ iv, d });

    /* ③ 관측 — 개입 넷 중 셋만 열람한다(연결률이 1.0 이면 그 값이 도는지 안 도는지 못 가른다). */
    if (d % 4 !== 3) {
      행들.push({ event_id: id('cv'), event_type: 'content.viewed', occurred_at: t(d + 0.3),
        parent_event_id: iv });
    }

    /* ④ 제출 — 넷 중 셋(제출률 0.75). 그중 하나는 교정을 받고 다시 낸 것(끈기축 재시도). */
    if (d % 4 !== 2) {
      const 씀 = d % 3 === 0;   // 쓰기 과제만 작성과정 4칸을 든다(음성 제출엔 잴 타건이 없다)
      행들.push({
        event_id: id('s'), event_type: 'submission.created', occurred_at: t(d + 0.6),
        task_type: 씀 ? '쓰기' : '발화녹음',
        retry_of_event_id: d % 7 === 0 ? `s-prev-${d}` : null,
        payload: 씀 ? { compose_meta: Object.fromEntries(작성칸들.map((k, i) => [k, 100 + i * 7 + d])) } : {},
      });
    } else if (d % 8 === 2) {
      /* ⑤ 이탈 — 끈기축의 유일한 「그만뒀다」 신호. */
      행들.push({ event_id: id('ab'), event_type: 'session.abandoned', occurred_at: t(d + 0.6) });
    }

    /* ⑥ 교정 열람·응답 — 피드백수용축은 «교정 단위»로 잇는다(`correction_id` 가 고리). */
    if (d % 3 === 1) {
      const cid = `C-${d}`;
      행들.push({ event_id: id('crv'), event_type: 'correction.viewed', occurred_at: t(d + 0.7), correction_id: cid });
      if (d % 6 === 1) {
        행들.push({ event_id: id('crr'), event_type: 'correction.responded', occurred_at: t(d + 0.75),
          correction_id: cid, payload: { learner_response: d % 12 === 1 ? '채택' : '무시' } });
      }
    }

    /* ⑦ 선택 — 관심축. 차원을 둘 섞는다(차원이 하나면 `차원별` 이 도는지 안 도는지 못 본다). */
    if (d % 2 === 0) {
      행들.push({ event_id: id('ch'), event_type: 'choice.selected', occurred_at: t(d + 0.65),
        payload: { choice_dimension: d % 10 === 0 ? '평생목표' : '오늘기분',
          selected_option: `opt-${d % 3}`, position: d % 2, recommended_option: null,
          options_shown: [{ option_id: 'opt-0' }, { option_id: 'opt-1' }, { option_id: 'opt-2' }] } });
    }

    /* ⑧⑨⑩ 라디오 승격기가 내는 셋(c11) — 자기인식·선호·정서. */
    if (d % 3 === 0) {
      행들.push({ event_id: id('q'), event_type: 'quiz.answered', occurred_at: t(d + 0.4),
        payload: { confidence: ['확신', '애매', '찍음'][d % 3 === 0 ? (d / 3) % 3 : 0] } });
    }
    if (d % 5 === 0) {
      행들.push({ event_id: id('pr'), event_type: 'preference.stated', occurred_at: t(d + 0.45),
        payload: { preference_dimension: d % 10 === 0 ? 'study_environment' : 'asmr_track',
          stated_option: `opt-${(d / 5) % 2}`, stated_via: 'radio_chat',
          ...(d % 10 === 0 ? { selection_reason: '집중이 잘돼서' } : {}) } });
    }
    if (d % 11 === 0) {
      행들.push({ event_id: id('af'), event_type: 'affect.reported', occurred_at: t(d + 0.5),
        payload: { affect_kind: 'slump' } });
    }
    /* ⑫ 성향 확인 답(c13 Ⅲ⑥) — 확인축 재료. 긍·부정을 다 낸다(하나면 「축이 값을 낸다」는
     * 초록이 반쪽만 도는 상태를 덮는다 — G2 세 갈래와 같은 이유). */
    if (d % 7 === 0) {
      행들.push({ event_id: id('er'), event_type: 'estimate.responded', occurred_at: t(d + 0.55),
        payload: { trait_axis: '리듬', shown_key: d % 14 === 0 ? '여유제출' : '반복제출',
          shown_text: '요즘 과제를 마감보다 미리 내고 계시던데요 — 미리 계획해 두는 편이에요?',
          response: d % 14 === 0 ? '맞다' : '아니다',
          estimator_version: '학습자상태.v13+성향확인.v1', estimate_as_of: t(d + 0.5) } });
    }

    /* ⑪ G2 「보고서 교정」 지목 — 탐지축(v8). 세 갈래를 다 낸다: 짚음 · 「고칠 곳 없음」 ·
     * 무반응. 🔴 갈래가 하나면 「축이 값을 낸다」는 초록이 세 뜻 중 하나만 도는 상태를 덮는다.
     * ⚠ 표식은 `options_shown` + `rejected_all` **한 벌**이다(`lib/학습자상태.G2지목행인가`) —
     * 위 ⑦⑧ 행들이 이 표식을 안 갖는 것이 곧 「G2 만 센다」의 실증이다. */
    const 보기3 = [
      { option_id: 'w1', label: '회의' }, { option_id: 'w2', label: '시간을' }, { option_id: 'w3', label: '정해졌습니다.' },
    ];
    if (d % 4 === 0) {
      행들.push({ event_id: id('g2s'), event_type: 'submission.created', occurred_at: t(d + 0.7),
        task_type: '숙제제출',
        submission: { task_ref: `g2-${d}`, task_format: '쓰기첨삭', body_original: '회의 시간이 정해졌습니다.' },
        payload: { ver: 1, attempt_no: 1, options_shown: 보기3,
          selected_option: 보기3[d % 3].option_id, position: (d % 3) + 1,
          rejected_all: false, skipped: false, latency_ms: 2000 + (d % 5) * 400,
          ...(d % 8 === 0 ? { selection_reason: '조사:주격(이/가·은/는)' } : {}) } });
    }
    if (d % 6 === 0) {
      행들.push({ event_id: id('g2n'), event_type: 'quiz.answered', occurred_at: t(d + 0.72),
        task_type: '퀴즈응답',
        submission: { task_ref: `g2n-${d}`, task_format: '쓰기첨삭' },
        payload: { ver: 1, attempt_no: 1, options_shown: 보기3, rejected_all: true, skipped: false } });
    }
    if (d % 9 === 0) {
      행들.push({ event_id: id('g2k'), event_type: 'quiz.answered', occurred_at: t(d + 0.74),
        task_type: '퀴즈응답',
        submission: { task_ref: `g2k-${d}`, task_format: '쓰기첨삭' },
        payload: { ver: 1, attempt_no: 1, options_shown: 보기3, rejected_all: false, skipped: true } });
    }

    /* ⑫ G4 「서류 관문」 지목 — 강제산출축(v9). 세 갈래를 다 낸다: 빈칸(친 것) · 「모르겠어요」 ·
     * 변환(열린 산출). 🔴 갈래가 하나면 모름넘김률·재도전률·빈칸체류 중 일부만 도는 상태를
     * 초록이 덮는다. ⚠ 표식은 `submission.task_snapshot.challenge_id`(팩 정본 지목)다 —
     * 위 ⑪ G2 행들이 스냅샷 없이 서는 것이 곧 「G4 만 센다」의 실증이다. */
    if (d % 4 === 1) {
      행들.push({ event_id: id('g4b'), event_type: 'quiz.answered', occurred_at: t(d + 0.76),
        task_type: '퀴즈응답',
        submission: { task_ref: `g4b-${d}`, task_format: '응답', body_original: '에서',
          task_snapshot: { challenge_id: 서류관문상수.challenge_id, prompt_seed: 'g4t01.b1' } },
        payload: { ver: 1, attempt_no: d % 8 === 1 ? 2 : 1, latency_ms: 1500 + (d % 4) * 300 } });
    }
    if (d % 6 === 1) {
      행들.push({ event_id: id('g4k'), event_type: 'quiz.answered', occurred_at: t(d + 0.78),
        task_type: '퀴즈응답',
        submission: { task_ref: `g4k-${d}`, task_format: '응답',
          task_snapshot: { challenge_id: 서류관문상수.challenge_id, prompt_seed: 'g4t01.b2' } },
        payload: { ver: 1, attempt_no: 1, skipped: true } });
    }
    if (d % 9 === 1) {
      행들.push({ event_id: id('g4t'), event_type: 'submission.created', occurred_at: t(d + 0.8),
        task_type: '숙제제출',
        submission: { task_ref: `g4t-${d}`, task_format: '높임전환', body_original: '서류를 드리러 왔습니다.',
          task_snapshot: { challenge_id: 서류관문상수.challenge_id, prompt_seed: 'g4t01.t1' } },
        payload: { ver: 1, attempt_no: 1 } });
    }
  }
  return { 행들, 개입들 };
}

/* ── 칸별 판정 ─────────────────────────────────────────────────────────────── */

/**
 * 판정 본체 — **행들을 인자로 받는다.** 🔑 합성 이력을 안에서 만들지 않는 이유: 그러면 이
 * 도구의 «탐지력»을 잴 방법이 없다. 재료를 일부러 뺀 이력을 넣어 끊김이 잡히는지 봐야 하고,
 * 그 검사가 없으면 이 도구의 초록은 「돌았다」가 아니라 「아무것도 안 쟀다」와 같은 모양이다.
 */
function 판정(행들, 기준시각, 자세히 = false) {
  const 끝시각 = 기준시각;
  const 줄 = [];
  const 끊김 = [];

  줄.push('■ 사슬 한 바퀴 — 합성 이력 ' + 날수 + '일 (순수 계산층만 · 학생 0명이라 실데이터가 아니다)');
  줄.push('');

  /* ① 수집 — 사건이 실제로 몇 종 만들어졌나. 종이 빠지면 그 축은 원리상 null 이다. */
  const 종별 = {};
  for (const e of 행들) 종별[e.event_type] = (종별[e.event_type] || 0) + 1;
  const 걷어야할것 = [...new Set(회수가쓰는사건)];
  const 안만들어진종 = 걷어야할것.filter((et) => !종별[et]);
  줄.push(`① 수집    ${행들.length}건 · ${Object.keys(종별).length}종`
    + (안만들어진종.length ? `  🔴 안 만든 종: ${안만들어진종.join(', ')}` : '  ✅'));
  if (안만들어진종.length) 끊김.push(`합성 이력이 ${안만들어진종.join('·')} 를 안 만든다 — 그 축은 원리상 null 이다`);

  /* ② 축 계산 — 축 중 몇 개가 값을 내나. 여기가 이 도구의 급소다.
   * 🔑 개수를 여기 적지 않는다(모듈에서 파생한다) — 적으면 축을 늘린 날 주석만 옛 수를 든다. */
  const 상태 = 학습자상태(행들, { as_of: 끝시각, 시간대 });
  const 축이름 = Object.keys(상태.축);
  const 빈축 = 축이름.filter((k) => 상태.축[k] == null);
  줄.push(`② 축 계산  ${축이름.length - 빈축.length}/${축이름.length}축이 값을 냈다`
    + (빈축.length ? `  🔴 null: ${빈축.join(', ')}` : '  ✅'));
  if (빈축.length) {
    끊김.push(`재료를 다 줬는데 ${빈축.join('·')} 축이 null 이다 — 라이브를 켜도 그 축은 안 찬다`);
  }

  /* ③ 스탬프 — 개입 행에 실려야 하는 셋. 하나라도 비면 나중에 되짚을 길이 없다. */
  const 스탬프 = ['estimator_version', 'estimator_confidence', 'evidence_refs']
    .filter((k) => 상태[k] == null || 상태[k] === '');
  줄.push(`③ 스탬프  판 ${상태.estimator_version} · 신뢰도 ${상태.estimator_confidence}`
    + (스탬프.length ? `  🔴 빈 칸: ${스탬프.join(', ')}` : '  ✅'));
  if (스탬프.length) 끊김.push(`개입에 찍을 ${스탬프.join('·')} 가 비었다`);

  /* ④ 회수 — 개입이 관측으로 이어지나(연결률). 0 이면 배달이 헛도는 것이다. */
  const 요약 = 회수요약(행들, { 기준시각: 끝시각 });
  줄.push(`④ 회수    개입 ${요약.개입} · 닿음 ${요약.닿음} · 고리없음 ${요약.고리없음}`
    + ` · 연결률 ${요약.연결률 ?? '분모0'}`
    + (요약.개입 > 0 && 요약.닿음 > 0 ? '  ✅' : '  🔴'));
  if (요약.개입 === 0) 끊김.push('개입 행이 0건이라 회수가 닻을 못 찾는다');
  else if (요약.닿음 === 0) 끊김.push('개입이 관측으로 하나도 안 이어졌다 — 관측 짝(parent_event_id)이 안 실린다');

  /* ⑤ 창별 — 「측정」이 하나도 없으면 성과 축이 도는지 이 도구로는 증명이 안 된 것이다. */
  const 잰창 = 회수창.filter((n) => 요약.창별[`${n}일`].측정 > 0);
  줄.push(`⑤ 창별    ${회수창.map((n) => {
    const c = 요약.창별[`${n}일`];
    return `${n}일(측정 ${c.측정}·미도래 ${c.미도래}·표본0 ${c.표본0})`;
  }).join(' · ')}` + (잰창.length === 회수창.length ? '  ✅' : '  🔴'));
  if (잰창.length < 회수창.length) {
    const 못잰 = 회수창.filter((n) => !잰창.includes(n));
    끊김.push(`${못잰.join('·')}일 창이 한 번도 「측정」에 안 들어갔다 — 창 계산이 도는지 증명 안 됨`);
  }

  /* ⑥ 개입 하나를 끝까지 — 이전·이후가 나란히 서는지(뺄셈 없이).
   * 🔴 개입이 0건인 상태에서 이 칸이 **도구를 죽였다**(2026-08-12 · 회귀가 잡았다). 그 상태는
   *   예외가 아니라 **개원 첫날의 정상**이다 — 배달이 한 번도 안 나간 날. 진단 도구가 진단
   *   대상의 가장 이른 상태에서 죽으면, 정작 필요한 첫날에 아무것도 못 본다. */
  const 첫개입 = 행들.find((e) => e.event_type === 'intervention.delivered');
  if (!첫개입) {
    줄.push('⑥ 한 건    🔴 개입 행이 0건이라 끝까지 따라갈 개입이 없다');
    끊김.push('따라갈 개입이 0건 — ⑥ 칸을 건너뛰었다(배달이 한 번도 안 나갔다는 뜻이다)');
  } else {
    const 한건 = 성과회수(첫개입, 행들, { 기준시각: 끝시각 });
    const 나란히 = 회수창.map((n) => 한건.성과[`${n}일`]).filter((v) => v && v.이전 && v.이후).length;
    줄.push(`⑥ 한 건    관측 ${한건.관측.닿음 ? '닿음' : '없음'}`
      + ` · 이전/이후가 나란히 선 창 ${나란히}/${회수창.length}`
      + (나란히 > 0 ? '  ✅' : '  🔴'));
    if (나란히 === 0) 끊김.push('개입 하나에서 이전/이후 상태가 한 창도 안 섰다');
  }

  줄.push('');
  if (끊김.length) {
    줄.push('🔴 끊긴 자리 ' + 끊김.length + '곳 — 재료를 다 줘도 안 되는 자리다(라이브를 켜도 안 된다):');
    끊김.forEach((s, i) => 줄.push(`   ${i + 1}. ${s}`));
  } else {
    줄.push('✅ 순수 계산층은 끝까지 돈다 — 수집→축→스탬프→회수→창별이 전부 값을 냈다.');
    줄.push('   ⚠ 그래도 **라이브는 0이다**: DB·Edge Function·앱 왕복은 이 도구가 안 잰다');
    줄.push('     (그 층은 리허설 배포와 `tools/배달왕복시험.js` 가 진다 · 학생 0명 · 개원 2027-02-25).');
  }

  if (자세히) {
    줄.push('');
    줄.push('── 축 값(합성이라 «값»에는 뜻이 없다 — 「채워졌나」만 본다) ──');
    for (const k of 축이름) 줄.push(`  ${k}: ${JSON.stringify(상태.축[k])}`);
    줄.push('');
    줄.push(`── 창 ${창일수}일 · 상태가 읽는 사건 ${상태가쓰는사건.length}종 · 회수가 읽는 사건 ${회수가쓰는사건.length}종 ──`);
  }

  return { 줄, 끊김, 상태, 요약 };
}

function 점검() {
  const args = process.argv.slice(2);
  /* 🔴 게이트가 «점검 앞»이다 — 뒤에 두면 `--자세이` 오타에 요약만 나오고 exit 0 이라,
   *   자세히 보려던 사람이 「자세히 볼 게 없구나」로 읽는다(조용한 무시가 곧 F400·F435). */
  const 플래그오류 = 인자게이트('사슬점검', args, 아는플래그);
  if (플래그오류) { console.error(`[사슬점검] ${플래그오류}`); process.exit(1); }
  const { 행들 } = 합성이력();
  const { 줄, 끊김 } = 판정(행들, 끝시각, args.includes('--자세히'));
  console.log(줄.join('\n'));
  /* 🔴 끊긴 자리가 있으면 종료 코드를 1 로 낸다 — 사람이 화면을 읽어야만 아는 도구는
   *   결국 아무도 안 돌린다. CI·배치가 이 코드로 판정할 수 있게 한다. */
  process.exitCode = 끊김.length ? 1 : 0;
}

/* 직접 실행일 때만 돈다 — 테스트가 require 하면 출력 없이 함수만 가져간다. */
if (require.main === module) 점검();

module.exports = { 판정, 합성이력, 끝시각, 날수 };
