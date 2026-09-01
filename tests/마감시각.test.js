/**
 * 마감 시각·마감 판본 — c10 회귀 (유호님 승인 2026-08-08 · 소급 불가).
 *
 * 이 저장소가 이미 네 번 물린 형태가 있다: **열은 섰는데 채우는 코드가 0줄**
 * (`daily_activity.expected`·`model`·`prompt_ver`·`policy_ver`). 증상은 언제나 「조용함」이고,
 * 몇 달 뒤 빈 칸이 설명 없이 쌓인 것을 보고서야 안다.
 *
 * DB 층 카운터(`마감없는배정`)는 **행이 있어야** 빨개진다 — 학생 0명인 지금은 0/0 이라
 * 배선이 통째로 죽어도 초록이다. 그래서 오늘 실제로 발화하는 검사는 이 소스 층뿐이다.
 * 왕복 증명은 tools/배달왕복시험.js 가, DB 층은 확인 블록이 진다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { 코드만, 코드만픽스처 } = require('./lib/소스검사.js');

const ROOT = path.resolve(__dirname, '..');
const 읽기 = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

test('🔴 주석 제거기가 살아 있다 — 죽으면 EVENTS 금지 검사가 원문으로 되돌아간다(증상은 초록)', () => {
  assert.equal(코드만(코드만픽스처.입력), 코드만픽스처.기대, '주석 제거기가 죽었다');
});

const DELIVER = 읽기('supabase', 'functions', 'deliver', 'index.ts');
/* 🔴 주석을 지우고 잰다 — 이 파일이 EVENTS 에 거는 것은 「`due_at` 을 쓰지 마라」는 **금지**라,
 *   events/index.ts 에 「마감은 여기서 안 쓴다(`due_at` 은 배정 행의 것)」는 설명 한 줄만 있어도
 *   거짓 적색이 났다. ⚠ `읽기` 자체는 안 감싼다 — 같은 헬퍼가 SQL 조각(:23)도 여는데 `코드만` 은
 *   JS 렉서라 SQL `--` 주석을 모른다. 감싸는 것은 **JS/TS 를 여는 이 자리**뿐이다. */
const EVENTS = 코드만(읽기('supabase', 'functions', 'events', 'index.ts'));
const 조각 = 읽기('supabase', 'migrations', '20260808010000_engine_c10.sql');
const 계약 = require('../계약/수집_교정_계약.json');

/* deliver 의 `submissions` insert 한 문장만 떼어 본다 — 파일 전체에서 이름을 찾으면
 * 주석에 적힌 글자가 배선으로 읽힌다(그 자리가 F207 계열이다). */
const 배정insert = (소스) => {
  const 시작 = 소스.indexOf('insert into engine.submissions');
  assert.notEqual(시작, -1, 'deliver 에서 submissions insert 를 못 찾았다 — 앵커가 낡았다');
  const 끝 = 소스.indexOf('`', 시작);
  return 소스.slice(시작, 끝 === -1 ? undefined : 끝);
};

test('배정 insert 가 마감 두 칸을 싣는다 (열만 서고 아무도 안 채우는 상태를 막는다)', () => {
  const 문장 = 배정insert(DELIVER);
  for (const 이름 of ['due_at', 'due_ver']) {
    assert.ok(문장.includes(이름),
      `배정 insert 가 ${이름} 를 안 싣는다 — 그 배정의 마감은 영영 빈칸이다(소급 불가)`);
  }
  assert.ok(문장.includes("'due.v1'"), '마감 판본을 안 박았다 — 시각만 남으면 무슨 규칙인지 못 읽는다');
  assert.ok(/at time zone/.test(문장),
    '마감을 DB 가 안 낸다 — JS 로 계산하면 오프셋 상수가 코드로 들어온다(절단문서 ①-14)');
});

