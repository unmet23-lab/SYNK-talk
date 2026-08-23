import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { 색, 폰트, 모노트래킹 } from './테마';
import {
  사과전략, 오늘추천, 보기세우기, 전략선택사건, 메일제출사건, 이탈사건, 이탈닻,
} from '../lib/게임제출.js';
import { 판정, 같은판정 } from '../lib/멘탈게이지.js';
import { 계측시작, 타건, 계측payload } from '../lib/작성과정.js';
/* 잰 것을 **그 자리에서** 학생에게 돌려준다(철학 Ⅱ-8 셋째 실물). 판정·문구는 전부 저 조립기가
 * 지고 여기는 그릴 자리만 준다 — 화면이 문구를 손으로 적으면 「비교하지 않는다」가 화면마다
 * 다시 지켜져야 하고, 한 화면이 잊으면 그 자리에서만 조용히 깨진다. */
import { 관찰한줄 } from '../lib/돌려주기.js';
import { 확인사건 } from '../lib/성향확인.js';
import { 반응안내 } from '../contents/문구_성향확인.js';
import { 다음시도번호, 제출항목 } from '../lib/게임로그.js';
import { 흐름id, 깨진기록안내 } from '../lib/제출로그.js';
import { 몽골날짜 } from '../lib/오늘과제.js';
/* 게임 로그의 읽기·쓰기·전송은 **직렬 통로 하나**로만 간다(B3 · `src/게임큐.js`).
 * 저장을 직접 잡으면 동시 쓰기가 파일을 덮어 남의 사건(고름·이탈)을 지운다 — 그 소실은
 * 오류 없이 「성공」의 모양이다. */
import { 게임큐읽기, 게임사건담기, 게임큐밀기, 게임이탈수거 } from './게임큐.js';
/* 소리는 전역 게이트 한 문으로만 — expo-audio 를 직접 잡으면 「녹음 중 0」 규칙(게임층 §3-1)이
 * 프로즈로 돌아간다. 이 화면의 소리는 발송 성취음 1회뿐이다(실패음 없음 — 킷 규칙 ②). */
import { 효과음 } from './소리.js';

/**
 * G1 「교수님 멘탈 구하기」 — 격식 메일 쓰기 게임 (발주_게임모듈.md G1 · 게임층 설계).
 * 흐름: 상황 카드 + 사과 전략 3장 → 메일 쓰기(멘탈 게이지) → 「교수님이 읽고 있어요」.
 *
 * ■ 재료는 **라우팅이 편다** (`src/말하기화면.js` → `lib/게임제출.게임재료`)
 *   이 화면은 그 결과(`재료`)를 prop 으로 받는다 — 검수확정 게이트·시드 판정이 그 한 곳에
 *   살아서, 못 펴는 시드·미검수 판은 이 화면에 오기 전에 말하기 폴백으로 내려간다(H5).
 *   `재료` 없이 그려지면(배선 실수) 정직한 안내 카드가 선다 — 고정 과제로 둔갑하지 않는다.
 *
 * ■ 🔴 controlled TextInput 금지 (발주 G1 §4-5 ⚙)
 *   값은 `defaultValue` + `onChangeText` 로 **ref 에만** 담는다 — 매 글자 state 로 되돌려 넣으면
 *   한글 조합이 깨진다(「안녕」이 「ㅇㅏㄴㄴㅕㅇ」으로 흩어진다). 리렌더는 5칸 판정이 **바뀔 때만**
 *   건다(`멘탈게이지.같은판정`) — 게이지가 곧 그 리렌더의 유일한 이유다.
 *
 * ■ 🔴 입력 칸은 본문 **하나**다 — 제목 칸은 이 판에서 뺐다 (H1)
 *   c8 에 제목이 착지할 칸이 없다. 합성 문자열(`제목: …\n`)로 본문에 끼우면 ①모든 학생의
 *   `input_burst_max` 가 접두 길이만큼 공짜로 오르고 ②제목 지우기가 `revision_count` 를 올리고
 *   ③게이지가 제목의 낱말로 칸을 채운다 — 셋 다 **관측이 아니라 우리가 심은 값**이고 소급이
 *   없다. 계측(`타건`)·게이지(`판정`)·`body_original` 은 전부 **본문 ref 하나**에서만 나온다.
 *   발주 §4-5 의 「제목 칸 1개」는 제목의 행 자리(계약 판정)가 정해지는 날 붙인다 — 기록만.
 *
 * ■ 🔴 숨은 시계 (유호 확정 · 발주 G1 §6)
 *   화면에 시계·초·숫자·퍼센트 0. 작성 과정은 `작성과정` 조립기가 **경과 시계**로 몰래 잰다.
 *
 * ■ 🔴 즉답 금지 (발주 G1 §4-8 · §8)
 *   제출 후 화면은 「교수님이 읽고 있어요」뿐이다. 답장 = 교정 화면(S1-8)이고 며칠 걸린다.
 *
 * ■ 막힘 prop 이 없다 (M7)
 *   말하기 화면이 막힘 검사 **뒤**에서만 이 화면을 그리므로, 이 화면이 사는 동안 막힘은 늘
 *   null 이다 — 죽은 값을 prop 으로 들면 실값처럼 읽힌다. 막힌 날의 큐 보류는 말하기 화면의
 *   밀기(`게임큐밀기(토큰, 막힘참조)`)가 실값으로 진다(B2).
 *
 * ■ 몽골어 병기 0 — 팩 `검수확정=false` 라 `mn` 이 없다(발주_게임콘텐츠팩 §3). 지어내지 않는다.
 * ■ 신호 1점 = **보내기 버튼**(코랄 면 · `테마.신호자리.교수멘탈`) — 말하기의 녹음 버튼과 같은 규칙.
 */

