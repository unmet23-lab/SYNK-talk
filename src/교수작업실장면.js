import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { 색, 폰트 } from './테마';
import { 살아있는교수연구실 } from './살아있는교수연구실';
import { 살아있는가이드 } from './살아있는가이드';
import { 마린전략장면 } from './마린전략장면';
import { use줄임 } from '../lib/모션';
import { 장면만들기, 책갈피말 } from '../contents/교수멘탈장면';

const 소품그림 = Object.freeze({
  'g1-사과-간결': require('../assets/교수작업실/envelope.webp'),
  'g1-사과-솔직': require('../assets/교수작업실/notebook-cutout.webp'),
  'g1-사과-대안': require('../assets/교수작업실/calendar.webp'),
});

// 리허설은 화면 안의 연습이다. 전략 사건은 확정 버튼을 눌렀을 때만 부모가 담는다.
export function 교수작업실장면({ 재료, 가이드, 보기, onConfirm }) {
  const { width } = useWindowDimensions();
  const 넓다 = width >= 760;
  const 사진너비 = Math.max(0, Math.min(width - 48, 1072) - (넓다 ? 24 : 0)) * (넓다 ? .56 : 1);
  const 줄임 = use줄임();
  const [고른것, set고른것] = useState(null);
  const 확정중 = useRef(false);
  const 예문자리 = useRef(null);
  const 장면 = useMemo(() => 장면만들기({ ...재료, 캐릭터: 가이드 }), [재료, 가이드]);
  const 선택 = 장면.전략.find(s => s.option_id === 고른것);
  const 선택라벨 = 보기?.options_shown.find(s => s.option_id === 고른것)?.label;
  useEffect(() => {
    if (고른것 && Platform.OS === 'web') 예문자리.current?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
  }, [고른것]);

  return <View style={s.전체}>
    <View style={s.도입머리}>
      <Text style={s.작은글}>오늘의 이야기 · 교수님 멘탈 구하기</Text>
      <Text accessibilityRole="header" style={[s.제목, 넓다 && s.큰제목]}>아직 도착하지 않은 편지</Text>
      <Text style={s.부제}>상황을 읽고, 말하는 방법을 골라 교수님께 편지를 써 보세요.</Text>
    </View>

    <교수생각장면 장면={장면} 넓다={넓다} 사진너비={사진너비} />
    <내상황장면 장면={장면} 좁다={width < 570} />

    <View style={s.고르기머리}>
      <Text accessibilityRole="header" style={s.중제목}>어떻게 부탁할까요?</Text>
      <Text style={s.부제}>소품을 고르면 말하는 방법과 짧은 예문이 보여요. 다른 방법도 살펴볼 수 있어요.</Text>
    </View>
    <View style={[s.책상, width < 570 && s.책상_좁음]}>
      {(보기?.options_shown || []).map(o => {
        const 정보 = 장면.전략.find(v => v.option_id === o.option_id);
        const 고름 = 고른것 === o.option_id;
        return <Pressable key={o.option_id} accessibilityRole="button" accessibilityLabel={`${정보?.소품 || '소품'}: ${o.label}`}
          accessibilityState={{ selected: 고름 }} aria-pressed={고름} onPress={() => set고른것(o.option_id)}
          style={({ hovered, focused, pressed }) => [s.소품자리, width < 570 && s.소품자리_좁음, 고름 && s.소품자리_고름,
            !줄임 && s.전환, hovered && !줄임 && s.들기, focused && s.초점, pressed && { opacity: .8, transform: [{ scale: 줄임 ? 1 : .96 }] }]}>
          <Image source={소품그림[o.option_id]} resizeMode="contain" style={[s.소품, width < 570 && s.소품_좁음]} accessibilityElementsHidden />
          <View style={s.소품설명}>
            <Text style={s.소품이름}>{정보?.소품 || '편지 소품'}</Text>
            <Text style={s.전략말}>{o.label}</Text>
            <Text style={s.작은글}>{정보?.설명}</Text>
            <Text style={s.추천}>{고름 ? '지금 살펴보는 방법' : 보기.recommended_option === o.option_id ? '오늘의 추천' : '눌러서 살펴보기'}</Text>
          </View>
        </Pressable>;
      })}
    </View>

    <전략미리보기 containerRef={예문자리} 선택={선택} 제목={선택라벨} 가이드={장면.친구?.이름} onConfirm={() => {
      if (확정중.current) return;
      확정중.current = true;
      onConfirm(고른것);
    }} />
  </View>;
}

