/* 소리 회귀 — 소리게이트·SFX 반입·BGM 통로 (게임층 설계 §3 · 유호 확정 08-11 「기본안+효과음·햅틱」).
 *
 * ■ 무엇을 지키나
 *   ① **녹음 중 소리·햅틱 0** — §3-1 🔴 의 기계판. 게이트가 한 곳이라 여기만 재면 전부다.
 *   ② **효과음은 킷 3종 + 가이드 목소리 18종뿐** — 리프레이밍 무음(§3-3 7번)·실패음 부재(규칙 ②)가 「이름이 없어서」
 *      원리상 못 지나가는 구조를 못박는다. 탐지력은 픽스처(가짜 이름)가 진다.
 *   ③ **SFX 는 사운드킷과 같은 바이트** — 형제 저장소(as)가 있으면 대조, 없으면 skip
 *      (fail 로 짜면 CI 에서 남의 배포를 막는다 — §3-1 ⚠ 그대로).
 *   ④ **BGM 자산·통로 정합** — 템포 상수 1곳 · 결정적 재렌더 일치(손 편집 탐지) ·
 *      후보 단계(candidate-*)와 선정 단계(measure 1곡)만 허용 — 그 밖의 상태는 빨갛다.
 *   ⑤ **어댑터는 expo 를 최상위에서 안 잡는다** — node 테스트가 src/소리.js 를 읽을 수 있어야
 *      게이트 우회(화면이 expo 를 직접 잡는 방향)를 다음 검사가 잴 수 있다.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { 띄우기 } = require('./lib/띄우기.js');
const { 코드만, 코드만픽스처 } = require('./lib/소스검사.js');

const 뿌리 = path.resolve(__dirname, '..');
const { 만들기, 효과음이름 } = require('../lib/소리게이트.js');

/* BGM WAV 는 git 밖 생성물이다(1MB 가드 · postinstall 이 굽는다) — 신선한 트리에서도
 * 아래 자산 검사가 서도록, 없을 때만 여기서 한 번 굽는다(결정적 렌더라 몇 초·부작용 0). */
if (!fs.existsSync(path.join(뿌리, 'assets', 'bgm', 'synk-bgm-measure.wav'))) {
  띄우기([path.join(뿌리, 'tools', 'BGM빌드.js')], { cwd: 뿌리 });
}

test('게이트 ① — 녹음 경계에서 소리·햅틱이 죽고 BGM 만 음소거·복원된다', () => {
  const g = 만들기();
  assert.equal(g.판정('sfx', 'earn').허용, true);
  assert.equal(g.판정('haptic').허용, true);
  g.bgm상태(true);
  assert.deepEqual(g.녹음시작(), [{ 할일: 'bgm음소거' }]);
  assert.equal(g.판정('sfx', 'earn').허용, false, '녹음 중 효과음이 지나갔다 — 마이크 되먹임');
  assert.equal(g.판정('haptic').허용, false, '녹음 중 햅틱이 지나갔다');
  assert.equal(g.판정('bgm시작').조치, '음소거로시작');
  assert.deepEqual(g.녹음끝(), [{ 할일: 'bgm복원' }]);
  assert.equal(g.판정('sfx', 'earn').허용, true, '녹음 끝 뒤 효과음이 안 돌아왔다');
});

test('게이트 ① — BGM 이 꺼져 있으면 녹음 경계 조치가 0건(없는 것을 음소거하지 않는다)', () => {
  const g = 만들기();
  assert.deepEqual(g.녹음시작(), []);
  assert.deepEqual(g.녹음끝(), []);
});

test('게이트 ② — 킷 밖 이름은 원리상 못 지나간다(리프레이밍·실패음의 기계판)', () => {
  const g = 만들기();
  assert.deepEqual([...효과음이름].slice(0, 3), ['earn', 'achieve', 'notify']);
  assert.equal(효과음이름.length, 21, '킷 3종 + 가이드 목소리 18종(몽글 12·까몽 3·마린 3)이 아니다');
  for (const 가짜 of ['reframe', 'fail', 'buzzer', 'BGM', '']) {
    const 답 = g.판정('sfx', 가짜);
    assert.equal(답.허용, false, `킷 밖 소리가 지나갔다: ${가짜}`);
    assert.match(답.사유, /킷 밖/);
  }
});

test('SFX ③ — 21종이 있고, 형제 저장소가 있으면 사운드킷과 바이트 동일', (t) => {
  const { 목소리이름 } = require('../lib/소리게이트.js');
  const 이름들 = ['synk-sound-earn.wav', 'synk-sound-achieve.wav', 'synk-sound-notify.wav',
    ...목소리이름.map((n) => `synk-voice-${n}.wav`)];
  for (const 이름 of 이름들) {
    assert.ok(fs.existsSync(path.join(뿌리, 'assets', 'sfx', 이름)), `assets/sfx/${이름} 이 없다`);
  }
  const 형제 = path.resolve(뿌리, '..', 'SYNK-appsscript', 'docs', '브랜드_사운드킷');
  if (!fs.existsSync(형제)) return t.skip('형제 저장소 부재 — 바이트 대조는 로컬에서만');
  for (const 이름 of 이름들) {
    const a = fs.readFileSync(path.join(형제, 이름));
    const b = fs.readFileSync(path.join(뿌리, 'assets', 'sfx', 이름));
    assert.ok(a.equals(b), `${이름} 이 사운드킷 정본과 다르다 — 재복사(손 편집 금지)`);
  }
});

