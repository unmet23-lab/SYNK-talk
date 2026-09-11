'use strict';
// 직원 인증·401 갱신·계약판은 기존 통로를 사용한다. 기록을 기기에 저장하지 않는다.
import { 부르기 } from './사건통로.js';
import { 인증오류 } from './인증API.js';

function 계약오류() {
  throw new 인증오류('CONTRACT_VIOLATION', '기록을 확인하지 못했어요. 잠시 뒤 다시 열어 주세요.', true);
}

export async function 학생목록받기(토큰) {
  const 답 = await 부르기('teach/records/roster', 토큰);
  if (!Array.isArray(답?.roster)) 계약오류();
  return 답.roster.map((r) => {
    if (typeof r?.learner_id !== 'string') 계약오류();
    return { id: r.learner_id, 이름: r.display_name || r.student_code || '이름 미등록',
      반: r.class_name || r.class_key || '반 이름 미등록' };
  });
}

export function 기록응답확인(답, 학생id) {
  if (답?.student?.learner_id !== 학생id || !Number.isInteger(답.limit) || 답.limit < 1
      || !['available', 'consent_required'].includes(답.learning_access)
      || !Number.isFinite(Date.parse(답.retrieved_at))) 계약오류();
  for (const 종류 of ['observations', 'submissions', 'feedback']) {
    if (!Array.isArray(답[종류]?.items) || typeof 답[종류].has_more !== 'boolean'
        || 답[종류].items.length > 답.limit) 계약오류();
    if (답[종류].items.some((r) => !r || typeof r !== 'object' || Array.isArray(r))) 계약오류();
  }
  if (답.learning_access === 'consent_required'
      && (답.submissions.items.length || 답.feedback.items.length)) 계약오류();
  return 답;
}

export async function 학생기록받기(토큰, 학생id) {
  const 답 = await 부르기(`teach/records/student?learner_id=${encodeURIComponent(학생id)}`, 토큰);
  return 기록응답확인(답, 학생id);
}
