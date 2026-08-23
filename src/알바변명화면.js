import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Speech from 'expo-speech';
import { 색, 폰트, 모노트래킹 } from './테마';
import { 제출재료 } from '../lib/알바변명제출.js';
/* 발화 사슬의 판정들 — 「냈다」(학습출석 = ③답하기 submitted)와 「닿았다」(배달상태 = 서버가
 * 받은 것만)를 말하기 화면과 **같은 함수**로 읽는다. 여기 다시 적으면 갈라진 쪽이 조용히
 * 「도착했어요」를 지어낸다. */
import { 학습출석, 배달상태 } from '../lib/제출로그.js';
/* 녹음카드·되듣기·「다시 말하기」·업로드는 **말하기 화면의 그 카드 그대로**다(발주 G3 판정 ① —
 * 새 통로 0 · 소급 불가 배선(PCM WAV·capture_meta·무발화 ⓐ/ⓑ)이 전부 그 카드에 산다).
 * ⚠ 순환 import 다(말하기화면 → 이 파일 → 말하기화면). 안전한 이유: 두 쪽 다 가져온 이름을
 *   **렌더 시점에만** 읽는다(모듈 평가 중 접근 0) — Babel·Metro 의 CJS 변환은 __esModule 표식을
 *   맨 앞에 세우고 접근을 이름공간 프로퍼티로 미루므로, 부분 초기화 순간이 지나면 산다.
 *   모듈 평가 시점에 구조분해로 값을 «떼어 두는» 순간 이 안전이 깨진다 — 그렇게 고치지 말 것. */
import { 녹음카드, 한국어음성 } from './말하기화면.js';

/**
 * G3 「알바 변명」 — 사장님 말을 듣고 20~30초 소리로 사과·변명하는 게임
 * (발주_게임모듈.md G3 §4-3 · 유일한 음성 모듈).
 * 흐름: 상황 카드 → 사장님 대사(TTS) → 신호음 → 300ms 무음 → 자동 녹음 → 끝(교정·판정 0).
 *
 * ■ 재료는 **라우팅이 편다** (`src/말하기화면.js` → `lib/알바변명제출.게임재료`)
 *   검수확정 게이트·시드 펴기가 그 한 곳에 살아서 미검수 판·못 펴는 시드는 여기 오기 전에
 *   말하기 폴백으로 내려간다(G1·G2·G4 와 같은 규율). 재료 없이 그려지면 정직한 안내 카드다.
 *
 * ■ 🔴 이 화면은 **발화 사슬**이다 — 게임 큐가 아니다 (판정 ① · `lib/알바변명제출.js` 머리말)
 *   제출·전송·되듣기·밀린 큐를 전부 말하기 화면의 `기록추가`·`로그` 가 진다(프롭으로 받는다).
 *   이 파일이 더하는 것은 **task_meta 주입 하나**다(`게임항목입력`) — 항목이 자기 배정의 판을
 *   들고 가야 발화 사슬이 G3 를 말하기와 구분하지 않는다. 게임큐읽기/담기/밀기를 여기서 부르는
 *   순간 같은 발화가 두 큐에 선다 — 부르지 않는 것이 설계다.
 *
 * ■ 🔴 숫자 시계·카운트다운·초 표시 0 (발주 G3 §4-3 🔑)
 *   화면에 숫자가 있으면 회피 지연 축이 「시계에 반응했다」로 오염된다. 녹음카드의 타이머·
 *   「N초 담겼어요」·호흡 번호는 `숫자숨김` 프롭이 끈다. 이 파일 자신도 숫자를 그리지 않는다
 *   (팩이 낸 상황문·지시문 속 숫자는 문항 정본이라 예외 — 시계가 아니라 상황이다).
 *
 * ■ 🔴 녹음 중 효과음·햅틱 0 (게임층 §7 ⓐ — 마이크 되먹임)
 *   이 파일은 소리를 **한 번도 직접 내지 않는다.** 신호음(`notify`)·녹음 경계 알림은 전부
 *   녹음카드의 자동 시작 사슬이 게이트(`src/소리.js`) 경유로 진다.
 *
 * ■ TTS = 기기 목소리 (팩 머리말 「템플릿이지 AI 가 아니다」)
 *   `intervention.delivered` 를 내지 않는다 — model·prompt_ver 에 넣을 정직한 값이 없다.
 *   재생은 ①듣기 카드와 같은 무늬(보이스 고르기 재사용 · unmount 시 Speech.stop 필수).
 *   🚫 대사 다시 듣기 버튼을 녹음 단계에 두지 않는다 — 재생과 녹음을 시간축에서 가르는 것이
 *   에코 처방의 전부다(§9-1 ①). 대사는 녹음카드 제시문으로 글자로 남아 다시 읽을 수 있다.
 *
 * ■ 몽골어 병기 0 — `게임재료` 가 mn 을 내지 않는다(팩 검수확정=false · 발주_게임콘텐츠팩 §3).
 *   지어내지 않는다 — 병기는 몽골어 검수 확정 커밋(팩 개정)이 재료에 싣는 날 그린다.
 * ■ 신호 1점 = **녹음 버튼**(`테마.신호자리.알바변명`) — 녹음카드 안의 코랄이 그것이다.
 *   이 파일은 코랄을 쓰지 않는다.
 */

