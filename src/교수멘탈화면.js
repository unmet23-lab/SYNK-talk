import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { 색, 폰트, 몽골어폰트, 눌림감 } from './테마';
import {
  사과전략, 오늘추천, 보기세우기, 전략선택사건, 메일제출사건, 이탈사건, 이탈닻,
} from '../lib/게임제출.js';
import { 판정, 같은판정 } from '../lib/멘탈게이지.js';
import { use줄임 } from '../lib/모션.js';
import { 계측시작, 타건, 계측payload } from '../lib/작성과정.js';
import { 경과시계 } from '../lib/경과시계.js';
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
import { 효과음, bgm정지 } from './소리.js';
/* 판 종료 문장부호(D5-3) — 윗줄은 회귀(tests/감사회귀_R2B2 D5-4)가 원문으로 못박아 따로 들인다. */
import { 도장햅틱 } from './소리.js';
import { 관측보고 } from './관측';

/* 수신자 얼굴도 선택 화면의 같은 교수 원본을 쓴다. 눈깜빡임은 입력 평가와 무관하다. */
import { 살아있는교수얼굴 } from './살아있는교수연구실.js';
import { LAB로고 } from './브랜드자산.js';
import { 말투예시 } from './말투예시.js';
import { 교수작업실장면, 편지책갈피 } from './교수작업실장면.js';
import { 장면만들기 } from '../contents/교수멘탈장면.js';
/**
 * G1 「교수님 멘탈 구하기」 — 격식 메일 쓰기 게임 (발주_게임모듈.md G1 · 게임층 설계).
 * 흐름: 상황과 사과 전략 선택 → 메일 쓰기(멘탈 게이지) → 답장 기다리기.
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
 *   제출 후에는 답장을 기다리는 상태만 알린다. 읽음 여부나 사람 검수 완료를 추정하지 않는다.
 *   답장 = 교정 화면(S1-8)이며 며칠 걸릴 수 있다는 기존 안내를 유지한다.
 *
 * ■ 막힘 prop 이 없다 (M7)
 *   말하기 화면이 막힘 검사 **뒤**에서만 이 화면을 그리므로, 이 화면이 사는 동안 막힘은 늘
 *   null 이다 — 죽은 값을 prop 으로 들면 실값처럼 읽힌다. 막힌 날의 큐 보류는 말하기 화면의
 *   밀기(`게임큐밀기(토큰, 막힘참조)`)가 실값으로 진다(B2).
 *
 * ■ 몽골어 병기 0 — 팩 `검수확정=false` 라 `mn` 이 없다(발주_게임콘텐츠팩 §3). 지어내지 않는다.
 * ■ 신호 1점 = **보내기 버튼**(코랄 면 · `테마.신호자리.교수멘탈`) — 말하기의 녹음 버튼과 같은 규칙.
 */

