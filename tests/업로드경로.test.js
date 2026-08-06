/* lib/업로드경로.js — L0 §9-3-1 경로 규칙(🔴 소급 불가).
 *
 * 이 회귀가 지는 것: **첫 업로드가 규칙 밖으로 나가는 것을 막는 것.** 나간 파일은 규칙을 고쳐도
 * 안 옮겨지고, 그날 동의문의 「모두 삭제」가 거짓이 된다. 문서 대조는 `철회경로.test.js` 몫이고
 * 여기는 **구현체**가 그 규칙을 실제로 지는지를 본다(둘이 갈라지면 구현이 이긴다).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { 버킷, 경로만들기, 경로검사, 확장자 } = require('../lib/업로드경로.js');

const L = '9f2c1b7e-0000-4000-8000-000000000001';   // learner_id
const U = '3c9e2d40-0000-4000-8000-0000000000aa';   // 파일 uuid
const 다른학생 = 'ffffffff-0000-4000-8000-00000000ffff';

test('버킷은 하나다 — voice·image 는 그 안의 폴더지 버킷이 아니다', () => {
  assert.equal(typeof 버킷, 'string');
  assert.ok(버킷.length > 0);
});

test('음성 경로가 규칙대로 만들어진다', () => {
  const { ref, 이유 } = 경로만들기({ kind: 'audio', content_type: 'audio/wav', learner_id: L, uuid: U });
  assert.equal(이유, null);
  assert.equal(ref, `voice/${L}/${U}.wav`);
});

test('이미지도 같은 규칙을 쓴다', () => {
  const { ref } = 경로만들기({ kind: 'image', content_type: 'image/jpeg', learner_id: L, uuid: U });
  assert.equal(ref, `image/${L}/${U}.jpg`);
});

test('🔴 둘째 칸은 언제나 learner_id — 날짜 분할이 되살아나면 잡는다', () => {
  const { ref } = 경로만들기({ kind: 'audio', content_type: 'audio/wav', learner_id: L, uuid: U });
  const 칸 = ref.split('/');
  assert.equal(칸.length, 3, '세 칸이 아니다 — 폴더가 늘면 손 삭제가 1회를 넘는다');
  assert.equal(칸[1], L);
  assert.ok(!/^\d{4}$/.test(칸[1]), '둘째 칸이 연도다 — 날짜 분할이 되살아났다');
});

test('탐지력 픽스처 — 날짜 분할 경로는 검사에서 반드시 걸린다', () => {
  const r = 경로검사(`voice/2026/08/${U}.wav`, L);
  assert.equal(r.ok, false, '날짜 분할이 통과했다 — 이 회귀는 아무것도 안 지키고 있다');
});

test('🔴 남의 learner_id 밑을 가리키는 참조는 거부한다', () => {
  const r = 경로검사(`voice/${다른학생}/${U}.wav`, L);
  assert.equal(r.ok, false, '남의 폴더를 가리키는 참조가 통과했다 — 철회 시 남의 파일이 지워진다');
});

test('student_code 프리픽스는 거부한다 — 재발급되면 옛 코드 밑 파일이 미아가 된다', () => {
  assert.equal(경로검사(`voice/SYNK-042/${U}.wav`, L).ok, false);
});

test('규격 밖 코덱도 경로는 나온다 — 거부하면 학생 발화가 영영 사라진다', () => {
  const { ref, 이유 } = 경로만들기({ kind: 'audio', content_type: 'audio/m4a', learner_id: L, uuid: U });
  assert.equal(이유, null, 'm4a 를 막았다 — C0 §4-2 「거부하지 않는다」 위반');
  assert.ok(ref.endsWith('.m4a'), `확장자가 실제와 다르다: ${ref} — 나중에 헤더 읽는 쪽이 전부 오판한다`);
});

test('kind 와 content_type 이 어긋나면 거부한다', () => {
  assert.equal(확장자('audio', 'image/png'), null);
  assert.equal(경로만들기({ kind: 'audio', content_type: 'image/png', learner_id: L, uuid: U }).ref, null);
});

test('learner_id 가 uuid 가 아니면 경로를 안 만든다', () => {
  assert.equal(경로만들기({ kind: 'audio', content_type: 'audio/wav', learner_id: 'SYNK-042', uuid: U }).ref, null);
});

test('만든 경로는 자기 검사를 통과한다 — 발급과 수납이 갈라지지 않는다', () => {
  for (const [kind, ct] of [['audio', 'audio/wav'], ['audio', 'audio/m4a'], ['image', 'image/png']]) {
    const { ref } = 경로만들기({ kind, content_type: ct, learner_id: L, uuid: U });
    const r = 경로검사(ref, L);
    assert.equal(r.ok, true, `${ref} 를 만들어 놓고 스스로 거부한다: ${r.이유}`);
  }
});

test('자기 처방 — 거부 사유가 지목한 대로 고치면 통과한다', () => {
  const 나쁜 = `voice/2026/08/${U}.wav`;
  assert.equal(경로검사(나쁜, L).ok, false);
  const { ref } = 경로만들기({ kind: 'audio', content_type: 'audio/wav', learner_id: L, uuid: U });
  assert.equal(경로검사(ref, L).ok, true, '처방대로 만든 경로를 아직 거부한다');
});
