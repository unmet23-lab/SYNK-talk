-- 읽기 전용 — 「이 DB 는 지금 어느 판인가」만 묻는다.
-- 사후 확인 쿼리는 **현재 판의 열을 전제**하므로, 뒤처진 DB 에서는 쿼리 자체가 죽는다
-- (2026-08-09 실측: 운영에서 `column s.due_at does not exist`). 뒤처짐을 재는 눈이
-- 뒤처짐 때문에 안 도는 자리라, 판 번호만 묻는 최소 질의를 따로 둔다.
select (select count(*) from engine.schema_migrations)                       as 조각수,
       (select version from engine.schema_migrations
         order by applied_at desc, version desc limit 1)                     as 현재버전,
       (select name from engine.schema_migrations
         order by applied_at desc, version desc limit 1)                     as 조각이름,
       (select applied_at::text from engine.schema_migrations
         order by applied_at desc, version desc limit 1)                     as 적용시각,
       (select count(*) from information_schema.columns
         where table_schema='engine' and table_name='review_queue')          as 검수판열,
       (select count(*) from engine.learners)                                as 학생수,
       (select count(*) from engine.learning_events)                         as 사건수;
