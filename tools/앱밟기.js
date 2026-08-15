#!/usr/bin/env node
'use strict';
/**
 * 자동 밟기 실행 통로 — `.maestro/` 흐름을 기기·에뮬레이터에서 돌린다.
 *
 * ■ 왜 도구를 끼우나 (그냥 `maestro test .maestro` 하면 되는데)
 *   ① **미실행이 초록으로 안 보이게** 한다. CLI 가 없거나 기기가 없으면 사람은 그것을
 *      「돌렸는데 문제 없음」으로 읽는다 — 이 저장소가 반복해서 데인 자리다(분모 규칙).
 *      여기서는 못 돈 이유를 낱말로 말하고 **비0으로 끝낸다.**
 *   ② **합성/실사용 태그의 함정을 막는다.** `EXPO_PUBLIC_합성밟기` 는 «빌드 시점»에 번들에
 *      박히므로, 실행할 때 환경변수를 준다고 앱 안으로 들어가지 않는다. 그걸 모르면 합성
 *      크래시가 Sentry 에 **실사용으로** 쌓이고, 그건 나중에 소급으로 못 가른다.
 *
 * 쓰는 법
 *   node tools/앱밟기.js                 # .maestro 전량
 *   node tools/앱밟기.js 02_녹음제출.yaml  # 하나만
 *
 * 먼저 세울 것 (한 번)
 *   1) Maestro CLI 설치  2) 안드로이드 에뮬레이터 or USB 기기
 *   3) 합성 계정 자격:  MAESTRO_학생번호 · MAESTRO_비밀번호   ← 리허설 DB 계정만
 *   4) 앱 설치:  eas build --profile 합성밟기 --platform android   ← 이 프로필이라야 태그가 붙는다
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const 흐름칸 = path.join(ROOT, '.maestro');

function 죽기(사유, 처방) {
  console.error(`\n🔴 밟지 못했다 — ${사유}`);
  if (처방) console.error(`   ▶ ${처방}`);
  console.error('   ⚠ 이것은 「통과」가 아니다. 이 실행에서 검증된 흐름은 0건이다.\n');
  process.exit(1);
}

/* ① CLI — 없으면 여기서 끝난다. 「없어서 건너뛰었다」를 초록으로 만들지 않는다. */
const 버전 = spawnSync('maestro', ['--version'], { encoding: 'utf8', shell: true });
if (버전.status !== 0) {
  죽기('Maestro CLI 가 없다',
    'Windows 는 WSL 이 필요할 수 있다 — 설치 확인 후 다시 부른다. 흐름 파일 자체는 이미 서 있다.');
}

/* ② 자격 — 흐름은 값을 파일에 안 박는다(회귀 `tests/자동밟기손잡이.test.js` ④가 그걸 막는다). */
for (const k of ['MAESTRO_학생번호', 'MAESTRO_비밀번호']) {
  if (!process.env[k]) {
    죽기(`${k} 가 없다`, '리허설 DB 의 합성 계정 자격을 환경변수로 준다 — 운영 계정을 쓰지 않는다.');
  }
}

/* ③ 합성 태그 — 확인할 수 없는 것을 확인한 척하지 않는다. 도구는 설치된 앱이 어떤 프로필로
      구워졌는지 모른다(그 값은 번들 안에 있다). 그래서 «경고»지 «검사»가 아니다. */
console.log('⚠ 설치된 앱이 `--profile 합성밟기` 로 구워진 것인지 확인한다.');
console.log('  그 프로필이 아니면 여기서 나는 크래시가 Sentry 에 «실사용»으로 쌓인다(소급 불가).');
console.log('  기기의 앱 → 설정 → 배포 도착 확인 → 「관측(Sentry)」 줄이 `켜짐 · 합성밟기` 여야 한다.\n');

const 고른것 = process.argv[2];
const 대상 = 고른것 ? path.join(흐름칸, 고른것) : 흐름칸;
if (!fs.existsSync(대상)) 죽기(`흐름을 못 찾았다: ${대상}`);

/* 흐름 수를 먼저 센다 — 끝나고 「몇 건 돌았나」를 말하기 위해서다(초록은 분모와 함께 읽는다). */
const 흐름수 = 고른것
  ? 1
  : fs.readdirSync(흐름칸).filter((f) => f.endsWith('.yaml')).length;
console.log(`▶ 흐름 ${흐름수}건을 밟는다: ${path.relative(ROOT, 대상)}\n`);

const 결과 = spawnSync('maestro', ['test', 대상], { stdio: 'inherit', shell: true });

if (결과.status !== 0) {
  console.error(`\n🔴 흐름이 깨졌다 (대상 ${흐름수}건) — 위 출력에서 어느 단계인지 본다.`);
  console.error('   ⚠ 「손잡이가 없다」류면 화면에서 testID 가 빠진 것이다: node --test tests/자동밟기손잡이.test.js\n');
  process.exit(결과.status || 1);
}

console.log(`\n✅ 흐름 ${흐름수}건 통과.`);
console.log('   ⚠ 통과가 뜻하는 것은 «이 기기에서 이 경로가 돌았다»까지다 — 다른 기기·다른 데이터는 안 쟀다.\n');
