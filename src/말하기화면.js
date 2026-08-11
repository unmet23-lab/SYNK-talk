import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AudioModule,
  createAudioPlayer,
  setAudioModeAsync,
} from 'expo-audio';
/* 🔴 배럴(`expo-audio`)이 이 훅을 **안 내보낸다** — 57.0.3 의 `build/ExpoAudio.js` 에서
 *   re-export 한 줄이 빠진 채 배포됐다(소스 `src/ExpoAudio.ts:661` 에는 있다). 네이티브
 *   모듈도 컴파일본(`build/AudioStream.js`)도 멀쩡하니 실제 모듈에서 직접 가져온다.
 *   ⚠ 소스만 보고 「배럴에 있다」고 읽으면 실기기에서만 죽는다 — 런타임이 읽는 것은
 *     `package.json main` 이 가리키는 `build/` 다. 판이 올라 배럴이 고쳐지면 되돌린다. */
import { useAudioStream } from 'expo-audio/build/AudioStream';
import * as Speech from 'expo-speech';
import { 색, 폰트, 모노트래킹 } from './테마';
import { 머뭇거림추적, 발화문턱_DB, 데시벨, 다음호흡 } from '../lib/세호흡.js';
import { wav조립 } from '../lib/wav조립.js';
import { 정본 as 음성정본 } from '../lib/음성헤더.js';
import { 마이크준비, 마이크끄기 } from '../lib/마이크권한.js';
import { 흐름id, 항목추가, 다음시도번호, 학습출석, 전송기록, 보낼것, 되듣기기록, 되듣기보낼것, 선택기록, 선택보낼것, 배달상태 } from '../lib/제출로그.js';
/* 문구는 「어제의 나」 화면과 **같은 함수**에서 나온다 — 두 곳에 적으면 한쪽만 고쳐지고,
   갈라진 날 학생은 같은 사실을 두 문장으로 듣는다(`lib/견줌.js`). */
import { 늘어난말 } from '../lib/견줌.js';
import { 화면과제, 몽골날짜, 복귀행동, 열람사건, 되듣기사건, 선택사건 } from '../lib/오늘과제.js';
/* 「골라서 답하기」의 조립기 — 자리를 섞는 것과 택1 판정이 여기 한 곳에 산다(`lib/선택로그.js`).
   화면은 **그 결과가 준 순서대로 그리기만** 한다: 안 그러면 행에 적힌 자리와 학생이 실제로 본
   자리가 갈리고, 그 갈림은 증상이 없다. */
import { 보기세우기, 선택payload } from '../lib/선택로그.js';
import { 사건보내기 } from './사건통로.js';
import { 로그읽기, 로그쓰기, 음성쓰기, 지속저장 } from './저장.js';
import { 오늘과제받기 } from './과제API.js';
import { 발화보내기 } from './제출API.js';
import 막힘카드 from './막힘카드.js';
import { 급수편지 } from '../contents/첫편지.js';
/* G1 갈래 — 오늘 배정이 미니게임이면 이 화면 대신 게임 화면이 선다(발주_게임모듈 G1 §4).
 * 판정은 조립기(`게임과제인가` — `task_snapshot.challenge_id`)가 진다: 여기 값을 베끼면
 * 팩 개정이 라우팅에 안 닿는다. */
import 교수멘탈화면 from './교수멘탈화면.js';
import { 게임과제인가 } from '../lib/게임제출.js';

/**
 * 「말하기」 — 학생 앱의 유일한 동사. 정본 = docs/말하기_설계.md
 * 세 호흡: ①듣기 → ②따라 말하기 → ③답하기. 90초 한 흐름, 화면 전환 없음.
 *
 * 디자인: 브랜드 정본 그대로 — 바탕 Navy 2 · 잉크 Cream · 신호 Coral 1점.
 * **코랄 = 녹음 버튼뿐이다.** R1(신호 1점·5% 미만)이 이 화면에서는 규칙이 아니라 구조다.
 */

const 호흡라벨 = { 듣기: '듣기', 따라: '따라 말하기', 답하기: '답하기' };
const 호흡번호 = { 듣기: '01', 따라: '02', 답하기: '03' };

/* 앱이 **요청하는** 녹음 설정. 상수로 뺀 이유는 두 곳이 같은 것을 봐야 하기 때문이다 —
 * 마이크 스트림과 `capture_meta.app`(그때 무엇을 요청했나 · C0 §4-2). 인라인으로 두면 한쪽만 바뀐다.
 *
 * 🔑 값을 여기서 정하지 않고 `음성헤더.정본` 에서 **파생**한다 — 규격은 서버가 검사하는 그 표
 *   하나뿐이어야 한다. 두 곳에 적으면 요청과 검사가 갈라지고, 갈라진 순간 규격 위반이 안 보인다.
 *
 * 🔴 옛 통로는 `RecordingPresets.HIGH_QUALITY`(m4a/AAC) 였다 — 손실 압축이 지운 발음 신호는
 *   원본이 없어 복원 경로가 0 이라(소급 불가 배선 ①), 컨테이너 인코더를 버리고 PCM 스트림을 받는다.
 */
const 녹음설정 = {
  sampleRate: 음성정본.sample_rate,
  channels: 음성정본.channels,
  encoding: 음성정본.bit_depth === 16 ? 'int16' : 'float32',
};

/** 요청한 설정을 **있는 그대로** 적는다 — 잰 값이 아니다(C0 §4-2 `capture_meta.app`). */
const 녹음요청 = () => ({
  platform: Platform.OS,
  os_version: String(Platform.Version ?? ''),
  extension: 'wav',
  sample_rate: 녹음설정.sampleRate,
  channels: 녹음설정.channels,
  bit_depth: 음성정본.bit_depth,
  bit_rate: null, // 무압축이라 비트레이트라는 개념이 없다 — 0 이 아니라 없음이다
  // 🔴 AGC 를 끄라고 **요청한 적이 없다.** `false` 로 적으면 그 행이 「off 였다」는 거짓 증거가 된다.
  //    `useAudioStream` 에는 그 손잡이가 없다(Android 는 AudioSource.MIC 로 연다).
  agc_requested: null,
});

function 초표시(ms) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/* 기기가 가진 한국어 음성 중 **품질이 높은 것**을 고른다. 기본값이 늘 좋은 게 아니라서 —
 * 안드로이드는 보통 한국어 음성을 여러 벌 갖고 있고 그중 하나만 `Enhanced` 다.
 * 🔑 못 고르면 그냥 기본값으로 읽는다. 여기서 막으면 「듣기」가 통째로 사라진다.
 * ⚠ 이건 기기 TTS 의 상한 안에서의 개선이다 — 사람 목소리에 가까워지는 것은 별개 트랙
 *   (문장이 굳은 뒤 배치로 미리 합성해 파일로 내려보내는 길). */
let 고른음성 = null;
async function 한국어음성() {
  if (고른음성 !== null) return 고른음성;
  try {
    const 목록 = await Speech.getAvailableVoicesAsync();
    const 한국어 = 목록.filter((v) => String(v.language || '').startsWith('ko'));
    const 좋은 = 한국어.find((v) => v.quality === Speech.VoiceQuality.Enhanced);
    고른음성 = ((좋은 || 한국어[0] || {}).identifier) || '';
  } catch {
    고른음성 = '';
  }
  return 고른음성;
}

