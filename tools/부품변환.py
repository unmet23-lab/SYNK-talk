# 요소 부품 변환 — 굽기 산출(투명 PNG 두 층) → talk 앱 자산 WebP.
#
# 왜 있나: appsscript 가 08-25 에 구운 펠트 UI 부품 28장이 **앱에 한 장도 못 갔다**(08-28 실측).
#   까닭은 굽기 쪽이었다 — 받침(밤천)을 깔고 찍어 **알파가 프레임을 꽉 채웠고**, 알파 크롭이
#   원리상 아무것도 못 잘랐다(NPC 배지 16장이 넉 달 묵은 것과 «같은 병»이다).
#   08-28 에 `세트굽기.js --더 "투명=1"` 통로가 서서 두 층(몸·접지)으로 나오기 시작했다.
#
# 🔑 NPC변환과 다른 점 = **정사각으로 안 만든다.** 배지는 원형이라 정사각이 옳았지만
#   조작·표시 부품은 가로가 긴 띠·판이라 정사각에 넣으면 위아래가 통째로 빈다.
#   여기서는 **가로세로비를 그대로 지키고** 가로만 목표 눈금에 맞춘다.
# 🔑 두 층을 **합친다.** 접지(그림자)를 따로 두는 값은 「배경마다 다시 안 굽는다」인데
#   앱 배경은 Ink 하나다. 합쳐서 파일 수와 배선을 반으로 줄인다.
#   ⚠ 합치는 순서는 접지 → 몸이다(그림자가 아래).
# 🔑 알파로 자른다: 굽기 프레임은 받침이 있던 자리 기준이라 부품이 한쪽에 치우쳐 있다.
#   자르지 않으면 화면마다 자리가 흔들린다.
#
# 실행:  python tools/부품변환.py [굽기폴더] [세트,세트]   (기본 = 형제 저장소 요소부품_0828 · 전 세트)
# 산출:  assets/부품/<세트>/<이름>.webp
#
# ⚠ **굽는 «중»인 세트를 넣지 마라** — 반쯤 난 세트는 몸만 있고 접지가 아직 없어 「못 낸 것」으로
#   빨개진다(그 자체는 옳은 거동이다). 밤 배치가 도는 동안은 끝난 세트만 이름으로 고른다.
import io
import json
import os
import sys
import numpy as np
from PIL import Image

여백비 = 0.04       # 사방 여백 — 펠트는 가장자리가 곧 재질이라 꽉 채우면 각져 보인다
가로눈금 = 1024     # @4x 기준. 띠 부품은 화면에서 최대 256pt 쯤 쓴다

여기 = os.path.dirname(os.path.abspath(__file__))
DST = os.path.join(여기, '..', 'assets', '부품')
기본원본 = os.path.join(여기, '..', '..', 'SYNK-appsscript', 'docs', '캐릭터', '요소부품_0828')


def 몸상자(몸):
    """몸 층의 알파 바운딩박스에 그림자 여유를 더한 것.

    🔴 자르는 자를 «몸»으로 두는 것이 핵심이다. 접지는 그림자라 알파가 프레임 가까이까지
       퍼져 있어서, 합친 뒤의 알파로 자르면 **아무것도 안 잘린다**(받침을 걷은 뜻이 사라진다).
    """
    a = np.asarray(몸)[:, :, 3]
    행 = np.nonzero(a.any(axis=1))[0]
    열 = np.nonzero(a.any(axis=0))[0]
    assert 행.size and 열.size, '몸 층의 알파가 통째로 비었다 — 굽기가 덜 끝났거나 몸 패스가 아니다'
    번짐 = int(max(몸.size) * 0.02)          # 그림자 여유
    return (max(0, int(열[0]) - 번짐), max(0, int(행[0]) - 번짐),
            min(몸.width, int(열[-1]) + 1 + 번짐), min(몸.height, int(행[-1]) + 1 + 번짐))


def 합치기(상자들):
    """여러 상자를 다 덮는 하나 — «한 묶음은 한 자로 잘린다»."""
    return (min(b[0] for b in 상자들), min(b[1] for b in 상자들),
            max(b[2] for b in 상자들), max(b[3] for b in 상자들))


