/* 随手记 · 前端逻辑 */

const THEMES = {
  mood:    { label: '心情', color: '#ec4899' },
  daily:   { label: '日常', color: '#3b82f6' },
  scene:   { label: '风景', color: '#22c55e' },
  food:    { label: '美食', color: '#f97316' },
  vent:    { label: '吐槽', color: '#a855f7' },
  secret:  { label: '树洞', color: '#6b7280' },
  game:    { label: '游戏', color: '#ef4444' },
  campus:  { label: '校园', color: '#06b6d4' },
  life:    { label: '生活', color: '#84cc16' },
  music:   { label: '音乐', color: '#d946ef' },
  travel:  { label: '旅行', color: '#f59e0b' },
  tech:    { label: '科技', color: '#6366f1' },
};

const ANIMALS = ['柯基','水豚','柴犬','橘猫','熊猫','企鹅','海豹','树懒','兔子','狐狸','考拉','刺猬','猫头鹰','海豚','小鹿','仓鼠','麻雀','金鱼','浣熊','羊驼'];
const VERBS = ['摸鱼的','看云的','发呆的','打盹的','闲逛的','躺平的','冒泡的','路过的','追风的','听雨的','晒太阳的','追星星的','数羊的','啃草的','打滚的','打哈欠的','蹭饭的','熬夜的','摸肚皮的','偷看的'];

let currentTheme = 'all';
let currentTopicFilter = ''; // 话题筛选时存日期
let pageBefore = Date.now() + 1000;
let hasMore = true;
let danmakuInterval = null;
let bgInterval = null;
let bgPool = [];
let bgIndex = 0;
let danmakuTracks = [];
const DANMAKU_HEIGHT = 180;
const TRACK_COUNT = 4;
let todayTopicData = { date: '', topic: '' };
let joiningTopic = false;
let currentDetailPost = null;

/* ---------- 工具 ---------- */
function $(s) { return document.querySelector(s); }
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff/60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff/3600000) + '小时前';
  return new Date(ts).toLocaleDateString('zh-CN');
}
function randomAnonName() {
  const v = VERBS[Math.floor(Math.random()*VERBS.length)];
  const a = ANIMALS[Math.floor(Math.random()*ANIMALS.length)];
  return v + a;
}
async function apiGet(path) {
  const res = await fetch(path);
  return res.json();
}
async function apiPost(path, body, authUI) {
  await window.SJAuth.ready;
  if(!window.SJAuth.user){window.SJAuth.open(authUI);const error=Error('请先登录后再操作');error.status=401;throw error;}
  const opt = { method: 'POST', headers: {'X-SJ-CSRF':window.SJAuth.csrf} };
  if (body instanceof FormData) {
    opt.body = body;
  } else {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body || {});
  }
  const res = await fetch(path, opt);
  const data = await res.json();
  if (!res.ok) {if(res.status===401){await window.SJAuth.refresh();window.SJAuth.open(authUI);}const error=new Error(data.error || '请求失败');error.status=res.status;throw error;}
  return data;
}

/* ---------- 主题栏 ---------- */
function buildThemeBar() {
  const bar = $('#themeBar');
  let html = `<button class="theme-tag active" data-theme="all" type="button">全部</button>`;
  for (const [key, t] of Object.entries(THEMES)) {
    html += `<button class="theme-tag" data-theme="${key}" type="button">${t.label}</button>`;
  }
  bar.innerHTML = html;
  bar.querySelectorAll('.theme-tag').forEach(el => {
    el.addEventListener('click', () => {
      bar.querySelectorAll('.theme-tag').forEach(x => {
        x.classList.remove('active');
        x.style.background = '';
      });
      el.classList.add('active');
      currentTheme = el.dataset.theme;
      currentTopicFilter = '';
      $('#waterfallTitle').textContent = '最新分享';
      if (currentTheme !== 'all') el.style.background = THEMES[currentTheme].color;
      loadFresh();
    });
  });
}

