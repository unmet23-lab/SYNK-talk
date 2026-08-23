import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { 색, 폰트, 모노트래킹 } from './테마';
import { 짚음제출사건, 무산출사건, 이탈사건 } from '../lib/보고서교정제출.js';
import { 교정문만들기 } from '../lib/보고서교정.js';
import { 다음시도번호, 턴항목 } from '../lib/게임로그.js';
import { 흐름id, 깨진기록안내 } from '../lib/제출로그.js';
import { 몽골날짜 } from '../lib/오늘과제.js';
/* 게임 로그의 읽기·쓰기·전송은 **직렬 통로 하나**로만 간다(B3 · `src/게임큐.js`) — 화면이
 * 저장을 직접 잡으면 동시 쓰기가 파일을 덮어 남의 사건을 지운다(오류 없이 「성공」의 모양). */
import { 게임큐읽기, 게임사건담기, 게임큐밀기, 게임이탈수거 } from './게임큐.js';
import { 효과음 } from './소리.js';

/**
 * G2 「보고서 교정」 — 어색한 문장에서 이상한 어절 하나를 짚어 그 자리만 고치는 게임
 * (발주_게임모듈.md G2 §4 · 3단계 ②화면).
 * 흐름: 3턴 × (문장 → 어절 탭 → 그 어절만 고쳐 쓰기 → 제출) → 「선생님이 보고 알려 줄 거예요」.
 *
 * ■ 재료는 **라우팅이 편다** (`src/말하기화면.js` → `게임재료` → `앉음재료`)
 *   이 화면이 받는 `벌` 은 그 3벌이다 — 검수확정 게이트·문항 편성·스냅샷 조립이 전부 그 한
 *   곳에 살아서, 못 펴는 판·미검수 판은 여기 오기 전에 말하기 폴백으로 내려간다(H5).
 *   🚫 화면이 `앉음편성`·`G2스냅샷` 을 직접 부르지 않는다 — 그러면 「그날 학생이 본 것」의 조립이
 *   두 곳이 되고, 갈라지는 날 **행에 적힌 문항과 화면에 뜬 문항이 다르다**(증상 없음).
 *
 * ■ 🔴 앉음 «안»에서는 피드백 0 (설계 `강사_반단위_피드백_설계.md` · 채택된 ㉡ 서버 판정)
 *   1턴에 맞았다·틀렸다를 주면 2·3턴의 `selected_option`·`latency_ms` 가 탐지 능력이 아니라
 *   **방금 받은 힌트에 대한 반응**이 된다(재는 층이 값을 바꾼다 — 숨은 시계와 같은 논리).
 *   ⚠ 더구나 이 기기엔 **정답이 없다** — `정답` 은 G2 학생공개키 밖이라(`lib/게임스냅샷.js`)
 *   화면이 판정하려야 할 수 없다. 그래서 「틀림」이라는 글자가 이 화면엔 아예 없다.
 *
 * ■ 🔴 controlled TextInput 금지 (발주 G2 §4-4 ⚙ · G1 과 같은 규칙)
 *   값은 `defaultValue` + `onChangeText` 로 **ref 에만** 담는다 — 매 글자 state 로 되돌려 넣으면
 *   한글 조합이 깨져(「안녕하세요」→「안녀ㅇ하세요」) **학생 오류가 아니라 우리 버그가 코퍼스에
 *   라벨로 박힌다.** 제출 버튼의 켜짐 판정도 그래서 state 가 아니라 ref 를 본다.
 *
 * ■ 🔴 숨은 시계 (유호 확정 · 발주 §6)
 *   화면에 시계·초·숫자·퍼센트 0. 탐지 지연(`latency_ms`)은 경과 시계로 몰래 잰다.
 *
 * ■ 🔑 세 갈래를 섞지 않는다 (c4 판정 · §5 A행)
 *   짚음 / 「고칠 곳 없음」(`rejected_all`) / 무반응(`skipped`)은 **각각 다른 사실**이다.
 *   ⚠ 이 판에 「건너뛰기」 버튼은 **없다** — 「고칠 곳 없음」 옆에 나란히 두면 학생 눈에 둘이
 *   같은 탈출구로 보이고, 그 순간 두 신호가 섞인다(합치면 「우리 문항이 다 틀렸다」와 「관심
 *   없었다」를 엔진이 같은 신호로 배운다). 그래서 `skipped` 는 지금 생산자가 없고, 그건 거짓이
 *   아니라 참이다 — 이 화면엔 건너뛸 길이 없다. 시간 초과를 붙이는 날 이 자리가 그 문이다.
 *
 * ■ 🔑 관찰 한 줄(`lib/돌려주기.js`)은 안 얹는다 — 그 조립은 `choice.selected`(전략)와
 *   `compose_meta`(되돌림)를 재료로 쓰는데 G2 엔 둘 다 없다. 빈 재료로 부르면 늘 null 이라
 *   「관찰이 없다」와 「관찰을 못 잰다」가 같은 모양이 된다.
 *
 * ■ 신호 1점 = **짚은 어절**(코랄 면 · `테마.신호자리.보고서교정`) — 발주 §4-2 「탭하면 그
 *   어절이 Coral Wash 면으로」의 다크판 실물이다. 그래서 제출 버튼은 크림 면 + Navy 2 글자
 *   (테마 머리말의 기본 버튼)다 — 둘 다 코랄이면 한 화면에 신호가 둘이 된다(R1 위반).
 *
 * ■ 몽골어 병기 0 — 팩 `검수확정=false` 라 `mn` 이 없다(발주_게임콘텐츠팩 §3). 지어내지 않는다.
 */

