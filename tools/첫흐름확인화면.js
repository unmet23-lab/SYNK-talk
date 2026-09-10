// 합성 자료만 사용하는 디자인·동작 미리보기. 학생 라우팅과 검수확정 게이트는 유지한다.
import { registerRootComponent } from 'expo';
import { useFonts } from 'expo-font';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import 교수멘탈화면 from '../src/교수멘탈화면.js';
import { 색, 폰트 } from '../src/테마.js';
import { 진행받기 } from '../src/어제의나.js';
import { 펴기 } from '../contents/교수멘탈문항.js';

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
  const [진행, set진행] = useState(null), [세대, set세대] = useState(0), [오류, set오류] = useState(null);
  const [단계, set단계] = useState('대기'), [조작, set조작] = useState(false);
  const [판번호, set판번호] = useState(() => Date.now());
  const 재료 = useMemo(() => ({ prompt_seed: 'g1t01.s0d1', 문항: 펴기('g1t01.s0d1'),
    task_ref: `11111111-2222-4333-8444-${String(판번호).slice(-12).padStart(12, '0')}`, level_snapshot: 3,
    goal_snapshot: '한국어로 내 하루를 말하기', retry_of_event_id: null }), [판번호]);
  const 다시읽기 = useCallback(async () => {
    try { set진행(await 진행받기('synthetic-session')); set오류(null); }
    catch (e) { set오류(String(e.message)); }
  }, []);
  useEffect(() => { 다시읽기(); }, [다시읽기]);
  const 처음부터 = () => { set단계('전략'); set판번호((n) => n + 1); set세대((n) => n + 1); set조작(false); };
  return <View style={s.바탕}>
    {서체준비 && 진행 ? <교수멘탈화면 key={`${단계}-${세대}`} 재료={재료} 토큰="synthetic-session" 학생번호="SYNK-042"
      시작단계={단계} 확인={진행.오늘의확인} 확인뒤={다시읽기} />
      : <View style={s.읽는중}><Text style={s.글}>{서체오류 ? '서체를 불러오지 못했어요.' : 오류 || '화면을 준비하고 있어요.'}</Text></View>}
    <View style={s.미리보기}>
      <Pressable onPress={() => set조작((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: 조작 }} style={s.도구단추}>
        <Text style={s.도구글}>디자인 미리보기 {조작 ? '접기' : '설정'}</Text>
      </Pressable>
      {조작 ? <View style={s.조작}>
        <Text style={s.설명}>합성 화면입니다. 학생의 G1 진입은 아직 미활성입니다.</Text>
        <View style={s.단추줄}>
          <Pressable onPress={처음부터} accessibilityRole="button" style={s.도구단추}><Text style={s.도구글}>처음부터 해보기</Text></Pressable>
          <Pressable onPress={() => { set단계('대기'); set판번호((n) => n + 1); set세대((n) => n + 1); set조작(false); }} accessibilityRole="button" style={s.도구단추}><Text style={s.도구글}>보낸 뒤 보기</Text></Pressable>
          <Pressable onPress={() => set세대((n) => n + 1)} accessibilityRole="button" style={s.도구단추}><Text style={s.도구글}>같은 화면 다시 열기</Text></Pressable>
          <Pressable onPress={다시읽기} accessibilityRole="button" style={s.도구단추}><Text style={s.도구글}>진행 다시 읽기</Text></Pressable>
        </View>
        <View style={s.단추줄}>
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://suno.com/song/eb92cc58-f4d3-4d09-9816-378fac6ab2cf')} style={s.도구단추}><Text style={s.도구글}>새 음악 A · Suno에서 듣기</Text></Pressable>
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://suno.com/song/450a4e1a-42a6-426c-b639-c244f31fabc3')} style={s.도구단추}><Text style={s.도구글}>새 음악 B · Suno에서 듣기</Text></Pressable>
        </View>
        <Text style={s.설명}>BGM이 필요하면 보유 곡에서 고릅니다. 현재 읽기·쓰기 화면은 무음입니다.</Text>
        {오류 ? <Text style={s.설명}>{오류}</Text> : null}
      </View> : null}
    </View>
  </View>;
}

const s = StyleSheet.create({
  바탕: { flex: 1, backgroundColor: 색.바탕 },
  읽는중: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  글: { fontFamily: 폰트.본문, color: 색.잉크_보조, fontSize: 14 },
  미리보기: { borderTopWidth: 1, borderTopColor: 'rgba(251,247,240,0.12)', backgroundColor: 색.바탕, paddingHorizontal: 12, paddingVertical: 4 },
  도구단추: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 9 },
  도구글: { fontFamily: 폰트.캡션, color: 색.잉크_보조, fontSize: 12 },
  조작: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  단추줄: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  설명: { fontFamily: 폰트.캡션, color: 색.잉크_태그, fontSize: 12, lineHeight: 19 },
});
registerRootComponent(확인합성화면);