export default function 교수멘탈화면({ 재료, 토큰, 학생번호 = null, 시작단계 = '전략', 확인 = null, 확인뒤 = null, 가이드 = null }) {
  // 09-11 사용자 요청: 이 화면의 구 BGM을 제거한다. 읽기와 쓰기에 집중하도록 무음으로 둔다.
  useEffect(() => { bgm정지(); return () => bgm정지(); }, []);
  const { width, height } = useWindowDimensions();
  const 넓다 = width >= 700;
  const 좁다 = width < 380;
  const 장면너비 = Math.min(width - (좁다 ? 40 : 48), 넓다 ? Math.min(500, height * 0.28 * 1672 / 941) : 460);
  const 문서스크롤 = useRef(null);

  /* 표시 순서를 마운트 때 한 번 확정한다(`말하기화면` 녹음카드와 같은 규칙) — 매 렌더 섞으면
   * 행에 적힌 자리와 학생이 본 자리가 갈리고, 그 갈림은 증상이 없다. 추천은 시드에서 결정적. */
  const [보기] = useState(() => (재료 ? 보기세우기(사과전략.보기들, 오늘추천(재료.prompt_seed)) : null));
  const 보기뜬때 = useRef(경과시계());

  const [단계, set단계] = useState(시작단계); // 전략 | 쓰기 | 대기
  useEffect(() => { 문서스크롤.current?.scrollTo({ y: 0, animated: false }); }, [단계]);
  /* 고른 전략의 «라벨» — 쓰기 단계에 재표시(자기 설명 «연결» 축: 고른 카드가 사라지면 「내가 뭘
   * 골랐더라」가 끊긴다 · 유호 확정 08-22). 행 재료가 아니라 화면 전용이다(사건은 고르기가 이미 낸다). */
  const [고른전략라벨, set고른전략라벨] = useState(null);
  const [고른전략예문, set고른전략예문] = useState(null);
  const [로그, set로그] = useState([]);
  const [오류, set오류] = useState(null);
  const [게이지, set게이지] = useState(null);
  const 게이지참조 = useRef(null);
  const [본문있음, set본문있음] = useState(false);
  const 본문있음참조 = useRef(false);
  const [보낸메일, set보낸메일] = useState(null);
  const [편지펼침, set편지펼침] = useState(false);
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
    게임사건담기(사건).catch((e) => 관측보고(e, { spot: 'game_enqueue', game: 'G1' }));
    // 전송은 다음 마운트(말하기·게임 어느 쪽이든)의 밀기가 진다
  }, []);

  const 고르기 = async (option_id) => {
    상태참조.current = { ...상태참조.current, 단계: '쓰기' };
    set고른전략라벨(보기?.options_shown?.find((o) => o.option_id === option_id)?.label ?? null);
    set고른전략예문(장면만들기({ ...재료, 캐릭터: 가이드 }).전략.find((o) => o.option_id === option_id)?.예문 ?? null);
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
    } catch (e) { 관측보고(e, { spot: 'game_enqueue', game: 'G1' }); /* 담기 실패 — 화면 흐름은 그대로 간다(고름은 우리가 잰 것이다) */ }
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
    try { 도장햅틱(); } catch { /* 무음 */ }
    게임큐밀기(토큰, null).then(set로그, () => {}); // 화면은 안 기다린다 — 도착은 대기 카드가 말한다
  };

  /* ── 렌더 ── */

  if (!재료) {
    return (
      <ScrollView style={s.wrap} contentContainerStyle={s.inner}>
        <머리 />
        {/* 라우팅이 재료 없이 이 화면을 그렸다(배선 실수) — 못 읽은 것을 둔갑시키지 않는다. */}
        <View style={s.카드}>
          <Text style={s.본문글}>오늘의 미션을 불러오지 못했어요 — 잠시 뒤 앱을 다시 열어 주세요.</Text>
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
      // 반응은 이미 그렸다. 서버 행이 도착한 뒤 progress를 읽어야 다음 진입에
      // 답하기 전 카드를 캐시하지 않는다. 큐는 실패한 사건을 다음 복귀까지 보존한다.
      if (새것) set로그(await 게임큐밀기(토큰, null));
    } catch (e) { 관측보고(e, { spot: 'game_enqueue', game: 'G1' }); /* 담기 실패 — 반응은 이미 섰고, 다음 노출은 서버 행 기준이라 거짓 하루1회가 안 생긴다 */ }
    if (확인뒤) 확인뒤();
  };

  const 전송실패 = !!(메일항목 && !메일항목.event_id && 메일항목.send_final);
  const 전송대기 = !!(메일항목 && !메일항목.event_id && !메일항목.send_final);

  return (
    <ScrollView ref={문서스크롤} style={s.wrap} contentContainerStyle={[s.inner, 단계 === '전략' && s.inner_이야기, 좁다 && s.inner_좁음]} keyboardShouldPersistTaps="handled">
      <머리 />
      <View style={s.단계줄} accessibilityLabel={`지금은 ${단계 === '전략' ? '방법 고르기' : 단계 === '쓰기' ? '편지 쓰기' : '답장 기다리기'} 단계`}>
        {['방법 고르기', '편지 쓰기', '답장 기다리기'].map((말, i) => <View key={말} style={s.단계항목}>
          {i > 0 ? <View style={s.단계실} /> : null}
          <Text style={[s.단계글, i === ['전략', '쓰기', '대기'].indexOf(단계) && s.단계글_현재]}>{말}</Text>
        </View>)}
      </View>

      {단계 === '대기' ? <View style={s.작업실}>
        <Image source={require('../assets/장면/편지작업실.webp')} resizeMode="contain"
          style={[s.장면, { width: 장면너비, height: 장면너비 * 941 / 1672 }]}
          accessibilityLabel="몽글, 까몽, 마린이 함께 편지를 준비하는 작업실" />
        <Text style={s.종류}>교수님 멘탈 구하기</Text>
        <Text accessibilityRole="header" style={[s.제목, 넓다 && s.제목_넓음]}>
          {전송실패 ? '메일을 보내지 못했어요' : 전송대기 ? '연결되면 이어서 보내요' : '답장을 기다리고 있어요'}
        </Text>
        <Text style={s.소개글}>{전송실패 ? '메일을 보내지 못했어요. 선생님께 알려 주세요.' : 전송대기 ? '메일은 기기에 남아 있어요. 앱을 다시 열면 이어서 보내요.' : '답장은 며칠 걸릴 수 있어요.\n답장이 오면 「답장」에서 볼 수 있어요.'}</Text>
      </View> : 단계 === '쓰기' ? <View style={s.쓰기머리}>
        <Text style={s.종류}>교수님 멘탈 구하기</Text>
        <Text accessibilityRole="header" style={[s.제목, 넓다 && s.제목_넓음]}>이제, 나의 말로.</Text>
      </View> : null}

      {오류 ? <View accessibilityLiveRegion="polite" style={s.오류판}><Text style={s.오류}>{오류}</Text></View> : null}

      {단계 === '전략' && <교수작업실장면 재료={재료} 가이드={가이드} 보기={보기} onConfirm={고르기} />}

      {단계 === '쓰기' && <View style={s.내용}>
        <View style={s.받는줄}>
          <살아있는교수얼굴 size={52} />
          <View style={s.선택말}><Text style={s.카드라벨}>받는 사람</Text><Text style={s.수신자}>교수님</Text></View>
          <View style={s.편지표식}><선아이콘 종류="편지" /></View>
        </View>
        <View style={s.쓰기상황}>
          <Text style={s.본문글}>{문항.질문}</Text>
          {고른전략라벨 ? <View style={s.고른방법}>
            <Text style={s.메모}>내가 고른 방법</Text><Text style={s.방법글}>{고른전략라벨}</Text>
            <쓰기말투예시 예문={고른전략예문} />
          </View> : null}
          <Text style={s.메모}>{문항.지시문}</Text>
        </View>
        <편지책갈피 가이드={가이드} 칸이름들={칸이름들} />
        <TextInput style={s.본문입력} placeholder="교수님께 보낼 메일을 써요"
          accessibilityLabel="교수님께 보낼 메일 본문" placeholderTextColor={색.잉크_메타}
          defaultValue="" onChangeText={(t) => { 본문참조.current = t; 입력됨(t); }} multiline textAlignVertical="top" />
        <View style={s.쓰기안내}>
          <Text style={s.게이지라벨}>편지에 담긴 것</Text>
          <View style={s.게이지줄}>
            {칸이름들.map((이름) => {
              const 찼다 = !!(게이지 && 게이지.칸별[이름]);
              return <View key={이름} style={s.게이지칸}><게이지칸면 찼다={찼다} /><Text style={[s.게이지이름, 찼다 && s.게이지이름_참]}>{이름}</Text></View>;
            })}
          </View>
          <Text style={s.게이지힌트}>{빠진칸.length ? `아직 비어 있는 칸: ${빠진칸.join(' · ')}` : '다섯 칸이 다 찼어요 — 이제 보내 볼까요?'}</Text>
          <Text style={s.메모}>문법 점수가 아니라, 빠진 부분을 알려 주는 안내예요.</Text>
        </View>
        <Pressable onPress={보내기} disabled={!본문있음} accessibilityRole="button" accessibilityState={{ disabled: !본문있음 }}
          style={({ pressed, focused }) => [s.보내기버튼, !본문있음 && s.보내기_대기, focused && s.단추초점, pressed && s.눌림]}>
          <Text style={s.보내기글}>편지 보내기</Text><선아이콘 종류="다음" 어둡다 />
        </Pressable>
      </View>}

      {단계 === '대기' && <View style={s.내용}>
        {보낸메일 ? <View style={s.보낸편지}>
          <Pressable onPress={() => set편지펼침(!편지펼침)} accessibilityRole="button" accessibilityState={{ expanded: 편지펼침 }}
            style={({ pressed, hovered, focused }) => [s.편지열기, hovered && s.단추호버, focused && s.단추초점, pressed && s.눌림]}>
            <View style={s.편지제목}><선아이콘 종류="편지" /><Text style={s.방법글}>내가 보낸 편지</Text></View>
            <Text style={s.메모}>{편지펼침 ? '접기' : '펼쳐 보기'}</Text>
          </Pressable>
          {편지펼침 ? <Text style={s.편지글} selectable>{보낸메일}</Text> : null}
        </View> : null}
        {관찰 ? <Text style={s.관찰}>{관찰.글}</Text> : null}
        {확인 && !확인답 ? <View style={s.확인판}>
          <View style={s.확인머리}><Text style={s.확인제목}>나에 대한 관찰</Text><Text style={s.선택사항}>선택 사항</Text></View>
          <Text style={s.확인질문}>{String(확인.shown_text || '')}</Text>
          <View style={s.확인줄}>
            {[['맞다', '맞아요'], ['아니다', '아니에요']].map(([값, 라벨]) => <Pressable key={값} onPress={() => 확인답하기(값)} accessibilityRole="button"
              style={({ pressed, hovered, focused }) => [s.확인단추, hovered && s.단추호버, focused && s.단추초점, pressed && s.눌림]}>
              <선아이콘 종류={값 === '맞다' ? '맞음' : '아님'} /><Text style={s.확인단추글}>{라벨}</Text>
            </Pressable>)}
          </View>
          <Text style={s.메모}>지금 답하지 않아도 괜찮아요.</Text>
        </View> : null}
        {확인답 ? <View style={s.응답판} accessibilityLiveRegion="polite">
          <View style={s.확인머리}><Text style={s.확인제목}>나에 대한 관찰</Text><Text style={s.선택사항}>{확인답 === '아니다' ? '아니에요' : '맞아요'}</Text></View>
          {(반응안내(확인답) || []).map((줄, i) => <Text key={i} style={i === 0 ? s.응답글 : s.관찰_병기}>{줄}</Text>)}
        </View> : null}
      </View>}
    </ScrollView>
  );
}