export function 교수생각장면({ 장면, 넓다 = false, 사진너비 = 600 }) {
  return <View style={[s.무대, 넓다 && s.무대_넓음]}>
    <View style={[s.사진영역, { width: 사진너비 }]}>
      <살아있는교수연구실 width={사진너비} />
      <Text style={s.장면자막}>교수님의 연구실</Text>
    </View>
    <View style={[s.생각풍선, 넓다 && s.생각풍선_옆]}>
      <View aria-hidden style={[s.생각점, 넓다 ? s.생각점_옆 : s.생각점_위]} />
      <View aria-hidden style={[s.생각점_작게, 넓다 ? s.작은점_옆 : s.작은점_위]} />
      <Text style={s.화자}>교수님의 생각</Text>
      {장면.교수.대사.map((말, i) => <Text key={i} style={i === 0 ? s.교수대사 : s.교수덧말}>{말}</Text>)}
    </View>
  </View>;
}

export function 내상황장면({ 장면, 좁다 = false }) {
  const 이름 = 장면.친구?.이름;
  return <View style={s.학생장면}>
    <Text accessibilityRole="header" style={s.중제목}>지금 내 상황</Text>
    <View style={[s.내상황본문, 좁다 && s.내상황본문_좁음]}>
      {이름 ? <View style={[s.안내캐릭터, 좁다 && s.안내캐릭터_좁음]}>
        <살아있는가이드 이름={이름} 표정={장면.친구?.표정} size={좁다 ? 128 : 176} />
        <Text style={s.화자}>내 친구 · {이름}</Text>
      </View> : null}
      <View style={s.내상황정보}>
        <Text style={s.상황글}>{장면.원문.질문}</Text>
        <View style={s.단서줄}>
          {장면.단서.map(단서 => <View key={단서.이름} style={s.단서}>
            <Text style={s.작은글}>{단서.이름}</Text><Text style={s.단서값}>{단서.값}</Text>
          </View>)}
        </View>
        <View style={s.부탁영역}><Text style={s.화자}>오늘 쓸 편지</Text><Text style={s.지시문}>{장면.원문.지시문}</Text></View>
      </View>
    </View>
    {장면.친구 ? <View style={s.친구한마디}>
      <Text style={s.화자}>{`${이름}의 한마디`}</Text>
      <Text style={s.친구대사}>{장면.친구.대사.join(' ')}</Text>
    </View> : null}
  </View>;
}

export function 전략미리보기({ 선택, 제목, 가이드, onConfirm, containerRef }) {
  return <View ref={containerRef} style={s.리허설} accessibilityLiveRegion="polite">
    {선택 ? <>
      <Text style={s.작은글}>내가 고른 방법</Text>
      <Text style={s.중제목}>{제목}</Text>
      {가이드 === '마린'
        ? <마린전략장면 optionId={선택.option_id} 말={선택.미리보기} />
        : <친구말 이름={가이드} 말={선택.미리보기} 작게 />}
      <View style={s.예문종이}>
        <Text style={s.화자}>말투 예시 · 내가 교수님께 쓰는 말</Text>
        <Text selectable style={s.예문글}>{선택.예문}</Text>
        <Text style={s.작은글}>말투를 참고하고, 내 상황에 맞게 직접 써 보세요.</Text>
      </View>
      <Text style={s.지시문}>{선택.쓰기힌트}</Text>
      <Pressable accessibilityRole="button" onPress={onConfirm}
        style={({ focused, pressed }) => [s.시작버튼, focused && s.초점, pressed && s.눌림]}>
        <Text style={s.시작글}>이 방법으로 편지 쓰기</Text><Text style={s.시작화살}>→</Text>
      </Pressable>
      <Text style={s.작은글}>다음 화면에서 직접 쓰고, 다 쓴 뒤에 보내요.</Text>
    </> : <View style={s.빈리허설}>
      <Image source={소품그림['g1-사과-간결']} style={s.단서그림} resizeMode="contain" accessible={false} aria-hidden />
      <Text style={s.부제}>위에서 소품을 하나 고르면, 예문을 보고 편지 쓰기를 시작할 수 있어요.</Text>
    </View>}
  </View>;
}

