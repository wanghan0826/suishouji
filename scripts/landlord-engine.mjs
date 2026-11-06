import {randomInt} from 'node:crypto';
import {describePlay, legalMoves, rankOf} from './landlord-rules.mjs';

export const gameError = (status, message) => Object.assign(new Error(message), {status});
const nextSeat = seat => (seat + 1) % 3;
export const humanSeat = (id, name) => ({id, name, bot:false, away:false, score:0});
export const seatOf = (room, id) => room.seats.findIndex(seat => seat?.id === id && !seat.away);
const automatic = seat => seat.bot || seat.away;
const sorted = cards => cards.sort((a,b) => a-b);

export function newRoom(user) {
  return {host:user.id, seats:[humanSeat(user.id,user.username),null,null], phase:'lobby', version:1, round:0, deadline:0};
}

function clockTurn(room, seat, now) {
  room.turn = seat;
  room.deadline = now + (room.phase === 'bidding' ? 20000 : 30000);
  room.botAt = now + 1000;
}

export function deal(room, now, {redeal = false, start = randomInt(3)} = {}) {
  const deck = Array.from({length:54}, (_,i) => i);
  for (let i = deck.length-1; i > 0; i--) {
    const j = randomInt(i+1);
    [deck[i],deck[j]] = [deck[j],deck[i]];
  }
  Object.assign(room, {
    phase:'bidding', round:room.round + Number(!redeal), redeal,
    hands:room.seats.map((_, i) => sorted(deck.slice(i*17, i*17+17))),
    bottom:sorted(deck.slice(51)), bids:[null,null,null], bid:0, bidder:null,
    landlord:null, tablePlay:null, actions:[null,null,null], passes:0, plays:[0,0,0],
    bombs:0, multiplier:1, result:null
  });
  clockTurn(room,start,now);
}

function bid(room, seat, score, now) {
  if (!Number.isInteger(score) || score < 0 || score > 3 || (score && score <= room.bid)) {
    throw gameError(400,'请选择不叫，或叫出更高的分数。');
  }
  room.bids[seat] = score;
  if (score) {
    room.bid = score;
    room.bidder = seat;
  }
  if (score !== 3 && room.bids.some(value => value === null)) {
    clockTurn(room,nextSeat(seat),now);
    return;
  }
  if (room.bidder === null) {
    deal(room, now, {redeal:true, start:(seat+2)%3});
    return;
  }
  room.landlord = room.bidder;
  room.hands[room.landlord] = sorted([...room.hands[room.landlord], ...room.bottom]);
  room.phase = 'playing';
  clockTurn(room,room.landlord,now);
}

function finish(room, seat) {
  const landlordWon = seat === room.landlord;
  const spring = landlordWon
    ? room.plays.every((count,i) => i === room.landlord || count === 0)
    : room.plays[room.landlord] === 1;
  if (spring) room.multiplier *= 2;
  const points = room.bid * room.multiplier;
  const scores = room.seats.map((player,i) => {
    const landlord = i === room.landlord;
    const delta = (landlord === landlordWon ? 1 : -1) * (landlord ? 2 : 1) * points;
    player.score += delta;
    return delta;
  });
  room.result = {landlordWon, spring, seat, scores};
  room.phase = 'result';
  room.deadline = 0;
}

