alter table engine.learning_events
  drop constraint learning_events_event_type_c3,
  add constraint learning_events_event_type_c4 check (event_type in (
    'submission.created', 'quiz.answered', 'choice.selected',
    'correction.responded', 'correction.viewed', 'preference.stated',
    'session.abandoned', 'intervention.delivered', 'data_use.granted'
  )),
  drop constraint learning_events_task_type_c3,
  add constraint learning_events_task_type_c4 check (task_type is null or task_type in (
    '숙제제출', '다시쓰기', '퀴즈응답', '대화턴', '발화녹음', '출석발화'
  ));

alter table engine.corrections
  drop constraint corrections_verdict_c3,
  add constraint corrections_verdict_c4 check (verdict is null or verdict in (
    'AI 교정이 맞다', '고칠 곳이 있다', '원문이 이미 맞다'
  ));
