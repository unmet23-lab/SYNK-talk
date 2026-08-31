/* 착지봉투 — ㉤ `jobs_finalize` 의 `_event` 세 블록을 «한 곳에서» 조립한다 (§3-5-b 봉투 표)
 *
 * ■ 왜 제 파일인가 — 이 봉투를 조립하는 층이 둘이다: 워커(deliver-one — 성공·폴백 착지)와
 *   구제(deliver ㉨ — `구제경로` 착지). 두 층이 각자 조립하면 함수 몫 19칸 규칙(A12)·대조
 *   ①~⑩의 «호출자 몫» 반쪽이 갈리고, 갈린 쪽은 착지 예외로만 드러난다(원자라 학생 피해는
 *   없지만 그 학생은 그날 스윕까지 빈손이다).
 * ■ 순수 — DB 0. job 에서 읽을 것(estimator_version·draft)은 인자로 받는다.
 * ■ 함수 몫 19칸(A12)은 «안 싣는다» — learner·시각·동의·판·degraded 전부 ㉤ 가 job 에서 읽는다.
 *   retry_of_event_id 도 안 싣는다(draft 허용 키 밖 · 생성 경로에 재시도가 없다 · §4-2). */
'use strict';
const { 따라말하기문장 } = require('./오늘과제.js');

/**
 * ㉤ `_event` 세 블록 조립.
 * @param {object} 재료
 * @param {string} 재료.estimator_version  job 실행판의 그 값(대조 ⑦ — 같은 값이어야 한다)
 * @param {object|null} 재료.draft         job.event_draft(estimator_confidence·evidence_refs 원천 — 대조 ⑩)
 * @param {string} 재료.outcome            §4-1 값(payload.generation_outcome 과 «같은 값» — 대조 ①)
 * @param {object} 재료.snap               task_snapshot(성공 = 새 조립 · 폴백 = draft 그대로 — A13 두 블록 동일)
 * @param {string|null} 재료.output_text   학생 ①듣기 실물(§7 G5 — 성공 = 검문 후 문장 · 폴백 = draft ② 문장)
 * @param {string|null} 재료.gate_failed   검문탈락의 첫 사유(그 밖 갈래는 null — 키 자체를 생략 · 대조 ③)
 * @param {string|null} 재료.input_text    벤더에 간 본문(안 불렀거나 입력초과면 null · §11-2)
 */
function 착지봉투({ estimator_version, draft, outcome, snap, output_text, gate_failed, input_text }) {
  const d = draft ?? {};
  const iv페이로드 = {
    ver: 2,
    output_text: output_text ?? null,
    generation_outcome: outcome,
    generation_input_text: input_text ?? null,
  };
  if (gate_failed != null) iv페이로드.generation_gate_failed = gate_failed;
  /* reads(c15 · 세층합류 §3) — draft 에 굳힌 «읽기 기록»을 task.assigned payload 로 나른다.
   * 없으면 키 생략({ver:1} 그대로) — 옛 draft·기록 없는 경로의 정직한 모양이고, 커버리지가
   * 그 행을 「기록 없음」으로 따로 센다(0 으로 안 접는다). */
  const ta페이로드 = d.reads != null ? { ver: 1, reads: d.reads } : { ver: 1 };
  return {
    task_assigned: { task_snapshot: snap, payload: ta페이로드 },
    intervention_delivered: {
      estimator_version,
      estimator_confidence: d.estimator_confidence ?? null,
      evidence_refs: d.evidence_refs ?? null,
      payload: iv페이로드,
    },
    submission_row: { task_snapshot: snap, task_schema_ver: 'task.v1' },
  };
}

/**
 * 폴백 착지의 봉투 — task_snapshot 은 **draft 에 굳힌 그대로**(§7-2 — 재호출 0 · §12-28 스파이 축),
 * output_text 는 그 ② 문장(라이브 `deliver:596` 과 같은 형태 · §7 G5).
 * draft 에 task_snapshot 이 없으면 던진다 — 생성 대상 job 의 필수 칸이라(ⓒ-13) 없음은 사고다.
 */
function 폴백봉투({ estimator_version, draft, outcome, gate_failed, input_text }) {
  const snap = (draft && draft.task_snapshot) || null;
  if (!snap) throw new Error('폴백봉투: event_draft.task_snapshot 이 없다(ⓒ-13 필수 칸)');
  return 착지봉투({
    estimator_version, draft, outcome, snap,
    output_text: 따라말하기문장(snap),
    gate_failed: gate_failed ?? null,
    input_text: input_text ?? null,
  });
}

module.exports = { 착지봉투, 폴백봉투 };