test('탐지력 — 배정 insert 에서 마감이 빠지면 위 검사가 잡는다', () => {
  const 가짜 = DELIVER.replace(/\n\s*due_at, due_ver\n/, '\n');
  assert.notEqual(가짜, DELIVER, '픽스처가 아무것도 안 지웠다 — 이 검사는 무엇이든 통과시킨다');
  assert.ok(!배정insert(가짜).includes('due_at'),
    '열 목록에서 지웠는데도 검사가 초록이면 그건 주석을 보고 있는 것이다');
});

test('제출 통로는 마감을 쓰지 않는다 — 정본은 배정 행 하나다', () => {
  /* 복사하는 순간 「이 배정의 마감」의 정본이 둘이 되고, 어긋나는 날 어느 쪽이 참인지
   * 아무도 못 정한다(L0 §3-3 이 learner_id 복제를 거부한 것과 같은 이유). */
  assert.ok(!/due_at|due_ver/.test(EVENTS),
    'functions/events 가 마감을 쓴다 — 제출 행에 복사하면 정본이 둘이 된다');
});

test('앱은 마감을 선언할 수 없다 — 서버칸이다', () => {
  const { 서버칸 } = require('../lib/이벤트검증.js');
  for (const 이름 of ['due_at', 'due_ver']) {
    assert.ok(서버칸.includes(이름),
      `${이름} 가 서버칸이 아니다 — 학생 기기가 자기 마감을 선언하면 늦은 제출이 제 손으로 정시가 된다`);
  }
});

test('물리 — 짝 CHECK 와 불변 자물쇠 두 칸이 조각에 있다', () => {
  assert.ok(조각.includes('submissions_due_paired_c10'),
    '짝 CHECK 가 없다 — 시각만 있고 판본이 없는 반쪽이 통과한다');
  const 자물쇠 = 조각.slice(조각.indexOf('reject_original_overwrite'));
  for (const 이름 of ['OLD.due_at', 'OLD.due_ver']) {
    assert.ok(자물쇠.includes(이름),
      `${이름} 를 안 잠갔다 — 마감을 사후에 늘리면 「놓쳤다」가 조용히 지워진다`);
  }
});

/* 세기만 하고 판정에 안 넣으면 그 카운터는 **안 재는 것과 같은 모양**이다(F207).
 * c9 조각의 `옛검수정책` 이 정확히 그 자리라 여기서 함께 못박는다. */
test('확인 카운터 둘이 세기만 하는 게 아니라 판정 조건에도 들어 있다', () => {
  const 판정 = 조각.slice(조각.lastIndexOf('select case when'));
  for (const 이름 of ['마감없는배정', '분모칸오염']) {
    assert.ok(조각.includes(`as ${이름}`), `확인 블록이 ${이름} 를 안 센다`);
    assert.ok(new RegExp(`${이름}=0`).test(판정),
      `${이름} 를 세기만 하고 판정 조건에 안 넣었다 — 빨개질 수 없는 카운터는 초록의 모양만 늘린다`);
  }
});

test('계약이 c16 이고 두 이름을 들고 있다', () => {
  /* 판 핀 — c10(due 신설 판) → … → c13(성향 확인 · 08-22) → c14(교실 수집 · 08-31) →
   * c16(접기 어휘 fold_date·promote_ver · 09-02)으로 올렸다. 이 핀의 몫은 「계약 판이
   * 오르면 이 회귀 파일을 열어 due 회귀가 여전히 유효한지 본 사람이 있다」를 남기는 것이다.
   * c16 확인: due 는 접기 어휘와 무관하고(읽기 기록은 배정 payload, due 는 submissions 물리칸),
   * 짝 CHECK 는 `submissions_due_paired_c16` 으로 값 그대로 이름만 갈았다(20260902100000). */
  assert.equal(계약.버전, 'c16', `계약 버전이 ${계약.버전} 다 — 물리와 갈리면 「c16 계약 + c15 물리」가 초록으로 보인다`);
  const 실재 = Object.values(계약.learning_events.필드).flat();
  for (const 이름 of ['due_at', 'due_ver']) {
    assert.ok(실재.includes(이름), `계약 필드에 ${이름} 가 없다 — 물리에만 사는 이름은 계약이 못 지킨다`);
  }
});
