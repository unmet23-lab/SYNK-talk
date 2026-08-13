#!/usr/bin/env node
'use strict';
/**
 * 라디오승격왕복시험 — `functions/radio-promote` 가 원장을 `learning_events` 로 어떻게 올리는지
 * **실제 DB 왕복으로** 증명한다. (설계 §9 「승격 왕복」 — 대기열 P1 라디오24 Lane B 잔여 ②)
 *
 *   node tools/라디오승격왕복시험.js          (.env 의 리허설 ref 로)
 *
 * ■ 왜 픽스처를 원장에 직접 심나 (인제스트 Fn 을 안 거치고)
 *   여기서 재는 것은 «승격»이다 — 원장 규격(파싱·멱등·맥박)은 `라디오왕복시험.js` 가 §9 앞
 *   절반으로 이미 잰다. 설계 §9 셋째 항목의 문장 그대로 「원장 픽스처 → 승격기 →
 *   `learning_events` 행 대조」를 하려면 원장 행을 우리가 놓아야 마감·겹침·불량 스냅샷 같은
 *   경계가 결정적으로 선다(인제스트를 거치면 시각·라운드를 못 통제한다).
 *
 * ■ 🔴 리허설 전용 · 행은 남는다
 *   `learning_events` 는 append-only 불변이다 — 이 시험의 행도 지우지 않는다(배달왕복시험과
 *   같은 규약 · 학생 코드에 회차 표식이 박혀 가려 읽을 수 있다). 원장도 지우지 않는다.
 *
 * ■ 분모를 말한다 (F207)
 *   승격 n 건만 세지 않는다 — **제외 10사유가 각각 ≥1 로 실측되는 것**이 이 시험의 본체다.
 *   승격만 세면 「전부 조용히 제외」와 「전부 승격」이 같은 초록으로 보인다.
 *
 * ■ 시각 설계 (전부 지금-분 단위 상대)
 *   R1 라운드: -20분 출제 · -10분 마감(닫힘) / R2: -9분 출제 · 열림 · retry_of=R1
 *   R3: -5분 출제 · 열림 · 스냅샷 불량 / 자막 카드: -30분부터 열림
 *   메시지 16건이 이 창들 사이에 앉아 승격 6 + 제외 10사유를 만든다. 사유 개수는 **기준 호출
 *   대비 차이**로 읽는다(①-b) — 행을 안 지우는 규약이라 이전 회차의 제외 행이 매 호출
 *   재계수되고, 그 사유는 라운드가 낡으며 표류하기까지 한다(중복응답→마감후 · 08-13 실측).
 *   절대 개수 단언은 두 번째 실행부터 원리상 안 선다.
 */
const path = require('path');
const 골격 = require(path.join(__dirname, '..', 'lib', '왕복골격.js'));
const { 파서판 } = require(path.join(__dirname, '..', 'lib', '라디오채팅파서.js'));
const { 승격판 } = require(path.join(__dirname, '..', 'lib', '라디오승격.js'));
const 팩 = require(path.join(__dirname, '..', 'contents', '토픽퀴즈문항.js'));

const { 몽골날짜 } = require(path.join(__dirname, '..', 'lib', '몽골날짜.js'));

const 회차 = `wp${Date.now().toString(36)}`;
/* 분전 은 «회랑 닻» 기준이다 — main 이 ② 에서 닻을 재고 채운다(지금 기준이 아니다). */
let 분전 = null;

