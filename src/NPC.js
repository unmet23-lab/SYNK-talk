/* NPC — 미니게임 4모듈의 상대역 배지 (그림 = assets/npc/ 펠트 16장 · 유호 확정 08-24).
 *
 * ■ 이 파일은 «그리기»만 한다
 *   무엇이 허용되는가(역·상태 어휘)와 언제 어느 컷이 뜨는가(압박 3단 문턱·전이 자리)는
 *   전부 `lib/NPC연출.js` 가 진다. 같은 판정을 두 곳에 적으면 갈라진다(마스코트와 같은 규율).
 *
 * ■ 🔴 상태에 숫자·퍼센트를 병기하지 않는다 (게임층 설계 §4 규격 3)
 *   모호함이 설계다 — 화면에 숫자가 서면 학생이 «시계에 반응한 것»이 되어 G3 의 수집 축
 *   (회피 지연)이 통째로 오염된다. 그래서 이 컴포넌트는 그림 하나만 낸다: 게이지도, 남은
 *   시간도, 상태 이름도 그리지 않는다.
 *
 * ■ 접근성 — 라벨은 «역»까지만 말한다
 *   상태를 읽어 주면 스크린리더 사용 학생에게만 숫자 시계에 준하는 정보가 생겨 조건이 갈린다.
 *   그림이 애초에 모호하기로 한 것이므로 라벨도 같은 모호함을 지킨다.
 *
 * ■ Metro 는 require 를 정적으로 읽는다 — 목록을 코드로 파생할 수 없어 손 지도가 필요하고,
 *   그 지도가 `lib/NPC연출`(역×상태)과 갈라지는 것은 tests/npc배선.test.js 가 잡는다.
 */
import { Image, StyleSheet, View } from 'react-native';
import { 역들, 상태들, 컷이름 } from '../lib/NPC연출.js';

const 컷그림 = {
  'prof-calm': require('../assets/npc/prof-calm.webp'),
  'prof-lean': require('../assets/npc/prof-lean.webp'),
  'prof-back': require('../assets/npc/prof-back.webp'),
  'prof-win': require('../assets/npc/prof-win.webp'),
  'lead-calm': require('../assets/npc/lead-calm.webp'),
  'lead-lean': require('../assets/npc/lead-lean.webp'),
  'lead-back': require('../assets/npc/lead-back.webp'),
  'lead-win': require('../assets/npc/lead-win.webp'),
  'boss-calm': require('../assets/npc/boss-calm.webp'),
  'boss-lean': require('../assets/npc/boss-lean.webp'),
  'boss-back': require('../assets/npc/boss-back.webp'),
  'boss-win': require('../assets/npc/boss-win.webp'),
  'insp-calm': require('../assets/npc/insp-calm.webp'),
  'insp-lean': require('../assets/npc/insp-lean.webp'),
  'insp-back': require('../assets/npc/insp-back.webp'),
  'insp-win': require('../assets/npc/insp-win.webp'),
};

/** 역 → 학생이 읽는 이름. ㉠직함만이다(유호 확정 08-11 — 사람 이름을 안 붙인다). */
const 직함 = { prof: '교수님', lead: '팀장님', boss: '사장님', insp: '심사관' };

/**
 * @param {object} props
 * @param {'prof'|'lead'|'boss'|'insp'} props.역
 * @param {'calm'|'lean'|'back'|'win'} props.상태 — 값은 `lib/NPC연출`(압박상태·전이상태)이 낸다.
 *   화면이 직접 지어내지 않는다: 문턱도 전이 자리도 그 파일 하나가 안다.
 * @param {number} [props.크기] 한 변(px). 기본 84 — 마스코트와 같은 눈금이라 두 존재가 한 화면에
 *   설 때 크기로 위계가 생기지 않는다.
 * @param {object} [props.자리] 위치 덮어쓰기 — 배치는 화면 몫이다.
 */
export default function NPC({ 역, 상태, 크기 = 84, 자리 = null }) {
  /* 어휘 밖 값이면 **안 그린다** — 조용히 기본 컷으로 내려가면 「배선이 틀렸다」가
     「멀쩡해 보이는 화면」이 된다(옛 몽글 사고의 뿌리가 그 조용한 폴백이었다). */
  if (!역들.includes(역) || !상태들.includes(상태)) return null;
  const 그림 = 컷그림[컷이름(역, 상태)];
  if (!그림) return null;

  return (
    <View style={[s.자리, 자리]} pointerEvents="none">
      <Image
        source={그림}
        style={{ width: 크기, height: 크기 }}
        resizeMode="contain"
        accessibilityLabel={직함[역] || 'NPC'}
      />
    </View>
  );
}

const s = StyleSheet.create({
  자리: { alignItems: 'center', justifyContent: 'center' },
});
