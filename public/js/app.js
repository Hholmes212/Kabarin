import { $, $$, esc, CATS, catLabel, icon, timeAgo, fullDate, readTime, compact, avatar, debounce, toast } from './util.js';
import { api, auth } from './api.js';
import { t, getLang, setLang } from './i18n.js';

const view = $('#view');
const state = {
  user: null,
  feed: { category: 'all', sort: 'latest', q: '', offset: 0, total: 0, loading: false },
  profileTab: 'posts',
  pendingScroll: null,
  route: '',
};
const LIMIT = 9;

/* ───────────────────────── helpers ───────────────────────── */
const pill = (c) => `<span class="pill" style="--c:${CATS[c]?.color || '#888'}">${esc(catLabel(c))}</span>`;
const reqAuth = (msg) => { if (state.user) return true; openAuth('login', msg); return false; };

function cover(n, cls = '') {
  if (n.media_url && n.media_type === 'video') return `<video class="cover ${cls}" src="${esc(n.media_url)}#t=0.1" muted preload="metadata"></video>`;
  if (n.media_url) return `<img class="cover ${cls}" src="${esc(n.media_url)}" alt="" loading="lazy" data-cat="${esc(n.category)}">`;
  return fallbackCover(n.category, cls);
}
const fallbackCover = (cat, cls = '') => `<div class="cover fallback ${cls}" style="--c:${CATS[cat]?.color || '#888'}"><span>${esc(catLabel(cat))}</span></div>`;
document.addEventListener('error', (e) => {
  const t = e.target;
  if (t.tagName === 'IMG' && t.classList.contains('cover')) {
    const d = document.createElement('div'); d.innerHTML = fallbackCover(t.dataset.cat, [...t.classList].filter((c) => c !== 'cover').join(' '));
    t.replaceWith(d.firstElementChild);
  }
}, true);

function statsRow(n) {
  return `<span class="stats"><span>${icon('heart', 14)} <b data-likes="${n.id}">${compact(n.likes_count)}</b></span><span>${icon('chat', 14)} ${compact(n.comments_count)}</span><span>${icon('eye', 14)} ${compact(n.views)}</span></span>`;
}

function card(n, { big = false } = {}) {
  return `<article class="card reveal ${big ? 'big' : ''}">
    <a class="card-media" href="#/news/${n.id}" aria-label="${esc(n.title)}">${cover(n)}${n.media_type === 'video' ? `<span class="play">${icon('play', 16, true)}</span>` : ''}</a>
    <button class="bm ${n.bookmarked ? 'on' : ''}" data-bm="${n.id}" aria-label="${t('Simpan berita')}" title="${t('Simpan')}">${icon('bookmark', 18, n.bookmarked)}</button>
    <div class="card-body">
      <div class="card-top">${pill(n.category)}<span class="muted">${t('{n} mnt baca', { n: readTime(n.content) })}</span></div>
      <h3><a href="#/news/${n.id}">${esc(n.title)}</a></h3>
      ${big ? `<p class="excerpt">${esc(n.content.slice(0, 170))}…</p>` : ''}
      <div class="card-foot">
        <a class="author" href="#/u/${esc(n.author)}">${avatar(n.author, 24)}<span>${esc(n.author)}</span></a>
        <span class="muted">${timeAgo(n.created_at)}</span>
        ${statsRow(n)}
      </div>
    </div>
  </article>`;
}

const cardSkeleton = (n = 6) => Array.from({ length: n }, () => `<div class="card sk"><div class="sk-media shimmer"></div><div class="card-body"><div class="shimmer sk-line w40"></div><div class="shimmer sk-line"></div><div class="shimmer sk-line w70"></div></div></div>`).join('');

function reveal(root = view) {
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -40px 0px' });
  $$('.reveal:not(.in)', root).forEach((el, i) => { el.style.transitionDelay = `${Math.min(i % 9, 8) * 40}ms`; io.observe(el); });
}

/* ───────────────────────── modal system ───────────────────────── */
function openModal(html, { cls = '', onClose } = {}) {
  const root = $('#overlay-root');
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div>`;
  root.appendChild(wrap);
  document.body.classList.add('lock');
  requestAnimationFrame(() => wrap.classList.add('in'));
  const close = () => {
    wrap.classList.remove('in');
    document.removeEventListener('keydown', esc_);
    setTimeout(() => { wrap.remove(); if (!root.children.length) document.body.classList.remove('lock'); }, 220);
    onClose?.();
  };
  const esc_ = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc_);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  $$('[data-close]', wrap).forEach((b) => b.addEventListener('click', close));
  return { el: wrap, close, $: (s) => $(s, wrap) };
}

function confirmDialog({ title, text, ok = 'Ya, lanjut', danger = true }) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal(`<h3>${esc(t(title))}</h3><p class="muted">${esc(t(text))}</p>
      <div class="row end"><button class="btn ghost" data-close>${t('Batal')}</button><button class="btn ${danger ? 'danger' : 'primary'}" id="cf-ok">${esc(t(ok))}</button></div>`,
      { cls: 'sm', onClose: () => { if (!done) resolve(false); } });
    m.$('#cf-ok').addEventListener('click', () => { done = true; resolve(true); m.close(); });
  });
}

/* ───────────────────────── auth ───────────────────────── */
function openAuth(mode = 'login', note = '') {
  let isLogin = mode === 'login';
  const m = openModal('', { cls: 'auth' });
  const draw = () => {
    m.el.firstElementChild.innerHTML = `
      <button class="x" data-close aria-label="${t('Tutup')}">${icon('x')}</button>
      <div class="auth-side"><div class="auth-art"><span class="logo-mark big">${logoSvg()}</span>
        <h3>${isLogin ? t('Halo lagi 👋') : t('Gabung Kabarin')}</h3>
        <p>${isLogin ? t('Masuk untuk like, simpan, dan ikut diskusi di setiap berita.') : t('Tulis kabar dari sekitarmu dan jangkau ribuan pembaca.')}</p></div></div>
      <form class="auth-form" novalidate>
        <div class="seg"><button type="button" class="${isLogin ? 'on' : ''}" data-mode="login">${t('Masuk')}</button><button type="button" class="${!isLogin ? 'on' : ''}" data-mode="register">${t('Daftar')}</button></div>
        ${note ? `<p class="note">${esc(t(note))}</p>` : ''}
        ${isLogin ? '' : `<label class="field"><span>${t('Username')}</span><input name="username" autocomplete="username" placeholder="${t('mis. budi_kece')}" maxlength="20"></label>`}
        <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" placeholder="${t('kamu@email.com')}" required></label>
        <label class="field"><span>Password</span><div class="pw"><input name="password" type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" placeholder="${t('Minimal 6 karakter')}" required><button type="button" class="eye" aria-label="${t('Tampilkan password')}">${icon('eye', 18)}</button></div></label>
        <p class="err" role="alert"></p>
        <button class="btn primary full" type="submit">${isLogin ? t('Masuk') : t('Buat akun')}</button>
        ${isLogin ? `<button class="btn ghost full" type="button" id="demo">${t('Coba dengan akun demo')}</button>` : ''}
      </form>`;
    const f = $('form', m.el);
    $$('[data-mode]', m.el).forEach((b) => b.addEventListener('click', () => { isLogin = b.dataset.mode === 'login'; draw(); }));
    $('.eye', m.el).addEventListener('click', () => { const i = f.password; i.type = i.type === 'password' ? 'text' : 'password'; });
    $('#demo', m.el)?.addEventListener('click', () => { f.email.value = 'redaksi@kabarin.id'; f.password.value = 'demo1234'; f.requestSubmit(); });
    $('[data-close]', m.el).addEventListener('click', m.close);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('.err', f), btn = $('button[type=submit]', f);
      err.textContent = '';
      const body = { email: f.email.value, password: f.password.value };
      if (!isLogin) body.username = f.username.value;
      btn.disabled = true; btn.classList.add('loading');
      try {
        const r = isLogin ? await api.login(body) : await api.register(body);
        auth.set(r.token); state.user = r.user;
        m.close(); renderNav(); route(true);
        toast(isLogin ? t('Selamat datang, {name}!', { name: r.user.username }) : t('Akun berhasil dibuat. Selamat bergabung!'));
      } catch (ex) {
        err.textContent = ex.message; f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
        btn.disabled = false; btn.classList.remove('loading');
      }
    });
    setTimeout(() => (f.username || f.email).focus(), 50);
  };
  draw();
}

function logout() {
  auth.set(null); state.user = null; renderNav(); toast(t('Kamu sudah keluar.'));
  if (/^(write|saved)/.test(state.route)) location.hash = '#/'; else route(true);
}

/* ───────────────────────── nav ───────────────────────── */
const logoSvg = () => `<svg viewBox="0 0 64 64" width="100%" height="100%"><rect width="64" height="64" rx="18" fill="currentColor" opacity="0"/><path d="M20 16v32M20 34l16-18M26 30l14 18" stroke="#d9ff43" stroke-width="6" stroke-linecap="round" fill="none"/><circle cx="46" cy="18" r="4" fill="#ff4d2e"/></svg>`;
function logoHTML() {
  return `<a class="logo" href="#/" aria-label="Kabarin"><span class="logo-mark"><img src="assets/logo.png" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{innerHTML:window.__logo}).firstChild)"></span><span class="logo-text">kabar<b>in</b></span></a>`;
}
window.__logo = logoSvg();