/* ---------- 主题选择器 ---------- */
let getSelectedTheme = () => 'mood';
function buildThemePicker() {
  const picker = $('#themePicker');
  let html = '';
  for (const [key, t] of Object.entries(THEMES)) {
    html += `<button type="button" class="theme-pick" data-theme="${key}" aria-pressed="${key === 'mood'}" style="background:${t.color}">${t.label}</button>`;
  }
  picker.innerHTML = html;
  let selected = 'mood';
  picker.querySelectorAll('.theme-pick').forEach(el => {
    if (el.dataset.theme === selected) el.classList.add('selected');
    el.addEventListener('click', () => {
      picker.querySelectorAll('.theme-pick').forEach(x => {x.classList.remove('selected');x.setAttribute('aria-pressed','false');});
      el.classList.add('selected');
      el.setAttribute('aria-pressed','true');
      selected = el.dataset.theme;
    });
  });
  return () => selected;
}

/* ---------- 弹幕 ---------- */
function initDanmakuTracks() {
  danmakuTracks = [];
  const trackH = Math.floor((DANMAKU_HEIGHT - 60) / TRACK_COUNT);
  for (let i = 0; i < TRACK_COUNT; i++) danmakuTracks.push(20 + i * trackH);
}

function spawnDanmaku(post) {
  const area = $('#danmakuArea');
  const t = THEMES[post.theme] || THEMES.mood;
  const el = document.createElement('div');
  el.className = 'danmaku-item';
  const displayName = post.name || '匿名小伙伴';
  el.innerHTML = `<span class="d-name">${esc(displayName)}</span>${esc(post.text.length > 30 ? post.text.slice(0,30)+'…' : post.text)}`;
  el.style.background = t.color + '33';
  el.style.color = t.color;
  el.style.border = `1px solid ${t.color}66`;
  const trackIdx = Math.floor(Math.random() * TRACK_COUNT);
  el.style.top = danmakuTracks[trackIdx] + 'px';
  area.appendChild(el);

  const width = el.offsetWidth;
  const areaWidth = area.offsetWidth;
  const distance = areaWidth + width + 100;
  const duration = distance / 120;
  const anim = el.animate([
    { right: '100%' },
    { right: `-${width + 100}px` }
  ], { duration: duration * 1000, easing: 'linear' });

  el.addEventListener('mouseenter', () => anim.pause());
  el.addEventListener('mouseleave', () => anim.play());
  el.addEventListener('click', () => showDetail(post));
  setTimeout(() => el.remove(), (duration + 2) * 1000);
}

function startDanmakuLoop(posts) {
  if (danmakuInterval) clearInterval(danmakuInterval);
  let i = 0;
  const pool = [...posts].reverse();
  for (let j = 0; j < Math.min(6, pool.length); j++) {
    setTimeout(() => spawnDanmaku(pool[j]), j * 400);
  }
  i = 6;
  danmakuInterval = setInterval(() => {
    if (pool.length > 0) { spawnDanmaku(pool[i % pool.length]); i++; }
  }, 1500);
}

/* ---------- 背景照片轮播 ---------- */
function startBgSlideshow(posts) {
  if (bgInterval) { clearInterval(bgInterval); bgInterval = null; }
  bgPool = posts.filter(p => p.media_type === 'image' && p.media);
  bgIndex = 0;
  const bg = $('#danmakuBg');
  if (!bg) return;
  if (bgPool.length === 0) {
    bg.classList.remove('show');
    bg.style.backgroundImage = '';
    return;
  }
  function showNext() {
    const p = bgPool[bgIndex % bgPool.length];
    bg.classList.remove('show');
    setTimeout(() => {
      const url = '/uploads/' + p.media;
      bg.style.backgroundImage = `url("${url}")`;
      const img = new Image();
      img.onload = () => bg.classList.add('show');
      img.src = url;
      bgIndex++;
    }, 1200);
  }
  const first = bgPool[0];
  bg.style.backgroundImage = `url("/uploads/${first.media}")`;
  const img0 = new Image();
  img0.onload = () => bg.classList.add('show');
  img0.src = '/uploads/' + first.media;
  bgIndex = 1;
  bgInterval = setInterval(showNext, 5000);
}