export default function 말하기화면({
  급수 = 0, 토큰 = null, 학생번호 = null, 견줌 = null, 견줌다시읽기 = null,
}) {
  const 폴백 = useMemo(() => 급수편지(급수), [급수]);

  const [과제, set과제] = useState(null); // null = **아직 모른다**(빈 화면과 다른 상태다)
  const [게임항목, set게임항목] = useState(null); // 오늘 것이 G1 이면 그 배정 항목 — 게임 화면이 선다
  /* 서버가 준 `blocked` — **왜** 비었나(F176 ①). 아래 `녹음카드` 의 `막힘`(녹음이 시작되지
   * 못한 이유)과 이름이 겹치지 않게 `서버` 를 붙인다 — 같은 파일 안이라 헷갈리면 그대로 버그다. */
  const [서버막힘, set서버막힘] = useState(null);
  /* 🔑 같은 값을 **ref 로도** 쥔다 — 아래 `AppState` 리스너는 `[date, 토큰]` 으로 등록돼
   *   state 를 낡은 채 보고, 그 자리가 곧 큐를 미는 두 자리 중 하나다(`로그참조` 와 같은 이유). */
  const 막힘참조 = useRef(null);
  const [date, setDate] = useState(몽골날짜); // 서버가 답하면 **서버 날짜**로 바꾼다(아래)
  const [호흡, set호흡] = useState('듣기');
  const [로그, set로그] = useState([]);
  const [오류, set오류] = useState(null); // 「모름」을 「정상」으로 바꾸지 않는다 — 실패는 글자로 보인다
  const [저장경고, set저장경고] = useState(!지속저장());
  /* 되세우기 신호 — **자정을 넘겨 돌아온 복귀에서만** 올린다(아래 `AppState`). 이 값 하나가
     아래 초기화 효과의 「마운트 때 한 번」을 「새 날에 한 번 더」로 넓힌다. */
  const [세대, set세대] = useState(0);
  /* 🔑 로그의 **최신본은 ref 가 쥔다.** 전송은 배경에서 끝나므로, state 클로저로 쓰면
   *   「보내는 동안 학생이 다시 녹음」한 경우 나중에 끝난 쪽이 앞선 항목을 통째로 덮는다. */
  const 로그참조 = useRef([]);

  /** 로그를 갱신하고 기기에 쓴다 — 최신본은 언제나 `로그참조` 다. */
  const 로그갱신 = async (새로그) => {
    로그참조.current = 새로그;
    set로그(새로그);
    try {
      await 로그쓰기(새로그);
    } catch (e) {
      set오류('저장하지 못했어요: ' + String(e.message || e)); // 화면은 진행하되 실패를 숨기지 않는다
    }
  };

  /**
   * 항목 하나를 서버로 보내고 **결과를 그 항목에 적는다**(C0 §4-1).
   * 🔴 실패를 조용히 두지 않는다 — 사유가 화면에 서고 로그에도 남는다. 조용하면 학생도 우리도
   *   「말했으니 저장됐겠지」로 알고, 그 착각은 데이터가 없다는 걸 몇 주 뒤에 알게 만든다(P0 §4-1).
   */
  const 보내기 = async (항목) => {
    let r;
    try {
      r = await 발화보내기(토큰, 항목);
    } catch (e) {
      // 예상 못한 실패는 **재시도 대상**이다 — 원인을 모르는 것을 「소용없다」로 접지 않는다.
      r = { 오류: String((e && e.message) || e), 끝: false };
    }
    await 로그갱신(전송기록(로그참조.current, 항목.id, r));
    if (r.오류) {
      set오류(r.오류);
      return;
    }
    /* 🔴 **「내 목소리를 되들었다」 — c9 `content.viewed` 의 둘째 생산자**(절단문서 ①-2 의 마지막 값).
     *   여기가 **제출이 착지한 직후**인 것이 요건이다: 이 관측의 부모는 방금 생긴 그 제출 사건이라,
     *   녹음 화면에서 바로 보내면 부모가 아직 없어 서버가 `retryable:false` 로 접고 앱은 그것을
     *   `send_final` 로 적는다 — 재시도가 아니라 **영구 소멸**이다(`lib/오늘과제.js` 되듣기사건 머리말).
     * 🔑 되듣기는 **여기 한 곳**에서만 나간다 — 방금 낸 제출도, 사흘 밀렸다가 올라간 제출도 같은
     *   통로를 지난다(`밀린것` 재전송이 이 함수를 그대로 부른다). 화면 쪽에 붙이면 offline 로 밀린
     *   항목의 되듣기는 영영 안 나간다.
     * 🔑 실패해도 화면에 오류를 안 세운다 — 학생이 **한 일**이 아니라 우리가 **잰 것**이다(열람과 같은 규칙). */
    await 되듣기보내기({ ...항목, event_id: r.event_id });
  };

  /**
   * 되듣기 관측 하나를 보내고 **결과를 그 항목에 적는다**(전층감사 §2-7).
   *
   * 🔴 적는 것이 이 함수의 존재 이유다 — 전에는 보내고 결과를 버렸고, 그래서 실패한 되듣기는
   *   **다시 볼 자리가 없었다**(`밀린것` 은 제출이 안 닿은 것만 고르는데, 되듣기는 제출이 닿은
   *   뒤에야 생긴다). 회선이 끊긴 한 번이 곧 영구 소멸이었다.
   * 🔑 키는 항목에서 파생하므로(`되듣기사건`) 다시 보내도 서버가 `duplicate` 로 접는다.
   * 🔑 실패해도 화면에 오류를 세우지 않는다 — 학생이 **한 일**이 아니라 우리가 **잰 것**이다.
   */
  const 되듣기보내기 = async (항목) => {
    const 사건 = 되듣기사건(항목, 항목.event_id);
    if (!사건) return;
    let r;
    try {
      r = await 사건보내기(토큰, 사건);
    } catch (e) {
      // 제출과 같은 규칙 — 원인을 모르는 실패를 「소용없다」로 접지 않는다.
      r = { 오류: String((e && e.message) || e), 끝: false };
    }
    await 로그갱신(되듣기기록(로그참조.current, 항목.id, r));
  };

  /**
   * 고름 하나를 보내고 **결과를 그 항목에 적는다**(`choice.selected` · 성향 축 ⑤의 유일한 입구).
   *
   * 🔴 **되듣기와 달리 제출 착지를 안 기다린다** — 이 관측은 부모가 없다. 학생이 보기를 고른 것은
   *   그 자체로 완결된 사실이고, 한 앉음과의 연결은 `correlation_id` 가 진다. 제출에 매달면
   *   WAV 가 못 올라가는 날(회선·용량) 그날의 «무엇에 끌렸나»까지 함께 죽는데, 그건 소급이 없다.
   * 🔑 키는 항목에서 판다(`선택사건` — `:choice`). 다시 보내도 서버가 `duplicate` 로 접는다.
   * 🔑 실패해도 화면에 오류를 세우지 않는다 — 학생이 **한 일**이 아니라 우리가 **잰 것**이다
   *   (열람·되듣기와 같은 규칙).
   */
  const 선택보내기 = async (항목) => {
    const 사건 = 선택사건(항목);
    if (!사건) return;
    let r;
    try {
      r = await 사건보내기(토큰, 사건);
    } catch (e) {
      // 제출과 같은 규칙 — 원인을 모르는 실패를 「소용없다」로 접지 않는다.
      r = { 오류: String((e && e.message) || e), 끝: false };
    }
    await 로그갱신(선택기록(로그참조.current, 항목.id, r));
  };

  /* 밀린 것을 순서대로 민다 — **부르는 자리가 둘이다**(마운트 · 배경에서 복귀). 한 함수로 둬야
   *   「각 항목이 자기 `task_meta` 를 들고 간다」는 규약이 두 자리로 갈라지지 않는다.
   * 🔑 `살아있나` 를 인자로 받는 이유는 두 자리의 옳은 답이 다르기 때문이다 — 마운트 쪽은 화면이
   *   사라지면 멈춰야 하고(다음 화면에서 또 밀게 된다), 복귀 쪽은 이미 시작한 전송을 끝까지
   *   보내는 편이 옳다(기기 저장은 이미 끝났고, 중간에 접으면 그 항목이 다음 열림까지 밀린다). */
  const 밀린것보내기 = async (살아있나 = () => true) => {
    /* 🔑 **고름을 먼저 민다.** 제출 루프는 WAV 업로드를 끼고 있어 몽골 회선에서 몇십 초씩 걸리고,
     *   그 사이 화면이 사라지면 `살아있나()` 가 false 가 되어 뒤에 있는 것은 통째로 밀린다.
     *   고름은 부모가 없는 작은 POST 라 언제 나가도 되고, 늦게 둘 이유가 없다. */
    for (const e of 선택보낼것(로그참조.current, 막힘참조.current)) {
      if (!살아있나()) return;
      await 선택보내기(e);
    }
    for (const e of 보낼것(로그참조.current, 막힘참조.current)) {
      if (!살아있나()) return;
      await 보내기(e);
    }
    /* 🔑 **되듣기는 별도 쓸이다**(전층감사 §2-7). 위 큐가 고르는 것은 「제출이 아직 안 닿은 것」이라,
     *   제출은 닿았는데 되듣기만 실패한 항목은 **원리상 저 목록에 없다** — 그 자리가 이 관측을
     *   일회성 발사로 만들던 구멍이다. 목록을 여기서 다시 읽으므로 방금 위에서 착지한 것도 포함된다. */
    for (const e of 되듣기보낼것(로그참조.current, 막힘참조.current)) {
      if (!살아있나()) return;
      await 되듣기보내기(e);
    }
  };

  useEffect(() => {
    let 살아있음 = true;
    (async () => {
      /* 🔴 **새 날이면 열람 관측도 새것이다**(아래 `열람` 은 렌더가 끝난 뒤 이 몸통이 돌 때 이미
       *   섰다). 안 비우면 어제 「보냈다」고 적힌 표시가 남아 오늘의 ①듣기 열람이 영영 안 나간다 —
       *   「그날 열었는가」는 그날에만 존재해서 소급이 없다. 마운트 때는 이미 빈 값이라 무해하다. */
      열람.current = { 사건: null, 보냈다: false };
      let 기록 = [];
      try {
        const r = await 로그읽기();
        기록 = r.로그;
        if (!살아있음) return;
        로그참조.current = 기록;
        set로그(기록);
        if (r.깨진줄 > 0) set오류(`저장된 기록 중 ${r.깨진줄}줄을 읽지 못했다`);
      } catch (e) {
        if (살아있음) set오류(String(e.message || e));
      }

      /* 오늘 낼 것을 **서버에서** 받는다(C0 §4-3 ①). 못 받아도 화면은 선다 —
       * 고정 과제로 내려가되 그 사실을 글자로 낸다(`화면과제` 가 사유를 함께 낸다). */
      let 결과;
      /* 🔴 서버를 못 받은 갈래의 날짜도 **몽골 달력**이다(절단문서 ①-14). 기기 시계로 끊으면
       *   시간대가 어긋난 폰에서 `제출로그.다음시도번호` 가 남의 날 바구니를 세고, 그 값이
       *   `attempt_no` 로 **서버에 실려 나간다** — 첫 시도가 재시도로 저장되면 사후에 못 고친다.
       *   `몽골날짜` 는 기기의 *시각*은 그대로 쓰되 *시간대*만 tzdata 로 바로잡는다. */
      let 그날 = 몽골날짜();
      try {
        if (!토큰) throw new Error('토큰 없음');
        const { 항목, 막힘 } = await 오늘과제받기(토큰);
        /* 🔴 **큐를 세우는 자리다** — 아래 `밀린것보내기` 가 이 값을 보고 멈춘다. 막힌 학생의
         *   발화를 보내면 서버가 `CONSENT_MISSING`(`retryable:false`)으로 접고 앱은 그것을
         *   `send_final` 로 적어 다시 못 보낸다 = 동의가 서는 날 나갈 수 있었던 발화가 죽는다.
         *   화면은 `서버막힘` 으로 막지만 그건 **렌더 층**뿐이고 이 효과는 그대로 이어 돈다.
         * 🔑 ref 는 `살아있음` 과 무관하게 적는다 — 화면이 사라져도 복귀 리스너는 산다. */
        막힘참조.current = 막힘;
        if (살아있음) set서버막힘(막힘);
        /* 🔑 새 날 되세움에서도 **양쪽을 적는다**(아래 `set호흡` 과 같은 이유) — 어제가 게임이고
         * 오늘이 말하기면 비워져야 오늘 화면이 선다. G1 항목은 `화면과제` 가 못 읽는 모양이라
         * (호흡 배열이 없다) 아래 폴백으로 내려가지만, 렌더는 이 값이 먼저 받는다. */
        if (살아있음) set게임항목(게임과제인가(항목) ? 항목 : null);
        결과 = 화면과제(항목, 폴백);
        // 🔴 날짜의 정본은 **서버**다 — 기기 시계로 끊으면 몽골 아침에 어제 것이 오늘이 된다.
        //   로그 키까지 여기서 맞춰 둬야 「학습 출석」과 서버 배정이 같은 날을 가리킨다.
        if (항목 && 항목.task_snapshot && 항목.task_snapshot.날짜) 그날 = String(항목.task_snapshot.날짜);
      } catch (e) {
        /* 못 받은 날의 게임 항목은 비운다 — 어제 것이 남으면 새 날 되세움이 남의 날 게임을 그린다. */
        if (살아있음) set게임항목(null);
        결과 = 화면과제(null, 폴백);
        결과.사유 = 토큰
          ? `오늘 과제를 받지 못했어요 — ${String(e.message || e)}`
          : '오늘 과제를 받지 못했어요';
      }
      if (!살아있음) return;
      set과제(결과);
      setDate(그날);
      /* 🔴 **양쪽을 다 적는다.** 「냈으면 완료」만 적으면 새 날에 되세울 때 어제의 `완료` 가
       *   그대로 남아, 오늘 낼 것이 있는데도 화면은 완료 카드다(= 이 리스너를 만든 그 갇힘).
       *   마운트 때는 이미 `듣기` 라 무해하다 — 갈래를 하나 지우는 대신 둘을 적는다. */
      set호흡(학습출석(기록, 그날) ? '완료' : '듣기');

      // 마이크 권한은 여기서 묻지 않는다 — 녹음 버튼을 누를 때 묻는다(lib/마이크권한.js).
      // 여기서 켜는 건 재생뿐이다: 무음 스위치가 켜진 폰에서도 ①듣기가 들려야 한다.
      try {
        await setAudioModeAsync({ playsInSilentMode: true });
      } catch (e) {
        if (살아있음) set오류('소리를 준비하지 못했어요: ' + String(e.message || e));
      }

      /* 🔑 **밀린 것을 여기서 올린다** — 몽골 회선에서 제출 순간 전송이 실패하는 것은 예외가
       *   아니라 상시다. 재시도가 없으면 그 발화는 기기에만 남고, 앱을 지우는 날 사라진다.
       *   순서 그대로 보낸다(각 항목이 자기 `task_meta` 를 들고 있어 며칠 밀려도 정확하다). */
      await 밀린것보내기(() => 살아있음);
    })();
    return () => {
      살아있음 = false;
    };
  }, [폴백, 토큰, 세대]);

  /* 🔴 **배경에서 돌아온 자리** — 이 리스너가 없어서 앱을 켠 채 자정을 넘긴 학생은 어제의 완료
   *   카드에 갇혔고, 앱을 완전히 죽이지 않으면 오늘 제출을 할 수 없었다(안드로이드에서 백그라운드
   *   앱은 며칠 산다). 밀린 큐도 마운트 한 자리에서만 나가, 회선이 붙어도 화면을 새로 열지 않으면
   *   안 올라갔다 — `도착확인` 화면의 「말하기 화면을 한 번 열어 주세요」가 그래서 반쯤 거짓이었다.
   * 🔑 판정은 `복귀행동`(순수)이 진다 — 화면 안에 조건을 적으면 회귀가 자정을 만들 수 없다.
   * 🚫 무조건 되세우지 않는다: 사전을 찾으러 나갔다 온 학생의 호흡이 ③답하기에서 ①듣기로
   *   되돌아가고, 그 일은 자정 넘김보다 훨씬 자주 일어난다. */
  useEffect(() => {
    const 구독 = AppState.addEventListener('change', (상태) => {
      if (상태 !== 'active') return;
      const 할일 = 복귀행동(date, 몽골날짜(), 보낼것(로그참조.current, 막힘참조.current).length);
      if (할일 === '재초기화') set세대((n) => n + 1);
      else if (할일 === '밀린것') 밀린것보내기();
    });
    return () => 구독.remove();
  }, [date, 토큰]);

  const 편지 = 과제 ? 과제.편지 : 폴백;

  /* 한 앉음 = 한 `correlation_id` (P0 §3-1 ④). ②따라와 ③답하기, 그 사이 재시도·무발화까지
   * 같은 값을 든다 — 이 화면이 곧 「한 흐름」이라 그 경계를 아는 곳은 여기뿐이다(서버는 못 안다).
   * 🔑 날짜가 바뀌면 새 흐름이다: 앱을 켠 채 자정을 넘긴 학생의 어제와 오늘이 한 덩어리가
   *   되지 않게. 반대로 같은 날 다시 열면 **새 앉음**이 맞다(마운트가 곧 그 경계다). */
  const 흐름 = useRef({ date: null, id: null });
  const 흐름잡기 = (그날) => {
    if (흐름.current.date !== 그날) 흐름.current = { date: 그날, id: 흐름id() };
    return 흐름.current.id;
  };

  const 기록추가 = async (항목입력) => {
    const { 로그: 새로그, 항목 } = 항목추가(로그참조.current, {
      ...항목입력,
      // 그때 서버가 준 봉투 재료와 그때 요청한 녹음 설정을 **항목이 들고 간다**(C0 §4-1 · §4-2).
      task_meta: 과제 ? 과제.제출재료 : null,
      capture_app: 녹음요청(),
      correlation_id: 흐름잡기(항목입력.date),
    });
    await 로그갱신(새로그);
    /* 🔑 **전송을 기다리지 않는다.** 업로드는 회선에 따라 수 초가 걸리고, 기다리면 「다시 말하기」를
     *   누른 학생 앞에서 화면이 멈춘다. 기기 저장은 이미 끝났으니 데이터는 그 사이에도 안전하다.
     * 🔴 **고름이 먼저이고, 둘은 순차다.** 두 전송이 각자 끝나면서 `로그참조` 를 읽어 쓰므로
     *   나란히 띄우면 나중에 끝난 쪽이 앞 결과를 덮을 수 있다(같은 항목의 다른 칸인데도).
     *   순차로 묶으면 그 경쟁이 원리상 없고, 화면은 여전히 안 기다린다 — 이 즉시실행 함수를
     *   `await` 하지 않기 때문이다. 고름이 앞인 이유는 `밀린것보내기` 와 같다(작고 부모가 없다). */
    (async () => {
      await 선택보내기(항목);
      await 보내기(항목);
    })();
    return 새로그;
  };

  /* 🔴 **「①듣기를 실제로 들었다」 — c9 `content.viewed` 의 생산자**(절단문서 ①-2·①-12).
   *   `intervention.delivered` 는 전날 밤 배치의 **추정**이라(`lib/사건출처.js` 가 `inferred` 로
   *   박아 둔 자리) 관측 짝이 없으면 네트워크 실패가 「전달 완료」로 학습된다. 그 짝이 여기다.
   *   소급 불가 — 「그날 열었는가」는 그날에만 존재한다.
   * 🔑 사건은 **한 번 만들어 쥔다.** 재전송은 그 객체를 그대로 보내므로(같은 멱등키) 회선이
   *   끊겨도 같은 열람이 여러 벌 쌓이지 않는다 — 서버가 `duplicate` 로 접는다.
   * 🔑 실패해도 화면에 오류를 세우지 않는다. 이건 학생이 **한 일**이 아니라 우리가 **잰 것**이라,
   *   말하기 흐름 한복판에 학생 책임이 아닌 붉은 글자를 세우면 안 된다. 대신 보냈다는 표시를
   *   안 남겨, 다시 들으면 **같은 사건**이 다시 나간다(조용한 실패를 성공으로 적지 않는다). */
  const 열람 = useRef({ 사건: null, 보냈다: false });
  const 열람알리기 = async () => {
    if (!과제 || 열람.current.보냈다) return;
    if (!열람.current.사건) {
      열람.current.사건 = 열람사건({
        parent_event_id: 과제.intervention_event_id,
        idempotency_key: 흐름id(),
        correlation_id: 흐름잡기(date),
        // 제출과 **같은 값**을 든다. 배정이 급수를 안 실은 날은 `null` 이 유일하게 정확하다(§4-3 ① ⓑ).
        level_snapshot: 과제.제출재료 ? 과제.제출재료.level_snapshot : null,
      });
    }
    // 가리킬 배달이 없으면 안 보낸다 — 폴백 날, 그리고 배달 사건 행을 못 찾은 배정.
    if (!열람.current.사건) return;
    const r = await 사건보내기(토큰, 열람.current.사건);
    if (!r.오류) 열람.current.보냈다 = true;
  };

  /* 🔴 **막힌 학생에게는 흐름을 아예 열지 않는다.** 열어 두면 90초를 말하고 나서 업로드가
   *   403 으로 죽고, 그 발화는 어디에도 안 남는다 — 학생 눈엔 「했는데 사라졌다」다.
   *   배정이 있어도 같다(배정 뒤 철회한 학생은 과제를 보면서 업로드만 막힌다).
   * 🔑 분기를 카드마다 다는 대신 여기서 한 번에 끊는다 — 호흡은 앞으로도 늘어나고,
   *   늘어난 쪽에 조건을 빠뜨리면 그 구멍은 「통과」로 보인다. */
  if (서버막힘) {
    return (
      <ScrollView style={s.wrap} contentContainerStyle={s.inner}>
        <머리 호흡={호흡} />
        {오류 && <Text style={s.오류}>{오류}</Text>}
        <막힘카드 막힘={서버막힘} 학생번호={학생번호} />
      </ScrollView>
    );
  }

  /* G1 갈래 — 막힘 검사 **뒤**다(막힌 학생에게는 게임도 열지 않는다 · 위와 같은 이유).
   * key={date} 라 새 날 되세움이 곧 새 앉음이다(마운트가 앉음의 경계 — 위 `흐름잡기` 와 같은 축). */
  if (게임항목) {
    return <교수멘탈화면 key={date} 항목={게임항목} 토큰={토큰} 학생번호={학생번호} 막힘={서버막힘} />;
  }

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
      <머리 호흡={호흡} />
      {저장경고 && (
        <Text style={s.경고}>웹 미리보기 — 기록이 기기에 남지 않아요. 실사용은 앱에서.</Text>
      )}
      {오류 && <Text style={s.오류}>{오류}</Text>}
      {/* 🔴 고정 과제로 내려간 사실을 숨기지 않는다 — 조용히 내려가면 배치가 며칠 안 돌아도
          화면은 늘 멀쩡해 보인다(P0 §4-1 「막힌 것이 통과한 것처럼 보이는 상태」). */}
      {과제 && 과제.출처 === '고정' && <Text style={s.메모}>{과제.사유} · 오늘은 연습 문장으로 해요</Text>}

      {!과제 && <불러오는중 />}

      {과제 && 호흡 === '듣기' && (
        <듣기카드
          편지={편지}
          라벨={과제.출처 === '서버' ? '오늘의 문장이에요' : '편지가 왔어요'}
          들었음알리기={열람알리기}
          다음={() => set호흡('따라')}
        />
      )}

      {호흡 === '따라' && (
        <녹음카드
          key="따라"
          step="따라"
          제시문={편지.핵심문장}
          안내="이 문장을, 신호가 끝나면 따라 말해요"
          date={date}
          로그={로그}
          기록추가={기록추가}
          완료={() => set호흡(다음호흡('따라'))}
          prompt_id={편지.id}
        />
      )}

      {호흡 === '답하기' && (
        <녹음카드
          key="답하기"
          step="답하기"
          제시문={편지.질문}
          안내="이번엔 내 말로 답해요"
          선택지={편지.선택지}
          선택차원={편지.선택차원}
          텍스트병기
          date={date}
          로그={로그}
          기록추가={기록추가}
          완료={() => set호흡('완료')}
          prompt_id={편지.id}
        />
      )}

      {호흡 === '완료' && (
        <완료카드 로그={로그} date={date} 견줌={견줌} 견줌다시읽기={견줌다시읽기} />
      )}
    </ScrollView>
  );
}

