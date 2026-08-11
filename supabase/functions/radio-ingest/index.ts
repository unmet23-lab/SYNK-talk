/* 라디오 인제스트 — VPS 수집봇이 원장에 닿는 **유일한 문**. (라디오24_설계 §4-3 · §5-P0)
 *
 * ■ 왜 봇이 DB 를 직접 안 쓰나
 *   봇은 24/7 도는 외부 호스트에 산다 — 거기 놓인 비밀은 언젠가 샌다고 보는 것이 기본값이다.
 *   `service_role` 을 들려 보내면 그 하나로 **운영 DB 전체**(engine.learners·learning_events
 *   ·consents)가 열린다. 그래서 봇이 드는 것은 이 함수 하나만 여는 **좁은 시크릿**이고,
 *   service_role 은 이 함수 안에만 산다(설계 §4-3 「봇은 원장 전달자일 뿐」).
 *
 * ■ 🔴 두 겹인 이유 — `verify_jwt` 는 이 문의 자물쇠가 아니다
 *   플랫폼 검증(`원격배포.js` 가 전 함수에 `verify_jwt: true`)은 **anon 키로도 통과한다**
 *   (`lib/토큰.js` 머리말 — anon 키도 유효한 JWT 다). anon 키는 앱 번들에 인라인돼 공개물이라
 *   그것만으로 열리면 **아무나 원장에 쓴다.** 판정은 `RADIO_INGEST_SECRET` 하나가 진다.
 *   🔴 시크릿이 **미설정이면 503 이다 — 401 도 200 도 아니다.** 없는 자물쇠를 「통과」로 읽으면
 *   설정을 빠뜨린 날 문이 통째로 열리고, 증상은 아무 데도 안 남는다(새는 방향은 언제나 통과).
 *
 * ■ 파생 두 칸(`command_kind`·`command_arg`)은 **여기서만** 만든다
 *   봇이 파싱해 보내면 봇의 파서판과 원장에 박히는 `parser_ver` 가 갈라진다 — 그리고 갈라진
 *   원장은 「재파싱하면 된다」처럼 보여서 아무도 안 본다. 파서 정본은 `lib/라디오채팅파서.js`
 *   하나이고 동봉으로 그대로 실린다(사본 금지 · `lib/사건출처.js` 와 같은 형태).
 *
 * ■ 멱등은 DB 가 진다
 *   `message_id` 가 PK 다(= YouTube 메시지 id). 봇이 재시작하며 같은 창을 다시 읽어도
 *   `on conflict do nothing` 이 흡수한다 — 재전송을 **정상 동작으로** 설계한 자리라
 *   봇 쪽에 「어디까지 보냈나」 상태를 안 만든다(그 상태가 곧 유실 지점이 된다).
 *
 * ■ 이 함수는 승격을 **안 한다**
 *   `learning_events` 로 가는 길은 c10 게이트 뒤의 승격기 몫이다(§4-3 · Lane B). 여기서
 *   같이 하면 오귀속이 불변 테이블에 굳는다 — 원장은 되파싱이 되고 승격은 안 된다.
 */
import postgres from 'npm:postgres@3.4.4';
import 파서모듈 from './라디오파서.mjs';

const { 파서판, 파싱 } = 파서모듈 as {
  파서판: string;
  파싱: (body: unknown) => { command_kind: string | null; command_arg: string | null };
};

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

/* 한 번에 받는 상한. 60초 폴링 한 창의 실제 채팅량보다 넉넉하되, 넘으면 **거절이 아니라
 * 앞에서부터 자른다** — 자른 뒤는 다음 폴링이 같은 창을 다시 읽어 멱등으로 흡수한다. */
const 최대건 = 500;

