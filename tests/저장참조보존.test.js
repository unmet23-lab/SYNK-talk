'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const { 세우기 } = require('./lib/앱모듈세우기.js');
const { 업로드참조보존 } = require('../lib/제출로그.js');

// 실제 저장 어댑터를 실행하고 네이티브 모듈만 파일 내용을 가진 합성 모듈로 바꾼다.
function 저장판(OS) {
  const 파일들 = new Map();
  let 읽기실패 = false;
  class File {
    constructor(_, 이름) { this.이름 = 이름; }
    get exists() { return 파일들.has(this.이름); }
    textSync() { if (읽기실패) throw new Error('합성: 읽기 실패'); return 파일들.get(this.이름); }
    async text() { return this.textSync(); }
    write(text) { 파일들.set(this.이름, text); }
  }
  const 원래 = Module._load;
  Module._load = function (이름, ...args) {
    if (이름 === 'react-native') return { Platform: { OS } };
    if (이름 === 'expo-secure-store') return {};
    if (이름 === 'expo-file-system') return { File, Paths: { document: 'fixture' } };
    return 원래.call(this, 이름, ...args);
  };
  let 저장;
  try {
    저장 = 세우기(path.resolve(__dirname, '../src/저장.js'), async () => { throw new Error('HTTP 호출 금지'); });
  } finally { Module._load = 원래; }
  return { 저장, 파일들, 읽기실패시키기: () => { 읽기실패 = true; } };
}

for (const OS of ['android', 'web']) {
  test(`${OS}: 서버 응답 대기 중 다른 화면이 오래된 로그를 써도 업로드 참조가 남는다`, async () => {
    const { 저장 } = 저장판(OS);
    const 오래된 = [{ id: 'A', audio: 'local-A.wav', event_id: null }];
    await 저장.로그쓰기(오래된);
    await 저장.로그쓰기([{ ...오래된[0], audio_ref: 'voice/fixture/A.wav' }]);
    // events 응답이 아직 없어 새 화면의 로그에는 반환된 audio_ref가 없는 상태다.
    await 저장.로그쓰기([{ ...오래된[0], choice_event_id: 'fixture-choice' }, { id: 'B', audio: 'local-B.wav' }]);
    const { 로그 } = await 저장.로그읽기();
    assert.equal(로그[0].audio_ref, 'voice/fixture/A.wav');
    assert.equal(로그[0].choice_event_id, 'fixture-choice');
    assert.equal(로그[1].audio, 'local-B.wav');
    assert.equal(오래된[0].audio_ref, undefined);
  });

  test(`${OS}: 다른 참조는 덮어쓰지 않으며 빈 로그 쓰기는 귀속을 비운다`, async () => {
    const { 저장 } = 저장판(OS);
    await 저장.로그쓰기([{ id: 'A', audio_ref: 'voice/fixture/A.wav' }]);
    await assert.rejects(저장.로그쓰기([{ id: 'A', audio_ref: 'voice/fixture/B.wav' }]));
    assert.equal((await 저장.로그읽기()).로그[0].audio_ref, 'voice/fixture/A.wav');
    await 저장.로그쓰기([]);
    assert.deepEqual((await 저장.로그읽기()).로그, []);
  });
}

test('원본 저장본을 읽지 못하면 덮어쓰지 않는다', async () => {
  const p = 저장판('android');
  await p.저장.로그쓰기([{ id: 'A', audio_ref: 'voice/fixture/A.wav' }]);
  const 이전 = p.파일들.get('talk_log.jsonl');
  p.읽기실패시키기();
  await assert.rejects(p.저장.로그쓰기([{ id: 'A' }]), /읽기 실패/);
  assert.equal(p.파일들.get('talk_log.jsonl'), 이전);
});

test('참조만 보존하며 빠진 행이나 옛 전송 상태를 복원하지 않는다', () => {
  const 기존 = [{ id: 'A', audio_ref: 'voice/fixture/A.wav', send_error: '옛 오류' }, { id: 'B', audio_ref: 'voice/fixture/B.wav' }];
  const 새것 = [{ id: 'A', send_error: null }];
  assert.deepEqual(업로드참조보존(새것, 기존), [{ id: 'A', send_error: null, audio_ref: 'voice/fixture/A.wav' }]);
  assert.equal(새것[0].audio_ref, undefined);
  assert.deepEqual(업로드참조보존([], 기존), []);
});
