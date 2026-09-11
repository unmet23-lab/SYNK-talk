import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { 색, 폰트, 모노트래킹, 눌림감 } from './테마';
import { 학생목록받기, 학생기록받기 } from './학생기록API.js';
import { 시간대 } from '../lib/몽골날짜.js';

const 갈래 = [
  ['observations', '교실 관찰', '강사가 남긴 관찰'],
  ['submissions', '학습 제출', '앱에 접수된 학습'],
  ['feedback', '강사 피드백', '강사가 남긴 피드백'],
];

export function 기록시각(값) {
  if (!값 || !Number.isFinite(Date.parse(값))) return '기록 시각 미확인';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 시간대, month: 'numeric', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(값));
}

function 단추({ children, onPress, 선택 = false }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: 선택 }}
    style={({ pressed }) => [s.단추, 선택 && s.선택단추, pressed && { opacity: 눌림감.면 }]}>
    <Text style={[s.단추글, 선택 && s.선택글]}>{children}</Text>
  </Pressable>;
}

/** 조회 결과만 렌더한다. 관찰 입력이나 새 요약·평가를 만들지 않는다. */
export function 학생기록보기({ 기록, 종류 = 'observations', 고르기 = () => {} }) {
  const [, 이름, 출처] = 갈래.find(([키]) => 키 === 종류) || 갈래[0];
  const 묶음 = 기록[종류];
  const 숨김 = 종류 !== 'observations' && 기록.learning_access === 'consent_required';
  return <>
    <View style={s.학생카드}>
      <Text style={s.학생이름}>{기록.student.display_name || 기록.student.student_code || '이름 미등록'}</Text>
      <Text style={s.본문}>{기록.student.class_name || 기록.student.class_key || '반 이름 미등록'}
        {' · '}{기록.student.level_current || '급수 미등록'}</Text>
      <Text style={s.메타}>{기록시각(기록.retrieved_at)} 조회 · 울란바토르 시간</Text>
    </View>
    <View style={s.탭줄}>
      {갈래.map(([키, 글]) => <단추 key={키} 선택={키 === 종류} onPress={() => 고르기(키)}>{글}</단추>)}
    </View>
    <View style={s.묶음머리}>
      <Text accessibilityRole="header" style={s.소제목}>{이름}</Text>
      <Text style={s.메타}>출처: {출처}</Text>
    </View>
    {숨김 ? <View style={s.카드}>
      <Text style={s.본문}>학습 데이터 이용 동의를 확인한 뒤 볼 수 있어요.</Text>
      <Text style={s.보조}>지금은 이 기록을 표시하지 않아요. 기록이 없다는 뜻은 아니에요.</Text>
    </View> : <>
      <Text style={s.보조}>최신순 · 최근 {묶음.items.length}건{묶음.has_more ? ` 표시 (이전 기록 더 있음)` : ''}</Text>
      {!묶음.items.length ? <View style={s.카드}>
        <Text style={s.본문}>아직 {이름} 기록이 없어요.</Text>
        <Text style={s.보조}>지금 조회한 범위에서 확인된 기록이 없어요.</Text>
      </View> : 묶음.items.map((r, i) => <View key={`${r.occurred_at || r.created_at}-${i}`} style={s.카드}>
        <Text style={s.메타}>{기록시각(r.occurred_at || r.created_at)}</Text>
        {종류 === 'observations' && <>
          <Text style={s.작은제목}>{r.area || '영역 미기록'}</Text>
          <Text style={s.본문}>{r.note_text || '관찰 내용 미기록'}</Text>
        </>}
        {종류 === 'submissions' && <>
          <Text style={s.본문}>{r.task_format || '유형 미기록'} 제출</Text>
          <Text style={s.보조}>앱에 접수된 기록이에요. 교정 완료나 학습 성과를 뜻하지는 않아요.</Text>
        </>}
        {종류 === 'feedback' && <>
          <Text style={s.작은제목}>{r.disposition === 'retry' ? '다시 해 보기 안내' : r.disposition === 'confirmed' ? '확인한 피드백' : '피드백'}</Text>
          <Text style={s.본문}>{r.body || '피드백 내용 미기록'}</Text>
          {r.updated_at ? <Text style={s.메타}>{기록시각(r.updated_at)} 수정</Text> : null}
        </>}
      </View>)}
      {묶음.has_more ? <Text style={s.보조}>이 화면은 최근 {기록.limit}건만 보여줘요. 전체 기간의 합계나 평가가 아니에요.</Text> : null}
    </>}
  </>;
}

