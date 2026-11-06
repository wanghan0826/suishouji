(() => {
  const $ = id => document.getElementById(id);
  const route = /^\/landlord\/([a-f0-9]{32})\/?$/;
  const roomId = /^[a-f0-9]{32}$/;
  const $auth = window.SJAuth;
  const phases = {lobby:'等待入座', bidding:'叫分', playing:'出牌', result:'结算', closed:'已结束'};
  const shapes = {
    single:'单牌',pair:'对子',triple:'三张',tripleSingle:'三带单',triplePair:'三带对',
    straight:'顺子',pairs:'连对',plane:'飞机',planeSingles:'飞机带单',planePairs:'飞机带对',
    fourSingles:'四带二',fourPairs:'四带两对',bomb:'炸弹',rocket:'王炸'
  };
  const ranks = ['3','4','5','6','7','8','9','10','J','Q','K','A','2'];
  const suits = ['♠','♥','♣','♦'];
  const suitNames = ['黑桃','红桃','梅花','方片'];
  let token = route.exec(location.pathname)?.[1] || '';
  let room = null;
  let preview = null;
  let account;
  let epoch = 0;
  let writes = 0;
  let busy = false;
  let polling = false;
  let pendingCreate = null;
  let disconnected = false;
  let clockOffset = 0;
  let hint = 0;
  const selected = new Set();

  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  const exitFullscreen = window.SJLandscape.bind($('llFullscreen'),({active,unavailable}) => {
    $('llFullscreen').textContent = active ? '退出全屏' : '⛶ 全屏';
    $('llRotate').textContent = unavailable ? '浏览器暂时无法隐藏工具栏，牌桌仍可横向使用。' : '';
  });

  function storedRoom(value) {
    if (!account) return '';
    const key = 'sj-landlord-room:' + account;
    try {
      if (value === '') localStorage.removeItem(key);
      else if (value) localStorage.setItem(key,value);
      const stored = localStorage.getItem(key);
      return roomId.test(stored || '') ? stored : '';
    } catch { return ''; }
  }

  function message(text = '') { $('llError').textContent = text; }

  async function api(path, data) {
    const at = epoch;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(),9500);
    try {
      const response = await fetch('/api/landlord' + path,{
        credentials:'same-origin', cache:'no-store', signal:controller.signal,
        ...(data === undefined ? {} : {
          method:'POST', headers:{'Content-Type':'application/json','X-SJ-CSRF':$auth.csrf}, body:JSON.stringify(data)
        })
      });
      const value = await response.json();
      if (at !== epoch) throw new DOMException('Room changed','AbortError');
      if (!response.ok) throw Object.assign(new Error(value.error || '牌桌暂时无法同步。'),{status:response.status});
      return value;
    } finally {
      clearTimeout(timeout);
    }
  }

  function reset() {
    epoch++;
    room = preview = null;
    selected.clear();
    busy = polling = false;
    pendingCreate = null;
    disconnected = false;
    $('llShareDialog').close();
    $('llShareLink').value = '';
    for (const id of ['llHand','llLeft','llRight','llLast','llBottom','llSeats','llScores','llControls']) $(id).replaceChildren();
    message();
  }

  function navigate(id, push = true) {
    reset();
    token = id;
    if (push) history.pushState(null,'',id ? '/landlord/'+id : '/landlord');
    if (!id) exitFullscreen();
    render();
    if (id) refresh();
  }

  function accept(value) {
    if (room && value.room?.version < room.version) return;
    if (value.room?.version === room?.version && value.room && !preview) {
      clockOffset = Date.now()-value.room.now;
      return;
    }
    room = value.room || null;
    preview = value.preview || null;
    if (room) {
      clockOffset = Date.now()-room.now;
      if (room.phase === 'closed') storedRoom('');
      else storedRoom(token);
    }
    selected.clear();
    hint = 0;
    render();
  }

  async function refresh() {
    if (!account || !token || busy || polling) return;
    const at = epoch;
    const write = writes;
    polling = true;
    try {
      const value = await api('/'+token);
      if (at === epoch && write === writes) {
        if (disconnected) { disconnected = false; message(); }
        accept(value);
      }
    } catch (error) {
      if (at !== epoch || write !== writes) return;
      if (error.status === 401) await $auth.refresh();
      else if ([404,410].includes(error.status)) {
        if (storedRoom() === token) storedRoom('');
        navigate('');
        message(error.message);
      } else {
        disconnected = true;
        message('同步暂时中断，正在重连。');
      }
    } finally {
      if (at === epoch) polling = false;
    }
  }

  function authenticate(purpose, resume) {
    if (account) return true;
    $auth.open({purpose,resume});
    return false;
  }

  async function operate(action, data = {}) {
    if (busy || !authenticate('登录后加入斗地主牌室。', () => operate(action,data))) return;
    busy = true;
    writes++;
    setControls();
    message();
    const at = epoch;
    const creating = action === 'create';
    let opId = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2,'0')).join('');
    if (creating) {
      const solo = data.solo === true;
      if (pendingCreate?.solo === solo) opId = pendingCreate.opId;
      else pendingCreate = {solo,opId};
    }
    try {
      const result = await api(creating ? '' : '/'+token+'/'+action, {...data,version:room?.version,opId});
      if (at !== epoch) return;
      if (creating) {
        pendingCreate = null;
        token = (result.room || result.preview).token;
        history.pushState(null,'','/landlord/'+token);
      }
      if (action === 'leave') {
        storedRoom('');
        navigate('');
      } else accept(result);
    } catch (error) {
      if (at !== epoch) return;
      if (creating && error.status && error.status < 500) pendingCreate = null;
      message(error.status ? error.message : '连接超时，请等牌桌同步后再试。');
      if (error.status === 401) await $auth.refresh();
    } finally {
      if (at === epoch) {
        busy = false;
        setControls();
        if (!creating && token) refresh();
      }
    }
  }

  function card(value, interactive = false) {
    if (value === null) return node('span','ll-card ll-card-back');
    const joker = value >= 52;
    const suit = value % 4;
    const red = value === 53 || (!joker && (suit === 1 || suit === 3));
    const face = node(interactive ? 'button' : 'span','ll-card'+(red ? ' is-red' : '')+(joker ? ' is-joker' : ''));
    const rank = joker ? (red ? '大王' : '小王') : ranks[Math.floor(value/4)];
    face.append(node('strong','',rank),node('span','',joker ? '✦' : suits[suit]));
    if (interactive) {
      face.type = 'button';
      face.dataset.card = value;
      face.setAttribute('aria-label',joker ? rank : suitNames[suit]+rank);
      face.addEventListener('click',() => {
        if (selected.has(value)) selected.delete(value);
        else selected.add(value);
        setControls();
      });
    }
    return face;
  }

  function opponent(el, index) {
    const player = room.seats[index];
    const active = room.turn === index;
    el.classList.toggle('is-turn',active);
    el.replaceChildren(
      node('span','ll-seat-mark',index === room.landlord ? '地主' : room.landlord === null ? '牌友' : '农民'),
      node('strong','',player.name),
      node('small','',player.count+' 张 · '+player.score+' 分'),
      node('span','ll-seat-action',room.phase === 'bidding' ?
        (room.bids[index] === null ? (active ? '叫分中' : '等待') : room.bids[index] ? '叫 '+room.bids[index]+' 分' : '不叫') :
        active ? '出牌中' : room.actions[index]?.pass ? '不出' : player.bot || player.away ? '托管' : '')
    );
  }

  function action(label, callback, style = '') {
    const button = node('button',style,label);
    button.type = 'button';
    button.addEventListener('click',callback);
    return button;
  }

  function showHint() {
    if (!room.suggestions.length) {
      message('没有能压过上一手的牌。');
      return;
    }
    selected.clear();
    for (const value of room.suggestions[hint++ % room.suggestions.length]) selected.add(value);
    message();
    setControls();
  }

  function setControls() {
    for (const id of ['llCreate','llSolo','llStart','llNext','llLeave','llResultLeave']) $(id).disabled = busy;
    $('llJoin').disabled = busy || (account && !preview?.canJoin);
    const playing = room?.phase === 'playing' && room.turn === room.me;
    for (const button of $('llHand').children) {
      button.disabled = busy || !playing;
      button.setAttribute('aria-pressed',String(selected.has(Number(button.dataset.card))));
    }
    for (const button of $('llControls').children) {
      button.disabled = busy || (button.id === 'llPlay' && !selected.size);
    }
  }

  function renderTable() {
    const {me,turn,phase,tablePlay} = room;
    const bidding = phase === 'bidding';
    opponent($('llLeft'),(me+2)%3);
    opponent($('llRight'),(me+1)%3);
    $('llBottom').replaceChildren(...(room.bottom.length ? room.bottom : [null,null,null]).map(value => card(value)));
    $('llLast').replaceChildren(...(tablePlay?.cards || []).map(value => card(value)));
    $('llLast').style.setProperty('--played-count',tablePlay?.cards.length || 1);
    $('llLastTitle').textContent = tablePlay
      ? room.seats[tablePlay.seat].name + ' · ' + shapes[tablePlay.shape.kind]
      : bidding ? room.redeal ? '三家都不叫，已重新发牌' : '叫 3 分直接成为地主' : '新一轮 · 领出任意合法牌型';
    $('llClockLabel').textContent = bidding ? '叫分' : '出牌';
    const myTurn = turn === me;
    $('llTurnStatus').textContent = myTurn ? (bidding ? '轮到你叫分' : '轮到你出牌') : '等 '+room.seats[turn].name+(bidding?' 叫分':' 出牌');
    $('llSelf').textContent = room.seats[me].name + ' · ' + (room.landlord === null ? '待定' : room.landlord === me ? '地主' : '农民') + ' · ' + room.hand.length + ' 张';
    $('llMultiplier').textContent = (room.bid ? '底分 '+room.bid+' · ' : '') + '×'+room.multiplier;
    $('llHand').style.setProperty('--card-count',room.hand.length);
    $('llHand').replaceChildren(...room.hand.map(value => card(value,true)));
    const buttons = [];
    if (myTurn && bidding) {
      buttons.push(action('不叫',() => operate('bid',{score:0})));
      for (let score = room.bid+1; score <= 3; score++) {
        buttons.push(action(score+' 分',() => operate('bid',{score}),score === 3 ? 'll-primary' : ''));
      }
    } else if (myTurn) {
      buttons.push(action('提示',showHint));
      if (room.canPass) buttons.push(action('不出',() => operate('pass')));
      const play = action('出牌',() => operate('play',{cards:[...selected]}),'ll-primary');
      play.id = 'llPlay';
      buttons.push(play);
    }
    $('llControls').replaceChildren(...buttons);
    tick();
  }

  function renderResult() {
    const {result, seats, landlord, bid, multiplier, bombs} = room;
    $('llWin').textContent = result.landlordWon ? '地主赢了' : '农民赢了';
    $('llScoreInfo').textContent = '底分 '+bid+' × '+multiplier+' 倍 · '+bombs+' 次炸弹或王炸' +
      (result.spring ? result.landlordWon ? ' · 春天' : ' · 反春' : '');
    $('llScores').replaceChildren(...seats.map((player,i) => {
      const delta = result.scores[i];
      const row = node('li');
      row.append(node('span','',player.name+' · '+(i === landlord ? '地主' : '农民')),
        node('b',delta > 0 ? 'is-positive' : '',(delta > 0 ? '+' : '')+delta+' 分'),
        node('small','', '总分 '+player.score));
      return row;
    }));
    $('llNext').hidden = !room.isHost;
    $('llNextWait').textContent = room.isHost ? '' : '等待房主开始下一局。';
  }

  function render() {
    const phase = room?.phase;
    const panel = phase === 'lobby' ? 'llLobby' : phase === 'result' ? 'llResult' : phase === 'closed' ? 'llClosed'
      : phase ? 'llTable' : token ? 'llPreview' : 'llHome';
    for (const id of ['llLobby','llResult','llClosed','llTable','llPreview','llHome']) $(id).hidden = id !== panel;
    document.body.classList.toggle('ll-in-room',!!token);
    $('llRound').textContent = phase && phase !== 'lobby' && phase !== 'closed' ? '第 '+room.round+' 局 · '+phases[phase] : '经典斗地主';
    $('llBack').href = token ? '/landlord' : '/games';
    $('llBack').textContent = token ? '← 斗地主' : '← 游戏大厅';
    $('llShare').hidden = phase !== 'lobby';
    if (panel === 'llHome') {
      const recent = storedRoom();
      $('llResume').hidden = !recent;
      if (recent) $('llResume').href = '/landlord/'+recent;
    } else if (panel === 'llPreview') {
      $('llInviteInfo').textContent = preview
        ? preview.host+' 的牌室 · '+preview.count+'/3 人 · '+phases[preview.phase]
        : account ? '正在连接牌室…' : '先登录，再加入朋友的牌室。';
      $('llJoin').textContent = account ? '加入牌室' : '登录后加入';
    } else if (panel === 'llLobby') {
      $('llSeats').replaceChildren(...room.seats.map((p,i) => node('li','',p ? p.name : '等待牌友 · 座位 '+(i+1))));
      $('llStart').hidden = !room.isHost;
      $('llWaiting').textContent = room.isHost ? '' : '等待房主开始。';
    } else if (panel === 'llTable') renderTable();
    else if (panel === 'llResult') renderResult();
    setControls();
  }

  function tick() {
    if (!room?.deadline) return;
    const seconds = Math.max(0, Math.ceil((room.deadline - Date.now() + clockOffset)/1000));
    $('llTimer').textContent = String(seconds).padStart(2,'0');
  }

  $('llCreate').onclick = () => operate('create');
  $('llSolo').onclick = () => operate('create',{solo:true});
  $('llJoin').onclick = () => {
    if (authenticate('登录后加入朋友的牌室。',refresh) && preview?.canJoin) operate('join');
  };
  $('llStart').onclick = () => operate('start');
  $('llNext').onclick = () => operate('next');
  $('llLeave').onclick = $('llResultLeave').onclick = () => operate('leave');
  $('llBack').onclick = event => { if (token) { event.preventDefault(); navigate(''); } };
  $('llJoinForm').onsubmit = event => {
    event.preventDefault();
    const link = $('llJoinLink').value.trim();
    let target = roomId.test(link) ? link : '';
    try { target ||= route.exec(new URL(link,location.origin).pathname)?.[1]; } catch {}
    if (!target) { message('请输入完整的邀请链接或 32 位房间号。'); return; }
    navigate(target);
  };
  $('llShare').onclick = () => {
    $('llShareLink').value = location.origin+'/landlord/'+token;
    $('llCopyStatus').textContent = '';
    $('llShareDialog').showModal();
  };
  $('llCloseShare').onclick = () => $('llShareDialog').close();
  $('llCopy').onclick = async () => {
    try {
      await navigator.clipboard.writeText($('llShareLink').value);
      $('llCopyStatus').textContent = '已复制牌室链接。';
    } catch {
      $('llShareLink').select();
      $('llCopyStatus').textContent = '请长按或手动复制链接。';
    }
  };
  function authChanged() {
    const next = $auth.user?.id || null;
    if (next === account) return;
    account = next;
    reset();
    render();
    refresh();
  }
  document.addEventListener('sj:auth-change',authChanged);
  document.addEventListener('sj:logout',() => { account = null; reset(); exitFullscreen(); render(); });
  $auth.ready.then(authChanged);
  window.addEventListener('popstate',() => navigate(route.exec(location.pathname)?.[1] || '',false));
  window.addEventListener('online',refresh);
  document.addEventListener('visibilitychange',() => { if (!document.hidden) refresh(); });
  setInterval(() => { if (!document.hidden) refresh(); },1000);
  setInterval(tick,250);
  render();
})();
