import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { GestureDetector, GestureHandlerRootView, useNativeGesture } from 'react-native-gesture-handler';
import 운동장 from './액션운동장';
import { use줄임 } from '../lib/모션.js';
import { 색, 폰트 } from './테마';

/** 개발 전용 운동 시험대. 학생·문항·서버·학습 기록을 받거나 만들지 않는다.
 * 20회 자동 입력은 JS 타이머의 발송 시도 수다. 실제 수락·충돌은 각 플랫폼의 운동 루프가 맡는다.
 */
export default function 액션테스트화면({ 돌아가기 }) {
  const { width } = useWindowDimensions();
  const scrollGesture = useNativeGesture({});
  const 줄임 = use줄임(), 운동 = useRef(null), 자동입력수 = useRef(0);
  const 세대 = useRef(1), 살아있음 = useRef(true), 자동중 = useRef(false), 자동회차 = useRef(0);
  const 수동중지 = useRef(false), 전경 = useRef(AppState.currentState === 'active');
  const [seed, setSeed] = useState(1), [paused, setPaused] = useState(false);
  const [active, setActive] = useState(전경.current);
  const [staticTarget, setStaticTarget] = useState(false), [automatic, setAutomatic] = useState(false);
  const [count, setCount] = useState({ inputs: 0, shots: 0, hits: 0, misses: 0 });
  const [metrics, setMetrics] = useState(null), [run, setRun] = useState('대기');
  const 가로 = Math.max(160, Math.min(width - 40, 400));
  useEffect(() => {
    살아있음.current = true;
    const sub = AppState.addEventListener('change', (state) => {
      전경.current = state === 'active'; setActive(전경.current);
    });
    return () => { 살아있음.current = false; 자동중.current = false; sub.remove(); };
  }, []);
  const onShot = useCallback(() => {
    if (!살아있음.current || 세대.current !== seed) return;
    setCount((c) => ({ ...c, shots: c.shots + 1 }));
  }, [seed]);
  const onResult = useCallback((result) => {
    if (!살아있음.current || 세대.current !== seed) return;
    setCount((c) => ({ ...c, hits: c.hits + (result.kind === 'hit' ? 1 : 0),
      misses: c.misses + (result.kind === 'miss' ? 1 : 0) }));
  }, [seed]);
  const onMetrics = useCallback((value) => {
    if (살아있음.current && 세대.current === seed) setMetrics(value);
  }, [seed]);
  useEffect(() => {
    if (!automatic || paused || !active) return;
    const 회차 = 자동회차.current;
    let 취소 = false;
    const timer = setInterval(() => {
      if (취소 || !살아있음.current || 세대.current !== seed || 회차 !== 자동회차.current
          || !자동중.current || 수동중지.current || !전경.current || 자동입력수.current >= 20) return;
      if (!운동.current) return;
      자동입력수.current += 1;
      setCount((c) => ({ ...c, inputs: c.inputs + 1 }));
      운동.current.fire();
      if (자동입력수.current === 20) {
        자동중.current = false; setAutomatic(false); setRun('20회 입력 완료');
      }
    }, 350);
    return () => { 취소 = true; clearInterval(timer); };
  }, [automatic, paused, active, seed]);
  const reset = () => {
    세대.current += 1; 자동회차.current += 1; 자동중.current = false;
    setAutomatic(false); 자동입력수.current = 0; setRun('대기');
    setCount({ inputs: 0, shots: 0, hits: 0, misses: 0 }); setMetrics(null);
    setSeed(세대.current);
  };
  const close = () => {
    살아있음.current = false; 세대.current += 1; 자동중.current = false;
    돌아가기();
  };
  const pause = () => {
    수동중지.current = !수동중지.current; setPaused(수동중지.current);
  };
  const auto = () => {
    자동회차.current += 1;
    if (자동중.current) { 자동중.current = false; setAutomatic(false); setRun('자동 입력 중단'); return; }
    자동입력수.current = 0; 자동중.current = true; setRun('자동 입력 중'); setAutomatic(true);
  };
  return <GestureHandlerRootView style={{ flex: 1 }}>
    <GestureDetector gesture={scrollGesture}>
    <ScrollView contentContainerStyle={s.scroll}>
    <View style={s.body}>
      <View style={s.row}>
        <Pressable onPress={close} accessibilityRole="button" style={s.button}><Text style={s.label}>닫기</Text></Pressable>
        <Text style={s.title}>액션 실행 테스트</Text>
        <Pressable onPress={reset} accessibilityRole="button" style={s.button}><Text style={s.label}>초기화</Text></Pressable>
      </View>
      <Text style={s.note}>개발 전용 · 게임 기획안이 아닙니다.{ '\n' }학습 기록·서버 전송 없음</Text>
      <Text style={s.guide}>끌고 놓기: 방향 입력 · 원: 충돌 표적</Text>
      <운동장 key={seed} ref={운동} width={가로} seed={seed} enabled
        paused={paused} reducedMotion={줄임 || staticTarget} scrollGesture={scrollGesture}
        onShot={onShot} onResult={onResult} onMetrics={onMetrics} />
      <View style={s.row}>
        <Pressable accessibilityRole="button" onPress={pause} style={s.button}>
          <Text style={s.label}>{paused ? '재개' : '일시정지'}</Text>
        </Pressable>
        <Pressable accessibilityRole="switch" aria-checked={줄임 || staticTarget}
          accessibilityState={{ checked: 줄임 || staticTarget, disabled: 줄임 }} disabled={줄임}
          onPress={() => setStaticTarget((v) => !v)} style={s.button}>
          <Text style={s.label}>{줄임 || staticTarget ? '움직임 줄이기 켜짐' : '움직임 줄이기'}</Text>
        </Pressable>
      </View>
      <View style={s.row}>
        <Pressable accessibilityRole="button" disabled={paused || automatic} onPress={() => 운동.current?.fire()} style={s.button}>
          <Text style={s.label}>단일 발사</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={auto} style={s.button}>
          <Text style={s.label}>{automatic ? '자동 입력 중단' : '20회 자동 입력'}</Text>
        </Pressable>
      </View>
      <View style={s.readout}>
        <Text style={s.label}>{paused || !active ? '일시정지' : run} · 자동 입력 {count.inputs} · 수락된 발사 {count.shots} · 충돌 {count.hits} · 이탈 {count.misses}</Text>
        {metrics ? <>
          <Text style={s.mono}>{metrics.renderer}</Text>
          <Text style={s.label}>{metrics.fps} fps · 최근 1초 최대 {metrics.maxMs} ms{ '\n' }20 ms 초과 {metrics.slow} 프레임</Text>
        </> : <Text style={s.label}>프레임 측정 중</Text>}
      </View>
      <Text style={s.note}>자동 입력은 발송 시도 20회이며, 비행 중인 입력은 수락되지 않을 수 있습니다.{ '\n' }웹 수치는 휴대전화 성능을 뜻하지 않습니다.{ '\n' }기기 속도·발열·배터리는 네이티브 빌드에서 별도 측정합니다.</Text>
    </View>
    </ScrollView>
    </GestureDetector>
  </GestureHandlerRootView>;
}

const s = StyleSheet.create({
  scroll: { padding: 20, alignItems: 'center', backgroundColor: 색.바탕, flexGrow: 1 },
  body: { width: '100%', maxWidth: 400, alignItems: 'center' },
  row: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  button: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  title: { color: 색.잉크, fontFamily: 폰트.강조, fontSize: 17 },
  label: { color: 색.잉크, fontFamily: 폰트.본문, fontSize: 13 },
  guide: { color: 색.잉크_서브, fontFamily: 폰트.본문, fontSize: 13, marginTop: 16 },
  note: { color: 색.잉크_메타, fontFamily: 폰트.캡션, fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 12 },
  readout: { width: '100%', backgroundColor: 색.바탕띄움, padding: 16, borderRadius: 12, marginTop: 12, gap: 12 },
  mono: { color: 색.잉크_서브, fontFamily: 폰트.모노, fontSize: 11, lineHeight: 19 },
});
