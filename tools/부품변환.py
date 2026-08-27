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
    배 = 안쪽 / 잘림.width
    새 = 잘림.resize((max(1, round(잘림.width * 배)), max(1, round(잘림.height * 배))), Image.LANCZOS)
    여백 = int(가로눈금 * 여백비)
    판 = Image.new('RGBA', (가로눈금, 새.height + 여백 * 2), (0, 0, 0, 0))
    판.paste(새, (여백, 여백), 새)
    return 판


def main():
    원본뿌리 = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else 기본원본)
    if not os.path.isdir(원본뿌리):
        raise SystemExit('굽기 폴더가 없다: ' + 원본뿌리)
    고른세트 = {s.strip() for s in sys.argv[2].split(',')} if len(sys.argv) > 2 else None

    낸것 = 0
    빠진것 = []
    for 세트 in sorted(os.listdir(원본뿌리)):
        방 = os.path.join(원본뿌리, 세트)
        if not os.path.isdir(방):
            continue
        if 고른세트 and 세트 not in 고른세트:
            continue
        낼방 = os.path.join(DST, 세트)
        os.makedirs(낼방, exist_ok=True)
        이름들 = sorted({f[:-len('_몸.png')] for f in os.listdir(방) if f.endswith('_몸.png')})

        # 🔴 **한 묶음은 한 자로 자른다** — 08-28 실측: 녹음 세 «상태»를 각자 제 알파로 잘랐더니
        #   높이가 444·482·363 으로 갈렸다. 그대로 앱에 넣으면 상태가 바뀔 때마다 단추가
        #   커졌다 작아졌다 한다(바늘이 위로 솟은 판만 키가 크다). 상태 묶음은 «같은 물건의
        #   다른 순간»이니 자도 하나여야 한다 — 이름의 `_` 앞이 같으면 한 묶음으로 본다.
        #   (묶음이 아닌 홑 부품은 제 상자를 그대로 쓴다 — 남의 여백을 물려받을 까닭이 없다.)
        상자표 = {}
        묶음별 = {}
        for 이름 in 이름들:
            if os.path.exists(os.path.join(방, 이름 + '_접지.png')):
                묶음별.setdefault(이름.split('_')[0], []).append(이름)
        for 묶음, 식구 in 묶음별.items():
            공통 = 합치기([몸상자(Image.open(os.path.join(방, n + '_몸.png')).convert('RGBA')) for n in 식구])
            for n in 식구:
                상자표[n] = 공통
            if len(식구) > 1:
                print('  · %s/%s — %d상태를 한 자로 자른다 %s' % (세트, 묶음, len(식구), 공통))

        for 이름 in 이름들:
            몸길 = os.path.join(방, 이름 + '_몸.png')
            접길 = os.path.join(방, 이름 + '_접지.png')
            if not os.path.exists(접길):
                빠진것.append(세트 + '/' + 이름 + ' (접지 없음)')
                continue
            판 = 잘라앉히기(Image.open(몸길).convert('RGBA'), Image.open(접길).convert('RGBA'), 상자표[이름])
            낼길 = os.path.join(낼방, 이름 + '.webp')
            판.save(낼길, 'WEBP', quality=92, method=6)
            print('  %-28s %dx%d  %5.1fKB' % (세트 + '/' + 이름, 판.width, 판.height,
                                              os.path.getsize(낼길) / 1024))
            낸것 += 1

    print('■ 부품 변환 — %d장 → assets/부품/' % 낸것)
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
