/* NPC 자산 회귀 — assets/npc/ 16종 (게임층 설계 §4 · 유호 확정 08-11 「v2 이대로 확정」).
 *
 * ■ 무엇을 지키나
 *   ① **16종이 전부 있다** — 목록은 역×상태 곱으로 파생한다(손 목록 사본 금지).
 *      한 파일이 사라지면 화면 커밋이 옛 자산·임시 그림으로 조용히 대체하는 방향이 열린다.
 *   ② **색이 킷 9색뿐이다** — 특히 코랄(녹음 신호)·라임(학생 성장색)은 어느 파일에도 0.
 *      새는 방향이 「반입」이라, 화이트리스트로 잠근다(새 색 = 여기부터 빨갛다).
 *   ③ **<text> 0 · class 0 · 스크립트 0** — 상태에 숫자·글자 병기 금지(§4 규격 3)의 기계판이고,
 *      정적 자산이 문서 CSS·JS 에 기대면 앱 렌더러에서 조용히 다른 그림이 된다.
 *   ④ 탐지력은 픽스처가 진다 — 코랄 fill·<text> 를 심은 가짜 svg 가 실제로 걸리는지 본다
 *      (버그가 아직 있을 것을 요구하는 회귀 금지 · CLAUDE.md).
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const 폴더 = path.resolve(__dirname, '..', 'assets', 'npc');
const 역들 = ['prof', 'lead', 'boss', 'insp'];
const 상태들 = ['calm', 'lean', 'back', 'win'];

// 킷 9색(디자인_토큰 v10 부분집합 — NPC 규격이 허용하는 전부) + 표기 변형 없음(대문자 HEX 고정)
const 허용색 = new Set([
  '#0F1730', '#131A32', '#1A2340', '#2A3358', // Navy 계열
  '#8A93AD',                                   // Slate
  '#FBF7EE', '#F6F1E8', '#EFE7D7', '#E7DDC7', // Paper·Cream 계열
]);

/** svg 문자열의 위반 목록을 낸다 — 검사 로직은 이 한 곳에만 산다. */
function 위반(svg) {
  const 목록 = [];
  const 색들 = svg.match(/#[0-9A-Fa-f]{3,8}\b/g) || [];
  for (const 색 of 색들) {
    if (!허용색.has(색.toUpperCase())) 목록.push(`킷 밖 색 ${색}`);
  }
  if (/<text[\s>]/i.test(svg)) 목록.push('<text> 요소(숫자·글자 병기 금지)');
  if (/\bclass\s*=/.test(svg)) 목록.push('class 속성(문서 CSS 의존)');
  if (/<script[\s>]/i.test(svg)) 목록.push('<script>');
  if (!/viewBox="0 0 120 140"/.test(svg)) 목록.push('viewBox 가 0 0 120 140 이 아니다');
  if (!/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svg)) 목록.push('xmlns 없음(단독 파일로 못 선다)');
  return 목록;
}

test('NPC 자산 — 역×상태 16종이 전부 있고, 각각 규격 위반 0', () => {
  for (const 역 of 역들) {
    for (const 상태 of 상태들) {
      const 파일 = path.join(폴더, `${역}-${상태}.svg`);
      assert.ok(fs.existsSync(파일), `${역}-${상태}.svg 가 없다 — 화면이 임시 그림으로 대체하는 방향이 열린다`);
      const svg = fs.readFileSync(파일, 'utf8');
      assert.deepEqual(위반(svg), [], `${역}-${상태}.svg 규격 위반`);
    }
  }
});

test('NPC 자산 — README(그림 정본 선언)가 폴더에 같이 산다', () => {
  assert.ok(fs.existsSync(path.join(폴더, 'README.md')), 'README.md 가 없다 — 정본 선언·사용 규칙이 자산과 떨어진다');
});

test('탐지력 — 코랄 반입·<text>·class 를 심은 픽스처가 실제로 걸린다', () => {
  const 머리 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 140">';
  assert.ok(위반(`${머리}<rect fill="#FF6B5C"/></svg>`).some((v) => v.includes('#FF6B5C')), '코랄을 못 잡는다');
  assert.ok(위반(`${머리}<rect fill="#C8FF3D"/></svg>`).some((v) => v.includes('#C8FF3D')), '라임을 못 잡는다');
  assert.ok(위반(`${머리}<text x="1" y="1">3</text></svg>`).some((v) => v.includes('<text>')), '<text> 를 못 잡는다');
  assert.ok(위반(`${머리}<g class="eyes"/></svg>`).some((v) => v.includes('class')), 'class 를 못 잡는다');
  assert.equal(위반(`${머리}<rect fill="#FBF7EE"/></svg>`).length, 0, '멀쩡한 svg 에 거짓양성');
});