def 잘라앉히기(몸, 접지, 상자):
    """접지 → 몸 순으로 합치고 주어진 상자로 자른다(그림자가 아래)."""
    합 = Image.new('RGBA', 몸.size, (0, 0, 0, 0))
    합.alpha_composite(접지)
    합.alpha_composite(몸)
    잘림 = 합.crop(상자)

    안쪽 = int(가로눈금 * (1 - 여백비 * 2))
    # 🔑 **긴 변에 맞춘다 — 그리고 «확대는 안 한다»**(08-28 실측으로 고침).
    #   처음엔 «가로»에 맞췄는데, `조작2/풀다운` 처럼 세로로 긴 부품(내용 561×1687)이
    #   가로를 채우려고 **1.68배로 늘어났다.** 확대는 정보를 안 늘리고 결만 뭉개며 파일을 불린다
    #   (그리고 눈금이 부품마다 갈려 화면에서 굵기가 안 맞는다).
    #   긴 변 기준이면 가로가 긴 띠는 그대로고(녹음 셋은 값이 안 바뀐다) 세로로 긴 것만 제자리를 찾는다.
    배 = min(안쪽 / max(잘림.width, 잘림.height), 1.0)
    새 = 잘림.resize((max(1, round(잘림.width * 배)), max(1, round(잘림.height * 배))), Image.LANCZOS)
    여백 = int(가로눈금 * 여백비)
    판 = Image.new('RGBA', (새.width + 여백 * 2, 새.height + 여백 * 2), (0, 0, 0, 0))
    판.paste(새, (여백, 여백), 새)
    return 판


