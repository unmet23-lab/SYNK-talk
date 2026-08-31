import { useCallback, useEffect, useState } from 'react';
import { Animated, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
/* AppState — 복원막힘(D7-3) 자동 재시도의 귀. ⚠ 윗줄에 합치지 않는다 —
   tests/감사회귀_W2C1.test.js 가 윗줄을 문자열 그대로 문다. */
import { AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import 말하기화면 from './src/말하기화면';
import 답장화면 from './src/답장화면';
import 어제의나, { 진행받기 } from './src/어제의나';
/* 검수문 — 개발 빌드 전용(`src/검수문.js` 머리말).
 * 🔴 **정적 import 를 쓰지 않는다.** Metro 는 tree-shaking 을 완전히 하지 않아 최상단 import 는
 *   프로덕션 번들에 «코드가 남을» 수 있다(진입이 `__DEV__` 안이라 실행은 안 되지만, 안 남는다고
 *   말하려면 이 형태여야 한다). `__DEV__` 는 빌드 때 상수로 접히므로 이 require 는 프로덕션에서
 *   도달 불가가 되어 제거된다. */
const 검수문 = __DEV__ ? require('./src/검수문').default : null;
import 도착확인 from './src/도착확인';
import 인증화면, { 단계 } from './src/인증화면';
import 오프라인카드 from './src/오프라인카드';
import 몽글문화면 from './src/몽글문화면';
import 원장초기화 from './src/원장초기화';
import 검수화면 from './src/검수화면';
import 강사화면 from './src/강사화면';
import 문구감수화면 from './src/문구감수화면';
import 반피드백화면 from './src/반피드백화면';
import 나침반화면 from './src/나침반화면';
import 관찰화면 from './src/관찰화면';
import 회고화면 from './src/회고화면';
import 오류경계 from './src/오류경계';
import * as 인증 from './src/인증API';
import { 교정목록받기 } from './src/교정API';
import { 배치미달받기 } from './src/과제API';
import { 가이드읽기, 만료시지우기, 세션읽기, 세션쓰기, 학생번호읽기 } from './src/저장';
import { 색, 폰트, 모노트래킹, 글자배율상한 } from './src/테마';
import { 상단밀림 } from './src/인셋';
import 기호 from './src/기호';
import { use등장 } from './lib/모션.js';

/* 화면 전환의 등장 한 박자 (감사 D5-2) — 부모가 key={화면} 을 줘 화면이 바뀔 때마다 remount 되고,
   그때 use등장 한 박자가 돈다. 겉테(SYSTEM·답장·어제 링크)는 이 틀 밖에 산다 — 테는 서 있고
   내용만 자리 잡는다. reduce-motion 은 use등장이 스스로 접는다(lib/모션.js 정지 화면 원칙). */
function 화면틀({ children }) {
  const 등장 = use등장({ 시간: 240, 올라옴: 8 });
  return <Animated.View style={[{ flex: 1 }, 등장]}>{children}</Animated.View>;
}

/**
 * 앱 루트 — 말하기(기본) / 도착확인(시스템) / 인증.
 * 내비게이션 라이브러리를 넣지 않은 것은 의도다 — 학생 앱의 동사는 하나다(설계 §1).
 *
 * 🔑 **세션은 기기 키체인에 남는다**(`src/저장.js`) — 앱을 껐다 켜도 로그인이 유지된다.
 *   남는 것은 refresh_token 뿐이고, 시작할 때 그것으로 access_token 을 새로 받는다.
 *   학원 수업이 하루 한 번인데 매번 번호와 비밀번호를 다시 넣게 하면, 그 마찰이 곧 결석이다.
 */
export default function App() {
  const [화면, set화면] = useState('말하기');
  const [세션, set세션] = useState(null);
  const [복원중, set복원중] = useState(true);
  const [교정, set교정] = useState(null); // 나에게 온 최신 교정 1건 (없으면 답장 링크를 안 그린다)
  const [교정막힘, set교정막힘] = useState(null); // 서버 `blocked` — 있으면 답장 화면이 사건을 안 보낸다
  const [견줌값, set견줌값] = useState(null); // {견줌, 오늘의확인} — 견줌은 첫날 null(「어제의 나」 링크를 안 그린다)
  const [배치미달, set배치미달] = useState(null); // 오늘 배달이 덜 돈 것 (원장만 값을 받는다 · P0 §6-5)
  const [복원막힘, set복원막힘] = useState(false); // 복원이 retryable 로 막혔다(D7-3) — 키체인은 그대로다
  const [복원세대, set복원세대] = useState(0); // 올리면 복원 효과가 다시 돈다 — AppState 리스너가 올린다
  const [초기번호, set초기번호] = useState(null); // 만료가 남긴 학생번호(D7-12) — 로그인 폼의 첫 칸
  const [캐릭터, set캐릭터] = useState('몽글'); // 학생이 고른 가이드(D4-1) — 정본 = 기기 guide_choice.json
  const [fontsLoaded] = useFonts({
    'SUIT-Regular': require('./assets/fonts/SUIT-Regular.ttf'),
    'SUIT-Medium': require('./assets/fonts/SUIT-Medium.ttf'),
    'SUIT-SemiBold': require('./assets/fonts/SUIT-SemiBold.ttf'),
    'SUIT-ExtraBold': require('./assets/fonts/SUIT-ExtraBold.ttf'),
    'DMMono-Medium': require('./assets/fonts/DMMono-Medium.ttf'),
    /* 🔴 몽골어(키릴) — SUIT 4종·DM Mono 에는 이 문자가 **한 자도 없다**(실측 08-27: Inter Tight
       네 굵기는 몽골 키릴 70/70). 여기서 빠뜨리면 안드로이드는 그 자리에서 죽고 웹은 조용히
       시스템 폰트로 떨어진다 — **후자가 더 나쁘다**(브랜드 밖 글자인데 아무도 모른다).
       🔑 무엇을 실을지는 `src/테마.js` 의 `몽골어폰트` 가 정하고, 회귀가 둘을 대조한다. */
    'InterTight-Regular': require('./assets/fonts/InterTight-Regular.ttf'),
    'InterTight-Medium': require('./assets/fonts/InterTight-Medium.ttf'),
    'InterTight-SemiBold': require('./assets/fonts/InterTight-SemiBold.ttf'),
  });

  /* 안드로이드 백버튼 (감사 G2-1) — 지도는 각 화면의 기존 돌아가기 prop 과 같다
     (직원 7화면→'시스템' · 나머지→'말하기'). '말하기'에서는 false = 기본 동작(태스크 백그라운드).
     내비 라이브러리를 안 넣는 설계(위 머리말)와 무충돌 — 스택이 없으니 지도가 곧 뒤로가기다. */
  useEffect(() => {
    const 구독 = BackHandler.addEventListener('hardwareBackPress', () => {
      if (화면 === '말하기') return false;
      const 시스템행 = ['검수', '강사', '문구감수', '반피드백', '나침반', '회고', '관찰', '몽글'];
      set화면(시스템행.includes(화면) ? '시스템' : '말하기');
      return true;
    });
    return () => 구독.remove();
  }, [화면]);

  /* 시작하자마자 저장된 세션으로 갱신을 시도한다. 성공하면 학생은 로그인 화면을 아예 안 본다.
     복원세대가 오르면 다시 돈다(D7-3) — 막힌 복원을 앱 재시작 없이 다시 시도하는 유일한 길이다. */
  useEffect(() => {
    let 살아있음 = true;
    set복원막힘(false);
    (async () => {
      try {
        const 남은 = await 세션읽기();
        if (남은) {
          const 새것 = await 인증.갱신(남은.refresh_token, 남은.학생번호);
          if (살아있음) {
            set세션(새것);
            /* refresh_token 은 **회전한다** — 새로 받은 것을 덮어쓰지 않으면 다음 실행이
               이미 쓴 토큰으로 갱신을 시도해 실패하고, 증상은 「가끔 로그인이 풀린다」다. */
            await 세션쓰기(새것).catch(() => {});
          }
        }
      } catch (e) {
        /* 🔴 만료면 refresh_token 만 버리고 학생번호는 남긴다(D7-12 · 만료시지우기 머리말).
           «기다리면 낫는 것»이면 키체인을 그대로 두고 복원막힘만 세운다(D7-3) — 오프라인 카드가
           서고, 앱이 다시 앞에 오는 순간 아래 리스너가 자동 재시도를 건다.
           🔑 가르는 자 = retryable(08-31 감사 G1-1) — code 이름(NETWORK)으로 가르면 서버 429/5xx
           (SERVER_ERROR·retryable:true)가 만료로 읽혀 키체인이 영구 삭제된다. */
        if (e && !e.retryable) {
          await 만료시지우기().catch(() => {});
          const 남은번호 = await 학생번호읽기().catch(() => null);
          if (살아있음) set초기번호(남은번호);
        } else if (살아있음) {
          set복원막힘(true);
        }
      } finally {
        if (살아있음) set복원중(false);
      }
    })();
    return () => { 살아있음 = false; };
  }, [복원세대]);

  /* 복원이 막힌 채(오프라인) 앱이 다시 앞에 오면 조용히 다시 시도한다(D7-3) — 학생 손이
     할 일은 0이다: 인터넷이 돌아온 뒤 앱을 여는 것이 곧 재시도다. */
  useEffect(() => {
    const 구독 = AppState.addEventListener('change', (상태) => {
      if (상태 === 'active' && 복원막힘 && !세션) set복원세대((n) => n + 1);
    });
    return () => 구독.remove();
  }, [복원막힘, 세션]);

  /* 답장(교정)이 **있을 때만** 링크를 그린다 — P0 §5 S1-8 「교정이 없으면 화면에 안 뜸」 ·
     C0 §4-3 ② 「빈 카드 금지」. 그래서 목록을 여기서 한 번 읽고 화면에 내려준다:
     🔑 링크의 근거와 화면이 그리는 것이 **같은 한 번의 조회**여야 한다. 두 번 읽으면 링크는
        떴는데 화면은 비는 날이 생기고, 학생 눈에는 앱이 고장난 것으로 보인다.
     🔴 실패는 **조용하다** — 답장 링크가 안 뜰 뿐 말하기는 그대로 돌아야 한다(교정 조회가
        죽었다고 오늘 발화를 막으면, 못 고칠 이유로 학생의 하루를 버린다).
     🔑 `blocked` 도 **같은 한 번의 조회**에서 받는다(2026-08-10) — 답장 화면이 이 값으로 사건
        큐를 멈춘다(`lib/교정로그.보낼것`). 따로 읽으면 카드와 막힘이 다른 순간을 가리킨다.
     🔴 실패했을 때 막힘을 **지우지 않는다** — 「모른다」를 「안 막혔다」로 적는 자리이고, 새는
        방향은 언제나 「보낸다」다. 다음 성공 조회가 덮는다(목록은 지운다 — 그건 화면이 그릴
        재료라 낡은 것을 그리면 학생이 이미 사라진 교정을 본다). */
  useEffect(() => {
    if (!세션) return undefined;
    let 살아있음 = true;
    (async () => {
      try {
        const { 목록, 막힘 } = await 교정목록받기(세션.access_token);
        if (살아있음) {
          set교정(목록[0] || null);
          set교정막힘(막힘 || null);
        }
      } catch {
        if (살아있음) set교정(null);
      }
    })();
    return () => { 살아있음 = false; };
  }, [세션]);

  /* 「어제의 나」도 같은 규칙이다(P0 §5 S1-11) — **한 번 읽어** 링크의 근거와 화면의 내용을
     같은 것으로 만든다. 🔴 첫날이면 `null` 이 오고 그때는 링크 자체를 안 그린다: 눌러서
     「어제 0 · 오늘 0」을 만나는 것은 빈 카드고, 없는 과거를 지어내는 것이기도 하다.
     ⚠ 답장과 **따로** 읽는다 — 한 번에 묶으면 한쪽이 죽을 때 멀쩡한 쪽 링크까지 같이 사라진다.

     읽는 자리가 둘이다 — ①앱을 켤 때 ②**제출이 다 닿은 직후**(완료 카드 · 유호님 확정 08-09).
     ②가 값이 실제로 참이 되는 순간이라, 켤 때 읽은 값만 쓰면 오늘 낸 것을 영원히 모르는 수를 든다.
     🔴 실패하면 **가진 값을 그대로 둔다**(지우지 않는다) — 낡은 오늘은 실제보다 작아서 말이
     안 붙거나 작게 붙을 뿐 과장되지 않지만, 지우면 멀쩡히 서 있던 링크가 사라진다. */
  const 견줌읽기 = useCallback(async () => {
    if (!세션) return;
    try {
      set견줌값(await 진행받기(세션.access_token));
    } catch {
      /* 조용히 둔다 — 이 조회가 죽었다고 오늘 발화를 막지 않는다(답장 조회와 같은 규칙). */
    }
  }, [세션]);

  useEffect(() => { 견줌읽기(); }, [견줌읽기]);

  /* 🔴 **배치가 안 돈 것은 강등으로 안 잡힌다**(P0 §6-5) — 큐가 비면 전원이 며칠 고정 과제로
     돌아도 증상이 조용하고, 그걸 보는 눈은 원장 화면 하나뿐이다. 계약이 정한 수신자가
     유호님 한 명이라 발송 통로(메일·푸시)를 만들지 않는다: **화면에 뜨는 것이 알림이다.**
     🔑 **누가 원장인지 앱은 모른다** — 서버가 정하고 학생에게는 늘 `null` 이 온다(권한을
        화면에서 숨기는 것은 편의이지 권한이 아니다 · `원장초기화` 와 같은 규칙).
     🔑 한 번만 읽는다 — 배치는 하루 1회고, 이 값이 바뀌는 건 사람이 재실행했을 때뿐이다. */
  useEffect(() => {
    if (!세션) return undefined;
    let 살아있음 = true;
    배치미달받기(세션.access_token).then((v) => { if (살아있음) set배치미달(v); });
    return () => { 살아있음 = false; };
  }, [세션]);

  /* 가이드(몽글/까몽/마린 · D4-1) — 정본은 기기 파일 하나(guide_choice.json · src/저장.js)다.
     세션이 설 때마다 다시 읽는다: 복원이든 로그인이든 이 한 자리가 줍고, 첫 등록이
     로그인성공 직전에 쓴 값도 그 로그인의 세션이 서는 순간 여기로 들어온다. */
  useEffect(() => {
    let 살아있음 = true;
    가이드읽기().then((v) => { if (살아있음) set캐릭터(v); }).catch(() => {});
    return () => { 살아있음 = false; };
  }, [세션]);

  const 세션세움 = async (새것) => {
    set세션(새것);
    // 저장 실패가 로그인을 막지 않는다 — 세션은 이미 섰고, 최악은 다음 실행에 다시 묻는 것뿐이다
    await 세션쓰기(새것).catch(() => {});
  };

  if (!fontsLoaded || 복원중) {
    /* 폰트 전에 글자를 그리면 시스템 폰트로 한 번 번쩍인다 — 빈 Navy 화면이 낫다.
       세션 복원도 같은 이유로 여기서 기다린다: 먼저 로그인 화면을 띄웠다가 지우면,
       이미 로그인된 학생에게 「로그아웃됐나?」 하는 순간을 매번 보여주게 된다.
       🔑 그 «빈 화면»에 브랜드 기호를 세운다(로고 승격 08-24 — 「로딩 = 큰 기호」가 정본 자리).
          기호는 View 로만 그려서 **폰트를 안 탄다** — 이 화면이 기다리는 그 폰트 말이다.
          🚫 코랄 아님: 이 앱의 신호 1점은 화면마다 못박혀 있다(테마 `신호자리`). */
    return (
      <View style={[s.로딩, s.로딩가운데]}>
        <기호 크기={56} />
      </View>
    );
  }

  // 🔴 로그인 전에는 다른 화면을 그리지 않는다 — 쓰기 통로가 전부 토큰을 요구하므로,
  //    안 그러면 학생이 말하기를 하고 나서야 「저장이 안 됐다」를 만난다.
  if (!세션) {
    /* 🔑 검수문만 예외다(개발 빌드 한정) — 검수문의 존재 이유가 «서버 데이터 없이 움직임을
       본다»(그 파일 머리말 08-24)인데 문이 로그인 «뒤»에만 있으면 새 에뮬레이터는 원리상
       못 들어간다(08-25 검수가 막힌 두 벽 중 하나). 값은 전부 가짜라 토큰이 필요 없다.
       ⚠ 입구를 화면 «아래»에 두는 것도 진단이다 — 상단 y34 줄은 08-25 에 adb 탭이 안 먹던
       자리라(원인 미확정 · memory `emulator-review-blocked`), 같은 줄에 두면 이 문도 같이
       막히고, 아래가 되는데 위가 안 되면 그 줄의 결함이 실측으로 갈린다(SYSTEM·어제의 나도
       그 줄에 있다). */
    if (__DEV__ && 화면 === '검수문') {
      return (
        <View style={s.wrap}>
          <StatusBar style="light" />
          <검수문 돌아가기={() => set화면('말하기')} />
        </View>
      );
    }
    /* 복원이 막혔다(retryable · D7-3) — 로그인 폼 대신 오프라인 카드. 자격은 키체인에 그대로
       있으니 비밀번호를 다시 받는 것은 틀린 문이고, 기기 넘김만 손으로가기 로 연다. */
    if (복원막힘) {
      return (
        <View style={s.wrap}>
          <StatusBar style="light" />
          <오프라인카드 손으로가기={() => set복원막힘(false)} />
        </View>
      );
    }
    return (
      <View style={s.wrap}>
        <StatusBar style="light" />
        <인증화면 로그인성공={세션세움} 초기학생번호={초기번호} />
        {__DEV__ && (
          <Pressable
            onPress={() => set화면('검수문')}
            style={s.검수문링크_문앞}
            accessibilityRole="button"
            accessibilityLabel="검수문"
            hitSlop={{ top: 18, bottom: 14, left: 10, right: 10 }}
          >
            <Text style={s.검수문글} maxFontSizeMultiplier={글자배율상한}>검수문</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      <StatusBar style="light" />
      {/* 라우팅 묶음 — 오류 울타리(G2-3) «안»의 화면틀(D5-2). key={화면} 로 화면 전환마다
          remount — 경계 상태 리셋과 등장 한 박자가 한 자리에서 난다. 한 화면이 그리다 죽으면
          경계가 fallback 을 세우고(관측보고), 겉테 상주 층(SYSTEM·답장·어제 링크)은 아래
          밖에 남아 테는 계속 서 있다. */}
      <오류경계 화면이름={화면} key={화면} 되세우기={() => set화면('말하기')}>
        <화면틀 key={화면}>
          {/* 🔴 토큰을 넘긴다 — 이게 없으면 화면은 서버 과제를 못 읽고 **고정 문장으로 조용히 내려간다**.
              그 상태가 실기기 데모를 통과하는 것이 P0 §4-3 이 순서를 뒤집은 이유다.
              학생번호도 함께 — 막힌 학생의 안내가 「선생님께 이 번호를 보여 주세요」로 끝나는데
              토큰에는 합성 이메일뿐이라, 이 자리를 지나지 않으면 화면이 그 번호를 모른다(F176 ①). */}
          {화면 === '말하기' && (
            <말하기화면
              토큰={세션.access_token}
              학생번호={세션.학생번호}
              캐릭터={캐릭터}
              견줌={견줌값?.견줌 ?? null}
              견줌다시읽기={견줌읽기}
              확인카드값={견줌값?.오늘의확인 ?? null}
              목표카드값={견줌값?.오늘의목표 ?? null}
            />
          )}
          {/* 🔑 답장에도 학생번호를 넘긴다 — 말하기 화면과 **같은 이유**다(위 주석). 막힘 안내가
              「선생님께 학생번호를 보여 주시면 바로 열려요」로 끝나는데 번호를 안 넘기면
              `막힘카드` 가 그 칸을 안 그려, 같은 카드가 두 화면에서 다르게 동작한다. */}
          {화면 === '답장' && (
            <답장화면
              토큰={세션.access_token} 교정={교정} 막힘={교정막힘} 캐릭터={캐릭터}
              학생번호={세션.학생번호} 돌아가기={() => set화면('말하기')}
            />
          )}
          {화면 === '시스템' && <도착확인 돌아가기={() => set화면('말하기')} 가기={set화면} />}
          {/* 🔑 토큰을 **안 넘긴다** — 비밀번호가 바뀌면 이 토큰의 세션이 죽는다(전층감사 §2-6).
              화면은 변경이 돌려준 새 세션을 `로그인성공` 으로 세우고, 그게 이 자리의 유일한 세션이다. */}
          {화면 === '비번변경' && (
            <인증화면
              시작단계={단계.변경}
              닫기={() => set화면('말하기')}
              로그인성공={세션세움}
            />
          )}
          {화면 === '초기화' && (
            <원장초기화 토큰={세션.access_token} 닫기={() => set화면('말하기')} />
          )}
          {/* 🔑 직원 통로다 — 학생 토큰으로 열면 서버가 403 `NOT_STAFF` 를 준다(`도착확인` 링크와
              같은 규칙: 권한은 화면이 아니라 서버가 정한다). 겉테에 링크를 안 두는 것은 권한이
              아니라 자리 때문이다 — 말하기 화면의 동사는 하나다. */}
          {화면 === '검수' && (
            <검수화면 토큰={세션.access_token} 돌아가기={() => set화면('시스템')} />
          )}
          {/* 🔑 검수와 **다른 문**이다(`teach` · 허용 역할 `teacher`·`director`) — 강사가 검수
              권한까지 얻으면 라벨 권위가 무너진다(M2 설계 §2 · `review` 는 teacher→403 을 실왕복
              핀으로 박았다). 같은 규칙으로 여기서도 권한은 서버가 정한다. */}
          {화면 === '강사' && (
            <강사화면 토큰={세션.access_token} 돌아가기={() => set화면('시스템')} />
          )}
          {/* 🔴 **셋째 문**이다(`l10n` · 허용 역할 `l10n_reviewer`·`director`). 🚫 `inspector` 는
              안 받는다 — 몽골어 감수자는 **외부 계약자**라, 검수 권한을 겸하면 학생 발화 큐에도
              그대로 통과한다. 막는 것은 역할 설정이 아니라 **자원**이다: 이 통로가 닿는 표에는
              학생 식별자가 한 칸도 없다(스키마가 보장 · 회귀가 소스에서 잰다). */}
          {화면 === '문구감수' && (
            <문구감수화면 토큰={세션.access_token} 돌아가기={() => set화면('시스템')} />
          )}
          {/* 🔑 골든 판정과 **같은 문**(`teach`)의 다른 경로이고, **화면은 일부러 따로 둔다** —
              합치면 골든의 주 5건 상한이 반 큐 물량에 묻혀 「유인이 0인 업무」가 영영 안 끝난다
              (강사_반단위_피드백_설계 §5). 🔴 개원 뒤 사람 손이 실제로 도는 자리가 여기다:
              통로(§8-3)만 서고 이 화면이 없으면 그 통로의 통과량은 원리상 0이다. */}
          {화면 === '반피드백' && (
            <반피드백화면 토큰={세션.access_token} 돌아가기={() => set화면('시스템')} />
          )}
          {/* 🔑 같은 문(`teach`)의 다른 경로다 — 골든 판정은 「AI 교정이 맞나」를, 나침반은 「이
              학생이 스스로 무엇을 말했나」를 담는다. 🔴 후자만 **소급이 원리상 불가능**하다
              (시즌회고_설계 §2 — 나중에 물으면 나오는 것은 오늘의 답이지 그때의 답이 아니다). */}
          {화면 === '나침반' && (
            <나침반화면 토큰={세션.access_token} 돌아가기={() => set화면('시스템')} />
          )}
          {/* 🔑 나침반의 **짝**이다 — 나침반이 시즌 «시작»에 학생의 선언을 담고, 회고가 시즌 «끝»에
              그 옆에 실기록을 놓고 사람이 부호를 찍는다. 🔴 성향 8축은 「지금 어떤가」만 알고
              그게 좋은 방향이었는지는 모른다 — 그걸 아는 것은 사람뿐이고 말하는 자리는 여기뿐이라
              (시즌회고_설계 §7) 이 화면이 밀리면 그 시즌의 라벨은 0이다. */}
          {화면 === '회고' && (
            <회고화면 토큰={세션.access_token} 돌아가기={() => set화면('시스템')} />
          )}
          {/* 🔑 같은 문(`teach`)의 다른 경로다 — 골든·나침반·회고가 **앱이 이미 아는 것**을 사람이
              판정하는 자리라면, 관찰은 **앱이 원리상 못 아는 것**이 처음 들어오는 자리다
              (발음·태도·듣기·위축 · 관찰태그_자동화_설계 v1.1 §4). 🔴 그래서 이 화면이 없으면
              그 축은 엔진에 0건이고, 0건인 축은 「학생이 그렇지 않다」와 구분이 안 된다. */}
          {화면 === '관찰' && (
            <관찰화면 토큰={세션.access_token} 돌아가기={() => set화면('시스템')} />
          )}
          {/* 🔑 강사·원장이 몽글에게 «지금 정본»을 묻는 문(`companion/ask` · G1-5)이다 —
              권한은 서버가 정한다(학생 토큰이면 403 · `도착확인` 링크와 같은 규칙). */}
          {화면 === '몽글' && (
            <몽글문화면 토큰={세션.access_token} 돌아가기={() => set화면('시스템')} />
          )}
          {화면 === '어제' && <어제의나 값={견줌값?.견줌 ?? null} 돌아가기={() => set화면('말하기')} />}
          {/* 🔴 검수문 — **개발 빌드에서만**(`src/검수문.js` 머리말 · 위 조건부 require).
              왜 필요한가: 화면들이 전부 서버 데이터가 있어야 닿아서, 박자·연기 같은 «움직임»을
              눈으로 볼 자리가 없었다(08-24 실측 — 에뮬레이터를 띄워도 로그인 화면뿐이었다). */}
          {__DEV__ && 화면 === '검수문' && <검수문 돌아가기={() => set화면('말하기')} />}
        </화면틀>
      </오류경계>
      {화면 === '말하기' && (
        <Pressable
          onPress={() => set화면('시스템')}
          style={s.시스템링크}
          accessibilityRole="button"
          accessibilityLabel="설정"
          hitSlop={{ top: 18, bottom: 14, left: 10, right: 10 }}
        >
          <Text style={s.시스템글} maxFontSizeMultiplier={글자배율상한}>SYSTEM</Text>
        </Pressable>
      )}
      {/* 🔑 링크를 **여기** 두는 이유: 말하기 화면은 「동사 하나」라 그 안에 다른 입구를 두면
          90초 한 흐름이 끊긴다. 앱의 겉테(SYSTEM 링크와 같은 층)가 이 자리다.
          🔴 교정이 없으면 아예 안 그린다 — 눌러서 빈 화면을 만나는 것이 더 큰 오해다. */}
      {/* 🔴 「답장이 왔어요」라고 쓰지 않는다 — 조회는 **늘 최신 1건**(C0 §4-3 ②)이라 이미 읽은
          교정에도 링크가 그대로 선다. 그러면 그 문구는 첫날 말고는 매일 거짓이 된다.
          「새로 왔다」는 알림은 별건이다(발주_게임모듈 §137 — 검수 완료 시점을 앱이 모른다). */}
      {/* 🔴 「어제의 나」도 있을 때만 그린다 — 첫날은 견줄 어제가 없다(`lib/견줌.js`).
          두 링크는 **한 줄에 나란히** 둔다: 각자 absolute 로 놓으면 같은 좌표에 겹치고,
          겹침은 한쪽이 없을 때만 안 보여서 「어떤 학생에게만」 깨진다. */}
      {/* 🔴 배치 미달은 **원장에게만** 값이 온다 — 학생 화면에는 이 칸이 아예 안 그려진다.
          코랄을 쓰지 않는다: 이 화면의 신호 1점은 녹음 버튼이고(`테마.신호자리`), 둘로
          만들면 R1 이 깨진다. 위계는 **밝기**로 준다(다른 두 링크보다 한 층 위). */}
      {화면 === '말하기' && (배치미달 || 교정 || 견줌값?.견줌) && (
        <View style={s.겉테줄}>
          {배치미달 && (
            <Text style={s.미달글} maxFontSizeMultiplier={글자배율상한}>오늘 배달 {배치미달.배정}/{배치미달.재적}</Text>
          )}
          {교정 && (
            <Pressable
              onPress={() => set화면('답장')}
              accessibilityRole="button"
              accessibilityLabel="답장"
              hitSlop={{ top: 18, bottom: 10, left: 8, right: 8 }}
            >
              <Text style={s.겉테글} maxFontSizeMultiplier={글자배율상한}>답장</Text>
            </Pressable>
          )}
          {견줌값?.견줌 && (
            <Pressable
              onPress={() => set화면('어제')}
              accessibilityRole="button"
              accessibilityLabel="어제의 나"
              hitSlop={{ top: 18, bottom: 10, left: 8, right: 8 }}
            >
              <Text style={s.겉테글} maxFontSizeMultiplier={글자배율상한}>어제의 나</Text>
            </Pressable>
          )}
        </View>
      )}
      {/* 검수문 입구 — 개발 빌드에서만. 겉테 오른쪽 끝에 붙여 학생 흐름(동사 하나)을 안 건드린다. */}
      {__DEV__ && 화면 === '말하기' && (
        <Pressable
          onPress={() => set화면('검수문')}
          style={s.검수문링크}
          accessibilityRole="button"
          accessibilityLabel="검수문"
          hitSlop={{ top: 18, bottom: 14, left: 10, right: 10 }}
        >
          <Text style={s.검수문글} maxFontSizeMultiplier={글자배율상한}>검수문</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 색.바탕 },
  로딩: { flex: 1, backgroundColor: 색.바탕 },
  로딩가운데: { alignItems: 'center', justifyContent: 'center' },
  /* 겉테 두 링크는 같은 띠에 마주 놓는다 — 말하기 화면 본문은 paddingTop 68 아래에서 시작해
     이 띠와 겹치지 않는다. 🚫 코랄로 칠하지 않는다: 그 화면의 신호 1점은 녹음 버튼이다. */
  /* + 상단밀림: 컷아웃 기기에서 이 줄이 상태바 창 밑에 깔려 탭을 시스템이 먹는다(08-25 미제 ·
     전말 = src/인셋.js). 마스코트·본문 시작선도 같은 밀림으로 한 몸으로 내려간다. */
  겉테줄: { position: 'absolute', top: 34 + 상단밀림, left: 24, flexDirection: 'row', gap: 18 },
  겉테글: { fontFamily: 폰트.강조, fontSize: 13, color: 색.잉크_서브 },
  // 같은 줄의 링크(잉크_서브)보다 한 층 위 — 색을 안 바꾸고 밝기만으로 먼저 읽히게 한다.
  미달글: { fontFamily: 폰트.강조, fontSize: 13, color: 색.잉크 },
  시스템링크: { position: 'absolute', top: 34 + 상단밀림, right: 24, opacity: 0.8 },
  /* 검수문 링크 — SYSTEM 과 **같은 줄, 그 왼쪽**(개발 빌드 전용).
     🔴 이 줄(y34~50)은 겉테가 쓰고 마스코트는 top 64 부터다 — 여기 y 를 내리면 몽글 몸이
     링크를 덮어 탭을 가로챈다(08-23 시연 실측에서 이미 한 번 났다). */
  검수문링크: { position: 'absolute', top: 34 + 상단밀림, right: 84, opacity: 0.8 },
  // 로그인 화면의 문앞 입구 — 아래에 두는 까닭은 위 `if (!세션)` 주석(상단 줄 진단).
  검수문링크_문앞: { position: 'absolute', bottom: 34, right: 24, opacity: 0.8 },
  검수문글: {
    fontFamily: 폰트.모노,
    fontSize: 10,
    letterSpacing: 모노트래킹.라벨,
    color: 색.잉크_메타,
  },
  시스템글: {
    fontFamily: 폰트.모노,
    fontSize: 10,
    letterSpacing: 모노트래킹.라벨,
    color: 색.잉크_메타,
  },
});
