/* 전사대조 회귀 — 눈금이 죽으면 판정이 통째로 거짓이 된다(탐지력 픽스처 포함). */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { 정규화, 편집거리, CER, 대조, 판정, 표본경고 } = require('../tools/전사대조.js');

test('정규화 — NFC·부호 제거·공백 제거가 발음 동일문을 같게 만든다', () => {
  assert.equal(정규화('안녕하세요!'), 정규화('안녕 하세요'));
  assert.equal(정규화('한국어, 재밌어요.'), '한국어재밌어요');
  // NFC: 자모 분해형(ᄒᆞ…)과 완성형이 같아야 한다 — 기기별 전사가 분해형을 낼 수 있다
  assert.equal(정규화('한'), 정규화('한'));
});

test('편집거리 — 알려진 거리들(탐지력: 추출기가 죽으면 여기가 빨개진다)', () => {
  assert.equal(편집거리('', '학교'), 2);
  assert.equal(편집거리('학교', '학교'), 0);
  assert.equal(편집거리('학교에 갔다', '학교에 간다'), 1);
  assert.equal(편집거리('어제 학교에 갔다', '학교에 갔다'), 3);   // 「어제 」 삭제(공백 포함 원문 기준)
});

test('CER — 정답 길이 분모 · 빈 정답은 0 이 아니라 null(못 잼)', () => {
  assert.equal(CER('학교에 갔다', '학교에 갔다'), 0);
  assert.ok(Math.abs(CER('학교에 갔다', '학교에 간다') - 1 / 5) < 1e-9); // 공백 제거 후 5음절 중 1
  assert.equal(CER('', '무엇'), null);
});

test('판정 — 5%p 문턱과 표본 30 강등이 실제로 가른다', () => {
  assert.equal(판정(0.10, 0.06, 30).코드, 0);   // 차 4%p → 갈아탈 값
  assert.equal(판정(0.15, 0.06, 30).코드, 1);   // 차 9%p → 열세 초과
  assert.equal(판정(0.10, 0.06, 10).코드, 2);   // 표본 부족 → 참고
  assert.equal(판정(null, 0.06, 0).코드, 2);
});

test('대조 — 표본에 대본이 없으면 죽는다(기준 진실 없는 판정 차단)', () => {
  assert.throws(() => 대조([{ id: 'x', 온디바이스: 'ㄱ', 클라우드: 'ㄴ' }]), /대본이 없다/);
  const r = 대조([{ id: 's1', 대본: '학교에 갔다', 온디바이스: '학교에 갔다', 클라우드: '학교에 간다' }]);
  assert.equal(r.온평균, 0);
  assert.ok(r.클평균 > 0);
});

test('표본경고 — 클라우드 기준선이 무너진 표본을 잡는다(무너진 표본의 판정은 차이를 지운다)', () => {
  assert.equal(표본경고(0.10), null);
  assert.match(표본경고(0.30), /표본 의심/);
  assert.equal(표본경고(null), null);
});

test('뼈대 재료 — 대본이 30문장·id 유일·급소 실림(판정 규약 «표본 30»과 한 벌)', () => {
  const fs2 = require('node:fs');
  const path2 = require('node:path');
  const 대본 = JSON.parse(fs2.readFileSync(path2.join(__dirname, '..', 'docs', '전사대조_대본_v1.json'), 'utf8'));
  assert.equal(대본.문장.length, 30, '대본이 30문장이 아니다');
  assert.equal(new Set(대본.문장.map((s) => s.id)).size, 30, '대본 id 가 겹친다');
  for (const s of 대본.문장) assert.ok(s.대본 && s.급소, `${s.id} 에 대본/급소가 없다`);
});
