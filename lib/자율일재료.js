'use strict';
/* 일요일 자율일 «재료»의 판정 — 받는 문(`functions/sunday-bundle`)과 시험이 **같은 이 파일**을 쓴다.
 *
 * ■ 왜 함수 안에 안 두나 (F269 · 명부규칙.js 와 같은 축)
 *   판정이 Edge Function 안에만 살면 시험이 그것을 못 태운다. 그러면 재는 것이 «행동»이 아니라
 *   «소스 글자»가 되고, 글자를 지키는 자는 결함도 같이 지킨다. 규칙을 여기 두면 시험이 실제로
 *   묶음을 먹여 판정을 본다. 문은 얇게, 규칙은 한 벌.
 *
 * ■ 이 파일이 «모르는» 것
 *   DB·학생 매핑·시크릿을 모른다(그건 문의 몫). 여기가 아는 것은 「받은 묶음이 표에 들어갈 꼴인가」
 *   하나다. 학생번호 표기형 맞추기도 여기서 안 한다 — 그건 `lib/학생계정.js` 하나가 진다.
 *
 * 정본 = appsscript `docs/자율일_설계_v1.md` v1.3 §⑧ 「다리의 몸통」.
 */

const 날짜꼴 = /^\d{4}-\d{2}-\d{2}$/u;

/* 한 판의 상한 — 1기는 16명이고 학원 주말반이 붙어도 한 자릿수 반이다.
 * 넘치면 자르지 않고 통째로 거절한다(잘라 넣으면 「완료」 얼굴로 일부만 서고, 빠진 학생은
 * 일요일 아침에야 드러난다 · roster-ingest 최대행과 같은 축). */
const 최대묶음 = 200;

/** 봉투(판 전체)가 읽을 수 있는 꼴인가. 여기서 걸리면 **전량 거절**이다 — 한 학생의 문제가 아니다. */
function 봉투검증(몸) {
  const 오류 = [];
  const 자율일 = String((몸 && 몸.자율일) || '').trim();
  const 차시판 = String((몸 && 몸.차시판) || '').trim();
  if (!날짜꼴.test(자율일)) 오류.push('자율일이 yyyy-MM-dd 가 아니다');
  if (!차시판) 오류.push('차시판이 없다 — 옛 묶음이 어느 표를 쥐었는지 못 적는다');
  const 묶음 = 몸 && Array.isArray(몸.묶음) ? 몸.묶음 : null;
  if (!묶음) 오류.push('묶음이 배열이 아니다');
  else if (묶음.length > 최대묶음) 오류.push(`묶음이 ${묶음.length}개다 — 상한 ${최대묶음}`);
  return { 자율일, 차시판, 묶음: 묶음 || [], 오류 };
}

/** 묶음 하나가 표에 들어갈 꼴인가. 사유는 «무엇이 없나»로 적는다(호출자가 그대로 알림에 싣는다). */
function 묶음검증(b, 자율일) {
  const 배정ID = String((b && b.배정ID) || '').trim();
  if (!배정ID) return { 사유: '배정ID 없음', 배정ID: '' };
  const 학생 = String((b && b.학생ID) || '').trim();
  if (!학생) return { 사유: '학생ID 없음', 배정ID };
  const 차시 = Number(b && b.차시);
  if (!Number.isInteger(차시) || 차시 < 1 || 차시 > 99) return { 사유: '차시가 정수 1~99 가 아니다', 배정ID };
  if (!Array.isArray(b && b.항목) || b.항목.length === 0) return { 사유: '항목 0', 배정ID };
  /* 묶음마다 든 자율일이 봉투의 것과 갈리면 «어느 날의 재료인가»가 두 자로 재진다 — 그 갈래는 거절한다
   * (보내는 쪽은 한 판에 한 날만 싣는다 · appsscript `sundayBundleBatch_`). */
  const 제날짜 = String((b && b.자율일) || '').trim();
  if (제날짜 && 제날짜 !== 자율일) return { 사유: `묶음의 자율일(${제날짜})이 봉투와 다르다`, 배정ID };
  return { 배정ID, 학생번호: 학생, 차시 };
}

