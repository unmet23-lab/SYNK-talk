/* 상태기반 과제선택 — 활성 조각 «대기 파일» (§3-2-a · v5.13-b ⑤ · 신앱 스토어 출시 커밋과 한 벌)
 *
 * ⛔ **이 파일은 마이그레이션 폴더 밖이다 — 지금 적용하지 않는다.**
 *    ① cron 이 서면 리허설 왕복시험의 배정 상태를 흔들고(20260809070000_cron_c10.sql 머리말 선례),
 *    ② `engine.gen_active_from()` 이 서는 순간 deliver 게이트가 신구조로 갈리며(§3-2-a C5),
 *    ③ generate-worker·generate-deadline 은 **활성 시작일부터만 등록**한다(C5 — 그 이전 날짜는
 *       라이브 경로가 진 날이다. 큐가 과거를 되짚으면 이미 착지한 배정 위에 두 번째 판이 앉는다).
 *
 * ■ 무엇 — 활성 조각의 물리 전부(§12 도장 절 «활성 조각» 항):
 *    ㉮ `engine.gen_active_from() returns date` — 활성 게이트의 물리 이름(v5.13-b ⑤ ·
 *       오케스트레이터 게이트·jobs_load 활성일 가드(마이그 20260822090000)·아래 감시가 «같은 값 하나»를 읽는다)
 *    ㉯ cron 4잡 — lib/생성상수.js `크론표` 가 코드 쪽 정본이고 tests/활성조각.test.js 가 이 파일과 기계 대조한다(§12-21):
 *       · deliver-daily     5 16 * * *      00:05 UB  Edge `deliver` — 기존 잡 «재사용» · 🔴 URL 에 `맥락=배치` 명시(§3-1 v5.8 — 활성 뒤 누락도 400 이라 잊으면 배포 시점에 시끄럽게 죽는다)
 *       · generate-worker   */10 16-21 * * *  00:00~05:50 UB 10분마다  Edge `deliver-one` — 워커 재진입(v5.5 B3 — 구 10-50/10 은 시 경계마다 20분 공백)
 *       · generate-deadline 0 22 * * *      06:00 UB  SQL 직접 `engine.jobs_finalize_due` — 마감 스윕(벤더 0 · 대상은 마감 지난 «전량» — 함수 안 조건이 진다 · v5.7 B2)
 *       · deliver-check     5 22 * * *      06:05 UB  SQL 직접 — 감시 9항(마감 «뒤» 기준 · v5.4 C4 — 옛 «착지 수» 감시(35 16 · http ?점검)를 이 등록이 걷는다)
 *    ㉰ 감시 9항(①남은 큐 · ②-a 배치 완주 · ②-b 죽은 실행 · ③부분 결손 · ④열린 시도 · ⑤과거 고아(동의격리는 정보 채널 · T12) · ⑥실행판 갈림 · ⑦빈 배정(T11) · ⑧산출 전멸(T6))
 *       — 전부 «활성 시작일부터»만(v5.7 B9 — 머리 게이트 하나). 적색이면 raise exception 으로 잡 실패에 남는다.
 *    ㉱ 밤당 생성 상한(심문 T7 — 활성 «전» 점검): 워커학생상한 3 × generate-worker 36회 = **하루 최대
 *       108명**. 재적이 이를 넘으면 초과분은 매일 06:00 마감폴백으로 빠지는데 큐는 닫혀 감시가 초록이다
 *       (⑧ 이 성공 0 만 재므로 «일부 폴백»은 못 본다). 지금 정원 16 이라 여유 ×6.75 — **재적이 커지는 날
 *       워커학생상한(§12-20 실측 후 걷기 예약)·워커 창을 함께 늘린다.** 활성 날 이 산술을 다시 센다.
 *
 * ■ 착지 절차(스토어 출시 커밋을 만드는 세션이 순서대로 — 활성일은 「c12 신앱이 스토어에 나간 뒤」 v5.8 갈래 12):
 *    1. 자리표 셋을 채운다 — `__활성일__`(YYYY-MM-DD · 유호님 확정값), `__버전__`(그날 타임스탬프 14자리),
 *       `__기준선__`(그 시점 supabase/migrations 최신 version).
 *    2. 파일을 `supabase/migrations/__버전___gen_activate_c12.sql` 로 «이동»한다(사본 금지 — 이 대기 파일은 그 자리에서 사라진다).
 *    3. checksum 을 스탬프한다 — 슬롯(ZERO 64자) 상태의 파일 sha256 을 계산해 두 슬롯에 기입
 *       (tools/마이그레이션_합본.js `checksumInfo` 와 같은 규약 · 예:
 *       node -e "const f=require('fs'),c=require('crypto');const p=process.argv[1];let s=f.readFileSync(p,'utf8');const h=c.createHash('sha256').update(Buffer.from(s,'utf8')).digest('hex');f.writeFileSync(p,s.split('0'.repeat(64)).join(h));console.log(h)" <경로>)
 *    4. `node tools/마이그레이션_합본.js` 로 L0 재생성 → `node tools/원격SQL.js <경로> --적용`.
 *    5. 검증 — `node tools/생성왕복시험.js --물리` 와 `--오늘`(활성 뒤에는 임시 게이트 없이 실물이 진다),
 *       `node --test tests/활성조각.test.js`(착지 후 모드 — 파일 이동을 감지해 cron 실물 대조로 갈린다).
 *    6. 앱 쪽 한 벌 — 어댑터 `assignment_status` 소비 + `생성중`·`오류` 문구 칸(§12-11 · 문구는 유호님 카피),
 *       ⓔ-22 구앱 간주. 이 파일이 지는 몫이 아니다(신앱 저장소 몫 — §12 도장 절).
 *
 * ■ 되돌림: select cron.unschedule('generate-worker'), cron.unschedule('generate-deadline');
 *           deliver-daily·deliver-check 는 20260809070000_cron_c10.sql 의 등록을 다시 부어 옛 몸으로,
 *           drop function engine.gen_active_from(); (jobs_load 가드는 존재 판별이라 그대로 무동작이 된다)
 *
 * 🔑 자격증명이 이 파일에 없다 — Vault 참조(20260809070000_cron_c10.sql 선례 그대로).
 *    vault: `service_role_key` · `functions_base_url` 두 항목이 그 프로젝트에 이미 있어야 한다. */

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $migration$
declare
  migration_version constant text := '__버전__';
  migration_name constant text := '__버전___gen_activate_c12.sql';
  expected_checksum constant text := '0000000000000000000000000000000000000000000000000000000000000000'; -- migration-checksum
  base_version constant text := '__기준선__';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 c12 위에서만 돈다 — engine.schema_migrations 가 없다(빈 DB 면 합본을 처음부터 부어라)';
  end if;

  select checksum into recorded_checksum
    from engine.schema_migrations
   where version = migration_version;

  if found then
    if recorded_checksum is distinct from expected_checksum then
      raise exception
        'migration % checksum 불일치: DB=%, 파일=% — 같은 버전을 고쳐 쓰지 않는다',
        migration_version, recorded_checksum, expected_checksum;
    end if;
    return;
  end if;

  if not exists (select 1 from engine.schema_migrations where version = base_version) then
    raise exception
      '이 조각은 기준선 % 위에서만 돈다 — 이력에 그 판이 없다(부분·혼합·불명이라 중단한다)',
      base_version;
  end if;
