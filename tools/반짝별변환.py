# 반짝별 변환 — 굽기 산출(투명 PNG) → talk 앱 자산(WebP 2장).
#
# 왜 있나 (유호 지시 2026-08-27 「전부 우리 loom 엔진 재질이어야 하는데 너무 2d 싸구려 느낌의
#   별인데? loom 엔진 사용해서 명품화를 진행해야할것같은데」):
#   반짝임의 별 셋이 **평면 벡터**(Lottie 도형)였다. 브랜드의 모든 요소는 펠트 실물인데
#   축하의 순간에만 다른 세계의 그림이 뜨고 있었다. ⇒ 요소 라이브러리의 «기호=별»을
#   킷 「기쁨」 두 색으로 다시 구워(`요소굽기.py` · 투명=1) 그 자리를 실물로 바꾼다.
#
# 정본(굽기 산출) = appsscript `docs/캐릭터/요소공방_0822/기호/별_{Butter,ButterSoft}_몸.png`
#   굽는 법(1800px · 샘플 256 · 알파):
#     blender -b -P tools/요소굽기.py -- 형태=기호 기호=별 색=Butter 투명=1 \
#             샘플=256 너비=1800 장치=GPU 토큰=<절대>/docs/디자인_토큰.json 출력=<절대>/별_Butter.png
#   🔴 **경로를 전부 절대로 준다** — 상대경로면 blender 가 스크립트도 토큰도 못 찾고
#      «종료코드 0 에 파일 0»으로 조용히 성공처럼 찍힌다(08-27 실측으로 한 판 날렸다).
#   🔴 `_몸` 만 쓴다 — `_접지`(그림자)는 안 쓴다. 반짝임은 «공중에 뜨는» 것이라 접지가 없다.
#
# 이 도구가 하는 일 (NPC변환.py 와 같은 규격 — 알파 크롭 · 정사각 · 여백 · WebP):
# 🔑 왜 크롭이 필요한가: 굽기 프레임은 «밤천 받침이 있던 자리» 기준이라 별이 프레임 안에서
#   치우쳐 있다. 그대로 앱에 넣으면 그림이 작게 뜨고 자리가 흔들린다.
# 🔑 여백을 남긴다: 꽉 채우면 **털 끝이 잘려** 실루엣이 각져 보인다 — 펠트는 가장자리가 곧 재질이고,
#   이 별은 그 털 후광이 그대로 «빛번짐» 노릇을 한다(그게 이 갈래가 벡터를 이긴 자리다).
#
# 실행:  python tools/반짝별변환.py [굽기폴더]
#        (굽기폴더 생략 = 형제 저장소 SYNK-appsscript 의 요소공방 기호 폴더)
# 산출:  assets/모션/반짝별_큰.webp · 반짝별_잔.webp
import os
import sys
from PIL import Image

여기 = os.path.dirname(os.path.abspath(__file__))
DST = os.path.join(여기, '..', 'assets', '모션')
기본굽기폴더 = os.path.join(
    여기, '..', '..', 'SYNK-appsscript', 'docs', '캐릭터', '요소공방_0822', '기호')

# 변 = 표시 96pt × @4x — 큰 별의 가장 큰 쓰임(전면 축하)까지 버틴다. 잔별은 같은 변으로 두고
# 앱에서 줄인다(줄이는 것은 깨끗하고, 키우는 것은 안 그렇다).
크기 = 384
여백비 = 0.05

판들 = [
    ('별_Butter_몸.png', '반짝별_큰.webp'),
    ('별_ButterSoft_몸.png', '반짝별_잔.webp'),
]


def 하나(들어올곳, 낼곳):
    im = Image.open(들어올곳).convert('RGBA')
    bb = im.getchannel('A').getbbox()
    if bb is None:
        raise SystemExit(f'🔴 알파가 통째로 비었다 — {들어올곳} (굽기가 받침을 못 걷었다)')
    잘림 = im.crop(bb)

    안쪽 = int(크기 * (1 - 2 * 여백비))
    비율 = min(안쪽 / 잘림.width, 안쪽 / 잘림.height)
    새 = 잘림.resize((max(1, round(잘림.width * 비율)), max(1, round(잘림.height * 비율))),
                    Image.LANCZOS)

    판 = Image.new('RGBA', (크기, 크기), (0, 0, 0, 0))
    판.alpha_composite(새, ((크기 - 새.width) // 2, (크기 - 새.height) // 2))
    os.makedirs(os.path.dirname(낼곳), exist_ok=True)
    판.save(낼곳, 'WEBP', quality=92, method=6)
    return bb, 새.size, os.path.getsize(낼곳)


def main():
    굽기폴더 = sys.argv[1] if len(sys.argv) > 1 else 기본굽기폴더
    없는것 = [n for n, _ in 판들 if not os.path.exists(os.path.join(굽기폴더, n))]
    if 없는것:
        raise SystemExit(
            '🔴 굽기 산출이 없다: ' + ', '.join(없는것) +
            f'\n   찾은 곳: {os.path.abspath(굽기폴더)}'
            '\n   → 위 머리말의 굽기 명령을 먼저 돌린다(절대경로로).')

    for 이름, 낼이름 in 판들:
        bb, 크기난 , 바이트 = 하나(os.path.join(굽기폴더, 이름), os.path.join(DST, 낼이름))
        print(f'  {이름} → {낼이름} · 알파 bbox {bb} · 앉힌 크기 {크기난} · {바이트 // 1024}KB')
    print(f'■ 반짝별 {len(판들)}장 — {크기}px 정사각 · 여백 {int(여백비 * 100)}%')


if __name__ == '__main__':
    main()