/** 판 하나를 정상·문제로 가른다. 같은 배정ID 가 둘이면 뒤엣것을 버린다 — 표의 기본키가 어차피 하나만
 *  받고, 어느 쪽이 이겼는지 모르는 채로 남기지 않는다. */
function 행별가르기(묶음들, 자율일) {
  const 정상 = [];
  const 문제들 = [];
  const 본것 = new Set();
  (묶음들 || []).forEach((b) => {
    const 판정 = 묶음검증(b, 자율일);
    if (판정.사유) { 문제들.push({ 배정ID: 판정.배정ID, 사유: 판정.사유 }); return; }
    if (본것.has(판정.배정ID)) { 문제들.push({ 배정ID: 판정.배정ID, 사유: '같은 판에 배정ID 중복' }); return; }
    본것.add(판정.배정ID);
    정상.push({ ...판정, 원본: b });
  });
  return { 정상, 문제들 };
}

/** 이미 있는 재료를 갈아 끼워도 되나 — 🔴 기본은 «안 된다»(발행 뒤 불변 · 설계 §③-㉠).
 *  딱 한 갈래만 참이다: 아직 안 냈고(delivered_event_id 없음) 있던 항목이 0 인데 새것엔 항목이 있다
 *  (공급 실패가 늦게 나은 날 · 배포 검수 P3 21f680c14c40). 학생이 이미 본 것은 그때도 안 바꾼다. */
function 채워도되나(있던, 새묶음) {
  if (!있던) return false;
  if (있던.delivered_event_id) return false;
  const 있던항목 = 있던.bundle && Array.isArray(있던.bundle.항목) ? 있던.bundle.항목.length : 0;
  const 새항목 = 새묶음 && Array.isArray(새묶음.항목) ? 새묶음.항목.length : 0;
  return 있던항목 === 0 && 새항목 > 0;
}

/* ── 내는 쪽 ─────────────────────────────────────────────────────────────────
 * 받아 둔 재료를 «그날 배정 1건»으로 조립한다. 배정 행을 쓰는 것은 `functions/deliver` 지만
 * 조립 규칙은 여기 있다 — 시험이 태울 수 있어야 하고, 앱·서버가 같은 판을 봐야 한다.
 */

/* 배정 행의 과제 갈래 — 계약 `task_type` 아홉 중 하나여야 한다(`learning_events_task_type_c16` 이 강제).
 * 자율일 묶음 한 건에는 낭독·답하기(발화녹음)와 굳히기·오답(퀴즈응답)이 «섞여» 있다. 배정 행은 갈래를
 * 하나만 드니 그 대표는 «숙제제출» 이다(일요일 자율일 = 그 주 숙제 묶음). 형식은 행이 아니라 항목마다 적힌다
 * (배달 머리말 「행의 task_format 은 비운다」와 같은 축 — 한 칸에 담으면 낭독 데이터로 회화를 학습하는 꼴이 된다). */
const 자율일TASK_TYPE = '숙제제출';
const 자율일SNAP_VER = '자율일.v1';

/** 이 스냅샷이 자율일 판인가 — 거름망·라우팅의 갈래(게임 판정과 같은 꼴). */
function 자율일스냅샷인가(snap) {
  return !!(snap && typeof snap === 'object' && !Array.isArray(snap)
    && snap.ver === 자율일SNAP_VER && Array.isArray(snap.항목));
}