// 예문을 접고 펴는 상태는 이 자리만 가진다. 본문·계측이나 선택 사건에는 닿지 않는다.
export function 쓰기말투예시({ 예문 }) {
  const [펼침, set펼침] = useState(false);
  if (!예문) return null;
  return <View style={s.말투예시}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: 펼침 }} aria-expanded={펼침}
      onPress={() => set펼침((열림) => !열림)}
      style={({ pressed, hovered, focused }) => [s.예시열기, hovered && s.단추호버, focused && s.단추초점, pressed && s.눌림]}>
      <Text style={s.예시단추글}>{펼침 ? '말투 예시 접기' : '말투 예시 다시 보기'}</Text>
      <Text style={s.예시단추글} aria-hidden>{펼침 ? '−' : '+'}</Text>
    </Pressable>
    {펼침 ? <말투예시 예문={예문} /> : null}
  </View>;
}

function 머리() {
  return <View style={s.머리}>
    <Image source={LAB로고} style={s.브랜드} resizeMode="contain" accessibilityLabel="SYNK LAB" />
    <Text style={s.머리말}>편지 작업실</Text>
  </View>;
}

function 선아이콘({ 종류, 어둡다 = false }) {
  const 선 = { borderColor: 어둡다 ? 색.바탕 : 색.잉크_태그 };
  return <View style={s.아이콘} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
    {종류 === '다음' ? <View style={[s.화살표, 선]} />
      : 종류 === '편지' ? <View style={[s.봉투, 선]}><View style={[s.봉투접힘, 선]} /></View>
      : 종류 === '맞음' ? <View style={[s.확인표식, 선]} />
      : <View style={[s.가로실, 선]} />}
  </View>;
}