/* 경과 시계 — `src/말하기화면.js` 와 같은 판정(벽시계 금지 · 없으면 null = 「안 쟀다」).
 * ⚠ 두 번째 사본이다 — 세 번째가 생기는 날 공용 통로로 뗀다(CLAUDE.md 신뢰성 규칙). */
const 경과시계 = () =>
  (typeof performance !== 'undefined' && performance && typeof performance.now === 'function'
    ? performance.now() : null);

export default function 교수멘탈화면({ 재료, 토큰, 학생번호 = null, 시작단계 = '전략', 확인 = null, 확인뒤 = null }) {
  /* 표시 순서를 마운트 때 한 번 확정한다(`말하기화면` 녹음카드와 같은 규칙) — 매 렌더 섞으면
   * 행에 적힌 자리와 학생이 본 자리가 갈리고, 그 갈림은 증상이 없다. 추천은 시드에서 결정적. */
  const [보기] = useState(() => (재료 ? 보기세우기(사과전략.보기들, 오늘추천(재료.prompt_seed)) : null));
  const 보기뜬때 = useRef(경과시계());

  const [단계, set단계] = useState(시작단계); // 전략 | 쓰기 | 대기
  /* 고른 전략의 «라벨» — 쓰기 단계에 재표시(자기 설명 «연결» 축: 고른 카드가 사라지면 「내가 뭘
   * 골랐더라」가 끊긴다 · 유호 확정 08-22). 행 재료가 아니라 화면 전용이다(사건은 고르기가 이미 낸다). */
  const [고른전략라벨, set고른전략라벨] = useState(null);
  const [로그, set로그] = useState([]);
  const [오류, set오류] = useState(null);
  const [게이지, set게이지] = useState(null);
  const 게이지참조 = useRef(null);
  const [본문있음, set본문있음] = useState(false);
  const 본문있음참조 = useRef(false);
  const [보낸메일, set보낸메일] = useState(null);
  /* Ⅲ⑥ — 이 앉음에서 성향 확인에 답했나(즉시 반응용 · 값 = '맞다'|'아니다'). 답 자체는 게임큐로
   * 나가고(오프라인 안전·멱등), 다음 노출 게이트(하루 1회)는 서버가 행을 읽어 진다. */
  const [확인답, set확인답] = useState(null);

  /* 한 앉음 = 한 correlation_id (P0 §3-1 ④). 재제출은 새 마운트 = 새 앉음이라 **새 키**다 —
   * 원 제출과의 고리는 `retry_of_event_id`(서버 배정 행이 낸 값)가 잇는다(발주 G1 §6). */
  const 앉음 = useRef(흐름id()).current;
  const 시작날짜 = useRef(몽골날짜());

  /* 입력의 최신본은 ref 가 쥔다 — state 로 쥐면 controlled 가 된다(머리말 ⚙). */
  const 본문참조 = useRef('');
  const 계측참조 = useRef(null);
  /* 이탈 판정 재료 — cleanup 은 낡은 state 를 보므로 ref 하나가 최신을 쥔다. */
  const 상태참조 = useRef({ 단계: 시작단계, 글: '', 제출됨: false });

  /* 마운트: 큐를 읽고 — 이미 이 배정을 보냈으면 대기 화면으로 간다(두 번 내지 않는다) —
   * 밀린 것을 민다. 읽기·밀기 전부 직렬 통로다(B3). */
  useEffect(() => {
    let 살아있음 = true;
    (async () => {
      try {
        const { 로그: 저장된, 깨진줄 } = await 게임큐읽기();
        if (!살아있음) return;
        set로그(저장된);
        const 깨짐 = 깨진기록안내(깨진줄);
        if (깨짐) set오류(깨짐);
        if (재료) {
          const 이미 = 제출항목(저장된, 재료.task_ref);
          if (이미) {
            set보낸메일(이미.사건.submission.body_original);
            상태참조.current = { ...상태참조.current, 단계: '대기', 제출됨: true };
            set단계('대기');
          }
        }
        /* 죽은 배정 수거(H2 「다음 마운트 발견」) — 어제 고르고 사라진 앉음을 이탈로 세운다.
         * 기준은 서버 task_ref 끼리의 대조(기기 시계 아님) — 재료가 없으면(배선 실수 갈래) 안
         * 걷는다. 밀기 전에 걷어야 걷은 것이 바로 아래 밀기로 나간다. */
        await 게임이탈수거(재료 ? 재료.task_ref : null).catch(() => {});
        /* 막힘 = null — 이 화면은 막힘 검사 뒤에서만 산다(머리말 M7). 막힌 날의 보류는
         * 말하기 화면의 밀기가 실값으로 진다. */
        const 민뒤 = await 게임큐밀기(토큰, null);
        if (살아있음) set로그(민뒤);
      } catch (e) {
        if (살아있음) set오류(String((e && e.message) || e));
      }
    })();
    return () => { 살아있음 = false; };
  }, []);

  /* 계측은 **입력이 가능해진 순간** 시작한다 — 카드를 읽는 시간은 안 센다(`작성과정.계측시작`). */
  useEffect(() => {
    if (단계 === '쓰기' && !계측참조.current) 계측참조.current = 계측시작(경과시계());
  }, [단계]);

  /* 🔴 쓰다 나감 = `session.abandoned` — **날을 건넌 되세움에서만** 낸다(발주 §5 이탈 행).
   *   같은 날의 이동(사전·답장 화면)은 이탈이 아니다 — 말하기화면이 「끊긴 것을 막혔다로 말하지
   *   않는다」로 지킨 그 신호 순도다. 앱이 통째로 죽은 경우는 cleanup 이 안 돌아 못 잰다(천장 —
   *   그날의 부재는 배정 사건이 분모로 남는다). 담기는 직렬 통로라 동시 쓰기와 안 부딪친다(B3). */
  useEffect(() => () => {
    const s = 상태참조.current;
    if (s.제출됨 || s.단계 !== '쓰기' || !s.글.trim()) return;
    if (몽골날짜() === 시작날짜.current) return;
    const 사건 = 이탈사건(재료, { correlation_id: 앉음, idempotency_key: 흐름id() });
    if (!사건) return;
    게임사건담기(사건).catch(() => { /* 기록 실패 — 관측을 지어내지 않는다 */ });
    // 전송은 다음 마운트(말하기·게임 어느 쪽이든)의 밀기가 진다
  }, []);

  const 고르기 = async (option_id) => {
    상태참조.current = { ...상태참조.current, 단계: '쓰기' };
    set고른전략라벨(보기?.options_shown?.find((o) => o.option_id === option_id)?.label ?? null);
    set단계('쓰기');
    const 사건 = 전략선택사건(재료, {
      보기, 고른것: option_id, 시작: 보기뜬때.current, 끝: 경과시계(),
      correlation_id: 앉음, idempotency_key: 흐름id(),
    });
    if (!사건) return; // 조립이 계약을 못 지키면 안 보낸다 — 흐름은 막지 않는다(고름은 잰 것이다)
    try {
      /* 닻(task_meta)은 로컬 칸이다 — 앱이 죽어 cleanup 이 못 돈 날, 이 고름이 어느 배정의
       * 것이었는지를 수거(H2)가 여기서 읽는다(발주 §6-6 ⑩ C5). */
      const { 로그: 더한, 새것 } = await 게임사건담기(사건, 이탈닻(재료));
      set로그(더한);
      if (새것) 게임큐밀기(토큰, null).then(set로그, () => {}); // 기다리지 않는다 — 저장은 끝났다
    } catch { /* 담기 실패 — 화면 흐름은 그대로 간다(고름은 우리가 잰 것이다) */ }
  };

  const 입력됨 = (글) => {
    계측참조.current = 타건(계측참조.current, 글, 경과시계());
    상태참조.current = { ...상태참조.current, 글 };
    const 새 = 판정(글, 재료.문항.요구문형);
    if (!같은판정(게이지참조.current, 새)) {
      게이지참조.current = 새;
      set게이지(새);
    }
    const 있음 = 글.trim() !== '';
    if (있음 !== 본문있음참조.current) {
      본문있음참조.current = 있음;
      set본문있음(있음);
    }
  };

  const 보내기 = async () => {
    const 본문 = 본문참조.current;
    if (!본문.trim() || !재료) return;
    let 현재로그 = 로그;
    try {
      ({ 로그: 현재로그 } = await 게임큐읽기()); // attempt 는 그 순간의 파일에서 센다
    } catch { /* 못 읽어도 화면 로그로 잇는다 — 멱등키·항목 id 가 중복을 접는다 */ }
    const 사건 = 메일제출사건(재료, {
      본문,
      correlation_id: 앉음,
      idempotency_key: 흐름id(),
      attempt_no: 다음시도번호(현재로그, 재료.task_ref),
      /* 한 칸이라도 못 쟀으면 null — 그러면 조립기가 키를 아예 안 싣는다(§6-6 ⑨ 한 벌 규칙). */
      compose_meta: 계측payload(계측참조.current, 경과시계()),
    });
    if (!사건) {
      set오류('메일을 다시 담아 볼게요! 잠시 뒤 다시 눌러 주세요');
      return;
    }
    try {
      const { 로그: 더한 } = await 게임사건담기(사건);
      set로그(더한);
    } catch (e) {
      set오류(String((e && e.message) || e));
      return; // 기기에 못 남긴 제출을 「보냈다」 화면으로 넘기지 않는다
    }
    상태참조.current = { ...상태참조.current, 단계: '대기', 제출됨: true };
    set보낸메일(본문);
    set단계('대기');
    /* 발송 성취음 1회(게임층 §3-1 — achieve 자리 「G1 발송」). 게이트 거부·자산 없음은
     * 조용히 무음이다 — 소리가 흐름을 막지 않는다. 다시 열어 대기로 점프한 날은 안 난다. */
    try { 효과음('achieve'); } catch { /* 무음 — 실패음도 오류도 내지 않는다 */ }
    게임큐밀기(토큰, null).then(set로그, () => {}); // 화면은 안 기다린다 — 도착은 대기 카드가 말한다
  };

  /* ── 렌더 ── */

  if (!재료) {
    return (
      <ScrollView style={s.wrap} contentContainerStyle={s.inner}>
        <머리 />
        {/* 라우팅이 재료 없이 이 화면을 그렸다(배선 실수) — 못 읽은 것을 둔갑시키지 않는다. */}
        <View style={s.카드}>
          <Text style={s.본문글}>오늘의 미션을 읽지 못했어요 — 잠시 뒤 앱을 다시 열어 주세요.</Text>
          {학생번호 ? <Text style={s.메모}>계속 그러면 선생님께 학생번호 {학생번호}를 보여 주세요.</Text> : null}
        </View>
      </ScrollView>
    );
  }

  const { 문항 } = 재료;
  const 칸이름들 = Object.keys(문항.요구문형);
  const 빠진칸 = 게이지 ? 게이지.빠진칸 : 칸이름들;
  /* 메일 항목의 배달 상태 — 「닿았다」는 서버가 받은 것만이다(완료카드와 같은 축). */
  const 메일항목 = 제출항목(로그, 재료.task_ref);
  /* 🔑 앉음 키는 **제출 사건의 것**이지 이 마운트의 `앉음` 이 아니다 — 다시 열어 대기로 점프한
   * 날은 새 `흐름id` 라 아무것도 안 맞고, 학생은 어제 본 줄을 오늘 못 보게 된다.
   * 🔴 도착과 무관하다 — 관찰은 «기기가 잰 것»이라 서버가 아직 못 받은 날에도 참이다. */
  const 관찰 = 메일항목 && 메일항목.사건 ? 관찰한줄(로그, 메일항목.사건.correlation_id) : null;

  /* Ⅲ⑥ — 성향 확인에 답한다. 카드의 다섯 값을 그대로 되싣는 조립은 lib 이 지고(값록 포함),
   * 전송은 이 화면의 유일한 통로(게임큐 — 직렬·멱등·오프라인 안전)로 나간다. 담기가 죽어도
   * 즉시 반응은 선다 — 학생 경험이 저장 실패를 기다리지 않는다(고칠 것은 로그가 안다). */
  const 확인답하기 = async (값) => {
    const 사건 = 확인사건(확인, 값, { correlation_id: 앉음, idempotency_key: 흐름id() });
    if (!사건) return;
    set확인답(값);
    try {
      const { 로그: 더한, 새것 } = await 게임사건담기(사건, null);
      set로그(더한);
      if (새것) 게임큐밀기(토큰, null).then(set로그, () => {});
    } catch { /* 담기 실패 — 반응은 이미 섰고, 다음 노출은 서버 행 기준이라 거짓 하루1회가 안 생긴다 */ }
    if (확인뒤) 확인뒤();
  };

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
      <머리 />
      {오류 && <Text style={s.오류}>{오류}</Text>}

      {단계 === '전략' && (
        <>
          <View style={s.카드}>
            <Text style={s.카드라벨}>오늘의 미션</Text>
            {/* 전체 그림 한 줄 — 처음 온 학생이 「이 게임이 통째로 뭔지」를 첫 카드에서 안다
             * (유호 확정 08-22 「기능은 자기를 설명해야 완성 · 숙제는 반드시」 · 말하기 1bce99e 와
             * 같은 처방 — 첫 걸음에만 · ⚠ 문구 초안, 카피 확정은 유호님 몫). */}
            <Text style={s.메모}>메일 한 통이에요 — 다가갈 방법을 고르고, 교수님께 메일을 써서 보내요!</Text>
            <Text style={s.상황글}>{문항.질문}</Text>
            <Text style={s.본문글}>{문항.지시문}</Text>
          </View>
          {보기 && (
            <View style={s.카드}>
              <Text style={s.카드라벨}>어떻게 다가갈까요? — 한 장을 골라요</Text>
              {/* 🔴 `options_shown` 순서 그대로 그린다 — 행에 적힌 자리와 학생이 본 자리가
                  같아야 한다(말하기화면 선택지와 같은 규칙). */}
              {보기.options_shown.map((o) => (
                <Pressable
                  key={o.option_id}
                  onPress={() => 고르기(o.option_id)}
                  accessibilityRole="button"
                  style={({ pressed }) => [s.전략카드, pressed && s.눌림]}
                >
                  <Text style={s.전략글}>{o.label}</Text>
                  {보기.recommended_option === o.option_id && (
                    <Text style={s.추천표시}>오늘의 추천</Text>
                  )}
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}

      {단계 === '쓰기' && (
        <View style={s.카드}>
          <Text style={s.카드라벨}>받는 사람 · 교수님</Text>
          {/* «연결» — 방금 고른 방법이 쓰기 화면에도 산다(고른 카드가 사라지면 연결이 끊긴다). */}
          {고른전략라벨 && <Text style={s.메모}>내가 고른 방법 · {고른전략라벨}</Text>}
          <Text style={s.메모}>{문항.지시문}</Text>
          <TextInput
            style={s.본문입력}
            placeholder="교수님께 보낼 메일을 써요"
            placeholderTextColor={색.잉크_메타}
            defaultValue=""
            onChangeText={(t) => { 본문참조.current = t; 입력됨(t); }}
            multiline
            textAlignVertical="top"
          />

          {/* 멘탈 게이지 — 5칸 진행 연출. 채점이 아니고 숫자·퍼센트도 없다(발주 G1 §4-5).
              칸 채움 체크는 게이지 상승의 원인 표시 — 한 장치의 두 표면이다(게임층 §2). */}
          <View>
            <Text style={s.게이지라벨}>교수님 기분 — 문법 점수가 아니라 빠진 부분 안내예요</Text>
            <View style={s.게이지줄}>
              {칸이름들.map((이름) => {
                const 찼다 = !!(게이지 && 게이지.칸별[이름]);
                return (
                  <View key={이름} style={s.게이지칸}>
                    <View style={[s.게이지면, 찼다 && s.게이지면_참]} />
                    <Text style={[s.게이지이름, 찼다 && s.게이지이름_참]}>{이름}</Text>
                  </View>
                );
              })}
            </View>
            {/* 힌트는 빠진 칸의 **이름까지**다 — 모범 문형은 화면에 내지 않는다(팩 §2). */}
            <Text style={s.게이지힌트}>
              {빠진칸.length ? `아직 비어 있는 칸: ${빠진칸.join(' · ')}` : '다섯 칸이 다 찼어요 — 이제 보내 볼까요?'}
            </Text>
          </View>

          <Pressable
            onPress={보내기}
            disabled={!본문있음}
            accessibilityRole="button"
            style={({ pressed }) => [s.보내기버튼, !본문있음 && s.보내기_대기, pressed && s.눌림]}
          >
            <Text style={s.보내기글}>보내기</Text>
          </Pressable>
        </View>
      )}

      {단계 === '대기' && (
        <>
          <View style={s.카드}>
            <Text style={s.카드라벨}>보냈어요</Text>
            <Text style={s.대기제목}>교수님이 읽고 있어요</Text>
            {/* 즉답처럼 보이게 하지 않는다 — 답장은 사람이 확인한 뒤에 온다(며칠). */}
            <Text style={s.본문글}>답장은 며칠 걸릴 수 있어요. 답장이 오면 「답장」에서 볼 수 있어요.</Text>
            {메일항목 && !메일항목.event_id && !메일항목.send_final && (
              <Text style={s.메모}>메일은 보내는 중이에요 — 앱을 다시 열면 이어서 보내요.</Text>
            )}
            {메일항목 && !메일항목.event_id && 메일항목.send_final && (
              <Text style={s.오류}>메일을 보내지 못했어요. 선생님께 알려 주세요.</Text>
            )}
          </View>
          {/* 🔑 관찰 한 줄 — 화면을 늘리지 않고 이미 보는 자리에 얹는다(철학 Ⅱ-8 「형태 규칙」).
              점수도 채점도 아니라 카드 밖 한 줄로 조용히 둔다. **없으면 안 그린다** — 빈 자리를
              남기면 「관찰이 없다」와 「관찰을 못 잰다」가 같은 모양이 된다. */}
          {관찰 ? <Text style={s.관찰}>{관찰.글}</Text> : null}
          {/* Ⅲ⑥ 성향 확인 — 같은 「이미 보는 자리」 규칙(새 화면 0 · 하루 1회는 서버가 진다).
              답하면 즉시 반응 한 줄이 서고(반영이 «보이는» 상호작용), 사건은 게임큐로 나간다.
              카드가 null 이면 아무것도 안 그린다 — 확인은 «없어도 되는» 꼬리다. */}
          {확인 && !확인답 ? (
            <View style={s.카드}>
              <Text style={s.카드라벨}>몽글의 관찰</Text>
              <Text style={s.본문글}>{String(확인.shown_text || '')}</Text>
              <View style={s.확인줄}>
                {[['맞다', '맞아요'], ['아니다', '아니에요']].map(([값, 라벨]) => (
                  <Pressable
                    key={값}
                    onPress={() => 확인답하기(값)}
                    accessibilityRole="button"
                    style={({ pressed }) => [s.확인단추, pressed && s.눌림]}
                  >
                    <Text style={s.확인단추글}>{라벨}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          {확인답 ? <Text style={s.관찰}>{(반응안내(확인답) || []).join(' ')}</Text> : null}
          {/* 산출물 렌더 — 「보냈다」의 기록이지 「맞았다」의 전시가 아니다(게임층 §2 한 수 더). */}
          {보낸메일 ? (
            <View style={s.카드}>
              <Text style={s.카드라벨}>내가 보낸 편지</Text>
              <Text style={s.편지글} selectable>{보낸메일}</Text>
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function 머리() {
  return (
    <View style={s.머리}>
      <Text style={s.브랜드}>SYNK TALK</Text>
      <Text style={s.제목}>교수님 멘탈 구하기</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 색.바탕 },
  inner: { padding: 24, paddingTop: 68, paddingBottom: 48, gap: 20 },

  머리: { gap: 6 },
  브랜드: { fontFamily: 폰트.모노, fontSize: 11, letterSpacing: 모노트래킹.라벨, color: 색.잉크_태그 },
  제목: { fontFamily: 폰트.헤드, fontSize: 27, color: 색.잉크 },

  오류: { fontFamily: 폰트.강조, fontSize: 13, color: 색.잉크, lineHeight: 19 },
  메모: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_보조, lineHeight: 18 },

  카드: { backgroundColor: 색.바탕띄움, borderRadius: 20, padding: 22, gap: 16 },
  카드라벨: { fontFamily: 폰트.캡션, fontSize: 13, color: 색.잉크_태그 },
  상황글: { fontFamily: 폰트.헤드, fontSize: 21, lineHeight: 32, color: 색.잉크 },
  본문글: { fontFamily: 폰트.본문, fontSize: 15, lineHeight: 24, color: 색.잉크_서브 },

  전략카드: {
    borderWidth: 1, borderColor: 색.잉크_희미, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 16, gap: 4,
  },
  전략글: { fontFamily: 폰트.본문, fontSize: 16, color: 색.잉크 },
  /* 추천 표시 — 색을 새로 안 쓴다(신호 1점은 보내기 버튼) · 글자 층으로만 선다. */
  추천표시: { fontFamily: 폰트.강조, fontSize: 12, color: 색.잉크_태그 },

  본문입력: {
    fontFamily: 폰트.본문, fontSize: 16, lineHeight: 26, color: 색.잉크,
    borderWidth: 1, borderColor: 색.잉크_희미, borderRadius: 12, padding: 12, minHeight: 180,
  },

  게이지라벨: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_메타, marginBottom: 8 },
  게이지줄: { flexDirection: 'row', gap: 8 },
  게이지칸: { flex: 1, alignItems: 'center', gap: 5 },
  게이지면: { alignSelf: 'stretch', height: 8, borderRadius: 4, backgroundColor: 색.잉크_희미 },
  게이지면_참: { backgroundColor: 색.잉크 },
  게이지이름: { fontFamily: 폰트.캡션, fontSize: 11, color: 색.잉크_메타 },
  게이지이름_참: { fontFamily: 폰트.강조, color: 색.잉크 },
  게이지힌트: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_보조, lineHeight: 18, marginTop: 8 },

  /* 신호 1점 — 코랄 면 위 글자는 Ink Deep(색.바탕)만 쓴다(테마 규칙 그대로). */
  보내기버튼: { backgroundColor: 색.신호, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  보내기_대기: { opacity: 0.35 },
  보내기글: { fontFamily: 폰트.강조, fontSize: 15, color: 색.바탕 },
  눌림: { opacity: 0.75 },

  대기제목: { fontFamily: 폰트.헤드, fontSize: 24, color: 색.잉크 },
  /* 관찰 한 줄 — 카드 밖 · 신호(코랄) 없음. 이 화면의 코랄은 게이지 자리라 여기 쓰면 그 뜻이
   * 흐려지고, 관찰이 «성적»으로 읽힌다. 위계는 색이 아니라 밀도로 준다(`어제의나` 와 같은 규칙). */
  관찰: { fontFamily: 폰트.캡션, fontSize: 14, lineHeight: 22, color: 색.잉크_보조, paddingHorizontal: 4 },
  편지글: { fontFamily: 폰트.본문, fontSize: 16, lineHeight: 27, color: 색.잉크 },
  /* Ⅲ⑥ 확인 단추 — 신호색 0(확신 토글과 같은 결) · 두 단추는 같은 무게다(어느 답도 밀지 않는다). */
  확인줄: { flexDirection: 'row', gap: 8 },
  확인단추: { flex: 1, borderWidth: 1, borderColor: 색.선, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  확인단추글: { fontFamily: 폰트.강조, fontSize: 14, color: 색.잉크 },
});