def main():
    원본뿌리 = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else 기본원본)
    if not os.path.isdir(원본뿌리):
        raise SystemExit('굽기 폴더가 없다: ' + 원본뿌리)
    고른세트 = {s.strip() for s in sys.argv[2].split(',')} if len(sys.argv) > 2 else None

    낸것 = 0
    빠진것 = []
    치수 = {}        # '세트/이름' → [가로, 세로] · 만든 쪽이 적는다(아래 치수장부)
    분모 = {}          # 세트 → 굽기 폴더에 있던 이름 수(낸 수와 대조한다)
    for 세트 in sorted(os.listdir(원본뿌리)):
        방 = os.path.join(원본뿌리, 세트)
        if not os.path.isdir(방):
            continue
        if 고른세트 and 세트 not in 고른세트:
            continue
        낼방 = os.path.join(DST, 세트)
        os.makedirs(낼방, exist_ok=True)
        # 🔴 **굽기 산출은 «두 꼴»이다 — `_몸`만 찾으면 한 꼴이 통째로 샌다**(08-28 실측).
        #   요소굽기.py 는 그림자 «받이»가 0 이면 두 층이 뜻이 없어 `<이름>.png` **한 장**으로 낸다
        #   (받이가 없으면 접지 패스가 «완전 투명 한 장»이다 — 그 파일 5246행이 그렇게 적어 뒀다).
        #   `조작2/라디오` 가 그 갈래였다: 천 자체가 몸이라 받침이 없다. 성한 굽기인데
        #   `_몸.png` 만 훑던 이 도구가 **말 한마디 없이 건너뛰었다** — 「못 냈다」에도 안 잡힌다
        #   (빠진것은 `_몸` 이 있는데 `_접지` 가 없을 때만 울리니까). 전형적인 «0이 성공 얼굴»이다.
        #   ⇒ 두 꼴을 다 받고, 아래에서 **센 수를 굽기 항목 수와 대조**해 침묵을 막는다.
        두층 = sorted({f[:-len('_몸.png')] for f in os.listdir(방) if f.endswith('_몸.png')})
        한장 = sorted({f[:-len('.png')] for f in os.listdir(방)
                      if f.endswith('.png') and not f.endswith('_몸.png') and not f.endswith('_접지.png')})
        이름들 = sorted(set(두층) | set(한장))

        # 🔴 **한 묶음은 한 자로 자른다** — 08-28 실측: 녹음 세 «상태»를 각자 제 알파로 잘랐더니
        #   높이가 444·482·363 으로 갈렸다. 그대로 앱에 넣으면 상태가 바뀔 때마다 단추가
        #   커졌다 작아졌다 한다(바늘이 위로 솟은 판만 키가 크다). 상태 묶음은 «같은 물건의
        #   다른 순간»이니 자도 하나여야 한다 — 이름의 `_` 앞이 같으면 한 묶음으로 본다.
        #   (묶음이 아닌 홑 부품은 제 상자를 그대로 쓴다 — 남의 여백을 물려받을 까닭이 없다.)
        def 몸길(이름):
            """이 이름의 «몸» 파일 — 두 층이면 `_몸.png`, 한 장 꼴이면 `<이름>.png`."""
            p = os.path.join(방, 이름 + '_몸.png')
            return p if os.path.exists(p) else os.path.join(방, 이름 + '.png')

        상자표 = {}
        묶음별 = {}
        for 이름 in 이름들:
            묶음별.setdefault(이름.split('_')[0], []).append(이름)
        for 묶음, 식구 in 묶음별.items():
            공통 = 합치기([몸상자(Image.open(몸길(n)).convert('RGBA')) for n in 식구])
            for n in 식구:
                상자표[n] = 공통
            if len(식구) > 1:
                print('  · %s/%s — %d상태를 한 자로 자른다 %s' % (세트, 묶음, len(식구), 공통))

        for 이름 in 이름들:
            몸p = 몸길(이름)
            접길 = os.path.join(방, 이름 + '_접지.png')
            if not os.path.exists(몸p):
                빠진것.append(세트 + '/' + 이름 + ' (몸 없음)')
                continue
            몸 = Image.open(몸p).convert('RGBA')
            # 받이 0 꼴은 접지가 «없는 것이 정상»이다 — 빈 층을 만들어 같은 통로로 흘린다.
            접지 = (Image.open(접길).convert('RGBA') if os.path.exists(접길)
                   else Image.new('RGBA', 몸.size, (0, 0, 0, 0)))
            판 = 잘라앉히기(몸, 접지, 상자표[이름])
            낼길 = os.path.join(낼방, 이름 + '.webp')
            판.save(낼길, 'WEBP', quality=92, method=6)
            치수[세트 + '/' + 이름] = [판.width, 판.height]
            꼴 = '두층' if 몸p.endswith('_몸.png') else '한장'
            print('  %-28s %dx%d  %5.1fKB  %s' % (세트 + '/' + 이름, 판.width, 판.height,
                                                  os.path.getsize(낼길) / 1024, 꼴))
            낸것 += 1
        분모[세트] = len(이름들)

    # 🔑 **치수 장부 — 만든 쪽이 적는다**(08-28 신설).
    #   화면이 가로세로비를 «손으로» 적으면 그 수가 곧 두 곳에 산다. 실제로 이 도구를
    #   「긴 변 기준·확대 금지」로 고치는 순간 1024 가 **1022** 가 됐고, `녹음띠.js` 에 박아 둔
    #   `563/1024` 가 조용히 틀린 수가 될 뻔했다(눈에 안 띄는 0.2%).
    #   ⚠ RN 의 `Image.resolveAssetSource` 로 물어보는 길도 있는데, 그건 **회귀에서 못 쓴다**
    #     (테스트가 자산을 파일 이름 문자열로 세우므로 치수를 원리상 모른다 · 08-28 실측).
    #   ⇒ 치수를 아는 것은 «자른 이»다. 그러니 자른 이가 적는다.
    #   🔴 세트를 골라 돌릴 때 **남의 세트를 지우지 않는다** — 읽고 «합쳐서» 쓴다.
    장부길 = os.path.join(DST, '치수.json')
    옛장부 = {}
    if os.path.exists(장부길):
        try:
            with io.open(장부길, encoding='utf-8') as f:
                옛장부 = json.load(f)
        except Exception:
            옛장부 = {}          # 깨졌으면 이번 것으로 새로 세운다(값은 언제든 다시 만들 수 있다)
    옛장부.update(치수)
    with io.open(장부길, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(옛장부, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write('\n')
    print('  · 치수장부 %d항목 → assets/부품/치수.json (이번에 %d 갱신)' % (len(옛장부), len(치수)))

    # 🔑 **분모를 소리 내어 적는다** — 「몇 장 냈다」만으로는 «다 냈나»를 못 판정한다.
    #   이 도구는 08-28 에 `라디오` 한 장을 «말 한마디 없이» 건너뛰었다(그 꼴을 안 물었다).
    #   세트마다 「굽기 폴더에 있던 이름 수 = 낸 수」를 대조하면 그런 침묵이 원리상 불가능해진다.
    print('■ 부품 변환 — %d장 → assets/부품/  (세트별 분모: %s)'
          % (낸것, ' · '.join('%s %d' % (k, v) for k, v in sorted(분모.items()))))
    if 낸것 != sum(분모.values()):
        raise SystemExit('🔴 낸 수(%d) 와 굽기 폴더의 이름 수(%d) 가 다르다 — 조용히 샌 것이 있다'
                         % (낸것, sum(분모.values())))
    if 빠진것:
        # 🔴 조용히 넘어가지 않는다 — 「0건」이 성공 얼굴을 하는 갈래다(08-28 하루에 넷).
        print('🔴 못 낸 것 %d:' % len(빠진것))
        for x in 빠진것:
            print('   ' + x)
        raise SystemExit(1)
    if 낸것 == 0:
        raise SystemExit('🔴 한 장도 못 냈다 — 굽기 폴더에 _몸.png 가 없다: ' + 원본뿌리)


if __name__ == '__main__':
    main()