/* ---------- 瀑布流卡片 ---------- */
function cardHTML(post) {
  const t = THEMES[post.theme] || THEMES.mood;
  const name = post.name || '匿名小伙伴';
  let media = '';
  if (post.media) {
    const src = '/uploads/' + post.media;
    if (post.media_type === 'image') media = `<img class="card-media" src="${src}" loading="lazy" alt="用户分享的图片">`;
    else if (post.media_type === 'video') media = `<video class="card-media video" src="${src}" muted preload="metadata"></video>`;
  }
  const topicTag = post.topic ? `<div style="font-size:11px;color:#d946ef;margin-bottom:6px">📌 今日话题</div>` : '';
  return `
    <article class="card" data-id="${post.id}"><a class="card-link" href="/post/${post.id}" aria-label="查看${esc(t.label)}分享">
      ${topicTag}${media}
      <div class="card-text">${esc(post.text)}</div></a>
      <div class="card-footer">
        <span class="card-theme-badge" style="background:${t.color}">${t.label}</span>
        <div class="card-meta">
          <span>${esc(name)}</span>
          <button type="button" class="card-heart" aria-label="点赞" data-heart-id="${post.id}">❤️ ${post.hearts}</button>
        </div>
      </div>
    </article>`;
}

let allPosts = [];

function bindCardEvents(container) {
  container.querySelectorAll('.card-heart:not([data-bound])').forEach(h => {
    h.setAttribute('data-bound', '1');
    h.addEventListener('click', (e) => {
      e.stopPropagation();
      heartPost(Number(h.dataset.heartId), h);
    });
  });
}

function appendCards(posts) {
  const grid = $('#waterfallGrid');
  grid.insertAdjacentHTML('beforeend', posts.map(cardHTML).join(''));
  bindCardEvents(grid);
}

async function loadPosts(reset = false) {
  if (reset) {
    pageBefore = Date.now() + 1000;
    hasMore = true;
    allPosts = [];
    $('#waterfallGrid').innerHTML = '<p class="feed-loading" role="status">正在收集大家的日常…</p>';
  }
  if (!hasMore) return;

  const params = new URLSearchParams({ limit: '60', before: String(pageBefore) });
  if (currentTheme !== 'all') params.set('theme', currentTheme);
  if (currentTopicFilter) params.set('topic', currentTopicFilter);

  try {
    const data = await apiGet('/api/posts?' + params);
    const posts = data.posts || [];
    if (posts.length < 60) hasMore = false;
    if (posts.length > 0) pageBefore = posts[posts.length - 1].created_at;
    allPosts = allPosts.concat(posts);
    $('#waterfallGrid').querySelector('.feed-loading')?.remove();
    appendCards(posts);
    if (allPosts.length === 0) $('#waterfallGrid').innerHTML = '<div class="feed-state">这个角落还很安静，来分享第一条日常吧。</div>';

    if (reset) {
      $('#danmakuArea').querySelectorAll('.danmaku-item').forEach(el => el.remove());
      startDanmakuLoop(posts);
      startBgSlideshow(posts);
    }

    $('#btnLoadMore').style.display = hasMore ? 'block' : 'none';
    const tip = $('#noMoreTip');
    if (!hasMore) {
      if (!tip) {
        const div = document.createElement('div');
        div.className = 'no-more'; div.id = 'noMoreTip';
        div.textContent = '到底啦～';
        $('#btnLoadMore').after(div);
      }
    } else if (tip) tip.remove();
  } catch (e) {
    $('#waterfallGrid').querySelector('.feed-loading')?.remove();
    if (!allPosts.length) $('#waterfallGrid').innerHTML = '<div class="feed-state">暂时没能加载分享，请稍后重试。</div>';
    $('#btnLoadMore').style.display = 'block';
    $('#btnLoadMore').textContent = '重新加载';
    toast('加载失败：' + e.message);
  }
}
function loadFresh() { loadPosts(true); }

/* ---------- 每日话题 ---------- */
async function loadTopic() {
  try {
    const data = await apiGet('/api/topic');
    todayTopicData = data;
    $('#topicText').textContent = data.topic;
  } catch {
    $('#topicBanner').style.display = 'none';
  }
}

