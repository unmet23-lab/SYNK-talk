'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { 업로드기록저장기 } = require('../lib/업로드기록저장.js');

function 대기() {
  let 열기;
  const promise = new Promise((resolve) => { 열기 = resolve; });
  return { promise, 열기 };
}

test('서로 다른 음성 업로드가 동시에 끝나도 두 참조가 디스크와 화면에 모두 남는다', async () => {
  let 현재 = [{ id: 'A', audio: 'local-A.wav' }, { id: 'B', audio: 'local-B.wav' }];
  let 디스크;
  const 첫쓰기 = 대기();
  const 시작 = 대기();
  let 쓰기수 = 0;
  const 저장 = 업로드기록저장기({
    읽기: () => 현재,
    쓰기: async (다음) => {
      쓰기수++;
      if (쓰기수 === 1) { 시작.열기(); await 첫쓰기.promise; }
      디스크 = JSON.parse(JSON.stringify(다음));
    },
    반영: (다음) => { 현재 = 다음; },
  });
  const a = 저장('A', 'voice/fixture/A.wav');
  const b = 저장('B', 'voice/fixture/B.wav');
  await 시작.promise;
  assert.equal(쓰기수, 1, 'B는 A의 지속 저장과 반영을 기다린다');
  첫쓰기.열기();
  await Promise.all([a, b]);
  assert.equal(쓰기수, 2);
  assert.deepEqual(디스크, 현재);
  assert.deepEqual(디스크.map((e) => e.audio_ref), ['voice/fixture/A.wav', 'voice/fixture/B.wav']);
  assert.deepEqual(디스크.map((e) => e.audio), ['local-A.wav', 'local-B.wav']);
});

test('쓰기 대기 중 새 제출과 기존 전송 결과가 들어오면 최신 로그에 합쳐 다시 쓴다', async () => {
  let 현재 = [{ id: 'A', audio: 'local-A.wav' }];
  let 디스크;
  const 첫쓰기 = 대기();
  const 시작 = 대기();
  let 쓰기수 = 0;
  let 완료 = false;
  const 저장 = 업로드기록저장기({
    읽기: () => 현재,
    쓰기: async (다음) => {
      쓰기수++;
      if (쓰기수 === 1) { 시작.열기(); await 첫쓰기.promise; }
      디스크 = JSON.parse(JSON.stringify(다음));
    },
    반영: (다음) => { 현재 = 다음; },
  });
  const 작업 = 저장('A', 'voice/fixture/A.wav').then(() => { 완료 = true; });
  await 시작.promise;
  현재 = [{ ...현재[0], choice_event_id: 'fixture-choice' }, { id: 'B', audio: 'local-B.wav' }];
  assert.equal(완료, false);
  첫쓰기.열기();
  await 작업;
  assert.equal(쓰기수, 2);
  assert.deepEqual(디스크, 현재);
  assert.equal(디스크[0].audio_ref, 'voice/fixture/A.wav');
  assert.equal(디스크[0].choice_event_id, 'fixture-choice');
  assert.equal(디스크[1].audio, 'local-B.wav');
});

test('쓰기 실패는 해당 호출에 전달하고 화면을 바꾸지 않으며 다음 업로드는 계속한다', async () => {
  const 원본 = [{ id: 'A' }, { id: 'B' }];
  let 현재 = 원본;
  let 디스크;
  let 쓰기수 = 0;
  const 실패 = new Error('합성: 디스크 쓰기 실패');
  const 저장 = 업로드기록저장기({
    읽기: () => 현재,
    쓰기: async (다음) => {
      if (++쓰기수 === 1) throw 실패;
      디스크 = JSON.parse(JSON.stringify(다음));
    },
    반영: (다음) => { 현재 = 다음; },
  });
  await assert.rejects(저장('A', 'voice/fixture/A.wav'), (e) => e === 실패);
  assert.equal(현재, 원본);
  assert.equal(디스크, undefined);
  await 저장('B', 'voice/fixture/B.wav');
  assert.equal(현재[0].audio_ref, undefined);
  assert.equal(현재[1].audio_ref, 'voice/fixture/B.wav');
  assert.deepEqual(디스크, 현재);
});

test('다시 합친 로그의 쓰기도 실패하면 성공으로 반영하지 않는다', async () => {
  let 현재 = [{ id: 'A' }];
  const 첫쓰기 = 대기();
  const 시작 = 대기();
  let 쓰기수 = 0;
  let 반영수 = 0;
  const 저장 = 업로드기록저장기({
    읽기: () => 현재,
    쓰기: async () => {
      if (++쓰기수 === 1) { 시작.열기(); await 첫쓰기.promise; }
      else throw new Error('합성: 재저장 실패');
    },
    반영: () => { 반영수++; },
  });
  const 작업 = 저장('A', 'voice/fixture/A.wav');
  await 시작.promise;
  현재 = [...현재, { id: 'B' }];
  첫쓰기.열기();
  await assert.rejects(작업, /재저장 실패/);
  assert.equal(반영수, 0);
  assert.equal(현재.length, 2);
  assert.equal(현재[0].audio_ref, undefined);
});