function renderNav() {
  const u = state.user;
  const dark = document.documentElement.dataset.theme === 'dark';
  $('#nav').innerHTML = `
    <div class="nav">
      ${logoHTML()}
      <nav class="links" aria-label="${t('Utama')}">
        <a href="#/" data-nav="home">${t('Beranda')}</a>
        <a href="#/" data-scroll="trending" data-nav="trending">Trending</a>
        <a href="#/" data-scroll="feed" data-nav="feed">${t('Kategori')}</a>
        <a href="#/write" data-nav="write">${t('Tulis')}</a>
      </nav>
      <div class="nav-right">
        <button class="search-btn" data-palette aria-label="${t('Cari')}">${icon('search', 16)}<span>${t('Cari berita…')}</span><kbd>Ctrl K</kbd></button>
        <button class="icon-btn" data-palette-m aria-label="${t('Cari')}" hidden>${icon('search')}</button>
        <button class="lang-btn" data-toggle-lang aria-label="${t('Ganti bahasa')}" title="${t('Ganti bahasa')}"><span class="${getLang() === 'id' ? 'on' : ''}">ID</span><span class="${getLang() === 'en' ? 'on' : ''}">EN</span></button>
        <button class="icon-btn" data-toggle-theme aria-label="${t('Ganti tema')}">${icon(dark ? 'sun' : 'moon')}</button>
        ${u ? `<div class="menu-wrap"><button class="avatar-btn" data-usermenu aria-label="${t('Menu akun')}">${avatar(u.username, 36)}</button></div>`
            : `<button class="btn ghost sm hide-m" data-auth="login">${t('Masuk')}</button><button class="btn primary sm" data-auth="register">${t('Daftar')}</button>`}
      </div>
    </div>`;
  $('#tabbar').innerHTML = `
    <a href="#/" data-nav="home">${icon('home', 22)}<span>${t('Beranda')}</span></a>
    <a href="#/" data-scroll="trending" data-nav="trending">${icon('flame', 22)}<span>Trending</span></a>
    <a href="#/write" class="fab" aria-label="${t('Tulis berita')}">${icon('plus', 26)}</a>
    <button data-palette>${icon('search', 22)}<span>${t('Cari')}</span></button>
    ${u ? `<a href="#/u/${esc(u.username)}" data-nav="profile">${icon('user', 22)}<span>${t('Profil')}</span></a>` : `<button data-auth="login">${icon('user', 22)}<span>${t('Masuk')}</span></button>`}`;
  markNav();
}
function markNav() {
  const r = state.route;
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', (a.dataset.nav === 'home' && r === 'home') || (a.dataset.nav === 'write' && r === 'write') || (a.dataset.nav === 'profile' && r === 'profile')));
}

function userMenu(btn) {
  document.querySelector('.pop')?.remove();
  const u = state.user;
  const el = document.createElement('div');
  el.className = 'pop user-pop';
  el.innerHTML = `<div class="pop-head">${avatar(u.username, 40)}<div><b>${esc(u.username)}</b><small>${esc(u.email)}</small></div></div>
    <a href="#/u/${esc(u.username)}">${icon('user', 16)} ${t('Profil saya')}</a>
    <a href="#/saved">${icon('bookmark', 16)} ${t('Tersimpan')}</a>
    <a href="#/write">${icon('edit', 16)} ${t('Tulis berita')}</a>
    <button data-logout>${icon('logout', 16)} ${t('Keluar')}</button>`;
  btn.parentElement.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  const off = (e) => { if (!el.contains(e.target) || e.target.closest('a,button')) { el.remove(); document.removeEventListener('click', off, true); } };
  setTimeout(() => document.addEventListener('click', off, true), 0);
}

