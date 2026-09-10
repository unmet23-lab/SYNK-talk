import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { 색, 폰트, 몽골어폰트, 판눈금, 눌림감 } from './테마';
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

/* NPC 교수님 — 상대역. 이 모듈의 NPC 는 «상태 전이 자리»(판 시작·완료)에서만
 * 바뀐다(게임층 설계 §4 규격 3) — 입력 중 움직이는 장치는 동시에 하나여야 하고, 그 하나는
 * 이미 이 화면의 게이지가 쥐고 있다. 실시간 3단은 G3(알바변명) 전용이다. */
import NPC from './NPC.js';
import { 내부로고 } from './브랜드자산.js';
import { 전이상태 } from '../lib/NPC연출.js';
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

export default function 교수멘탈화면({ 재료, 토큰, 학생번호 = null, 시작단계 = '전략', 확인 = null, 확인뒤 = null }) {
  // 09-11 사용자 요청: 이 화면의 구 BGM을 제거한다. 새 음원 파일 검증 전에는 무음이다.
  useEffect(() => { bgm정지(); return () => bgm정지(); }, []);
  const { width } = useWindowDimensions();
  const 넓다 = width >= 940;
  const 좁다 = width < 380;

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
    게임사건담기(사건).catch((e) => 관측보고(e, { spot: 'game_enqueue', game: 'G1' }));
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
  const 소개제목 = 단계 === '전략' ? '어떤 말로\n다가갈까요?'
    : 단계 === '쓰기' ? '마음을 담아\n써 보세요.'
    : 전송실패 ? '편지를 아직\n보내지 못했어요.'
    : 전송대기 ? '편지를\n전하고 있어요.' : '교수님께\n편지를 보냈어요.';
  const 소개글 = 단계 === '전략' ? '상황을 읽고, 나에게 맞는\n말 건네는 방법을 골라요.'
    : 단계 === '쓰기' ? '방금 고른 방법으로\n한 통의 메일을 써 볼까요?'
    : '답장이 도착하면\n「답장」에서 볼 수 있어요.';

  return (
    <ScrollView style={s.wrap} contentContainerStyle={[s.inner, 넓다 && s.inner_넓음]} keyboardShouldPersistTaps="handled">
      <머리 />
      <View style={[s.지면, 넓다 && s.지면_넓음]}>
        <View style={[s.소개, 넓다 && s.소개_넓음]}>
          <View style={s.소개말}>
            <Text style={s.종류}>교수님 멘탈 구하기</Text>
            <Text accessibilityRole="header" style={[s.소개제목, 넓다 && s.소개제목_넓음]}>{소개제목}</Text>
            <Text style={s.소개글}>{소개글}</Text>
          </View>
          <View style={[s.NPC자리, 좁다 && s.NPC자리_좁음, 넓다 && s.NPC자리_넓음]}>
            <NPC 역="prof" 상태={전이상태(단계 === '대기' && !전송실패 ? '완료' : '시작')} 크기={넓다 ? 252 : 좁다 ? 102 : 132} />
          </View>
        </View>

        <View style={s.내용}>
          {오류 ? <View accessibilityLiveRegion="polite" style={s.오류판}><Text style={s.오류}>{오류}</Text></View> : null}

          {단계 === '전략' && (
            <View style={s.카드}>
              <View style={s.상황}>
                <Text style={s.카드라벨}>지금 상황</Text>
                <Text style={s.상황글}>{문항.질문}</Text>
                <Text style={s.본문글}>{문항.지시문}</Text>
              </View>
              {보기 ? <View style={s.전략목록}>
                <Text style={s.선택라벨}>어떻게 다가갈까요?</Text>
                {보기.options_shown.map((o) => (
                  <Pressable key={o.option_id} onPress={() => 고르기(o.option_id)} accessibilityRole="button"
                    style={({ pressed, hovered, focused }) => [s.전략카드, hovered && s.단추호버, focused && s.단추초점, pressed && s.눌림]}>
                    <View style={s.선택말}>
                      <Text style={s.전략글}>{o.label}</Text>
                      {보기.recommended_option === o.option_id ? <Text style={s.추천표시}>오늘의 추천</Text> : null}
                    </View>
                    <선아이콘 종류="다음" />
                  </Pressable>
                ))}
                <Text style={s.메모}>방법을 고른 다음, 직접 메일을 써요.</Text>
              </View> : null}
            </View>
          )}

          {단계 === '쓰기' && (
            <View style={s.카드}>
              <View style={s.받는줄}>
                <View style={s.편지표식}><선아이콘 종류="편지" /></View>
                <View style={s.선택말}><Text style={s.카드라벨}>받는 사람</Text><Text style={s.수신자}>교수님</Text></View>
              </View>
              {문항.질문 ? <Text style={s.본문글}>{문항.질문}</Text> : null}
              {고른전략라벨 ? <View style={s.고른방법}><Text style={s.메모}>내가 고른 방법</Text><Text style={s.방법글}>{고른전략라벨}</Text></View> : null}
              <Text style={s.메모}>{문항.지시문}</Text>
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
            </View>
          )}

          {단계 === '대기' && (
            <>
              <View style={s.도착판}>
                <View style={s.도착머리}><View style={s.도착표식}><선아이콘 종류="편지" /></View><Text style={s.카드라벨}>{전송실패 ? '전송을 확인해 주세요' : 전송대기 ? '전송 대기' : '보냈어요'}</Text></View>
                <Text accessibilityRole="header" style={s.대기제목}>{전송실패 ? '메일을 보내지 못했어요' : 전송대기 ? '연결되면 이어서 보내요' : '답장을 기다리고 있어요'}</Text>
                <Text style={s.본문글}>{전송실패 ? '메일을 보내지 못했어요. 선생님께 알려 주세요.' : 전송대기 ? '메일은 기기에 남아 있어요. 앱을 다시 열면 이어서 보내요.' : '답장은 며칠 걸릴 수 있어요. 답장이 오면 「답장」에서 볼 수 있어요.'}</Text>
                <View style={s.편지길}><Text style={s.길글}>내 편지</Text><View style={s.잇는실} /><Text style={s.길글}>답장 준비</Text><View style={s.잇는실} /><Text style={s.길글}>답장</Text></View>
              </View>

              {관찰 ? <Text style={s.관찰}>{관찰.글}</Text> : null}
              {확인 && !확인답 ? (
                <View style={s.확인판}>
                  <View style={s.확인머리}><Text style={s.확인제목}>나에 대한 관찰</Text><Text style={s.선택사항}>선택 사항</Text></View>
                  <Text style={s.확인질문}>{String(확인.shown_text || '')}</Text>
                  <View style={s.확인줄}>
                    {[['맞다', '맞아요'], ['아니다', '아니에요']].map(([값, 라벨]) => (
                      <Pressable key={값} onPress={() => 확인답하기(값)} accessibilityRole="button"
                        style={({ pressed, hovered, focused }) => [s.확인단추, hovered && s.단추호버, focused && s.단추초점, pressed && s.눌림]}>
                        <선아이콘 종류={값 === '맞다' ? '맞음' : '아님'} /><Text style={s.확인단추글}>{라벨}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={s.메모}>지금 답하지 않아도 괜찮아요.</Text>
                </View>
              ) : null}
              {확인답 ? <View style={s.응답판} accessibilityLiveRegion="polite">
                <View style={s.확인머리}><Text style={s.확인제목}>나에 대한 관찰</Text><Text style={s.선택사항}>{확인답 === '아니다' ? '아니에요' : '맞아요'}</Text></View>
                {(반응안내(확인답) || []).map((줄, i) => <Text key={i} style={i === 0 ? s.응답글 : s.관찰_병기}>{줄}</Text>)}
              </View> : null}
              {보낸메일 ? <View style={s.보낸편지}><Text style={s.카드라벨}>내가 보낸 편지</Text><Text style={s.편지글} selectable>{보낸메일}</Text></View> : null}
            </>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function 머리() {
  return <View style={s.머리}>
    <Image source={내부로고} style={s.브랜드} resizeMode="contain" accessibilityLabel="SYNK" />
    <View style={s.머리구분} /><Text style={s.머리말}>말을 건네는 연습</Text>
  </View>;
}

// 선으로 그리는 조작 아이콘. 비트맵 확대 없이 모든 화면 배율에서 같은 굵기를 유지한다.
function 선아이콘({ 종류, 어둡다 = false }) {
  const 선 = { borderColor: 어둡다 ? 색.바탕 : 색.잉크_태그 };
  return <View style={s.아이콘} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
    {종류 === '다음' ? <View style={[s.화살표, 선]} />
      : 종류 === '편지' ? <View style={[s.봉투, 선]}><View style={[s.봉투접힘, 선]} /></View>
      : 종류 === '맞음' ? <View style={[s.확인표식, 선]} />
      : <View style={[s.가로실, 선]} />}
  </View>;
}

/* 게이지 칸의 면 — 채울 때도 빠질 때도 같은 200ms 로 스며든다(채점 아님 · 안내 설계 유지).
 * 덮개는 opacity 하나만 만진다 — 바닥(잉크_희미)은 불변이다. 줄임이면 즉시 최종값. */
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
  inner: { width: '100%', maxWidth: 1184, alignSelf: 'center', padding: 22, paddingTop: 24, paddingBottom: 64 },
  inner_넓음: { padding: 44, paddingTop: 32, paddingBottom: 88 },
  머리: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingBottom: 23, borderBottomWidth: 1, borderBottomColor: 'rgba(251,247,240,0.10)' },
  브랜드: { width: 83, height: 30 },
  머리구분: { width: 1, height: 15, backgroundColor: 색.잉크_희미 },
  머리말: { fontFamily: 폰트.캡션, fontSize: 13, color: 색.잉크_보조 },
  지면: { paddingTop: 30, gap: 26 },
  지면_넓음: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 52, gap: 56 },
  소개: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  소개_넓음: { width: 302, flexDirection: 'column', alignItems: 'stretch', gap: 20, paddingTop: 4 },
  소개말: { flex: 1, gap: 12 },
  종류: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_보조, letterSpacing: 0.2 },
  소개제목: { ...어절줄바꿈, fontFamily: 폰트.강조, fontSize: 27, lineHeight: 37, letterSpacing: -0.9, color: 색.잉크 },
  소개제목_넓음: { fontSize: 39, lineHeight: 52, letterSpacing: -1.4, marginTop: 4 },
  소개글: { fontFamily: 폰트.캡션, fontSize: 13, lineHeight: 22, color: 색.잉크_보조 },
  NPC자리: { width: 122, alignItems: 'center', justifyContent: 'center' },
  NPC자리_좁음: { width: 92 },
  NPC자리_넓음: { width: '100%', marginTop: 10, paddingBottom: 10 },
  내용: { flex: 1, minWidth: 0, gap: 24 },
  카드: { backgroundColor: 색.바탕띄움, borderRadius: 판눈금.반경, padding: 26, gap: 20 },
  상황: { gap: 15, paddingBottom: 8 },
  카드라벨: { fontFamily: 폰트.캡션, fontSize: 12, lineHeight: 18, color: 색.잉크_태그 },
  상황글: { ...어절줄바꿈, fontFamily: 폰트.강조, fontSize: 23, lineHeight: 34, letterSpacing: -0.5, color: 색.잉크 },
  본문글: { ...어절줄바꿈, fontFamily: 폰트.캡션, fontSize: 15, lineHeight: 25, color: 색.잉크_보조 },
  선택라벨: { fontFamily: 폰트.강조, fontSize: 15, color: 색.잉크, marginBottom: 2 },
  전략목록: { gap: 12, paddingTop: 22, borderTopWidth: 1, borderTopColor: 'rgba(251,247,240,0.12)' },
  전략카드: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 18, padding: 17, minHeight: 70, borderWidth: 1, borderColor: 'rgba(251,247,240,0.20)', borderRadius: 12 },
  선택말: { flex: 1, gap: 6 },
  전략글: { ...어절줄바꿈, fontFamily: 폰트.본문, fontSize: 16, lineHeight: 25, color: 색.잉크 },
  추천표시: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_보조 },
  받는줄: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(251,247,240,0.12)' },
  편지표식: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: 색.바탕 },
  수신자: { fontFamily: 폰트.강조, fontSize: 19, color: 색.잉크 },
  고른방법: { gap: 5, paddingVertical: 2 },
  방법글: { fontFamily: 폰트.본문, fontSize: 14, lineHeight: 22, color: 색.잉크 },
  본문입력: { fontFamily: 폰트.본문, fontSize: 17, lineHeight: 29, color: 색.잉크, backgroundColor: 색.바탕, borderWidth: 1, borderColor: 'rgba(251,247,240,0.20)', borderRadius: 12, padding: 20, minHeight: 240 },
  쓰기안내: { gap: 10, paddingVertical: 2 },
  게이지라벨: { fontFamily: 폰트.강조, fontSize: 13, color: 색.잉크_태그 },
  게이지줄: { flexDirection: 'row', gap: 8 },
  게이지칸: { flex: 1, alignItems: 'center', gap: 8 },
  게이지면: { alignSelf: 'stretch', height: 5, borderRadius: 3, backgroundColor: 색.잉크_희미 },
  게이지면_덮개: { ...StyleSheet.absoluteFillObject, borderRadius: 3, backgroundColor: 색.잉크 },
  게이지이름: { fontFamily: 폰트.캡션, fontSize: 11, color: 색.잉크_보조 },
  게이지이름_참: { fontFamily: 폰트.강조, color: 색.잉크 },
  게이지힌트: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_보조, lineHeight: 19 },
  보내기버튼: { backgroundColor: 색.신호, borderRadius: 12, minHeight: 54, padding: 16, flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center' },
  보내기_대기: { backgroundColor: 색.잉크_희미 },
  보내기글: { fontFamily: 폰트.강조, fontSize: 16, color: 색.바탕 },
  눌림: { opacity: 눌림감.면, transform: [{ scale: 0.96 }] },
  단추호버: { backgroundColor: 'rgba(251,247,240,0.05)' },
  단추초점: Platform.select({ web: { outlineStyle: 'solid', outlineWidth: 2, outlineColor: 색.실땀, outlineOffset: 4 }, default: {} }),
  도착판: { borderRadius: 판눈금.반경, padding: 28, gap: 18, backgroundColor: 색.바탕띄움 },
  도착머리: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  도착표식: { width: 36, height: 36, borderRadius: 10, backgroundColor: 색.바탕, alignItems: 'center', justifyContent: 'center' },
  대기제목: { ...어절줄바꿈, fontFamily: 폰트.강조, fontSize: 24, lineHeight: 34, letterSpacing: -0.5, color: 색.잉크 },
  편지길: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 22, marginTop: 4, borderTopWidth: 1, borderTopColor: 'rgba(251,247,240,0.12)' },
  길글: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_보조 },
  잇는실: { flex: 1, height: 1, backgroundColor: 'rgba(251,247,240,0.20)' },
  확인판: { gap: 20, padding: 26, paddingTop: 12 },
  확인머리: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  확인제목: { fontFamily: 폰트.강조, fontSize: 14, color: 색.잉크_태그 },
  선택사항: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_보조 },
  확인질문: { ...어절줄바꿈, fontFamily: 폰트.본문, fontSize: 20, lineHeight: 32, letterSpacing: -0.4, color: 색.잉크 },
  확인줄: { flexDirection: 'row', gap: 12 },
  확인단추: { flex: 1, minHeight: 54, borderWidth: 1, borderColor: 'rgba(251,247,240,0.28)', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9 },
  확인단추글: { fontFamily: 폰트.강조, fontSize: 15, color: 색.잉크 },
  응답판: { padding: 26, paddingTop: 12, gap: 19 },
  응답글: { fontFamily: 폰트.본문, fontSize: 19, lineHeight: 31, color: 색.잉크 },
  관찰: { fontFamily: 폰트.캡션, fontSize: 14, lineHeight: 23, color: 색.잉크_보조, paddingHorizontal: 26 },
  관찰_병기: { fontFamily: 몽골어폰트.캡션, fontSize: 14, lineHeight: 23, color: 색.잉크_보조 },
  보낸편지: { padding: 26, gap: 16, borderTopWidth: 1, borderTopColor: 'rgba(251,247,240,0.12)' },
  편지글: { fontFamily: 폰트.본문, fontSize: 16, lineHeight: 28, color: 색.잉크 },
  오류판: { padding: 18, borderWidth: 1, borderColor: 색.잉크_희미, borderRadius: 12 },
  오류: { fontFamily: 폰트.강조, fontSize: 14, color: 색.잉크, lineHeight: 23 },
  메모: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_보조, lineHeight: 20 },
  아이콘: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  화살표: { width: 7, height: 7, borderTopWidth: 1.5, borderRightWidth: 1.5, transform: [{ rotate: '45deg' }] },
  봉투: { width: 18, height: 13, borderWidth: 1.5, borderRadius: 3, overflow: 'hidden', alignItems: 'center' },
  봉투접힘: { width: 11, height: 11, borderBottomWidth: 1.5, borderRightWidth: 1.5, transform: [{ rotate: '45deg' }, { translateX: -4 }, { translateY: -4 }] },
  확인표식: { width: 11, height: 6, borderBottomWidth: 1.5, borderLeftWidth: 1.5, transform: [{ rotate: '-45deg' }, { translateY: -1 }] },
  가로실: { width: 11, borderTopWidth: 1.5 },
});
