'use strict';
/* 감사 회귀 W2C1 — App.js·테마 군단 시공 앵커.
 *   G2-3 오류경계가 라우팅 묶음을 감싼다 · D5-2 화면틀(등장 한 박자) · G2-1 안드로이드 백버튼.
 * ⚠ 경계 자체의 동작(fallback 렌더·관측보고·되세우기)은 tests/오류경계.test.js 가 진다 —
 *   층이 그쪽 정본이라 여기 겹쳐 적지 않는다. 여기는 **App.js 배선**만 소스로 잰다
 *   (라우팅 묶음은 첫 렌더 통로가 App 을 못 그려 — expo useFonts·키체인 — 소스층이 정본이다). */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { 코드만, 파일소스, 구간, 코드만픽스처 } = require('./lib/소스검사.js');

const ROOT = path.join(__dirname, '..');
const 원문 = 파일소스(path.join(ROOT, 'App.js'));
const 앱 = 코드만(원문);

test('주석 제거기가 산다 — 아래 소스 검사들이 설명을 코드로 읽지 않는다', () => {
  assert.equal(코드만(코드만픽스처.입력), 코드만픽스처.기대, '주석 제거기가 죽었다 — 이 파일 전체가 거짓 초록이 된다');
});

/* ── G2-3 — 오류경계가 라우팅 묶음을 감싼다(화면 하나의 렌더 예외 ≠ 앱 전체 크래시) ── */

test('G2-3 오류경계가 라우팅 묶음을 감싼다 — key={화면} 로 전환 때 경계 상태가 자연 리셋된다', () => {
  assert.match(앱, /import 오류경계 from '\.\/src\/오류경계';/, '오류경계를 안 들여온다');
  assert.ok(앱.includes(`<오류경계 화면이름={화면} key={화면} 되세우기={() => set화면('말하기')}>`),
    '경계의 세 손잡이(화면이름·key·되세우기)가 지시서 모양이 아니다');
  const 묶음 = 구간(원문, '<오류경계', '</오류경계>');
  for (const 이름 of ['말하기', '답장', '시스템', '비번변경', '초기화', '검수', '강사',
    '문구감수', '반피드백', '나침반', '회고', '관찰', '어제', '검수문']) {
    assert.ok(묶음.includes(`화면 === '${이름}'`), `'${이름}' 갈래가 경계 밖으로 나갔다 — 그 화면의 렌더 예외가 앱을 통째로 죽인다`);
  }
});

test('G2-3 겉테 상주 층과 인증·로딩 분기는 경계 밖이다 — 테는 서 있고 내용만 울타리 안이다', () => {
  assert.ok(원문.indexOf('style={s.시스템링크}') > 원문.indexOf('</오류경계>'),
    'SYSTEM 링크(겉테 상주 층)가 경계 안에 들어왔다 — fallback 이 서면 테까지 사라진다');
  assert.ok(원문.indexOf('style={s.겉테줄}') > 원문.indexOf('</오류경계>'),
    '겉테줄(답장·어제 링크)이 경계 안에 들어왔다');
  assert.ok(원문.indexOf('if (!fontsLoaded || 복원중)') < 원문.indexOf('<오류경계'),
    '로딩 분기가 경계 뒤로 밀렸다 — 라우팅 앞 return 은 밖에 남긴다');
  assert.ok(원문.indexOf('if (!세션)') < 원문.indexOf('<오류경계'),
    '인증 분기가 경계 뒤로 밀렸다 — 라우팅 앞 return 은 밖에 남긴다');
});

/* ── D5-2 — 화면 전환의 등장 한 박자(즉시 교체 렌더 → 화면틀 remount) ── */

test('D5-2 화면틀 — use등장(240ms·8dp) 을 얹은 Animated.View 하나, 새 눈금·새 의존성 0', () => {
  assert.match(앱, /import \{ use등장 \} from '\.\/lib\/모션\.js';/, 'use등장을 lib/모션에서 안 빌린다 — 등장 박자를 새로 지으면 눈금이 갈라진다');
  assert.match(앱, /function 화면틀\(\{ children \}\)/, '화면틀 컴포넌트가 없다');
  assert.match(앱, /const 등장 = use등장\(\{ 시간: 240, 올라옴: 8 \}\);/, '등장 눈금이 지시서(240·8)와 다르다');
  assert.match(앱, /<Animated\.View style=\{\[\{ flex: 1 \}, 등장\]\}>\{children\}<\/Animated\.View>/,
    '화면틀이 등장 스타일을 안 얹는다 — 틀만 있고 박자가 없다');
});

test('D5-2 라우팅 묶음이 화면틀(key={화면}) 안이다 — 화면이 바뀔 때마다 remount 되어 한 박자가 돈다', () => {
  const 틀안 = 구간(원문, '<화면틀 key={화면}>', '</화면틀>');
  for (const 이름 of ['말하기', '답장', '시스템', '어제', '검수문']) {
    assert.ok(틀안.includes(`화면 === '${이름}'`), `'${이름}' 갈래가 화면틀 밖이다 — 그 화면만 등장 박자 없이 팝 한다`);
  }
  assert.ok(원문.indexOf('style={s.시스템링크}') > 원문.indexOf('</화면틀>'),
    'SYSTEM 링크가 화면틀 안에 들어왔다 — 상주 테가 화면마다 다시 떠오른다');
});

/* ── G2-1 — 안드로이드 백버튼(BackHandler 0건 → 지도 배선) ── */

test('G2-1 백버튼 — hardwareBackPress 등록·해제와 지도(직원→시스템 · 나머지→말하기)가 소스에 있다', () => {
  assert.match(앱, /import \{ Animated, BackHandler, Pressable, StyleSheet, Text, View \} from 'react-native';/,
    'BackHandler 를 react-native 에서 안 들여온다');
  assert.match(앱, /BackHandler\.addEventListener\('hardwareBackPress'/, '백버튼 구독이 없다 — 백버튼이 태스크를 그대로 백그라운드로 보낸다');
  assert.match(앱, /if \(화면 === '말하기'\) return false;/,
    "'말하기'에서 기본 동작(태스크 백그라운드)을 안 돌려준다 — 감사 원안 그대로여야 한다");
  assert.match(앱, /const 시스템행 = \['검수', '강사', '문구감수', '반피드백', '나침반', '회고', '관찰'\];/,
    '직원 7화면 지도가 각 화면의 돌아가기 prop(→시스템)과 갈라졌다');
  assert.match(앱, /set화면\(시스템행\.includes\(화면\) \? '시스템' : '말하기'\);/, '지도 분기가 없다');
  assert.match(앱, /return \(\) => 구독\.remove\(\);/, '구독 해제가 없다 — 화면 state 마다 리스너가 쌓인다');
  assert.match(앱, /\}, \[화면\]\);/, '의존성 [화면] 이 없다 — 닫힌 화면 값으로 지도를 탄다');
});