/* ───────────────────────── command palette ───────────────────────── */
function openPalette() {
  if ($('.palette')) return;
  const m = openModal(`
    <div class="pal-input">${icon('search', 20)}<input id="pq" placeholder="${t('Cari judul atau isi berita…')}" autocomplete="off"><kbd>Esc</kbd></div>
    <div class="pal-list" id="plist"></div>`, { cls: 'palette' });
  const input = m.$('#pq'), list = m.$('#plist');
  let items = [], idx = 0;
  const paint = () => $$('.pal-item', list).forEach((el, i) => el.classList.toggle('sel', i === idx));
  const quick = () => {
    items = [
      ...Object.keys(CATS).map((k) => ({ t: t('Kategori: {c}', { c: catLabel(k) }), ic: 'grid', go: () => setCategory(k) })),
      { t: t('Tulis berita baru'), ic: 'edit', go: () => (location.hash = '#/write') },
      { t: document.documentElement.dataset.theme === 'dark' ? t('Ganti ke tema terang') : t('Ganti ke tema gelap'), ic: 'moon', go: toggleTheme },
    ];
    list.innerHTML = `<div class="pal-label">${t('Pintasan')}</div>` + items.map((i) => `<button class="pal-item">${icon(i.ic, 16)}<span>${esc(i.t)}</span></button>`).join('');
    idx = 0; paint();
  };
  const search = debounce(async () => {
    const q = input.value.trim();
    if (!q) return quick();
    const r = await api.news({ q, limit: 6 }).catch(() => ({ items: [], total: 0 }));
    items = r.items.map((n) => ({ t: n.title, cat: n.category, go: () => (location.hash = `#/news/${n.id}`) }));
    if (r.total > 6) items.push({ t: t('Lihat semua {n} hasil untuk “{q}”', { n: r.total, q }), ic: 'arrow', go: () => applySearch(q) });
    list.innerHTML = items.length
      ? `<div class="pal-label">${t('Hasil')}</div>` + items.map((i) => `<button class="pal-item">${i.cat ? pill(i.cat) : icon(i.ic, 16)}<span>${esc(i.t)}</span></button>`).join('')
      : `<div class="pal-empty">${t('Tidak ada berita untuk “{q}”', { q: esc(q) })}</div>`;
    idx = 0; paint();
  }, 200);
  const run = (i) => { const it = items[i]; if (!it) return; m.close(); it.go(); };
  input.addEventListener('input', search);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { idx = Math.min(items.length - 1, idx + 1); paint(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); paint(); e.preventDefault(); }
    if (e.key === 'Enter') { e.preventDefault(); if (items[idx]) run(idx); else if (input.value.trim()) { m.close(); applySearch(input.value.trim()); } }
  });
  list.addEventListener('click', (e) => { const b = e.target.closest('.pal-item'); if (b) run($$('.pal-item', list).indexOf(b)); });
  quick(); input.focus();
}

function applySearch(q) { state.feed = { ...state.feed, q, category: 'all', offset: 0 }; state.pendingScroll = 'feed'; if (state.route === 'home') homeView(true); else location.hash = '#/'; }
function setCategory(c) { state.feed = { ...state.feed, category: c, q: '', offset: 0 }; state.pendingScroll = 'feed'; if (state.route === 'home') homeView(true); else location.hash = '#/'; }

/* ───────────────────────── theme ───────────────────────── */
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('kb-theme', next); } catch (_) {}
  $('meta[name=theme-color]').content = next === 'dark' ? '#0e0e11' : '#f6f3ee';
  renderNav();
}

/* ───────────────────────── HOME ───────────────────────── */
async function homeView(keepHero = false) {
  const f = state.feed;
  if (!keepHero || !$('#feed')) {
    view.innerHTML = `
      <section class="hero">
        <div class="hero-bg"><i></i><i></i><i></i></div>
        <div class="wrap hero-grid">
          <div class="hero-copy">
            <span class="eyebrow"><span class="live"></span> ${t('Kabar terbaru, tiap hari')}</span>
            <h1>${t('Kabar dari <em>warga</em>,<br>untuk semua.')}</h1>
            <p>${t('Baca berita terkini, tulis kabar dari sekitarmu, dan ikut berdiskusi dengan komunitas pembaca yang peduli.')}</p>
            <div class="row">
              <a class="btn primary lg" href="#/" data-scroll="feed">${t('Mulai membaca')} ${icon('arrow', 18)}</a>
              <a class="btn ghost lg" href="#/write">${t('Tulis berita')}</a>
            </div>
            <div class="hero-stats" id="hstats"></div>
          </div>
          <div class="hero-stack" id="hstack"></div>
        </div>
      </section>
      <div class="ticker" id="ticker" aria-label="${t('Berita terbaru')}"></div>
      <section class="wrap sec" id="trending">
        <div class="sec-head"><div><span class="kicker">${icon('flame', 14)} ${t('Lagi ramai')}</span><h2>${t('Trending sekarang')}</h2></div>
          <div class="arrows"><button class="icon-btn round" data-car="-1" aria-label="${t('Sebelumnya')}">${icon('left')}</button><button class="icon-btn round" data-car="1" aria-label="${t('Berikutnya')}">${icon('right')}</button></div></div>
        <div class="carousel" id="car"><div class="sk-row">${'<div class="tcard sk shimmer"></div>'.repeat(3)}</div></div>
      </section>
      <section class="wrap sec" id="feed"></section>
      <section class="wrap"><div class="cta">
        <div><h2>${t('Punya kabar dari lingkunganmu?')}</h2><p>${t('Tulis dalam hitungan menit — foto atau video boleh. Pembaca lain bisa langsung like dan berkomentar.')}</p></div>
        <a class="btn lime lg" href="#/write">${t('Tulis sekarang')} ${icon('arrow', 18)}</a></div></section>
      ${footer()}`;
    api.stats().then(paintStats).catch(() => {});
    api.trending().then(paintTrending).catch(() => { $('#car').innerHTML = `<p class="muted">${t('Gagal memuat trending.')}</p>`; });
  }
  paintFeedShell();
  await loadFeed(true);
  if (state.pendingScroll) { scrollToId(state.pendingScroll); state.pendingScroll = null; }
}

function footer() {
  return `<footer class="foot"><div class="wrap foot-in"><div>${logoHTML()}<p class="muted">${t('Portal berita komunitas. Dibuat untuk berbagi kabar yang berguna.')}</p></div>
    <div class="foot-links"><a href="#/" data-scroll="trending">Trending</a><a href="#/" data-scroll="feed">${t('Kategori')}</a><a href="#/write">${t('Tulis berita')}</a></div></div>
    <div class="wrap muted small">© ${new Date().getFullYear()} Kabarin</div></footer>`;
}

