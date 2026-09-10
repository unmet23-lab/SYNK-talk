// 합성 자료만 사용하는 디자인·동작 미리보기. 학생 라우팅과 검수확정 게이트는 유지한다.
import { registerRootComponent } from 'expo';
import { useFonts } from 'expo-font';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import 교수멘탈화면 from '../src/교수멘탈화면.js';
import { 색, 폰트 } from '../src/테마.js';
import { 진행받기 } from '../src/어제의나.js';
import { 펴기 } from '../contents/교수멘탈문항.js';
import { 표시배, 혼잣말캐릭터들 } from '../lib/마스코트생명.js';

const 가이드그림 = {
  몽글: require('../assets/마스코트/몽글_본체.webp'),
  까몽: require('../assets/마스코트/까몽_본체.webp'),
  마린: require('../assets/마스코트/마린_본체.webp'),
};

export function 미리보기초기(판번호) {
  return { 가이드: null, 단계: '전략', 판번호, 세대: 0 };
}

// 가이드 변경은 새 시험 과제, 재진입은 같은 과제다. 실제 제출·복원 경계를 섞지 않는다.
export function 미리보기전환(현재, 동작) {
  if (동작.종류 === '가이드') {
    if (!혼잣말캐릭터들.includes(동작.가이드) || 동작.가이드 === 현재.가이드) return 현재;
    return { ...현재, 가이드: 동작.가이드, 단계: '전략', 판번호: 현재.판번호 + 1, 세대: 현재.세대 + 1 };
  }
  if (!현재.가이드) return 현재;
  if (동작.종류 === '다시열기') return { ...현재, 세대: 현재.세대 + 1 };
  if (동작.종류 === '처음' || 동작.종류 === '보낸뒤') {
    return { ...현재, 단계: 동작.종류 === '처음' ? '전략' : '대기', 판번호: 현재.판번호 + 1, 세대: 현재.세대 + 1 };
  }
  return 현재;
}

function 가이드선택({ 값, 고르기, 작게 = false }) {
  const 단추들 = useRef({});
  useEffect(() => { if (값) 단추들.current[값]?.focus?.(); }, [값]);
  const 키로고르기 = (e, 이름) => {
    const key = e.nativeEvent?.key || e.key;
    const index = 혼잣말캐릭터들.indexOf(이름), count = 혼잣말캐릭터들.length;
    let next;
    if (key === 'ArrowRight' || key === 'ArrowDown') next = (index + 1) % count;
    else if (key === 'ArrowLeft' || key === 'ArrowUp') next = (index + count - 1) % count;
    else if (key === 'Home') next = 0;
    else if (key === 'End') next = count - 1;
    else return;
    e.preventDefault?.();
    고르기(혼잣말캐릭터들[next]);
  };
  return <View style={[s.가이드선택, 작게 && s.가이드선택_작게]} accessibilityRole="radiogroup" accessibilityLabel="함께할 가이드">
    {혼잣말캐릭터들.map((이름) => <Pressable key={이름} onPress={() => 고르기(이름)} accessibilityRole="radio"
      ref={(node) => { 단추들.current[이름] = node; }} onKeyDown={(e) => 키로고르기(e, 이름)}
      tabIndex={이름 === (값 || 혼잣말캐릭터들[0]) ? 0 : -1}
      accessibilityLabel={이름} accessibilityState={{ checked: 값 === 이름 }} aria-checked={값 === 이름}
      style={({ pressed, focused }) => [s.가이드단추, 작게 && s.가이드단추_작게,
        값 === 이름 && s.가이드단추_선택, focused && s.가이드단추_초점, pressed && s.가이드단추_눌림]}>
      <View style={작게 ? s.가이드그림틀_작게 : s.가이드그림틀}>
        <Image source={가이드그림[이름]} accessible={false} resizeMode="contain"
          style={[작게 ? s.가이드그림_작게 : s.가이드그림, { transform: [{ scale: 표시배(이름) }] }]} />
      </View>
      <Text style={[s.가이드이름, 값 === 이름 && s.가이드이름_선택]}>{이름}</Text>
      {값 === 이름 ? <Text style={s.고름표시}>선택</Text> : null}
    </Pressable>)}
  </View>;
}