function setupTopic() {
  $('#btnJoinTopic').addEventListener('click', () => {
    joiningTopic = true;
    $('#topicHint').style.display = 'flex';
    $('#topicHintText').textContent = todayTopicData.topic;
    $('#postModal').classList.add('show');
    $('#postText').placeholder = `围绕「${todayTopicData.topic}」说点什么…`;
    setTimeout(() => $('#postText').focus(), 200);
  });
  $('#btnCancelTopic').addEventListener('click', () => {
    joiningTopic = false;
    $('#topicHint').style.display = 'none';
    $('#postText').placeholder = '此刻的心情、今天的见闻、想说又不好意思说的话...';
  });
  // 点话题横幅文字也可以看话题下的帖子
  $('#topicText').addEventListener('click', () => {
    currentTopicFilter = todayTopicData.date;
    currentTheme = 'all';
    document.querySelectorAll('.theme-tag').forEach(x => {
      x.classList.remove('active'); x.style.background = '';
    });
    document.querySelector('.theme-tag[data-theme="all"]').classList.add('active');
    $('#waterfallTitle').textContent = '📌 ' + todayTopicData.topic;
    loadFresh();
    document.querySelector('.waterfall-section').scrollIntoView({ behavior: 'smooth' });
  });
  $('#topicText').style.cursor = 'pointer';
}

/* ---------- 签到 ---------- */
function setupCheckin() {
  const btn = $('#btnCheckin');
  async function refresh() {
    try {
      const data = await apiGet('/api/checkin');
      if (data.checkedToday) {
        btn.textContent = `📅 已签 ${data.streak}天`;
        btn.classList.add('checked');
      } else {
        btn.textContent = '📅 签到';
        btn.classList.remove('checked');
      }
    } catch {}
  }
  btn.addEventListener('click', async () => {
    try {
      const data = await apiPost('/api/checkin');
      if (data.streak === 1 && (!data.total || data.total === 1)) {
        toast('签到成功！连续 1 天 🔥');
      } else if (data.msg) {
        toast(data.msg + `（连续${data.streak}天）`);
      } else {
        toast(`签到成功！连续 ${data.streak} 天 🔥`);
      }
      refresh();
    } catch (e) { toast(e.message); }
  });
  refresh();
}

/* ---------- 热门榜 ---------- */
function setupHot() {
  $('#btnHot').addEventListener('click', async () => {
    $('#hotModal').classList.add('show');
    const list = $('#hotList');
    list.innerHTML = '<div class="hot-empty">加载中…</div>';
    try {
      const data = await apiGet('/api/hot');
      const posts = data.posts || [];
      if (posts.length === 0) {
        list.innerHTML = '<div class="hot-empty">还没有热门帖子<br>发一条并收获点赞来上榜吧～</div>';
        return;
      }
      list.innerHTML = posts.map((p, i) => {
        const t = THEMES[p.theme] || THEMES.mood;
        return `
          <div class="hot-item" data-id="${p.id}">
            <div class="hot-rank">${i+1}</div>
            <div class="hot-body">
              <div class="hot-text">${esc(p.text)}</div>
              <div class="hot-meta">
                <span class="card-theme-badge" style="background:${t.color}">${t.label}</span>
                <span>❤️ ${p.hearts}</span>
                <span>${timeAgo(p.created_at)}</span>
              </div>
            </div>
          </div>`;
      }).join('');
      list.querySelectorAll('.hot-item').forEach(item => {
        item.addEventListener('click', () => {
          const id = Number(item.dataset.id);
          const post = posts.find(p => p.id === id);
          if (post) {
            $('#hotModal').classList.remove('show');
            showDetail(post);
          }
        });
      });
    } catch (e) {
      list.innerHTML = '<div class="hot-empty">加载失败</div>';
    }
  });
}

/* ---------- 详情弹窗 + 评论 ---------- */
function showDetail(post) {
  if(window.SJOpenPost)window.SJOpenPost(post.id);else location.assign('/post/' + post.id);
}

async function loadComments(postId) {
  const list = $('#commentsList');
  list.innerHTML = '<div class="comment-empty">加载中…</div>';
  $('#commentCount').textContent = '';
  try {
    const data = await apiGet(`/api/posts/${postId}/comments`);
    const comments = data.comments || [];
    $('#commentCount').textContent = comments.length ? `(${comments.length})` : '';
    if (comments.length === 0) {
      list.innerHTML = '<div class="comment-empty">还没有评论，来抢沙发～</div>';
      return;
    }
    list.innerHTML = comments.map(c => `
      <div class="comment-item">
        <span class="c-name">${esc(c.name || randomAnonName())}</span>${esc(c.text)}
        <span class="c-time">${timeAgo(c.created_at)}</span>
      </div>`).join('');
    list.scrollTop = list.scrollHeight;
  } catch {
    list.innerHTML = '<div class="comment-empty">评论加载失败</div>';
  }
}