/**
 * 발화 항목에 G3 배정의 판을 싣는다 — `말하기화면.기록추가` 가
 * `항목입력.task_meta !== undefined` 우선 규칙으로 이 값을 그대로 채택한다.
 * 🔑 조립은 `제출재료` 하나다(`오늘과제.제출사건` 이 읽는 모양 그대로) — 여기서 키를 하나라도
 *   더 얹으면 발화 사슬이 모르는 판이 되고, 그 항목은 조용히 안 나간다.
 */
export function 게임항목입력(재료, 항목입력) {
  return { ...항목입력, task_meta: 제출재료(재료) };
}

export default function 알바변명화면({
  재료, date, 로그, 기록추가, 학생번호 = null, 시작단계 = '상황',
}) {
  const [단계, set단계] = useState(시작단계); // 상황 | 녹음 | 끝
  const [읽는중, set읽는중] = useState(false);

  /* 이미 낸 날은 다시 열어도 끝 카드다(두 번 내지 않는다 — G1 「이미」 판정과 같은 축).
   * 판정은 `학습출석`(제출로그) 하나 — ③답하기 submitted 가 곧 이 게임의 「냈다」다(판정 ①).
   * 로그가 늦게 도착해도(부모 effect) 이 효과가 따라 닫는다 — 초기값으로 굳히지 않는다. */
  useEffect(() => {
    if (단계 !== '끝' && 학습출석(로그, date)) set단계('끝');
  }, [로그, date]);

  /* 화면을 떠나면 사장님 입을 닫는다 — 안 닫으면 다음 화면 위에서 대사가 계속 나오고,
   * 그 소리가 마이크로 되돌아 들어가는 것이 §9-1 이 경계한 바로 그 에코다. */
  useEffect(() => () => Speech.stop(), []);

  const 대사재생 = async () => {
    set읽는중(true);
    Speech.stop();
    const voice = await 한국어음성(); // ①듣기와 같은 목소리 — 게임 날만 목소리가 바뀌지 않게
    Speech.speak(재료.사장님대사, {
      language: 'ko-KR',
      rate: 0.92,
      ...(voice ? { voice } : {}),
      onDone: () => {
        set읽는중(false);
        set단계('녹음'); // 재생 끝 → 녹음카드(자동 시작: 신호음 → 300ms → 녹음 · §4-3 ③)
      },
      onError: () => {
        set읽는중(false);
        set단계('녹음'); // 재생이 안 되는 기기에서도 흐름은 막지 않는다 — 대사가 글자로 선다
      },
    });
  };

  /* ── 렌더 ── */

  if (!재료) {
    return (
      <ScrollView style={s.wrap} contentContainerStyle={s.inner}>
        <머리 />
        {/* 라우팅이 재료 없이 이 화면을 그렸다(배선 실수) — 못 읽은 것을 둔갑시키지 않는다. */}
        <View style={s.카드}>
          <Text style={s.본문글}>오늘의 미션을 읽지 못했어요 — 잠시 뒤 앱을 다시 열어 주세요.</Text>
          {학생번호 ? <Text style={s.메모}>계속 그러면 선생님께 학생번호 {학생번호}를 보여 주세요.</Text> : null}
        </View>
      </ScrollView>
    );
  }

  const 냈다 = 학습출석(로그, date);
  const 배달 = 배달상태(로그, date);

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
      <머리 />

      {단계 !== '끝' && (
        <View style={s.카드}>
          <Text style={s.카드라벨}>오늘의 미션</Text>
          {/* 전체 그림 한 줄(유호 확정 08-22 자기 설명 축 · ⚠ 문구 초안 — 카피 확정은 유호님 몫). */}
          <Text style={s.메모}>전화 한 통이에요 — 사장님 말을 듣고, 내 목소리로 바로 대답해요!</Text>
          <Text style={s.상황글}>{재료.상황문}</Text>
          {/* 녹음 단계에서는 지시문이 녹음카드의 안내 자리로 내려간다 — 같은 문장을 두 카드에
              두 번 그리지 않는다(문구 정본은 어디까지나 팩 지시문 하나다). */}
          {단계 === '상황' && <Text style={s.본문글}>{재료.지시문}</Text>}
        </View>
      )}

      {단계 === '상황' && (
        <View style={s.카드}>
          <Text style={s.카드라벨}>사장님이 말해요</Text>
          {/* 🔑 대사 글자는 아직 없다 — 먼저 **듣는** 것이 이 게임의 압박이다(§4-3 ②).
              재생이 안 되는 기기는 onError 가 바로 녹음 단계로 넘겨 글자(제시문)로 선다. */}
          <Text style={s.본문글}>준비되면 눌러요. 사장님 말이 끝나면 신호음이 울리고, 바로 녹음이 시작돼요.</Text>
          <Pressable onPress={대사재생} style={({ pressed }) => [s.주버튼, pressed && s.눌림]}>
            <Text style={s.주버튼글}>{읽는중 ? '사장님이 말하는 중…' : '사장님 말 듣기'}</Text>
          </Pressable>
        </View>
      )}

      {단계 === '녹음' && (
        <녹음카드
          key="답하기"
          step="답하기"
          제시문={재료.사장님대사}
          안내={재료.지시문}
          date={date}
          로그={로그}
          기록추가={(항목입력) => 기록추가(게임항목입력(재료, 항목입력))}
          완료={() => set단계('끝')}
          prompt_id={재료.prompt_seed}
          자동시작
          신호음="notify"
          상한초={30}
          재시도상한={2}
          숫자숨김
        />
      )}

      {단계 === '끝' && (
        <View style={s.카드}>
          {/* 교정·판정 표시 0(§4-3 ⑥) — 답장은 다음 날 교정 카드 몫이다. 즉답처럼 보이지 않는다. */}
          <Text style={s.카드라벨}>{냈다 ? '다 냈어요' : '오늘의 미션 · 끝'}</Text>
          <Text style={s.끝제목}>{냈다 ? '사장님이 듣고 있어요' : '오늘은 여기까지예요'}</Text>
          <Text style={s.본문글}>
            {냈다
              ? '답장은 며칠 걸릴 수 있어요. 답장이 오면 「답장」에서 볼 수 있어요.'
              : '말이 안 나오는 날도 있어요 — 그것도 선생님께 신호가 돼요.'}
          </Text>
          {/* 🔴 「닿았다」는 서버가 받은 것만이다(완료카드와 같은 축) — 숫자 없이 사실만 낸다. */}
          {배달.보내는중 > 0 && (
            <Text style={s.메모}>목소리는 보내는 중이에요 — 앱을 다시 열면 이어서 보내요.</Text>
          )}
          {배달.못보냄 > 0 && (
            <Text style={s.오류}>목소리를 보내지 못했어요. 선생님께 알려 주세요.</Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function 머리() {
  return (
    <View style={s.머리}>
      <Text style={s.브랜드}>SYNK TALK</Text>
      <Text style={s.제목}>알바 변명</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 색.바탕 },
  inner: { padding: 24, paddingTop: 68, paddingBottom: 48, gap: 20 },

  머리: { gap: 6 },
  브랜드: { fontFamily: 폰트.모노, fontSize: 11, letterSpacing: 모노트래킹.라벨, color: 색.잉크_태그 },
  제목: { fontFamily: 폰트.헤드, fontSize: 27, color: 색.잉크 },

  오류: { fontFamily: 폰트.강조, fontSize: 13, color: 색.잉크, lineHeight: 19 },
  메모: { fontFamily: 폰트.캡션, fontSize: 12, color: 색.잉크_보조, lineHeight: 18 },

  카드: { backgroundColor: 색.바탕띄움, borderRadius: 20, padding: 22, gap: 16 },
  카드라벨: { fontFamily: 폰트.캡션, fontSize: 13, color: 색.잉크_태그 },
  상황글: { fontFamily: 폰트.헤드, fontSize: 21, lineHeight: 32, color: 색.잉크 },
  본문글: { fontFamily: 폰트.본문, fontSize: 15, lineHeight: 24, color: 색.잉크_서브 },

  /* 기본 버튼 = Paper 면 + Ink Deep 글자(테마 머리말) — 이 화면의 코랄은 녹음카드의 녹음 버튼뿐이다. */
  주버튼: { backgroundColor: 색.잉크, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  주버튼글: { fontFamily: 폰트.강조, fontSize: 15, color: 색.바탕 },
  눌림: { opacity: 0.75 },

  끝제목: { fontFamily: 폰트.헤드, fontSize: 24, color: 색.잉크 },
});