function 확인합성화면() {
  // 제품 App.js와 같은 실제 폰트 파일. 별도 진입에서도 폰트 로딩을 생략하지 않는다.
  const [서체준비, 서체오류] = useFonts({
    'SUIT-Regular': require('../assets/fonts/SUIT-Regular.ttf'),
    'SUIT-Medium': require('../assets/fonts/SUIT-Medium.ttf'),
    'SUIT-SemiBold': require('../assets/fonts/SUIT-SemiBold.ttf'),
    'SUIT-ExtraBold': require('../assets/fonts/SUIT-ExtraBold.ttf'),
    'DMMono-Medium': require('../assets/fonts/DMMono-Medium.ttf'),
    'InterTight-Regular': require('../assets/fonts/InterTight-Regular.ttf'),
    'InterTight-Medium': require('../assets/fonts/InterTight-Medium.ttf'),
    'InterTight-SemiBold': require('../assets/fonts/InterTight-SemiBold.ttf'),
  });
  const [진행, set진행] = useState(null), [오류, set오류] = useState(null);
  const [조작, set조작] = useState(false);
  const [{ 가이드, 단계, 판번호, 세대 }, 전환] = useReducer(미리보기전환, null, () => 미리보기초기(Date.now()));
  const 재료 = useMemo(() => ({ prompt_seed: 'g1t01.s0d1', 문항: 펴기('g1t01.s0d1'),
    task_ref: `11111111-2222-4333-8444-${String(판번호).slice(-12).padStart(12, '0')}`, level_snapshot: 3,
    goal_snapshot: '한국어로 내 하루를 말하기', retry_of_event_id: null }), [판번호]);
  const 다시읽기 = useCallback(async () => {
    try { set진행(await 진행받기('synthetic-session')); set오류(null); }
    catch (e) { set오류(String(e.message)); }
  }, []);
  useEffect(() => { 다시읽기(); }, [다시읽기]);
  const 가이드고르기 = (이름) => { 전환({ 종류: '가이드', 가이드: 이름 }); set조작(false); };
  const 처음부터 = () => { 전환({ 종류: '처음' }); set조작(false); };
  return <View style={s.바탕}>
    {서체준비 && 가이드 ? <View style={s.가이드띠}>
      <Text style={s.가이드띠제목}>함께할 가이드</Text>
      <가이드선택 값={가이드} 고르기={가이드고르기} 작게 />
    </View> : null}
    {서체준비 && 진행 ? 가이드 ? <교수멘탈화면 key={`${가이드}-${단계}-${세대}`} 재료={재료} 토큰="synthetic-session" 학생번호="SYNK-042"
      가이드={가이드} 시작단계={단계} 확인={진행.오늘의확인} 확인뒤={다시읽기} />
      : <View style={s.선택대기}>
        <Text style={s.선택제목}>누구와 함께 편지를 써볼까요?</Text>
        <Text style={s.선택설명}>함께할 친구를 고르면 편지 작업실이 열려요.</Text>
        <가이드선택 값={null} 고르기={가이드고르기} />
      </View>
      : <View style={s.읽는중}><Text style={s.글}>{서체오류 ? '서체를 불러오지 못했어요.' : 오류 || '화면을 준비하고 있어요.'}</Text></View>}
    {가이드 ? <View style={s.미리보기}>
      <Pressable onPress={() => set조작((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: 조작 }} style={s.도구단추}>
        <Text style={s.도구글}>디자인 미리보기 {조작 ? '접기' : '설정'}</Text>
      </Pressable>
      {조작 ? <View style={s.조작}>
        <Text style={s.설명}>합성 화면입니다. 학생의 G1 진입은 아직 미활성입니다.</Text>
        <View style={s.단추줄}>
          <Pressable onPress={처음부터} accessibilityRole="button" style={s.도구단추}><Text style={s.도구글}>처음부터 해보기</Text></Pressable>
          <Pressable onPress={() => { 전환({ 종류: '보낸뒤' }); set조작(false); }} accessibilityRole="button" style={s.도구단추}><Text style={s.도구글}>보낸 뒤 보기</Text></Pressable>
          <Pressable onPress={() => 전환({ 종류: '다시열기' })} accessibilityRole="button" style={s.도구단추}><Text style={s.도구글}>같은 화면 다시 열기</Text></Pressable>
          <Pressable onPress={다시읽기} accessibilityRole="button" style={s.도구단추}><Text style={s.도구글}>진행 다시 읽기</Text></Pressable>
        </View>
        <View style={s.단추줄}>
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://suno.com/song/eb92cc58-f4d3-4d09-9816-378fac6ab2cf')} style={s.도구단추}><Text style={s.도구글}>새 음악 A · Suno에서 듣기</Text></Pressable>
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://suno.com/song/450a4e1a-42a6-426c-b639-c244f31fabc3')} style={s.도구단추}><Text style={s.도구글}>새 음악 B · Suno에서 듣기</Text></Pressable>
        </View>
        <Text style={s.설명}>BGM이 필요하면 보유 곡에서 고릅니다. 현재 읽기·쓰기 화면은 무음입니다.</Text>
        {오류 ? <Text style={s.설명}>{오류}</Text> : null}
      </View> : null}
    </View> : null}
  </View>;
}

const s = StyleSheet.create({
  바탕: { flex: 1, backgroundColor: 색.바탕 },
  읽는중: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  글: { fontFamily: 폰트.본문, color: 색.잉크_보조, fontSize: 14 },
  선택대기: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  선택제목: { fontFamily: 폰트.헤드, color: 색.잉크, fontSize: 24, lineHeight: 34, textAlign: 'center' },
  선택설명: { fontFamily: 폰트.본문, color: 색.잉크_보조, fontSize: 14, lineHeight: 23, textAlign: 'center', marginBottom: 12 },
  가이드띠: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20,
    paddingHorizontal: 20, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 색.잉크_희미 },
  가이드띠제목: { fontFamily: 폰트.캡션, color: 색.잉크_서브, fontSize: 12 },
  가이드선택: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 12 },
  가이드선택_작게: { gap: 8 },
  가이드단추: { minWidth: 112, minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 12, borderRadius: 18, backgroundColor: 색.바탕띄움, borderWidth: 1, borderColor: 색.잉크_희미 },
  가이드단추_작게: { minWidth: 106, minHeight: 44, flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, gap: 8 },
  가이드단추_선택: { borderColor: 색.실땀 },
  가이드단추_초점: { borderColor: 색.잉크 },
  가이드단추_눌림: { opacity: 0.78 },
  가이드그림틀: { width: 64, height: 58, alignItems: 'center', justifyContent: 'center' },
  가이드그림틀_작게: { width: 28, height: 30, alignItems: 'center', justifyContent: 'center' },
  가이드그림: { width: 56, height: 56 },
  가이드그림_작게: { width: 28, height: 28 },
  가이드이름: { fontFamily: 폰트.강조, color: 색.잉크_보조, fontSize: 14 },
  가이드이름_선택: { color: 색.잉크 },
  고름표시: { fontFamily: 폰트.캡션, color: 색.실땀, fontSize: 10 },
  미리보기: { borderTopWidth: 1, borderTopColor: 'rgba(251,247,240,0.12)', backgroundColor: 색.바탕, paddingHorizontal: 12, paddingVertical: 4 },
  도구단추: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 9 },
  도구글: { fontFamily: 폰트.캡션, color: 색.잉크_보조, fontSize: 12 },
  조작: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  단추줄: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  설명: { fontFamily: 폰트.캡션, color: 색.잉크_태그, fontSize: 12, lineHeight: 19 },
});
registerRootComponent(확인합성화면);
