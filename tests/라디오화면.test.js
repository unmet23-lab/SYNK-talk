/* 「밤 라디오」 화면 — 유튜브 링크·안내 한 장 (철학 Ⅱ-1 셋째 줄 · v1.22 · 유호 확정 09-06 「링크·가이드만」)
 *
 * ■ 이 검사가 지키는 셋
 *   ① 링크는 라디오24 설계의 «영구 링크»(`youtube.com/@synkkorean/live`)다 — 고정 videoId URL 을 앱에 박지 않는다.
 *   ② 🔴 이 화면은 «아무것도 모으지 않는다» — 사건통로·부르기를 들여오지 않고, 재생기(expo-audio) 도 없다.
 *      「수집 포기」는 문장이 아니라 부재로 잰다.
 *   ③ App.js 에 들어갔다 — 오류경계 안의 갈래 + 겉테줄의 링크(겉테줄은 이제 말하기 화면이면 늘 선다).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { 코드만, 파일소스, 구간 } = require('./lib/소스검사.js');

const ROOT = path.join(__dirname, '..');
const 화면원문 = 파일소스(path.join(ROOT, 'src', '라디오화면.js'));
const 화면 = 코드만(화면원문);
const 앱원문 = 파일소스(path.join(ROOT, 'App.js'));
const 앱 = 코드만(앱원문);

test('① 링크는 영구 링크 하나다 — 채널 핸들 @synkkorean · /live', () => {
  assert.match(화면, /라디오링크 = 'https:\/\/youtube\.com\/@synkkorean\/live'/, '영구 링크가 정본과 다르다(라디오24 설계 §5)');
  assert.doesNotMatch(화면, /watch\?v=|youtu\.be\//, '고정 videoId URL 이 박혔다 — 방송이 끊기면 죽는 링크다');
  assert.match(화면, /Linking\.openURL\(/, '링크를 여는 손잡이가 없다');
});

test('🔴 ② 아무것도 모으지 않는다 — 사건통로·부르기·재생기 부재', () => {
  for (const 금지 of ['사건통로', '부르기', 'expo-audio', 'estimate', 'learning_events', 'fetch(']) {
    assert.ok(!화면.includes(금지), `라디오 화면에 「${금지}」가 들어왔다 — 수집·재생기는 09-06 에 접었다`);
  }
});

test('③ App.js — 오류경계 안의 「라디오」 갈래 + 겉테줄의 「밤 라디오」 링크', () => {
  assert.match(앱, /import 라디오화면 from '\.\/src\/라디오화면';/);
  const 묶음 = 구간(앱원문, '<오류경계', '</오류경계>');
  assert.ok(묶음.includes("화면 === '라디오'"), '라디오 갈래가 경계 밖이다');
  assert.ok(앱.includes("set화면('라디오')"), '겉테줄에서 라디오로 가는 손잡이가 없다');
  assert.ok(앱원문.indexOf("set화면('라디오')") > 앱원문.indexOf('</오류경계>'), '라디오 링크가 겉테 상주 층(경계 밖)에 있어야 한다');
});
