import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import * as Updates from 'expo-updates';
import { 색, 폰트, 모노트래킹, 눌림감 } from './테마';
import { 못보낸수, 기기비우기 } from './저장';
import { 관측상태 } from './관측';

/**
 * 관측이 **정말 켜졌는지**를 이 화면이 말한다.
 * 🔴 이 한 줄이 있는 이유: DSN 을 안 넣은 빌드도 겉으로는 멀쩡히 돌기 때문에, 이 창이 없으면
 *   「Sentry 붙였다」와 「붙였다고 믿는다」가 기기 위에서 구별되지 않는다(`src/관측.js` 머리말).
 *   DSN 값 자체는 절대 안 그린다 — 화면에 뜨는 순간 그건 유출이다.
 */
function 관측표시() {
  const { 켜짐, 사유, 합성 } = 관측상태();
  if (켜짐) return 합성 ? '켜짐 · 합성밟기' : '켜짐 · 실사용';
  if (사유 === 'dsn_없음') return '꺼짐 — DSN 없음';
  if (사유 === 'not_initialized') return '꺼짐 — 세우기 안 부름';
  return `꺼짐 — ${사유}`;
}

/**
 * 배포 도착 확인 화면 — 기능이 아니라 「내가 민 것이 여기 왔는가」를 보는 창.
 * 회화 기능이 생기면서 첫 화면 자리를 내주고 여기(설정 안쪽)로 옮겨졌다. 지우지 않는다.
 */

function show(v) {
  if (v === null || v === undefined || v === '') return '(없음)';
  return String(v);
}

