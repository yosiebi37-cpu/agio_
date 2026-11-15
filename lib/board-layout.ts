/**
 * 予約ボード（日表示）で、同じスタッフの予約の時間が重なっているときに
 * カードが完全に重なって下のカードを押せなくならないよう、段（レーン）に分けて並べるための計算。
 *
 * 時間が重なる予約どうし（間接的に重なるものも含む）を1つのまとまりとし、
 * まとまりの中で上から空いている段に順に入れていく。
 * 重なりのない予約は lanes = 1 で、これまでどおり行の高さいっぱいに表示する。
 */
export interface LaneInput {
  id: string;
  /** 開始時刻（0時からの分） */
  start: number;
  /** 終了時刻（0時からの分） */
  end: number;
}

export interface LanePlacement {
  /** 何段目か（0 始まり） */
  lane: number;
  /** そのまとまりの段数 */
  lanes: number;
}

export function assignLanes(items: LaneInput[]): Map<string, LanePlacement> {
  const result = new Map<string, LanePlacement>();
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));

  let cluster: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const lanes = Math.max(1, laneEnds.length);
    for (const c of cluster) result.set(c.id, { lane: c.lane, lanes });
    cluster = [];
    laneEnds = [];
    clusterEnd = -Infinity;
  };

  for (const item of sorted) {
    // 終わった時刻ちょうどに始まる予約は重なりとみなさない
    if (cluster.length > 0 && item.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    cluster.push({ id: item.id, lane });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();
  return result;
}