export default function 학생기록화면({ 토큰, 돌아가기 }) {
  const [명단, set명단] = useState(null);
  const [선택, set선택] = useState(null);
  const [기록, set기록] = useState(null);
  const [종류, set종류] = useState('observations');
  const [오류, set오류] = useState('');
  const [읽는중, set읽는중] = useState(false);
  const [재시도, set재시도] = useState(0);
  const 요청번호 = useRef(0);
  const 스크롤 = useRef(null);

  useEffect(() => {
    const 번호 = ++요청번호.current;
    set명단(null); set선택(null); set기록(null); set오류(''); set읽는중(true);
    학생목록받기(토큰).then((값) => {
      if (번호 === 요청번호.current) set명단(값);
    }).catch((e) => {
      if (번호 === 요청번호.current) set오류(e?.message || '학생 목록을 확인하지 못했어요.');
    }).finally(() => { if (번호 === 요청번호.current) set읽는중(false); });
    return () => { 요청번호.current += 1; };
  }, [토큰, 재시도]);

  async function 학생열기(학생) {
    const 번호 = ++요청번호.current;
    set선택(학생); set기록(null); set종류('observations'); set오류(''); set읽는중(true);
    스크롤.current?.scrollTo({ y: 0, animated: false });
    try {
      const 값 = await 학생기록받기(토큰, 학생.id);
      if (번호 === 요청번호.current) set기록(값);
    } catch (e) {
      if (번호 === 요청번호.current) set오류(e?.message || '학생 기록을 확인하지 못했어요.');
    } finally { if (번호 === 요청번호.current) set읽는중(false); }
  }
  function 명단으로() {
    요청번호.current += 1;
    set선택(null); set기록(null); set오류(''); set읽는중(false);
    스크롤.current?.scrollTo({ y: 0, animated: false });
  }
  const 반들 = [...new Set((명단 || []).map((r) => r.반))];
  return <ScrollView ref={스크롤} style={s.wrap} contentContainerStyle={s.inner}>
    <Text style={s.label}>STUDENT RECORDS</Text>
    <Text accessibilityRole="header" style={s.제목}>학생 기록</Text>
    <Text style={s.보조}>담당 학생의 교실 관찰과 학습 기록을 한곳에서 확인해요.</Text>
    {선택 ? <단추 onPress={명단으로}>학생 목록으로</단추> : null}
    {읽는중 ? <Text accessibilityLiveRegion="polite" style={s.본문}>{선택 ? `${선택.이름}의 기록을 확인하는 중…` : '담당 학생을 확인하는 중…'}</Text> : null}
    {오류 ? <View style={s.카드} accessibilityLiveRegion="polite">
      <Text style={s.소제목}>조회하지 못했어요</Text><Text style={s.본문}>{오류}</Text>
      <단추 onPress={() => 선택 ? 학생열기(선택) : set재시도((n) => n + 1)}>다시 확인하기</단추>
    </View> : null}
    {!선택 && 명단 && !읽는중 && !오류 && (명단.length ? 반들.map((반) => <View style={s.카드} key={반}>
      <Text style={s.소제목}>{반}</Text>
      {명단.filter((r) => r.반 === 반).map((학생) => <Pressable key={학생.id} onPress={() => 학생열기(학생)}
        accessibilityRole="button" accessibilityLabel={`${학생.이름} 기록 보기`}
        style={({ pressed }) => [s.학생줄, pressed && { opacity: 눌림감.면 }]}>
        <Text style={s.본문}>{학생.이름}</Text><Text style={s.메타}>기록 보기</Text>
      </Pressable>)}
    </View>) : <View style={s.카드}>
      <Text style={s.본문}>현재 담당 반에 등록된 학생이 없어요.</Text>
      <Text style={s.보조}>반 배정과 학생 등록을 확인해 주세요.</Text>
    </View>)}
    {기록 && !읽는중 && !오류 ? <학생기록보기 기록={기록} 종류={종류} 고르기={set종류} /> : null}
    <단추 onPress={돌아가기}>설정으로 돌아가기</단추>
  </ScrollView>;
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 색.바탕 },
  inner: { width: '100%', maxWidth: 640, alignSelf: 'center', padding: 24, paddingBottom: 40, gap: 16 },
  label: { fontFamily: 폰트.모노, fontSize: 10, letterSpacing: 모노트래킹.라벨, color: 색.잉크_메타 },
  제목: { fontFamily: 폰트.헤드, fontSize: 28, lineHeight: 38, color: 색.잉크 },
  소제목: { fontFamily: 폰트.강조, fontSize: 18, lineHeight: 26, color: 색.잉크 },
  학생이름: { fontFamily: 폰트.헤드, fontSize: 24, lineHeight: 34, color: 색.잉크 },
  작은제목: { fontFamily: 폰트.강조, fontSize: 14, lineHeight: 22, color: 색.잉크 },
  본문: { fontFamily: 폰트.본문, fontSize: 16, lineHeight: 26, color: 색.잉크, flexShrink: 1 },
  보조: { fontFamily: 폰트.캡션, fontSize: 14, lineHeight: 23, color: 색.잉크_서브 },
  메타: { fontFamily: 폰트.캡션, fontSize: 12, lineHeight: 20, color: 색.잉크_메타 },
  카드: { backgroundColor: 색.바탕띄움, borderRadius: 18, padding: 18, gap: 10 },
  학생카드: { paddingVertical: 10, gap: 8 },
  묶음머리: { gap: 4, marginTop: 4 },
  탭줄: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  단추: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: 색.잉크_희미 },
  단추글: { fontFamily: 폰트.강조, fontSize: 13, lineHeight: 20, color: 색.잉크_서브, textAlign: 'center' },
  선택단추: { backgroundColor: 색.잉크, borderColor: 색.잉크 },
  선택글: { color: 색.바탕 },
  학생줄: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
});
