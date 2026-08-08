import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
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
  useAudioStream,
} from 'expo-audio';
import * as Speech from 'expo-speech';
import { 색, 폰트, 모노트래킹 } from './테마';
import { 머뭇거림추적, 발화문턱_DB, 데시벨, 다음호흡 } from '../lib/세호흡.js';
import { wav조립 } from '../lib/wav조립.js';
import { 정본 as 음성정본 } from '../lib/음성헤더.js';
import { 마이크준비, 마이크끄기 } from '../lib/마이크권한.js';
import { 흐름id, 항목추가, 다음시도번호, 학습출석, 전송기록, 밀린것, 배달상태 } from '../lib/제출로그.js';
import { 화면과제, 몽골날짜, 열람사건, 되듣기사건 } from '../lib/오늘과제.js';
import { 사건보내기 } from './사건통로.js';
import { 로그읽기, 로그쓰기, 음성쓰기, 지속저장 } from './저장.js';
import { 오늘과제받기 } from './과제API.js';
import { 발화보내기 } from './제출API.js';
import 막힘카드 from './막힘카드.js';
import { 급수편지 } from '../contents/첫편지.js';

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

export default function 말하기화면({ 급수 = 0, 토큰 = null, 학생번호 = null }) {
  const 폴백 = useMemo(() => 급수편지(급수), [급수]);

  const [과제, set과제] = useState(null); // null = **아직 모른다**(빈 화면과 다른 상태다)
  /* 서버가 준 `blocked` — **왜** 비었나(F176 ①). 아래 `녹음카드` 의 `막힘`(녹음이 시작되지
   * 못한 이유)과 이름이 겹치지 않게 `서버` 를 붙인다 — 같은 파일 안이라 헷갈리면 그대로 버그다. */
  const [서버막힘, set서버막힘] = useState(null);
  const [date, setDate] = useState(오늘); // 서버가 답하면 **서버 날짜**로 바꾼다(아래)
  const [호흡, set호흡] = useState('듣기');
  const [로그, set로그] = useState([]);
  const [오류, set오류] = useState(null); // 「모름」을 「정상」으로 바꾸지 않는다 — 실패는 글자로 보인다
  const [저장경고, set저장경고] = useState(!지속저장());
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
    const 되듣기 = 되듣기사건(항목, r.event_id);
    if (되듣기) await 사건보내기(토큰, 되듣기);
  };

  useEffect(() => {
    let 살아있음 = true;
    (async () => {
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
        if (살아있음) set서버막힘(막힘);
        결과 = 화면과제(항목, 폴백);
        // 🔴 날짜의 정본은 **서버**다 — 기기 시계로 끊으면 몽골 아침에 어제 것이 오늘이 된다.
        //   로그 키까지 여기서 맞춰 둬야 「학습 출석」과 서버 배정이 같은 날을 가리킨다.
        if (항목 && 항목.task_snapshot && 항목.task_snapshot.날짜) 그날 = String(항목.task_snapshot.날짜);
      } catch (e) {
        결과 = 화면과제(null, 폴백);
        결과.사유 = 토큰
          ? `오늘 과제를 받지 못했어요 — ${String(e.message || e)}`
          : '오늘 과제를 받지 못했어요';
      }
      if (!살아있음) return;
      set과제(결과);
      setDate(그날);
      if (학습출석(기록, 그날)) set호흡('완료');

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
      for (const e of 밀린것(기록)) {
        if (!살아있음) return;
        await 보내기(e);
      }
    })();
    return () => {
      살아있음 = false;
    };
  }, [폴백, 토큰]);

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
     *   누른 학생 앞에서 화면이 멈춘다. 기기 저장은 이미 끝났으니 데이터는 그 사이에도 안전하다. */
    보내기(항목);
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
          텍스트병기
          date={date}
          로그={로그}
          기록추가={기록추가}
          완료={() => set호흡('완료')}
          prompt_id={편지.id}
        />
      )}

      {호흡 === '완료' && <완료카드 로그={로그} date={date} />}
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

  const 재생 = () => {
    set읽는중(true);
    Speech.stop();
    Speech.speak(편지.본문, {
      language: 'ko-KR',
      rate: 0.92,
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

/* ── ②③ 녹음 — 코랄이 사는 유일한 곳 ── */
function 녹음카드({ step, 제시문, 안내, 선택지, 텍스트병기, date, 로그, 기록추가, 완료, prompt_id }) {
  const [단계, set단계] = useState('대기'); // 대기 | 녹음중 | 확인 | 무발화
  const [녹음, set녹음] = useState(null); // { uri, 바이트, duration_ms, hesitation_ms, spoke }
  const [경과, set경과] = useState(0); // 녹음중 타이머 — 스트림이 알려 준 시각
  const [병기글, set병기글] = useState('');
  const [듣는중, set듣는중] = useState(false);
  const [막힘, set막힘] = useState(null); // 녹음이 시작되지 못한 이유 — 버튼 옆에 글자로 선다
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
    return 기록추가({
      date,
      step,
      status,
      replayed_at,
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

      {선택지 && (
        <View style={s.선택지묶음}>
          {선택지.map((c) => (
            <View key={c} style={s.선택지}>
              <Text style={s.선택지글}>{c}</Text>
            </View>
          ))}
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
          <Text style={s.무발화설명}>괜찮아요 — 말이 안 나오는 날도 있어요. 그것도 선생님께 신호가 돼요.</Text>
          <View style={s.가로}>
            <Pressable onPress={다시} style={({ pressed }) => [s.주버튼, s.늘림, pressed && s.눌림]}>
              <Text style={s.주버튼글}>한 번 더 해볼래요</Text>
            </Pressable>
            <Pressable onPress={넘어가기} style={({ pressed }) => [s.보조버튼, s.늘림, pressed && s.눌림]}>
              <Text style={s.보조버튼글}>오늘은 넘어갈래요</Text>
            </Pressable>
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
function 완료카드({ 로그, date }) {
  const 오늘것 = 로그.filter((e) => e.date === date);
  const 시도 = 오늘것.length;
  const 다시한번 = 오늘것.filter((e) => e.status === 'retried').length;
  /* 🔴 「도착」은 서버가 받은 것만이다 — 기기에 저장됐다고 도착이 아니다. 이 카드가 무조건
   *   「도착했어요」라고 말하면, 몽골 회선에서 전송이 상시 실패해도 학생도 우리도 그걸 모른다. */
  const 배달 = 배달상태(로그, date);
  const 다닿음 = 배달.보내는중 === 0 && 배달.못보냄 === 0;
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
  선택지글: { fontFamily: 폰트.본문, fontSize: 16, color: 색.잉크 },
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
  완료메타: { fontFamily: 폰트.캡션, fontSize: 13, color: 색.잉크_메타 },
});
