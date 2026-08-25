'use strict';
/* 곡판규격 — Reed 셋째 기둥의 회귀.
 * 🔴 이 스위트는 08-25~26 에 «유호님 화면에서» 드러난 실측 넷을 프로즈가 아니라 검사로 굳힌다:
 *   ①m4a 는 안 켜지는 자리가 있다 ②한글 파일명을 피한다 ③−20 LUFS 는 작다 ④20초로는 판단이 안 선다
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const 규 = require('../lib/곡판규격.js');
const 장 = require('../lib/곡장부.js');

const 인자문 = (a) => a.join(' ');

test('🔴 방송 판의 라우드니스 목표 = 장부의 채택 문턱 — 갈라지면 곡이 원리상 못 선다', () => {
  assert.equal(규.판들.방송.라우드니스, 장.규격.라우드니스LUFS,
    '구울 때 맞춘 값과 잴 때 재는 값이 다르면, 규격대로 구운 곡이 규격에서 떨어진다');
  assert.equal(규.판들.방송.최소초, 장.규격.최소길이초);
});

test('🔴 실측 ① — 시청 판은 MP3 다(m4a 로 돌아가지 않는다)', () => {
  for (const [이름, p] of Object.entries(규.판들)) {
    assert.equal(p.코덱, 'mp3', `${이름} 판이 mp3 가 아니다`);
  }
  const { 인자 } = 규.굽기인자({ 원본: 'a.wav', 원본초: 30, 이름: 'x', 판: '시청', 나갈방: '/out' });
  assert.ok(인자문(인자).includes('libmp3lame'));
  assert.ok(!인자문(인자).includes('aac'));
});

test('🔴 실측 ② — 나갈 파일명에 ASCII 밖 글자가 «한 자도» 없다', () => {
  const 이름들 = ['저녁 시티팝 · 도시의 밤', 'radio-B 저녁', '파도와 바람'];
  for (const n of 이름들) {
    const { 나갈길 } = 규.굽기인자({ 원본: 'a.wav', 원본초: 30, 이름: n, 판: '시청', 나갈방: '/out' });
    const 파일 = 나갈길.split('/').pop();
    assert.match(파일, /^[A-Za-z0-9._-]+$/, `${n} → ${파일}`);
  }
});

test('🔴 파일명은 «곡 id» 가 먼저다 — 08-26 실물이 잡은 것: 한글 제목은 전부 같은 이름으로 뭉갠다', () => {
  // 제목이 셋 다 한글이어도 파일은 안 겹친다(id 가 가른다)
  const 셋 = ['calm-1', 'calm-2', 'calm-3'].map((id) =>
    규.굽기인자({ 원본: 'a.wav', 원본초: 30, id, 이름: '비 오는 밤', 판: '방송', 나갈방: '/o' }).나갈길);
  assert.equal(new Set(셋).size, 3, `한글 제목 셋이 같은 파일로 뭉갰다: ${셋.join(' ')}`);
  assert.ok(셋[0].endsWith('calm-1-air.mp3'));
});

test('🔑 제목은 버리지 않는다 — 파일명만 ASCII 이고 한글 제목은 메타로 실린다', () => {
  const { 인자 } = 규.굽기인자({ 원본: 'a.wav', 원본초: 30, id: 'calm-1', 이름: '비 오는 밤', 판: '방송', 나갈방: '/o' });
  assert.ok(인자.some((x) => x === 'title=비 오는 밤 (방송)'), 인자.join(' '));
});

test('이름정리 — id 가 없으면 제목의 ASCII 를, 그것도 없으면 기본 이름을 쓴다', () => {
  assert.equal(규.이름정리('SYNK Radio B (v2)', null), 'SYNK-Radio-B-v2');
  assert.equal(규.이름정리('  radio__b  ', ''), 'radio__b');
  assert.equal(규.이름정리('저녁시티팝', null), 'track', '다 걷히면 빈 이름이 아니라 track 이다');
  assert.equal(규.이름정리('', ''), 'track');
  assert.equal(규.이름정리('SYNK Radio', 'r001'), 'r001', 'id 가 있으면 id 가 이긴다');
});

test('🔴 실측 ③ — 어느 판도 −20 LUFS 로 굽지 않는다(그 값이 「켜져 있나?」의 원인이었다)', () => {
  for (const [이름, p] of Object.entries(규.판들)) {
    assert.ok(p.라우드니스 >= -17, `${이름} 판 ${p.라우드니스} LUFS — 너무 작다`);
  }
});

test('🔴 실측 ④ — 시청 판도 최소 1분이다(20초로는 판단이 안 선다)', () => {
  assert.ok(규.판들.시청.최소초 >= 60);
});

test('🔴 바퀴수 — `-stream_loop` 은 «추가로 몇 번»이라 1을 뺀다(이 한 칸이 한 바퀴를 가른다)', () => {
  assert.deepEqual(규.바퀴수(30, 360), { 바퀴: 12, streamLoop: 11, 실제초: 360 });
  assert.deepEqual(규.바퀴수(40, 360), { 바퀴: 9, streamLoop: 8, 실제초: 360 });
  assert.deepEqual(규.바퀴수(400, 360), { 바퀴: 1, streamLoop: 0, 실제초: 400 }, '이미 길면 한 바퀴');
});

test('바퀴수는 «목표 이상»을 보장한다 — 모자란 판이 나가지 않는다', () => {
  for (const 원 of [7, 18.5, 21.3, 29.1, 33.7, 121]) {
    const r = 규.바퀴수(원, 360);
    assert.ok(r.실제초 >= 360, `원본 ${원}초 → ${r.실제초}초`);
  }
});

test('원본 길이를 모르면 0으로 접는다 — 지어낸 바퀴로 굽지 않는다', () => {
  assert.deepEqual(규.바퀴수(0, 360), { 바퀴: 0, streamLoop: 0, 실제초: 0 });
  assert.deepEqual(규.바퀴수(undefined, 360), { 바퀴: 0, streamLoop: 0, 실제초: 0 });
});

test('한 바퀴면 -stream_loop 을 «아예 안 붙인다» — 0을 붙이면 뜻이 애매해진다', () => {
  const { 인자 } = 규.굽기인자({ 원본: 'a.wav', 원본초: 400, 이름: 'x', 판: '방송', 나갈방: '/out' });
  assert.ok(!인자.includes('-stream_loop'));
});

test('🔑 aresample 이 loudnorm «뒤»에 온다 — loudnorm 이 48kHz 로 올려놓는다(08-26 실측)', () => {
  const { 인자 } = 규.굽기인자({ 원본: 'a.wav', 원본초: 30, 이름: 'x', 판: '방송', 나갈방: '/out' });
  const af = 인자[인자.indexOf('-af') + 1];
  assert.ok(af.indexOf('loudnorm') < af.indexOf('aresample'), `순서가 뒤집혔다: ${af}`);
  assert.ok(af.includes('aresample=44100'));
});

test('나갈 길 — 판마다 꼬리가 다르다(덮어쓰지 않는다)', () => {
  const 방 = '/out';
  const 셋 = 규.전체판({ 원본: 'a.wav', 원본초: 30, id: 'radio-b', 이름: '저녁 시티팝', 나갈방: 방 });
  const 길 = 셋.map((x) => x.나갈길);
  assert.equal(new Set(길).size, 3, `판 셋이 같은 파일을 겨눈다: ${길.join(' ')}`);
  assert.ok(길.some((p) => p.endsWith('radio-b-air.mp3')));
  assert.ok(길.some((p) => p.endsWith('radio-b-app.mp3')));
  assert.ok(길.some((p) => p.endsWith('radio-b-demo.mp3')));
});

test('나갈 방 꼬리의 슬래시를 먹는다 — 경로에 // 가 안 생긴다', () => {
  const r = 규.굽기인자({ 원본: 'a.wav', 원본초: 30, 이름: 'x', 판: '앱', 나갈방: '/out/' });
  assert.ok(!r.나갈길.includes('//'), r.나갈길);
});

test('모르는 판은 «던진다» — 조용히 기본값으로 굽지 않는다', () => {
  assert.throws(() => 규.굽기인자({ 원본: 'a.wav', 원본초: 30, 이름: 'x', 판: '유튜브', 나갈방: '/o' }), /모르는 판/);
});

test('인자는 배열이다 — 문자열로 조립하면 공백 있는 경로에서 터진다', () => {
  const { 인자 } = 규.굽기인자({ 원본: 'C:/a b/원본.wav', 원본초: 30, 이름: 'x', 판: '방송', 나갈방: '/o' });
  assert.ok(Array.isArray(인자));
  assert.ok(인자.includes('C:/a b/원본.wav'), '원본 경로가 쪼개지지 않고 한 인자로 들어간다');
});

/* ── 2패스 loudnorm (08-26 실물이 요구한 것) ───────────────────────────────
 * 🔴 1패스는 목표를 «추정»으로 맞춘다 — 같은 규격의 두 곡이 −14.9/−15.1 로 갈렸고
 *   뒤쪽은 채택 문턱(±1)에서 떨어졌다. 곡마다 볼륨이 다르면 학생이 볼륨을 계속 만진다.
 */
