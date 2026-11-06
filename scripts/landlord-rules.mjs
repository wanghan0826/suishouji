// Cards 0–51 are ranks 3 through 2 (four suits each). 52 and 53 are jokers.
export const rankOf = card => Math.floor(card / 4) + (card === 53 ? 1 : 0);
const validCard = card => Number.isInteger(card) && card >= 0 && card <= 53;

function byRank(cards) {
  const ranks = Array.from({length: 15}, () => []);
  for (const card of cards) ranks[rankOf(card)].push(card);
  return ranks;
}

export function classify(cards) {
  if (!Array.isArray(cards) || !cards.length || cards.length > 20 ||
      !cards.every(validCard) || new Set(cards).size !== cards.length) return [];
  const ranks = byRank(cards);
  const used = ranks.map((group, rank) => group.length ? rank : -1).filter(rank => rank >= 0);
  const size = cards.length;
  const shapes = [];
  const add = (kind, high, length = 1) => shapes.push({kind, high, length, size});
  const high = used.at(-1);
  if (used.length === 1) {
    add(['','single','pair','triple','bomb'][size], high);
    return shapes;
  }
  if (size === 2 && high === 14 && used[0] === 13) {
    add('rocket', high);
    return shapes;
  }
  const consecutive = high < 12 && high - used[0] + 1 === used.length;
  if (consecutive && used.length >= 5 && used.length === size) add('straight', high, size);
  if (consecutive && used.length >= 3 && used.every(r => ranks[r].length === 2)) add('pairs', high, used.length);

  const triple = used.find(r => ranks[r].length === 3);
  if (used.length === 2 && triple !== undefined) {
    if (size === 4) add('tripleSingle', triple);
    if (size === 5) add('triplePair', triple);
  }
  const quad = used.find(r => ranks[r].length === 4);
  if (quad !== undefined) {
    const wings = used.filter(r => r !== quad);
    if (size === 6) add('fourSingles', quad);
    if (size === 8 && wings.length === 2 && wings.every(r => ranks[r].length === 2)) add('fourPairs', quad);
  }

  for (const [kind, divisor] of [['plane',3],['planeSingles',4],['planePairs',5]]) {
    const length = size / divisor;
    if (!Number.isInteger(length) || length < 2) continue;
    for (let end = 11; end >= length - 1; end--) {
      const start = end - length + 1;
      const core = used.filter(r => r >= start && r <= end && ranks[r].length === 3);
      if (core.length !== length) continue;
      const wings = used.filter(r => !core.includes(r));
      if (kind === 'planePairs' && (wings.length !== length || wings.some(r => ranks[r].length !== 2))) continue;
      // The two jokers together remain a rocket, including when picking wings.
      if (kind === 'planeSingles' && wings.includes(13) && wings.includes(14)) continue;
      add(kind, end, length);
    }
  }
  return shapes;
}

export function beats(play, previous) {
  if (!previous) return true;
  if (previous.kind === 'rocket') return false;
  if (play.kind === 'rocket') return true;
  if (play.kind === 'bomb' && previous.kind !== 'bomb') return true;
  return play.kind === previous.kind && play.size === previous.size &&
    play.length === previous.length && play.high > previous.high;
}

export function describePlay(cards, previous) {
  return classify(cards).find(shape => beats(shape, previous));
}

// Build legal shapes by rank, using low spare cards for attachments. This also
// finds responses without enumerating every subset of a twenty-card hand.
export function legalMoves(hand, previous = null) {
  const groups = byRank(hand);
  const moves = [];
  const seen = new Set();
  function add(cards) {
    const key = [...cards].sort((a,b) => a-b).join(',');
    if (seen.has(key)) return;
    seen.add(key);
    const shape = describePlay(cards, previous);
    if (shape) moves.push({cards, shape});
  }
  function attach(core, excluded, count, pairs) {
    const spare = groups.map((cards, rank) => ({cards, rank}))
      .filter(({cards, rank}) => !excluded.includes(rank) && cards.length >= (pairs ? 2 : 1))
      .sort((a,b) => a.cards.length - b.cards.length || a.rank - b.rank);
    if (pairs) {
      if (spare.length >= count) add([...core, ...spare.slice(0,count).flatMap(({cards}) => cards.slice(0,2))]);
      return;
    }
    // If both jokers would be used, try each individually with other ranks.
    for (const omit of [null, 13, 14]) {
      const wings = spare.filter(({rank}) => rank !== omit).flatMap(({cards}) => cards).slice(0,count);
      if (wings.length === count) add([...core, ...wings]);
    }
  }
  for (const [rank, cards] of groups.entries()) {
    for (let n = 1; n <= cards.length; n++) add(cards.slice(0,n));
    if (cards.length >= 3) {
      attach(cards.slice(0,3), [rank], 1, false);
      attach(cards.slice(0,3), [rank], 1, true);
    }
    if (cards.length === 4) {
      attach(cards, [rank], 2, false);
      attach(cards, [rank], 2, true);
    }
  }
  if (groups[13].length && groups[14].length) add([52,53]);
  for (const [copies, minimum] of [[1,5],[2,3],[3,2]]) {
    for (let start = 0; start < 12; start++) {
      const ranks = [];
      const core = [];
      for (let rank = start; rank < 12 && groups[rank].length >= copies; rank++) {
        ranks.push(rank);
        core.push(...groups[rank].slice(0,copies));
        if (ranks.length < minimum) continue;
        add([...core]);
        if (copies === 3) {
          attach(core, ranks, ranks.length, false);
          attach(core, ranks, ranks.length, true);
        }
      }
    }
  }
  const explosive = move => Number(['bomb','rocket'].includes(move.shape.kind));
  return moves.sort((a,b) => Number(b.cards.length === hand.length) - Number(a.cards.length === hand.length) ||
    explosive(a) - explosive(b) || b.cards.length - a.cards.length || a.shape.high - b.shape.high);
}
