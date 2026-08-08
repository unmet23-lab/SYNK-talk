import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import 말하기화면 from './src/말하기화면';
import 답장화면 from './src/답장화면';
import 어제의나, { 진행받기 } from './src/어제의나';
import 도착확인 from './src/도착확인';
import 인증화면, { 단계 } from './src/인증화면';
import 원장초기화 from './src/원장초기화';
import * as 인증 from './src/인증API';
import { 교정목록받기 } from './src/교정API';
import { 세션읽기, 세션쓰기, 세션지우기 } from './src/저장';
import { 색, 폰트, 모노트래킹 } from './src/테마';

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
  const [견줌값, set견줌값] = useState(null); // 오늘·어제 (첫날이면 null — 「어제의 나」 링크를 안 그린다)
  const [fontsLoaded] = useFonts({
    'SUIT-Regular': require('./assets/fonts/SUIT-Regular.ttf'),
    'SUIT-Medium': require('./assets/fonts/SUIT-Medium.ttf'),
    'SUIT-SemiBold': require('./assets/fonts/SUIT-SemiBold.ttf'),
    'SUIT-ExtraBold': require('./assets/fonts/SUIT-ExtraBold.ttf'),
    'DMMono-Medium': require('./assets/fonts/DMMono-Medium.ttf'),
  });

  /* 시작하자마자 저장된 세션으로 갱신을 시도한다. 성공하면 학생은 로그인 화면을 아예 안 본다. */
  useEffect(() => {
    let 살아있음 = true;
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
        /* 🔴 만료면 지우고, 네트워크면 남긴다. 둘 다 로그인 화면으로 보내지만 뒷일이 다르다 —
           비행기 모드에서 지워 버리면 학생은 이유 없이 자격을 잃는다. */
        if (e && e.code !== 'NETWORK') await 세션지우기().catch(() => {});
      } finally {
        if (살아있음) set복원중(false);
      }
    })();
    return () => { 살아있음 = false; };
  }, []);

  /* 답장(교정)이 **있을 때만** 링크를 그린다 — P0 §5 S1-8 「교정이 없으면 화면에 안 뜸」 ·
     C0 §4-3 ② 「빈 카드 금지」. 그래서 목록을 여기서 한 번 읽고 화면에 내려준다:
     🔑 링크의 근거와 화면이 그리는 것이 **같은 한 번의 조회**여야 한다. 두 번 읽으면 링크는
        떴는데 화면은 비는 날이 생기고, 학생 눈에는 앱이 고장난 것으로 보인다.
     🔴 실패는 **조용하다** — 답장 링크가 안 뜰 뿐 말하기는 그대로 돌아야 한다(교정 조회가
        죽었다고 오늘 발화를 막으면, 못 고칠 이유로 학생의 하루를 버린다). */
  useEffect(() => {
    if (!세션) return undefined;
    let 살아있음 = true;
    (async () => {
      try {
        const { 목록 } = await 교정목록받기(세션.access_token);
        if (살아있음) set교정(목록[0] || null);
      } catch {
        if (살아있음) set교정(null);
      }
    })();
    return () => { 살아있음 = false; };
  }, [세션]);

  /* 「어제의 나」도 같은 규칙이다(P0 §5 S1-11) — **한 번 읽어** 링크의 근거와 화면의 내용을
     같은 것으로 만든다. 🔴 첫날이면 `null` 이 오고 그때는 링크 자체를 안 그린다: 눌러서
     「어제 0 · 오늘 0」을 만나는 것은 빈 카드고, 없는 과거를 지어내는 것이기도 하다.
     ⚠ 답장과 **따로** 읽는다 — 한 번에 묶으면 한쪽이 죽을 때 멀쩡한 쪽 링크까지 같이 사라진다. */
  useEffect(() => {
    if (!세션) return undefined;
    let 살아있음 = true;
    (async () => {
      try {
        const 값 = await 진행받기(세션.access_token);
        if (살아있음) set견줌값(값);
      } catch {
        if (살아있음) set견줌값(null);
      }
    })();
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
       이미 로그인된 학생에게 「로그아웃됐나?」 하는 순간을 매번 보여주게 된다. */
    return <View style={s.로딩} />;
  }

  // 🔴 로그인 전에는 다른 화면을 그리지 않는다 — 쓰기 통로가 전부 토큰을 요구하므로,
  //    안 그러면 학생이 말하기를 하고 나서야 「저장이 안 됐다」를 만난다.
  if (!세션) {
    return (
      <View style={s.wrap}>
        <StatusBar style="light" />
        <인증화면 로그인성공={세션세움} />
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      <StatusBar style="light" />
      {/* 🔴 토큰을 넘긴다 — 이게 없으면 화면은 서버 과제를 못 읽고 **고정 문장으로 조용히 내려간다**.
          그 상태가 실기기 데모를 통과하는 것이 P0 §4-3 이 순서를 뒤집은 이유다.
          학생번호도 함께 — 막힌 학생의 안내가 「선생님께 이 번호를 보여 주세요」로 끝나는데
          토큰에는 합성 이메일뿐이라, 이 자리를 지나지 않으면 화면이 그 번호를 모른다(F176 ①). */}
      {화면 === '말하기' && <말하기화면 토큰={세션.access_token} 학생번호={세션.학생번호} />}
      {화면 === '답장' && (
        <답장화면 토큰={세션.access_token} 교정={교정} 돌아가기={() => set화면('말하기')} />
      )}
      {화면 === '시스템' && <도착확인 돌아가기={() => set화면('말하기')} 가기={set화면} />}
      {화면 === '비번변경' && (
        <인증화면
          시작단계={단계.변경}
          토큰={세션.access_token}
          닫기={() => set화면('말하기')}
          로그인성공={세션세움}
        />
      )}
      {화면 === '초기화' && (
        <원장초기화 토큰={세션.access_token} 닫기={() => set화면('말하기')} />
      )}
      {화면 === '어제' && <어제의나 값={견줌값} 돌아가기={() => set화면('말하기')} />}
      {화면 === '말하기' && (
        <Pressable onPress={() => set화면('시스템')} style={s.시스템링크} hitSlop={8}>
          <Text style={s.시스템글}>SYSTEM</Text>
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
      {화면 === '말하기' && (교정 || 견줌값) && (
        <View style={s.겉테줄}>
          {교정 && (
            <Pressable onPress={() => set화면('답장')} hitSlop={8}>
              <Text style={s.겉테글}>답장</Text>
            </Pressable>
          )}
          {견줌값 && (
            <Pressable onPress={() => set화면('어제')} hitSlop={8}>
              <Text style={s.겉테글}>어제의 나</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 색.바탕 },
  로딩: { flex: 1, backgroundColor: 색.바탕 },
  /* 겉테 두 링크는 같은 띠에 마주 놓는다 — 말하기 화면 본문은 paddingTop 68 아래에서 시작해
     이 띠와 겹치지 않는다. 🚫 코랄로 칠하지 않는다: 그 화면의 신호 1점은 녹음 버튼이다. */
  겉테줄: { position: 'absolute', top: 34, left: 24, flexDirection: 'row', gap: 18 },
  겉테글: { fontFamily: 폰트.강조, fontSize: 13, color: 색.잉크_서브 },
  시스템링크: { position: 'absolute', top: 34, right: 24, opacity: 0.8 },
  시스템글: {
    fontFamily: 폰트.모노,
    fontSize: 10,
    letterSpacing: 모노트래킹.라벨,
    color: 색.잉크_메타,
  },
});
