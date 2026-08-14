/* 명부에 **행을 만드는 자리**가 몇 개인지 잰다.
 *
 * 🔴 실사건 2026-08-09: 두 세션이 같은 P0 를 1분 차로 집어 명부 통로를 **둘** 지었다
 *   (`tools/명부등록.js --파일` / `tools/명단동기화.js`). 둘째는 커밋 0으로 지워졌지만,
 *   통로가 둘이 되는 순간 검증 규칙(전화 대조·전량 거절·중복 접기)이 갈라지고
 *   **증상은 「앱에서 안 된다」 하나뿐**이라 원인이 명부에 있는 줄 모른다(F269 와 같은 모양).
 *   되돌릴 수 없는 것은 코드가 아니라 **갈라진 뒤 흘러들어간 데이터**다. 그래서 다음번엔
 *   사람 눈이 아니라 이 검사가 먼저 본다.
 *
 * 🔑 **허용목록**이지 차단목록이 아니다 — 차단목록은 못 적은 이름이 샌다. 새 자리를 여는 것을
 *   막지는 않는다. 다만 이 목록을 **손으로 고치게** 만들어서, 조용히 둘째가 생기지 않게 한다.
 * 🔑 목록은 역할까지 적는다. 「명부 통로」와 「시험 시딩」은 같은 SQL 을 쓰지만 다른 일이고,
 *   섞이면 시딩 규칙(아무 번호나 만들어 넣기)이 실학생 명부로 새어 든다.
 * 🔑 이 파일은 `tests/명부등록.test.js` 와 따로 둔다 — 저쪽은 그 도구 **하나**의 행동을 재고
 *   여기는 **저장소 전체**를 잰다. 재는 범위가 다르면 파일도 다르다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const 붓는곳 = {
  /* 문은 둘, 규칙은 한 벌 — 두 자리 다 판정을 `lib/명부규칙.js` 하나에서 가져온다(E² 명부 스윕 ·
   * 철학정합 §3-E-2 · 유호 채택 08-11). `roster-ingest` 는 앱이 닿는 문이 아니다 — 좁은 시크릿
   * (`x-roster-ingest-key`)이 잠그고 호출자는 appsscript 아침 스윕 하나다. 계정은 여전히
   * 아무도 만들지 않는다(F269 의 급소는 계정이지 명부 행이 아니다). */
  '명부 통로(실학생)': ['tools/명부등록.js', 'supabase/functions/roster-ingest/index.ts'],
  '시험 시딩(리허설 픽스처)': [
    'tools/왕복시험.js', 'tools/인증왕복시험.js', 'tools/교정왕복시험.js', 'tools/배달왕복시험.js',
    'tools/라디오승격왕복시험.js',
    /* 반 배정 게이트(설계 §8-5 ⓐ)를 재려면 **담당 반 밖 학생**이 실재해야 한다 — 「막혔다」와
     * 「원래 없다」를 가르는 것이 그 인수 조건의 전부라, 픽스처를 안 심으면 0행이 저절로 초록이다.
     * 고정 코드 둘(RTFB-X1·RTFB-Y1)만 재사용하고 회차마다 늘리지 않는다. */
    'tools/반피드백왕복시험.js',
    'tools/검증_마이그레이션.sh',
  ],
};
const 붓는패턴 = /insert\s+into\s+engine\.learners/i;

test('탐지력 픽스처 — 붓는 문장을 표기가 흔들려도 잡는다', () => {
  assert.ok(붓는패턴.test("await sql('insert into engine.learners (student_code) values (...)')"));
  assert.ok(붓는패턴.test('insert  into\n  engine.learners(learner_id)'), '줄바꿈·겹공백이 끼면 놓친다');
  assert.ok(붓는패턴.test('INSERT INTO ENGINE.LEARNERS(x)'), '대문자 SQL 을 놓친다');
  assert.ok(!붓는패턴.test('select * from engine.learners'), '읽기를 붓기로 세면 쓸 수 없다');
  assert.ok(!붓는패턴.test('insert into engine.learning_events(x)'), '다른 표를 명부로 센다');
});

