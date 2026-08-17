'use strict';
/**
 * 시험결과 — 강사가 넣는 `exam.result`(TOPIK 실성적)의 **조립기**. 순수 함수만.
 *
 * ■ 이 파일이 있는 이유 (c6 유호 확정 2026-08-06 · 계약 `시험규격_2026-08-17`)
 *   사건 이름은 c6 부터 있었고 payload 규격은 「첫 생산자가 서는 판에서 정한다」로 비어 있었다.
 *   그 생산자가 `functions/teach` 의 `exam/save` 이고, **무엇을 적어야 그 행이 나중에 읽히는가**
 *   를 정하는 것이 이 파일이다.
 *
 * ■ 🔴 이 사건의 «첫 몫» — 출처를 가른다
 *   계약 c6 이 이 사건을 만들며 적어 둔 그대로다: 라이브 `academic_log` 의 「급수」 한 칸이
 *   **TOPIK 정식 급수와 학원 자체 급수를 섞고 있다.** 섞은 채로 쌓기 시작하면 나중에 못 가르고,
 *   못 가른 급수로 학습자 모델을 세우면 그 학생의 실력 추정이 통째로 어긋난다. 그래서
 *   ①`exam_kind` 가 필수고 ②같은 행의 `level_snapshot`(그때의 **학원** 급수)과 나란히 선다 —
 *   두 급수가 한 행에서 갈려야 「우리 판정이 실성적과 얼마나 맞았나」를 잴 수 있다.
 *
 * ■ 🔴 `exam_date` 는 `occurred_at` 으로 대신 못 센다
 *   `occurred_at` 은 강사가 **입력한** 시각이다. 성적표를 몰아서 넣는 날이 정상이고(주말 한 번에
 *   반 전체), 입력 시각으로 정렬하면 급수가 오른 시점이 통째로 밀린다. 시즌 회고는 이 행을
 *   **구간으로 거르므로** 그 밀림은 곧 「어느 시즌의 성적인가」를 바꾼다.
 *
 * ■ 🔴 문턱을 셋에서 멈춘 이유
 *   강사가 성적표를 손에 안 든 채 급수만 아는 날이 **정상**이다(학생이 구두로 알린 모의 결과).
 *   거기서 회차·영역점수까지 요구하면 그 급수마저 못 들어오고, 없는 값을 지어내게 만드는 문턱은
 *   축 자체를 거짓으로 만든다(`options_shown`·`recommended_option` 의 「지어내기 금지」와 같은 판정).
 *
 * ⚠ 이 파일은 **판정만 한다** — DB 도 시각도 안 만진다. 「오늘」이 필요한 검사(미래 응시일)는
 *   `지금` 을 인자로 받는다: 시험이 결정적이어야 하고(`new Date()` 직접 호출 금지 · 선택로그가
 *   섞기를 주입받은 것과 같은 이유), 서버 시계가 하루 밀린 날 조립기가 조용히 달라지면 안 된다.
 */

/**
 * 🔴 **시험의 종류** — 정식과 모의를 가르는 닫힌 어휘.
 *
 * 왜 값목록이 계약이 아니라 여기인가: 모의고사 종류가 하나 늘 때마다 계약 개정을 부르면 그게
 * 곧 「새 시험 = 계약 판」이다(`choice_dimension` 을 `lib/선택로그.차원들` 에 둔 것과 같은
 * 판정 · 계약 `선택차원_등재_2026-08-10`). 계약은 **이름**(`exam_kind`)을 내고 값은 여기서 파생한다.
 *
 * 🚫 「학원 자체 레벨테스트」를 여기 넣지 않는다 — 그것이 바로 `level_snapshot` 이고, 같은 칸에
 *   넣으면 이 사건이 막으려던 섞임을 이 사건 안에서 다시 만든다.
 */
const 종류들 = Object.freeze({
  topik_official: '한국어능력시험(TOPIK) 정식 응시 — 국립국제교육원 성적',
  topik_mock: '모의고사 — 학원·교재·외부 모의 응시 결과(정식 성적이 아니다)',
});

/** 판정 급수 — TOPIK I(1~2)·II(3~6), 그리고 **0 = 급수 미달(불합격)**.
 *  🔑 0 을 「값 없음」으로 접지 않는다: 「봤는데 급수가 안 나왔다」와 「안 봤다」는 정반대 신호이고,
 *    전자는 그 학생에 대한 가장 강한 정보 중 하나다. */
const 급수최소 = 0;
const 급수최대 = 6;

/** 영역별 점수의 닫힌 축 — TOPIK 성적표의 영역 그대로. 각 0~100.
 *  🚫 총점은 안 받는다 — 영역 합이라 파생이고, 파생을 저장하면 둘이 어긋나는 날 어느 쪽이
 *    참인지 아무도 못 정한다(계약 `정본_경계`). */
const 영역들 = Object.freeze(['listening', 'reading', 'writing']);