/* ── 머리: 진행 표시 — 위계는 밀도로(R2), 점 셋과 라벨 하나 ── */
function 머리({ 호흡 }) {
  const 순서 = ['듣기', '따라', '답하기'];
  const idx = 호흡 === '완료' ? 3 : 순서.indexOf(호흡);
  return (
    <View style={s.머리}>
      <Text style={s.브랜드}>SYNK TALK</Text>
      <Text style={s.제목}>오늘의 말하기</Text>
      <View style={s.진행줄}>
        {순서.map((k, i) => (
          <View key={k} style={s.진행칸}>
            <View style={[s.점, i <= idx - 0 && i < idx ? s.점_지남 : i === idx ? s.점_현재 : null]} />
            <Text style={[s.점라벨, i === idx && s.점라벨_현재]}>{호흡라벨[k]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ── 불러오는 동안 ──────────────────────────────────────────────
 * 스피너를 두지 않는다. 이 화면의 신호(코랄)는 녹음 버튼 하나뿐이고(테마 `신호자리`),
 * 도는 것이 하나 더 생기면 눈이 그리로 간다. 카드 자리를 그대로 잡아 두면 도착했을 때
 * 레이아웃이 안 튄다 — 위계는 움직임이 아니라 밀도로. */
function 불러오는중() {
  return (
    <View style={s.카드}>
      <Text style={s.카드라벨}>01</Text>
      <Text style={s.불러오는글}>오늘 온 말을 가져오는 중이에요…</Text>
    </View>
  );
}

/* ── ① 듣기 ── */
function 듣기카드({ 편지, 라벨 = '편지가 왔어요', 다음, 들었음알리기 }) {
  const [읽는중, set읽는중] = useState(false);
  const [들었다, set들었다] = useState(false);

  const 재생 = async () => {
    set읽는중(true);
    Speech.stop();
    const voice = await 한국어음성();
    Speech.speak(편지.본문, {
      language: 'ko-KR',
      rate: 0.92,
      ...(voice ? { voice } : {}),
      onDone: () => {
        set읽는중(false);
        set들었다(true);
        /* 🔴 **여기가 관측이다** — 낭독이 끝까지 간 것만 「귀에 닿았다」로 센다(c9).
         *   아래 `onError` 에는 안 붙인다: 흐름은 안 막지만(본문이 화면에 있다) 귀에 닿은 것은
         *   없어서, 거기서 내면 「들었다」가 「띄웠다」로 조용히 뜻을 갈아탄다. */
        if (들었음알리기) 들었음알리기();
      },
      onError: () => {
        set읽는중(false);
        set들었다(true); // 재생이 안 되는 기기에서도 흐름은 막지 않는다 — 본문이 화면에 있다
      },
    });
  };

  useEffect(() => () => Speech.stop(), []);

  return (
    <View style={s.카드}>
      <Text style={s.카드라벨}>{호흡번호.듣기} · {라벨}</Text>
      <Text style={s.편지문}>{편지.본문}</Text>
      <Pressable onPress={재생} style={({ pressed }) => [s.보조버튼, pressed && s.눌림]}>
        <Text style={s.보조버튼글}>{읽는중 ? '읽는 중…' : '♪ 들어보기'}</Text>
      </Pressable>
      <Pressable
        onPress={다음}
        style={({ pressed }) => [s.주버튼, !들었다 && s.주버튼_대기, pressed && s.눌림]}
      >
        <Text style={s.주버튼글}>{들었다 ? '다 들었어요' : '듣지 않고 넘어가기'}</Text>
      </Pressable>
    </View>
  );
}

/* 경과 시계 — `latency_ms` 를 재는 **유일한** 자리다(`lib/선택로그.js` 머리말).
 * 🔴 `Date.now()` 로 재지 않는다: 두 벽시계 시점의 차는 그 사이 시각 동기화·타임존 변경이
 *   음수나 몇 시간짜리 값을 만들고, 그 행은 오류가 아니라 «아주 오래 망설인 학생»으로 읽힌다.
 * 🔑 `performance` 가 없는 런타임이면 `null` 을 낸다 — 그러면 조립기가 `latency_ms: null`
 *   (「안 쟀다」)로 접는다. 0 으로 접으면 «즉답»이 되어 확신도 축이 조용히 거짓이 된다. */
const 경과시계 = () =>
  (typeof performance !== 'undefined' && performance && typeof performance.now === 'function'
    ? performance.now() : null);

/* ── ②③ 녹음 — 코랄이 사는 유일한 곳 ── */
function 녹음카드({ step, 제시문, 안내, 선택지, 선택차원, 텍스트병기, date, 로그, 기록추가, 완료, prompt_id }) {
  /* 🔴 **표시 순서를 마운트 때 한 번 확정한다.** 추천을 늘 첫째에 두면 「1번을 습관적으로 누르는
   *   손버릇」과 「그 선택지를 좋아함」이 영원히 같은 모양이 되므로 자리를 섞고, 섞은 그 순서를
   *   행에 그대로 남긴다(`lib/선택로그.보기세우기`). 매 렌더 다시 섞으면 학생 눈앞에서 보기가
   *   춤추고, 무엇보다 **행에 적힌 자리와 학생이 실제로 본 자리가 갈린다** — 그 갈림은 증상이 없다.
   * 🔑 추천은 `null` 이다 — 고정 선택지 2개는 아무것도 밀지 않는다(P0 §275 의 엔진 무응답 동작).
   *   「밀지 않았다」를 정직하게 적는 것이 이 칸의 값이고, 없는 추천을 지어내면 「선호」와
   *   「밀어준 것」을 가르려던 축이 통째로 거짓이 된다. */
  const [보기] = useState(() => 보기세우기(선택지 || [], null));
  const [고른것, set고른것] = useState(null);
  /* 마음을 바꾼 **횟수**를 센다 — 계약이 받는 것은 여부(`changed_selection`)뿐이라 조립기가 접는다.
   * ref 인 이유: 이 값이 화면을 바꾸지 않는다(리렌더를 부를 이유가 없다). */
  const 바꾼횟수 = useRef(0);
  const 보기뜬때 = useRef(경과시계());
  const [단계, set단계] = useState('대기'); // 대기 | 녹음중 | 확인 | 무발화
  const [녹음, set녹음] = useState(null); // { uri, 바이트, duration_ms, hesitation_ms, spoke }
  const [경과, set경과] = useState(0); // 녹음중 타이머 — 스트림이 알려 준 시각
  const [병기글, set병기글] = useState('');
  const [듣는중, set듣는중] = useState(false);
  const [막힘, set막힘] = useState(null); // 녹음이 시작되지 못한 이유 — 버튼 옆에 글자로 선다
  const [끊김, set끊김] = useState(false); // 배경으로 나가 녹음이 중간에 멈췄다 — 아래 `AppState`
  const 추적 = useRef(null);
  const 플레이어 = useRef(null);
  /* 🔴 「내 목소리 듣기」 관측 — **여기서 보내지 않는다**(절단문서 ①-2 의 마지막 값).
   *   이 관측의 부모는 아직 만들어지지도 않은 자기 제출 사건이라, 지금 보내면 부모 없는 사건으로
   *   `retryable:false` 거절 → `send_final` = 그 한 건 영구 소멸이다. 시각만 쥐고 항목에 실어 보낸다.
   * 🔑 여러 번 들어도 **한 관측**이다 — 첫 완주 시각만 남긴다(횟수는 이 사건이 답할 질문이 아니고,
   *   다시 말하기는 `attempt` 로 이미 남는다 · P0 S1-7). */
  const 되들은때 = useRef(null);
  const 조각들 = useRef([]); // 마이크가 준 PCM 조각. 원본이 여기 말고 어디에도 없다.
  const 실규격 = useRef(null); // 🔴 스트림이 **보고한** 값 — 요청값과 다를 수 있다(폴백)

  /* 마이크 → PCM 조각 + 머뭇거림 표본(설계 §5: 확신도의 대체물).
   * 🔑 조각과 세기를 같은 자리에서 받는다 — 옛 통로는 녹음기의 `metering` 을 따로 폴링했는데,
   *   PCM 스트림에는 그 칸이 없어 우리가 같은 눈금(dBFS)으로 잰다(`세호흡.데시벨`). */
  const { stream } = useAudioStream({
    sampleRate: 녹음설정.sampleRate,
    channels: 녹음설정.channels,
    encoding: 녹음설정.encoding,
    onBuffer: (buf) => {
      if (!buf || !buf.data) return;
      const 조각 = new Uint8Array(buf.data);
      조각들.current.push(조각);
      실규격.current = { sample_rate: buf.sampleRate, channels: buf.channels };
      const t_ms = Math.round((buf.timestamp || 0) * 1000);
      set경과(t_ms);
      if (추적.current) 추적.current.표본(t_ms, 데시벨(조각));
    },
  });

  useEffect(
    () => () => {
      if (플레이어.current) {
        플레이어.current.remove();
        플레이어.current = null;
      }
    },
    []
  );

  const 시작 = async () => {
    set막힘(null);
    // 권한은 「지금」 묻는다 — 학생이 무엇을 하려는지 아는 순간에.
    const 준비 = await 마이크준비({
      권한요청: () => AudioModule.requestRecordingPermissionsAsync(),
      오디오모드: setAudioModeAsync,
    });
    if (!준비.ok) {
      set막힘(준비.메시지);
      return;
    }
    try {
      set끊김(false);
      추적.current = 머뭇거림추적();
      조각들.current = [];
      실규격.current = null;
      set경과(0);
      await stream.start();
      set단계('녹음중');
    } catch (e) {
      set단계('대기');
      set녹음(null);
      set막힘('녹음을 시작하지 못했어요: ' + String(e.message || e));
    }
  };

  const 끝 = async () => {
    stream.stop();
    await 마이크끄기({ 오디오모드: setAudioModeAsync }); // 바로 뒤 「내 목소리 듣기」가 작게 들리지 않도록

    /* 조각이 하나도 안 왔다 = 시작하자마자 멈춘 것. 무발화도 데이터라(설계 §3-4) 오류로 접지 않는다. */
    if (조각들.current.length === 0 || !실규격.current) {
      set녹음({ uri: null, 바이트: null, duration_ms: 0, hesitation_ms: 0, spoke: false });
      set단계('무발화');
      return;
    }

    /* 🔴 헤더는 **스트림이 보고한 값**으로 쓴다. 기기가 16kHz 를 못 주면 네이티브가 조용히
     *   폴백하는데, 요청값을 적으면 그 파일이 자기가 무엇인지 거짓말하게 된다(`lib/wav조립.js`). */
    let 조립 = null;
    try {
      조립 = wav조립({
        조각들: 조각들.current,
        sample_rate: 실규격.current.sample_rate,
        channels: 실규격.current.channels,
        bit_depth: 음성정본.bit_depth,
      });
    } catch (e) {
      set단계('대기');
      set녹음(null);
      set막힘('녹음을 담지 못했어요: ' + String(e.message || e));
      return;
    }

    const duration_ms = 조립.duration_ms;
    const r = 추적.current ? 추적.current.결과(duration_ms) : { 발화있음: true, 머뭇거림_ms: 0 };

    /* 「내 목소리 듣기」는 uri 로만 연다. 최종 이름은 시도 번호가 붙어야 정해지므로(`남기기`)
     * 여기서는 호흡별 임시 이름에 쓴다. 실패해도 **바이트는 메모리에 그대로** 있어 제출은 산다. */
    let uri = null;
    try {
      uri = await 음성쓰기(조립.바이트, `임시-${step}.wav`);
    } catch (_) {
      uri = null;
    }

    set녹음({ uri, 바이트: 조립.바이트, duration_ms, hesitation_ms: r.머뭇거림_ms, spoke: r.발화있음 });
    set단계(r.발화있음 ? '확인' : '무발화');
  };

  /* 🔴 **배경으로 나가면 마이크가 끊긴다 — 그런데 화면은 계속 '녹음중'이었다.**
   *   `app.json` 은 배경 오디오를 선언하지 않는다(할 것도 아니다 — 학생 앱이 몰래 듣는 모양이
   *   된다). 그래서 전화가 오거나 사전을 찾으러 나간 순간 `onBuffer` 가 멈추고, 돌아와 「다 말했으면
   *   탭해서 마쳐요」를 누른 학생은 **잘린 발화를 온전한 것으로** 낸다. 그 파일은 자기가 멀쩡하다고
   *   말한다 — 헤더를 담긴 조각으로 쓰므로 길이까지 앞뒤가 맞고, 사후에 절단을 가려낼 수가 없다.
   * 🔑 그래서 나가는 그 순간 끊고 **담긴 것은 그대로 둔다** — 학생 원본은 버리지 않는다(규약 §4).
   *   판단은 학생에게 준다: 들어 보고 「다시 말하기」나 「보내기」를 고른다.
   * 🚫 `inactive` 로는 끊지 않는다 — 알림 센터를 내리거나 앱 전환기를 훑는 것까지 녹음을 죽인다.
   *   마이크가 실제로 멈추는 상태는 `background` 다. */
  useEffect(() => {
    const 구독 = AppState.addEventListener('change', (상태) => {
      if (상태 !== 'background' || 단계 !== '녹음중') return;
      set끊김(true);
      끝();
    });
    return () => 구독.remove();
  }, [단계, stream]);

  /* 같은 것을 다시 눌러도 «바꿈»이 아니다 — 취소가 아니라 확인이다(보기가 둘뿐이라
   * 마음을 바꾸는 길은 «다른 것을 누르는 것» 하나다). */
  const 고르기 = (option_id) => {
    if (고른것 === option_id) return;
    if (고른것 !== null) 바꾼횟수.current += 1;
    set고른것(option_id);
  };

  const 남기기 = async (status) => {
    const attempt = 다음시도번호(로그, date, step);
    let audio = null;
    if (녹음 && 녹음.바이트) {
      try {
        audio = await 음성쓰기(녹음.바이트, `${date}-${step}-${attempt}.wav`);
      } catch (_) {
        audio = null; // 파일 보관 실패 — 로그에는 null 로 정직하게 남는다
      }
    }
    /* 되듣기 관측은 **이 시도의 것**이다 — 넘겨 주고 비운다. 안 비우면 다음 시도가 남의 되듣기를
     *   자기 것으로 물려받아, 「듣고 다시 말했다」와 「그냥 다시 말했다」가 다시 한 모양이 된다. */
    const replayed_at = 되들은때.current;
    되들은때.current = null;

    /* 🔴 **고름은 앉음이 끝날 때 한 번만 실린다.** 「다시 말하기」(`retried`)로 시도가 셋이 되어도
     *   학생이 고른 것은 하나다 — 시도마다 실으면 `choice.selected` 가 시도 수만큼 나가고, ⑤축의
     *   분포가 «많이 다시 말한 학생»쪽으로 통째로 기운다. 그 행들은 서로 다른 멱등키를 들어서
     *   서버도 못 접는다(`:choice` 키가 항목마다 다르다).
     * 🔑 비울 필요가 없는 것이 `되들은때` 와 갈리는 자리다 — `retried` 만 이 카드를 살려 두고,
     *   `submitted`·`abandoned` 는 곧 카드가 사라진다(`완료()`).
     * 🔴 **안 고른 채 말한 학생의 행도 이제 나간다**(2026-08-10 · 계약이 열렸다). 그전까지는
     *   `payload.position` 이 값으로 필수라 `skipped` 갈래가 원리상 검증을 못 지났고, 그래서
     *   여기도 `고른것` 이 있을 때만 조립했다 — **「보기를 봤는데 아무것도 안 골랐다」는 관측이
     *   통째로 없었다.** 그건 성향 축에서 「무관심」이고, 「뚜렷한 거절」과 정반대 신호다.
     * 🔑 조건이 `보기` 인 것이 핵심이다 — 보기가 **화면에 떴을 때만** 「안 골랐다」가 뜻을 갖는다.
     *   보기가 없는 날(급수 3 이상·자유발화)은 고를 것이 없었으니 사건도 없다.
     * 🚫 여기서 0 이나 -1 로 지어내지 않는다 — 그러면 「안 골랐다」가 「첫째를 골랐다」로 적히고,
     *   그 오독은 어디서도 안 빨개진다(조립기가 `null` 로 두고, 검증기 ⑦ 이 지어낸 값을 막는다). */
    const 마침 = status !== 'retried';
    let 선택 = null;
    let 선택때 = null;
    if (마침 && 보기) {
      선택 = 선택payload({
        /* 🔴 **서버가 낸 축을 그대로 넘긴다** — 화면이 문자열을 박으면 서버가 낸 보기와 앱이
         *   붙인 축이 갈리고, 갈린 행은 어디서도 안 빨개진다. 옛 배정 행에는 이 칸이 없어
         *   `null` 이 오고, 그건 「모른다」의 명시라 조립기가 통과시킨다(사건은 산다). */
        차원: 선택차원 ?? null,
        보기,
        고른것,
        시작: 보기뜬때.current,
        끝: 경과시계(),
        바꾼횟수: 바꾼횟수.current,
      });
      // 조립이 계약을 못 지키면 `null` 이다 — 그때는 때도 안 적는다(못 보낼 것을 큐에 안 남긴다).
      if (선택) 선택때 = new Date().toISOString();
    }

    return 기록추가({
      date,
      step,
      status,
      replayed_at,
      선택,
      선택때,
      duration_ms: 녹음 ? 녹음.duration_ms : 0,
      hesitation_ms: 녹음 ? 녹음.hesitation_ms : 0,
      spoke: 녹음 ? 녹음.spoke : false,
      threshold_db: 발화문턱_DB,
      text: 텍스트병기 && 병기글.trim() ? 병기글.trim() : null,
      audio,
      prompt_id,
      created_at: new Date().toISOString(),
    });
  };

  const 다시 = async () => {
    await 남기기('retried'); // 이전 시도를 보관하고 나서야 새로 녹음한다 — 지우기가 원천적으로 없다
    set녹음(null);
    set단계('대기');
  };

  const 제출 = async () => {
    await 남기기('submitted');
    완료();
  };

  const 넘어가기 = async () => {
    await 남기기('abandoned'); // 무발화도 데이터다(설계 §3-4)
    완료();
  };

  const 내목소리 = () => {
    if (!녹음 || !녹음.uri) return;
    if (플레이어.current) 플레이어.current.remove();
    플레이어.current = createAudioPlayer({ uri: 녹음.uri });
    /* 🔴 **끝까지 간 것만 관측이다** — 아래 타이머는 화면 글자를 되돌리는 안전망일 뿐, 재생이
     *   시작조차 못한 기기에서도 똑같이 돈다. 거기서 세면 「들었다」가 「눌렀다」로 뜻을 갈아탄다
     *   (①듣기 `onDone` 이 `onError` 를 일부러 비워 둔 것과 같은 규칙). */
    플레이어.current.addListener('playbackStatusUpdate', (s) => {
      if (s && s.didJustFinish && !되들은때.current) 되들은때.current = new Date().toISOString();
    });
    set듣는중(true);
    플레이어.current.play();
    setTimeout(() => set듣는중(false), 녹음.duration_ms + 300);
  };

  return (
    <View style={s.카드}>
      <Text style={s.카드라벨}>
        {호흡번호[step]} · {안내}
      </Text>
      <Text style={s.제시문}>{제시문}</Text>

      {/* 🔴 **`보기.options_shown` 순서 그대로 그린다** — 원본 `선택지` 를 다시 map 하면 행에 적힌
          자리(`position`)와 학생이 실제로 본 자리가 갈리고, 그 갈림은 오류를 안 낸다.
          🔑 고르는 것은 **강제가 아니다.** 안 고르고 그냥 말해도 흐름은 그대로 간다(보기는 힌트다 ·
          `lib/오늘과제.js` 의 「선택지를 받은 상급자는 무시하고 자유롭게 말한다」와 같은 규칙). */}
      {보기 && (
        <View style={s.선택지묶음}>
          {보기.options_shown.map((o) => {
            const 골랐다 = 고른것 === o.option_id;
            return (
              <Pressable
                key={o.option_id}
                onPress={() => 고르기(o.option_id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: 골랐다 }}
                style={({ pressed }) => [s.선택지, 골랐다 && s.선택지_고름, pressed && s.눌림]}
              >
                <Text style={[s.선택지글, 골랐다 && s.선택지글_고름]}>{o.label}</Text>
              </Pressable>
            );
          })}
          <Text style={s.선택지힌트}>둘 중 하나를 골라, ○○에 내 이야기를 넣어 말해요</Text>
        </View>
      )}

      {단계 === '대기' && (
        <중앙>
          <녹음버튼 onPress={시작} />
          <Text style={s.녹음안내}>탭하면 녹음이 시작돼요</Text>
          {막힘 && <Text style={s.오류}>{막힘}</Text>}
        </중앙>
      )}

      {단계 === '녹음중' && (
        <중앙>
          <녹음버튼 녹음중 onPress={끝} />
          <Text style={s.타이머}>{초표시(경과)}</Text>
          <Text style={s.녹음안내}>다 말했으면 탭해서 마쳐요</Text>
        </중앙>
      )}

      {단계 === '확인' && 녹음 && (
        <View style={s.확인묶음}>
          <Text style={s.확인글}>
            {초표시(녹음.duration_ms)} 담겼어요
          </Text>
          {/* 🔴 「몇 초 담겼다」만 보이면 그 숫자가 절단을 감춘다 — **여기까지만**이라고 말한다.
              🚫 지우지 않는다: 담긴 만큼은 학생 원본이고, 다시 말할지는 학생이 고른다(규약 §4). */}
          {끊김 && (
            <Text style={s.무발화설명}>
              여기까지만 담겼어요 — 앱을 잠깐 나가서 녹음이 멈췄어요. 들어 보고 다시 말해도 돼요.
            </Text>
          )}
          <Pressable onPress={내목소리} style={({ pressed }) => [s.보조버튼, pressed && s.눌림]}>
            <Text style={s.보조버튼글}>{듣는중 ? '재생 중…' : '내 목소리 듣기'}</Text>
          </Pressable>
          {텍스트병기 && (
            <TextInput
              style={s.병기입력}
              placeholder="말한 문장을 글로도 남기고 싶으면 여기에 (선택)"
              placeholderTextColor={색.잉크_메타}
              value={병기글}
              onChangeText={set병기글}
              multiline
            />
          )}
          <View style={s.가로}>
            <Pressable onPress={다시} style={({ pressed }) => [s.보조버튼, s.늘림, pressed && s.눌림]}>
              <Text style={s.보조버튼글}>다시 말하기</Text>
            </Pressable>
            <Pressable onPress={제출} style={({ pressed }) => [s.주버튼, s.늘림, pressed && s.눌림]}>
              <Text style={s.주버튼글}>보내기</Text>
            </Pressable>
          </View>
        </View>
      )}

      {단계 === '무발화' && (
        <View style={s.확인묶음}>
          <Text style={s.확인글}>목소리가 안 담겼어요</Text>
          {/* 🔴 **끊긴 것을 「막혔다」로 말하지 않는다** — 아래 버튼이 남기는 `abandoned` 는
              이탈 예측(P0 S1-6)의 원신호라, 기술적 중단을 거기 섞으면 그 신호가 오염된다. */}
          <Text style={s.무발화설명}>
            {끊김
              ? '앱을 잠깐 나가서 녹음이 멈췄어요. 다시 말해 볼까요?'
              : '괜찮아요 — 말이 안 나오는 날도 있어요. 그것도 선생님께 신호가 돼요.'}
          </Text>
          <View style={s.가로}>
            <Pressable onPress={다시} style={({ pressed }) => [s.주버튼, s.늘림, pressed && s.눌림]}>
              <Text style={s.주버튼글}>한 번 더 해볼래요</Text>
            </Pressable>
            {/* 🚫 끊긴 자리에는 이 버튼을 안 그린다 — 누르면 「이 학생이 오늘 막혔다」가 행으로
                남는다. 정말 넘어갈 학생은 다시 녹음해 바로 멈추면 되고, **그때의 무발화는 진짜다**. */}
            {!끊김 && (
              <Pressable onPress={넘어가기} style={({ pressed }) => [s.보조버튼, s.늘림, pressed && s.눌림]}>
                <Text style={s.보조버튼글}>오늘은 넘어갈래요</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

/* ── 녹음 버튼 — 화면 전체에서 코랄이 사는 유일한 자리 ── */
function 녹음버튼({ 녹음중, onPress }) {
  const 맥박 = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (녹음중) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(맥박, { toValue: 1.35, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(맥박, { toValue: 1, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [녹음중, 맥박]);

  return (
    <View style={s.버튼자리}>
      {녹음중 && (
        <Animated.View style={[s.맥박링, { transform: [{ scale: 맥박 }] }]} />
      )}
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [s.코랄원, pressed && { transform: [{ scale: 0.96 }] }]}
        accessibilityLabel={녹음중 ? '녹음 마치기' : '녹음 시작'}
      >
        {녹음중 ? <View style={s.정지사각} /> : <View style={s.마이크점} />}
      </Pressable>
    </View>
  );
}

function 중앙({ children }) {
  return <View style={s.중앙}>{children}</View>;
}

/* ── 완료 ── */
function 완료카드({ 로그, date, 견줌 = null, 견줌다시읽기 = null }) {
  const 오늘것 = 로그.filter((e) => e.date === date);
  const 시도 = 오늘것.length;
  const 다시한번 = 오늘것.filter((e) => e.status === 'retried').length;
  /* 🔴 「도착」은 서버가 받은 것만이다 — 기기에 저장됐다고 도착이 아니다. 이 카드가 무조건
   *   「도착했어요」라고 말하면, 몽골 회선에서 전송이 상시 실패해도 학생도 우리도 그걸 모른다. */
  const 배달 = 배달상태(로그, date);
  const 다닿음 = 배달.보내는중 === 0 && 배달.못보냄 === 0;

  /* 🔑 「어제의 나」를 **여기서** 한 번 다시 읽는다(유호님 확정 2026-08-09) — 값이 참이 되는
   *   순간이 제출 직후다. 앱을 켤 때 읽은 값은 오늘 낸 것을 아직 모르는 낡은 값이다.
   * 🔴 **다 닿았을 때만** 읽는다: 서버는 도착한 것만 세므로, 올라가는 중에 읽으면 오늘이
   *   실제보다 적게 나와 「어제보다 더 냈어요」가 조용히 사라지거나 틀린 수로 선다.
   *   (낡은 값이 남는 쪽은 안전하다 — 오늘이 적게 잡히면 말이 안 붙을 뿐 과장되지 않는다.) */
  useEffect(() => {
    if (다닿음 && 견줌다시읽기) 견줌다시읽기();
  }, [다닿음]);

  const 늘었다 = 견줌 ? 늘어난말(견줌) : null;
  return (
    <View style={s.카드}>
      <Text style={s.카드라벨}>오늘의 말하기 · 끝</Text>
      <Text style={s.완료제목}>{다닿음 ? '목소리가 도착했어요' : '오늘 말하기, 끝냈어요'}</Text>
      <Text style={s.완료설명}>
        오늘 {시도}번 말했어요{다시한번 > 0 ? ` — 그중 ${다시한번}번은 스스로 다시 도전했어요. 그게 실력이 느는 순간이에요.` : '.'}
      </Text>
      {배달.보내는중 > 0 && (
        <Text style={s.메모}>목소리 {배달.보내는중}개는 보내는 중이에요 — 앱을 다시 열면 이어서 보내요.</Text>
      )}
      {배달.못보냄 > 0 && (
        <Text style={s.오류}>목소리 {배달.못보냄}개를 보내지 못했어요. 선생님께 알려 주세요.</Text>
      )}
      {/* 🔑 어제를 넘은 그 순간에만 말한다 — 🚫 줄었을 때·같을 때는 아무 말도 하지 않는다
          (`lib/견줌.js` · 평가가 아니라 동기다). 오늘 수를 다시 적지 않고 **차이만** 말하는 것은
          위의 「오늘 N번」이 기기 로그이고 이 값은 서버 것이라, 두 수를 나란히 두면 어긋난 날
          학생이 어느 쪽을 믿어야 할지 모르기 때문이다. */}
      {다닿음 && 늘었다 && <Text style={s.어제넘음}>{늘었다}</Text>}
      {/* 답장 약속은 **닿은 뒤에만** 한다 — 안 닿은 목소리에 답장은 오지 않는다. */}
      {다닿음 && <Text style={s.완료메타}>내일, 오늘 목소리에 대한 답장이 와요.</Text>}
    </View>
  );
}

const 코랄지름 = 84;

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 색.바탕 },
  inner: { padding: 24, paddingTop: 68, paddingBottom: 48, gap: 20 },

  머리: { gap: 6 },
  브랜드: { fontFamily: 폰트.모노, fontSize: 11, letterSpacing: 모노트래킹.라벨, color: 색.잉크_태그 },
  제목: { fontFamily: 폰트.헤드, fontSize: 27, color: 색.잉크 },
  진행줄: { flexDirection: 'row', gap: 18, marginTop: 10 },
  진행칸: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  점: { width: 7, height: 7, borderRadius: 4, backgroundColor: 색.잉크_희미 },
  점_지남: { backgroundColor: 색.잉크_서브 },
  점_현재: { backgroundColor: 색.잉크 },
  점라벨: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_메타 },
  점라벨_현재: { fontFamily: 폰트.강조, color: 색.잉크 },

  경고: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_서브, lineHeight: 18 },
  오류: { fontFamily: 폰트.강조, fontSize: 13, color: 색.잉크, lineHeight: 19 },
  /* 3번째 글자 층(Slate) — 상태 메모는 본문도 오류도 아니다. 바닥이 Navy 2 라 허용 안이다.
     🔴 코랄로 칠하지 않는다: 이 화면의 신호 1점은 녹음 버튼이다(테마 `신호자리`). */
  메모: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_보조, lineHeight: 18 },

  카드: { backgroundColor: 색.바탕띄움, borderRadius: 20, padding: 22, gap: 16 },
  카드라벨: { fontFamily: 폰트.캡션, fontSize: 13, color: 색.잉크_태그 },
  불러오는글: { fontFamily: 폰트.본문, fontSize: 17, lineHeight: 28, color: 색.잉크_메타 },
  편지문: { fontFamily: 폰트.본문, fontSize: 19, lineHeight: 31, color: 색.잉크 },
  제시문: { fontFamily: 폰트.헤드, fontSize: 23, lineHeight: 34, color: 색.잉크 },

  선택지묶음: { gap: 8 },
  선택지: {
    borderWidth: 1,
    borderColor: 색.잉크_희미,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  /* 고른 보기 — **색을 새로 안 쓴다.** 이 화면의 신호 1점은 녹음 버튼(코랄)이고 그건 규칙이
     아니라 구조다(R1). 고름은 테두리 대비(0.28→1.0)와 글자 무게(Medium→SemiBold)로만 선다.
     🔑 `borderWidth` 는 안 건드린다 — 굵히면 고를 때마다 카드가 1px 씩 튄다. */
  선택지_고름: { borderColor: 색.잉크 },
  선택지글: { fontFamily: 폰트.본문, fontSize: 16, color: 색.잉크 },
  선택지글_고름: { fontFamily: 폰트.강조 },
  선택지힌트: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_메타, marginTop: 2 },

  중앙: { alignItems: 'center', gap: 12, paddingVertical: 10 },
  버튼자리: { width: 코랄지름 * 1.6, height: 코랄지름 * 1.6, alignItems: 'center', justifyContent: 'center' },
  맥박링: {
    position: 'absolute',
    width: 코랄지름,
    height: 코랄지름,
    borderRadius: 코랄지름 / 2,
    borderWidth: 2,
    borderColor: 색.신호,
    opacity: 0.35,
  },
  코랄원: {
    width: 코랄지름,
    height: 코랄지름,
    borderRadius: 코랄지름 / 2,
    backgroundColor: 색.신호,
    alignItems: 'center',
    justifyContent: 'center',
  },
  마이크점: { width: 14, height: 14, borderRadius: 7, backgroundColor: 색.바탕 },
  정지사각: { width: 22, height: 22, borderRadius: 5, backgroundColor: 색.바탕 },
  타이머: { fontFamily: 폰트.모노, fontSize: 22, letterSpacing: 모노트래킹.타이머, color: 색.잉크 },
  녹음안내: { fontFamily: 폰트.캡션, fontSize: 13, color: 색.잉크_서브 },

  확인묶음: { gap: 12 },
  확인글: { fontFamily: 폰트.강조, fontSize: 16, color: 색.잉크 },
  무발화설명: { fontFamily: 폰트.본문, fontSize: 14, lineHeight: 22, color: 색.잉크_서브 },
  병기입력: {
    fontFamily: 폰트.본문,
    fontSize: 15,
    color: 색.잉크,
    borderWidth: 1,
    borderColor: 색.잉크_희미,
    borderRadius: 12,
    padding: 12,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  가로: { flexDirection: 'row', gap: 10 },
  늘림: { flex: 1 },

  주버튼: {
    backgroundColor: 색.잉크,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  주버튼_대기: { backgroundColor: 'rgba(246,241,232,0.85)' },
  주버튼글: { fontFamily: 폰트.강조, fontSize: 15, color: 색.바탕 },
  보조버튼: {
    borderWidth: 1,
    borderColor: 색.잉크_희미,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  보조버튼글: { fontFamily: 폰트.강조, fontSize: 14, color: 색.잉크_태그 },
  눌림: { opacity: 0.75 },

  완료제목: { fontFamily: 폰트.헤드, fontSize: 25, color: 색.잉크 },
  완료설명: { fontFamily: 폰트.본문, fontSize: 15, lineHeight: 24, color: 색.잉크_서브 },
  /* 완료 카드에서 **한 층 위**로 세운다(강조·잉크 100%) — 이 줄이 이 카드의 결론이다.
     🚫 코랄은 안 쓴다: 이 화면의 신호 1점은 녹음 버튼이고, 그건 규칙이 아니라 구조다(R1). */
  어제넘음: { fontFamily: 폰트.강조, fontSize: 15, lineHeight: 24, color: 색.잉크 },
  완료메타: { fontFamily: 폰트.캡션, fontSize: 13, color: 색.잉크_메타 },
});