/** 재료 행 하나 → 배정 한 건. 낼 수 없으면 null(호출자의 다음 갈래가 받는다 — 학생이 빈손이 되지 않는다). */
function 자율일배정(재료행) {
  if (!재료행) return null;
  if (재료행.delivered_event_id) return null;         // 이미 냈다 — 하루 1건
  const 묶음 = 재료행.bundle;
  if (!묶음 || typeof 묶음 !== 'object') return null;
  const 항목 = Array.isArray(묶음.항목) ? 묶음.항목 : [];
  if (!항목.length) return null;                      // 항목 0 은 «낼 것이 없다» — 공급 실패는 appsscript 가 이미 적었다
  const 배정ID = String(묶음.배정ID || 재료행.assignment_id || '').trim();
  if (!배정ID) return null;
  return {
    task_type: 자율일TASK_TYPE,
    task_ref: 배정ID,                                  // 묶음 전체를 가리킨다 — 항목ID 는 «제출»이 가리킨다(설계 §⑥)
    task_schema_ver: 자율일SNAP_VER,
    출처: '자율일',
    degraded: false,                                   // 강등이 아니다 — 못 내면 아예 null 이고 다음 갈래가 받는다
    task_snapshot: {
      ver: 자율일SNAP_VER,
      날짜: String(재료행.autonomy_date || 묶음.자율일 || ''),
      배정ID,
      차시: Number(재료행.week_no || 묶음.차시) || null,
      차시판: String(재료행.week_ver || 묶음.차시판 || ''),
      주유형: Array.isArray(묶음.주유형) ? 묶음.주유형 : [],
      목표: Array.isArray(묶음.목표) ? 묶음.목표 : [],
      항목,
    },
  };
}

/* 🔴 학생에게 내보내도 되는 키 — **허용 목록**이다(차단 목록이 아니다 · `lib/오늘과제.js` ②-20 과 같은 축).
 *   자율일 판에서 새면 안 되는 것이 둘이다:
 *     ①`문항.정답` — 채점은 appsscript `quiz_log` 가 한다(설계 §⑥). 앱은 고른 답만 되돌려 주면 된다.
 *     ②`원오답` — 그 학생이 «언제 무엇을 틀렸나»의 고리다. 화면에 쓸 데가 없고, 나가면 되돌릴 수 없다.
 *   새 키의 기본값은 「안 나감」이라, 항목에 칸이 하나 늘어도 그 자리에서 사람이 「이걸 학생이 봐도 되나」를 정한다. */
const 학생공개키 = Object.freeze({
  최상위: Object.freeze(['ver', '날짜', '배정ID', '차시', '주유형', '항목']),
  항목: Object.freeze(['항목ID', '종류', '문장', '물음', '역할', '문항']),
  문항: Object.freeze(['문장', '보기']),
});

/** 자율일 스냅샷에서 학생에게 줄 판만 남긴다 — 목록 밖 키는 전부 지운다. 원본은 안 건드린다. */
function 학생판자율일스냅샷(snap) {
  if (!자율일스냅샷인가(snap)) return snap;
  const 골라내기 = (o, 허용) => Object.fromEntries(Object.entries(o).filter(([k]) => 허용.includes(k)));
  const 판 = 골라내기(snap, 학생공개키.최상위);
  판.항목 = (snap.항목 || []).map((칸) => {
    if (!칸 || typeof 칸 !== 'object' || Array.isArray(칸)) return 칸;
    const 남긴 = 골라내기(칸, 학생공개키.항목);
    /* 허용 키 «안쪽»도 거른다 — 문항 속에 정답이 산다(허용 키 안이라고 안 보면 거기로 샌다). */
    if (남긴.문항 && typeof 남긴.문항 === 'object' && !Array.isArray(남긴.문항)) {
      남긴.문항 = 골라내기(남긴.문항, 학생공개키.문항);
    }
    return 남긴;
  });
  return 판;
}

module.exports = {
  날짜꼴, 최대묶음, 봉투검증, 묶음검증, 행별가르기, 채워도되나,
  자율일TASK_TYPE, 자율일SNAP_VER, 자율일스냅샷인가, 자율일배정, 학생공개키, 학생판자율일스냅샷,
};
