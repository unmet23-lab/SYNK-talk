// 자식 프로세스 판정의 공용 통로 — **미실행을 판정으로 번역하지 않는다.**
//
// 형제(SYNK-appsscript) `tests/lib/훅띄우기.js` 의 이식(c2d8043 계열). 이름이 넓어진 이유:
//   이 저장소는 훅(precommit)만이 아니라 도구(원격SQL 등)도 띄워서 판정한다.
//
// 왜 여기도 필요한가 — 실측(2026-08-07): `계약가드.test.js` 의 판정이 `r.status !== 0` 이라
//   스폰 실패(r.error · status=null)가 「막혔다」로 번역된다. 형제의 실사고와 **반대 방향**이다
//   (그쪽은 미실행→「통과」, 여기는 미실행→「차단」). 오늘은 각 검사의 2차 단언(문구 match)이
//   우연히 시끄럽게 만들지만, 이 판정 함수를 쓰는 다음 검사가 코드만 보면 그날 조용해진다.
//   r.error 를 보는 자리는 이 저장소 테스트에 0곳이었다.
//
// 쓰는 법 — spawnSync 자리를 그대로 바꾼다:
//   const r = spawnSync(process.execPath, [도구, 인자], { encoding: 'utf8' });
//   →  const r = 띄우기([도구, 인자], { encoding: 'utf8' });
//   일부러 0 아닌 코드로 끝나는 자리(거부 코드 등):  띄우기(도구, { …, 통과코드: [0, 1] })
//   옛 통로는 `tests/스폰통로.test.js` 가 저장소를 훑어 금지한다.
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

/**
 * node 스크립트를 띄우고 **떴다는 것까지 확인해서** spawnSync 결과를 그대로 돌려준다.
 * 판정(무엇이 차단이고 무엇이 통과인가)은 호출부 몫 — 여기서 바꾸는 건 「안 뜬 경우」뿐이다.
 *
 * @param {string|string[]} 스크립트  스크립트 경로(또는 [경로, ...인자])
 * @param {object} [옵션]             spawnSync 옵션 + `통과코드`(기본 [0])
 * @returns {import('node:child_process').SpawnSyncReturns<string>}
 * @throws 프로세스를 못 띄웠거나 통과코드 밖으로 끝났을 때 — 그 둘은 결과가 아니다
 */
function 띄우기(스크립트, 옵션 = {}) {
  const 인자 = Array.isArray(스크립트) ? 스크립트 : [스크립트];
  const { 통과코드 = [0], ...spawn옵션 } = 옵션;
  const r = spawnSync(process.execPath, 인자, { encoding: 'utf8', ...spawn옵션 });

  if (r.error || !통과코드.includes(r.status)) {
    // 두 실패를 **가려서** 말한다 — 「안 떴다」와 「비정상 종료」는 원인도 처방도 다르다.
    const 무슨일 = r.error ? '못 띄웠다' : `${r.status} 로 끝났다(기대=${통과코드.join('|')})`;
    throw new Error(
      `${무슨일} — 미실행도 비정상 종료도 결과가 아니다 (${path.basename(String(인자[0]))}): `
      + `error=${r.error ? (r.error.code || r.error.message) : '없음'} `
      + `status=${r.status} signal=${r.signal}\n`
      + `stderr=${String(r.stderr || '').slice(0, 400)}`,
    );
  }
  return r;
}

module.exports = { 띄우기 };