test('🔴 실학생 명부를 붓는 문은 **선언된 둘**뿐이고, 둘 다 같은 규칙 lib 을 문다', () => {
  assert.deepEqual(붓는곳['명부 통로(실학생)'],
    ['tools/명부등록.js', 'supabase/functions/roster-ingest/index.ts'],
    '문이 늘면 검증 규칙이 갈라질 자리부터 는다(F269) — 늘릴 거면 lib/명부규칙.js 를 먹는지부터 증명해라');
  /* 선언만으로는 못 믿는다 — 소스가 규칙 lib 을 실제로 물고 있는지를 본다.
   * 이게 풀리는 순간이 「규칙 두 벌」의 시작이고, 증상은 「앱에서 안 된다」뿐이다. */
  const cli = fs.readFileSync(path.join(ROOT, 'tools', '명부등록.js'), 'utf8');
  assert.match(cli, /require\('\.\.\/lib\/명부규칙\.js'\)/,
    'CLI 가 규칙 lib 을 안 먹는다 — 판정이 두 벌로 갈라졌다');
  const fn = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'roster-ingest', 'index.ts'), 'utf8');
  assert.match(fn, /import\s+명부규칙\s+from\s+'\.\/명부규칙\.mjs'/,
    '함수가 규칙 lib 동봉을 안 먹는다 — 판정이 두 벌로 갈라졌다');
});

test('🔴 실저장소 — 선언 안 된 곳에서 명부를 붓지 않는다 (서버 문은 roster-ingest 하나뿐)', () => {
  const 허용 = new Set(Object.values(붓는곳).flat());
  const 볼곳 = ['tools', 'lib', 'src', 'supabase/functions', 'supabase/migrations'];

  const 잰것 = [];
  const 선언밖 = [];
  const 서버 = [];
  for (const 폴더 of 볼곳) {
    const 절대 = path.join(ROOT, 폴더);
    if (!fs.existsSync(절대)) continue;
    for (const f of fs.readdirSync(절대, { recursive: true, withFileTypes: true })) {
      if (!f.isFile() || !/\.(js|ts|sh|sql)$/.test(f.name)) continue;
      const 상대 = path.relative(ROOT, path.join(f.parentPath || f.path, f.name)).split(path.sep).join('/');
      잰것.push(상대);
      if (!붓는패턴.test(fs.readFileSync(path.join(ROOT, 상대), 'utf8'))) continue;
      if (!허용.has(상대)) 선언밖.push(상대);
      if (상대.startsWith('supabase/functions/')) 서버.push(상대);
    }
  }

  // 🔴 분모부터 밝힌다 — 0건을 잰 것과 통과는 같은 모양이다(F207).
  assert.ok(잰것.length > 40, `잰 파일이 ${잰것.length}개뿐이다 — 목록을 못 읽었을 수 있다`);
  assert.deepEqual(선언밖, [],
    `선언 안 된 곳이 명부를 붓는다 — 통로를 늘릴 생각이면 이 파일의 허용목록에 **역할과 함께** 적어라: ${선언밖.join(', ')}`);
  /* 🔴 서버에서 명부 행을 만들 수 있는 것은 **좁은 시크릿 문 하나**(roster-ingest)뿐이다.
   *   F269 가 막은 것은 「앱이 닿는 계정 생성 통로」다 — roster-ingest 는 앱이 못 닿고(시크릿),
   *   계정이 아니라 명부 행만 만들며, 판정은 CLI 와 같은 lib 에서 온다(위 검사가 못박는다).
   *   첫 등록(`auth`)은 여전히 이미 있는 행에 `auth_user_id` 를 **잇는** 일이지 행을 만드는 일이 아니다. */
  assert.deepEqual(서버, ['supabase/functions/roster-ingest/index.ts'],
    `서버 함수의 명부 붓기가 선언과 다르다: [${서버.join(', ')}]`);
});

test('허용목록에 적힌 파일이 실제로 있다 — 이름이 낡으면 검사가 조용히 헐거워진다', () => {
  const 없는것 = Object.values(붓는곳).flat().filter((p) => !fs.existsSync(path.join(ROOT, p)));
  assert.deepEqual(없는것, [], `허용목록의 이름이 저장소에 없다: ${없는것.join(', ')}`);
});
