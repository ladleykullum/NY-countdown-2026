(() => {
  'use strict';

  // ---------- state ----------
  // Everything lives in this browser (localStorage), so set it up on the laptop you'll play from.
  const KEY = 'nye-song-countdown-v1';
  const state = Object.assign(
    { entries: [], bracket: null, view: 'setup', sheetUrl: '' },
    load()
  );

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch {
      setMsg('This browser ran out of room to save. Try smaller photos or fewer of them.', true);
      return false;
    }
  }

  const $ = (sel) => document.querySelector(sel);
  const uid = () => Math.random().toString(36).slice(2, 10);
  const byId = (id) => state.entries.find((e) => e.id === id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- parsing helpers ----------
  function parseVideoId(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    const ok = (id) => (/^[\w-]{11}$/.test(id || '') ? id : null);
    if (ok(s)) return s;
    let u;
    try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch { return null; }
    const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
    if (host === 'youtu.be') return ok(u.pathname.split('/')[1]);
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.searchParams.get('v')) return ok(u.searchParams.get('v'));
      const m = u.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{11})/);
      if (m) return m[1];
    }
    return null;
  }

  // Accepts 1:05, 01:05, 65, 1m5s, 1.05, 0:01:05 and Google Sheets' habit of turning "1:05" into "1:05:00".
  function parseTime(v) {
    if (v == null) return null;
    let s = String(v).trim().toLowerCase().replace(/\s*(am|pm)$/, '');
    if (!s) return null;
    let m = s.match(/^(\d+)[.,](\d{2})$/);
    if (m) return +m[1] * 60 + +m[2];
    if (/^\d+$/.test(s)) return +s;
    m = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
    if (m) {
      if (m[3] == null) return +m[1] * 60 + +m[2];
      const total = +m[1] * 3600 + +m[2] * 60 + +m[3];
      // Nobody picks a start point 20+ minutes into a song: "1:05:00" really meant 1 min 5 sec.
      if (+m[3] === 0 && total > 1200) return +m[1] * 60 + +m[2];
      return total;
    }
    m = s.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?:in)?s?)?\s*(?:(\d+)\s*s(?:ec)?s?)?$/);
    if (m && (m[1] || m[2] || m[3])) return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
    return null;
  }

  function timeFromUrl(raw) {
    try {
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
      const t = u.searchParams.get('t') || u.searchParams.get('start');
      return t ? parseTime(t.replace(/s$/, '')) ?? parseTime(t) : null;
    } catch { return null; }
  }

  const fmt = (sec) => {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = String(sec % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
  };
  const ytLink = (e) => `https://www.youtube.com/watch?v=${e.videoId}${e.start ? `&t=${e.start}s` : ''}`;
  const titleOf = (e) => e.title || 'Untitled song';
  const initials = (name) => (name || '?').replace(/^Example:\s*/, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const rows = [];
    let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { f += '"'; i++; } else q = false;
        } else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(f); rows.push(row); row = []; f = '';
      } else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim() !== ''));
  }

  // ---------- importing ----------
  function importRows(rows) {
    if (rows.length < 2) return setMsg('That file has no answers in it yet.', true);
    const head = rows[0].map((h) => h.toLowerCase());
    const body = rows.slice(1);
    const cols = head.map((_, i) => i);

    // The link column is whichever holds the most YouTube links.
    const linkCol = cols
      .map((i) => [i, body.filter((r) => parseVideoId(r[i])).length])
      .sort((a, b) => b[1] - a[1])[0];
    if (!linkCol || linkCol[1] === 0) return setMsg("Couldn't find a column of YouTube links in that sheet.", true);
    const L = linkCol[0];
    const find = (re, not = /$^/) => cols.find((i) => i !== L && re.test(head[i]) && !not.test(head[i]));
    const N = find(/name|who/, /song|track|title|artist/);
    const T = find(/song|track|title|artist/, /link|url|youtube|time|start/);
    const S = find(/start|time|second|minute|when|from/, /timestamp/);

    let added = 0, updated = 0;
    const skipped = [];
    body.forEach((r, idx) => {
      const url = (r[L] || '').trim();
      const videoId = parseVideoId(url);
      const name = N != null ? (r[N] || '').trim() : '';
      if (!videoId) {
        skipped.push(`row ${idx + 2}${name ? ` (${name})` : ''}`);
        return;
      }
      const start = (S != null ? parseTime(r[S]) : null) ?? timeFromUrl(url) ?? 0;
      const title = T != null ? (r[T] || '').trim() : '';
      // Same person submitting again replaces their earlier answer (Google Forms lists newest last).
      const existing = state.entries.find((e) => !e.demo && ((name && norm(e.name) === norm(name)) || (!name && e.videoId === videoId)));
      if (existing) {
        Object.assign(existing, { url, videoId, start, title: title || (existing.videoId === videoId ? existing.title : '') });
        updated++;
      } else {
        state.entries.push({ id: uid(), name: name || 'Unknown', url, videoId, start, title, photo: null });
        added++;
      }
    });
    state.entries = state.entries.filter((e) => !e.demo);
    afterEntriesChanged();
    let text = `Loaded ${added} new song${added === 1 ? '' : 's'}`;
    if (updated) text += `, updated ${updated}`;
    text += '.';
    if (skipped.length) text += `\nSkipped ${skipped.join(', ')}: no YouTube link.`;
    setMsg(text, false);
    fetchMissingTitles();
  }

  async function loadFromUrl() {
    const url = $('#sheet-url').value.trim();
    if (!url) return setMsg('Paste the published CSV link first.', true);
    state.sheetUrl = url;
    save();
    let csvUrl = url;
    // A normal sheet link can't be read; nudge people to the "Publish to web" CSV link.
    if (/docs\.google\.com\/spreadsheets\/d\/(?!e\/)/.test(url) && !/output=csv|format=csv/.test(url)) {
      const m = url.match(/\/d\/([\w-]+)/);
      if (m) csvUrl = `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv`;
    }
    setMsg('Loading…', false);
    try {
      const res = await fetch(csvUrl);
      if (!res.ok) throw new Error(res.status);
      const text = await res.text();
      if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('html');
      importRows(parseCSV(text));
    } catch {
      setMsg('Couldn\'t read that link. In the sheet use File → Share → Publish to web, choose "Comma-separated values (.csv)", and paste that link. Or download the CSV and use Upload CSV file.', true);
    }
  }

  function resizeImage(file, size = 480) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) * 0.25; // keep heads in frame on tall photos
        const c = document.createElement('canvas');
        c.width = c.height = Math.min(size, side);
        c.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.src = url;
    });
  }

  async function bulkPhotos(files) {
    const unmatched = [];
    let matched = 0;
    for (const file of files) {
      const base = norm(file.name.replace(/\.[^.]+$/, ''));
      const e =
        state.entries.find((x) => norm(x.name) === base) ||
        state.entries.find((x) => norm(x.name.split(/\s+/)[0]) === base) ||
        state.entries.find((x) => base && (norm(x.name).startsWith(base) || base.startsWith(norm(x.name.split(/\s+/)[0]))));
      if (!e) { unmatched.push(file.name); continue; }
      try { e.photo = await resizeImage(file); matched++; } catch { unmatched.push(file.name); }
    }
    save();
    renderSetup();
    let text = `Added ${matched} photo${matched === 1 ? '' : 's'}.`;
    if (unmatched.length) text += `\nNo name matched: ${unmatched.join(', ')}. Click that person's face below to add it by hand.`;
    setMsg(text, unmatched.length > 0 && matched === 0);
  }

  async function fetchMissingTitles() {
    const todo = state.entries.filter((e) => e.videoId && !e.title);
    await Promise.all(todo.map(async (e) => {
      try {
        const r = await fetch('https://noembed.com/embed?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + e.videoId));
        const j = await r.json();
        if (j && j.title && !e.title) e.title = j.title;
      } catch { /* the player fills it in later */ }
    }));
    if (todo.length) { save(); render(); }
  }

  const DEMO = [
    ['Example: Alex', 'dQw4w9WgXcQ', 43, 'Rick Astley – Never Gonna Give You Up'],
    ['Example: Bree', 'fJ9rUzIMcZQ', 0, 'Queen – Bohemian Rhapsody'],
    ['Example: Cam', 'djV11Xbc914', 53, 'a-ha – Take On Me'],
    ['Example: Dani', 'gGdGFtwCNBE', 0, 'The Killers – Mr. Brightside'],
    ['Example: Eli', 'FTQbiNvZqaY', 61, 'Toto – Africa'],
    ['Example: Fran', 'OPf0YbXqDm0', 30, 'Mark Ronson – Uptown Funk ft. Bruno Mars'],
    ['Example: Gus', '9bZkp7q19f0', 66, 'PSY – Gangnam Style'],
  ];

  // ---------- bracket logic ----------
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function drawBracket() {
    const ids = shuffle(state.entries.filter((e) => e.videoId).map((e) => e.id));
    const n = ids.length;
    let size = 1;
    while (size < n) size *= 2;
    const byes = size - n;
    const pairs = [];
    let k = 0;
    for (let i = 0; i < size / 2; i++) pairs.push(i < byes ? [ids[k++], null] : [ids[k++], ids[k++]]);
    shuffle(pairs);
    const winners = [];
    for (let m = size / 2; m >= 1; m /= 2) winners.push(new Array(m).fill(null));
    pairs.forEach((p, i) => { if (p[1] === null) winners[0][i] = p[0]; });
    const colors = {};
    ids.forEach((id, k) => { colors[id] = k; });
    state.bracket = { seeds: pairs.flat(), winners, history: [], current: null, colors };
    state.view = 'bracket';
    save();
    render();
    window.scrollTo({ top: 0 });
  }

  const B = () => state.bracket;
  const rounds = () => B().winners.length;
  function slots(r, i) {
    const b = B();
    return r === 0 ? [b.seeds[2 * i], b.seeds[2 * i + 1]] : [b.winners[r - 1][2 * i], b.winners[r - 1][2 * i + 1]];
  }
  const isBye = (r, i) => r === 0 && slots(r, i)[1] === null;
  const isReady = (r, i) => { const [a, b] = slots(r, i); return a != null && b != null && !B().winners[r][i]; };
  function nextMatch() {
    const b = B();
    for (let r = 0; r < b.winners.length; r++)
      for (let i = 0; i < b.winners[r].length; i++) if (isReady(r, i)) return [r, i];
    return null;
  }
  function currentMatch() {
    const c = B().current;
    return c && isReady(c[0], c[1]) ? c : nextMatch();
  }
  function roundName(r) {
    const count = B().winners[r].length;
    if (count === 1) return 'The Final';
    if (count === 2) return 'Semi-finals';
    if (count === 4) return 'Quarter-finals';
    return `Round of ${count * 2}`;
  }
  const champion = () => B().winners[rounds() - 1][0];

  function pick(r, i, winnerId) {
    const [a, b] = slots(r, i);
    const loserId = winnerId === a ? b : a;
    B().winners[r][i] = winnerId;
    B().history.push([r, i]);
    B().current = null;
    save();
    stopPlayer();
    render();
    showEliminated(byId(loserId), r, () => {
      if (champion()) showChampion(byId(champion()));
    });
  }

  function undo() {
    const last = B().history.pop();
    if (!last) return;
    B().winners[last[0]][last[1]] = null;
    B().current = last;
    save();
    render();
  }

  // ---------- YouTube player ----------
  let player = null, playerReady = false, queued = null, playingId = null;

  function ensurePlayer() {
    if (player || document.getElementById('yt-api')) return;
    window.onYouTubeIframeAPIReady = () => {
      player = new YT.Player('player', {
        width: '100%',
        height: '100%',
        playerVars: { rel: 0, playsinline: 1, modestbranding: 1 },
        events: {
          onReady: () => { playerReady = true; if (queued) { play(queued); queued = null; } },
          onError: onPlayerError,
          onStateChange: onPlayerState,
        },
      });
    };
    const s = document.createElement('script');
    s.id = 'yt-api';
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => setPlayerMsg('YouTube didn\'t load. Check the internet connection, then refresh the page.');
    document.head.appendChild(s);
  }

  function play(e) {
    setPlayerMsg('');
    playingId = e.id;
    $('#screen-cover').hidden = true;
    markPlaying();
    if (!playerReady) { queued = e; ensurePlayer(); return; }
    player.loadVideoById({ videoId: e.videoId, startSeconds: e.start || 0 });
  }

  function stopPlayer() {
    playingId = null;
    try { if (playerReady) player.stopVideo(); } catch { /* ignore */ }
    const cover = $('#screen-cover');
    if (cover) cover.hidden = false;
    setPlayerMsg('');
  }

  function onPlayerError(ev) {
    const e = byId(playingId);
    const why = ev.data === 101 || ev.data === 150 ? "The uploader doesn't allow this video to play on other sites." : "This video won't play here.";
    setPlayerMsg(e ? `${why} <a href="${ytLink(e)}" target="_blank" rel="noopener">Open it on YouTube at ${fmt(e.start)}</a>` : why);
  }

  function onPlayerState(ev) {
    if (ev.data !== 1 || !playingId) return; // 1 = playing
    const e = byId(playingId);
    if (e && !e.title) {
      const t = player.getVideoData && player.getVideoData().title;
      if (t) { e.title = t; save(); render(); }
    }
  }

  function setPlayerMsg(html) { const el = $('#player-msg'); if (el) el.innerHTML = html; }
  function markPlaying() {
    document.querySelectorAll('.contender').forEach((el) => el.classList.toggle('playing', el.dataset.id === playingId));
  }

  // ---------- rendering ----------
  function setMsg(text, bad) {
    const el = $('#import-msg');
    el.textContent = text;
    el.classList.toggle('bad', !!bad);
  }

  function faceHTML(e, cls = 'initials') {
    return e && e.photo ? `<img src="${e.photo}" alt="${esc(e.name)}">` : `<div class="${cls}">${esc(initials(e && e.name))}</div>`;
  }

  function renderSetup() {
    const list = $('#entry-list');
    if (!state.entries.length) {
      list.innerHTML = `<div class="empty">No songs yet. Load your Google Form answers above, or try it out with the example songs.</div>`;
    } else {
      list.innerHTML = state.entries.map((e) => `
        <article class="entry${e.demo ? ' demo' : ''}" data-id="${e.id}">
          <label class="face" title="Add a photo of ${esc(e.name)}">
            ${faceHTML(e)}
            <input type="file" accept="image/*" data-act="photo" hidden>
            <span class="face-hint">${e.photo ? 'Change' : 'Add photo'}</span>
          </label>
          <div class="fields">
            <input class="f-name" data-k="name" value="${esc(e.name)}" placeholder="Name" aria-label="Name">
            <input data-k="title" value="${esc(e.title)}" placeholder="Song name" aria-label="Song name">
            <div class="f-row">
              <input data-k="url" value="${esc(e.url)}" placeholder="YouTube link" aria-label="YouTube link">
              <input class="f-time" data-k="start" value="${fmt(e.start)}" placeholder="0:00" aria-label="Start time" title="Start time (minutes:seconds)">
            </div>
            ${e.videoId ? '' : '<p class="warn">That isn\'t a YouTube video link.</p>'}
          </div>
          <div class="entry-actions">
            ${e.videoId ? `<a href="${ytLink(e)}" target="_blank" rel="noopener">Check it on YouTube from ${fmt(e.start)}</a>` : '<span></span>'}
            ${e.demo ? '<span class="tag">Example</span>' : ''}
            <button class="link-btn" data-act="remove" type="button">Remove</button>
          </div>
        </article>`).join('');
    }

    const n = state.entries.filter((e) => e.videoId).length;
    const msg = $('#count-msg');
    let html = `<strong>${n} song${n === 1 ? '' : 's'}</strong> ready.`;
    if (n >= 2) {
      let size = 1;
      while (size < n) size *= 2;
      const byes = size - n;
      if (n % 2) html += ` <span class="odd">That's an odd number, so add one more song to even it up.</span>`;
      if (byes) html += ` With ${n}, ${byes} song${byes === 1 ? '' : 's'} will get a free pass into round 2 at random. 4, 8, 16 or 32 songs make a perfect bracket.`;
    } else {
      html += ' You need at least 2 to draw a bracket.';
    }
    msg.innerHTML = html;
    const draw = $('#draw');
    draw.disabled = n < 2;
    draw.textContent = state.bracket ? 'Start a new bracket' : 'Shuffle & draw the bracket';
    draw.classList.remove('danger');
    delete draw.dataset.armed;
    $('#load-demo').hidden = state.entries.some((e) => !e.demo);
    if (state.sheetUrl && !$('#sheet-url').value) $('#sheet-url').value = state.sheetUrl;
  }

  // Song colours, borrowed from the ribbons. Each song keeps its colour for the whole night.
  const PALETTE = [
    ['#4f5fff', '#ffffff'], ['#a27bff', '#0e0e10'], ['#ff5a36', '#0e0e10'], ['#c8f03c', '#0e0e10'],
    ['#ffc21a', '#0e0e10'], ['#ff7ac3', '#0e0e10'], ['#5ec8ff', '#0e0e10'], ['#2fbf8f', '#0e0e10'],
  ];
  function colorOf(id) {
    const b = B();
    let k = b && b.colors ? b.colors[id] : undefined;
    if (k == null) k = Math.max(0, state.entries.findIndex((e) => e.id === id));
    return PALETTE[k % PALETTE.length];
  }
  const colorVars = (id) => { const [c, on] = colorOf(id); return `--c:${c};--on-c:${on}`; };

  function contenderHTML(e, side, r, i) {
    return `
      <div class="band"><span>Song ${side}</span><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span></div>
      <div class="body">
        <img class="thumb" src="https://i.ytimg.com/vi/${e.videoId}/mqdefault.jpg" alt="">
        <h3>${esc(titleOf(e))}</h3>
        <span class="start-chip">Starts at <b>${fmt(e.start)}</b></span>
        <div class="actions">
          <button class="btn ghost" data-play="${e.id}" type="button">▶ Play song ${side}</button>
          <button class="btn win" data-pick="${e.id}" data-r="${r}" data-i="${i}" type="button">Song ${side} wins</button>
          <a class="yt" href="${ytLink(e)}" target="_blank" rel="noopener">Open on YouTube</a>
        </div>
      </div>`;
  }

  function renderStage() {
    const label = $('#round-label');
    const A = $('#side-a'), Bs = $('#side-b');
    const champ = champion();
    $('.match-stage').classList.toggle('done', !!champ);
    if (champ) {
      const e = byId(champ);
      label.innerHTML = `<small>We have a winner</small>${esc(titleOf(e))}`;
      A.className = 'contender';
      A.dataset.id = e.id;
      A.style.cssText = colorVars(e.id);
      A.innerHTML = `
        <div class="band"><span>Champion</span><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span></div>
        <div class="body">
          <div class="face champ-face">${faceHTML(e)}</div>
          <h3 class="champ-name">${esc(e.name)}</h3>
          <div class="actions">
            <button class="btn win" data-play="${e.id}" type="button">▶ Play the winner</button>
            <button class="btn ghost" data-celebrate type="button">Show the winner again</button>
          </div>
        </div>`;
      Bs.hidden = true;
      Bs.innerHTML = '';
      markPlaying();
      return;
    }
    Bs.hidden = false;
    const cur = currentMatch();
    if (!cur) { label.textContent = ''; A.innerHTML = Bs.innerHTML = ''; return; }
    const [r, i] = cur;
    const [a, b] = slots(r, i).map(byId);
    const inRound = B().winners[r].map((_, j) => j).filter((j) => !isBye(r, j));
    label.innerHTML = `<small>${roundName(r)} · Match ${inRound.indexOf(i) + 1} of ${inRound.length}</small>Song A vs Song B`;
    A.className = Bs.className = 'contender';
    A.dataset.id = a.id;
    Bs.dataset.id = b.id;
    A.style.cssText = colorVars(a.id);
    Bs.style.cssText = colorVars(b.id);
    A.innerHTML = contenderHTML(a, 'A', r, i);
    Bs.innerHTML = contenderHTML(b, 'B', r, i);
    markPlaying();
  }

  function slotHTML(id, r, i) {
    const b = B();
    if (id == null) {
      if (r === 0) return `<div class="slot bye">Free pass</div>`;
      return `<div class="slot tbd"><span class="t">To be decided</span></div>`;
    }
    const e = byId(id);
    const w = b.winners[r][i];
    const vars = colorVars(id);
    if (!w || isBye(r, i)) return `<div class="slot live" style="${vars}"><span class="dot"></span><span class="t">${esc(titleOf(e))}</span></div>`;
    if (w === id) return `<div class="slot win" style="${vars}"><span class="t">${esc(titleOf(e))}</span></div>`;
    const face = e.photo ? `<img class="mini-face" src="${e.photo}" alt="">` : '';
    return `<div class="slot lose"><span class="t">${esc(titleOf(e))}</span><span class="who">${face}${esc(e.name)}</span></div>`;
  }

  // Bracket geometry, in px, matching the card sizes in style.css.
  const G = { w: 220, h: 96, col: 330, pitch: 168, top: 48, trophy: 180 };

  function renderBracket() {
    const b = B();
    const R = rounds();
    const cur = currentMatch();
    const ys = [b.winners[0].map((_, i) => i * G.pitch)];
    for (let r = 1; r < R; r++) ys.push(b.winners[r].map((_, i) => (ys[r - 1][2 * i] + ys[r - 1][2 * i + 1]) / 2));
    const height = G.top + (b.winners[0].length - 1) * G.pitch + G.h;
    const trophyX = (R - 1) * G.col + G.w + 60;
    const width = trophyX + G.trophy;
    const finalMid = G.top + ys[R - 1][0] + G.h / 2;
    const champ = champion();

    const links = [];
    const curve = (x1, y1, x2, y2, cls, vars) => {
      const mx = (x1 + x2) / 2;
      links.push(`<path class="${cls}" style="${vars}" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}"/>`);
    };
    for (let r = 0; r < R - 1; r++) {
      b.winners[r].forEach((w, i) => {
        const top = G.top + ys[r][i];
        const x1 = r * G.col + G.w, x2 = (r + 1) * G.col;
        const y2 = G.top + ys[r + 1][i >> 1] + (i % 2 ? 72 : 24);
        if (w) {
          const y1 = top + (slots(r, i)[0] === w ? 24 : 72);
          curve(x1, y1, x2, y2, 'won', `stroke:${colorOf(w)[0]}`);
        } else curve(x1, top + G.h / 2, x2, y2, 'tbd', '');
      });
    }
    curve((R - 1) * G.col + G.w, finalMid, trophyX, finalMid, champ ? 'won' : 'tbd', champ ? `stroke:${colorOf(champ)[0]}` : '');

    const titles = b.winners.map((_, r) => `<div class="round-title" style="left:${r * G.col}px">${roundName(r).replace(/^The /, '')}</div>`).join('');
    const cards = b.winners.map((round, r) => round.map((_, i) => {
      const [x, y] = slots(r, i);
      const ready = isReady(r, i);
      const isCur = cur && cur[0] === r && cur[1] === i;
      const pending = x == null && y == null;
      const tag = ready ? 'button' : 'div';
      const attrs = ready ? ` type="button" data-goto="${r},${i}" aria-label="Play this match"` : '';
      const cls = `bm${isCur ? ' current' : ''}${pending ? ' pending' : ''}`;
      const pos = `left:${r * G.col}px;top:${G.top + ys[r][i]}px`;
      return `<${tag} class="${cls}" style="${pos}"${attrs}>${slotHTML(x, r, i)}${slotHTML(isBye(r, i) ? null : y, isBye(r, i) ? 0 : r, i)}</${tag}>`;
    }).join('')).join('');

    const ce = champ && byId(champ);
    const trophy = `
      <div class="trophy${ce ? ' won' : ''}" style="left:${trophyX}px;top:${finalMid - G.trophy / 2}px;${ce ? colorVars(ce.id) : ''}">
        ${ce ? (ce.photo ? `<img src="${ce.photo}" alt="${esc(ce.name)}">` : `<div class="initials">${esc(initials(ce.name))}</div>`) : 'Champion'}
      </div>
      ${ce ? `<div class="trophy-cap" style="left:${trophyX}px;top:${finalMid + G.trophy / 2 + 18}px">${esc(ce.name)}</div>` : ''}`;

    const el = $('#bracket');
    el.style.width = width + 'px';
    el.style.height = height + (ce ? 40 : 0) + 'px';
    el.innerHTML = `<svg class="links" width="${width}" height="${height}" aria-hidden="true">${links.join('')}</svg>${titles}${cards}${trophy}`;
    $('#undo').disabled = !b.history.length;
  }

  function render() {
    const hasBracket = !!state.bracket;
    if (!hasBracket && state.view === 'bracket') state.view = 'setup';
    document.body.classList.toggle('playing-view', state.view === 'bracket');
    document.querySelectorAll('.tab').forEach((t) => {
      t.setAttribute('aria-current', t.dataset.view === state.view ? 'page' : 'false');
      if (t.dataset.view === 'bracket') t.disabled = !hasBracket;
    });
    $('#view-setup').hidden = state.view !== 'setup';
    $('#view-bracket').hidden = state.view !== 'bracket';
    const sub = $('#hero-sub');
    if (state.view === 'setup') {
      sub.textContent = 'Everyone picks a song. The room votes. One anthem takes us into 2027.';
      renderSetup();
    } else {
      const n = B().seeds.filter(Boolean).length;
      const R = rounds();
      sub.textContent = `${n} songs. ${R} round${R === 1 ? '' : 's'}. One anthem for 2027.`;
      ensurePlayer();
      renderStage();
      renderBracket();
    }
  }

  function afterEntriesChanged() {
    // A bracket that points at removed people can't continue.
    if (state.bracket && state.bracket.seeds.some((id) => id && !byId(id))) state.bracket = null;
    save();
    render();
  }

  // ---------- overlays ----------
  const overlay = $('#overlay');
  const card = $('#overlay-card');
  let onClose = null;

  function openOverlay(html, cls, after, id) {
    card.className = 'ov-card ' + (cls || '');
    card.style.cssText = id ? colorVars(id) : '';
    card.innerHTML = html;
    overlay.hidden = false;
    onClose = after || null;
    const btn = card.querySelector('[data-close]');
    if (btn) btn.focus();
  }
  function closeOverlay() {
    overlay.hidden = true;
    stopConfetti();
    const fn = onClose;
    onClose = null;
    if (fn) fn();
  }

  function showEliminated(e, r, after) {
    if (!e) { if (after) after(); return; }
    const final = B().winners[r].length === 1;
    openOverlay(`
      <p class="ov-kicker">${final ? 'Runner-up' : 'Eliminated'}</p>
      <div class="ov-photo">${faceHTML(e)}<span class="stamp">OUT</span></div>
      <h2 class="ov-name" id="ov-name">${esc(e.name)}</h2>
      <p class="ov-song"><strong>${esc(titleOf(e))}</strong> goes out in the ${roundName(r).replace(/^The /, '')}.</p>
      <div class="btn-row"><button class="btn big" data-close type="button">${final ? 'Reveal the winner' : 'Next match'}</button></div>
    `, '', after, e.id);
  }

  function showChampion(e) {
    if (!e) return;
    openOverlay(`
      <p class="ov-kicker">Song of the night</p>
      <div class="ov-photo">${faceHTML(e)}</div>
      <h2 class="ov-name" id="ov-name">${esc(e.name)}</h2>
      <p class="ov-song">wins with <strong>${esc(titleOf(e))}</strong></p>
      <div class="btn-row">
        <button class="btn big" data-close data-play-after="${e.id}" type="button">▶ Play it</button>
        <button class="btn ghost" data-close type="button">Close</button>
      </div>
    `, 'champ', null, e.id);
    startConfetti();
  }

  // ---------- confetti ----------
  let confettiRaf = null;
  function startConfetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = $('#confetti');
    const ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    c.width = innerWidth * dpr;
    c.height = innerHeight * dpr;
    const colors = PALETTE.map((p) => p[0]).concat('#0e0e10');
    const bits = Array.from({ length: 180 }, () => ({
      x: Math.random() * c.width, y: -Math.random() * c.height,
      w: (4 + Math.random() * 6) * dpr, h: (8 + Math.random() * 10) * dpr,
      vy: (1.5 + Math.random() * 3) * dpr, vx: (Math.random() - 0.5) * 1.5 * dpr,
      a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.2,
      col: colors[Math.floor(Math.random() * colors.length)],
    }));
    const started = performance.now();
    const tick = (now) => {
      ctx.clearRect(0, 0, c.width, c.height);
      const keepFalling = now - started < 6000;
      let alive = 0;
      for (const b of bits) {
        b.y += b.vy; b.x += b.vx + Math.sin(b.y / 40) * 0.6; b.a += b.va;
        if (b.y > c.height && keepFalling) { b.y = -20; b.x = Math.random() * c.width; }
        if (b.y < c.height + 20) alive++;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
        ctx.fillStyle = b.col; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.a)));
        ctx.restore();
      }
      confettiRaf = alive ? requestAnimationFrame(tick) : null;
    };
    stopConfetti();
    confettiRaf = requestAnimationFrame(tick);
  }
  function stopConfetti() {
    if (confettiRaf) cancelAnimationFrame(confettiRaf);
    confettiRaf = null;
    const c = $('#confetti');
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
  }

  // ---------- events ----------
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    if (state.view === 'bracket' && t.dataset.view !== 'bracket') stopPlayer();
    state.view = t.dataset.view;
    save();
    render();
  }));

  $('#load-url').addEventListener('click', loadFromUrl);
  $('#sheet-url').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') loadFromUrl(); });

  $('#csv-file').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (f) importRows(parseCSV(await f.text()));
  });

  $('#photo-files').addEventListener('change', (ev) => {
    const files = [...ev.target.files];
    ev.target.value = '';
    if (!state.entries.length) return setMsg('Load the songs first, then the photos can match up with names.', true);
    if (files.length) bulkPhotos(files);
  });

  $('#add-entry').addEventListener('click', () => {
    state.entries = state.entries.filter((e) => !e.demo);
    state.entries.push({ id: uid(), name: '', url: '', videoId: null, start: 0, title: '', photo: null });
    afterEntriesChanged();
    const inputs = document.querySelectorAll('.entry .f-name');
    inputs[inputs.length - 1].focus();
  });

  $('#load-demo').addEventListener('click', () => {
    state.entries = DEMO.map(([name, videoId, start, title]) => ({
      id: uid(), name, url: `https://youtu.be/${videoId}`, videoId, start, title, photo: null, demo: true,
    }));
    afterEntriesChanged();
    setMsg('Loaded 7 example songs. Loading your real answers replaces them.', false);
  });

  const list = $('#entry-list');
  list.addEventListener('change', async (ev) => {
    const el = ev.target;
    const card = el.closest('.entry');
    if (!card) return;
    const e = byId(card.dataset.id);
    if (el.dataset.act === 'photo') {
      const f = el.files[0];
      if (!f) return;
      try { e.photo = await resizeImage(f); } catch { return setMsg("That photo couldn't be opened. Try a JPG or PNG.", true); }
      save();
      renderSetup();
      return;
    }
    const k = el.dataset.k;
    if (!k) return;
    const v = el.value.trim();
    if (k === 'url') {
      e.url = v;
      e.videoId = parseVideoId(v);
      const t = timeFromUrl(v);
      if (t != null && !e.start) e.start = t;
      if (e.videoId && !e.title) fetchMissingTitles();
    } else if (k === 'start') {
      const t = parseTime(v);
      e.start = t ?? e.start;
    } else {
      e[k] = v;
    }
    save();
    renderSetup();
  });

  list.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-act="remove"]');
    if (!btn) return;
    if (!btn.classList.contains('confirm')) {
      btn.classList.add('confirm');
      btn.textContent = 'Click again to remove';
      setTimeout(() => { if (btn.isConnected) { btn.classList.remove('confirm'); btn.textContent = 'Remove'; } }, 3000);
      return;
    }
    const id = btn.closest('.entry').dataset.id;
    state.entries = state.entries.filter((e) => e.id !== id);
    afterEntriesChanged();
  });

  $('#draw').addEventListener('click', (ev) => {
    const btn = ev.currentTarget;
    if (state.bracket && !btn.dataset.armed) {
      btn.dataset.armed = '1';
      btn.classList.add('danger');
      btn.textContent = 'Click again: this wipes the current bracket';
      setTimeout(() => { if (btn.dataset.armed) renderSetup(); }, 4000);
      return;
    }
    drawBracket();
  });

  $('#reshuffle').addEventListener('click', (ev) => {
    const btn = ev.currentTarget;
    if (B().history.length && !btn.dataset.armed) {
      btn.dataset.armed = '1';
      btn.textContent = 'Click again to start over';
      setTimeout(() => { delete btn.dataset.armed; btn.textContent = 'Reshuffle'; }, 4000);
      return;
    }
    delete btn.dataset.armed;
    btn.textContent = 'Reshuffle';
    stopPlayer();
    drawBracket();
  });

  $('#undo').addEventListener('click', () => { stopPlayer(); undo(); });

  $('#view-bracket').addEventListener('click', (ev) => {
    const playBtn = ev.target.closest('[data-play]');
    if (playBtn) return play(byId(playBtn.dataset.play));
    const pickBtn = ev.target.closest('[data-pick]');
    if (pickBtn) return pick(+pickBtn.dataset.r, +pickBtn.dataset.i, pickBtn.dataset.pick);
    if (ev.target.closest('[data-celebrate]')) return showChampion(byId(champion()));
    const go = ev.target.closest('[data-goto]');
    if (go) {
      stopPlayer();
      B().current = go.dataset.goto.split(',').map(Number);
      save();
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  card.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-close]');
    if (!btn) return;
    const playAfter = btn.dataset.playAfter;
    closeOverlay();
    if (playAfter) play(byId(playAfter));
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !overlay.hidden) closeOverlay();
  });

  render();
})();
