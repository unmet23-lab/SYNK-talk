/* 스케줄러 배선 — P0 §373 「`pg_cron` 등록(배치 시각 + 그 30분 뒤 점검)」 · 2026-08-09 유호 지시
 *
 * 🔴 **파일 이름의 `_c10` 은 장식이 아니다.** Edge Function 넷이 계약판을 `schema_migrations` 의
 *   최신 이름 `_c<숫자>.sql` 에서 읽는다(P0 §374 · 회귀 `tests/마이그레이션이름.test.js`).
 *   `..._cron.sql` 처럼 판 없이 지으면 **API 4개가 동시에 500** 이 된다 — 앱 전체가 죽는데
 *   원인은 파일 이름이다. 판을 올리는 게 아니므로 c10 을 **그대로** 이어 쓴다.
 *
 * 🔑 **시각은 UTC 다**(DB `TimeZone` = UTC · 실측). 몽골(`Asia/Ulaanbaatar`)은 UTC+8 이라 8을 뺀다:
 *     배달  몽골 00:05 → UTC 16:05 (전날)
 *     점검  몽골 00:35 → UTC 16:35 (전날)  ← 배달 +30분(§373)
 *     전사  10분마다 (시간대 무관)
 *   🔴 배달이 **자정 직후**인 이유: `deliver` 는 호출 시점의 `몽골날짜()` 로 「오늘」을 정하고
 *   `due_at` 은 그날 자정이다(c10 `due.v1`). 몽골 자정 **전**에 돌리면 전날 것을 만들고,
 *   학생은 아침에 어제 과제를 받는다. 「전날 밤」이라는 말과 어긋나 보이지만 기준은 몽골 날짜다.
 *
 * 🔑 **자격증명이 이 파일에 없다** — Vault 에서 읽는다. ref 를 파일에 박으면 그 파일이 환경에
 *   묶여 리허설·운영이 갈린다(08-07 과녁 사고와 같은 층).
 *   ⛔ 두 항목은 이 파일이 만들지 않는다. 붓기 **전에** 그 프로젝트에서 넣어야 한다:
 *        vault: `service_role_key` · `functions_base_url`(= https://<ref>.supabase.co/functions/v1)
 *      없으면 잡은 걸리되 URL 이 null 이라 호출이 **에러로** 죽는다(조용한 실패가 아니다 — 의도).
 *
 * ⛔ **리허설엔 일부러 안 건다** — 스케줄러가 돌면 옆 세션 왕복시험의 배정 상태를 흔든다.
 *   리허설에 부을 일이 생기면 그 판단을 먼저 하고 붓는다.
 *
 * 되돌림: select cron.unschedule('deliver-daily'), cron.unschedule('deliver-check'),
 *                cron.unschedule('transcribe-batch'); */

create extension if not exists pg_cron;
create extension if not exists pg_net;

/* 멱등 — 같은 이름이 있으면 떼고 다시 건다(없으면 0행이라 조용하다). */
select cron.unschedule(jobname)
  from cron.job
 where jobname in ('deliver-daily', 'deliver-check', 'transcribe-batch');

/* ① 배달 — 그날 몫 1건을 학생마다 큐에 넣는다. */
select cron.schedule('deliver-daily', '5 16 * * *', $job$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/deliver',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
    body    := '{}'::jsonb);
$job$);

/* ② 점검 — 배달 +30분. 「오늘 배정 수 < 재적 수」면 미달을 낸다(§373 · 지금 수신자는 유호님 로그뿐).
 *   `?점검` 은 한글 쿼리라 퍼센트 인코딩해 넣는다 — 함수 쪽 `URLSearchParams` 가 되돌려 읽는다. */
select cron.schedule('deliver-check', '35 16 * * *', $job$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/deliver?%EC%A0%90%EA%B2%80',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
    body    := '{}'::jsonb);
$job$);

/* ③ 전사 — 10분마다. 한 번에 집는 수는 함수가 정한다(지금 5). 검수자가 오디오만 받는 시간을 줄인다. */
select cron.schedule('transcribe-batch', '*/10 * * * *', $job$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/transcribe',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
    body    := '{}'::jsonb);
$job$);