/* 경과 시계 — `src/말하기화면.js`·`src/교수멘탈화면.js` 와 같은 판정(벽시계 금지 · 없으면 null
 * = 「안 쟀다」). ⚠ 세 번째 사본이라 공용 통로로 뗄 자리다(CLAUDE.md 신뢰성 규칙 — 이 커밋은
 * 화면 트랙이라 여기서 옮기면 세 화면을 한꺼번에 건드리게 된다). */
const 경과시계 = () =>
  (typeof performance !== 'undefined' && performance && typeof performance.now === 'function'
    ? performance.now() : null);

export default function 보고서교정화면({
  벌, 토큰, 학생번호 = null, 시작턴 = 0, 시작단계 = '짚기', 시작짚은것 = null,
}) {
  const 성립 = Array.isArray(벌) && 벌.length > 0;

  const [턴, set턴] = useState(시작턴);
  const [단계, set단계] = useState(시작단계); // 짚기 | 고침 | 대기
  const [짚은것, set짚은것] = useState(시작짚은것);
  const [로그, set로그] = useState([]);
  const [오류, set오류] = useState(null);
  const [낸것, set낸것] = useState([]); // 이 앉음에서 이미 나간 문장 — 대기 카드가 되보여 준다
  /* Ⅲ⑦(유호 확정 08-22) — 확신도 기호식(라디오 `?`·`??` 와 같은 뜻·같은 값). 문구·값의 정본은
   * lib(조립기)가 지고 화면은 토글 배치만 한다. 표기는 선택이다 — 안 누르면 키 자체가 안 실린다. */
  const [확신도, set확신도] = useState(null);
  const 이번참조용키 = 턴 != null ? String(턴) : '';
  useEffect(() => { set확신도(null); }, [이번참조용키]);   // 문항이 넘어가면 표기도 새로 — 이월은 거짓 표기다

  /* 한 앉음 = 한 correlation_id (발주 G2 §6-1 「3문장이 한 자리에서 나왔다는 사실은 그 순간에만
   * 안다」). 3턴이 **같은 값**을 쓰고, 큐에서 셋을 가르는 것은 항목 id 의 턴 칸이다. */
  const 앉음 = useRef(흐름id()).current;
  const 시작날짜 = useRef(몽골날짜());

  /* 입력의 최신본은 ref 가 쥔다 — state 로 쥐면 controlled 가 된다(머리말 ⚙).
   * 🔑 「비었으니 제출 막기」를 두지 않는다 — 빈 칸은 **그 어절을 지우는 교정**이라 정상 입력이다
   *   (`중복:불필요` · `lib/보고서교정.정규화` 가 남는 이중 공백을 접는 그 자리). 막으면 이
   *   게임이 표현할 수 있는 교정 한 종류가 통째로 사라진다. */
  const 입력참조 = useRef('');
  /* 탐지 지연 — 문장이 뜬 때부터 **첫 탭**까지(§5 A행). 턴마다 새로 잰다. */
  const 문장뜬때 = useRef(경과시계());
  const 지연참조 = useRef(null);
  /* 이탈 판정 재료 — cleanup 은 낡은 state 를 보므로 ref 하나가 최신을 쥔다. */
  const 상태참조 = useRef({ 단계: 시작단계, 글: '', 냈나: false });

  const 이번 = 성립 ? 벌[Math.min(턴, 벌.length - 1)] : null;

  /* 마운트: 큐를 읽고 — 이미 낸 턴은 건너뛰고(다시 내지 않는다) — 밀린 것을 민다.
   * 읽기·밀기 전부 직렬 통로다(B3). */
  useEffect(() => {
    let 살아있음 = true;
    (async () => {
      try {
        const { 로그: 저장된, 깨진줄 } = await 게임큐읽기();
        if (!살아있음) return;
        set로그(저장된);
        const 깨짐 = 깨진기록안내(깨진줄);
        if (깨짐) set오류(깨짐);
        if (성립) {
          /* 🔑 이어서 연다 — 껐다 켠 학생이 1턴부터 다시 하지 않고, 낸 턴이 두 번 나가지도
           * 않는다. 판정은 큐 한 곳이다(`턴항목` — 짚음·무산출 두 갈래를 한 판정으로 본다). */
          const 낸문장 = [];
          let 다음턴 = 벌.length;
          for (let i = 0; i < 벌.length; i += 1) {
            const 항목 = 턴항목(저장된, 벌[i].task_ref, 벌[i].문항id);
            if (!항목) { 다음턴 = i; break; }
            const 낸글 = 항목.사건 && 항목.사건.submission
              && 항목.사건.submission.body_original;
            if (낸글) 낸문장.push(낸글);
          }
          set낸것(낸문장);
          if (다음턴 >= 벌.length) {
            상태참조.current = { ...상태참조.current, 단계: '대기', 냈나: true };
            set단계('대기');
          } else if (다음턴 !== 0) {
            set턴(다음턴);
            문장뜬때.current = 경과시계();
          }
        }
        /* 죽은 배정 수거(H2) — 기준은 서버 task_ref 끼리의 대조다. 밀기 전에 걷어야 걷은 것이
         * 바로 아래 밀기로 나간다. G1 이 남긴 앉음도 여기서 걷힌다(배출구는 넓을수록 옳다). */
        await 게임이탈수거(성립 ? 벌[0].task_ref : null).catch(() => {});
        /* 막힘 = null — 이 화면은 막힘 검사 뒤에서만 산다(말하기화면 M7 과 같은 자리). */
        const 민뒤 = await 게임큐밀기(토큰, null);
        if (살아있음) set로그(민뒤);
      } catch (e) {
        if (살아있음) set오류(String((e && e.message) || e));
      }
    })();
    return () => { 살아있음 = false; };
  }, []);

  /* 🔴 고치다 나감 = `session.abandoned` — **날을 건넌 되세움에서만** 낸다(발주 §5 이탈 행).
   *   같은 날의 이동은 이탈이 아니다(끊긴 것을 막혔다로 말하지 않는다). 앉음 하나에 이탈도
   *   하나다 — 턴 칸이 없는 사건이라 큐가 알아서 접는다. */
  useEffect(() => () => {
    const s = 상태참조.current;
    if (s.냈나 || s.단계 !== '고침' || !s.글.trim()) return;
    if (몽골날짜() === 시작날짜.current) return;
    const 사건 = 이탈사건(벌 && 벌[0], { correlation_id: 앉음, idempotency_key: 흐름id() });
    if (!사건) return;
    게임사건담기(사건).catch(() => { /* 기록 실패 — 관측을 지어내지 않는다 */ });
  }, []);

  /** 그 턴을 닫고 다음으로 — 마지막 턴이면 대기 카드로. */
  const 턴넘기기 = (낸글) => {
    입력참조.current = '';
    지연참조.current = null; // 턴마다 새로 잰다 — 앞 턴의 지연이 다음 턴 사건에 실리면 안 된다
    set짚은것(null);
    if (낸글) set낸것((앞) => 앞.concat([낸글]));
    const 다음 = 턴 + 1;
    if (다음 >= 벌.length) {
      상태참조.current = { 단계: '대기', 글: '', 냈나: true };
      set단계('대기');
      /* 발송 성취음 1회 — G1 「발송」과 **같은 뜻**이다(보냈다). 🚫 정답 신호가 아니다: 이
       * 기기엔 정답이 없다. 킷 규칙 ② 실패음 없음이라 짝이 되는 소리도 없다. */
      try { 효과음('achieve'); } catch { /* 무음 — 소리가 흐름을 막지 않는다 */ }
      return;
    }
    상태참조.current = { 단계: '짚기', 글: '', 냈나: false };
    set턴(다음);
    set단계('짚기');
    문장뜬때.current = 경과시계();
  };

  /** 담기 — 실패하면 흐름을 넘기지 않는다(기기에 못 남긴 제출을 「냈다」로 적지 않는다). */
  const 담아넘기기 = async (사건, 낸글) => {
    try {
      const { 로그: 더한 } = await 게임사건담기(사건);
      set로그(더한);
    } catch (e) {
      set오류(String((e && e.message) || e));
      return;
    }
    턴넘기기(낸글);
    게임큐밀기(토큰, null).then(set로그, () => {}); // 화면은 안 기다린다
  };

  const 어절짚기 = (option_id) => {
    if (짚은것 === null && 문장뜬때.current !== null) {
      /* 첫 탭까지의 지연만 값이다 — 다시 고르는 탭에서 덮으면 「빨리 알아챘다」가 사라진다. */
      지연참조.current = 경과시계() - 문장뜬때.current;
    }
    set짚은것(option_id);
    상태참조.current = { ...상태참조.current, 단계: '고침' };
    set단계('고침');
  };

  const 고칠곳없음 = async () => {
    if (!이번) return;
    const 사건 = 무산출사건(이번, {
      전량거절: true,
      건너뜀: false,
      latency_ms: 지연참조.current,
      attempt_no: 다음시도번호(로그, 이번.task_ref, 이번.문항id),
      correlation_id: 앉음,
      idempotency_key: 흐름id(),
    });
    if (!사건) {
      set오류('답을 다시 담아 볼게요! 잠시 뒤 다시 눌러 주세요');
      return;
    }
    await 담아넘기기(사건, null);
  };

  const 제출 = async () => {
    if (!이번 || !짚은것) return;
    const 교정문 = 교정문만들기(이번.보기, 짚은것, 입력참조.current);
    if (교정문 === null) {
      set오류('고친 문장을 다시 담아 볼게요! 잠시 뒤 다시 눌러 주세요');
      return;
    }
    let 현재로그 = 로그;
    try {
      ({ 로그: 현재로그 } = await 게임큐읽기()); // attempt 는 그 순간의 파일에서 센다
    } catch { /* 못 읽어도 화면 로그로 잇는다 — 항목 id 가 중복을 접는다 */ }
    const 사건 = 짚음제출사건(이번, {
      교정문,
      고른것: 짚은것,
      확신도,
      latency_ms: 지연참조.current,
      attempt_no: 다음시도번호(현재로그, 이번.task_ref, 이번.문항id),
      correlation_id: 앉음,
      idempotency_key: 흐름id(),
    });
    if (!사건) {
      set오류('고친 문장을 다시 담아 볼게요! 잠시 뒤 다시 눌러 주세요');
      return;
    }
    await 담아넘기기(사건, 교정문);
  };

  /* ── 렌더 ── */

  if (!성립 || !이번) {
    return (
      <ScrollView style={s.wrap} contentContainerStyle={s.inner}>
        <머리 />
        {/* 라우팅이 재료 없이 이 화면을 그렸다 — 못 읽은 것을 둔갑시키지 않는다(G1 과 같은 자리). */}
        <View style={s.카드}>
          <Text style={s.본문글}>오늘의 미션을 읽지 못했어요 — 잠시 뒤 앱을 다시 열어 주세요.</Text>
          {학생번호 ? <Text style={s.메모}>계속 그러면 선생님께 학생번호 {학생번호}를 보여 주세요.</Text> : null}
        </View>
      </ScrollView>
    );
  }

  const 짚은어절 = 짚은것
    ? (이번.보기.find((o) => o.option_id === 짚은것) || null)
    : null;

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
      <머리 />
      {오류 && <Text style={s.오류}>{오류}</Text>}

      {단계 !== '대기' && (
        <>
          <View style={s.카드}>
            <Text style={s.카드라벨}>오늘의 미션</Text>
            {/* 전체 그림 한 줄(유호 확정 08-22 자기 설명 축 · ⚠ 문구 초안 — 카피 확정은 유호님 몫). */}
            <Text style={s.메모}>문장을 고쳐요 — 이상한 데를 한 군데 짚고, 그 자리만 바르게 써서 내요!</Text>
            <Text style={s.본문글}>{이번.스냅샷.지시문}</Text>
            {/* 🔴 몇 번째 문장인지는 «칸»으로만 낸다 — 숫자는 숨은 시계 규칙에 걸린다.
                채운 칸은 「끝난 문장」이지 점수가 아니다. */}
            <View style={s.걸음줄}>
              {벌.map((벌하나, i) => (
                <View key={벌하나.문항id} style={[s.걸음칸, i <= 턴 && s.걸음칸_지금]} />
              ))}
            </View>
          </View>

          <View style={s.카드}>
            <Text style={s.카드라벨}>이상한 데를 한 군데만 짚어요</Text>
            {/* 🔴 `보기` 순서 그대로 그린다 — 행에 적힌 자리와 학생이 본 자리가 같아야 한다
                (`options_shown` 이 곧 이 목록이다 · §6-8 규칙 4). */}
            <View style={s.문장줄}>
              {이번.보기.map((o) => {
                const 짚힘 = o.option_id === 짚은것;
                return (
                  <Pressable
                    key={o.option_id}
                    onPress={() => 어절짚기(o.option_id)}
                    accessibilityRole="button"
                    style={({ pressed }) => [s.어절, 짚힘 && s.어절_짚힘, pressed && s.눌림]}
                  >
                    <Text style={[s.어절글, 짚힘 && s.어절글_짚힘]}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {단계 === '짚기' && (
              <Pressable
                onPress={고칠곳없음}
                accessibilityRole="button"
                style={({ pressed }) => [s.없음버튼, pressed && s.눌림]}
              >
                <Text style={s.없음글}>고칠 곳 없음</Text>
              </Pressable>
            )}
          </View>

          {단계 === '고침' && 짚은어절 && (
            <View style={s.카드}>
              <Text style={s.카드라벨}>짚은 자리만 고쳐 써요</Text>
              <TextInput
                style={s.입력}
                defaultValue={짚은어절.label}
                onChangeText={(t) => { 입력참조.current = t; 상태참조.current = { ...상태참조.current, 글: t }; }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={s.메모}>비우면 그 낱말을 지우는 것이 돼요.</Text>
              {/* Ⅲ⑦ 확신도 — 누르면 켜지고 다시 누르면 꺼진다(표기는 선택 · 라디오 ?·?? 와 같은 뜻). */}
              <View style={s.확신줄}>
                {[['low', '? 자신이 없어요'], ['guess', '?? 찍었어요']].map(([값, 라벨]) => (
                  <Pressable
                    key={값}
                    onPress={() => set확신도(확신도 === 값 ? null : 값)}
                    accessibilityRole="button"
                    style={({ pressed }) => [s.확신토글, 확신도 === 값 && s.확신토글_켬, pressed && s.눌림]}
                  >
                    <Text style={[s.확신글, 확신도 === 값 && s.확신글_켬]}>{라벨}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                onPress={제출}
                accessibilityRole="button"
                style={({ pressed }) => [s.제출버튼, pressed && s.눌림]}
              >
                <Text style={s.제출글}>제출</Text>
              </Pressable>
              <Pressable onPress={() => { set짚은것(null); set단계('짚기'); set확신도(null); }} accessibilityRole="button">
                <Text style={s.다시고르기}>다른 데를 짚을래요</Text>
              </Pressable>
            </View>
          )}
        </>
      )}

      {단계 === '대기' && (
        <>
          <View style={s.카드}>
            <Text style={s.카드라벨}>다 냈어요</Text>
            <Text style={s.대기제목}>선생님이 보고 알려 줄 거예요</Text>
            {/* 즉답처럼 보이게 하지 않는다 — 답장은 사람이 확인한 뒤에 온다(며칠).
                🔴 맞았다·틀렸다를 여기 쓰지 않는다: 정답은 이 기기에 없다. */}
            <Text style={s.본문글}>알려줄 말이 생기면 「답장」에서 볼 수 있어요.</Text>
          </View>
          {낸것.length > 0 && (
            <View style={s.카드}>
              <Text style={s.카드라벨}>내가 고친 문장</Text>
              {낸것.map((글, i) => (
                /* eslint-disable-next-line react/no-array-index-key -- 낸 순서가 곧 턴 순서다 */
                <Text key={`낸-${i}`} style={s.낸글} selectable>{글}</Text>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function 머리() {
  return (
    <View style={s.머리}>
      <Text style={s.브랜드}>SYNK TALK</Text>
      <Text style={s.제목}>보고서 교정</Text>
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
  본문글: { fontFamily: 폰트.본문, fontSize: 15, lineHeight: 24, color: 색.잉크_서브 },

  /* 걸음 칸 — 숫자 없는 진행 표시(숨은 시계 규칙). 색은 안 늘린다(선 색 ↔ 잉크). */
  걸음줄: { flexDirection: 'row', gap: 6 },
  걸음칸: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 색.잉크_희미 },
  걸음칸_지금: { backgroundColor: 색.잉크 },

  문장줄: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  어절: {
    borderWidth: 1, borderColor: 색.잉크_희미, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  /* 신호 1점 — 짚은 어절만 코랄 면. 코랄 면 위 글자는 Navy 2 만 쓴다(테마 규칙 그대로). */
  어절_짚힘: { backgroundColor: 색.신호, borderColor: 색.신호 },
  어절글: { fontFamily: 폰트.본문, fontSize: 17, color: 색.잉크 },
  어절글_짚힘: { fontFamily: 폰트.강조, color: 색.바탕 },

  /* 기본 버튼 = 크림 면 + Navy 2 글자(테마 머리말) — 코랄은 짚은 어절 자리 하나뿐이다. */
  없음버튼: {
    borderWidth: 1, borderColor: 색.잉크_희미, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  없음글: { fontFamily: 폰트.강조, fontSize: 15, color: 색.잉크 },

  입력: {
    fontFamily: 폰트.본문, fontSize: 17, lineHeight: 26, color: 색.잉크,
    borderWidth: 1, borderColor: 색.잉크_희미, borderRadius: 12, padding: 12,
  },
  제출버튼: { backgroundColor: 색.잉크, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  제출글: { fontFamily: 폰트.강조, fontSize: 15, color: 색.바탕 },
  다시고르기: { fontFamily: 폰트.캡션, fontSize: 13, color: 색.잉크_보조, textAlign: 'center' },
  /* Ⅲ⑦ 확신도 토글 — 신호색 0(코랄은 녹음 버튼 하나 — 이 화면 규율 그대로) · 켬은 테두리·글자만. */
  확신줄: { flexDirection: 'row', gap: 8 },
  확신토글: { flex: 1, borderWidth: 1, borderColor: 색.선, borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  확신토글_켬: { borderColor: 색.잉크, backgroundColor: 색.바탕띄움 },
  확신글: { fontFamily: 폰트.캡션, fontSize: 13, color: 색.잉크_보조 },
  확신글_켬: { color: 색.잉크 },
  눌림: { opacity: 0.75 },

  대기제목: { fontFamily: 폰트.헤드, fontSize: 24, color: 색.잉크 },
  낸글: { fontFamily: 폰트.본문, fontSize: 16, lineHeight: 27, color: 색.잉크 },
});
