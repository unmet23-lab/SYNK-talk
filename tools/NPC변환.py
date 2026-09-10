# NPC 배지 변환 — 굽기 산출(투명 PNG) → talk 앱 자산(WebP 16장).
#
# 현재 입력은 appsscript 공방의 <역>-<상태>_4K.avif다.
# 4K 생성 뒤 투명 여백을 걷은 파일이므로 변 길이가 4096보다 짧을 수 있다.
# 출처·원치수·파일 지문을 assets/npc/출처.json에 함께 남긴다.
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
import argparse
import hashlib
import json
import shutil
import numpy as np
from PIL import Image

역들 = ['prof', 'lead', 'boss', 'insp']
상태들 = ['calm', 'lean', 'back', 'win']
크기 = 336          # 표시 84pt × @4x — 마스코트 컷과 같은 눈금
여백비 = 0.06       # 정사각 변 대비 사방 여백(털 끝을 살린다)

DST = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'npc')
SHEET = os.path.join(DST, 'NPC_시트.png')


def 잘라앉히기(원본, 출력크기=크기):
    """알파 바운딩박스로 자르고 정사각 캔버스 가운데에 여백을 두고 앉힌다."""
    a = np.asarray(원본)[:, :, 3]
    행 = np.nonzero(a.any(axis=1))[0]
    열 = np.nonzero(a.any(axis=0))[0]
    assert 행.size and 열.size, '알파가 통째로 비었다 — 몸 패스가 아니다'
    잘림 = 원본.crop((int(열[0]), int(행[0]), int(열[-1]) + 1, int(행[-1]) + 1))
    변 = max(잘림.size)
    안쪽 = int(출력크기 * (1 - 여백비 * 2))
    배 = 안쪽 / 변
    새 = 잘림.resize((max(1, int(잘림.width * 배)), max(1, int(잘림.height * 배))), Image.LANCZOS)
    판 = Image.new('RGBA', (출력크기, 출력크기), (0, 0, 0, 0))
    # RGBA 자체를 붙인다. 알파를 마스크로 다시 쓰면 털 끝의 알파가 제곱된다.
    판.paste(새, ((출력크기 - 새.width) // 2, (출력크기 - 새.height) // 2))
    return 판


def 몸찾기(굽기폴더, 이름):
    """굽기 산출에서 «몸 패스»를 찾는다 — 이름이 두 갈래라서 이 함수가 하나로 모은다.

    🔴 2026-08-27 에 이 자리가 실제로 어긋나 있었다. 굽기가 내는 이름은 «그림자 받이가 있나»로 갈린다
    (appsscript `요소굽기.py` 끝단):
      · 받이가 있으면  → `<이름>_몸.png` + `<이름>_접지.png` (두 패스)
      · 받이가 0 이면  → `<이름>.png` **한 장** (08-26 에 못 박은 규약 — 빈 접지 한 장을 위해
        씬을 한 번 더 도는 낭비를 걷었다)
    NPC 배지는 밤천 받침을 걷고 굽는 갈래라(`--더 "받침=0,투명=1"`) **한 장**으로 온다.
    이 함수가 없으면 변환기가 `_몸` 만 찾다 「굽기가 덜 끝났다」로 죽는다 — 굽기는 멀쩡한데.
    """
    for 후보 in (f'{이름}_4K.avif', f'{이름}_4K.png', f'{이름}.png', f'{이름}_몸.png'):
        p = os.path.join(굽기폴더, 후보)
        if os.path.exists(p):
            return p
    raise SystemExit(
        f'🔴 {이름} 의 몸 패스가 없다 — {이름}.png 도 {이름}_몸.png 도 못 찾았다.\n'
        f'   찾은 곳: {os.path.abspath(굽기폴더)}\n'
        '   → appsscript 에서 먼저 굽는다: node tools/NPC굽기.js --더 "받침=0,투명=1"')


def 기본출력크기(이전출처, 원경로):
    """크기를 생략하면 현재 파생의 크기를 보존하고, 새 4K 원본은 1024로 낸다."""
    이전크기 = 이전출처.get('outputSize', [])
    if (len(이전크기) == 2 and isinstance(이전크기[0], int)
            and 이전크기[0] == 이전크기[1] and 1 <= 이전크기[0] <= 4096):
        return 이전크기[0]
    return 1024 if '_4K.' in 원경로 else 크기


def 변환(굽기폴더, 대상역=None, 출력크기=None):
    os.makedirs(DST, exist_ok=True)
    낱장 = {}
    출처경로 = os.path.join(DST, '출처.json')
    출처 = json.load(open(출처경로, encoding='utf-8')) if os.path.exists(출처경로) else {}
    for 역 in (대상역 or 역들):
        for 상태 in 상태들:
            이름 = f'{역}-{상태}'
            원경로 = 몸찾기(굽기폴더, 이름)
            낱장크기 = 출력크기 if 출력크기 is not None else 기본출력크기(출처.get(이름, {}), 원경로)
            원본 = Image.open(원경로).convert('RGBA')
            if '_4K.' in 원경로:
                assert max(원본.size) >= 2048, f'{이름}: 4K 원천의 크롭 치수를 확인한다 {원본.size}'
                원본폴더 = os.path.join(DST, '원본4K')
                os.makedirs(원본폴더, exist_ok=True)
                사본경로 = os.path.join(원본폴더, os.path.basename(원경로))
                # 저장소에 함께 둔 원본4K에서 재변환할 때는 이미 같은 파일이다.
                if not os.path.exists(사본경로) or not os.path.samefile(원경로, 사본경로):
                    shutil.copy2(원경로, 사본경로)
            판 = 잘라앉히기(원본, 낱장크기)
            나갈길 = os.path.join(DST, f'{이름}.webp')
            판.save(나갈길, 'WEBP', quality=92, method=6)
            a = np.asarray(판)[:, :, 3]
            모서리 = int(a[0, 0]) + int(a[0, -1]) + int(a[-1, 0]) + int(a[-1, -1])
            찬비율 = float((a > 8).mean())
            assert 모서리 == 0, f'{이름}: 모서리 α {모서리} — 누끼가 아니다'
            assert 찬비율 > 0.20, f'{이름}: 몸이 화면의 {찬비율:.0%} 뿐 — 크롭이 빗나갔다'
            낱장[이름] = 판
            출처[이름] = {
                'source': os.path.abspath(원경로), 'sourceSize': list(원본.size),
                'sourceSha256': hashlib.sha256(open(원경로, 'rb').read()).hexdigest(),
                'output': f'assets/npc/{이름}.webp', 'outputSize': list(판.size),
                'outputSha256': hashlib.sha256(open(나갈길, 'rb').read()).hexdigest(),
                'transform': 'alpha crop; square padding 6%; LANCZOS; WebP quality=92; alpha preserved',
            }
            print(f'  {이름}.webp  {낱장크기}px  {os.path.getsize(나갈길) / 1024:.0f}KB  fill {찬비율:.0%}')

    with open(출처경로, 'w', encoding='utf-8') as f:
        json.dump(출처, f, ensure_ascii=False, indent=2)
        f.write('\n')

    # 눈검수 시트 — 행=역 · 열=상태. 앱 바탕(#080605) 위에 얹어야 알파 구멍이 드러난다.
    시트역 = 대상역 or 역들
    판 = Image.new('RGBA', (크기 * 4 + 50, 크기 * len(시트역) + 50), (8, 6, 5, 255))
    for r, 역 in enumerate(시트역):
        for c, 상태 in enumerate(상태들):
            im = 낱장[f'{역}-{상태}'].resize((크기, 크기), Image.Resampling.LANCZOS)
            판.paste(im, (10 + c * (크기 + 10), 10 + r * (크기 + 10)), im)
    시트 = os.path.join(DST, f'NPC_시트_{"_".join(시트역)}.png') if 대상역 else SHEET
    판.convert('RGB').save(시트, 'PNG')
    print(f'  시트 → {os.path.relpath(시트)}')


if __name__ == '__main__':
    인자 = argparse.ArgumentParser(description='현재 NPC 원본에서 앱 파생을 만든다')
    인자.add_argument('굽기폴더')
    인자.add_argument('--역', choices=역들, nargs='+')
    인자.add_argument('--크기', type=int, help='생략하면 기존 출처의 크기 보존, 새 4K는 1024, 구원본은 336')
    옵션 = 인자.parse_args()
    assert 옵션.크기 is None or 1 <= 옵션.크기 <= 4096, '출력 크기는 1~4096'
    굽기폴더 = 옵션.굽기폴더
    print(f'[NPC변환] {굽기폴더}')
    변환(굽기폴더, 옵션.역, 옵션.크기)
    print(f'[NPC변환] {len(옵션.역 or 역들) * len(상태들)}장 완료 → {os.path.relpath(DST)}')