test('🔴 측정 인자는 «재기만» 한다 — 파일을 안 쓴다', () => {
  const a = 규.측정인자({ 원본: 'a.wav', 판: '방송' });
  assert.ok(a.includes('print_format=json') || a.some((x) => String(x).includes('print_format=json')));
  assert.ok(a.includes('null'), '-f null 로 버려야 1패스가 파일을 안 남긴다');
  assert.ok(!a.includes('libmp3lame'));
});

test('측정을 주면 2패스로 굽는다 — measured_* 가 실려야 정확해진다', () => {
  const 측정 = { I: -23.4, TP: -3.1, LRA: 7.2, thresh: -34.1 };
  const { 인자 } = 규.굽기인자({ 원본: 'a.wav', 원본초: 30, id: 'x', 이름: 'x', 판: '방송', 나갈방: '/o', 측정 });
  const af = 인자[인자.indexOf('-af') + 1];
  for (const k of ['measured_I=-23.4', 'measured_TP=-3.1', 'measured_LRA=7.2', 'measured_thresh=-34.1', 'linear=true']) {
    assert.ok(af.includes(k), `${k} 가 없다: ${af}`);
  }
});

test('측정이 없으면 1패스로 «조용히» 돌아간다 — 다만 그 결과는 채택 문턱이 잡는다', () => {
  const { 인자 } = 규.굽기인자({ 원본: 'a.wav', 원본초: 30, id: 'x', 이름: 'x', 판: '방송', 나갈방: '/o' });
  const af = 인자[인자.indexOf('-af') + 1];
  assert.ok(!af.includes('measured_I'));
  assert.ok(af.includes('loudnorm=I=-14'));
});