const 날짜꼴 = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` 가 **실재하는 날짜**인가 — `2026-02-31` 같은 값을 `Date` 가 조용히 굴리는 것을 막는다. */
function 실재하는날(값) {
  if (!날짜꼴.test(값)) return false;
  const [y, m, d] = 값.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * 강사 입력 → `exam.result` 의 payload. 흠이 있으면 `{ 흠: { 필드, 사유 } }`.
 *
 * @param {object} 입력 `{ exam_kind, exam_date, exam_level, exam_round?, section_scores? }`
 * @param {object} 옵션 `{ 지금 }` — 미래 응시일 판정의 기준(ISO 문자열 또는 Date).
 * @returns {{payload: object} | {흠: {필드: string, 사유: string}}}
 */
function 시험payload(입력, { 지금 } = {}) {
  const b = 입력 && typeof 입력 === 'object' ? 입력 : {};

  const kind = typeof b.exam_kind === 'string' ? b.exam_kind.trim() : '';
  if (!kind) return { 흠: { 필드: 'exam_kind', 사유: '어느 시험인지가 없습니다' } };
  if (!(kind in 종류들)) {
    return { 흠: { 필드: 'exam_kind', 사유: `모르는 시험 종류입니다 — ${Object.keys(종류들).join(' · ')} 중 하나` } };
  }

  const date = typeof b.exam_date === 'string' ? b.exam_date.trim() : '';
  if (!date) return { 흠: { 필드: 'exam_date', 사유: '응시일이 없습니다(입력한 날이 아니라 시험을 본 날)' } };
  if (!실재하는날(date)) return { 흠: { 필드: 'exam_date', 사유: '응시일이 YYYY-MM-DD 형식의 실재하는 날짜가 아닙니다' } };
  /* 미래 응시일은 오타다 — 그리고 그 오타는 **조용히 산다**: 시즌 구간 필터에 안 걸려
   * 「성적이 없는 시즌」이 되고, 강사는 분명히 넣었으므로 아무도 안 찾는다. */
  if (지금) {
    const 오늘 = new Date(지금).toISOString().slice(0, 10);
    if (date > 오늘) return { 흠: { 필드: 'exam_date', 사유: '응시일이 미래입니다 — 아직 보지 않은 시험은 적지 않습니다' } };
  }

  const level = b.exam_level;
  if (level === undefined || level === null || level === '') {
    return { 흠: { 필드: 'exam_level', 사유: '판정 급수가 없습니다(급수가 안 나왔으면 0)' } };
  }
  if (!Number.isInteger(level) || level < 급수최소 || level > 급수최대) {
    return { 흠: { 필드: 'exam_level', 사유: `급수는 ${급수최소}~${급수최대} 의 정수입니다(0 = 급수 미달)` } };
  }

  const payload = { exam_kind: kind, exam_date: date, exam_level: level };

  /* ── 아래 둘은 선택이다. **「있으면 검사하고 없으면 넘긴다」** — 없는 것이 정상이라
   *    빈 값을 만들어 넣지 않는다(`null` 을 채우면 「0점」·「1회차」와 헷갈리는 자리가 생긴다). */
  if (b.exam_round !== undefined && b.exam_round !== null && b.exam_round !== '') {
    if (!Number.isInteger(b.exam_round) || b.exam_round < 1) {
      return { 흠: { 필드: 'exam_round', 사유: '회차는 1 이상의 정수입니다(모르면 비웁니다)' } };
    }
    /* 🔑 모의고사에 회차를 받지 않는다 — 「제93회」는 정식 시험의 식별자다. 모의에 붙이면
     *   나중에 난도 보정이 그 회차를 정식 회차로 읽어 엉뚱한 기준에 맞춘다. */
    if (kind !== 'topik_official') {
      return { 흠: { 필드: 'exam_round', 사유: '회차는 정식 응시에만 있습니다 — 모의고사에는 비웁니다' } };
    }
    payload.exam_round = b.exam_round;
  }

  if (b.section_scores !== undefined && b.section_scores !== null) {
    const s = b.section_scores;
    if (typeof s !== 'object' || Array.isArray(s)) {
      return { 흠: { 필드: 'section_scores', 사유: '영역별 점수는 객체입니다' } };
    }
    const 이름들 = Object.keys(s);
    if (!이름들.length) {
      return { 흠: { 필드: 'section_scores', 사유: '영역별 점수가 비었습니다 — 모르면 칸 자체를 비웁니다' } };
    }
    for (const 이름 of 이름들) {
      /* 🔑 모르는 영역 이름을 거부한다 — 오타(`writting`)가 조용히 새 축을 만들면 그 뒤 집계는
       *   영영 두 이름을 따로 센다(선택로그가 모르는 차원을 거부하는 것과 같은 자리). */
      if (!영역들.includes(이름)) {
        return { 흠: { 필드: 'section_scores', 사유: `모르는 영역입니다: ${이름} — ${영역들.join(' · ')} 중에서` } };
      }
      const v = s[이름];
      if (!Number.isInteger(v) || v < 0 || v > 100) {
        return { 흠: { 필드: 'section_scores', 사유: `${이름} 점수는 0~100 의 정수입니다` } };
      }
    }
    payload.section_scores = { ...s };
  }

  return { payload };
}

/**
 * 멱등키 — **같은 학생이 같은 시험을 같은 날 본 것은 한 번이다.**
 *
 * 🔑 강사가 두 번 눌러도, 두 강사가 같은 성적표를 나눠 넣어도 한 행이다. 급수를 잘못 넣어
 *   다시 넣는 것은 «수정»이라 같은 키로 덮는다 — 이 사건은 관측이지 시도 이력이 아니다.
 * 🚫 시각을 키에 넣지 않는다: 넣으면 두 번 누른 것이 두 번 응시로 쌓이고, 그 학생의 시험
 *   횟수가 실제보다 부푼다.
 */
function 멱등키(learner_id, exam_kind, exam_date) {
  return `exam:${learner_id}:${exam_kind}:${exam_date}`;
}

module.exports = { 종류들, 영역들, 급수최소, 급수최대, 시험payload, 멱등키, 실재하는날 };
