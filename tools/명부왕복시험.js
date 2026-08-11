#!/usr/bin/env node
'use strict';
/**
 * 명부왕복시험 — `functions/roster-ingest` 가 명부에 무엇을 남기고 무엇을 안 남기는지
 * **실제 DB 왕복으로** 증명한다 (E² · 철학정합 §3-E-2).
 *
 *   ROSTER_INGEST_SECRET=<배포에 넣은 값> node tools/명부왕복시험.js
 *
 * ■ 왜 코드 읽기로는 안 되나
 *   이 문이 조용히 틀리는 자리는 셋 다 「초록 얼굴」이다 — ①막아야 할 행을 흘림(그 학생은
 *   개원 첫날 잠긴다) ②연락처를 덮음(첫 등록 대조값이 조용히 바뀐다) ③멱등 실패(한 학생이
 *   두 행). 셋 다 응답은 200 이라 왕복으로 행 자체를 봐야 한다.
 *
 * ■ 픽스처는 **고정 코드**(SYNK-941~944)다 — 라디오왕복(회차마다 새 id)과 반대다.
 *   원장(radio)은 append 전용이라 새 id 가 맞고, 명부는 «한 학생 = 한 행» 이 규칙이라
 *   같은 코드를 다시 보내는 것이 곧 멱등 검사다. 시작할 때 **내 프로브 행만** 지워
 *   매 실행이 같은 답을 낸다(리허설 전용 — 골격 게이트가 운영을 거부한다).
 * ⚠ SYNK-999 는 유호님 실기기 행이다 — 프로브 코드로 절대 쓰지 않는다.
 */
const path = require('path');
const 골격 = require(path.join(__dirname, '..', 'lib', '왕복골격.js'));
// schema_ver 기대값 — CLI 와 같은 정본(계약 JSON)에서 직접 읽는다. 여기 베끼면 판이 갈린다.
const 계약버전 = require(path.join(__dirname, '..', '계약', '수집_교정_계약.json')).버전;

const 프로브 = ['SYNK-941', 'SYNK-942', 'SYNK-943', 'SYNK-944'];
const 머리글 = ['user_id', '이름', '이름_몽골', 'role', 'class_name', '생일', 'email', '연락처'];

/* profiles 시트가 스윕에 싣는 그 모양 — A:H 표시값. */
const 학생 = (번호, 이름, 전화) => [번호, 이름, '', 'student', 'A반', '', '', 전화];

