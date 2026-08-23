# NPC 배지 변환 — 굽기 산출(투명 PNG) → talk 앱 자산(WebP 16장).
#
# ⚠ 2026-08-24 현재 **쓰이지 않는다** — 유호님이 배지 형상을 반려하셨다(「다 똑같이 생겼다」 ·
#   appsscript 트랙 §2-G). 옛 평면 SVG 16종이 아직 정본이고, 이 도구는 형상이 새로 서는 날
#   그대로 쓴다(변환 규격은 형상과 무관하다 — 알파 크롭·정사각·WebP).
# 굽기 통로는
# 요소굽기.py 정본을 런타임으로 빌리는 세트 스크립트이고(재질·조명·무대 베끼기 0),
# 이 도구는 그 산출을 **알파 기준으로 잘라 정사각으로 앉히고 WebP 로 바꾼다.**
#
# 🔑 왜 크롭이 필요한가: 굽기 프레임은 «밤천 받침이 있던 자리» 기준이라 배지가 위쪽에
#   치우쳐 있고 아래가 통째로 빈다. 그대로 앱에 넣으면 화면에서 그림이 작게 뜨고 자리도 흔들린다.
#   알파 바운딩박스로 자르면 역·상태마다 다른 실루엣(묶음이 아래로 삐져나오는 back 등)이
#   **같은 눈금**으로 앉는다.
# 🔑 여백을 남긴다: 꽉 채우면 털 끝이 잘려 실루엣이 각져 보인다(펠트는 가장자리가 곧 재질이다).
#
# 실행:  python tools/NPC변환.py <굽기폴더>
# 산출:  assets/npc/<역>-<상태>.webp 16장 + NPC_시트.png(눈검수 대조판)
import os
import sys
import numpy as np
from PIL import Image

역들 = ['prof', 'lead', 'boss', 'insp']
상태들 = ['calm', 'lean', 'back', 'win']
크기 = 336          # 표시 84pt × @4x — 마스코트 컷과 같은 눈금
여백비 = 0.06       # 정사각 변 대비 사방 여백(털 끝을 살린다)

DST = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'npc')
SHEET = os.path.join(DST, 'NPC_시트.png')


def 잘라앉히기(원본):
    """알파 바운딩박스로 자르고 정사각 캔버스 가운데에 여백을 두고 앉힌다."""
    a = np.asarray(원본)[:, :, 3]
    행 = np.nonzero(a.any(axis=1))[0]
    열 = np.nonzero(a.any(axis=0))[0]
    assert 행.size and 열.size, '알파가 통째로 비었다 — 몸 패스가 아니다'
    잘림 = 원본.crop((int(열[0]), int(행[0]), int(열[-1]) + 1, int(행[-1]) + 1))
    변 = max(잘림.size)
    안쪽 = int(크기 * (1 - 여백비 * 2))
    배 = 안쪽 / 변
    새 = 잘림.resize((max(1, int(잘림.width * 배)), max(1, int(잘림.height * 배))), Image.LANCZOS)
    판 = Image.new('RGBA', (크기, 크기), (0, 0, 0, 0))
    판.paste(새, ((크기 - 새.width) // 2, (크기 - 새.height) // 2), 새)
    return 판


def 변환(굽기폴더):
    os.makedirs(DST, exist_ok=True)
    낱장 = {}
    for 역 in 역들:
        for 상태 in 상태들:
            이름 = f'{역}-{상태}'
            원경로 = os.path.join(굽기폴더, f'{이름}_몸.png')
            assert os.path.exists(원경로), f'{이름}_몸.png 이 없다 — 굽기가 덜 끝났다'
            판 = 잘라앉히기(Image.open(원경로).convert('RGBA'))
            나갈길 = os.path.join(DST, f'{이름}.webp')
            판.save(나갈길, 'WEBP', quality=92, method=6)
            a = np.asarray(판)[:, :, 3]
            모서리 = int(a[0, 0]) + int(a[0, -1]) + int(a[-1, 0]) + int(a[-1, -1])
            찬비율 = float((a > 8).mean())
            assert 모서리 == 0, f'{이름}: 모서리 α {모서리} — 누끼가 아니다'
            assert 찬비율 > 0.20, f'{이름}: 몸이 화면의 {찬비율:.0%} 뿐 — 크롭이 빗나갔다'
            낱장[이름] = 판
            print(f'  {이름}.webp  {크기}px  {os.path.getsize(나갈길) / 1024:.0f}KB  fill {찬비율:.0%}')

    # 눈검수 시트 — 행=역 · 열=상태. 앱 바탕(#080605) 위에 얹어야 알파 구멍이 드러난다.
    판 = Image.new('RGBA', (크기 * 4 + 50, 크기 * 4 + 50), (8, 6, 5, 255))
    for r, 역 in enumerate(역들):
        for c, 상태 in enumerate(상태들):
            im = 낱장[f'{역}-{상태}']
            판.paste(im, (10 + c * (크기 + 10), 10 + r * (크기 + 10)), im)
    판.convert('RGB').save(SHEET, 'PNG')
    print(f'  시트 → {os.path.relpath(SHEET)}')


if __name__ == '__main__':
    굽기폴더 = sys.argv[1] if len(sys.argv) > 1 else '.'
    print(f'[NPC변환] {굽기폴더}')
    변환(굽기폴더)
    print(f'[NPC변환] 16장 완료 → {os.path.relpath(DST)}')