function 봉투(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** 길이를 먼저 흘리지 않는 비교 — 시크릿 비교의 기본형. */
function 같은비밀(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let 다름 = 0;
  for (let i = 0; i < a.length; i += 1) 다름 |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return 다름 === 0;
}

type 들어온행 = {
  message_id?: unknown; channel_id?: unknown; display_name?: unknown;
  body?: unknown; sent_at?: unknown; raw?: unknown;
};

/** 원장에 설 수 있는 모양인가 — NOT NULL 칸이 하나라도 비면 그 건만 버린다(분모에 센다). */
function 정리(r: 들어온행) {
  const s = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);
  const message_id = s(r.message_id), channel_id = s(r.channel_id);
  const display_name = s(r.display_name), body = s(r.body), sent_at = s(r.sent_at);
  if (!message_id || !channel_id || !display_name || !body || !sent_at) return null;
  const t = Date.parse(sent_at);
  if (!Number.isFinite(t)) return null;           // 시각을 못 읽으면 구간 조인이 통째로 어긋난다
  return { message_id, channel_id, display_name, body, sent_at, raw: r.raw ?? {} };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return 봉투(405, { error: 'method_not_allowed' });

  const 비밀 = Deno.env.get('RADIO_INGEST_SECRET') ?? '';
  if (!비밀) {
    /* 우리 설정 문제다 — 봇에게 「네 키가 틀렸다」고 말하면 봇이 키를 바꾸려 들고, 그 사이
     * 수집은 계속 0 이다. 원인을 그대로 부른다(`transcribe` 의 키 미설정 처리와 같은 축). */
    console.error('[radio-ingest] RADIO_INGEST_SECRET 미설정 — 문을 열지 않는다');
    return 봉투(503, { error: 'ingest_secret_unset' });
  }
  const 들고온 = req.headers.get('x-radio-ingest-key') ?? '';
  if (!같은비밀(들고온, 비밀)) return 봉투(401, { error: 'unauthorized' });

  let 몸: Record<string, unknown>;
  try { 몸 = await req.json(); } catch { return 봉투(400, { error: 'bad_json' }); }

  const 원본목록 = Array.isArray(몸.messages) ? (몸.messages as 들어온행[]) : [];
  const 받은 = 원본목록.length;
  if (받은 > 최대건) 원본목록.length = 최대건;

  /* 맥박의 `messages_seen` 은 **봇이 본 전량**이다 — 원장에 몇 줄 늘었나와 다른 숫자다.
   * 봇이 안 보내면 그 폴링에 대해 우리가 아는 수가 없으니, 안 주면 우리가 받은 수로 대신한다. */
  const 본수 = Number.isFinite(Number(몸.messages_seen)) ? Math.trunc(Number(몸.messages_seen)) : 받은;
  const video_id = typeof 몸.video_id === 'string' && 몸.video_id ? 몸.video_id : null;
  const 시청자 = Number.isFinite(Number(몸.concurrent_viewers)) ? Math.trunc(Number(몸.concurrent_viewers)) : null;
  const polled_at = typeof 몸.polled_at === 'string' && Number.isFinite(Date.parse(몸.polled_at))
    ? 몸.polled_at : new Date().toISOString();

  /* 계약판은 DB 에게 묻는다 — 함수가 DB 보다 앞설 수 없게(`events`·`deliver` 와 같은 근거).
   * 0행 가드(반박 ⑮ 동축) — 빈 이력에서 구조분해가 TypeError 로 죽으면 이유가 로그에 안 남는다. */
  const 판행 = await sql`
    select name as 최신조각 from engine.schema_migrations order by version desc limit 1`;
  const ver = 판행.length ? String(판행[0].최신조각 ?? '').match(/_(c\d+)\.sql$/)?.[1] : undefined;
  if (!ver) {
    console.error('[radio-ingest] DB 계약판을 못 읽었다', 판행.length ? 판행[0].최신조각 : '(이력 0행)');
    return 봉투(500, { error: 'server_error' });
  }

  const 행들: Array<Record<string, unknown>> = [];
  let 결측 = 0;
  for (const r of 원본목록) {
    const c = 정리(r);
    if (!c) { 결측 += 1; continue; }
    const { command_kind, command_arg } = 파싱(c.body);
    행들.push({
      message_id: c.message_id, channel_id: c.channel_id, display_name: c.display_name,
      body: c.body, raw: c.raw, sent_at: c.sent_at,
      command_kind, command_arg, parser_ver: 파서판, schema_ver: ver,
    });
  }

  let 새로 = 0;
  if (행들.length) {
    /* `on conflict do nothing` — 재전송이 정상 동작이다. 돌아온 행 수가 **실제로 늘어난 수**라
     * 「받았다」와 「남았다」를 응답에서 가를 수 있다(분모 명시 · F207). */
    const 결과 = await sql`
      insert into radio.chat_message ${sql(
        행들 as unknown as Record<string, never>[],
        'message_id', 'channel_id', 'display_name', 'body', 'raw',
        'sent_at', 'command_kind', 'command_arg', 'parser_ver', 'schema_ver',
      )}
      on conflict (message_id) do nothing
      returning message_id`;
    새로 = 결과.length;
  }

  /* 맥박은 **행이 0건이어도 남는다** — 그것이 이 표의 존재 이유다(조용한 구간 ≠ 죽은 구간). */
  await sql`
    insert into radio.ingest_heartbeat (polled_at, video_id, messages_seen, concurrent_viewers, schema_ver)
    values (${polled_at}::timestamptz, ${video_id}, ${본수}, ${시청자}, ${ver})`;

  return 봉투(200, {
    ok: true,
    받은, 저장: 행들.length, 새로, 중복: 행들.length - 새로, 결측,
    잘림: 받은 > 최대건 ? 받은 - 최대건 : 0,
    parser_ver: 파서판, schema_ver: ver,
  });
});