export function 친구말({ 이름, 말, 작게 = false }) {
  return <View style={[s.친구줄, 작게 && s.친구줄_작게]}>
    {이름 ? <살아있는가이드 이름={이름} size={작게 ? 78 : 118} /> : null}
    <View style={s.친구풍선}>
      <Text style={s.화자}>{이름 || '편지 길잡이'}</Text>
      <Text style={s.친구대사}>{말}</Text>
    </View>
  </View>;
}

const 책갈피 = Object.freeze({
  인사: { 그림: 'g1-사과-간결' },
  사과: { 그림: 'g1-사과-간결' },
  이유: { 그림: 'g1-사과-솔직' },
  요청: { 그림: 'g1-사과-대안' },
  맺음: { 그림: 'g1-사과-간결' },
});

// 책갈피는 쓰는 순서를 안내한다. 모범 문형이나 자동 입력은 제공하지 않는다.
export function 편지책갈피({ 가이드, 칸이름들 }) {
  const [현재, set현재] = useState(칸이름들[0]);
  return <View style={s.책갈피영역}>
    <Text style={s.작은글}>막힐 땐, 그림 책갈피를 펼쳐요</Text>
    <View style={s.책갈피줄}>
      {칸이름들.map(이름 => <Pressable key={이름} accessibilityRole="button" accessibilityState={{ selected: 현재 === 이름 }} aria-pressed={현재 === 이름}
        onPress={() => set현재(이름)} style={({ focused, pressed }) => [s.책갈피, 현재 === 이름 && s.책갈피_고름, focused && s.초점, pressed && s.눌림]}>
        <Image source={소품그림[책갈피[이름]?.그림 || 'g1-사과-간결']} style={s.책갈피그림} resizeMode="contain" accessibilityElementsHidden />
        <Text style={s.책갈피이름}>{이름}</Text>
      </Pressable>)}
    </View>
    <View accessibilityLiveRegion="polite"><친구말 이름={가이드} 말={책갈피말(가이드, 현재)} 작게 /></View>
  </View>;
}

