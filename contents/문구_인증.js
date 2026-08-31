'use strict';
/**
 * 인증 화면 문구 — 로그인·첫 등록·임시번호·비밀번호 변경에서 학생이 읽는 글의 정본(이 될 자리).
 *
 * ■ 🔑 키가 `l10n` 의 `string_id` 그대로다 — `contents/문구_1차.js` 의 `auth.*` 와 **1:1** 이고
 *   `tests/문구_인증.test.js` 가 그것을 양방향으로 센다(`문구_오류.js` 와 같은 규율). 한쪽에만
 *   있는 줄이 생기면 그 순간 빨개진다 — 감수자가 옮긴 문장이 갈 곳 없이 남지 않게.
 * ■ 🔴 몽골어는 **비워 둔다** — 지어낸 번역을 학생에게 뿌리지 않는다(`문구_동의.js`·`문구_오류.js`
 *   와 같은 규율 — 틀린 몽골어는 없는 것보다 나쁘다). 감수가 끝나는 날 `mn` 만 채우면
 *   `줄들()` 이 병기 줄을 내기 시작한다.
 * ■ ⚠ 화면(`src/인증화면.js`)은 **아직 이 표를 안 읽는다** — 리터럴을 표 조회로 바꾸는 일은
 *   `contents/문구_1차.js` 의 `auth.*` `source_file` 을 이 파일로 옮기는 것과 **한 커밋**이어야
 *   한다(`tests/문구_1차.test.js` ⑥ 이 「인용한 원문이 그 파일에 실제로 있나」를 대조한다 —
 *   따로 하면 그 자리에서 빨개진다). `err.*` 가 `문구_오류.js` 로 옮겨 갈 때 지난 길 그대로다.
 */

/** 문장 정본. 키 = `l10n` string_id. `{n}` 은 숫자가 들어가는 칸이다(옮길 때 그대로 둔다). */
const 문구 = {
  /* ── 제목 넷 ───────────────────────────────────────────────── */
  'auth.title.login': { ko: '들어가기', mn: '' },
  'auth.title.first': { ko: '처음 오셨네요', mn: '' },
  'auth.title.temp': { ko: '임시번호로 들어가기', mn: '' },
  'auth.title.change': { ko: '비밀번호 바꾸기', mn: '' },

  /* ── 버튼 넷 ───────────────────────────────────────────────── */
  'auth.button.login': { ko: '들어가기', mn: '' },
  'auth.button.first': { ko: '시작하기', mn: '' },
  'auth.button.temp': { ko: '새 비밀번호로 시작하기', mn: '' },
  'auth.button.change': { ko: '바꾸기', mn: '' },

  /* ── 입력칸 라벨 ───────────────────────────────────────────── */
  'auth.field.student_id': { ko: '학생번호', mn: '' },
  'auth.field.phone_last4': { ko: '전화번호 뒤 4자리', mn: '' },
  'auth.field.temp_code': { ko: '학원에서 받은 6자리', mn: '' },
  'auth.field.password': { ko: '비밀번호', mn: '' },
  'auth.field.password_now': { ko: '지금 비밀번호', mn: '' },
  'auth.field.password_new': { ko: '새 비밀번호', mn: '' },
  'auth.field.password_set': { ko: '쓸 비밀번호', mn: '' },
  'auth.field.email': { ko: '이메일', mn: '' },
  'auth.field.phone_alt': { ko: '다른 전화번호', mn: '' },

  /* ── 도움말·연락처 묶음 ────────────────────────────────────── */
  'auth.hint.password_min': { ko: '{n}자 이상', mn: '' },
  'auth.contact.head': { ko: '연락처 (넣지 않아도 시작할 수 있어요)', mn: '' },
  'auth.contact.tail': {
    ko: '비밀번호를 잊었을 때 학원이 본인인지 확인하는 데만 써요. 여기로 연락은 가지 않아요.',
    mn: '',
  },

  /* ── 곁길 셋 ───────────────────────────────────────────────── */
  'auth.link.first': { ko: '처음 오셨나요', mn: '' },
  'auth.link.forgot': { ko: '비밀번호를 잊었어요', mn: '' },
  'auth.link.back': { ko: '← 돌아가기', mn: '' },
};

/**
 * 병기 줄배열 — `[{ 글, mn: false }, { 글, mn: true }]` 에서 빈 줄을 거른다.
 * 화면 규약: `mn: false` 줄은 킷 폰트, `mn: true` 줄은 `몽골어폰트`(`src/인증화면.js` 고르기 무늬).
 * 지금은 `mn` 이 전부 비어 있어 언제나 한 줄이다 — 표만 차면 화면 코드 없이 병기가 선다.
 *
 * @param {string} id  이 표의 키(= l10n string_id)
 * @param {{채움?: Record<string, string|number>}} [opt]  `{n}` 같은 칸을 메운다
 * @returns {Array<{글: string, mn: boolean}>} 모르는 id 면 빈 배열(빈 줄을 그리지 않는다)
 */
function 줄들(id, opt) {
  const 짝 = 문구[id];
  if (!짝) return [];
  const 채움 = (opt && opt.채움) || null;
  const 메우기 = (s) => (채움
    ? String(s).replace(/\{(\w+)\}/g, (전체, k) => (k in 채움 ? String(채움[k]) : 전체))
    : String(s));
  return [
    { 글: 메우기(짝.ko || '').trim(), mn: false },
    { 글: 메우기(짝.mn || '').trim(), mn: true },
  ].filter((줄) => 줄.글);
}

module.exports = { 문구, 줄들 };