function setupCommentForm() {
  $('#commentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentDetailPost) return;
    const text = $('#commentText').value.trim();
    if (!text) return;
    const name = $('#commentName').value.trim();
    try {
      await apiPost(`/api/posts/${currentDetailPost.id}/comments`, { text, name });
      $('#commentText').value = '';
      loadComments(currentDetailPost.id);
    } catch (err) { toast(err.message); }
  });
}

async function heartPost(id, btn, postObj) {
  try {
    const data = await apiPost(`/api/posts/${id}/heart`);
    if (data.hearts !== undefined) {
      btn.innerHTML = `❤️ ${data.hearts}`;
      btn.classList.add('liked');
      if (postObj) postObj.hearts = data.hearts;
      document.querySelectorAll(`[data-heart-id="${id}"]`).forEach(el => {
        el.innerHTML = `❤️ ${data.hearts}`;
      });
    }
  } catch (e) { toast('点赞失败：' + e.message); }
}

/* ---------- 发布 ---------- */
function setupPostForm() {
  getSelectedTheme = buildThemePicker();

  $('#btnOpenPost').addEventListener('click', () => $('#postModal').classList.add('show'));

  $('#postText').addEventListener('input', () => {
    $('#charCount').textContent = $('#postText').value.length;
  });

  $('#fileArea').addEventListener('click', e => { if (e.target !== $('#postFile')) $('#postFile').click(); });
  $('#postFile').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 60 * 1024 * 1024) {
      toast('文件太大啦（限 60MB）');
      e.target.value = '';
      return;
    }
    const preview = $('#filePreview');
    if (f.type.startsWith('image/')) {
      preview.src = URL.createObjectURL(f);
      preview.style.display = 'block';
    } else {
      preview.style.display = 'none';
    }
  });

  document.addEventListener('sj:logout',()=>{$('#postModal').classList.remove('show');$('#postForm').reset();$('#charCount').textContent='0';$('#filePreview').style.display='none';$('#filePreview').removeAttribute('src');$('#topicHint').style.display='none';joiningTopic=false;$('#postText').placeholder='此刻的心情、今天的见闻、想说又不好意思说的话...';});
  $('#postForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('#postText').value.trim();
    if (!text) { toast('说点什么吧～'); return; }
    const name = $('#postName').value.trim();
    const theme = getSelectedTheme();
    const file = $('#postFile').files[0];

    const fd = new FormData();
    fd.append('text', text);
    fd.append('name', name);
    fd.append('theme', theme);
    if (joiningTopic && todayTopicData.date) fd.append('topic', todayTopicData.date);
    if (file) fd.append('media', file);

    const btn = $('#btnSubmit');
    btn.disabled = true; btn.textContent = '发布中...';
    try {
      const data = await apiPost('/api/posts', fd, {resume:()=>{$('#postModal').classList.add('show');$('#postText').focus();},purpose:'登录已过期，重新登录后可继续编辑这条弹幕。'});
      toast('发布成功～');
      $('#postModal').classList.remove('show');
      $('#postForm').reset();
      window.SJAuth.render();
      $('#charCount').textContent = '0';
      $('#filePreview').style.display = 'none';
      $('#topicHint').style.display = 'none';
      joiningTopic = false;
      $('#postText').placeholder = '此刻的心情、今天的见闻、想说又不好意思说的话...';

      const post = data.post;
      spawnDanmaku(post);
      allPosts.unshift(post);
      $('#waterfallGrid').insertAdjacentHTML('afterbegin', cardHTML(post));
      bindCardEvents($('#waterfallGrid'));
      if (post.media_type === 'image' && post.media) bgPool.unshift(post);
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false; btn.textContent = '发布 🚀';
    }
  });
}

/* ---------- 弹窗 ---------- */
function setupModals() {
  document.querySelectorAll('.modal-mask').forEach(mask => {
    mask.addEventListener('click', (e) => {
      if (e.target === mask) mask.classList.remove('show');
    });
  });
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.dataset.close).classList.remove('show');
    });
  });
}

/* ---------- 初始化 ---------- */
initDanmakuTracks();
buildThemeBar();
setupPostForm();
setupModals();
setupTopic();
setupCheckin();
setupHot();
loadTopic();
loadPosts(true);