function paintStats(s) {
  const el = $('#hstats'); if (!el) return;
  el.innerHTML = [['Berita', s.news], ['Penulis', s.users], ['Komentar', s.comments]].map(([l, v]) => `<div><b data-count="${v}">0</b><span>${t(l)}</span></div>`).join('');
  $$('[data-count]', el).forEach((b) => { const to = +b.dataset.count; const t0 = performance.now(); const tick = (t) => { const p = Math.min(1, (t - t0) / 900); b.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  state.counts = s.categories;
}

function paintTrending(list) {
  const stack = $('#hstack');
  if (stack) stack.innerHTML = list.slice(0, 3).map((n, i) => `<a class="mini m${i}" href="#/news/${n.id}">${cover(n)}<div class="mini-in">${pill(n.category)}<b>${esc(n.title)}</b></div></a>`).join('');
  const car = $('#car'); if (!car) return;
  car.innerHTML = `<div class="track">${list.map((n, i) => `
    <a class="tcard" href="#/news/${n.id}" draggable="false">${cover(n)}<span class="rank">${String(i + 1).padStart(2, '0')}</span>
      <div class="tc-in">${pill(n.category)}<h3>${esc(n.title)}</h3><div class="tc-meta"><span>${esc(n.author)}</span><span>·</span><span>${timeAgo(n.created_at)}</span>${statsRow(n)}</div></div></a>`).join('')}</div>`;
  const track = $('.track', car);
  let down = false, sx = 0, sl = 0, moved = false;
  track.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') return; down = true; moved = false; sx = e.clientX; sl = track.scrollLeft; });
  window.addEventListener('pointermove', (e) => { if (!down) return; const dx = e.clientX - sx; if (Math.abs(dx) > 4) moved = true; track.scrollLeft = sl - dx; });
  window.addEventListener('pointerup', () => { down = false; });
  track.addEventListener('click', (e) => { if (moved) { e.preventDefault(); moved = false; } }, true);
}

function paintTicker(items) {
  const tk = $('#ticker'); if (!tk || !items.length) return;
  const row = items.slice(0, 8).map((n) => `<a href="#/news/${n.id}"><i style="background:${CATS[n.category]?.color}"></i>${esc(n.title)}</a>`).join('');
  tk.innerHTML = `<span class="tick-label"><span class="live"></span>${t('TERBARU')}</span><div class="tick-mask"><div class="tick-track">${row}${row}</div></div>`;
}

function paintFeedShell() {
  const f = state.feed, counts = state.counts || {};
  $('#feed').innerHTML = `
    <div class="sec-head"><div><span class="kicker">${icon('grid', 14)} ${t('Jelajahi')}</span><h2>${f.q ? t('Hasil untuk “{q}”', { q: esc(f.q) }) : t('Semua kategori')}</h2></div>
      <div class="seg sm"><button class="${f.sort === 'latest' ? 'on' : ''}" data-sort="latest">${t('Terbaru')}</button><button class="${f.sort === 'trending' ? 'on' : ''}" data-sort="trending">${t('Populer')}</button></div></div>
    <div class="chips" role="tablist">
      <button class="chip ${f.category === 'all' ? 'on' : ''}" data-cat="all">${t('Semua')}</button>
      ${Object.entries(CATS).map(([k, v]) => `<button class="chip ${f.category === k ? 'on' : ''}" data-cat="${k}" style="--c:${v.color}"><i></i>${catLabel(k)}${counts[k] ? `<small>${counts[k]}</small>` : ''}</button>`).join('')}
      ${f.q ? `<button class="chip clear" data-clearq>${icon('x', 14)} ${t('Hapus pencarian')}</button>` : ''}
    </div>
    <div class="grid" id="grid"></div>
    <div class="more" id="more"></div>`;
}

async function loadFeed(reset = false) {
  const f = state.feed;
  if (f.loading) return;
  f.loading = true;
  if (reset) { f.offset = 0; $('#grid').innerHTML = cardSkeleton(6); $('#more').innerHTML = ''; }
  try {
    const r = await api.news({ category: f.category, sort: f.sort, q: f.q, limit: LIMIT, offset: f.offset });
    f.total = r.total;
    const grid = $('#grid'); if (!grid) return;
    if (reset) grid.innerHTML = '';
    if (!r.items.length && f.offset === 0) {
      grid.innerHTML = `<div class="empty"><div class="empty-ic">${icon('search', 28)}</div><h3>${t('Belum ada berita di sini')}</h3><p class="muted">${f.q ? t('Coba kata kunci lain.') : t('Jadilah yang pertama menulis di kategori ini!')}</p><a class="btn primary" href="#/write">${t('Tulis berita')}</a></div>`;
    } else {
      grid.insertAdjacentHTML('beforeend', r.items.map((n, i) => card(n, { big: f.offset === 0 && i === 0 && !f.q && f.category === 'all' && f.sort === 'latest' })).join(''));
      if (reset && f.sort === 'latest' && f.category === 'all' && !f.q) paintTicker(r.items);
    }
    f.offset += r.items.length;
    reveal($('#grid'));
    const more = $('#more');
    if (f.offset < f.total) { more.innerHTML = `<button class="btn ghost lg" id="loadMore">${t('Muat lebih banyak')} <small>${t('({n} lagi)', { n: f.total - f.offset })}</small></button>`; observeMore(); }
    else more.innerHTML = f.total > LIMIT ? `<p class="muted small">${t('Sudah sampai akhir ✨')}</p>` : '';
  } catch (e) {
    $('#grid').innerHTML = `<div class="empty"><h3>${t('Gagal memuat berita')}</h3><p class="muted">${esc(e.message)}</p><button class="btn primary" onclick="location.reload()">${t('Coba lagi')}</button></div>`;
  } finally { f.loading = false; }
}
let moreIO;
function observeMore() {
  moreIO?.disconnect();
  const b = $('#loadMore'); if (!b) return;
  moreIO = new IntersectionObserver((es) => { if (es[0].isIntersecting) loadFeed(); }, { rootMargin: '300px' });
  moreIO.observe(b);
}

/* ───────────────────────── ARTICLE ───────────────────────── */
async function articleView(id) {
  view.innerHTML = `<div class="wrap read"><div class="shimmer sk-line w40"></div><div class="shimmer sk-line" style="height:44px"></div><div class="shimmer sk-media" style="height:380px;border-radius:24px"></div></div>`;
  let n;
  try { n = await api.article(id); } catch (e) { return notFound(e.message); }
  document.title = `${n.title} — Kabarin`;
  const mine = state.user && state.user.id === n.author_id;
  const paras = n.content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  view.innerHTML = `
    <article class="wrap read">
      <a class="back" href="#/">${icon('left', 16)} ${t('Kembali')}</a>
      <div class="read-top">${pill(n.category)}<span class="muted">${icon('clock', 14)} ${t('{n} menit baca', { n: readTime(n.content) })}</span><span class="muted">${icon('eye', 14)} ${t('{n} dilihat', { n: compact(n.views) })}</span></div>
      <h1 id="artTitle">${esc(n.title)}</h1>
      <div class="byline">
        <a class="author lg" href="#/u/${esc(n.author)}">${avatar(n.author, 44)}<span><b>${esc(n.author)}</b><small title="${fullDate(n.created_at)}">${timeAgo(n.created_at)}${n.updated_at !== n.created_at ? ' · ' + t('diperbarui') : ''}</small></span></a>
        ${mine ? `<div class="row"><a class="btn ghost sm" href="#/write/${n.id}">${icon('edit', 15)} ${t('Edit')}</a><button class="btn ghost sm danger-t" data-del="${n.id}">${icon('trash', 15)} ${t('Hapus')}</button></div>` : ''}
      </div>
      ${getLang() === 'en' ? '<div class="tr-bar" id="trBar"></div>' : ''}
      ${n.media_url ? `<figure class="hero-media">${n.media_type === 'video' ? `<video src="${esc(n.media_url)}" controls playsinline preload="metadata"></video>` : `<img class="cover" src="${esc(n.media_url)}" alt="" data-cat="${esc(n.category)}">`}</figure>` : ''}
      <div class="body" id="artBody">${paras.map((p, i) => `<p class="${i === 0 ? 'lead' : ''}">${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}</div>
      <div class="end-actions" id="endAct"></div>
      <section class="comments" id="comments"><h2>${t('Diskusi')} <span id="ccount" class="muted"></span></h2><div id="cform"></div><div id="clist"></div></section>
      <section class="related" id="related"></section>
    </article>
    <div class="action-bar" id="abar">
      <button class="ab ${n.liked ? 'on like' : ''}" data-like="${n.id}" aria-label="${t('Suka')}">${icon('heart', 20, n.liked)}<b data-likes="${n.id}">${compact(n.likes_count)}</b></button>
      <button class="ab" data-gocomments aria-label="${t('Komentar')}">${icon('chat', 20)}<b id="abc">${compact(n.comments_count)}</b></button>
      <button class="ab ${n.bookmarked ? 'on' : ''}" data-bm="${n.id}" aria-label="${t('Simpan')}">${icon('bookmark', 20, n.bookmarked)}</button>
      <button class="ab" data-share="${n.id}" aria-label="${t('Bagikan')}">${icon('share', 20)}<b id="shc">${compact(n.shares_count)}</b></button>
    </div>
    ${footer()}`;
  view.dataset.title = n.title; view.dataset.id = n.id;
  // hitung view sekali per sesi
  try { const k = 'kb-v' + n.id; if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, 1); api.view(n.id); } } catch (_) { api.view(n.id); }
  loadComments(n.id);
  setupTranslate(n, paras);
  api.news({ category: n.category, limit: 4 }).then((r) => {
    const rel = r.items.filter((x) => x.id !== n.id).slice(0, 3);
    if (rel.length && $('#related')) { $('#related').innerHTML = `<h2>${t('Baca juga')}</h2><div class="grid three">${rel.map((x) => card(x)).join('')}</div>`; reveal($('#related')); }
  }).catch(() => {});
}

function setupTranslate(n, paras) {
  const bar = $('#trBar'); if (!bar) return;
  const titleEl = $('#artTitle'), bodyEl = $('#artBody');
  let cache = null, shown = false;
  const paintBar = (busy = false) => {
    bar.innerHTML = busy
      ? `<span class="muted">${t('Sedang menerjemahkan…')}</span>`
      : `<button class="btn ghost sm" type="button" data-tr>${icon('globe', 15)} ${shown ? t('Tampilkan teks asli') : t('Terjemahkan ke Inggris')}</button>${shown ? `<small class="muted">${t('Diterjemahkan otomatis dari bahasa Indonesia')}</small>` : ''}`;
  };
  const paint = () => {
    titleEl.textContent = shown ? cache[0] : n.title;
    bodyEl.innerHTML = (shown ? cache.slice(1) : paras).map((p, i) => `<p class="${i === 0 ? 'lead' : ''}">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
    document.title = `${shown ? cache[0] : n.title} — Kabarin`;
  };
  paintBar();
  bar.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-tr]')) return;
    if (!shown && !cache) {
      paintBar(true);
      try {
        const r = await api.translate([n.title, ...paras]);
        if (!Array.isArray(r.translations) || r.translations.length !== paras.length + 1) throw new Error(t('Gagal menerjemahkan. Coba lagi nanti.'));
        cache = r.translations;
      } catch (ex) {
        if (bar.isConnected) { paintBar(); toast(ex.message, 'err'); }
        return;
      }
    }
    if (!bar.isConnected) return; // pengguna sudah pindah halaman
    shown = !shown; paint(); paintBar();
  });
}

