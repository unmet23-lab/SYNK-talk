import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { 색, 폰트, 모노트래킹 } from './테마';
import {
  빈칸제출사건, 모름제출사건, 변환제출사건, 이탈사건, 이탈닻,
} from '../lib/서류관문제출.js';
/* 즉시 통과 표시의 채점기는 **이 하나다**(발주 G4 §6-2 ⓐ · §6-0-4) — 앱 표시는 연출이고 저장
 * 판정은 서버 재채점인데, 두 자리가 같은 순수 함수를 써야 「그날 학생에게 보인 판정」이
 * 재현된다. 화면이 includes 류 부분일치를 스스로 굴리는 순간 재는 축(조사·활용)이 뭉개진다. */
import { 채점 } from '../lib/서류관문.js';
import { 다음시도번호, 턴항목 } from '../lib/게임로그.js';
import { 계측시작, 타건, 계측payload } from '../lib/작성과정.js';
import { 흐름id, 깨진기록안내 } from '../lib/제출로그.js';
import { 몽골날짜 } from '../lib/오늘과제.js';
/* 게임 로그의 읽기·쓰기·전송은 **직렬 통로 하나**로만 간다(B3 · `src/게임큐.js`) — 화면이
 * 저장을 직접 잡으면 동시 쓰기가 파일을 덮어 남의 사건을 지운다(오류 없이 「성공」의 모양). */
import { 게임큐읽기, 게임사건담기, 게임큐밀기, 게임이탈수거 } from './게임큐.js';
import { 효과음 } from './소리.js';

/**
 * G4 「서류 관문」 — 안내문을 읽고 빈칸을 직접 채우고 문장을 바꿔 쓰는 게임
 * (발주_게임모듈.md G4 §4 · 4모듈 중 유일하게 산출을 강제하는 자리).
 * 흐름: 접수창 지문 → 빈칸 3~5 한 칸씩 → 변환 1 → 즉시 통과 표시 → 되돌아보기(재도전).
 *
 * ■ 재료는 **라우팅이 편다** (`src/말하기화면.js` → `게임재료` → `관문재료`)
 *   이 화면이 받는 `벌` 은 화면에 뜰 순서 그대로의 턴들이다 — 검수확정 게이트·편성·스냅샷
 *   조립이 전부 그 한 곳에 살아서, 반쪽 관문은 여기 오기 전에 말하기 폴백으로 내려간다.
 *   🚫 화면이 `관문편성`·`G4스냅샷`·팩 `펴기` 를 직접 부르지 않는다 — 조립이 두 곳이 되는
 *   순간 행에 적힌 턴과 화면에 뜬 턴이 갈리고, 그 갈림은 증상이 없다(G2 규율 그대로).
 *
 * ■ 🔴 통과/불통과는 **저장하지 않는다** (발주 G4 §6-2 ⓐ)
 *   즉시 표시는 클라이언트 연출로 끝난다 — 어떤 행에도 판정 boolean 을 적지 않는다(파생은
 *   `body_original` + 스냅샷의 정답집합으로 언제든 재계산된다). 사건 조립은 전부
 *   `lib/서류관문제출.js` 가 지고, 이 화면은 그 결과를 게임 큐에 담기만 한다.
 *
 * ■ 🔴 controlled TextInput 금지 (발주 G4 §4-2 ⚙ · G1·G2 와 같은 규칙)
 *   값은 `defaultValue` + `onChangeText` 로 **ref 에만** 담는다 — 매 글자 state 로 되돌려 넣으면
 *   한글 조합이 깨져 학생 오류가 아니라 우리 버그가 라벨로 박힌다. 제출 버튼 켜짐도 ref 에서
 *   파생한 「비었나」 하나만 state 로 올린다(G1 `본문있음` 무늬 — 켜짐이 바뀔 때만 리렌더).
 *
 * ■ 🔴 숨은 시계 (발주 G4 §8 ✅ 종결 — 타임어택 시계 금지)
 *   화면에 시계·초·카운트다운 0. 빈칸 체류(`latency_ms`)는 경과 시계로 몰래 잰다.
 *   ⚠ 지문·해설 속 숫자(「4개월」·「6만 원」)는 문항 정본이다 — 시계가 아니라 서식이다.
 *
 * ■ 🔴 「모르겠어요」는 감추지 않는다 (발주 G4 §4-2) — 회피 자체가 신호다(`skipped`).
 *   화면은 모름을 **오답으로 표시하지 않는다** — 채점기 「모름」(두 집합 밖)도 같다: 모르는 것을
 *   틀렸다로 적지 않는다(§9-1 ⓐ). 코랄이 붙는 것은 축오답(그 빈칸이 재는 축의 알려진 오답)뿐.
 *
 * ■ 신호 1점 = **판정 오류 표시**(`테마.신호자리.서류관문`) — 되돌아보기의 축오답 라벨이
 *   이 화면의 코랄이다. 버튼·통과 표시는 잉크 층으로만 선다(R1 — 성장 표시에 초록을 새로
 *   들이지 않는다: 킷의 다크판 잉크는 Cream 하나고, 화면에 색이 둘이면 신호가 죽는다).
 *
 * ■ 몽골어 병기 0 — 팩 `검수확정=false` 라 `mn` 이 없다(발주_게임콘텐츠팩 §3). 지어내지 않는다.
 */

