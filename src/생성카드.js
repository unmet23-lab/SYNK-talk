'use strict';
/**
 * 생성 카드 — 오늘 과제가 **없는 게 아니라 오는 중(또는 못 온)** 학생이 읽는 자리 (상태기반 §3-1 · §12-11).
 *
 * ■ 이 파일이 닫는 것
 *   `GET /v1/tasks` 의 `assignment_status` 가 `생성중` 이면 「곧 온다」, `오류` 면 「선생님께 보여 주기」를
 *   그린다 — 그 둘을 빈 과제 폴백과 «다르게 그리는» 것이 §12-11 어댑터 인수 조건이다(칸만 실리고 앱이 안
 *   읽으면 두 사실이 여전히 한 화면이다). `있음`·`없음`·칸 없음이면 **아무것도 그리지 않는다**(기존 화면 그대로).
 * ■ 문장은 여기 없다 — 정본은 `contents/문구_생성.js`(**카피 확정 08-22** — `카피확정=true` · 회귀가 못박음) · 이 파일은 배치만.
 * ■ 디자인 — 막힘카드와 같은 밀도·같은 위계(신호 1점 = 녹음 버튼 · 여기엔 코랄 0). `테마.js` R1.
 */
import { StyleSheet, Text, View } from 'react-native';
import { 색, 폰트, 모노트래킹, 몽골어폰트 } from './테마';
import { 생성안내 } from '../contents/문구_생성.js';

/**
 * @param {{상태: string|null, 학생번호?: string|null, 이름?: string|null}} props
 *   `상태` = `오늘과제받기()` 가 실어 온 `assignment_status`. 그릴 것이 없으면 null — 빈 카드를 세우지 않는다.
 *   `이름` = 학생 이름(`display_name`) — 있으면 오류 제목이 「{이름}님답게」 판으로 선다(정본·치환은
 *   `contents/문구_생성.js` 하나). ⚠ 지금 로그인 세션에는 이름이 안 실려(인증API — 합성 이메일뿐)
 *   호출부가 못 넘긴다 — 세션에 이름이 실리는 날 이 prop 만 이으면 켜진다(이름 없는 판이 그때까지 정본).
 */
export default function 생성카드({ 상태, 학생번호 = null, 이름 = null }) {
  const 안 = 생성안내(상태, 이름);
  if (!안) return null;

  return (
    <View style={s.카드}>
      {안.제목.map((줄, i) => (
        <Text key={`제목${i}`} style={i === 0 ? s.제목 : s.제목_병기}>{줄}</Text>
      ))}
      {안.본문.map((줄, i) => (
        <Text key={`본문${i}`} style={i === 0 ? s.본문 : s.본문_병기}>{줄}</Text>
      ))}

      {안.보여줄값 === '학생번호' && 학생번호 ? (
        <View style={s.번호칸}>
          <Text style={s.번호라벨}>STUDENT ID</Text>
          <Text style={s.번호} selectable>{학생번호}</Text>
        </View>
      ) : null}

      {/* 🔴 모르는 값을 「괜찮다」로 접지 않는다 — 서버가 값목록을 늘리는 날 이 한 줄이 무엇이 왔는지 남긴다. */}
      {안.아는값 ? null : <Text style={s.메모}>{안.값}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  카드: { backgroundColor: 색.바탕띄움, borderRadius: 20, padding: 22, gap: 14 },
  제목: { fontFamily: 폰트.헤드, fontSize: 21, lineHeight: 31, color: 색.잉크 },
  본문: { fontFamily: 폰트.본문, fontSize: 16, lineHeight: 26, color: 색.잉크_서브 },
  /* 🔴 **몽골어 줄이다** — 킷 한글 폰트(SUIT)를 박으면 키릴 자형이 없어 두부(□□□)가 된다.
     08-27 까지 여기가 `폰트.강조`·`폰트.캡션` 이었다: 몽골어가 아직 안 와서 증상이 없었을 뿐,
     오는 날 이 화면만 깨졌을 자리다(`테마.몽골어` 머리말이 예고한 바로 그 새는 자리). */
  제목_병기: { fontFamily: 몽골어폰트.강조, fontSize: 17, lineHeight: 26, color: 색.잉크_서브 },
  본문_병기: { fontFamily: 몽골어폰트.캡션, fontSize: 15, lineHeight: 24, color: 색.잉크_메타 },
  번호칸: { alignItems: 'center', gap: 6, paddingVertical: 12 },
  /* 08-31 감사 D7-10 — letterSpacing 에 모노트래킹 «객체»를 통째로 넘기고 있었다(조용히 무시).
     막힘카드와 같은 밀도·같은 위계라던 머리말 약속대로 그 규격(.라벨/.타이머 · 34px · 태그색)에 맞춘다. */
  번호라벨: { fontFamily: 폰트.모노, fontSize: 11, letterSpacing: 모노트래킹.라벨, color: 색.잉크_태그 },
  번호: { fontFamily: 폰트.모노, fontSize: 34, letterSpacing: 모노트래킹.타이머, color: 색.잉크 },
  메모: { fontFamily: 폰트.모노, fontSize: 11, letterSpacing: 모노트래킹.라벨, color: 색.잉크_보조 },
});
