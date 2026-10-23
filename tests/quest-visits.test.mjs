import test from 'node:test';
import assert from 'node:assert/strict';
import {taipeiDay, compactVisitTime, readVisitState, registerVisit} from '../src/lib/questVisits.mjs';

test('台灣換日，不使用裝置當地日期', () => {
  assert.equal(taipeiDay(new Date('2026-10-23T15:59:59Z')), '2026-10-23');
  assert.equal(taipeiDay(new Date('2026-10-23T16:00:00Z')), '2026-10-24');
});
test('登記時間顯示 MMDD HH:mm，含補零與台灣午夜', () => {
  assert.equal(compactVisitTime('2026-10-23T01:02:33Z'), '1023 09:02');
  assert.equal(compactVisitTime('2026-01-01T16:01:00Z'), '0102 00:01');
});
test('多人登記保留各自時間，重複人物不覆蓋原時間', () => {
  const first = registerVisit(readVisitState(null), ' TonyQ ', new Date('2026-10-23T01:00:00Z'));
  const second = registerVisit(first, '護士', new Date('2026-10-23T02:00:00Z'));
  assert.equal(second.visits.length, 2);
  assert.equal(second.doneAt, first.doneAt);
  assert.deepEqual(registerVisit(second, 'TonyQ'), second);
  assert.deepEqual(readVisitState(JSON.stringify(second)), second);
  assert.equal(second.visits[1].time, '2026-10-23T02:00:00.000Z');
});
test('空白人物與損壞紀錄不能默默寫回', () => {
  assert.throws(() => registerVisit(readVisitState(null), '  '));
  for (const raw of ['bad', '{}', 'null', '{"doneAt":null,"visits":[{"name":"a","time":"bad"}]}']) {
    assert.throws(() => readVisitState(raw));
  }
});