async function loadComments(id) {
  const form = $('#cform'), list = $('#clist'); if (!form) return;
  form.innerHTML = state.user
    ? `<form class="cform"><div class="cf-row">${avatar(state.user.username, 40)}<div class="cf-box"><textarea maxlength="500" rows="2" placeholder="${t('Tulis tanggapanmu…')}"></textarea><div class="cf-foot"><small class="muted" id="cc">0/500</small><button class="btn primary sm" type="submit" disabled>${t('Kirim')}</button></div></div></div></form>`
    : `<div class="login-prompt"><span>${t('Mau ikut berdiskusi?')}</span><button class="btn primary sm" data-auth="login">${t('Masuk untuk berkomentar')}</button></div>`;
  const f = $('form', form);
  if (f) {
    const ta = $('textarea', f), btn = $('button', f);
    ta.addEventListener('input', () => { btn.disabled = !ta.value.trim(); $('#cc').textContent = `${ta.value.length}/500`; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; });
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); btn.disabled = true;
      try {
        const c = await api.addComment(id, ta.value);
        ta.value = ''; ta.style.height = 'auto'; $('#cc').textContent = '0/500';
        const l = $('#clist'); l.querySelector('.empty-c')?.remove(); l.insertAdjacentHTML('afterbegin', commentHTML(c, true));
        bumpComments(1);
      } catch (ex) { toast(ex.message, 'err'); btn.disabled = false; }
    });
  }
  try {
    const cs = await api.comments(id);
    list.innerHTML = cs.length ? cs.map((c) => commentHTML(c)).join('') : `<p class="empty-c muted">${t('Belum ada komentar. Jadilah yang pertama!')}</p>`;
    $('#ccount').textContent = `(${cs.length})`;
  } catch { list.innerHTML = `<p class="muted">${t('Gagal memuat komentar.')}</p>`; }
}
const commentHTML = (c, fresh) => `<div class="comment ${fresh ? 'fresh' : ''}" data-cid="${c.id}">${avatar(c.username, 36)}<div class="c-body"><div class="c-head"><a href="#/u/${esc(c.username)}"><b>${esc(c.username)}</b></a><small class="muted">${timeAgo(c.created_at)}</small>${state.user?.id === c.user_id ? `<button class="c-del" data-cdel="${c.id}" aria-label="${t('Hapus komentar')}">${icon('trash', 14)}</button>` : ''}</div><p>${esc(c.content).replace(/\n/g, '<br>')}</p></div></div>`;
function bumpComments(d) {
  const el = $('#ccount'); if (el) { const n = Math.max(0, (parseInt(el.textContent.replace(/\D/g, '')) || 0) + d); el.textContent = `(${n})`; }
  const b = $('#abc'); if (b) b.textContent = Math.max(0, (parseInt(b.textContent) || 0) + d);
}