async function main() {
  const { ref, sql, anon, 확인, 치명확인, 보고 } = await 골격.열기('명부왕복시험', {
    사유: '이 시험은 명부(engine.learners)에 프로브 행을 만든다',
  });

  const 비밀 = process.env.ROSTER_INGEST_SECRET || '';
  if (!비밀) {
    console.error('[명부왕복시험] ROSTER_INGEST_SECRET 가 없다 — 배포에 넣은 값과 같은 것을 주어야 한다.');
    console.error('       (없는 채로 도는 것은 「못 쟀다」이지 「통과」가 아니다)');
    process.exit(2);
  }

  const 부르기 = (짐, 키 = 비밀) => fetch(`https://${ref}.supabase.co/functions/v1/roster-ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anon, Authorization: `Bearer ${anon}`,
      ...(키 == null ? {} : { 'x-roster-ingest-key': 키 }),
    },
    body: JSON.stringify(짐),
  }).then(async (r) => ({ status: r.status, 몸: await r.json().catch(() => null) }));

  /* 시작 청소 — **내 프로브 코드만.** 지워지는 것이 무엇인지 코드가 그대로 말한다.
   * (프로브는 새 코드라 동의·사건 FK 가 붙은 적 없다 — 붙어 있으면 여기서 시끄럽게 죽는 것이 맞다.) */
  await sql(`delete from engine.learners where student_code in (${프로브.map((c) => `'${c}'`).join(', ')})`);

  /* ── ① 자물쇠 ─────────────────────────────────────────────────────── */
  console.log('\n■ ① 좁은 시크릿');
  const 키없이 = await 부르기({ 표: [머리글] }, null);
  const 살았나 = 확인('키 없이 부르면 401 — anon 키(공개물)만으로는 명부에 못 쓴다',
    키없이.status === 401, 키없이);
  확인('틀린 키도 401', (await 부르기({ 표: [머리글] }, `${비밀}x`)).status === 401);
  if (!살았나) {
    console.error('\n🔴 자물쇠가 열려 있다 — 뒤 검사를 돌리는 것보다 이것이 먼저다.');
    보고('프로브 미투입');
  }

  /* ── ② 첫 투입 — 행별 판정과 분모 ─────────────────────────────────── */
  console.log('\n■ ② 첫 투입 — 정상 2 · 강사 1 · 전화 없음 1 · 중복 1');
  const 표 = [
    머리글,
    학생('SYNK-941', '왕복밧자', '9941-1111'),
    학생('SYNK-942', '왕복터그스', '9942-2222'),
    ['SYNK-777', '왕복강사', '', 'teacher', '', '', '', '9900-0000'],
    학생('SYNK-943', '왕복빈전화', ''),
    학생('synk941', '왕복중복', '9941-1111'),
  ];
  const 첫 = await 부르기({ 표 });
  치명확인('200 으로 받는다', 첫.status === 200);
  확인('읽은행 5 · 대상아님 1(강사는 거절이 아니라 건너뜀)',
    첫.몸 && 첫.몸.읽은행 === 5 && 첫.몸.대상아님 === 1, 첫.몸);
  확인('문제 2건이 줄·번호·사유를 들고 온다(알림에 그대로 실린다)',
    첫.몸 && 첫.몸.문제들.length === 2
      && 첫.몸.문제들.some((p) => /전화가 없다/.test(p.사유) && p.번호 === 'SYNK-943')
      && 첫.몸.문제들.some((p) => /같은 학생/.test(p.사유)), 첫.몸 && 첫.몸.문제들);
  확인('넣음 2 — 문제 행 때문에 멀쩡한 행이 막히지 않는다(무인 문은 행별이다)',
    첫.몸 && 첫.몸.넣음 === 2 && String(첫.몸.넣은명단) === 'SYNK-941,SYNK-942', 첫.몸);
  확인('무동의 2명을 **이름으로** 부른다 — 숫자만 주면 원장이 DB 를 열어야 한다',
    첫.몸 && String(첫.몸.무동의) === 'SYNK-941,SYNK-942', 첫.몸);
  확인(`schema_ver 는 계약 JSON 정본(${계약버전})이다 — DB 이름으로 세면 CLI 도장과 갈라진다`,
    첫.몸 && 첫.몸.schema_ver === 계약버전, 첫.몸);

  const 행들 = await sql(`select student_code, contact, display_name, schema_ver
    from engine.learners where student_code in ('SYNK-941','SYNK-942','SYNK-943') order by student_code`);
  확인('DB 에 정확히 2행 — 표기형 코드·전화·이름·계약판 그대로',
    행들.length === 2
      && 행들[0].student_code === 'SYNK-941' && 행들[0].contact === '9941-1111'
      && 행들[0].display_name === '왕복밧자' && 행들[0].schema_ver === 계약버전
      && 행들[1].student_code === 'SYNK-942', 행들);

  /* ── ③ 멱등 — 같은 아침을 두 번 살아도 명부는 그대로다 ───────────── */
  console.log('\n■ ③ 멱등 — 재전송이 정상 동작이다');
  const 다시 = await 부르기({ 표 });
  확인('같은 판을 다시 보내면 넣음 0 · 건너뜀 2 · 문제는 그대로 2',
    다시.몸 && 다시.몸.넣음 === 0 && 다시.몸.건너뜀 === 2 && 다시.몸.문제들.length === 2, 다시.몸);
  const [{ n: 행수 }] = await sql(`select count(*)::int as n from engine.learners
    where student_code in (${프로브.map((c) => `'${c}'`).join(', ')})`);
  확인('명부 행 수가 안 늘었다 — 2행 그대로(한 학생 = 한 행)', 행수 === 2, { 행수 });

  /* ── ④ 급소 — 연락처가 어긋나면 막히고, **덮지 않는다** ───────────── */
  console.log('\n■ ④ 연락처 어긋남 — 대조값을 갈 수 있는 것은 사람뿐이다');
  const 어긋남 = await 부르기({ 표: [머리글, 학생('SYNK-941', '왕복밧자', '8800-9999')] });
  확인('막힘 1 — 사유가 「연락처가 다르다」로 온다',
    어긋남.몸 && 어긋남.몸.막힘.length === 1 && /연락처가 다르다/.test(어긋남.몸.막힘[0].사유)
      && 어긋남.몸.넣음 === 0, 어긋남.몸);
  const [남은] = await sql(`select contact from engine.learners where student_code = 'SYNK-941'`);
  확인('🔴 DB 연락처가 **그대로다** — 덮였으면 그 학생의 첫 등록 대조값이 조용히 바뀐 것이다',
    남은 && 남은.contact === '9941-1111', 남은);

  /* ── ⑤ 읽기 불가와 상한 — 자르지 않고 거절한다 ────────────────────── */
  console.log('\n■ ⑤ 머리글·상한');
  const 무머리 = await 부르기({ 표: [['이름', '반'], ['누군가', 'A']] });
  확인('번호·전화 열이 없으면 400 — 위치로 짐작해 이름을 전화로 읽지 않는다',
    무머리.status === 400 && 무머리.몸 && 무머리.몸.error === 'bad_header', 무머리);
  const 큰표 = [머리글];
  for (let i = 0; i < 1001; i += 1) 큰표.push(학생('SYNK-001', 'x', '1111-2222'));
  const 넘침 = await 부르기({ 표: 큰표 });
  확인('상한을 넘으면 자르지 않고 통째로 400 — 잘라 넣으면 「완료」 얼굴로 일부만 선다',
    넘침.status === 400 && 넘침.몸 && 넘침.몸.error === 'too_many_rows', 넘침);

  보고(`프로브 4코드 중 2행 착지 · 회차 불변(고정 코드) · 대상 ${ref}`);
}

main().catch((err) => { console.error('[명부왕복시험] ' + (err && err.message || err)); process.exit(1); });
