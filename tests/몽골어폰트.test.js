'use strict';
/* 몽골어(키릴) 폰트 배선 회귀.
 *
 * 🔴 이 파일이 막는 사고 둘 — **둘 다 조용하다**
 *   ① 상수에 굵기를 더하고 **파일·등록을 잊는다** → 안드로이드는 그 자리에서 죽고, **웹은 조용히
 *      시스템 폰트로 떨어진다.** 후자가 더 나쁘다: 브랜드 밖 글자인데 아무도 모른다.
 *   ② 몽골어를 그리는 자리에 **킷 한글 폰트(SUIT)를 박는다** → 키릴 자형이 없어 두부(□□□).
 *      그 화면은 「글자가 안 온 것」과 구별이 안 된다. 08-27 에 실제로 두 화면이 그랬다
 *      (`막힘카드`·`생성카드` 의 병기 줄) — 몽골어가 아직 안 와서 증상이 없었을 뿐이다.
 *
 * 🔑 ②는 **번역이 오기 전에만** 잡을 수 있다. 오고 나면 사람이 눈으로 보고 잡는데, 그때는
 *   이미 학생이 그 화면을 봤다.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { 코드만, 파일소스 } = require('./lib/소스검사.js');

const 뿌리 = path.join(__dirname, '..');
const 소스 = (p) => 코드만(파일소스(path.join(뿌리, ...p.split('/'))));
const 테마 = 소스('src/테마.js');
const app = 소스('App.js');

/** 테마에서 몽골어가 쓰는 폰트 이름 전량 — 상수 하나 + 굵기 표. */
function 몽골어패밀리() {
  const 이름들 = new Set();
  const 상수 = /export const 몽골어 = \{([^}]*)\}/.exec(테마);
  assert.ok(상수, '테마에서 `몽골어` 상수를 못 찾았다 — 이름이 바뀌었다면 이 검사도 함께 옮겨라');
  const 표 = /export const 몽골어폰트 = \{([\s\S]*?)\};/.exec(테마);
  assert.ok(표, '테마에서 `몽골어폰트` 표를 못 찾았다');
  for (const 덩이 of [상수[1], 표[1]]) {
    for (const m of 덩이.matchAll(/'([A-Za-z][A-Za-z0-9-]*)'/g)) 이름들.add(m[1]);
  }
  return [...이름들];
}

test('① 🔴 몽골어 폰트가 App.js 에 등록돼 있고 파일이 실제로 있다', () => {
  const 이름들 = 몽골어패밀리();
  assert.ok(이름들.length >= 3, `몽골어 폰트가 ${이름들.length}종이다 — 분모가 깨졌다`);
  for (const 이름 of 이름들) {
    assert.ok(app.includes(`'${이름}'`), `${이름} 이 App.js useFonts 에 없다 — 웹은 조용히 폴백한다`);
    const 파일 = path.join(뿌리, 'assets', 'fonts', `${이름}.ttf`);
    assert.ok(fs.existsSync(파일), `${파일} 이 없다 — 등록만 하고 파일을 안 넣었다`);
  }
});

test('② 🔴 그 폰트에 몽골 키릴이 «실제로» 들어 있다 — 이름만 보고 판정하지 않는다', () => {
  /* 「Inter Tight 니까 키릴판이겠지」가 오진의 모양이다. 웹폰트 subset 은 라틴만 든 벌이 흔하다.
     그래서 cmap 을 직접 센다 — `Өө`·`Үү` 는 몽골 고유라 러시아어 subset 에도 없을 수 있다. */
  const 몽골고유 = [0x04E8, 0x04E9, 0x04AE, 0x04AF];   // Ө ө Ү ү
  const 키릴기본 = [0x0410, 0x042F, 0x0430, 0x044F];   // А Я а я

  for (const 이름 of 몽골어패밀리()) {
    const 버퍼 = fs.readFileSync(path.join(뿌리, 'assets', 'fonts', `${이름}.ttf`));
    const 있는가 = cmap있나(버퍼);
    for (const cp of [...몽골고유, ...키릴기본]) {
      assert.equal(있는가(cp), true,
        `${이름} 에 U+${cp.toString(16).toUpperCase().padStart(4, '0')} 글리프가 없다 — `
        + '라틴 전용 subset 을 넣었다. 그 자리는 두부(□□□)가 된다.');
    }
  }
  /* 탐지력 — 파서가 살아 있나. SUIT 에는 키릴이 **없어야** 한다(있으면 이 검사가 무의미하다). */
  const suit = cmap있나(fs.readFileSync(path.join(뿌리, 'assets', 'fonts', 'SUIT-Regular.ttf')));
  assert.equal(suit(0x04E9), false, '검사가 죽었다 — SUIT 에서도 ө 를 「있다」고 한다');
  assert.equal(suit(0xAC00), true, '검사가 죽었다 — SUIT 에서 「가」를 못 찾는다');
});