/* ───────────────────────── like / bookmark / share ───────────────────────── */
async function toggleLike(btn) {
  if (!reqAuth('Masuk dulu untuk menyukai berita ini.')) return;
  const id = btn.dataset.like;
  try {
    const r = await api.like(id);
    btn.classList.toggle('on', r.liked); btn.classList.toggle('like', r.liked);
    btn.innerHTML = `${icon('heart', 20, r.liked)}<b data-likes="${id}">${compact(r.likes_count)}</b>`;
    if (r.liked) burst(btn);
  } catch (e) { toast(e.message, 'err'); }
}
function burst(btn) {
  for (let i = 0; i < 8; i++) {
    const p = document.createElement('i'); p.className = 'particle';
    const a = (Math.PI * 2 * i) / 8, d = 34 + Math.random() * 14;
    p.style.setProperty('--x', Math.cos(a) * d + 'px'); p.style.setProperty('--y', Math.sin(a) * d + 'px');
    btn.appendChild(p); setTimeout(() => p.remove(), 700);
  }
  btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
}
async function toggleBookmark(btn) {
  if (!reqAuth('Masuk dulu untuk menyimpan berita.')) return;
  const id = btn.dataset.bm;
  try {
    const r = await api.bookmark(id);
    $$(`[data-bm="${id}"]`).forEach((b) => { b.classList.toggle('on', r.bookmarked); b.innerHTML = icon('bookmark', b.classList.contains('ab') ? 20 : 18, r.bookmarked); });
    toast(r.bookmarked ? t('Disimpan ke koleksimu') : t('Dihapus dari tersimpan'));
  } catch (e) { toast(e.message, 'err'); }
}
function shareMenu(btn) {
  $('.share-pop')?.remove();
  const id = btn.dataset.share, url = `${location.origin}/#/news/${id}`, title = view.dataset.title || 'Kabarin';
  const el = document.createElement('div'); el.className = 'pop share-pop';
  const enc = encodeURIComponent;
  el.innerHTML = `<button data-copy>${icon('link', 16)} ${t('Salin tautan')}</button>
    <a target="_blank" rel="noopener" href="https://wa.me/?text=${enc(title + ' ' + url)}">WhatsApp</a>
    <a target="_blank" rel="noopener" href="https://t.me/share/url?url=${enc(url)}&text=${enc(title)}">Telegram</a>
    <a target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(title)}">X / Twitter</a>
    ${navigator.share ? `<button data-native>${icon('share', 16)} ${t('Lainnya…')}</button>` : ''}`;
  $('#abar').appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  const count = async () => { try { const r = await api.share(id); $('#shc').textContent = compact(r.shares_count); } catch (_) {} };
  el.addEventListener('click', async (e) => {
    const t = e.target.closest('button,a'); if (!t) return;
    if (t.dataset.copy !== undefined) { try { await navigator.clipboard.writeText(url); toast(t('Tautan disalin')); } catch { toast(t('Gagal menyalin'), 'err'); } }
    if (t.dataset.native !== undefined) { try { await navigator.share({ title, url }); } catch { return; } }
    count(); el.remove();
  });
  const off = (e) => { if (!el.contains(e.target) && !btn.contains(e.target)) { el.remove(); document.removeEventListener('click', off, true); } };
  setTimeout(() => document.addEventListener('click', off, true), 0);
}

async function deleteArticle(id) {
  if (!(await confirmDialog({ title: 'Hapus berita ini?', text: 'Berita beserta komentar dan like-nya akan dihapus permanen.', ok: 'Hapus' }))) return;
  try { await api.remove(id); toast(t('Berita dihapus')); location.hash = '#/'; } catch (e) { toast(e.message, 'err'); }
}