export default function 도착확인({ 돌아가기, 가기 }) {
  /* `확인` = null 이면 닫힘 · 숫자면 열림이고 그 값이 **아직 서버에 안 닿은 발화 수**다.
     0 이어야 나갈 수 있다 — 판정을 열 때 한 번 재고 카드가 그 수를 그대로 보여준다. */
  const [확인, set확인] = useState(null);
  const [알림, set알림] = useState('');

  /**
   * 🔴 **나가기 전에 밀린 것을 — 모든 큐에서 — 센다.** 이 화면이 지우는 것은 기기에만 있는
   *   기록이라, 아직 안 올라간 것이 있는 채로 나가면 그것은 **어디에도 남지 않는다**(서버엔
   *   없고 기기에선 지워진다). 몽골 회선에서 전송 실패는 예외가 아니라 상시다.
   * 🔑 세는 통로는 `저장.못보낸수` **하나**다(B1) — 여기서 큐를 낱낱이 세면 새 큐(게임 로그가
   *   실제로 그랬다)가 생길 때 이 게이트만 몰라서, 미전송 메일이 「보낸 것은 서버에 있어요」로
   *   읽히고 지워진다.
   * 🔑 재전송은 여기서 안 한다 — 밀린 것을 올리는 자리는 말하기 화면 한 곳이고(제출·게임 큐
   *   둘 다 그 화면의 마운트·복귀가 민다), 여기에 둘째 통로를 내면 같은 항목이 두 곳에서 올라간다.
   */
  async function 물어보기() {
    set알림('');
    try {
      set확인(await 못보낸수());
    } catch (e) {
      // 못 읽었으면 **모르는 것**이다 — 0 으로 넘겨 짚지 않는다(그 짐작의 대가가 발화 소멸이다).
      set알림('기록을 확인하지 못해 나갈 수 없어요: ' + String((e && e.message) || e));
    }
  }

  async function 나가기() {
    try {
      await 기기비우기();
      await Updates.reloadAsync();
    } catch {
      /* 기록은 이미 지워졌다(`기기비우기` 가 먼저 끝난다) — 다시 켜면 로그인 화면이다.
         reload 가 안 도는 판이 있으므로 실패를 숨기지 않고 다음 할 일을 말한다. */
      set확인(null);
      set알림('나왔어요 — 앱을 껐다 켜 주세요.');
    }
  }

  const 줄 = [
    ['앱 버전', require('../app.json').expo.version],
    ['런타임 버전', show(Updates.runtimeVersion)],
    ['빌드 커밋', process.env.EXPO_PUBLIC_COMMIT || '(로컬)'],
    ['업데이트 채널', show(Updates.channel)],
    ['업데이트 ID', show(Updates.updateId)],
    ['내장 번들로 실행', Updates.isEmbeddedLaunch ? '예' : '아니오'],
    ['플랫폼', `${Platform.OS} ${show(Platform.Version)}`],
    ['관측(Sentry)', 관측표시()],
  ];

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.inner}>
      <Text style={s.label}>SYSTEM</Text>
      {/* 첫 칸이 계정이 되면서 제목도 「계정 · 배포 확인」류로 다듬을 여지가 있다 — 카피 확정은 유호님 몫. */}
      <Text style={s.title}>배포 도착 확인</Text>

      {/* 계정 — 이 화면이 앱의 유일한 「설정 안쪽」이라 여기 붙는다.
          🔑 초기화는 숨기지 않는다: 권한은 화면이 아니라 서버가 정하고, 원장이 아닌 토큰은 403 을 받는다. */}
      {가기 && (
        <View style={s.card}>
          <Pressable onPress={() => 가기('비번변경')} accessibilityRole="button" hitSlop={6}
            style={({ pressed }) => [s.줄버튼, pressed && { opacity: 눌림감.글 }]}>
            <Text style={s.줄버튼글}>비밀번호 바꾸기</Text>
          </Pressable>
          <Pressable onPress={() => 가기('초기화')} accessibilityRole="button" hitSlop={6}
            style={({ pressed }) => [s.줄버튼, pressed && { opacity: 눌림감.글 }]}>
            <Text style={s.줄버튼글}>학생 비밀번호 초기화 (원장)</Text>
          </Pressable>
          {/* 🔑 초기화와 같은 규칙 — **숨기지 않는다.** 검수 권한은 서버가 정하고(`inspector`·
              `director`), 아닌 토큰은 403 `NOT_STAFF` 를 받는다. 화면에서 감추는 것은 편의이지
              권한이 아니다. 2027-02 채용 전까지 이 통로를 쓰는 사람은 원장 본인이다. */}
          <Pressable onPress={() => 가기('검수')} accessibilityRole="button" hitSlop={6}
            style={({ pressed }) => [s.줄버튼, pressed && { opacity: 눌림감.글 }]}>
            <Text style={s.줄버튼글}>발화 검수 (원장·검수자)</Text>
          </Pressable>
          {/* 🔑 검수와 **다른 축**이다 — 검수자는 「무엇을 말했나」(전사), 강사는 「AI 교정이
              교육적으로 맞나」(라벨)를 판정한다(M2 설계 §2). 그래서 문도 다르다(`teach` ·
              `teacher`·`director`). 여기서도 숨기지 않는다 — 권한은 서버가 정한다. */}
          <Pressable onPress={() => 가기('강사')} accessibilityRole="button" hitSlop={6}
            style={({ pressed }) => [s.줄버튼, pressed && { opacity: 눌림감.글 }]}>
            <Text style={s.줄버튼글}>이번 주 AI 교정 채점 (원장·강사)</Text>
          </Pressable>
          {/* 🔑 골든 판정과 같은 문(`teach`)인데 **메뉴를 나눈다** — 한 화면으로 합치면 골든의
              주 5건 상한이 반 큐 물량에 묻혀 「유인이 0인 업무」가 영영 안 끝난다
              (강사_반단위_피드백_설계 §5). 🔴 개원 뒤 사람 손이 실제로 도는 자리라, 이 줄이
              없으면 화면이 서 있어도 아무도 못 연다(강사 한 마디 생산량 0). */}
          <Pressable onPress={() => 가기('반피드백')} accessibilityRole="button" hitSlop={6}
            style={({ pressed }) => [s.줄버튼, pressed && { opacity: 눌림감.글 }]}>
            <Text style={s.줄버튼글}>반 피드백 (원장·강사)</Text>
          </Pressable>
          {/* 🔴 **소급이 원리상 안 되는 유일한 자리**다(시즌회고_설계 §2) — 나침반은 입학하는
              그날과 시즌이 열리는 그날에만 담긴다. 밀리면 그 학생의 회고는 영원히 반쪽이고,
              대외로는 「입학할 때, 그리고 시즌마다」가 이미 약속돼 있다(상담AI FAQ Q11).
              문은 골든 판정과 같다(`teach` · `teacher`·`director`) — 권한은 서버가 정한다. */}
          <Pressable onPress={() => 가기('나침반')} accessibilityRole="button" hitSlop={6}
            style={({ pressed }) => [s.줄버튼, pressed && { opacity: 눌림감.글 }]}>
            <Text style={s.줄버튼글}>나침반 세션 (원장·강사)</Text>
          </Pressable>
          {/* 🔴 나침반의 **짝**이다 — 시즌 끝에 그 선언 옆에 실기록을 놓고 사람이 부호를 찍는다.
              성향 8축은 「지금 어떤가」만 알고 그게 좋은 방향이었는지는 모르므로, 이 화면이
              엔진의 **유일한 라벨 생산자**다(시즌회고_설계 §7). 밀리면 그 시즌은 라벨 0이고
              라벨 0인 시즌은 엔진에서 존재하지 않는 것과 같다. */}
          <Pressable onPress={() => 가기('회고')} accessibilityRole="button" hitSlop={6}
            style={({ pressed }) => [s.줄버튼, pressed && { opacity: 눌림감.글 }]}>
            <Text style={s.줄버튼글}>시즌 회고 (원장·강사)</Text>
          </Pressable>
          {/* 🔴 **앱이 원리상 못 보는 것**의 유일한 통로다(관찰태그_자동화_설계 v1.1 §4) —
              발음·태도·듣기·위축은 앱 데이터에 흔적이 없다. 이 줄이 없으면 그 관찰은 라이브
              구글 폼으로만 가고, 그 행들은 그 시점의 동의판·급수 스냅샷을 **영원히 못 갖는다**
              (§4 ③ · 소급 불가). 문은 위 넷과 같다(`teach` · `teacher`·`director`). */}
          <Pressable onPress={() => 가기('관찰')} accessibilityRole="button" hitSlop={6}
            style={({ pressed }) => [s.줄버튼, pressed && { opacity: 눌림감.글 }]}>
            <Text style={s.줄버튼글}>교실 관찰 남기기 (원장·강사)</Text>
          </Pressable>
          {/* 🔑 몽글에게 묻는 문(`companion/ask` · G1-5)이다 — 위 줄들과 같은 규칙으로 숨기지
              않는다: 권한은 서버 403 이 정한다. 이 줄이 없으면 서버·지식·로그가 다 서 있어도
              그 문의 통과량은 원리상 0이다(`src/몽글API.js` 머리말의 그 병). */}
          <Pressable onPress={() => 가기('몽글')} accessibilityRole="button" hitSlop={6}
            style={({ pressed }) => [s.줄버튼, pressed && { opacity: 눌림감.글 }]}>
            <Text style={s.줄버튼글}>몽글에게 묻기 (원장·강사)</Text>
          </Pressable>
          {/* 🔴 위 넷과 **다른 문**이다 — 여기 닿는 표에는 학생이 한 칸도 없다(몽골어 문구만).
              그래서 외부 계약자에게 이 줄만 열어 줄 수 있다. 이 줄이 없으면 화면이 서 있어도
              아무도 못 열고, 그러면 몽골어 감수 처리량은 원리상 0이다(강사 줄과 같은 이유). */}
          <Pressable onPress={() => 가기('문구감수')} accessibilityRole="button" hitSlop={6}
            style={({ pressed }) => [s.줄버튼, pressed && { opacity: 눌림감.글 }]}>
            <Text style={s.줄버튼글}>몽골어 문구 감수 (원장·감수자)</Text>
          </Pressable>
          {/* 🔴 이 통로가 없으면 한 기기는 **영원히 한 계정**이다 — 공용·형제 기기에서 다음
              학생의 발화가 앞 학생 행으로 저장되고, append-only 라 되돌릴 방법이 없다. */}
          <Pressable onPress={물어보기} accessibilityRole="button" hitSlop={6}
            style={({ pressed }) => [s.줄버튼, pressed && { opacity: 눌림감.글 }]}>
            <Text style={s.줄버튼글}>이 기기에서 나가기</Text>
          </Pressable>
        </View>
      )}

      <View style={s.card}>
        {줄.map(([k, v]) => (
          <View key={k} style={s.row}>
            <Text style={s.key}>{k}</Text>
            <Text style={s.value}>{v}</Text>
          </View>
        ))}
      </View>

      <Text style={s.note}>
        「업데이트 ID」가 바뀌면 새 코드가 도착한 거예요.{'\n'}개발 중에는 (없음)이 떠도 괜찮아요.
      </Text>

      {알림 ? <Text style={s.알림}>{알림}</Text> : null}

      {확인 !== null && (확인 > 0 ? (
        <View style={s.card}>
          {/* 「발화」라고 못 부른다 — 이 수는 이제 게임 메일·고름까지 합산이다(못보낸수). */}
          <Text style={s.확인머리}>아직 보내지 못한 것이 {확인}건 있어요</Text>
          <Text style={s.note}>
            인터넷에 연결하고, 아래 버튼으로 말하기 화면을 열면 밀린 것이 그때 올라가요.
            {'\n'}지금 나가면 그것은 어디에도 남지 않아요.
          </Text>
          {/* 재전송은 여기서 안 한다(위 물어보기 주석 · 둘째 통로 금지) — 말하기 화면 마운트가
              곧 재전송이라, 이 버튼은 그 길을 이어줄 뿐이다. */}
          <Pressable onPress={돌아가기} accessibilityRole="button" hitSlop={6}
            style={({ pressed }) => [s.줄버튼, pressed && { opacity: 눌림감.글 }]}>
            <Text style={s.줄버튼글}>말하기 열어서 지금 보내기</Text>
          </Pressable>
          <Pressable onPress={() => set확인(null)} hitSlop={6}
            style={({ pressed }) => [s.줄버튼, pressed && { opacity: 눌림감.글 }]}>
            <Text style={s.줄버튼글}>알겠어요</Text>
          </Pressable>
        </View>
      ) : (
        <View style={s.card}>
          <Text style={s.확인머리}>이 기기에서 나갈까요?</Text>
          <Text style={s.note}>
            다시 들어오려면 학생번호와 비밀번호가 필요해요.
            {'\n'}이 기기에 남은 기록도 함께 지워져요 — 보낸 것은 서버에 그대로 있어요.
          </Text>
          <View style={s.가로}>
            <Pressable onPress={() => set확인(null)} hitSlop={6}
              style={({ pressed }) => [s.줄버튼, pressed && { opacity: 눌림감.글 }]}>
              <Text style={s.줄버튼글}>아니요</Text>
            </Pressable>
            <Pressable onPress={나가기} hitSlop={6}
              style={({ pressed }) => [s.줄버튼, pressed && { opacity: 눌림감.글 }]}>
              <Text style={s.나가기글}>나가기</Text>
            </Pressable>
          </View>
        </View>
      ))}

      <Pressable onPress={돌아가기} style={({ pressed }) => [s.back, pressed && { opacity: 눌림감.글 }]}>
        <Text style={s.backText}>← 말하기로 돌아가기</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 색.바탕 },
  inner: { padding: 24, paddingTop: 76, gap: 16 },
  label: {
    fontFamily: 폰트.모노,
    fontSize: 11,
    letterSpacing: 모노트래킹.라벨,
    color: 색.잉크_태그,
  },
  title: { fontFamily: 폰트.헤드, fontSize: 24, color: 색.잉크 },
  card: {
    backgroundColor: 색.바탕띄움,
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  줄버튼: { paddingVertical: 8 },   // 손가락이 닿는 세로 여유
  줄버튼글: { fontFamily: 폰트.본문, fontSize: 14, color: 색.잉크 },
  확인머리: { fontFamily: 폰트.강조, fontSize: 15, color: 색.잉크 },
  가로: { flexDirection: 'row', justifyContent: 'space-between' },
  /* 🔴 이 화면의 **신호 1점**이다(테마 `신호자리.도착확인`) — 되돌리기 어려운 자리는 여기
     하나뿐이라 성립한다. 면이 아니라 글자에 쓴다(코랄 면 위 글자는 Ink Deep 계열만 — 테마 규칙). */
  나가기글: { fontFamily: 폰트.강조, fontSize: 14, color: 색.신호 },
  // 🚫 알림은 코랄이 아니다 — 1점을 둘로 만들면 R1 이 깨지고, 이 글은 방금 누른 것에 대한
  //    응답이라 이미 시선이 그 자리에 있다.
  알림: { fontFamily: 폰트.강조, fontSize: 13, lineHeight: 19, color: 색.잉크_서브 },
  key: { fontFamily: 폰트.캡션, fontSize: 13, color: 색.잉크_서브 },
  value: { fontFamily: 폰트.강조, fontSize: 13, color: 색.잉크, flexShrink: 1, textAlign: 'right' },
  note: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_메타, lineHeight: 19 },
  back: { paddingVertical: 12 },
  backText: { fontFamily: 폰트.강조, fontSize: 14, color: 색.잉크_서브 },
});
