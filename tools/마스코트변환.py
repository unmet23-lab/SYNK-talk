# 마스코트 컷 변환 — 그림 정본(펠트코랄_0815 누끼) → talk 앱 자산(WebP).
#
# 정본 = SYNK-appsscript docs/캐릭터/펠트코랄_0815 (유호 확정 08-19 · 주인은 디자인_토큰.json
#   `재질.펠트.정본사진.평상복` — tools/lib/마스코트자산.js 머리말). 누끼판(투명·알파 수리·놀람 합성
#   포함)이 이미 완성돼 있으므로 이 도구는 **리사이즈 + WebP + 실측**만 한다.
#
# 🔴 옛 판(2026-08-13 「마스코트_렌더」 유리 몸 6컷)의 누끼 로직은 지웠다 — 그 판을 다시 변환할
#   일은 없다(옛 렌더 복귀는 tests/마스코트생명.test.js 가 `재염색_` 접두로 막는다). 이 파일이
#   옛 경로를 다시 들면 그게 «옛 몽글 사고»(08-23 유호 지적)의 재발이다.
#
# 실행:  python tools/마스코트변환.py        (talk 저장소 루트 어디서든)
# 산출:  assets/마스코트/재염색_*.webp 4벌 + 마스코트_시트.png(눈검수 대조판) + 실측 로그
import os
import numpy as np
from PIL import Image

SRC = r"C:\Users\q1212\Documents\SYNK-appsscript\docs\캐릭터\펠트코랄_0815\누끼"
DST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "마스코트")
SHEET = os.path.join(DST, "마스코트_시트.png")

# 앱이 쓰는 컷 = lib/마스코트생명.표정컷 값과 1:1 (tests/마스코트자산.test.js 가 파생 대조)
컷들 = ["재염색_본체", "재염색_놀람", "재염색_눈웃음", "재염색_눈감음"]
크기 = 336  # 표시 84pt × @4x — 옛 판(512)과 달리 정본이 1024 라 4배 밀도가 그대로 산다

def 변환():
    낱장들 = []
    for 이름 in 컷들:
        원본 = Image.open(os.path.join(SRC, f"{이름}.png")).convert("RGBA")
        assert 원본.size == (1024, 1024), f"{이름}: 정본 크기가 아니다 {원본.size}"
        작게 = 원본.resize((크기, 크기), Image.LANCZOS)
        나갈길 = os.path.join(DST, f"{이름}.webp")
        작게.save(나갈길, "WEBP", quality=92, method=6)

        # 실측 — 모서리는 뚫려 있고(α=0) 중심은 차 있다(불투명). 조용한 흰 판 반입을 막는다.
        a = np.asarray(작게)[:, :, 3]
        모서리 = int(a[0, 0]) + int(a[0, -1]) + int(a[-1, 0]) + int(a[-1, -1])
        중심 = int(a[크기 // 2, 크기 // 2])
        assert 모서리 == 0, f"{이름}: 모서리 α {모서리} — 누끼가 아니다"
        assert 중심 > 200, f"{이름}: 중심 α {중심} — 몸이 비었다"
        kb = os.path.getsize(나갈길) / 1024
        print(f"  · {이름}.webp  {크기}px · {kb:.0f}KB · 모서리α 0 · 중심α {중심}")
        낱장들.append(작게)

    # 눈검수 시트 — 어두운 지면(앱 바탕 #080605)에 나란히. 라이트에 얹으면 알파 구멍이 안 보인다
    # (누끼 README 「구슬 하이라이트 114px 구멍」이 정확히 그렇게 숨었다).
    판 = Image.new("RGBA", (크기 * len(낱장들) + 40, 크기 + 40), (8, 6, 5, 255))
    for i, im in enumerate(낱장들):
        판.paste(im, (20 + i * 크기, 20), im)
    판.convert("RGB").save(SHEET, "PNG")
    print(f"  · 시트 → {os.path.relpath(SHEET, os.path.join(DST, '..', '..'))}")

if __name__ == "__main__":
    print(f"[마스코트변환] 정본 {SRC}")
    변환()
    print(f"[마스코트변환] {len(컷들)}벌 완료 → {os.path.relpath(DST)}")
