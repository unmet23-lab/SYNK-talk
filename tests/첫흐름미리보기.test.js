'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { 마스코트빌드일치 } = require('../tools/첫흐름미리보기.js');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'synk-preview-assets-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'dist');
  const source = path.join(root, 'assets', '마스코트');
  const output = path.join(dir, 'assets', 'assets', '마스코트');
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), '<script src="/bundle.js"></script>');
  fs.writeFileSync(path.join(source, '몽글_본체.webp'), 'current-image');
  fs.writeFileSync(path.join(output, '몽글_본체.current.webp'), 'current-image');
  const uri = '/assets/assets/마스코트/몽글_본체.current.webp';
  // 실제 Metro처럼 한국어 경로가 유니코드 이스케이프로 출력된 경우도 읽는다.
  const escaped = uri.replace(/[^\x00-\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  fs.writeFileSync(path.join(dir, 'bundle.js'), `module.exports={uri:"${escaped}"}`);
  return { root, dir, source, output, check: () => 마스코트빌드일치(root, dir, ['몽글_본체']) };
}

test('미리보기 — 현재 번들이 참조하는 그림의 내용이 원본과 같으면 재사용한다', (t) => {
  assert.equal(fixture(t).check(), true);
});

test('미리보기 — 원본만 바뀌면 기존 파일명이 남아 있어도 재생성이 필요하다', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.source, '몽글_본체.webp'), 'corrected-image');
  assert.equal(f.check(), false);
});

test('미리보기 — 새 그림이 폴더에 남아 있어도 번들이 구 그림을 참조하면 거른다', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.output, '몽글_본체.old.webp'), 'old-image');
  fs.writeFileSync(path.join(f.dir, 'bundle.js'), 'module.exports={uri:"/assets/assets/마스코트/몽글_본체.old.webp"}');
  assert.equal(f.check(), false);
});

test('미리보기 — 참조된 그림이 없거나 손상되면 재생성이 필요하다', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.output, '몽글_본체.current.webp'), 'damaged-image');
  assert.equal(f.check(), false);
  fs.unlinkSync(path.join(f.dir, 'bundle.js'));
  assert.equal(f.check(), false);
});

test('미리보기 — 현행 경로 문자열이 있어도 실제 uri가 구 그림이면 거른다', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.output, '몽글_본체.old.webp'), 'old-image');
  fs.writeFileSync(path.join(f.dir, 'bundle.js'), 'const unused="/assets/assets/마스코트/몽글_본체.current.webp"; module.exports={uri:"/assets/assets/마스코트/몽글_본체.old.webp"}');
  assert.equal(f.check(), false);
});

test('미리보기 — 한 컷의 현행 참조와 구 참조가 함께 있으면 거른다', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.output, '몽글_본체.old.webp'), 'old-image');
  fs.appendFileSync(path.join(f.dir, 'bundle.js'), '; other={uri:"/assets/assets/마스코트/몽글_본체.old.webp"}');
  assert.equal(f.check(), false);
});