test('BGM ④ — 자산 상태는 「후보 2」 또는 「선정 1」뿐이고, WAV 헤더·길이가 정본 상수와 맞다', () => {
  const 폴더 = path.join(뿌리, 'assets', 'bgm');
  const 파일들 = fs.readdirSync(폴더).filter((f) => f.endsWith('.wav')).sort();
  const 후보 = 파일들.filter((f) => /^synk-bgm-candidate-[a-z]\.wav$/.test(f));
  const 선정 = 파일들.filter((f) => f === 'synk-bgm-measure.wav');
  assert.ok(
    (선정.length === 1 && 후보.length === 0) || (선정.length === 0 && 후보.length >= 1),
    `BGM 폴더 상태가 어정쩡하다(${파일들.join(', ')}) — 선정했으면 한 곡만 남긴다(§3-2 ⓑ)`,
  );
  for (const f of 파일들) {
    const b = fs.readFileSync(path.join(폴더, f));
    assert.equal(b.toString('ascii', 0, 4), 'RIFF');
    assert.equal(b.toString('ascii', 8, 12), 'WAVE');
    assert.equal(b.readUInt32LE(24), 44100, `${f} 샘플레이트`);
    const 초 = (b.length - 44) / 4 / 44100;
    assert.ok(초 > 20 && 초 < 40, `${f} 길이 ${초.toFixed(1)}s — 루프 규격 밖`);
  }
});

test('BGM ④ — 측정 템포 상수는 BGM빌드.js 한 곳뿐이다(§3-2 ⓓ 사본 금지)', () => {
  const 도구 = fs.readFileSync(path.join(뿌리, 'tools', 'BGM빌드.js'), 'utf8');
  const 선언 = 도구.match(/측정템포BPM\s*=\s*\d+/g) || [];
  assert.equal(선언.length, 1, '템포 선언이 한 곳이 아니다');
  let 사본 = 0;
  for (const 층 of ['lib', 'src']) {
    for (const f of fs.readdirSync(path.join(뿌리, 층))) {
      const 절대 = path.join(뿌리, 층, f);
      if (!fs.statSync(절대).isFile()) continue;
      if (/측정템포BPM\s*=\s*\d/.test(fs.readFileSync(절대, 'utf8'))) 사본++;
    }
  }
  assert.equal(사본, 0, 'lib/src 에 템포 값 사본이 생겼다 — 갈라진다');
});

test('BGM ④ — 재렌더가 바이트까지 같다(손 편집·비결정 렌더 탐지)', () => {
  const r = 띄우기([path.join(뿌리, 'tools', 'BGM빌드.js'), '--check'], { cwd: 뿌리 });
  assert.ok(!/❌/.test(r.stdout), `BGM --check 불일치:\n${r.stdout}`);
});

test('어댑터 ⑤ — src/소리.js 는 expo 를 최상위에서 잡지 않고, 게이트를 지난다', () => {
  /* 🔴 주석을 지우고 잰다 — `src/소리.js` 는 자기 머리말에서 「expo 를 최상위에서 import 하지
   *   않는다」와 `impactAsync` 를 **설명해야만 하는** 파일이라(그게 이 파일의 규칙 자체다),
   *   원문으로 재면 가장 잘 적어 둔 판이 적색이 된다.
   *   ⚠ `코드만` 은 주석만 있던 줄을 «버린다» — 그래서 아래 `{0,120}` 거리 창이 **코드 사이
   *   거리**를 재게 된다. 이 단언이 겨눈 것이 정확히 그것이라(호출 두 개가 붙어 있나) 뜻이
   *   맞고, 창이 좁아지는 쪽이라 금지가 느슨해지지 않는다(`줄맞춰코드만` 은 반대로 늘린다). */
  assert.equal(코드만(코드만픽스처.입력), 코드만픽스처.기대, '주석 제거기가 죽었다');
  const 코드 = 코드만(fs.readFileSync(path.join(뿌리, 'src', '소리.js'), 'utf8'));
  assert.ok(!/^import[^\n]*expo/m.test(코드), 'expo 최상위 import — node 가 이 파일을 못 읽게 된다');
  assert.match(코드, /lib\/소리게이트/, '게이트 import 가 사라졌다 — 판정 우회');
  assert.ok(!/impactAsync[\s\S]{0,120}impactAsync/.test(코드), '햅틱 호출부가 늘었다 — 상태 전이(도장) 하나만');
});
