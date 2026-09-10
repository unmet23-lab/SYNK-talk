// 첫흐름미리보기 전용 진입점. 제품 라우팅/검수확정 게이트를 변경하지 않는다.
import { registerRootComponent } from 'expo';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import 교수멘탈화면 from '../src/교수멘탈화면.js';
import { 진행받기 } from '../src/어제의나.js';
import { 펴기 } from '../contents/교수멘탈문항.js';

const 재료 = { prompt_seed: 'g1t01.s0d1', 문항: 펴기('g1t01.s0d1'),
  task_ref: '11111111-2222-4333-8444-555555555555', level_snapshot: 3,
  goal_snapshot: '한국어로 내 하루를 말하기', retry_of_event_id: null };

function 확인합성화면() {
  const [진행, set진행] = useState(null), [세대, set세대] = useState(0), [오류, set오류] = useState(null);
  // App.견줌읽기와 같은 API 어댑터·상태 갱신. 실제 확인 핸들러가 큐를 통해 이 콜백을 부른다.
  const 다시읽기 = useCallback(async () => {
    try { set진행(await 진행받기('synthetic-session')); set오류(null); }
    catch (e) { set오류(String(e.message)); }
  }, []);
  useEffect(() => { 다시읽기(); }, [다시읽기]);
  return <View style={{ flex: 1 }}>
    <View style={{ padding: 12, backgroundColor: '#FBF7F0' }}>
      <Text>합성 컴포넌트 확인 · 실제 G1 학생 경로는 검수확정=false로 미활성</Text>
      <Text>서버 카드: {진행?.오늘의확인 ? `${진행.오늘의확인.trait_axis}:${진행.오늘의확인.shown_key}` : '없음'}</Text>
      {오류 ? <Text>{오류}</Text> : null}
      <Pressable onPress={() => set세대((n) => n + 1)}><Text>같은 화면 다시 열기</Text></Pressable>
      <Pressable onPress={다시읽기}><Text>진행 다시 읽기</Text></Pressable>
    </View>
    {진행 ? <교수멘탈화면 key={세대} 재료={재료} 토큰="synthetic-session" 학생번호="SYNK-042"
      시작단계="대기" 확인={진행.오늘의확인} 확인뒤={다시읽기} /> : <Text>합성 진행 읽는 중</Text>}
  </View>;
}
registerRootComponent(확인합성화면);
