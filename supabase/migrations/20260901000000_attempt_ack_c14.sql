/* 감시 ④ 처분 도장 — generation_attempts.acked_at 한 열 (감사 08-31 · c14 물리 +1)
 *
 * ■ 왜 — 감시 ④(열린 시도)는 워커가 부르다 죽어 «영영 result null» 인 시도를 세는데, 그 행을
 *   닫는 스윕이 없다(jobs_reclaim 주석 「열린 attempt 는 안 닫는다」 · attempts 를 닫는 update 는
 *   attempt_close 하나 — 워커 호출뿐). 그래서 한 건 나면 ④ 가 «매일» 적색이고, 상시 적색은
 *   신호로서 죽는다(F103 — ⑤ 가 동의격리를 따로 세는 그 근거가 ④ 에도 걸린다).
 * ■ 무엇 — acked_at timestamptz(널 허용) 한 열: 사람이 그 시도를 «한 번 보고» 찍는 처분 도장.
 *   attempts.result 값목록은 안 늘린다 — 시도는 열린 채 역사로 남고, 감시 ④ 만 도장 찍힌 행을
 *   뺀다(활성조각_c12 의 «and a.acked_at is null» 술어가 유일한 소비자다).
 * ■ 도장 손 절차의 정본(SQL Editor 한 줄 — attempt_id 는 ④ 적색이 든 그 시도):
 *     update engine.generation_attempts set acked_at = now() where attempt_id = '<attempt_id>';
 *
 * 되돌림: alter table engine.generation_attempts drop column acked_at;
 *         delete from engine.schema_migrations where version='20260901000000'; */

begin;

do $migration$
declare
  migration_version constant text := '20260901000000';
  migration_name constant text := '20260901000000_attempt_ack_c14.sql';
  expected_checksum constant text := '0b387c98fefaa50ce3f158e5b4c622079a6155812d563db4cb64eb7f6c118007'; -- migration-checksum
  base_version constant text := '20260831130000';
  recorded_checksum text;
begin
  if to_regclass('engine.schema_migrations') is null then
    raise exception
      '이 조각은 합본 위에서만 돈다 — engine.schema_migrations 가 없다(빈 DB 면 합본을 처음부터 부어라)';
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
      'migration % 는 % 위에서만 돈다 — 체인이 끊겼다',
      migration_version, base_version;
  end if;
end
$migration$;

-- 처분 도장 칸 — null = 미처분(감시 ④ 가 세는 상태 그대로). CHECK 변경 0.
alter table engine.generation_attempts
  add column if not exists acked_at timestamptz;

comment on column engine.generation_attempts.acked_at is
  '감시 ④ 처분 도장 — 워커 사망으로 영영 result null 인 시도를 사람이 «한 번 보고» 도장. null=미처분. 도장 SQL 정본은 이 조각 머리말(update engine.generation_attempts set acked_at=now() where attempt_id=…)';

do $migration2$
declare
  expected_checksum constant text := '0b387c98fefaa50ce3f158e5b4c622079a6155812d563db4cb64eb7f6c118007'; -- migration-checksum
begin
  if not exists (select 1 from engine.schema_migrations where version = '20260901000000') then
    insert into engine.schema_migrations(version, name, checksum)
    values ('20260901000000', '20260901000000_attempt_ack_c14.sql', expected_checksum);
  end if;
end
$migration2$;

commit;
