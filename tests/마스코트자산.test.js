/* 마스코트 자산 회귀 — assets/마스코트/ 6컷 (그림 정본 = SYNK-appsscript docs/캐릭터/마스코트_렌더).
 *
 * ■ 무엇을 지키나 (tests/npc자산.test.js 와 같은 축 · 대상만 래스터)
 *   ① **컷 목록은 `lib/마스코트생명.표정컷`에서 파생** — 손 목록 사본 금지. 표정 어휘에 있는
 *      컷이 파일로 없으면 화면이 임시 그림·빈 칸으로 조용히 대체하는 방향이 열린다.
 *   ② **전부 WebP 실파일** — RIFF/WEBP 매직·최소 크기. 0바이트·PNG 개명·플레이스홀더가
 *      「있음」으로 통과하는 것이 새는 방향이다.
 *   ③ README(정본 선언·재변환 절차)가 폴더에 같이 산다.
 *   ⚠ 색·투명도(누끼) 픽셀 검사는 여기서 안 한다 — node 만으로 WebP 를 못 디코드하고,
 *      외부 바이너리에 기대는 검사는 CI 에서 깨진다(F296). 변환 시 실측은 tools/마스코트변환.py 가
 *      찍고(모서리 α=0 · 코어 색), 눈 검증은 반입 커밋의 시트가 진다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { 표정컷 } = require('../lib/마스코트생명.js');
const 폴더 = path.resolve(__dirname, '..', 'assets', '마스코트');

/** WebP 인가 — RIFF<size>WEBP 머리 12바이트. 검사 로직은 이 한 곳에만 산다. */
function 웹피인가(버퍼) {
  return 버퍼.length >= 12
    && 버퍼.toString('latin1', 0, 4) === 'RIFF'
    && 버퍼.toString('latin1', 8, 12) === 'WEBP';
}

test('마스코트 자산 — 표정 어휘의 컷이 전부 실WebP 로 있다 (목록은 정본에서 파생)', () => {
  const 컷들 = [...new Set(Object.values(표정컷))];
  assert.ok(컷들.length >= 6, `컷 어휘를 못 읽었다(분모 ${컷들.length}) — 통과가 아니라 미실행이다`);
  for (const 컷 of 컷들) {
    const 파일 = path.join(폴더, `${컷}.webp`);
    assert.ok(fs.existsSync(파일), `${컷}.webp 가 없다 — 표정 어휘에 있는 컷은 파일이 실물이어야 한다`);
    const 버퍼 = fs.readFileSync(파일);
    assert.ok(웹피인가(버퍼), `${컷}.webp 가 WebP 가 아니다 — 개명·플레이스홀더가 반입됐다`);
    assert.ok(버퍼.length > 8 * 1024, `${컷}.webp 가 ${버퍼.length}바이트뿐이다 — 실컷(수십 KB)이 아니다`);
  }
});

test('마스코트 자산 — README(정본 선언)가 폴더에 같이 산다', () => {
  assert.ok(fs.existsSync(path.join(폴더, 'README.md')), 'README.md 가 없다 — 원본 출처·재변환 절차가 자산과 떨어진다');
});

test('탐지력 — 가짜(PNG 머리·빈 파일)가 실제로 걸린다', () => {
  assert.equal(웹피인가(Buffer.from('\x89PNG\r\n\x1a\n' + 'x'.repeat(20), 'latin1')), false, 'PNG 개명을 못 잡는다');
  assert.equal(웹피인가(Buffer.alloc(0)), false, '빈 파일을 못 잡는다');
  const 진짜머리 = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);
  assert.equal(웹피인가(진짜머리), true, '멀쩡한 WebP 머리에 거짓양성 — 검사가 뒤집혔다');
});
