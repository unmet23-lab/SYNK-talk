/* 음성 헤더 — 업로드된 원본의 **앞머리 바이트**에서 실제 녹음 규격을 읽는다. (C0 §4-2)
 *
 * ■ 왜 서버가 재나 — c6 가 `capture_meta` 를 만든 이유가 이것이다
 *   「PCM WAV 16k/16bit/mono · AGC off」는 **지시**일 뿐, 그 녹음이 실제로 그랬다는 증거가
 *   행에 없었다. 앱 업데이트로 프리셋이 조용히 바뀌면 그 뒤 **전량이 오염되는데 증상이 없다.**
 *   그래서 규격을 「사람이 지키는 약속」이 아니라 **행마다 붙는 관측값**으로 만든다.
 *   🔑 앱이 스스로 적으면 그건 관측이 아니라 **주장**이다 — `이벤트검증` 이 `capture_meta.server`
 *   를 앱에게서 거부하는 이유고, 이 파일은 그 칸을 채우는 유일한 통로다.
 *
 * ■ 모르는 것을 안다고 적지 않는다
 *   AGC·노이즈 억제는 WAV 헤더에 **흔적이 없다.** 못 재는 것은 여기서 아예 안 적고, 봉투를
 *   조립하는 쪽(`functions/events`)이 `agc_verified: 'unknown'` 으로 남긴다. `false` 로 적으면
 *   그 행이 「off 였다」는 **거짓 증거**가 되고, 떨림이 학생 특성인지 기기 처리 결과인지 영영
 *   못 가른다. 같은 이유로 못 읽은 칸은 **null** 이다 — 0 이나 추정값은 틀린 관측을 영구히 쌓는다.
 *
 * ■ 규격 밖도 읽는다 (거부하지 않는다)
 *   C0 §4-2 = 「규격 밖이어도 업로드를 거부하지 않는다」 — 거부하면 학생의 발화가 영영 사라진다.
 *   그러니 m4a 가 와도 **무엇인지는 적는다**. 다만 컨테이너 파서를 새로 짜지 않는다:
 *   MP4 박스를 파는 값보다 「m4a 가 쌓이고 있다」는 사실 하나가 훨씬 크고, 그건 매직만으로 선다.
 */
'use strict';

/** 정본 규격 — C0 §4-2 (🔴 소급 불가 배선 ①). 이 표와 다르면 `spec_violations` 에 적힌다. */
const 정본 = Object.freeze({ codec: 'pcm_wav', sample_rate: 16000, bit_depth: 16, channels: 1 });

const 글자 = (b, off, n) => {
  let s = '';
  for (let i = 0; i < n; i += 1) s += String.fromCharCode(b[off + i] || 0);
  return s;
};
const u16 = (b, o) => ((b[o] || 0) | ((b[o + 1] || 0) << 8)) >>> 0;
const u32 = (b, o) => (((b[o] || 0) | ((b[o + 1] || 0) << 8) | ((b[o + 2] || 0) << 16) | ((b[o + 3] || 0) << 24)) >>> 0);

/* WAV `fmt ` 의 포맷 태그. 이름을 여기서 정하는 이유: 뒤에서 세는 것이 「무엇이 쌓였나」라
 * 태그 숫자로 두면 집계가 사람 손을 탄다. 모르는 태그는 **숫자를 그대로 달고 남긴다.** */
const 코덱표 = { 1: 'pcm_wav', 3: 'float_wav', 6: 'alaw_wav', 7: 'mulaw_wav' };
const 코덱이름 = (태그) => 코덱표[태그] || `wav_fmt_${태그}`;

/** WAV 가 아닌 컨테이너 — 매직만 본다(파서를 새로 짜지 않는다). */
function 다른형식(b) {
  if (글자(b, 4, 4) === 'ftyp') return 'm4a';                        // MP4 계열 = Expo 기본 프리셋
  if (글자(b, 0, 4) === 'OggS') return 'ogg';
  if (글자(b, 0, 4) === 'fLaC') return 'flac';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm';
  if (글자(b, 0, 3) === 'ID3') return 'mp3';
  if (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) return 'aac';         // ADTS(레이어 00) — mp3 보다 먼저
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'mp3';
  return 'unknown';
}