test('측정읽기 — 꼬리에 붙은 JSON 을 뽑는다(ffmpeg 는 로그 뒤에 붙여 낸다)', () => {
  const 출력 = 'some log\n[Parsed_loudnorm_0 @ x]\n{\n"input_i":"-23.4",\n"input_tp":"-3.1",\n"input_lra":"7.2",\n"input_thresh":"-34.1"\n}\n';
  assert.deepEqual(규.측정읽기(출력), { I: -23.4, TP: -3.1, LRA: 7.2, thresh: -34.1 });
});

test('🔴 측정읽기 — 못 읽으면 null 이다(지어낸 값으로 2패스를 돌리지 않는다)', () => {
  assert.equal(규.측정읽기('로그만 있고 JSON 이 없다'), null);
  assert.equal(규.측정읽기('{"input_i":"nan","input_tp":"-3","input_lra":"7","input_thresh":"-34"}'), null);
  assert.equal(규.측정읽기(null), null);
});

test('🔴 도달 진단 — 08-26 calm-2 의 실측을 그대로 넣으면 «못 닿는다»를 이유와 함께 말한다', () => {
  const 실측 = { I: -21.41, TP: -6.00, LRA: 13.30, thresh: -34 };
  const r = 규.도달가능최대(실측, '방송');
  assert.equal(r.닿나, false);
  assert.ok(Math.abs(r.여유dB - 4.5) < 0.01, `여유 ${r.여유dB}`);
  assert.ok(Math.abs(r.최대 - (-16.91)) < 0.02, `최대 ${r.최대}`);
  const 말 = 규.도달진단(실측, '방송');
  assert.match(말, /못 닿는다/);
  assert.match(말, /피크 여유/);
});

test('피크 여유가 넉넉하면 «닿는다»고 말한다 — AI 로 마스터한 곡이 여기 해당한다', () => {
  const r = 규.도달가능최대({ I: -18, TP: -8, LRA: 6, thresh: -30 }, '방송');
  assert.equal(r.닿나, true);
  assert.match(규.도달진단({ I: -18, TP: -8, LRA: 6, thresh: -30 }, '방송'), /닿는다/);
});

test('못 재면 «닿는다»로 접지 않는다', () => {
  assert.equal(규.도달가능최대(null, '방송').닿나, false);
  assert.match(규.도달진단(null, '방송'), /못 쟀다/);
});
