'use strict';
/**
 * sha256 — 앱(React Native)과 서버(Node·Deno) 양쪽에서 도는 순수 구현.
 *
 * ■ 왜 있나 (실측 2026-08-16)
 *   `lib/라디오라운드.js` 가 `require('node:crypto')` 를 쓰는데, 그 파일이 앱 화면까지
 *   끌려 들어온다: `src/말하기화면.js` → `lib/라디오낭독.js` → `lib/라디오라운드.js`.
 *   Metro(React Native 번들러)에는 Node 내장 모듈이 없어서 **release 번들 생성이 통째로
 *   실패한다** — `Unable to resolve module node:crypto`.
 *   🔴 그런데 node 회귀 145벌은 전부 초록이었다. 회귀가 Node 에서 도니 `node:crypto` 가
 *   멀쩡히 있기 때문이다. 즉 **「앱이 안 구워진다」를 재는 층이 저장소에 없었다.**
 *
 * ■ 왜 다른 해시로 갈아타지 않았나
 *   `눈금()` 의 회귀는 성질(결정성·범위)만 보지만, 같은 파일 `지문()` 은 sha256 앞 6자를
 *   내고 그 값은 라운드 행에 실려 **DB 에 남을 수 있다.** 구현을 바꾸면 그 값이 조용히
 *   갈라진다 — 증상은 「예전 행과 새 행의 지문이 다르다」뿐이라 원인이 안 보인다.
 *   그래서 «값이 같은» 길을 골랐다.
 *
 * ■ 대가 (틀릴 때의 모습)
 *   해시를 손으로 구현하면 **틀려도 그럴듯한 값이 나온다** — 32바이트짜리 무언가는 나오고,
 *   결정적이기까지 해서 `눈금` 회귀(같은 씨앗 = 같은 값)는 그대로 통과한다.
 *   그래서 `tests/sha256.test.js` 가 **node:crypto 와 바이트 단위로 대조**한다. 그 대조가
 *   이 파일의 유일한 존재 근거고, 대조가 없으면 이 파일은 써서는 안 되는 물건이다.
 *   ▶ 닫을 것 1개: 없다 — 이건 추가 층이고, `node:crypto` 는 서버 쪽에서 그대로 산다
 *     (다만 lib 는 이제 이 파일만 쓴다).
 */

/* FIPS 180-4 상수 — 처음 64개 소수의 세제곱근 소수부 앞 32비트. */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const 회전 = (x, n) => (x >>> n) | (x << (32 - n));

/** 문자열 → UTF-8 바이트. 한글 씨앗이 실제로 들어오므로 «문자 코드»가 아니라 UTF-8 이어야 한다. */
function utf8바이트(s) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
  /* 아주 낡은 판을 위한 폴백 — RN·Node 현행에는 전부 TextEncoder 가 있다. */
  return Uint8Array.from(Buffer.from(s, 'utf8'));
}

/** sha256 다이제스트 32바이트. */
function 바이트(입력) {
  const msg = typeof 입력 === 'string' ? utf8바이트(입력) : Uint8Array.from(입력);

  /* 패딩: 0x80 한 바이트 + 0 들 + 64비트 길이(비트 단위, big-endian). */
  const 비트길이 = msg.length * 8;
  const 총길이 = (((msg.length + 8) >> 6) + 1) << 6;   // 64 의 배수로 올림
  const buf = new Uint8Array(총길이);
  buf.set(msg);
  buf[msg.length] = 0x80;
  /* 길이는 하위 32비트만 써도 되는 크기가 아니라, 상위 32비트도 채운다.
     JS 비트 연산은 32비트라 상위는 나눗셈으로 뽑는다. */
  const 상위 = Math.floor(비트길이 / 2 ** 32);
  const dv = new DataView(buf.buffer);
  dv.setUint32(총길이 - 8, 상위 >>> 0, false);
  dv.setUint32(총길이 - 4, 비트길이 >>> 0, false);

  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let 자리 = 0; 자리 < 총길이; 자리 += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = dv.getUint32(자리 + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = 회전(w[i - 15], 7) ^ 회전(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = 회전(w[i - 2], 17) ^ 회전(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i += 1) {
      const S1 = 회전(e, 6) ^ 회전(e, 11) ^ 회전(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = 회전(a, 2) ^ 회전(a, 13) ^ 회전(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e;
      e = (d + t1) >>> 0;
      d = c; c = b; b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }

  const out = new Uint8Array(32);
  new DataView(out.buffer).setUint32(0, H[0], false);
  for (let i = 0; i < 8; i += 1) new DataView(out.buffer).setUint32(i * 4, H[i], false);
  return out;
}

/** sha256 hex — `crypto.createHash('sha256').update(s).digest('hex')` 와 같은 문자열. */
function hex(입력) {
  const b = 바이트(입력);
  let s = '';
  for (let i = 0; i < b.length; i += 1) s += b[i].toString(16).padStart(2, '0');
  return s;
}

/**
 * 앞 n 바이트를 big-endian 정수로. `Buffer.readUIntBE(0, n)` 자리를 대신한다.
 * 🔑 n ≤ 6 — 그 위는 2^53 을 넘어 정수 정밀도가 깨진다(Buffer 도 6까지만 받는다).
 */
function 앞정수BE(입력, n = 6) {
  if (!(n >= 1 && n <= 6)) throw new RangeError('앞정수BE: 1~6 바이트만 안전하다');
  const b = 바이트(입력);
  let v = 0;
  for (let i = 0; i < n; i += 1) v = v * 256 + b[i];
  return v;
}

module.exports = { 바이트, hex, 앞정수BE };