/**
 * TTF `cmap` 을 직접 읽어 코드포인트 존재를 본다 — 형식 4·12 만 본다(그 둘이 실제로 쓰인다).
 * 외부 의존 없이 도는 것이 중요하다: 이 검사가 설치 상태에 따라 건너뛰면 「0건」과 구별이 안 된다.
 */
function cmap있나(buf) {
  const u16 = (o) => buf.readUInt16BE(o);
  const u32 = (o) => buf.readUInt32BE(o);
  const 표수 = u16(4);
  let cmap표 = 0;
  for (let i = 0; i < 표수; i += 1) {
    const o = 12 + i * 16;
    if (buf.toString('latin1', o, o + 4) === 'cmap') cmap표 = u32(o + 8);
  }
  if (!cmap표) throw new Error('cmap 표가 없다 — TTF 가 아니거나 깨졌다');

  const 하위표 = [];
  const n = u16(cmap표 + 2);
  for (let i = 0; i < n; i += 1) 하위표.push(cmap표 + u32(cmap표 + 4 + i * 8 + 4));

  return (cp) => 하위표.some((off) => {
    const 형식 = u16(off);
    if (형식 === 4) {
      const segX2 = u16(off + 6);
      const 끝 = off + 14;
      const 시작 = 끝 + segX2 + 2;
      const 델타 = 시작 + segX2;
      const 범위 = 델타 + segX2;
      for (let s = 0; s < segX2 / 2; s += 1) {
        if (cp <= u16(끝 + s * 2) && cp >= u16(시작 + s * 2)) {
          const ro = u16(범위 + s * 2);
          if (ro === 0) return ((cp + u16(델타 + s * 2)) & 0xFFFF) !== 0;
          const gi = 범위 + s * 2 + ro + (cp - u16(시작 + s * 2)) * 2;
          return gi + 1 < buf.length && u16(gi) !== 0;
        }
      }
      return false;
    }
    if (형식 === 12) {
      const 무리 = u32(off + 12);
      for (let g = 0; g < 무리; g += 1) {
        const o = off + 16 + g * 12;
        if (cp >= u32(o) && cp <= u32(o + 4)) return true;
      }
    }
    return false;
  });
}

test('③ 🔴 «병기» 줄이 킷 한글 폰트를 안 쓴다 — 쓰면 그 화면만 두부가 된다', () => {
  /* «병기» = 한국어 아래 몽골어를 한 줄 더 얹는 자리. 08-27 에 두 화면이 여기서 샜다. */
  const 겨눌것 = ['src/막힘카드.js', 'src/생성카드.js'];
  const 걸린것 = [];
  let 잰줄 = 0;
  for (const p of 겨눌것) {
    for (const 줄 of 소스(p).split('\n')) {
      if (!/_병기\s*:/.test(줄)) continue;
      잰줄 += 1;
      if (/fontFamily:\s*폰트\./.test(줄)) 걸린것.push(`${p} ← ${줄.trim().slice(0, 60)}`);
    }
  }
  assert.ok(잰줄 >= 4, `병기 줄을 ${잰줄}개밖에 못 찾았다 — 이름이 바뀌었다면 이 검사도 옮겨라`);
  assert.deepEqual(걸린것, [], `병기 줄이 킷 한글 폰트를 쓴다:\n  ${걸린것.join('\n  ')}`);
});