/**
 * @param {Uint8Array} 앞머리     객체 앞부분(4KB 권장 — `fmt `·`data` 는 그 안에 있다)
 * @param {number|null} 전체바이트 객체 전체 크기. 모르면 null — 그러면 잘림 검사를 **건너뛴다**
 * @returns {{codec: string|null, sample_rate: number|null, bit_depth: number|null,
 *            channels: number|null, duration_ms: number|null, spec_violations: string[]}}
 */
function 헤더읽기(앞머리, 전체바이트) {
  const b = 앞머리 instanceof Uint8Array ? 앞머리 : Uint8Array.from(앞머리 || []);
  const 잰것 = { codec: null, sample_rate: null, bit_depth: null, channels: null, duration_ms: null, spec_violations: [] };

  if (b.length < 12) {
    잰것.codec = 'unknown';
    잰것.spec_violations.push('unparsable');
    return 잰것;
  }
  const 컨테이너 = 글자(b, 0, 4);
  if ((컨테이너 === 'RIFF' || 컨테이너 === 'RF64') && 글자(b, 8, 4) === 'WAVE') return wav읽기(b, 전체바이트, 잰것);

  잰것.codec = 다른형식(b);
  잰것.spec_violations.push(`codec:${잰것.codec}`);
  return 잰것;
}

function wav읽기(b, 전체바이트, 잰것) {
  let off = 12;
  let fmt = null;
  let dataSize = null;
  let dataOff = null;

  /* 청크를 걸어간다 — 44바이트 표준형만 가정하지 않는다. 기기·라이브러리는 `LIST`·`fact` 를
   * 앞에 끼워 넣고, 그러면 고정 오프셋으로 읽은 값이 **조용히 엉뚱한 바이트**가 된다. */
  while (off + 8 <= b.length) {
    const id = 글자(b, off, 4);
    const size = u32(b, off + 4);
    const 본문 = off + 8;
    if (id === 'fmt ' && 본문 + 16 <= b.length) fmt = 본문;
    if (id === 'data') { dataSize = size; dataOff = 본문; break; }   // 본문은 앞머리에 없어도 된다
    if (size === 0 || size === 0xffffffff) break;                    // 잘린 헤더 · RF64 자리표시
    const 다음 = 본문 + size + (size % 2);                            // 청크는 짝수 정렬
    if (다음 <= off) break;                                           // 뒤로 가면 멈춘다(무한루프 방지)
    off = 다음;
  }

  if (fmt === null) {
    잰것.codec = 'wav';
    잰것.spec_violations.push('unparsable');
    return 잰것;
  }

  /* EXTENSIBLE(0xFFFE)은 진짜 포맷을 SubFormat GUID 앞 2바이트에 둔다. 안 풀면 **평범한 PCM 이
   * 규격 위반으로 세어지고**, 그 오탐이 「규격 밖이 늘었다」는 가짜 신호를 만든다. */
  const 태그 = u16(b, fmt);
  const 실태그 = (태그 === 0xfffe && fmt + 26 <= b.length) ? u16(b, fmt + 24) : 태그;
  const byteRate = u32(b, fmt + 8);

  잰것.codec = 코덱이름(실태그);
  잰것.channels = u16(b, fmt + 2);
  잰것.sample_rate = u32(b, fmt + 4);
  잰것.bit_depth = u16(b, fmt + 14);
  if (dataSize != null && byteRate > 0) 잰것.duration_ms = Math.round((dataSize / byteRate) * 1000);

  /* 길이 불일치(C0 §4-2 「길이 불일치 포함」) — 헤더가 말한 길이보다 파일이 **짧다** =
   * 녹음이 중간에 끊겼다. 헤더 숫자를 그대로 믿으면 없는 초를 가진 행이 남고, 그건 나중에
   * 「전사 실패」와 구분되지 않는다. 그럴 땐 **실제 있는 만큼**을 duration 으로 적는다. */
  if (dataSize != null && dataOff != null && Number.isFinite(전체바이트) && 전체바이트 > 0) {
    const 실제 = 전체바이트 - dataOff;
    if (dataSize > 실제) {
      잰것.spec_violations.push('truncated');
      잰것.declared_duration_ms = 잰것.duration_ms;
      잰것.duration_ms = byteRate > 0 ? Math.round((실제 / byteRate) * 1000) : null;
    }
  }

  for (const 칸 of ['codec', 'sample_rate', 'bit_depth', 'channels']) {
    if (잰것[칸] !== 정본[칸]) 잰것.spec_violations.push(`${칸}:${잰것[칸]}`);
  }
  return 잰것;
}

module.exports = { 정본, 헤더읽기 };