/* ───────────────────────── WRITE ───────────────────────── */
async function writeView(id) {
  if (!state.user) {
    view.innerHTML = `<div class="wrap gate"><div class="empty"><div class="empty-ic">${icon('edit', 28)}</div><h3>${t('Masuk dulu untuk menulis')}</h3><p class="muted">${t('Akun gratis, cuma butuh satu menit.')}</p><div class="row"><button class="btn primary" data-auth="login">${t('Masuk')}</button><button class="btn ghost" data-auth="register">${t('Daftar')}</button></div></div></div>`;
    return;
  }
  let editing = null;
  if (id) {
    try { editing = await api.article(id); } catch (e) { return notFound(e.message); }
    if (editing.author_id !== state.user.id) return notFound('Kamu tidak bisa mengedit berita ini.');
  }
  let draft = {};
  if (!editing) { try { draft = JSON.parse(localStorage.getItem('kb-draft') || '{}'); } catch (_) {} }
  const data = { title: editing?.title ?? draft.title ?? '', content: editing?.content ?? draft.content ?? '', category: editing?.category ?? draft.category ?? '' };
  let file = null, removeMedia = false, objUrl = null;

  view.innerHTML = `
    <div class="wrap write">
      <a class="back" href="${editing ? '#/news/' + editing.id : '#/'}">${icon('left', 16)} ${t('Batal')}</a>
      <div class="write-head"><h1>${editing ? t('Edit berita') : t('Tulis berita baru')}</h1><p class="muted">${editing ? t('Perbarui isi beritamu.') : t('Ceritakan kabar yang kamu lihat. Singkat, jelas, dan jujur.')}</p></div>
      <div class="write-grid">
        <form class="panel" id="wf" novalidate>
          <label class="field"><span>${t('Judul')} <small id="tc" class="muted"></small></span><input id="wt" maxlength="150" placeholder="${t('Judul yang menarik & informatif')}" value="${esc(data.title)}"></label>
          <div class="field"><span>${t('Kategori')}</span><div class="chips pick">${Object.entries(CATS).map(([k, v]) => `<button type="button" class="chip ${data.category === k ? 'on' : ''}" data-pick="${k}" style="--c:${v.color}"><i></i>${catLabel(k)}</button>`).join('')}</div></div>
          <label class="field"><span>${t('Isi berita')} <small id="cc2" class="muted"></small></span><textarea id="wc" rows="10" placeholder="${t('Apa yang terjadi? Siapa, kapan, di mana, mengapa… Pisahkan paragraf dengan baris kosong.')}">${esc(data.content)}</textarea></label>
          <div class="field"><span>${t('Foto / video')} <small class="muted">${t('(opsional, maks 25MB)')}</small></span>
            <div class="drop" id="drop" tabindex="0"><input type="file" id="wm" accept="image/*,video/mp4,video/quicktime,video/webm" hidden>
              <div id="dropIn"></div></div></div>
          <p class="err" id="werr" role="alert"></p>
          <div class="row end"><span class="muted small" id="saved"></span><button class="btn primary lg" type="submit">${editing ? t('Simpan perubahan') : t('Terbitkan')}</button></div>
        </form>
        <aside class="preview"><div class="sticky"><span class="kicker">${t('Pratinjau kartu')}</span><div id="pv"></div><p class="muted small">${t('Begini tampilan beritamu di beranda.')}</p></div></aside>
      </div>
    </div>`;

  const $t = $('#wt'), $c = $('#wc'), drop = $('#drop'), inp = $('#wm');
  const mediaNow = () => file ? { url: objUrl, type: file.type.startsWith('video') ? 'video' : 'image' } : (!removeMedia && editing?.media_url ? { url: editing.media_url, type: editing.media_type } : null);
  const paintDrop = () => {
    const m = mediaNow();
    $('#dropIn').innerHTML = m
      ? `<div class="dz-prev">${m.type === 'video' ? `<video src="${m.url}" muted></video>` : `<img src="${m.url}" alt="">`}<div class="dz-act"><button type="button" class="btn ghost sm" data-change>${t('Ganti')}</button><button type="button" class="btn ghost sm danger-t" data-rm>${t('Hapus')}</button></div></div>`
      : `<div class="dz-empty">${icon('upload', 26)}<b>${t('Tarik file ke sini')}</b><span>${t('atau klik untuk memilih gambar / video')}</span></div>`;
  };
  const paintPreview = () => {
    const m = mediaNow();
    const fake = { id: 0, title: $t.value || t('Judul beritamu akan tampil di sini'), content: $c.value || ' ', category: data.category || 'Technology', media_url: m?.url, media_type: m?.type, author: state.user.username, created_at: new Date().toISOString().slice(0, 19).replace('T', ' '), likes_count: 0, comments_count: 0, views: 0 };
    $('#pv').innerHTML = card(fake).replace('reveal', 'reveal in').replace(/href="[^"]*"/g, 'href="javascript:void(0)"');
    $('#tc').textContent = `${$t.value.length}/150`; $('#cc2').textContent = t('{n} kata', { n: $c.value.trim().split(/\s+/).filter(Boolean).length });
  };
  const saveDraft = debounce(() => { if (editing) return; try { localStorage.setItem('kb-draft', JSON.stringify({ title: $t.value, content: $c.value, category: data.category })); $('#saved').textContent = t('Draf tersimpan'); } catch (_) {} }, 500);
  const setFile = (f) => {
    if (!f) return;
    if (!/^(image|video)\//.test(f.type)) return toast(t('File harus gambar atau video'), 'err');
    if (f.size > 25 * 1024 * 1024) return toast(t('Ukuran file maksimal 25MB'), 'err');
    if (objUrl) URL.revokeObjectURL(objUrl);
    file = f; objUrl = URL.createObjectURL(f); removeMedia = false; paintDrop(); paintPreview();
  };
  paintDrop(); paintPreview();
  [$t, $c].forEach((el) => el.addEventListener('input', () => { paintPreview(); saveDraft(); }));
  $$('[data-pick]').forEach((b) => b.addEventListener('click', () => { data.category = b.dataset.pick; $$('[data-pick]').forEach((x) => x.classList.toggle('on', x === b)); paintPreview(); saveDraft(); }));
  drop.addEventListener('click', (e) => {
    if (e.target.closest('[data-rm]')) { file = null; removeMedia = true; inp.value = ''; paintDrop(); paintPreview(); return; }
    inp.click();
  });
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
  inp.addEventListener('change', () => setFile(inp.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => setFile(e.dataTransfer.files[0]));

  $('#wf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#werr'), btn = $('#wf button[type=submit]'); err.textContent = '';
    if ($t.value.trim().length < 5) return (err.textContent = t('Judul minimal 5 karakter.'));
    if (!data.category) return (err.textContent = t('Pilih kategori dulu.'));
    if ($c.value.trim().length < 30) return (err.textContent = t('Isi berita minimal 30 karakter.'));
    const fd = new FormData();
    fd.append('title', $t.value.trim()); fd.append('content', $c.value.trim()); fd.append('category', data.category);
    if (file) fd.append('media', file); if (removeMedia && !file) fd.append('remove_media', '1');
    btn.disabled = true; btn.classList.add('loading');
    try {
      const n = editing ? await api.update(editing.id, fd) : await api.create(fd);
      try { localStorage.removeItem('kb-draft'); } catch (_) {}
      toast(editing ? t('Perubahan disimpan') : t('Berita terbit! 🎉'));
      location.hash = `#/news/${n.id}`;
    } catch (ex) { err.textContent = ex.message; btn.disabled = false; btn.classList.remove('loading'); }
  });
}

