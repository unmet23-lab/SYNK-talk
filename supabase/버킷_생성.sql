-- ============================================================================
-- Storage 비공개 버킷 — C0 §4-2 · L0 §9-3-1
--
-- 버킷은 **하나**다. `voice/` 와 `image/` 는 그 안의 폴더고, 그 아래가 `{learner_id}/` 다.
--   철회 절차(L0 §9-3-2 2번)에서 유호님 손이 닿는 곳이 정확히 그 폴더다 —
--   버킷을 갈래마다 나누면 손 삭제가 1회에서 2회가 되고, 날짜로 나누면 무한이 된다.
--
-- 🔴 공개하지 않는다(`public = false`). 재생은 조회용 서명 URL 로만 한다.
--   공개로 두면 경로만 알면 누구나 학생 목소리를 받아 갈 수 있고, 그 경로는 uuid 라
--   「추측 못 한다」에 기대게 된다 — 그건 접근 제어가 아니다.
--
-- file_size_limit 을 **여기에도** 두는 이유: 함수는 앱이 말한 `byte_size` 를 보는데
--   그건 앱이 지어낼 수 있다. **실제 바이트를 재는 곳은 Storage 뿐이다.**
--   두 곳에 적는 게 아니라 **잴 수 있는 층에서 한 번 더** 재는 것이다.
--
-- allowed_mime_types 는 **비워 둔다.** C0 §4-2 가 「규격 밖이어도 거부하지 않는다」로 못박았고
--   (거부하면 학생의 발화가 영영 사라진다), 여기에 목록을 두면 `lib/업로드경로.js` 의 표와
--   갈라진다 — 갈라지면 증상은 「어떤 학생만 업로드 실패」다.
--
-- 두 번 실행해도 안전하다. 실행: node tools/원격SQL.js supabase/버킷_생성.sql --적용
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('learner-media', 'learner-media', false, 26214400)   -- 25MB
on conflict (id) do update
   set public = false,                    -- 누가 공개로 돌려놨으면 되돌린다
       file_size_limit = 26214400;

-- 확인 — public 이 false 고 상한이 붙어 있어야 한다.
select id, public, file_size_limit,
       case when public = false and file_size_limit = 26214400
            then '✅ 비공개 · 25MB' else '❌ 이 줄을 그대로 알려주세요' end as 판정
  from storage.buckets where id = 'learner-media';
