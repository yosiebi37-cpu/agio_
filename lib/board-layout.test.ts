import { describe, expect, it } from 'vitest';
import { assignLanes } from './board-layout';

describe('assignLanes', () => {
  it('重なりのない予約は1段のまま', () => {
    const r = assignLanes([
      { id: 'a', start: 540, end: 600 },
      { id: 'b', start: 600, end: 660 },
    ]);
    expect(r.get('a')).toEqual({ lane: 0, lanes: 1 });
    expect(r.get('b')).toEqual({ lane: 0, lanes: 1 });
  });

  it('同じ時間の予約2件は2段に分ける', () => {
    const r = assignLanes([
      { id: 'a', start: 930, end: 990 },
      { id: 'b', start: 930, end: 990 },
    ]);
    expect(r.get('a')).toEqual({ lane: 0, lanes: 2 });
    expect(r.get('b')).toEqual({ lane: 1, lanes: 2 });
  });

  it('一部だけ重なる予約も分け、空いた段は使い回す', () => {
    const r = assignLanes([
      { id: 'a', start: 540, end: 660 },
      { id: 'b', start: 600, end: 720 },
      { id: 'c', start: 660, end: 700 },
      { id: 'd', start: 800, end: 860 },
    ]);
    expect(r.get('a')).toEqual({ lane: 0, lanes: 2 });
    expect(r.get('b')).toEqual({ lane: 1, lanes: 2 });
    expect(r.get('c')).toEqual({ lane: 0, lanes: 2 });
    expect(r.get('d')).toEqual({ lane: 0, lanes: 1 });
  });
});