async function main() {
  const { ref, sql, anon, service_role: service, 확인, 보고 } = await 골격.열기('라디오승격왕복시험', {
    사유: '이 시험은 원장(radio.*)과 engine.learning_events 에 지우지 않는 행을 남긴다',
    함수목록: ['radio-promote'],
  });

  const 부르기 = async (키 = service) => {
    const r = await fetch(`https://${ref}.supabase.co/functions/v1/radio-promote`, {
      method: 'POST', headers: { Authorization: `Bearer ${키}`, 'Content-Type': 'application/json' }, body: '{}',
    });
    return { status: r.status, 몸: JSON.parse((await r.text()) || '{}') };
  };

  /* ── ① 문 — 내부 생산자다 ─────────────────────────────────────────── */
  console.log('■ ① 문 — service_role 만 연다');
  const 무키 = await fetch(`https://${ref}.supabase.co/functions/v1/radio-promote`, { method: 'POST', body: '{}' });
  확인('키 없이 부르면 열리지 않는다', 무키.status === 401 || 무키.status === 403, { status: 무키.status });
  const 아논 = await 부르기(anon);
  확인('anon 키(공개물)로도 열리지 않는다', 아논.status === 403, { status: 아논.status });

  /* ── ①-b 기준 호출 — 잔존을 먼저 흡수·측정한다 ────────────────────── */
  console.log('\n■ ①-b 기준 호출 — 이전 회차 잔존 흡수(행은 안 지우는 규약의 값)');
  /* 이 시험의 행은 지우지 않는다(머리말) — 제외로 남은 행은 매 호출 재계수되고, 승격 가능한
   * 잔존은 다음 호출이 올린다. 그래서 절대 개수 단언은 두 번째 실행부터 원리상 안 선다
   * (2026-08-13 실측: 잔존 2회차가 아홉 사유를 전부 3으로 만들었다). 시드 «전에» 한 번 불러
   * 잔존 승격을 흡수하고 사유별 바닥을 재 두면, 본 호출은 «기준 대비 차이»로 정확히 선다. */
  const 기준 = await 부르기();
  확인('기준 호출 200 — 잔존 흡수·사유 바닥 측정', 기준.status === 200, 기준.몸);
  const 기준제외 = 기준.몸.제외 || {};

  /* ── ② 시드 ───────────────────────────────────────────────────────── */
  console.log('\n■ ② 시드 — 학생 5·링크 4(+겹침 2)·라운드 3·카드 1·원장 16');

  /* 시간 회랑 — 이전 회차의 라운드보다 **통째로 과거**에 앉는다. 라운드찾기는 「최신
   * shown_at ≤ sent_at」이라(방송은 하나뿐이라는 운영 불변식의 거울) 같은 회랑에 회차가
   * 겹치면 앞 회차의 라운드가 새 메시지를 가로채 사유가 전부 표류한다(08-13 실측 —
   * 첫 실행만 초록인 도구였다). 닻 = Fn 이 볼 수 있는 라운드(되돌아보기 8일 · 여유 9일) 중
   * 가장 오래된 것의 10분 과거. 늙은 라운드가 창을 벗어나면 닻은 도로 올라온다(자기치유).
   * 회랑 65분이 몽골 자정에 걸리면 하루접힘·correlation 짝이 갈라지므로 통째로 하루 안으로 민다.
   * ⚠숫자 둘(9일·7일)은 Fn 의 되돌아보기일(7)+1 에 묶인 손사본이다 — 갈리면 증상은 조용한
   * 초록이 아니라 아래 바닥 가드·승격 6 단언의 적색이다(새는 방향이 정직하다). */
  const 창속 = await sql(`select min(shown_at) as t from radio.quiz_round where shown_at > now() - interval '9 days'`);
  let 닻ms = 창속[0].t ? new Date(창속[0].t).getTime() - 10 * 60_000 : Date.now();
  while (몽골날짜(new Date(닻ms - 65 * 60_000)) !== 몽골날짜(new Date(닻ms))) 닻ms -= 65 * 60_000;
  if (닻ms - 65 * 60_000 < Date.now() - (7 * 24 * 60 - 30) * 60_000) {
    throw new Error('회랑 소진 — 7일 창 안이 이전 회차 라운드로 가득 찼다. 가장 오래된 회차가 창을 벗어난 뒤(≤1일) 다시 돌린다.');
  }
  분전 = (n) => new Date(닻ms - n * 60_000).toISOString();
  console.log(`   회랑 닻 ${new Date(닻ms).toISOString()} (지금-${Math.round((Date.now() - 닻ms) / 60_000)}분)`);

  const 판 = (await sql(`select name from engine.schema_migrations order by version desc limit 1`))[0]
    .name.match(/_(c\d+)\.sql$/)[1];

  const 문항 = 팩.문항들[0];
  확인(`문항 팩 스킬이 engine.skills 시드에 실재한다(승격의 선행 조건) — ${문항.skill_ids[0]}`,
    (await sql(`select count(*)::int as n from engine.skills where skill_id = '${문항.skill_ids[0]}'`))[0].n === 1);

  const 학생들 = await sql(`
    insert into engine.learners (student_code, display_name, level_current, goal_track, schema_ver)
    values ('${회차}-A','승격A','Lv2','study','${판}'), ('${회차}-B','승격B','Lv2','study','${판}'),
           ('${회차}-D','승격D','Lv3','study','${판}'), ('${회차}-E1','승격E1','Lv2','study','${판}'),
           ('${회차}-E2','승격E2','Lv2','study','${판}')
    returning learner_id, student_code`);
  const id = Object.fromEntries(학생들.map((r) => [r.student_code.slice(회차.length + 1), r.learner_id]));

  await sql(`
    insert into engine.consents (learner_id, consent_ver, agreed_at, schema_ver, recorded_by)
    values ('${id.A}'::uuid,'v18.9', now() - interval '30 days','${판}','tools/라디오승격왕복시험.js'),
           ('${id.D}'::uuid,'v18.9', now() - interval '30 days','${판}','tools/라디오승격왕복시험.js')`);

  const ch = (n) => `UC-${회차}-${n}`;
  /* E 채널의 겹침은 이력이 만든다(반박 ⑤ 모양 그대로): E1 링크가 회랑 -60분~-20분에 살았고
   * E2 링크가 -40분에 확정됐다 — -30분 시점엔 **둘 다 활성**이라 그 시각 메시지는 겹침이다.
   * 활성(unlinked null) 행은 채널당 1 이라 지금 상태는 유일 인덱스에 안 걸린다.
   * 시각은 전부 회랑 기준(분전) — 벽시계에 걸면 회랑이 깊어진 날 링크 창과 메시지가 어긋난다. */
  await sql(`
    insert into radio.viewer_link (channel_id, learner_id, confirmed_by, confirmed_at, unlinked_at, schema_ver)
    values ('${ch('A')}','${id.A}'::uuid,'승격왕복', '${분전(120)}', null, '${판}'),
           ('${ch('B')}','${id.B}'::uuid,'승격왕복', '${분전(120)}', null, '${판}'),
           ('${ch('D')}','${id.D}'::uuid,'승격왕복', '${분전(120)}', null, '${판}'),
           ('${ch('E')}','${id.E1}'::uuid,'승격왕복', '${분전(60)}', '${분전(20)}', '${판}'),
           ('${ch('E')}','${id.E2}'::uuid,'승격왕복', '${분전(40)}', null, '${판}')`);

  const 스냅 = JSON.stringify({
    지시문: 문항.지시문, 질문: 문항.질문, 보기: 문항.보기, 정답: 문항.정답,
    skill_ids: 문항.skill_ids, 스킬판: 팩.스킬판, 문항버전: 팩.문항판,
  }).replace(/'/g, "''");
  const 불량스냅 = JSON.stringify({ 질문: '보기가 문자열 배열이다', 보기: ['하나', '둘'] }).replace(/'/g, "''");

  const [R1] = await sql(`
    insert into radio.quiz_round (task_ref, task_snapshot, shown_at, closed_at, schema_ver)
    values ('${문항.문항id}','${스냅}'::jsonb,'${분전(20)}','${분전(10)}','${판}') returning round_id`);
  const [R2] = await sql(`
    insert into radio.quiz_round (task_ref, task_snapshot, shown_at, retry_of_round_id, schema_ver)
    values ('${문항.문항id}','${스냅}'::jsonb,'${분전(9)}',${R1.round_id},'${판}') returning round_id`);
  await sql(`
    insert into radio.quiz_round (task_ref, task_snapshot, shown_at, schema_ver)
    values ('${회차}-bad','${불량스냅}'::jsonb,'${분전(5)}','${판}')`);
  await sql(`
    insert into radio.subtitle_card_log (content_ref, content_snapshot, shown_from, schema_ver)
    values ('${회차}-card','${JSON.stringify({ 표현: '덕분에', 예문: '선생님 덕분에 배웠어요' }).replace(/'/g, "''")}'::jsonb,'${분전(30)}','${판}')`);

  /* 원장 16건 — 승격 6 · 제외 10사유. command_* 는 인제스트 Fn 이 쓰는 그 값 그대로 심는다
   * (승격기는 재파싱하지 않는다 — §4-3. 파싱 자체의 증명은 라디오왕복시험 ④가 이미 졌다). */
  const 메시지들 = [
    ['m1', 'A', '!답 2', '답', '2', 15],                       // 승격 — R1 정답 창 안
    ['m2', 'A', '!답 3??', '답', '3??', 8],                    // 승격 — R2(재도전) · 확신도 guess
    ['m3', 'A', '!답 2', '답', '2', 7],                        // 제외 중복응답 — R2 두 번째
    ['m4', 'B', '!답 1', '답', '1', 8.5],                      // 제외 무동의
    ['m5', 'X', '!답 1', '답', '1', 8.3],                      // 제외 비링크
    ['m6', 'A', '!답 어', '답', '어', 14],                     // 제외 해석불가
    ['m7', 'A', '!답 1', '답', '1', 9.5],                      // 제외 마감후 — R1 마감 뒤·R2 출제 전
    ['m8', 'A', '!빗소리 집중이 잘돼서', '빗소리', '집중이 잘돼서', 25], // 승격 — 이유는 선택 인자(㉠)
    ['m9', 'A', '!빗소리', '빗소리', null, 19],                // 제외 하루접힘 — 같은 날 둘째 선언
    ['m10', 'A', '!슬럼프', '슬럼프', null, 18],               // 승격 — affect.reported
    ['m11', 'A', '!출석 오늘도 라디오와 함께 시작합니다', '출석', '오늘도 라디오와 함께 시작합니다', 17], // 승격 — 카드가 제시문
    ['m12', 'A', '!목표 단어 30개 외우기', '목표', '단어 30개 외우기', 16], // 승격 — 명령과업
    ['m13', 'D', '!답 9', '답', '9', 6],                       // 제외 자리없음 — 보기 4개
    ['m14', 'D', '!답 1', '답', '1', 4],                       // 제외 스냅샷불량 — R3
    ['m15', 'E', '!빗소리', '빗소리', null, 30],               // 제외 링크겹침 — E1·E2 동시 활성 시각
    ['m16', 'A', '!답', '답', null, 13],                       // 제외 인자없음
  ];
  const 값들 = 메시지들.map(([m, c, body, kind, arg, 분]) => {
    const raw = JSON.stringify({ id: `${회차}-${m}`, snippet: { type: 'textMessageEvent', displayMessage: body }, 회차 }).replace(/'/g, "''");
    return `('${회차}-${m}','${ch(c)}','승격${c}','${body.replace(/'/g, "''")}','${raw}'::jsonb,'${분전(분)}','${kind}',${arg == null ? 'null' : `'${arg.replace(/'/g, "''")}'`},'${파서판}','${판}')`;
  }).join(',\n           ');
  await sql(`
    insert into radio.chat_message (message_id, channel_id, display_name, body, raw, sent_at, command_kind, command_arg, parser_ver, schema_ver)
    values ${값들}`);
  확인('원장 16행이 앉았다', (await sql(`select count(*)::int as n from radio.chat_message where message_id like '${회차}-%'`))[0].n === 16);

  /* ── ③ 실행 — 분모가 전부 말로 나온다 ─────────────────────────────── */
  console.log('\n■ ③ 승격 실행 — 분모(승격·제외 사유별)');
  const 첫 = await 부르기();
  확인('200 으로 받는다', 첫.status === 200, 첫.몸);
  확인(`승격판이 판정층 정본과 같다 — ${승격판}`, 첫.몸.승격판 === 승격판, { 응답: 첫.몸.승격판 });
  확인('창을 다 걸었다(잘림 없음)', 첫.몸.잘림 === false, { 배치: 첫.몸.배치 });
  확인('승격 6건 — 퀴즈 2(재도전 쌍)·선호 1·정서 1·체크인 1·목표 1 (잔존 승격은 기준 호출이 흡수했다)',
    첫.몸.승격 === 6, 첫.몸);
  const 제외 = 첫.몸.제외 || {};
  for (const 사유 of ['중복응답', '무동의', '해석불가', '마감후', '하루접힘', '자리없음', '스냅샷불량', '링크겹침', '인자없음']) {
    const 바닥 = 기준제외[사유] || 0;
    확인(`제외 「${사유}」 = 기준+1 — 그 픽스처 하나만 새로 걸렸다`,
      제외[사유] === 바닥 + 1, { [사유]: 제외[사유], 기준: 바닥 });
  }
  확인('제외 「비링크」 ≥ 기준+1 — 동시 도는 인제스트 왕복이 더 얹을 수 있어 하한으로 읽는다',
    (제외['비링크'] || 0) >= (기준제외['비링크'] || 0) + 1, { 비링크: 제외['비링크'], 기준: 기준제외['비링크'] || 0 });
  확인('제외 「이미승격」 = 기준의 이미승격+승격 — 기준이 올린 것이 본 호출에서 멱등으로 접힌다',
    (제외['이미승격'] || 0) === (기준제외['이미승격'] || 0) + (기준.몸.승격 || 0),
    { 이미승격: 제외['이미승격'], 기준이미: 기준제외['이미승격'] || 0, 기준승격: 기준.몸.승격 });

  /* ── ④ 행 대조 — 승격기가 무엇을 남겼나 (§4-3 표) ────────────────── */
  console.log('\n■ ④ learning_events 행 대조(§4-3 봉투·payload)');
  const 행들 = await sql(`
    select e.event_id, e.event_type, e.task_type, e.payload, e.skill_ids, e.skill_taxonomy_ver,
           e.retry_of_event_id, e.correlation_id, e.consent_ver, e.consent_id is not null as 동의id있음,
           e.level_snapshot, e.idempotency_key, e.source_kind,
           s.body_original, s.task_ref
      from engine.learning_events e
      left join engine.submissions s on s.event_id = e.event_id
     where e.idempotency_key like '${회차}-%' order by e.occurred_at`);
  확인('승격 행 6', 행들.length === 6, { 행수: 행들.length });
  const 찾기 = (m) => 행들.find((r) => r.idempotency_key === `${회차}-${m}`);

  const q1 = 찾기('m1'); const q2 = 찾기('m2');
  확인('퀴즈 1차 — task_type 라디오퀴즈 · 자리 2 → 보기 id(o2) · position=친 자리 그대로',
    q1 && q1.task_type === '라디오퀴즈' && q1.payload.selected_option === 문항.보기[1].option_id
    && q1.payload.position === 2 && String(q1.payload.round_id) === String(R1.round_id), q1 && q1.payload);
  확인('퀴즈 1차 — skill_ids 가 문항 팩 태그 그대로(빈칸이면 축①③이 같이 죽는 자리 §4-3)',
    q1 && Array.isArray(q1.skill_ids) && q1.skill_ids.join(',') === 문항.skill_ids.join(',')
    && q1.skill_taxonomy_ver === 팩.스킬판, q1 && q1.skill_ids);
  확인('퀴즈 1차 — body_original 이 `!답` 뒤 원문(정답 파생의 반쪽)', q1 && q1.body_original === '2', q1 && q1.body_original);
  확인('60초 재도전 고리 — 2차 행의 retry_of_event_id 가 1차 행을 가리킨다(계약 유일 결과축)',
    q2 && q1 && q2.retry_of_event_id === q1.event_id, q2 && { retry: q2.retry_of_event_id, 일차: q1.event_id });
  확인('재도전 확신도 — 「??」 가 guess 로 실린다(계약 confidence)', q2 && q2.payload.confidence === 'guess', q2 && q2.payload);
  확인('correlation_id — 같은 학생·같은 몽골날짜는 같은 앉음(결정적 uuid)',
    q1 && q2 && q1.correlation_id === q2.correlation_id, q1 && q1.correlation_id);
  확인('봉투 — 동의 스냅샷(consent_ver·consent_id)과 급수 스냅샷이 박힌다',
    q1 && q1.consent_ver === 'v18.9' && q1.동의id있음 === true && q1.level_snapshot === 'Lv2', q1);
  확인('봉투 — source_kind 가 비어 있지 않다(사건출처 정본 호출)', 행들.every((r) => r.source_kind), 행들[0] && 행들[0].source_kind);

  const 선호 = 찾기('m8'); const 정서 = 찾기('m10');
  확인('선호 — stated_option(신명)·이유는 인자를 쓴 사람만·stated_via=radio_chat (c11 ③)',
    선호 && 선호.event_type === 'preference.stated' && 선호.payload.stated_option === '빗소리'
    && 선호.payload.selection_reason === '집중이 잘돼서' && 선호.payload.stated_via === 'radio_chat'
    && !('options_shown' in 선호.payload), 선호 && 선호.payload);
  확인('정서 — affect.reported 신설 사건(c11 ④) · 자유 서술은 payload 에 없다(원장 body 가 원문)',
    정서 && 정서.event_type === 'affect.reported' && 정서.payload.affect_kind === 'slump'
    && Object.keys(정서.payload).sort().join(',') === 'affect_kind,stated_via', 정서 && 정서.payload);

  const 출석 = 찾기('m11'); const 목표 = 찾기('m12');
  확인('자습체크인 — task_type 신값 · 제시문 = 그날 자막 카드(task_ref)',
    출석 && 출석.task_type === '자습체크인' && 출석.task_ref === `${회차}-card`
    && 출석.body_original === '오늘도 라디오와 함께 시작합니다', 출석 && { ref: 출석.task_ref });
  확인('목표선언 — task_type 신값 · 카드 없는 과업은 명령과업 정본',
    목표 && 목표.task_type === '목표선언' && 목표.task_ref === 'radio:cmd:목표선언:v1', 목표 && { ref: 목표.task_ref });

  /* ── ⑤ 멱등 — 재실행이 아무것도 새로 만들지 않는다 ────────────────── */
  console.log('\n■ ⑤ 멱등 — cron 이 매시 불러도 두 번 승격은 없다');
  const 다시 = await 부르기();
  확인('재실행 승격 0', 다시.status === 200 && 다시.몸.승격 === 0, 다시.몸);
  확인('행 수 그대로 6', (await sql(`select count(*)::int as n from engine.learning_events where idempotency_key like '${회차}-%'`))[0].n === 6);

  보고(`픽스처 원장 16건 → 승격 6 · 제외 10사유 실측 · 회차 ${회차}`);
}

main().catch((err) => { console.error(`[라디오승격왕복시험] ${String((err && err.stack) || err)}`); process.exit(1); });