end
$migration$;

-- ㉮ 활성 게이트 — 물리 이름 하나(v5.13-b ⑤). 값은 배포 커밋이 정한다(C5 — 문서에만 적으면
--    배포마다 갈린다). immutable: 값이 바뀌는 날은 «새 마이그»가 create or replace 로 올린다.
create or replace function engine.gen_active_from()
  returns date language sql immutable as $f$ select date '__활성일__' $f$;

comment on function engine.gen_active_from() is
  '상태기반 생성의 활성 시작일(§3-2-a C5) — 오케스트레이터 게이트·jobs_load 가드·deliver-check 감시가 같은 값 하나를 읽는다. 이전 날짜는 라이브 경로가 진 날이라 큐가 되짚지 않는다.';

-- ㉯ cron — 멱등: 같은 이름이 있으면 떼고 다시 건다(c10 선례). transcribe-batch·radio-promote-hourly 는 무접촉.
do $cron$
begin
  perform cron.unschedule(jobname)
    from cron.job
   where jobname in ('deliver-daily', 'deliver-check', 'generate-worker', 'generate-deadline');

  /* ① 오케스트레이터 — 기존 잡 재사용 · 몸이 바뀐 것은 URL 의 `맥락=배치`(퍼센트 인코딩 ·
   *    함수 쪽 URLSearchParams 가 되돌려 읽는다 — c10 `?점검` 선례) 하나다.
   * 🔑 `ops.발사` 경유(장부 20260815080000 c11) — http_post 직접이면 회차 장부가 이 잡에 눈멀고,
   *    c11 이 운영에 걸어 둔 장부 경유를 **활성 날 이 조각이 조용히 되무른다**(실측 08-24:
   *    리허설 잔존 cron 이 정확히 그 모양으로 9일 침묵했다). 헤더·서비스키는 발사가 안에서 진다. */
  perform cron.schedule('deliver-daily', '5 16 * * *', $job$
    select ops.발사('deliver-daily',
      (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/deliver?%EB%A7%A5%EB%9D%BD=%EB%B0%B0%EC%B9%98');
  $job$);

  /* ② 워커 재진입 — 36회 창 ≫ 필요 6회(F2). 겹침은 jobs_claim 이 막고, 큐가 비면 0행 즉시
   *    종료라 넉넉함이 안전선이지 낭비가 아니다. B3 재호출(미완·적재실패 이어받기)은 워커
   *    자신이 진다 — cron 은 부르기만 한다. */
  perform cron.schedule('generate-worker', '*/10 16-21 * * *', $job$
    select ops.발사('generate-worker',
      (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/deliver-one');
  $job$);

  /* ③ 마감 스윕 — SQL 직접(벤더 0 · Edge Fn 불요). 대상은 「오늘」이 아니라 마감 지난 «전량»
   *    (v5.7 B2 — 함수 안 `assign_date <= _assign_date and now() >= gen_deadline(...)` 이 진다).
   *    날짜 식은 §3-2-a v5.5 B1 계약 — UTC ::date 면 UB 자정~아침이 통째로 전날로 귀속된다. */
  perform cron.schedule('generate-deadline', '0 22 * * *', $job$
    select engine.jobs_finalize_due((now() at time zone 'Asia/Ulaanbaatar')::date);
  $job$);

  /* ④ 감시 7항 — SQL 직접(벤더 0). 시각(06:05 UB)이 마감(06:00) «뒤»인 것이 기준의 일부다
   *    (C4 — 그 시각에 남아 있으면 진짜 사고다). 적색이면 raise exception 으로 잡 실패에 남는다
   *    (수신자는 지금 로그뿐 — §373). 마감 «전» 손 실행은 ① 이 거짓 적색이니 하지 않는다. */
  perform cron.schedule('deliver-check', '5 22 * * *', $job$
    do $watch$
    declare
      오늘 date := (now() at time zone 'Asia/Ulaanbaatar')::date;
      활성일 date := engine.gen_active_from();
      정본 engine.generation_batch_runs%rowtype;
      적색 text[] := '{}';
      정보 text[] := '{}';   -- 적색 아님·알고 있어야 하는 수(T12 동의격리) — notice 로만 낸다
      n int;
    begin
      -- 일곱 항 전부 «활성 시작일부터»만(v5.7 B9) — 머리 게이트 하나가 배포~활성 사이 거짓 적색을 없앤다.
      if 활성일 is null or 오늘 < 활성일 then
        return;
      end if;

      -- ① 남은 큐(C4) — 오늘 마감 뒤에도 남은 수. «적재실패» 를 함께 세는 것이 이 항의 값이다
      --    (그 상태는 닻이 없어 착지 수로는 영원히 안 보인다).
      select count(*)::int into n from engine.generation_jobs
       where assign_date = 오늘 and status in ('대기','claimed','적재실패');
      if n > 0 then 적색 := 적색 || format('① 남은 큐 %s건', n); end if;

      -- ②-a 배치 완주(v5.6 B1) — 완주 0 = 안 돌았거나 전부 죽었다(전멸이 ① 에서 초록인 자리).
      select count(*)::int into n from engine.generation_batch_runs
       where assign_date = 오늘 and run_kind = '배치' and finished_at is not null;
      if n = 0 then 적색 := 적색 || '②-a 배치 완주 0건'; end if;

      -- ②-b 죽은 실행(v5.9 갈래 16) — 여유는 ⓪ 리더 게이트와 «한 원천»(engine.gen_leader_grace).
      select count(*)::int into n from engine.generation_batch_runs
       where assign_date = 오늘 and run_kind = '배치' and finished_at is null
         and started_at < now() - engine.gen_leader_grace();
      if n > 0 then 적색 := 적색 || format('②-b 죽은 실행 %s건', n); end if;

      -- ③ 부분 결손(v5.6 B2) — 그날 «정본 실행»(완주 최신)의 partial_count 를 읽는 유일한 자리.
      select * into 정본 from engine.generation_batch_runs
       where assign_date = 오늘 and run_kind = '배치' and finished_at is not null
       order by started_at desc limit 1;
      if 정본.run_id is not null and coalesce(정본.partial_count, 0) > 0 then
        적색 := 적색 || format('③ 부분 결손 %s건', 정본.partial_count);
      end if;

      -- ④ 열린 시도(v5.6 B10 · v5.7 B7) — 세 갈래 «명시» 열거로 UNKNOWN 을 없앤다(회수가 비운
      --    lease_until 이 표적 그 자체다). 벤더를 부르고 버린 건이 쌓이는 자리(돈이 나간다).
      select count(*)::int into n
        from engine.generation_attempts a
        join engine.generation_jobs g on g.job_id = a.job_id
       where a.result is null
         and (g.lease_until < now() or g.lease_until is null or g.outcome is not null);
      if n > 0 then 적색 := 적색 || format('④ 열린 시도 %s건', n); end if;

      -- ⑤ 과거 고아(v5.7 B2) — ㉧ 스윕이 마감 지난 «전량» 을 쓸므로 정상이면 항상 0 이다.
      -- 🔴 동의 없는 학생의 잔존은 «따로» 센다(심문 T12): 스윕이 그 job 을 «일부러» 격리하므로
      --    (한 건 실패 격리 — 왕복 B5 「원리상 영영 못 닫힌다」 자인) 고아로 합쳐 세면 철회 1건이
      --    이 항을 «매일» 적색으로 만들고, 상시 적색은 신호로서 죽는다(F103 늑대소년 — 진짜 고아가
      --    그 속에 숨는다). 술어 = lib/동의게이트.js 지금유효술어와 같은 식(그 파일이 정본).
      select count(*)::int into n from engine.generation_jobs g
       where g.assign_date < 오늘 and g.assign_date >= 활성일 and g.status in ('대기','claimed')
         and exists (select 1 from engine.consents c
                      where c.learner_id = g.learner_id
                        and c.agreed_at <= now() and (c.revoked_at is null or c.revoked_at > now()));
      if n > 0 then 적색 := 적색 || format('⑤ 과거 고아 %s건', n); end if;
      -- 동의격리 잔존(정보 — 적색 아님): 철회가 서는 날 1 이 되는 것이 «정상»이고, 처분(닫을 값)은
      -- status 값록 개정(cN)의 몫이라 여기선 세어 보이기만 한다. 0 이 아니면 봉투에 실린다.
      select count(*)::int into n from engine.generation_jobs g
       where g.assign_date < 오늘 and g.assign_date >= 활성일 and g.status in ('대기','claimed')
         and not exists (select 1 from engine.consents c
                          where c.learner_id = g.learner_id
                            and c.agreed_at <= now() and (c.revoked_at is null or c.revoked_at > now()));
      if n > 0 then 정보 := 정보 || format('동의격리 잔존 %s건(적색 아님 — 철회 학생의 스윕 격리 · T12)', n); end if;

      -- ⑥ 실행판 갈림(v5.9 갈래 17) — 정본 실행판 여섯 ↔ 그날 job 실행판 여섯이 다른 job 수.
      --    attempts↔job 은 attempt_open 이 물리로 거절하는데(A5) 이 축은 여기가 유일한 눈이다.
      if 정본.run_id is not null then
        select count(*)::int into n from engine.generation_jobs g
         where g.assign_date = 오늘
           and (g.model <> 정본.model or g.prompt_ver <> 정본.prompt_ver
                or g.policy_ver <> 정본.policy_ver or g.estimator_version <> 정본.estimator_version
                or g.schema_ver <> 정본.schema_ver or g.skill_taxonomy_ver <> 정본.skill_taxonomy_ver);
        if n > 0 then 적색 := 적색 || format('⑥ 실행판 갈림 %s건', n); end if;
      end if;

      -- ⑦ 빈 배정(심문 T11 — «원리상 안 나는» 행의 감시): 배정 사건은 섰는데 submissions 0.
      --    tasks inner join 이 그 행을 못 봐 학생은 영구 «없음»이고, deliver 재실행의 T11 자가치유
      --    (제출 보충)가 닿기 전까지 이 수가 그 존재를 든다. 활성 뒤 착지는 봉투 세 블록 전부
      --    필수(jobs_finalize «부분 착지 금지»)라 정상이면 항상 0 이다.
      select count(*)::int into n
        from engine.learning_events e
       where e.event_type = 'task.assigned'
         and (e.occurred_at at time zone 'Asia/Ulaanbaatar')::date = 오늘
         and not exists (select 1 from engine.submissions s where s.event_id = e.event_id);
      if n > 0 then 적색 := 적색 || format('⑦ 빈 배정 %s건', n); end if;

      -- ⑧ 산출 전멸(심문 T6 — 큐 위생만 있고 «산출 질» 축이 0항이던 자리): 생성 대상이 있었는데
      --    벤더 성공이 하루 0 이면, 키 만료·벤더 장애의 날에도 큐는 닫혀 ①~⑥ 이 전부 초록이다 —
      --    강등률이 봉투·로그에만 남고 감시는 침묵한다. 문턱 없음(0 등식)이고, 전원 구제·전원
      --    폴백의 «정당한» 날도 이 항에 걸리는 것이 의도다(그날 무엇으로 빠졌는지는 분포가 든다).
      if 정본.run_id is not null and coalesce(정본.target_count, 0) > 0 then
        select count(*)::int into n from engine.generation_jobs
         where assign_date = 오늘 and outcome = '성공';
        if n = 0 then
          declare 분포 text;
          begin
            select string_agg(format('%s=%s', outcome, cnt), '·') into 분포
              from (select outcome, count(*)::int as cnt from engine.generation_jobs
                     where assign_date = 오늘 and outcome is not null
                     group by outcome order by cnt desc) d;
            적색 := 적색 || format('⑧ 산출 전멸(대상 %s · 성공 0 · 분포 %s)', 정본.target_count, coalesce(분포, '없음'));
          end;
        end if;
      end if;

      if cardinality(정보) > 0 then
        raise notice 'deliver-check 정보(적색 아님): %', array_to_string(정보, ' · ');
      end if;
      if cardinality(적색) > 0 then
        raise exception 'deliver-check 적색(§3-2-a 감시 9항): %', array_to_string(적색, ' · ');
      end if;
    end
    $watch$;
  $job$);
end
$cron$;

do $migration2$
declare
  migration_version constant text := '__버전__';
  migration_name constant text := '__버전___gen_activate_c12.sql';
  expected_checksum constant text := '0000000000000000000000000000000000000000000000000000000000000000'; -- migration-checksum
begin
  if exists (select 1 from engine.schema_migrations where version = migration_version) then
    return;
  end if;
  insert into engine.schema_migrations(version, name, checksum)
  values (migration_version, migration_name, expected_checksum);
end
$migration2$;

commit;
