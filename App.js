import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import 말하기화면 from './src/말하기화면';
import 도착확인 from './src/도착확인';
import 인증화면, { 단계 } from './src/인증화면';
import 원장초기화 from './src/원장초기화';
import * as 인증 from './src/인증API';
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
      {화면 === '말하기' && (
        <Pressable onPress={() => set화면('시스템')} style={s.시스템링크} hitSlop={8}>
          <Text style={s.시스템글}>SYSTEM</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 색.바탕 },
  로딩: { flex: 1, backgroundColor: 색.바탕 },
  시스템링크: { position: 'absolute', top: 34, right: 24, opacity: 0.8 },
  시스템글: {
    fontFamily: 폰트.모노,
    fontSize: 10,
    letterSpacing: 모노트래킹.라벨,
    color: 색.잉크_메타,
  },
});
