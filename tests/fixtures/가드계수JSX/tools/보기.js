import React from 'react';
const source = require('node:fs').readFileSync('fixture.js', 'utf8');
// JSX가 있다고 이 존재 단언을 분모에서 빼면 안 된다.
assert.ok(source.includes('살아야함'));
export default function 보기() { return <main>{source}</main>; }