const 어절 = Platform.select({ web: { wordBreak: 'keep-all', overflowWrap: 'anywhere' }, default: {} });
const s = StyleSheet.create({
  전체: { gap: 22 }, 도입머리: { gap: 8, paddingTop: 10, paddingBottom: 4 },
  작은글: { fontFamily: 폰트.캡션, fontSize: 12, lineHeight: 20, color: 색.잉크_태그, ...어절 },
  제목: { fontFamily: 폰트.강조, fontSize: 29, lineHeight: 39, letterSpacing: -.9, color: 색.잉크, ...어절 },
  큰제목: { fontSize: 34, lineHeight: 44, letterSpacing: -1.2 },
  부제: { fontFamily: 폰트.캡션, fontSize: 14, lineHeight: 23, color: 색.잉크_보조, ...어절 },
  무대: { gap: 24, alignItems: 'center' }, 무대_넓음: { flexDirection: 'row' },
  사진영역: { borderRadius: 20, overflow: 'hidden', backgroundColor: 색.바탕띄움 },
  장면자막: { paddingVertical: 9, paddingHorizontal: 18, fontFamily: 폰트.캡션, fontSize: 12, lineHeight: 19, color: 색.잉크_보조 },
  생각풍선: { alignSelf: 'stretch', borderRadius: 26, backgroundColor: 색.바탕띄움, padding: 24, gap: 12 },
  생각풍선_옆: { flex: 1, minWidth: 0, alignSelf: 'center' },
  생각점: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: 색.바탕띄움 },
  생각점_작게: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: 색.바탕띄움 },
  생각점_옆: { left: -16, top: '56%' }, 작은점_옆: { left: -29, top: '64%' },
  생각점_위: { top: -13, left: '51%' }, 작은점_위: { top: -26, left: '47%' },
  화자: { fontFamily: 폰트.강조, fontSize: 12, lineHeight: 19, color: 색.실땀 },
  교수대사: { fontFamily: 폰트.본문, fontSize: 20, lineHeight: 29, letterSpacing: -.4, color: 색.잉크, ...어절 },
  교수덧말: { fontFamily: 폰트.캡션, fontSize: 14, lineHeight: 24, color: 색.잉크_보조, ...어절 },
  학생장면: { gap: 18, paddingTop: 24, borderTopWidth: 1, borderColor: 색.잉크_희미 },
  내상황본문: { flexDirection: 'row', gap: 24 }, 내상황본문_좁음: { flexDirection: 'column', gap: 14 },
  안내캐릭터: { width: 176, flexShrink: 0, alignItems: 'center', justifyContent: 'center', gap: 8 },
  안내캐릭터_좁음: { width: 'auto', flexDirection: 'row', justifyContent: 'flex-start', gap: 12 },
  내상황정보: { flex: 1, minWidth: 0, gap: 14 },
  상황글: { fontFamily: 폰트.본문, fontSize: 18, lineHeight: 29, color: 색.잉크, ...어절 },
  부탁영역: { gap: 6 }, 친구한마디: { gap: 5, paddingLeft: 16, borderLeftWidth: 2, borderColor: 색.실땀 },
  친구줄: { flexDirection: 'row', gap: 18, alignItems: 'center', paddingHorizontal: 12 },
  친구줄_작게: { paddingHorizontal: 0, gap: 12 },
  친구풍선: { flex: 1, gap: 6, paddingVertical: 8 },
  친구대사: { fontFamily: 폰트.본문, fontSize: 16, lineHeight: 26, color: 색.잉크, ...어절 },
  단서줄: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  단서: { minWidth: 110, flexShrink: 1, gap: 2 },
  단서그림: { width: 48, height: 48 },
  단서값: { fontFamily: 폰트.본문, fontSize: 14, lineHeight: 22, color: 색.잉크, ...어절 },
  지시문: { fontFamily: 폰트.캡션, fontSize: 14, lineHeight: 24, color: 색.잉크_보조, ...어절 },
  고르기머리: { gap: 7, paddingTop: 10 },
  중제목: { fontFamily: 폰트.강조, fontSize: 22, lineHeight: 31, color: 색.잉크, letterSpacing: -.5, ...어절 },
  책상: { flexDirection: 'row', gap: 16 }, 책상_좁음: { flexDirection: 'column', gap: 12 },
  소품자리: { flex: 1, borderRadius: 20, borderWidth: 1, borderColor: 색.잉크_희미, padding: 18, alignItems: 'center', gap: 12 },
  소품자리_좁음: { flexDirection: 'row', gap: 18 }, 소품자리_고름: { borderColor: 색.실땀, backgroundColor: 색.바탕띄움 },
  소품: { width: '100%', height: 122 }, 소품_좁음: { width: 90, height: 90 },
  소품설명: { gap: 6, alignSelf: 'stretch', flex: 1 },
  소품이름: { fontFamily: 폰트.강조, fontSize: 17, lineHeight: 25, color: 색.잉크, ...어절 },
  전략말: { fontFamily: 폰트.본문, fontSize: 14, lineHeight: 24, color: 색.잉크_보조, ...어절 },
  추천: { fontFamily: 폰트.캡션, fontSize: 11, lineHeight: 19, color: 색.실땀 },
  전환: Platform.select({ web: { transitionProperty: 'transform, opacity', transitionDuration: '160ms', transitionTimingFunction: 'ease-out' }, default: {} }),
  들기: { transform: [{ translateY: -4 }] },
  초점: Platform.select({ web: { outlineStyle: 'solid', outlineWidth: 2, outlineColor: 색.실땀, outlineOffset: 4 }, default: {} }),
  눌림: { opacity: .8 }, 리허설: { backgroundColor: 색.바탕띄움, borderRadius: 22, padding: 24, gap: 14 },
  예문종이: { backgroundColor: 색.바탕, borderRadius: 14, padding: 20, gap: 10 },
  예문글: { fontFamily: 폰트.본문, fontSize: 19, lineHeight: 30, color: 색.잉크, ...어절 },
  빈리허설: { flexDirection: 'row', gap: 16, alignItems: 'center', minHeight: 62, flexWrap: 'wrap' },
  시작버튼: { minHeight: 54, paddingHorizontal: 22, paddingVertical: 14, borderRadius: 13, backgroundColor: 색.잉크, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  시작글: { fontFamily: 폰트.강조, fontSize: 16, lineHeight: 24, color: 색.바탕 }, 시작화살: { fontSize: 23, color: 색.바탕 },
  책갈피영역: { gap: 14 }, 책갈피줄: { flexDirection: 'row', gap: 7 },
  책갈피: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: 색.잉크_희미, gap: 5 },
  책갈피_고름: { backgroundColor: 색.바탕띄움, borderColor: 색.실땀 }, 책갈피그림: { width: 42, height: 42 },
  책갈피이름: { fontFamily: 폰트.캡션, fontSize: 12, lineHeight: 20, color: 색.잉크 },
});
