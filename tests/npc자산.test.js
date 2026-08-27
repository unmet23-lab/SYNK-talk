/* NPC 자산 회귀 — assets/npc/ 펠트 배지 16장 (유호 확정 08-24 「이걸로 확정」).
 *
 * ■ 무엇을 지키나
 *   ① **16종이 전부 있다** — 목록은 `lib/NPC연출`(역 × 상태)에서 파생한다(손 목록 사본 금지).
 *      한 컷이 사라지면 화면이 임시 그림·빈 칸으로 조용히 대체하는 방향이 열린다.
 *   ② **전부 WebP 실파일** — RIFF/WEBP 매직·최소 크기. 0바이트·PNG 개명·플레이스홀더가
 *      「있음」으로 통과하는 것이 새는 방향이다.
 *   ③ **평면 SVG 가 돌아오지 않는다** — 옛 16종은 08-24 소각됐다(펠트가 아니라 2D 라
 *      Loom 세계관 밖이었다 · 유호 지적). 폴더에 `.svg` 가 한 장이라도 서면 그날로 되돌아간다.
 *   ④ README(정본 선언·재변환 절차)가 폴더에 같이 산다.
 *   ⚠ 색·투명도 픽셀 검사는 여기서 안 한다 — node 만으로 WebP 를 못 디코드하고, 외부 바이너리에
 *      기대는 검사는 CI 에서 깨진다(F296). 변환 시 실측은 `tools/NPC변환.py` 가 찍고
 *      (모서리 α=0 · 몸이 화면의 20% 이상), 눈 검증은 반입 커밋의 시트가 진다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { 역들, 상태들, 컷이름 } = require('../lib/NPC연출.js');
const 폴더 = path.resolve(__dirname, '..', 'assets', 'npc');

/** WebP 인가 — RIFF<size>WEBP 머리 12바이트. 검사 로직은 이 한 곳에만 산다. */
function 웹피인가(버퍼) {
  return 버퍼.length >= 12
    && 버퍼.toString('latin1', 0, 4) === 'RIFF'
    && 버퍼.toString('latin1', 8, 12) === 'WEBP';
}

test('NPC 자산 — 역 x 상태 16종이 전부 실WebP 로 있다 (목록은 정본에서 파생)', () => {
  assert.equal(역들.length * 상태들.length, 16, '어휘가 4x4 가 아니다 — 분모부터 바뀌었다');
  for (const 역 of 역들) {
    for (const 상태 of 상태들) {
      const 파일 = path.join(폴더, `${컷이름(역, 상태)}.webp`);
      assert.ok(fs.existsSync(파일), `${역}-${상태}.webp 가 없다 — 화면이 빈 칸으로 대체하는 방향이 열린다`);
      const 버퍼 = fs.readFileSync(파일);
      assert.ok(웹피인가(버퍼), `${역}-${상태}.webp 가 WebP 가 아니다 — 개명·플레이스홀더가 반입됐다`);
      assert.ok(버퍼.length > 6 * 1024, `${역}-${상태}.webp 가 ${버퍼.length}바이트뿐이다 — 실컷이 아니다`);
    }
  }
});

test('NPC 자산 — 평면 SVG 가 돌아오지 않는다 (08-24 소각 · 펠트만 산다)', () => {
  const svg = fs.readdirSync(폴더).filter((f) => f.toLowerCase().endsWith('.svg'));
  assert.deepEqual(svg, [], `NPC 폴더에 평면 SVG 가 돌아왔다: ${svg.join(', ')} — 그림 정본은 펠트 배지다`);
});

test('NPC 자산 — README(그림 정본 선언)가 폴더에 같이 산다', () => {
  assert.ok(fs.existsSync(path.join(폴더, 'README.md')), 'README.md 가 없다 — 정본 선언·재변환 절차가 자산과 떨어진다');
});

test('탐지력 — 가짜(PNG 머리·빈 파일)가 실제로 걸린다', () => {
  assert.equal(웹피인가(Buffer.from('\x89PNG\r\n\x1a\n' + 'x'.repeat(20), 'latin1')), false, 'PNG 개명을 못 잡는다');
  assert.equal(웹피인가(Buffer.alloc(0)), false, '빈 파일을 못 잡는다');
  const 진짜머리 = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);
  assert.equal(웹피인가(진짜머리), true, '멀쩡한 WebP 머리에 거짓양성 — 검사가 뒤집혔다');
});