/* 경과 시계 — `src/말하기화면.js`·`src/교수멘탈화면.js`·`src/보고서교정화면.js` 와 같은 판정
 * (벽시계 금지 · 없으면 null = 「안 쟀다」). ⚠ 네 번째 사본이다 — 공용 통로로 뗄 자리인데
 * lib 층은 이 커밋 범위 밖이라(화면 트랙) 옮기지 못했다. 뗄 때 네 화면을 한 번에 걷을 것. */
const 경과시계 = () =>
  (typeof performance !== 'undefined' && performance && typeof performance.now === 'function'
    ? performance.now() : null);

/* 이 턴이 빈칸 스테이지인가 — 판정 기준은 스냅샷의 `빈칸` 키 하나다(§6-8 규칙 1: 변환 턴엔
 * 그 키가 없다). 조립기(`빈칸제출사건`·`변환제출사건`)가 교차 호출을 거르는 그 눈과 같은 축. */
const 빈칸턴인가 = (원소) => !!(원소 && 원소.스냅샷 && '빈칸' in 원소.스냅샷);

export default function 서류관문화면({
  벌, 토큰, 학생번호 = null, 시작턴 = 0, 시작단계 = '진행', 시작답들 = null,
}) {
  const 성립 = Array.isArray(벌) && 벌.length > 0;

  const [턴, set턴] = useState(시작턴);
  const [단계, set단계] = useState(시작단계); // 진행 | 결과
  const [재도전턴, set재도전턴] = useState(null); // 되돌아보기에서 다시 여는 빈칸의 벌 색인
  const [답들, set답들] = useState(() => 시작답들 || {}); // 시드 → {본문}|{모름:true} — 화면 연출 전용
  const [로그, set로그] = useState([]);
  const [오류, set오류] = useState(null);
  const [본문있음, set본문있음] = useState(false);
  /* Ⅲ⑦(유호 확정 08-22) — 확신도 기호식(라디오 ?·?? 와 같은 뜻·값 · 정본은 조립기). 표기는
   * 선택이고 턴이 바뀌면 리셋된다(입력세대와 같은 축) — 이월된 표기는 거짓 표기다. */
  const [확신도, set확신도] = useState(null);
  const 본문있음참조 = useRef(false);
  const [입력세대, set입력세대] = useState(0); // 턴·재도전마다 입력 칸을 새로 세운다(uncontrolled 리셋)

  /* 한 관문 = 한 correlation_id (발주 G4 §6-6 「한 관문 = 한 값」). 빈칸·모름·변환이 전부
   * 같은 값을 들고, 큐에서 턴·시도를 가르는 것은 항목 id 의 턴·시도 칸이다(G2 선례 승계). */
  const 앉음 = useRef(흐름id()).current;
  const 시작날짜 = useRef(몽골날짜());

  /* 입력의 최신본은 ref 가 쥔다 — state 로 쥐면 controlled 가 된다(머리말 ⚙). */
  const 입력참조 = useRef('');
  const 계측참조 = useRef(null); // 변환 턴의 compose_meta — G1 과 같은 조립기(작성과정)
  const 턴뜬때 = useRef(경과시계()); // 빈칸 체류(latency_ms) — 턴이 활성화된 순간부터
  /* 이탈 판정 재료 — cleanup 은 낡은 state 를 보므로 ref 하나가 최신을 쥔다(G2 무늬).
   * 🔴 `스테이지` 는 이탈사건의 셋째 인자다 — 상수로 두면 빈칸에서 막힌 학생(대다수)이 전부
   *   「변환에서 막혔다」로 적힌다(발주 적대 리뷰 P2-3 · 화면이 자기 단계를 넘긴다). */
  const 상태참조 = useRef({
    스테이지: 성립 && !빈칸턴인가(벌[Math.min(시작턴, 벌.length - 1)]) ? '변환' : '빈칸',
    글: '',
    끝났다: 시작단계 === '결과',
  });

  /* 지금 열려 있는 턴 — 되돌아보기의 재도전이 우선한다(그 카드가 화면에 서 있는 동안). */
  const 활성 = (() => {
    if (!성립) return null;
    if (재도전턴 !== null) return 벌[재도전턴] || null;
    if (단계 === '결과') return null;
    return 벌[Math.min(턴, 벌.length - 1)];
  })();

  /* 마운트: 큐를 읽고 — 이미 낸 턴은 건너뛰고(다시 내지 않는다) — 밀린 것을 민다.
   * 읽기·밀기 전부 직렬 통로다(B3). 판정은 큐 한 곳(`턴항목` — 빈칸 quiz·변환 mail 두 갈래를
   * 한 판정으로 본다). */
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
          /* 이어서 연다 — 껐다 켠 학생이 첫 칸부터 다시 하지 않고, 낸 턴이 두 번 나가지도
           * 않는다. 🔑 턴 열쇠는 **그 턴의 스냅샷 prompt_seed** 다 — `앵커시드` 는 관문 전체가
           * 같은 값이라 그걸로 세면 모든 턴이 한 턴으로 접힌다(관문재료 머리말). */
          const 이미답 = {};
          let 다음턴 = 벌.length;
          for (let i = 0; i < 벌.length; i += 1) {
            const 시드 = 벌[i].스냅샷.prompt_seed;
            const 항목 = 턴항목(저장된, 벌[i].task_ref, 시드);
            if (!항목) { 다음턴 = i; break; }
            const sub = 항목.사건 && 항목.사건.submission;
            const 짐 = 항목.사건 && 항목.사건.payload;
            /* 첫 시도의 것이다(턴항목 = 첫 일치) — 재도전 뒤 껐다 켠 날은 첫 답이 선다.
             * 최신을 고르려고 판정을 여기 또 적지 않는다(늦은 답 하나보다 판정 두 벌이 비싸다). */
            이미답[시드] = 짐 && 짐.skipped ? { 모름: true } : { 본문: (sub && sub.body_original) || '' };
          }
          set답들((앞) => ({ ...이미답, ...앞 }));
          if (다음턴 >= 벌.length) {
            상태참조.current = { ...상태참조.current, 끝났다: true, 글: '' };
            set단계('결과');
          } else if (다음턴 !== 0) {
            set턴(다음턴);
            상태참조.current = {
              ...상태참조.current,
              스테이지: 빈칸턴인가(벌[다음턴]) ? '빈칸' : '변환',
            };
            턴뜬때.current = 경과시계();
          }
        }
        /* 죽은 배정 수거(H2) — 기준은 서버 task_ref 끼리의 대조. 밀기 전에 걷어야 걷은 것이
         * 바로 아래 밀기로 나간다. G1·G2 가 남긴 앉음도 여기서 걷힌다(배출구는 넓을수록 옳다). */
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

  /* 변환 턴의 계측은 **입력이 가능해진 순간** 시작한다(작성과정.계측시작 · G1 과 같은 자리).
   * 빈칸 턴은 부르지 않는다 — 못 재는 자리는 키를 아예 만들지 않는다(작성과정 처분 규칙 2). */
  useEffect(() => {
    if (활성 && !빈칸턴인가(활성) && !계측참조.current) 계측참조.current = 계측시작(경과시계());
  }, [턴, 재도전턴, 단계]);

  /* 🔴 하다 나감 = `session.abandoned` — **날을 건넌 되세움에서만** 낸다(G1·G2 와 같은 판정 —
   *   같은 날의 이동은 이탈이 아니다). 🔑 화면이 자기 단계를 넘긴다(머리말 · 상수 금지). */
  useEffect(() => () => {
    const s = 상태참조.current;
    if (s.끝났다 || !s.글.trim()) return;
    if (몽골날짜() === 시작날짜.current) return;
    const 사건 = 이탈사건(성립 ? 벌[0] : null, { correlation_id: 앉음, idempotency_key: 흐름id() }, s.스테이지);
    if (!사건) return;
    게임사건담기(사건).catch(() => { /* 기록 실패 — 관측을 지어내지 않는다 */ });
  }, []);

  /* ── 손잡이 ── */

  const 입력초기화 = () => {
    입력참조.current = '';
    상태참조.current = { ...상태참조.current, 글: '' };
    본문있음참조.current = false;
    set본문있음(false);
    set확신도(null);   // Ⅲ⑦ — 턴이 바뀌면 표기도 새로(이월은 거짓 표기)
    set입력세대((n) => n + 1);
    턴뜬때.current = 경과시계();
  };

  const 입력됨 = (글) => {
    입력참조.current = 글;
    상태참조.current = { ...상태참조.current, 글 };
    if (활성 && !빈칸턴인가(활성)) 계측참조.current = 타건(계측참조.current, 글, 경과시계());
    const 있음 = 글.trim() !== '';
    if (있음 !== 본문있음참조.current) {
      본문있음참조.current = 있음;
      set본문있음(있음);
    }
  };

  /* 빈칸 체류 — 턴이 활성화된 순간부터 지금까지. 못 쟀으면 null(조립기가 키를 안 만든다 —
   * 0 으로 접으면 「즉시 답했다」가 되는 그 자리다). */
  const 체류 = () => {
    const 지금 = 경과시계();
    return 지금 !== null && 턴뜬때.current !== null ? 지금 - 턴뜬때.current : null;
  };

  /** attempt 는 **그 순간의 파일**에서 센다(G2 선례) — 턴 열쇠는 그 턴의 prompt_seed 다. */
  const attempt잡기 = async (턴재료) => {
    let 현재로그 = 로그;
    try {
      ({ 로그: 현재로그 } = await 게임큐읽기());
    } catch { /* 못 읽어도 화면 로그로 잇는다 — 항목 id·멱등키가 중복을 접는다 */ }
    return 다음시도번호(현재로그, 턴재료.task_ref, 턴재료.스냅샷.prompt_seed);
  };

  /** 담기 — 실패하면 흐름을 넘기지 않는다(기기에 못 남긴 제출을 「냈다」로 적지 않는다).
   *  닻(`이탈닻`)은 로컬 칸이다 — 앱이 죽어 cleanup 이 못 돈 날의 수거(H2) 재료(발주 §6-6 ⑩ C5). */
  const 담아넘기기 = async (사건, 시드, 답) => {
    try {
      const { 로그: 더한 } = await 게임사건담기(사건, 이탈닻(벌[0]));
      set로그(더한);
    } catch (e) {
      set오류(String((e && e.message) || e));
      return;
    }
    set답들((앞) => ({ ...앞, [시드]: 답 }));
    if (재도전턴 !== null) {
      set재도전턴(null); // 되돌아보기로 돌아간다 — 새 답은 답들이 이미 쥐었다
      입력초기화();
    } else {
      const 다음 = 턴 + 1;
      if (다음 >= 벌.length) {
        상태참조.current = { ...상태참조.current, 끝났다: true, 글: '' };
        set단계('결과');
        /* 관문 완주 성취음 1회 — G1 「발송」·G2 「앉음 완료」와 같은 뜻(보냈다). 정답 신호가
         * 아니고(즉시 표시는 연출) 실패음 짝도 없다(킷 규칙 ②). 되세움 점프에서는 안 난다. */
        try { 효과음('achieve'); } catch { /* 무음 — 소리가 흐름을 막지 않는다 */ }
      } else {
        set턴(다음);
        상태참조.current = { ...상태참조.current, 스테이지: 빈칸턴인가(벌[다음]) ? '빈칸' : '변환' };
        입력초기화();
      }
    }
    게임큐밀기(토큰, null).then(set로그, () => {}); // 화면은 안 기다린다
  };

  const 빈칸내기 = async () => {
    const 턴재료 = 활성;
    if (!턴재료 || !빈칸턴인가(턴재료)) return;
    const 본문 = 입력참조.current;
    if (!본문.trim()) return; // 빈 제출은 여기 없다 — 비우고 넘기는 문은 「모르겠어요」다
    const 사건 = 빈칸제출사건(턴재료, {
      본문,
      확신도,
      attempt_no: await attempt잡기(턴재료),
      latency_ms: 체류(),
      correlation_id: 앉음,
      idempotency_key: 흐름id(),
    });
    if (!사건) {
      set오류('답을 다시 담아 볼게요! 잠시 뒤 다시 눌러 주세요');
      return;
    }
    await 담아넘기기(사건, 턴재료.스냅샷.prompt_seed, { 본문 });
  };

  const 모르겠어요 = async () => {
    const 턴재료 = 활성;
    if (!턴재료 || !빈칸턴인가(턴재료)) return;
    const 사건 = 모름제출사건(턴재료, {
      attempt_no: await attempt잡기(턴재료),
      latency_ms: 체류(),
      correlation_id: 앉음,
      idempotency_key: 흐름id(),
    });
    if (!사건) {
      set오류('넘김을 다시 담아 볼게요! 잠시 뒤 다시 눌러 주세요');
      return;
    }
    await 담아넘기기(사건, 턴재료.스냅샷.prompt_seed, { 모름: true });
  };

  const 변환내기 = async () => {
    const 턴재료 = 활성;
    if (!턴재료 || 빈칸턴인가(턴재료)) return;
    const 본문 = 입력참조.current;
    if (!본문.trim()) return;
    const 사건 = 변환제출사건(턴재료, {
      본문,
      attempt_no: await attempt잡기(턴재료),
      /* 한 칸이라도 못 쟀으면 null — 조립기가 키를 아예 안 싣는다(§6-6 ⑨ 한 벌 규칙). */
      compose_meta: 계측payload(계측참조.current, 경과시계()),
      correlation_id: 앉음,
      idempotency_key: 흐름id(),
    });
    if (!사건) {
      set오류('바꿔 쓴 문장을 다시 담아 볼게요! 잠시 뒤 다시 눌러 주세요');
      return;
    }
    await 담아넘기기(사건, 턴재료.스냅샷.prompt_seed, { 본문 });
  };

  const 재도전열기 = (i) => {
    set재도전턴(i);
    상태참조.current = { ...상태참조.current, 스테이지: '빈칸' };
    입력초기화();
  };

  /* ── 렌더 ── */

  if (!성립) {
    return (
      <ScrollView style={s.wrap} contentContainerStyle={s.inner}>
        <머리 />
        {/* 라우팅이 재료 없이 이 화면을 그렸다 — 못 읽은 것을 둔갑시키지 않는다(G1·G2 와 같은 자리). */}
        <View style={s.카드}>
          <Text style={s.본문글}>오늘의 미션을 읽지 못했어요 — 잠시 뒤 앱을 다시 열어 주세요.</Text>
          {학생번호 ? <Text style={s.메모}>계속 그러면 선생님께 학생번호 {학생번호}를 보여 주세요.</Text> : null}
        </View>
      </ScrollView>
    );
  }

  const 진행중 = 활성 !== null;
  const 빈칸중 = 진행중 && 빈칸턴인가(활성);

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
      <머리 />
      {오류 && <Text style={s.오류}>{오류}</Text>}

      {진행중 && (
        <View style={s.카드}>
          <Text style={s.카드라벨}>오늘의 미션</Text>
          {/* 전체 그림 한 줄(유호 확정 08-22 자기 설명 축 · ⚠ 문구 초안 — 카피 확정은 유호님 몫). */}
          <Text style={s.메모}>서류 한 장이에요 — 빈칸을 채우고, 마지막 문장을 바꿔 써서 내요!</Text>
          <Text style={s.본문글}>{활성.스냅샷.지시문}</Text>
          {/* 🔴 몇 번째 칸인지는 «칸»으로만 낸다 — 숫자는 숨은 시계 규칙에 걸린다(G2 걸음줄). */}
          <View style={s.걸음줄}>
            {벌.map((원소, i) => (
              <View
                key={원소.스냅샷.prompt_seed}
                style={[s.걸음칸, (단계 === '결과' || i <= (재도전턴 !== null ? 재도전턴 : 턴)) && s.걸음칸_지금]}
              />
            ))}
          </View>
        </View>
      )}

      {/* 접수창 지문 — 빈칸의 답이 이 안에 있다(읽기 이해 축). 변환 턴은 자기 제시문이 따로다. */}
      {빈칸중 && (
        <View style={s.카드}>
          <Text style={s.카드라벨}>접수창 안내문</Text>
          <Text style={s.지문글} selectable>{활성.스냅샷.질문}</Text>
        </View>
      )}

      {빈칸중 && (
        <View style={s.카드}>
          <Text style={s.카드라벨}>빈칸을 직접 써서 채워요</Text>
          <문장틀글 문장틀={활성.스냅샷.빈칸.문장틀} />
          <TextInput
            key={`입력-${입력세대}`}
            style={s.입력}
            defaultValue=""
            onChangeText={입력됨}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {/* Ⅲ⑦ 확신도 — 누르면 켜지고 다시 누르면 꺼진다(표기는 선택). 「모르겠어요」와 다른
              축이다: 이건 «답을 내면서» 하는 자기 표기이고 그건 답을 안 내는 문이다. */}
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
            onPress={빈칸내기}
            disabled={!본문있음}
            accessibilityRole="button"
            style={({ pressed }) => [s.제출버튼, !본문있음 && s.제출_대기, pressed && s.눌림]}
          >
            <Text style={s.제출글}>제출</Text>
          </Pressable>
          {/* 「모르겠어요」 상시 노출(§4-2) — 감추면 회피 신호(skipped)가 통째로 사라진다. */}
          <Pressable onPress={모르겠어요} accessibilityRole="button" style={({ pressed }) => [s.모름버튼, pressed && s.눌림]}>
            <Text style={s.모름글}>모르겠어요</Text>
          </Pressable>
          {재도전턴 !== null && (
            <Pressable onPress={() => set재도전턴(null)} accessibilityRole="button">
              <Text style={s.돌아가기}>그냥 둘래요</Text>
            </Pressable>
          )}
        </View>
      )}

      {진행중 && !빈칸중 && (
        <View style={s.카드}>
          <Text style={s.카드라벨}>마지막 한 걸음 — 바꿔 쓰기</Text>
          <Text style={s.본문글}>{활성.스냅샷.지시문}</Text>
          <Text style={s.지문글} selectable>{활성.스냅샷.질문}</Text>
          <TextInput
            key={`입력-${입력세대}`}
            style={s.변환입력}
            placeholder="여기에 바꿔 써요"
            placeholderTextColor={색.잉크_메타}
            defaultValue=""
            onChangeText={입력됨}
            multiline
            textAlignVertical="top"
          />
          <Pressable
            onPress={변환내기}
            disabled={!본문있음}
            accessibilityRole="button"
            style={({ pressed }) => [s.제출버튼, !본문있음 && s.제출_대기, pressed && s.눌림]}
          >
            <Text style={s.제출글}>보내기</Text>
          </Pressable>
        </View>
      )}

      {단계 === '결과' && 재도전턴 === null && (
        <>
          <View style={s.카드}>
            <Text style={s.카드라벨}>되돌아보기</Text>
            {벌.map((원소, i) => {
              if (!빈칸턴인가(원소)) return null;
              const 시드 = 원소.스냅샷.prompt_seed;
              const 빈칸 = 원소.스냅샷.빈칸;
              const 답 = 답들[시드] || null;
              /* 판정은 조립기의 그 채점기 하나다(머리말) — 모름(집합 밖)·모르겠어요는 코랄 없이
               * 정답 형태만 선다: 모르는 것·비운 것을 틀렸다로 그리지 않는다(§9-1 ⓐ). */
              const 결과 = 답 && !답.모름 && typeof 답.본문 === 'string' ? 채점(빈칸, 답.본문) : null;
              const 통과함 = !!(결과 && 결과.판정 === '맞음');
              const 축오답 = !!(결과 && 결과.판정 === '축오답');
              return (
                <View key={시드} style={s.줄}>
                  <문장틀글 문장틀={빈칸.문장틀} 채움={답 && !답.모름 ? 답.본문 : null} />
                  {통과함 && <Text style={s.통과}>통과</Text>}
                  {/* 신호 1점 — 이 코랄 라벨이 `신호자리.서류관문`(판정오류표시)이다. */}
                  {축오답 && <Text style={s.오류표시}>다음에 맞힐 칸</Text>}
                  {!통과함 && <Text style={s.정답형태}>정답 형태: {빈칸.정답집합.join(' · ')}</Text>}
                  <Text style={s.메모}>{빈칸.해설}</Text>
                  {!통과함 && (
                    <Pressable onPress={() => 재도전열기(i)} accessibilityRole="button" style={({ pressed }) => [s.재도전버튼, pressed && s.눌림]}>
                      <Text style={s.재도전글}>다시 써 볼래요</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
          <View style={s.카드}>
            <Text style={s.카드라벨}>바꿔 쓴 문장</Text>
            {(() => {
              const 변환원소 = 벌.find((원소) => !빈칸턴인가(원소));
              const 변환답 = 변환원소 ? 답들[변환원소.스냅샷.prompt_seed] : null;
              return 변환답 && 변환답.본문
                ? <Text style={s.낸글} selectable>{변환답.본문}</Text>
                : null;
            })()}
            {/* 열린 산출은 즉답이 없다 — 검수 큐 몫(§6-1). 즉답처럼 보이게 하지 않는다(G2 문구). */}
            <Text style={s.본문글}>바꿔 쓴 문장은 선생님이 보고 알려줄게. 알려줄 말이 생기면 「답장」에서 볼 수 있어요.</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

/* 문장틀 렌더 — `{빈칸}` 자리를 밑줄 칸(또는 채운 답)으로 편다. 팩 문장틀의 나머지 글자는
 * 그대로다 — 화면이 문장을 다시 짓지 않는다(행에 남는 문장틀과 같은 글자여야 한다). */
function 문장틀글({ 문장틀, 채움 = null }) {
  const [앞, 뒤] = String(문장틀).split('{빈칸}');
  return (
    <Text style={s.문장글}>
      {앞}
      <Text style={채움 ? s.채운답 : s.빈칸자리}>{채움 ? ` ${채움} ` : ' ＿＿ '}</Text>
      {뒤 || ''}
    </Text>
  );
}

function 머리() {
  return (
    <View style={s.머리}>
      <Text style={s.브랜드}>SYNK TALK</Text>
      <Text style={s.제목}>서류 관문</Text>
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
  지문글: { fontFamily: 폰트.본문, fontSize: 16, lineHeight: 27, color: 색.잉크 },
  문장글: { fontFamily: 폰트.본문, fontSize: 17, lineHeight: 28, color: 색.잉크 },
  빈칸자리: { fontFamily: 폰트.강조, color: 색.잉크 },
  채운답: { fontFamily: 폰트.강조, color: 색.잉크 },

  /* 걸음 칸 — 숫자 없는 진행 표시(숨은 시계 규칙 · G2 그대로). */
  걸음줄: { flexDirection: 'row', gap: 6 },
  걸음칸: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 색.잉크_희미 },
  걸음칸_지금: { backgroundColor: 색.잉크 },

  입력: {
    fontFamily: 폰트.본문, fontSize: 17, lineHeight: 26, color: 색.잉크,
    borderWidth: 1, borderColor: 색.잉크_희미, borderRadius: 12, padding: 12,
  },
  변환입력: {
    fontFamily: 폰트.본문, fontSize: 16, lineHeight: 26, color: 색.잉크,
    borderWidth: 1, borderColor: 색.잉크_희미, borderRadius: 12, padding: 12, minHeight: 120,
  },

  /* 기본 버튼 = 크림 면 + Navy 2 글자(테마 머리말) — 코랄은 판정 오류 표시 하나뿐이다. */
  제출버튼: { backgroundColor: 색.잉크, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  제출_대기: { opacity: 0.35 },
  제출글: { fontFamily: 폰트.강조, fontSize: 15, color: 색.바탕 },
  모름버튼: {
    borderWidth: 1, borderColor: 색.잉크_희미, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  모름글: { fontFamily: 폰트.강조, fontSize: 14, color: 색.잉크_태그 },
  /* Ⅲ⑦ 확신도 토글 — 신호색 0 · 켬은 테두리·글자만(보고서교정화면과 같은 무늬). */
  확신줄: { flexDirection: 'row', gap: 8 },
  확신토글: { flex: 1, borderWidth: 1, borderColor: 색.선, borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  확신토글_켬: { borderColor: 색.잉크, backgroundColor: 색.바탕띄움 },
  확신글: { fontFamily: 폰트.캡션, fontSize: 13, color: 색.잉크_보조 },
  확신글_켬: { color: 색.잉크 },
  돌아가기: { fontFamily: 폰트.캡션, fontSize: 13, color: 색.잉크_보조, textAlign: 'center' },
  눌림: { opacity: 0.75 },

  줄: { gap: 6, paddingVertical: 6 },
  통과: { fontFamily: 폰트.강조, fontSize: 14, color: 색.잉크 },
  /* 신호 1점(`신호자리.서류관문`) — 다크 바탕 위 코랄 글자(인증 화면 오류 메시지와 같은 허용). */
  오류표시: { fontFamily: 폰트.강조, fontSize: 14, color: 색.신호 },
  정답형태: { fontFamily: 폰트.강조, fontSize: 14, color: 색.잉크 },
  재도전버튼: {
    borderWidth: 1, borderColor: 색.잉크_희미, borderRadius: 12,
    paddingVertical: 10, alignItems: 'center',
  },
  재도전글: { fontFamily: 폰트.강조, fontSize: 13, color: 색.잉크_태그 },
  낸글: { fontFamily: 폰트.본문, fontSize: 16, lineHeight: 27, color: 색.잉크 },
});
