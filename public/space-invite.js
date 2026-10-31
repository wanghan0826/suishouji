(() => {
  const $ = id => document.getElementById(id);
  const dialog = $('spaceInviteDialog');
  const palettes = {
    mint: ['#e5f4ec', '#264a3a', '#347459'],
    sky: ['#e8f2fb', '#28475e', '#366c99'],
    rose: ['#f9eaf0', '#573943', '#a15470'],
    sand: ['#f7eedf', '#564734', '#886d40']
  };
  const conditions = {
    mutual: ['注册并关注我', '等我回关，一起留弹'],
    followers: ['登录并关注我', '关注后，就能一起留弹'],
    public: ['扫码看看我的空间', '登录后，给我留一句弹幕']
  };
  let revision = 0, accountId = null, file = null, objectUrl = null, invite = null;

  function clear() {
    revision++;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = file = invite = null;
    $('spaceInvitePreview').removeAttribute('src');
    $('spaceInviteDownload').removeAttribute('href');
    $('spaceInviteDownload').hidden = true;
    $('spaceInviteFile').hidden = true;
    $('spaceInviteCopy').disabled = true;
    $('spaceInviteStatus').textContent = '';
  }

  function wrap(ctx, text, width, maxLines) {
    const lines = [];
    let line = '';
    for (const char of Array.from(text.replace(/\s+/gu, ' ').trim())) {
      if (line && ctx.measureText(line + char).width > width) {
        lines.push(line);
        line = '';
        if (lines.length === maxLines) {
          lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…';
          return lines;
        }
      }
      line += char;
    }
    if (line) lines.push(line);
    return lines;
  }

  function makeCard(data) {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1440;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw Error('当前浏览器暂时无法生成图片。');
    const [background, ink, accent] = palettes[data.color] || palettes.mint;
    const rect = (x, y, w, h, radius, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, radius);
      ctx.fill();
    };
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 1080, 1440);
    rect(48, 48, 984, 1344, 42, '#ffffffb8');
    rect(100, 100, 68, 72, 18, accent);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 42px sans-serif';
    ctx.fillText('记', 112, 152);
    ctx.fillStyle = accent;
    ctx.font = 'bold 31px sans-serif';
    ctx.fillText('随手记 / 给朋友的一张邀请', 190, 148);
    ctx.fillStyle = ink;
    ctx.font = 'bold 84px sans-serif';
    ctx.fillText('来我的空间', 100, 294);
    ctx.fillText('留一句弹幕。', 100, 400);
    ctx.font = '30px sans-serif';
    ctx.fillText('把日常变成弹幕，让朋友接住。', 104, 462);

    const pill = (text, x, y, width, angle) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      rect(0, 0, width, 86, 43, background);
      ctx.strokeStyle = accent + '44';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.font = '30px sans-serif';
      ctx.fillText('↗', 27, 55);
      ctx.fillStyle = ink;
      ctx.fillText(text, 74, 55);
      ctx.restore();
    };
    pill('日常，飘过来', 112, 555, 498, -.045);
    pill('在这里，接住彼此', 362, 638, 598, .025);
    pill('点开弹幕，聊下去', 142, 738, 600, -.025);
    ctx.fillStyle = accent;
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText('@' + data.username, 104, 904);
    ctx.fillStyle = ink;
    ctx.font = 'bold 48px sans-serif';
    wrap(ctx, data.title, 864, 3).forEach((line, i) => ctx.fillText(line, 104, 972 + i * 61));

    const qr = qrcode(0, 'M');
    qr.addData(data.url);
    qr.make();
    const modules = qr.getModuleCount();
    const scale = Math.floor(230 / (modules + 8));
    const size = (modules + 8) * scale;
    const x = 976 - size, y = 1138;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#152d24';
    for (let row = 0; row < modules; row++) {
      for (let column = 0; column < modules; column++) {
        if (qr.isDark(row, column)) ctx.fillRect(x + (column + 4) * scale, y + (row + 4) * scale, scale, scale);
      }
    }
    ctx.fillStyle = ink;
    ctx.font = 'bold 30px sans-serif';
    conditions[data.visibility].forEach((line, i) => ctx.fillText(line, 104, 1185 + i * 48));
    ctx.fillStyle = accent;
    ctx.font = '23px sans-serif';
    ctx.fillText('进入条件以空间当前设置为准', 104, 1290);
    ctx.fillText(location.host + ' · 扫码进入 ↗', 104, 1334);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('暂时无法生成图片，请重试。')), 'image/png'));
  }

  async function open() {
    await SJAuth.ready;
    if (!SJAuth.user) {
      SJAuth.open({ resume: open, purpose: '登录后制作自己的空间邀请卡。' });
      return;
    }
    clear();
    accountId = SJAuth.user.id;
    const current = revision, sameAccount = () => current === revision && SJAuth.user?.id === accountId && dialog.open;
    if (!dialog.open) dialog.showModal();
    $('spaceInviteStatus').textContent = '正在制作你的空间邀请卡…';
    try {
      const response = await fetch('/api/spaces/me', { credentials: 'same-origin', cache: 'no-store' });
      const profile = await response.json();
      if (!sameAccount()) return;
      if (!response.ok || !profile.isOwner || profile.username !== SJAuth.user.username) throw Error(profile.error || '请登录自己的账号后制作邀请卡。');
      if (!conditions[profile.visibility]) throw Error('请刷新空间设置后重试。');
      const data = {
        username: profile.username, title: profile.title, color: profile.color,
        visibility: profile.visibility, url: location.origin + '/u/' + encodeURIComponent(profile.username) + '?from=invite&format=card'
      };
      await document.fonts.ready;
      if (!sameAccount()) return;
      const blob = await makeCard(data);
      if (!sameAccount()) return;
      objectUrl = URL.createObjectURL(blob);
      file = new File([blob], '随手记-' + data.username + '-空间邀请.png', { type: 'image/png' });
      invite = data;
      $('spaceInvitePreview').src = objectUrl;
      $('spaceInvitePreview').alt = '@' + data.username + ' 的空间邀请卡，含进入条件和空间二维码';
      $('spaceInviteDownload').href = objectUrl;
      $('spaceInviteDownload').download = file.name;
      $('spaceInviteDownload').hidden = false;
      $('spaceInviteCopy').disabled = false;
      try { $('spaceInviteFile').hidden = !navigator.canShare?.({ files: [file] }); } catch { $('spaceInviteFile').hidden = true; }
      $('spaceInviteStatus').textContent = '长按保存图片，或点下方保存。可发给微信、QQ 等应用中的朋友，扫码进入空间。';
    } catch (error) {
      if (sameAccount()) $('spaceInviteStatus').textContent = error.message || '制作失败，请关闭后重试。';
    }
  }

  $('spaceInviteClose').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { if (!dialog.open) clear(); });
  $('spaceInviteFile').onclick = async () => {
    if (!file || SJAuth.user?.id !== accountId) return;
    const current = revision;
    try {
      await navigator.share({ files: [file], title: '来我的随手记空间留一句弹幕' });
      if (current === revision) $('spaceInviteStatus').textContent = '分享面板已关闭，实际发送请以所选应用为准。';
    } catch (error) {
      if (current === revision) $('spaceInviteStatus').textContent = error.name === 'AbortError' ? '已取消分享，可以重新选择。' : '可以先保存图片，再到微信或QQ发送。';
    }
  };
  $('spaceInviteCopy').onclick = async () => {
    if (!invite || SJAuth.user?.id !== accountId) return;
    const current = revision;
    const url = new URL(invite.url);
    url.searchParams.set('format', 'link');
    const text = '来我的随手记空间留一句弹幕：' + url.href + '\n' + conditions[invite.visibility].join('，') + '。';
    try {
      await navigator.clipboard.writeText(text);
      if (current === revision) $('spaceInviteStatus').textContent = '邀请文案已复制，由你选择朋友发送。';
    } catch {
      if (current === revision) $('spaceInviteStatus').textContent = text;
    }
  };
  document.addEventListener('sj:auth-change', () => {
    if (dialog.open && SJAuth.user?.id !== accountId) dialog.close();
  });
  window.SJSpaceInvite = { open };
})();
