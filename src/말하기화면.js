import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  createAudioPlayer,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as Speech from 'expo-speech';
import { 색, 폰트, 모노트래킹 } from './테마';
import { 머뭇거림추적, 발화문턱_DB, 다음호흡 } from '../lib/세호흡.js';
import { 마이크준비, 마이크끄기 } from '../lib/마이크권한.js';
import { 항목추가, 다음시도번호, 학습출석 } from '../lib/제출로그.js';
import { 로그읽기, 로그쓰기, 음성보관, 지속저장 } from './저장.js';
import { 급수편지 } from '../contents/첫편지.js';

/**
 * 「말하기」 — 학생 앱의 유일한 동사. 정본 = docs/말하기_설계.md
 * 세 호흡: ①듣기 → ②따라 말하기 → ③답하기. 90초 한 흐름, 화면 전환 없음.
 *
 * 디자인: 브랜드 정본 그대로 — 바탕 Navy 2 · 잉크 Cream · 신호 Coral 1점.
 * **코랄 = 녹음 버튼뿐이다.** R1(신호 1점·5% 미만)이 이 화면에서는 규칙이 아니라 구조다.
 */

const 호흡라벨 = { 듣기: '듣기', 따라: '따라 말하기', 답하기: '답하기' };
const 호흡번호 = { 듣기: '01', 따라: '02', 답하기: '03' };

function 오늘() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function 초표시(ms) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function 말하기화면({ 급수 = 0 }) {
  const 편지 = useMemo(() => 급수편지(급수), [급수]);
  const date = useMemo(오늘, []);

  const [호흡, set호흡] = useState('듣기');
  const [로그, set로그] = useState([]);
  const [오류, set오류] = useState(null); // 「모름」을 「정상」으로 바꾸지 않는다 — 실패는 글자로 보인다
  const [저장경고, set저장경고] = useState(!지속저장());

  useEffect(() => {
    (async () => {
      try {
        const r = await 로그읽기();
        set로그(r.로그);
        if (r.깨진줄 > 0) set오류(`저장된 기록 중 ${r.깨진줄}줄을 읽지 못했다`);
        if (학습출석(r.로그, date)) set호흡('완료');
      } catch (e) {
        set오류(String(e.message || e));
      }
      // 마이크 권한은 여기서 묻지 않는다 — 녹음 버튼을 누를 때 묻는다(lib/마이크권한.js).
      // 여기서 켜는 건 재생뿐이다: 무음 스위치가 켜진 폰에서도 ①듣기가 들려야 한다.
      try {
        await setAudioModeAsync({ playsInSilentMode: true });
      } catch (e) {
        set오류('소리를 준비하지 못했어요: ' + String(e.message || e));
      }
    })();
  }, [date]);

  const 기록추가 = async (항목입력) => {
    const { 로그: 새로그 } = 항목추가(로그, 항목입력);
    set로그(새로그);
    try {
      await 로그쓰기(새로그);
    } catch (e) {
      set오류('저장하지 못했어요: ' + String(e.message || e)); // 화면은 진행하되 실패를 숨기지 않는다
    }
    return 새로그;
  };

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
      <머리 호흡={호흡} />
      {저장경고 && (
        <Text style={s.경고}>웹 미리보기 — 기록이 기기에 남지 않아요. 실사용은 앱에서.</Text>
      )}
      {오류 && <Text style={s.오류}>{오류}</Text>}

      {호흡 === '듣기' && <듣기카드 편지={편지} 다음={() => set호흡('따라')} />}

      {호흡 === '따라' && (
        <녹음카드
          key="따라"
          step="따라"
          제시문={편지.핵심문장}
          안내="편지의 이 문장을, 신호가 끝나면 따라 말해요"
          date={date}
          로그={로그}
          기록추가={기록추가}
          완료={() => set호흡(다음호흡('따라'))}
          prompt_id={편지.id}
        />
      )}

      {호흡 === '답하기' && (
        <녹음카드
          key="답하기"
          step="답하기"
          제시문={편지.질문}
          안내="이번엔 내 말로 답해요"
          선택지={편지.선택지}
          텍스트병기
          date={date}
          로그={로그}
          기록추가={기록추가}
          완료={() => set호흡('완료')}
          prompt_id={편지.id}
        />
      )}

      {호흡 === '완료' && <완료카드 로그={로그} date={date} />}
    </ScrollView>
  );
}