/* ───────────────────────── PROFILE ───────────────────────── */
async function profileView(username, tab) {
  let u;
  try { u = await api.user(username); } catch (e) { return notFound(e.message); }
  const me = state.user && state.user.username.toLowerCase() === u.username.toLowerCase();
  if (tab === 'saved' && !me) tab = 'posts';
  document.title = `${u.username} — Kabarin`;
  view.innerHTML = `
    <div class="wrap profile">
      <div class="p-head">
        <div class="p-av">${avatar(u.username, 96)}</div>
        <div class="p-info">
          <h1>${esc(u.username)}</h1>
          <p class="bio" id="bio">${esc(u.bio) || (me ? `<span class="muted">${t('Tambahkan bio singkat tentangmu…')}</span>` : `<span class="muted">${t('Belum ada bio.')}</span>`)}</p>
          ${me ? `<button class="btn ghost sm" id="editBio">${icon('edit', 14)} ${t('Edit bio')}</button>` : ''}
          <div class="p-stats"><div><b>${u.posts}</b><span>${t('Berita')}</span></div><div><b>${compact(u.likes)}</b><span>${t('Suka')}</span></div><div><b>${compact(u.views)}</b><span>${t('Dilihat')}</span></div></div>
        </div>
      </div>
      <div class="seg tabs"><button class="${tab === 'posts' ? 'on' : ''}" data-ptab="posts">${t('Tulisan')}</button>${me ? `<button class="${tab === 'saved' ? 'on' : ''}" data-ptab="saved">${t('Tersimpan')}</button>` : ''}</div>
      <div class="grid" id="pgrid">${cardSkeleton(3)}</div>
    </div>${footer()}`;
  $$('[data-ptab]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.ptab === 'saved' ? '#/saved' : `#/u/${u.username}`; }));
  $('#editBio')?.addEventListener('click', () => {
    $('#bio').innerHTML = `<textarea id="bioIn" maxlength="160" rows="2">${esc(u.bio)}</textarea>`;
    const b = $('#editBio'); b.innerHTML = `${icon('check', 14)} ${t('Simpan')}`;
    const ta = $('#bioIn'); ta.focus();
    b.addEventListener('click', async () => { try { const r = await api.updateBio(ta.value); state.user = { ...state.user, bio: r.user.bio }; toast(t('Bio diperbarui')); profileView(username, tab); } catch (e) { toast(e.message, 'err'); } }, { once: true });
  });
  try {
    const r = await api.news(tab === 'saved' ? { saved: 1, limit: 30 } : { author: u.username, limit: 30 });
    $('#pgrid').innerHTML = r.items.length ? r.items.map((n) => card(n)).join('')
      : `<div class="empty"><div class="empty-ic">${icon(tab === 'saved' ? 'bookmark' : 'edit', 28)}</div><h3>${tab === 'saved' ? t('Belum ada berita tersimpan') : t('Belum ada tulisan')}</h3><p class="muted">${tab === 'saved' ? t('Tekan ikon bookmark di berita untuk menyimpannya.') : me ? t('Yuk tulis berita pertamamu.') : ''}</p>${tab === 'saved' ? '' : me ? `<a class="btn primary" href="#/write">${t('Tulis berita')}</a>` : ''}</div>`;
    reveal($('#pgrid'));
  } catch (e) { $('#pgrid').innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
}

function notFound(msg = 'Halaman yang kamu cari tidak ada.') {
  view.innerHTML = `<div class="wrap gate"><div class="empty"><div class="big404">404</div><h3>${t('Ups, nggak ketemu')}</h3><p class="muted">${esc(t(msg))}</p><a class="btn primary" href="#/">${t('Kembali ke beranda')}</a></div></div>`;
}

/* ───────────────────────── router ───────────────────────── */
function applyStaticLang() {
  document.documentElement.lang = getLang();
  $('meta[name=description]').content = t('Portal berita komunitas: baca, tulis, dan diskusikan kabar terkini.');
  $('#tabbar').setAttribute('aria-label', t('Navigasi utama'));
  $('#toTop').setAttribute('aria-label', t('Kembali ke atas'));
}

function switchLang() {
  setLang(getLang() === 'id' ? 'en' : 'id');
  applyStaticLang();
  const y = scrollY;
  document.querySelector('.pop')?.remove();
  $('#overlay-root').innerHTML = ''; document.body.classList.remove('lock');
  renderNav();
  state.route = ''; state.pendingScroll = null; // paksa halaman aktif digambar ulang
  route().then(() => window.scrollTo(0, y));
}

function scrollToId(id) { const el = document.getElementById(id); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 90, behavior: 'smooth' }); }

async function route(refresh = false) {
  const h = location.hash.replace(/^#\/?/, '');
  const [a, b] = h.split('/');
  const name = !a ? 'home' : a === 'news' ? 'article' : a === 'write' ? 'write' : a === 'u' || a === 'saved' ? 'profile' : 'nf';
  const same = refresh && name === 'home' && state.route === 'home';
  state.route = name;
  markNav();
  document.title = t('Kabarin — Kabar dari warga, untuk warga');
  $('#progress').style.opacity = name === 'article' ? 1 : 0;
  if (!same) { view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); if (!state.pendingScroll) window.scrollTo(0, 0); }
  if (name === 'home') await homeView(same);
  else if (name === 'article') await articleView(b);
  else if (name === 'write') await writeView(b);
  else if (name === 'profile') { if (a === 'saved') { if (!state.user) { notFound('Masuk dulu untuk melihat berita tersimpan.'); openAuth('login'); } else { state.route = 'profile'; await profileView(state.user.username, 'saved'); } } else await profileView(decodeURIComponent(b || ''), 'posts'); }
  else notFound();
  markNav();
}

/* ───────────────────────── global events ───────────────────────── */
document.addEventListener('click', (e) => {
  const hit = (s) => e.target.closest(s);
  let el;
  if ((el = hit('[data-auth]'))) { e.preventDefault(); openAuth(el.dataset.auth); }
  else if ((el = hit('[data-palette],[data-palette-m]'))) openPalette();
  else if (hit("[data-toggle-theme]")) toggleTheme();
  else if (hit('[data-toggle-lang]')) switchLang();
  else if ((el = hit('[data-usermenu]'))) userMenu(el);
  else if (hit('[data-logout]')) logout();
  else if ((el = hit('[data-like]'))) toggleLike(el);
  else if ((el = hit('[data-bm]'))) { e.preventDefault(); toggleBookmark(el); }
  else if ((el = hit('[data-share]'))) shareMenu(el);
  else if ((el = hit('[data-del]'))) deleteArticle(el.dataset.del);
  else if (hit('[data-gocomments]')) scrollToId('comments');
  else if ((el = hit('[data-cdel]'))) {
    confirmDialog({ title: 'Hapus komentar?', text: 'Komentar ini akan dihapus permanen.', ok: 'Hapus' }).then(async (ok) => {
      if (!ok) return;
      try { await api.delComment(el.dataset.cdel); el.closest('.comment').remove(); bumpComments(-1); if (!$('#clist .comment')) $('#clist').innerHTML = `<p class="empty-c muted">${t('Belum ada komentar. Jadilah yang pertama!')}</p>`; toast(t('Komentar dihapus')); } catch (x) { toast(x.message, 'err'); }
    });
  }
  else if ((el = hit('[data-car]'))) { const tr = $('.track'); tr?.scrollBy({ left: el.dataset.car * 380, behavior: 'smooth' }); }
  else if ((el = hit('[data-cat]'))) { state.feed.category = el.dataset.cat; $$('[data-cat]').forEach((c) => c.classList.toggle('on', c === el)); loadFeed(true); }
  else if ((el = hit('[data-sort]'))) { state.feed.sort = el.dataset.sort; $$('[data-sort]').forEach((c) => c.classList.toggle('on', c === el)); loadFeed(true); }
  else if (hit('[data-clearq]')) { state.feed.q = ''; homeView(true); }
  else if (hit('#loadMore')) loadFeed();
  if ((el = hit('[data-scroll]'))) {
    const id = el.dataset.scroll;
    if (state.route === 'home') { e.preventDefault(); scrollToId(id); } else state.pendingScroll = id;
  }
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
  else if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); openPalette(); }
});
window.addEventListener('hashchange', () => route());
window.addEventListener('scroll', () => {
  const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
  $('#progress').style.transform = `scaleX(${max > 0 ? y / max : 0})`;
  $('#toTop').classList.toggle('show', y > 700);
  $('#nav').classList.toggle('stuck', y > 10);
}, { passive: true });
$('#toTop').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

(async function init() {
  if (auth.token) { try { state.user = (await api.me()).user; } catch (e) { if (e.status === 401) auth.set(null); } }
  applyStaticLang();
  renderNav();
  route();
})();