test('④ 몽골어 상수를 쓰는 자리는 그 자체로 폰트를 갖는다 — 화면이 따로 안 정해도 된다', () => {
  /* `해설: { ...몽골어, color: … }` 처럼 펴 쓰는 자리가 여럿이다. 상수에 폰트가 없으면 그 전부가
     시스템 폰트로 떨어진다(조용히). 그래서 상수 자신이 폰트를 든다. */
  assert.match(테마, /export const 몽골어 = \{ fontFamily: 'InterTight-[A-Za-z]+'/,
    '몽골어 상수에서 fontFamily 가 사라졌다 — 이 상수를 펴 쓰는 화면 전부가 폴백한다');
});

test('⑤ 🚫 몽골어 표에 «없는 폰트»를 적지 않는다 — DM Mono·800 은 원리상 못 쓴다', () => {
  const 표 = /export const 몽골어폰트 = \{([\s\S]*?)\};/.exec(테마)[1];
  assert.equal(/DMMono|SUIT/.test(표), false, '몽골어 표에 키릴 없는 폰트가 들어갔다');
  assert.equal(/헤드|모노/.test(표), false,
    '몽골어 표에 헤드(800)·모노 키가 생겼다 — Inter Tight 에 800 이 없고 DM Mono 에 키릴이 없다. '
    + '폰트를 먼저 싣고 더한다(순서를 뒤집지 않는다)');
});

test('⑥ 🔴 `라벨_mn` 을 그리는 화면은 «전부» 몽골어 폰트를 든다 — 병기 줄만으로는 못 본다', () => {
  /* 🔑 ③ 은 `_병기` 라는 «이름»으로 찾는다. 그런데 몽골어가 서는 자리는 그 이름을 안 쓰는 쪽이
     더 많았다 — `라벨_mn || 라벨` 꼴로 그리는 화면 셋(나침반·회고·인증)이 08-27 검토에서
     드러났고 셋 다 킷 한글 폰트였다. **이름으로 찾는 검사는 이름을 안 쓰는 자리를 원리상 못 본다.**
     그래서 여기서는 «무엇을 그리나»(라벨_mn)로 찾는다.
     ⚠ 지금 `라벨_mn` 은 전부 null 이라 **증상이 없다** — 차는 날 그 화면만 깨진다.
        즉 이 검사는 **번역이 오기 전에만** 쓸모가 있다. */
  const 그리는파일 = ['src/나침반화면.js', 'src/회고화면.js', 'src/인증화면.js'];
  const 안든것 = [];
  for (const p of 그리는파일) {
    const src = 소스(p);
    if (!/라벨_mn/.test(src)) { 안든것.push(`${p}: 라벨_mn 을 아예 안 그린다 — 목록이 낡았다`); continue; }
    if (!/몽골어폰트/.test(src)) 안든것.push(`${p}: 라벨_mn 을 그리면서 몽골어폰트를 안 든다`);
  }
  assert.deepEqual(안든것, [], `몽골어가 차는 날 두부가 될 화면 — ${안든것.join(' · ')}`);

  /* ⚠ **이 검사가 못 보는 것**(장치에는 대가를 함께 적는다): 한 파일 안에서 «몇 자리»를 고쳤는지는
     안 센다. 자리 수로 세는 판을 08-27 에 만들어 봤는데, 선언·prop·구조분해까지 «자리»로 세어
     거짓양성이 났다 — 우는 가드는 결국 꺼진다. 그래서 파일 단위로만 세고, 정말 놓치기 쉬운
     한 자리(아래 헬퍼)는 모양을 직접 못박는다.

     🔴 한국어 문장 «안»에 몽골어가 섞여 드는 자리 — Text 하나에 폰트는 하나뿐이라 문자열을
        그대로 돌려주면 그 조각만 두부가 된다. 그 헬퍼가 감싸는 모양을 여기서 문다. */
  assert.match(소스('src/회고화면.js'), /return <Text style=\{\{ fontFamily: 굵기 \}\}>\{mn\}<\/Text>;/,
    '회고화면의 판정 문구 헬퍼가 몽골어를 감싸지 않는다 — 한국어 줄 안에서 그 조각만 깨진다');

  /* 🔑 데이터 쪽도 함께 못박는다 — 화면이 준비돼 있어도 그 칸이 없으면 영영 한국어다. */
  const { 문항, 아이막, 성별, 목표 } = require('../lib/가입문항.js');
  for (const [이름, 묶음] of [['문항', 문항], ['아이막', 아이막], ['성별', 성별], ['목표', 목표]]) {
    for (const x of 묶음) {
      assert.ok('라벨_mn' in x, `${이름} 의 «${x.값 ?? x.필드}» 에 라벨_mn 자리가 없다`);
    }
  }
  assert.equal(아이막.length, 22, `아이막이 ${아이막.length}개다 — 분모가 깨졌다`);
});

test('⑦ 🔴 미감수 몽골어가 «자리»에 몰래 들어오지 않는다 — 라벨_mn 은 아직 전부 null 이다', () => {
  /* 미검수 번역을 화면에 올리면 그것이 사실상 정본이 된다(`lib/나침반문항.js` 머리말 §9-2 ㉦-2).
     🔑 감수가 끝나면 이 검사를 **지우는 게 아니라** 「감수 통과분만 차 있다」로 바꾼다.
        지금 지키는 것 하나: 초벌·기계 번역이 조용히 화면으로 새지 않는 것. */
  const { 문항, 아이막, 성별, 목표 } = require('../lib/가입문항.js');
  const 찬것 = [...문항, ...아이막, ...성별, ...목표]
    .filter((x) => x.라벨_mn != null)
    .map((x) => x.값 ?? x.필드);
  assert.deepEqual(찬것, [],
    `감수를 안 지난 몽골어가 라벨_mn 에 들어왔다: ${찬것.join(' · ')}`
    + ' — 통로는 하나다: 감수(l10n) → tools/문구내보내기.js → lib/가입문항.js');
});
