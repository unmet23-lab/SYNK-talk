# SYNK-talk — 작업 지침 진입점 (Codex · Kimi Code · OpenCode)

> **이 파일은 포인터다. 규칙 본문은 여기 없다.**
> `CLAUDE.md`와 이 파일은 **같은 곳을 가리킬 뿐** 내용을 복제하지 않는다 — 복제하면 정본이 갈라진다.

작업 시작 전 **반드시 이 둘을 읽는다**:

1. `docs/이_저장소_규약.md` — 이 저장소 고유 규칙(레인·데이터 원칙·절대 규칙 3가지)
2. `docs/공용지침.md` — SYNK 공용 작업 지침(역할·소통·판정·검증). **생성물이라 손으로 고치지 않는다.**

공용지침 본문에 나오는 `/deploy`·`/evolve`·훅 이름·`Skill` 도구는 **Claude Code 고유**다.
다른 도구에서는 그 조항을 「같은 목적을 사람이 수행한다」로 읽는다 — 규칙 자체는 벤더 무관이다.

---

## 읽기 전에도 어기면 안 되는 것

- **자격증명은 git 밖.** `.env`·키 파일은 `.gitignore`가 지킨다. 키를 코드에 박지 않는다.
- **커밋은 범위를 못 박는다**: `git commit -m "..." -- 경로들`. `git add -A`·`commit -a` 금지.
- **clone 후 1회**: `node tools/install-hooks.js` — 안 하면 커밋 가드가 안 돈다.
- 검사: `npm test`

`.githooks/pre-commit`이 위 규칙 중 기계로 잡을 수 있는 것을 차단한다. 막히면 우회하지 말고 메시지가 시키는 대로 고친다.

---

## GPT/코덱스 역할 (2026-09-04 · 유호 확정)

흐름 = 클로드 설계(발주서) → **GPT 실행자** 구현·시험 → **다른 세션의 GPT 검수자** 적대 검수 → 클로드 의미·통합 확인 → 유호님 운영 승인.
이 저장소에서 실행자를 부르는 도구는 SYNK-appsscript 쪽 `tools/codex-build.js --저장소 <이 저장소>` 이고, 검수자는 `tools/codex-review.js --저장소 <이 저장소> --commit <sha>` 다.

- 역할별 규칙 = SYNK-appsscript `AGENTS.md` §1(안 넘는 넷) · §3(기술 실행자) · §4(Code Review Rules). 사실·배경 = SYNK-appsscript `docs/GPT_정본.md`(도구가 역할마다 잘라 프롬프트에 싣는다). 여기 다시 적지 않는다.
- 이 저장소에서 더 지킬 것 = 위 «어기면 안 되는 것» + `docs/이_저장소_규약.md` §3 레인(스키마 레인 `supabase/migrations/` 은 한 번에 하나) · §4 데이터 원칙 · §5 디자인.
- ⚠ `docs/공용지침.md` 는 2026-08-03 판 사본(v6.12)이라 낡았다 — 규칙이 갈리면 SYNK-appsscript `CLAUDE.md`(v11.0 · 2026-09-02) 가 이긴다.