/* 게이지 칸의 면 — 안내 변화만 200ms로 스며들며 줄임이면 즉시 최종값이다. */
function 게이지칸면({ 찼다 }) {
  const 줄임 = use줄임();
  const 덮개 = useRef(new Animated.Value(찼다 ? 1 : 0)).current;
  useEffect(() => {
    if (줄임) { 덮개.setValue(찼다 ? 1 : 0); return; }
    Animated.timing(덮개, {
      toValue: 찼다 ? 1 : 0, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();
  }, [찼다, 줄임, 덮개]);
  return <View style={s.게이지면}><Animated.View style={[s.게이지면_덮개, { opacity: 덮개 }]} /></View>;
}

const 어절줄바꿈 = Platform.select({ web: { wordBreak: 'keep-all', overflowWrap: 'anywhere' }, default: {} });
const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 색.바탕 },
  inner: { width: '100%', maxWidth: 736, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 88 },
  inner_이야기: { maxWidth: 1120 },
  inner_좁음: { paddingHorizontal: 20 },
  머리: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 24, marginBottom: 16 },
  브랜드: { width: 150, height: 47 },
  머리말: { fontFamily: 폰트.캡션, fontSize: 13, color: 색.잉크_보조 },
  단계줄: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  단계항목: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  단계실: { width: 20, height: 1, backgroundColor: 색.잉크_희미, marginLeft: 14 },
  단계글: { fontFamily: 폰트.캡션, fontSize: 11, lineHeight: 18, color: 색.잉크_메타 },
  단계글_현재: { fontFamily: 폰트.강조, color: 색.잉크 },
  작업실: { alignItems: 'center', paddingBottom: 32, gap: 9 },
  장면: { marginVertical: 6 },
  종류: { fontFamily: 폰트.캡션, fontSize: 12, lineHeight: 19, color: 색.잉크_태그, marginTop: 4 },
  제목: { ...어절줄바꿈, fontFamily: 폰트.강조, fontSize: 27, lineHeight: 37, letterSpacing: -0.9, color: 색.잉크 },
  제목_넓음: { fontSize: 34, lineHeight: 46, letterSpacing: -1.2 },
  소개글: { ...어절줄바꿈, fontFamily: 폰트.캡션, fontSize: 14, lineHeight: 24, color: 색.잉크_보조, textAlign: 'center' },
  쓰기머리: { gap: 8, paddingVertical: 26 },
  내용: { gap: 22 },
  카드: { paddingVertical: 30, gap: 20 },
  상황: { gap: 12, borderLeftWidth: 2, borderLeftColor: 색.실땀, paddingLeft: 18, marginVertical: 6 },
  카드라벨: { fontFamily: 폰트.캡션, fontSize: 12, lineHeight: 18, color: 색.잉크_태그 },
  상황글: { ...어절줄바꿈, fontFamily: 폰트.본문, fontSize: 18, lineHeight: 29, color: 색.잉크 },
  본문글: { ...어절줄바꿈, fontFamily: 폰트.캡션, fontSize: 14, lineHeight: 24, color: 색.잉크_보조 },
  선택라벨: { fontFamily: 폰트.강조, fontSize: 14, lineHeight: 22, color: 색.잉크, marginBottom: 4 },
  전략목록: { gap: 10, paddingTop: 8 },
  전략카드: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingVertical: 18, paddingHorizontal: 20, minHeight: 68, backgroundColor: 색.바탕띄움, borderRadius: 16 },
  선택말: { flex: 1, gap: 5 },
  전략글: { ...어절줄바꿈, fontFamily: 폰트.본문, fontSize: 16, lineHeight: 24, color: 색.잉크 },
  추천표시: { fontFamily: 폰트.캡션, fontSize: 11, color: 색.잉크_태그 },
  다음자리: { width: 30, height: 30, borderRadius: 15, backgroundColor: 색.바탕, alignItems: 'center', justifyContent: 'center' },
  받는줄: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: 색.잉크_희미 },
  수신자: { fontFamily: 폰트.강조, fontSize: 19, color: 색.잉크 },
  편지표식: { width: 42, height: 42, borderRadius: 21, backgroundColor: 색.바탕띄움, alignItems: 'center', justifyContent: 'center' },
  쓰기상황: { gap: 12 },
  고른방법: { gap: 4 },
  방법글: { fontFamily: 폰트.본문, fontSize: 14, lineHeight: 23, color: 색.잉크 },
  말투예시: { marginTop: 4, borderRadius: 12, borderWidth: 1, borderColor: 색.잉크_희미 },
  예시열기: { minHeight: 44, borderRadius: 11, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  예시단추글: { fontFamily: 폰트.캡션, fontSize: 14, lineHeight: 22, color: 색.잉크_태그 },
  본문입력: { fontFamily: 폰트.본문, fontSize: 17, lineHeight: 29, color: 색.잉크, backgroundColor: 색.바탕띄움, borderRadius: 16, padding: 22, minHeight: 250, borderWidth: 1, borderColor: 'rgba(251,247,240,0.13)' },
  쓰기안내: { gap: 12 },
  게이지라벨: { fontFamily: 폰트.강조, fontSize: 13, color: 색.잉크_태그 },
  게이지줄: { flexDirection: 'row', gap: 8 },
  게이지칸: { flex: 1, alignItems: 'center', gap: 8 },
  게이지면: { alignSelf: 'stretch', height: 5, borderRadius: 3, backgroundColor: 색.잉크_희미 },
  게이지면_덮개: { ...StyleSheet.absoluteFillObject, borderRadius: 3, backgroundColor: 색.잉크 },
  게이지이름: { fontFamily: 폰트.캡션, fontSize: 11, color: 색.잉크_보조 },
  게이지이름_참: { fontFamily: 폰트.강조, color: 색.잉크 },
  게이지힌트: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_보조, lineHeight: 19 },
  보내기버튼: { backgroundColor: 색.신호, borderRadius: 16, minHeight: 56, padding: 16, flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center' },
  보내기_대기: { backgroundColor: 색.잉크_희미 },
  보내기글: { fontFamily: 폰트.강조, fontSize: 16, color: 색.바탕 },
  눌림: { opacity: 눌림감.면, transform: [{ scale: 0.99 }] },
  단추호버: { backgroundColor: 'rgba(251,247,240,0.10)' },
  단추초점: Platform.select({ web: { outlineStyle: 'solid', outlineWidth: 2, outlineColor: 색.실땀, outlineOffset: 4 }, default: {} }),
  확인판: { gap: 20, padding: 24, borderRadius: 20, backgroundColor: 'rgba(77,82,119,0.24)', borderWidth: 1, borderColor: 'rgba(171,175,207,0.14)' },
  확인머리: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  확인제목: { fontFamily: 폰트.강조, fontSize: 12, lineHeight: 18, color: 색.잉크_태그 },
  선택사항: { fontFamily: 폰트.캡션, fontSize: 11, color: 색.잉크_보조 },
  확인질문: { ...어절줄바꿈, fontFamily: 폰트.본문, fontSize: 19, lineHeight: 30, letterSpacing: -0.3, color: 색.잉크 },
  확인줄: { flexDirection: 'row', gap: 12 },
  확인단추: { flex: 1, minHeight: 50, borderWidth: 1, borderColor: 'rgba(251,247,240,0.26)', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9 },
  확인단추글: { fontFamily: 폰트.강조, fontSize: 15, color: 색.잉크 },
  응답판: { padding: 24, borderRadius: 20, backgroundColor: 'rgba(77,82,119,0.24)', gap: 19 },
  응답글: { fontFamily: 폰트.본문, fontSize: 19, lineHeight: 31, color: 색.잉크 },
  관찰: { fontFamily: 폰트.캡션, fontSize: 14, lineHeight: 23, color: 색.잉크_보조 },
  관찰_병기: { fontFamily: 몽골어폰트.캡션, fontSize: 14, lineHeight: 23, color: 색.잉크_보조 },
  보낸편지: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: 색.잉크_희미 },
  편지열기: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 64, gap: 14, paddingHorizontal: 4 },
  편지제목: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  편지글: { fontFamily: 폰트.본문, fontSize: 16, lineHeight: 28, color: 색.잉크, paddingTop: 10, paddingBottom: 24 },
  오류판: { padding: 18, borderWidth: 1, borderColor: 색.잉크_희미, borderRadius: 12, marginBottom: 24 },
  오류: { fontFamily: 폰트.강조, fontSize: 14, color: 색.잉크, lineHeight: 23 },
  메모: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_보조, lineHeight: 20 },
  아이콘: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  화살표: { width: 7, height: 7, borderTopWidth: 1.5, borderRightWidth: 1.5, transform: [{ rotate: '45deg' }] },
  봉투: { width: 18, height: 13, borderWidth: 1.5, borderRadius: 3, overflow: 'hidden', alignItems: 'center' },
  봉투접힘: { width: 11, height: 11, borderBottomWidth: 1.5, borderRightWidth: 1.5, transform: [{ rotate: '45deg' }, { translateX: -4 }, { translateY: -4 }] },
  확인표식: { width: 11, height: 6, borderBottomWidth: 1.5, borderLeftWidth: 1.5, transform: [{ rotate: '-45deg' }, { translateY: -1 }] },
  가로실: { width: 11, borderTopWidth: 1.5 },
});