export function act(room, seat, action, input, now) {
  if (!['bidding','playing'].includes(room.phase) || room.turn !== seat) throw gameError(409,'还没轮到你操作。');
  if (room.phase === 'bidding') {
    if (action !== 'bid') throw gameError(409,'当前正在叫分。');
    bid(room,seat,input.score,now);
    return;
  }
  if (action === 'pass') {
    if (!room.tablePlay) throw gameError(400,'这轮由你领出，请先出牌。');
    room.actions[seat] = {pass:true};
    room.passes++;
    if (room.passes === 2) {
      const leader = room.tablePlay.seat;
      room.tablePlay = null;
      room.actions = [null,null,null];
      room.passes = 0;
      clockTurn(room,leader,now);
    } else clockTurn(room,nextSeat(seat),now);
    return;
  }
  if (action !== 'play') throw gameError(409,'当前正在出牌。');
  const cards = input.cards;
  if (!Array.isArray(cards) || !cards.length || cards.length > 20 ||
      !cards.every(card => room.hands[seat].includes(card))) throw gameError(400,'请从自己的手牌里选牌。');
  const shape = describePlay(cards, room.tablePlay?.shape);
  if (!shape) throw gameError(400,'这组牌不符合牌型，或压不过上一手。');
  room.hands[seat] = room.hands[seat].filter(card => !cards.includes(card));
  room.tablePlay = {seat, cards:sorted([...cards]), shape};
  room.actions[seat] = room.tablePlay;
  room.passes = 0;
  room.plays[seat]++;
  if (shape.kind === 'bomb' || shape.kind === 'rocket') {
    room.bombs++;
    room.multiplier *= 2;
  }
  if (!room.hands[seat].length) finish(room,seat);
  else clockTurn(room,nextSeat(seat),now);
}

export function dueAt(room) {
  if (!['bidding','playing'].includes(room.phase)) return 0;
  return automatic(room.seats[room.turn]) ? Math.min(room.botAt,room.deadline) : room.deadline;
}

export function advanceTurn(room, now) {
  const due = dueAt(room);
  if (!due || due > now) return false;
  const seat = room.turn;
  const bot = automatic(room.seats[seat]);
  const hand = room.hands[seat];
  if (room.phase === 'bidding') {
    const power = hand.reduce((points, card) => points + Math.max(0,rankOf(card)-10),0);
    const offer = power >= 14 ? 3 : power >= 10 ? 2 : power >= 6 ? 1 : 0;
    act(room,seat,'bid',{score:bot && offer > room.bid ? offer : 0},now);
    return true;
  }
  const candidates = bot ? legalMoves(hand,room.tablePlay?.shape) : [];
  const teammateLeading = room.tablePlay && seat !== room.landlord && room.tablePlay.seat !== room.landlord;
  const finishNow = candidates.find(move => move.cards.length === hand.length);
  const move = finishNow || (!teammateLeading && candidates[0]);
  if (move) act(room,seat,'play',{cards:move.cards},now);
  else if (room.tablePlay) act(room,seat,'pass',{},now);
  else act(room,seat,'play',{cards:[hand[0]]},now);
  return true;
}

export function viewRoom(room, id, token, now) {
  const me = seatOf(room,id);
  const host = room.seats.find(seat => seat?.id === room.host);
  if (me < 0) {
    const canJoin = room.phase !== 'closed' &&
      (room.seats.some(seat => seat?.id === id && seat.away) || (room.phase === 'lobby' && room.seats.includes(null)));
    return {preview:{token, phase:room.phase, host:host?.name || '朋友', count:room.seats.filter(Boolean).length, canJoin}};
  }
  const playing = room.phase === 'playing';
  const myTurn = room.turn === me;
  const hand = room.phase === 'closed' ? [] : room.hands?.[me] || [];
  return {room:{
    token, me, version:room.version, phase:room.phase, round:room.round, isHost:id === room.host,
    seats:room.seats.map((seat,i) => seat && {name:seat.name, bot:seat.bot, away:seat.away, score:seat.score, count:room.hands?.[i].length || 0}),
    hand, turn:room.turn, deadline:room.deadline, now, redeal:room.redeal,
    bid:room.bid || 0, bids:room.bids || [], landlord:room.landlord ?? null,
    bottom:room.landlord != null && room.phase !== 'closed' ? room.bottom : [],
    actions:room.actions || [], tablePlay:room.tablePlay, bombs:room.bombs || 0, multiplier:room.multiplier || 1,
    canPass:playing && myTurn && !!room.tablePlay,
    suggestions:playing && myTurn ? legalMoves(hand,room.tablePlay?.shape).slice(0,18).map(move => move.cards) : [],
    result:room.result
  }};
}