/* ── 머리: 진행 표시 — 위계는 밀도로(R2), 점 셋과 라벨 하나 ── */
function 머리({ 호흡 }) {
  const 순서 = ['듣기', '따라', '답하기'];
  const idx = 호흡 === '완료' ? 3 : 순서.indexOf(호흡);
  return (
    <View style={s.머리}>
      <Text style={s.브랜드}>SYNK TALK</Text>
      <Text style={s.제목}>오늘의 말하기</Text>
      <View style={s.진행줄}>
        {순서.map((k, i) => (
          <View key={k} style={s.진행칸}>
            <View style={[s.점, i <= idx - 0 && i < idx ? s.점_지남 : i === idx ? s.점_현재 : null]} />
            <Text style={[s.점라벨, i === idx && s.점라벨_현재]}>{호흡라벨[k]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ── ① 듣기 ── */
function 듣기카드({ 편지, 다음 }) {
  const [읽는중, set읽는중] = useState(false);
  const [들었다, set들었다] = useState(false);

  const 재생 = () => {
    set읽는중(true);
    Speech.stop();
    Speech.speak(편지.본문, {
      language: 'ko-KR',
      rate: 0.92,
      onDone: () => {
        set읽는중(false);
        set들었다(true);
      },
      onError: () => {
        set읽는중(false);
        set들었다(true); // 재생이 안 되는 기기에서도 흐름은 막지 않는다 — 본문이 화면에 있다
      },
    });
  };

  useEffect(() => () => Speech.stop(), []);

  return (
    <View style={s.카드}>
      <Text style={s.카드라벨}>{호흡번호.듣기} · 편지가 왔어요</Text>
      <Text style={s.편지문}>{편지.본문}</Text>
      <Pressable onPress={재생} style={({ pressed }) => [s.보조버튼, pressed && s.눌림]}>
        <Text style={s.보조버튼글}>{읽는중 ? '읽는 중…' : '♪ 들어보기'}</Text>
      </Pressable>
      <Pressable
        onPress={다음}
        style={({ pressed }) => [s.주버튼, !들었다 && s.주버튼_대기, pressed && s.눌림]}
      >
        <Text style={s.주버튼글}>{들었다 ? '다 들었어요' : '듣지 않고 넘어가기'}</Text>
      </Pressable>
    </View>
  );
}

/* ── ②③ 녹음 — 코랄이 사는 유일한 곳 ── */
function 녹음카드({ step, 제시문, 안내, 선택지, 텍스트병기, date, 로그, 기록추가, 완료, prompt_id }) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const rState = useAudioRecorderState(recorder, 100);
  const [단계, set단계] = useState('대기'); // 대기 | 녹음중 | 확인 | 무발화
  const [녹음, set녹음] = useState(null); // { uri, duration_ms, hesitation_ms, spoke }
  const [병기글, set병기글] = useState('');
  const [듣는중, set듣는중] = useState(false);
  const [막힘, set막힘] = useState(null); // 녹음이 시작되지 못한 이유 — 버튼 옆에 글자로 선다
  const 추적 = useRef(null);
  const 플레이어 = useRef(null);

  // 미터링 표본 → 머뭇거림 (설계 §5: 확신도의 대체물)
  useEffect(() => {
    if (단계 === '녹음중' && 추적.current && rState.isRecording) {
      추적.current.표본(rState.durationMillis || 0, rState.metering);
    }
  }, [단계, rState.durationMillis, rState.metering, rState.isRecording]);

  useEffect(
    () => () => {
      if (플레이어.current) {
        플레이어.current.remove();
        플레이어.current = null;
      }
    },
    []
  );

  const 시작 = async () => {
    set막힘(null);
    // 권한은 「지금」 묻는다 — 학생이 무엇을 하려는지 아는 순간에.
    const 준비 = await 마이크준비({
      권한요청: () => AudioModule.requestRecordingPermissionsAsync(),
      오디오모드: setAudioModeAsync,
    });
    if (!준비.ok) {
      set막힘(준비.메시지);
      return;
    }
    try {
      추적.current = 머뭇거림추적();
      await recorder.prepareToRecordAsync();
      recorder.record();
      set단계('녹음중');
    } catch (e) {
      set단계('대기');
      set녹음(null);
      set막힘('녹음을 시작하지 못했어요: ' + String(e.message || e));
    }
  };

  const 끝 = async () => {
    await recorder.stop();
    await 마이크끄기({ 오디오모드: setAudioModeAsync }); // 바로 뒤 「내 목소리 듣기」가 작게 들리지 않도록
    const duration_ms = rState.durationMillis || 0;
    const r = 추적.current ? 추적.current.결과(duration_ms) : { 발화있음: true, 머뭇거림_ms: 0 };
    set녹음({ uri: recorder.uri, duration_ms, hesitation_ms: r.머뭇거림_ms, spoke: r.발화있음 });
    set단계(r.발화있음 ? '확인' : '무발화');
  };

  const 남기기 = async (status) => {
    const attempt = 다음시도번호(로그, date, step);
    let audio = null;
    if (녹음 && 녹음.uri) {
      try {
        audio = await 음성보관(녹음.uri, `${date}-${step}-${attempt}.m4a`);
      } catch (_) {
        audio = null; // 파일 보관 실패 — 로그에는 null 로 정직하게 남는다
      }
    }
    return 기록추가({
      date,
      step,
      status,
      duration_ms: 녹음 ? 녹음.duration_ms : 0,
      hesitation_ms: 녹음 ? 녹음.hesitation_ms : 0,
      spoke: 녹음 ? 녹음.spoke : false,
      threshold_db: 발화문턱_DB,
      text: 텍스트병기 && 병기글.trim() ? 병기글.trim() : null,
      audio,
      prompt_id,
      created_at: new Date().toISOString(),
    });
  };

  const 다시 = async () => {
    await 남기기('retried'); // 이전 시도를 보관하고 나서야 새로 녹음한다 — 지우기가 원천적으로 없다
    set녹음(null);
    set단계('대기');
  };

  const 제출 = async () => {
    await 남기기('submitted');
    완료();
  };

  const 넘어가기 = async () => {
    await 남기기('abandoned'); // 무발화도 데이터다(설계 §3-4)
    완료();
  };

  const 내목소리 = () => {
    if (!녹음 || !녹음.uri) return;
    if (플레이어.current) 플레이어.current.remove();
    플레이어.current = createAudioPlayer({ uri: 녹음.uri });
    set듣는중(true);
    플레이어.current.play();
    setTimeout(() => set듣는중(false), 녹음.duration_ms + 300);
  };

  return (
    <View style={s.카드}>
      <Text style={s.카드라벨}>
        {호흡번호[step]} · {안내}
      </Text>
      <Text style={s.제시문}>{제시문}</Text>

      {선택지 && (
        <View style={s.선택지묶음}>
          {선택지.map((c) => (
            <View key={c} style={s.선택지}>
              <Text style={s.선택지글}>{c}</Text>
            </View>
          ))}
          <Text style={s.선택지힌트}>둘 중 하나를 골라, ○○에 내 이야기를 넣어 말해요</Text>
        </View>
      )}

      {단계 === '대기' && (
        <중앙>
          <녹음버튼 onPress={시작} />
          <Text style={s.녹음안내}>탭하면 녹음이 시작돼요</Text>
          {막힘 && <Text style={s.오류}>{막힘}</Text>}
        </중앙>
      )}

      {단계 === '녹음중' && (
        <중앙>
          <녹음버튼 녹음중 onPress={끝} />
          <Text style={s.타이머}>{초표시(rState.durationMillis || 0)}</Text>
          <Text style={s.녹음안내}>다 말했으면 탭해서 마쳐요</Text>
        </중앙>
      )}

      {단계 === '확인' && 녹음 && (
        <View style={s.확인묶음}>
          <Text style={s.확인글}>
            {초표시(녹음.duration_ms)} 담겼어요
          </Text>
          <Pressable onPress={내목소리} style={({ pressed }) => [s.보조버튼, pressed && s.눌림]}>
            <Text style={s.보조버튼글}>{듣는중 ? '재생 중…' : '내 목소리 듣기'}</Text>
          </Pressable>
          {텍스트병기 && (
            <TextInput
              style={s.병기입력}
              placeholder="말한 문장을 글로도 남기고 싶으면 여기에 (선택)"
              placeholderTextColor={색.잉크_메타}
              value={병기글}
              onChangeText={set병기글}
              multiline
            />
          )}
          <View style={s.가로}>
            <Pressable onPress={다시} style={({ pressed }) => [s.보조버튼, s.늘림, pressed && s.눌림]}>
              <Text style={s.보조버튼글}>다시 말하기</Text>
            </Pressable>
            <Pressable onPress={제출} style={({ pressed }) => [s.주버튼, s.늘림, pressed && s.눌림]}>
              <Text style={s.주버튼글}>보내기</Text>
            </Pressable>
          </View>
        </View>
      )}

      {단계 === '무발화' && (
        <View style={s.확인묶음}>
          <Text style={s.확인글}>목소리가 안 담겼어요</Text>
          <Text style={s.무발화설명}>괜찮아요 — 말이 안 나오는 날도 있어요. 그것도 선생님께 신호가 돼요.</Text>
          <View style={s.가로}>
            <Pressable onPress={다시} style={({ pressed }) => [s.주버튼, s.늘림, pressed && s.눌림]}>
              <Text style={s.주버튼글}>한 번 더 해볼래요</Text>
            </Pressable>
            <Pressable onPress={넘어가기} style={({ pressed }) => [s.보조버튼, s.늘림, pressed && s.눌림]}>
              <Text style={s.보조버튼글}>오늘은 넘어갈래요</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

/* ── 녹음 버튼 — 화면 전체에서 코랄이 사는 유일한 자리 ── */
function 녹음버튼({ 녹음중, onPress }) {
  const 맥박 = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (녹음중) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(맥박, { toValue: 1.35, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(맥박, { toValue: 1, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [녹음중, 맥박]);

  return (
    <View style={s.버튼자리}>
      {녹음중 && (
        <Animated.View style={[s.맥박링, { transform: [{ scale: 맥박 }] }]} />
      )}
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [s.코랄원, pressed && { transform: [{ scale: 0.96 }] }]}
        accessibilityLabel={녹음중 ? '녹음 마치기' : '녹음 시작'}
      >
        {녹음중 ? <View style={s.정지사각} /> : <View style={s.마이크점} />}
      </Pressable>
    </View>
  );
}

function 중앙({ children }) {
  return <View style={s.중앙}>{children}</View>;
}

/* ── 완료 ── */
function 완료카드({ 로그, date }) {
  const 오늘것 = 로그.filter((e) => e.date === date);
  const 시도 = 오늘것.length;
  const 다시한번 = 오늘것.filter((e) => e.status === 'retried').length;
  return (
    <View style={s.카드}>
      <Text style={s.카드라벨}>오늘의 말하기 · 끝</Text>
      <Text style={s.완료제목}>목소리가 도착했어요</Text>
      <Text style={s.완료설명}>
        오늘 {시도}번 말했어요{다시한번 > 0 ? ` — 그중 ${다시한번}번은 스스로 다시 도전했어요. 그게 실력이 느는 순간이에요.` : '.'}
      </Text>
      <Text style={s.완료메타}>내일, 오늘 목소리에 대한 답장이 와요.</Text>
    </View>
  );
}

const 코랄지름 = 84;

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 색.바탕 },
  inner: { padding: 24, paddingTop: 68, paddingBottom: 48, gap: 20 },

  머리: { gap: 6 },
  브랜드: { fontFamily: 폰트.모노, fontSize: 11, letterSpacing: 모노트래킹.라벨, color: 색.잉크_태그 },
  제목: { fontFamily: 폰트.헤드, fontSize: 27, color: 색.잉크 },
  진행줄: { flexDirection: 'row', gap: 18, marginTop: 10 },
  진행칸: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  점: { width: 7, height: 7, borderRadius: 4, backgroundColor: 색.잉크_희미 },
  점_지남: { backgroundColor: 색.잉크_서브 },
  점_현재: { backgroundColor: 색.잉크 },
  점라벨: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_메타 },
  점라벨_현재: { fontFamily: 폰트.강조, color: 색.잉크 },

  경고: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_서브, lineHeight: 18 },
  오류: { fontFamily: 폰트.강조, fontSize: 13, color: 색.잉크, lineHeight: 19 },

  카드: { backgroundColor: 색.바탕띄움, borderRadius: 20, padding: 22, gap: 16 },
  카드라벨: { fontFamily: 폰트.캡션, fontSize: 13, color: 색.잉크_태그 },
  편지문: { fontFamily: 폰트.본문, fontSize: 19, lineHeight: 31, color: 색.잉크 },
  제시문: { fontFamily: 폰트.헤드, fontSize: 23, lineHeight: 34, color: 색.잉크 },

  선택지묶음: { gap: 8 },
  선택지: {
    borderWidth: 1,
    borderColor: 색.잉크_희미,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  선택지글: { fontFamily: 폰트.본문, fontSize: 16, color: 색.잉크 },
  선택지힌트: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_메타, marginTop: 2 },

  중앙: { alignItems: 'center', gap: 12, paddingVertical: 10 },
  버튼자리: { width: 코랄지름 * 1.6, height: 코랄지름 * 1.6, alignItems: 'center', justifyContent: 'center' },
  맥박링: {
    position: 'absolute',
    width: 코랄지름,
    height: 코랄지름,
    borderRadius: 코랄지름 / 2,
    borderWidth: 2,
    borderColor: 색.신호,
    opacity: 0.35,
  },
  코랄원: {
    width: 코랄지름,
    height: 코랄지름,
    borderRadius: 코랄지름 / 2,
    backgroundColor: 색.신호,
    alignItems: 'center',
    justifyContent: 'center',
  },
  마이크점: { width: 14, height: 14, borderRadius: 7, backgroundColor: 색.바탕 },
  정지사각: { width: 22, height: 22, borderRadius: 5, backgroundColor: 색.바탕 },
  타이머: { fontFamily: 폰트.모노, fontSize: 22, letterSpacing: 모노트래킹.타이머, color: 색.잉크 },
  녹음안내: { fontFamily: 폰트.캡션, fontSize: 13, color: 색.잉크_서브 },

  확인묶음: { gap: 12 },
  확인글: { fontFamily: 폰트.강조, fontSize: 16, color: 색.잉크 },
  무발화설명: { fontFamily: 폰트.본문, fontSize: 14, lineHeight: 22, color: 색.잉크_서브 },
  병기입력: {
    fontFamily: 폰트.본문,
    fontSize: 15,
    color: 색.잉크,
    borderWidth: 1,
    borderColor: 색.잉크_희미,
    borderRadius: 12,
    padding: 12,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  가로: { flexDirection: 'row', gap: 10 },
  늘림: { flex: 1 },

  주버튼: {
    backgroundColor: 색.잉크,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  주버튼_대기: { backgroundColor: 'rgba(246,241,232,0.85)' },
  주버튼글: { fontFamily: 폰트.강조, fontSize: 15, color: 색.바탕 },
  보조버튼: {
    borderWidth: 1,
    borderColor: 색.잉크_희미,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  보조버튼글: { fontFamily: 폰트.강조, fontSize: 14, color: 색.잉크_태그 },
  눌림: { opacity: 0.75 },

  완료제목: { fontFamily: 폰트.헤드, fontSize: 25, color: 색.잉크 },
  완료설명: { fontFamily: 폰트.본문, fontSize: 15, lineHeight: 24, color: 색.잉크_서브 },
  완료메타: { fontFamily: 폰트.캡션, fontSize: 13, color: 색.잉크_메타 },
});
