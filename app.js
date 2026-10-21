const API = 'https://graphql.anilist.co';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gql(query, variables) {
  for (let i = 0; i < 8; i++) {
    let r;
    try {
      r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables })
      });
    } catch (e) {
      // Rate-limit responses often lack CORS headers, so the browser reports a network error
      $('#status').textContent = `Network/rate limit hiccup, retrying in 30s (attempt ${i + 1}/8)…`;
      await sleep(30000);
      continue;
    }
    if (r.status === 429 || r.status >= 500) {
      $('#status').textContent = `Rate limited, waiting before retry (attempt ${i + 1}/8)…`;
      await sleep((+r.headers.get('Retry-After') || 30) * 1000);
      continue;
    }
    const j = await r.json();
    if (j.errors) throw new Error(j.errors[0].message);
    return j.data;
  }
  throw new Error('Rate limited or network unavailable');
}

const media = 'id siteUrl title{userPreferred} coverImage{medium}';
const stat = (extra) => `count meanScore standardDeviation
  genres(limit:15,sort:COUNT_DESC){genre count meanScore}
  tags(limit:15,sort:COUNT_DESC){tag{name} count meanScore}
  formats{format count} statuses{status count} countries{country count}
  releaseYears{releaseYear count meanScore} startYears{startYear count}
  scores{score count} lengths{length count}
  staff(limit:10,sort:COUNT_DESC){staff{name{userPreferred}} count meanScore}
  studios(limit:10,sort:COUNT_DESC){studio{name} count meanScore}
  ${extra}`;

const USER_Q = `query($name:String){User(name:$name){
  id name siteUrl createdAt updatedAt about(asHtml:true) bannerImage donatorTier donatorBadge
  avatar{large}
  options{titleLanguage displayAdultContent profileColor staffNameLanguage restrictMessagesToFollowing}
  mediaListOptions{scoreFormat rowOrder}
  favourites{
    anime{nodes{${media}}} manga{nodes{${media}}}
    characters{nodes{id siteUrl name{userPreferred} image{medium}}}
    staff{nodes{id siteUrl name{userPreferred} image{medium}}}
    studios{nodes{id siteUrl name}}}
  statistics{
    anime{${stat('minutesWatched episodesWatched voiceActors(limit:10,sort:COUNT_DESC){voiceActor{name{userPreferred}} count}')}}
    manga{${stat('chaptersRead volumesRead')}}}
}}`;

const FOLLOW_Q = `query($id:Int!){
  a:Page(perPage:1){pageInfo{total} followers(userId:$id){id}}
  b:Page(perPage:1){pageInfo{total} following(userId:$id){id}}
  c:Page(perPage:1){pageInfo{total} reviews(userId:$id){id}}
  d:Page(perPage:1){pageInfo{total} threads(userId:$id){id}}
}`;

const ACT_Q = `query($id:Int,$page:Int){Page(page:$page,perPage:50){pageInfo{hasNextPage}
  activities(userId:$id,type:MANGA_LIST,sort:ID_DESC){... on ListActivity{id status progress createdAt media{id title{userPreferred} siteUrl}}}}}`;

const LIST_Q = `query($id:Int,$type:MediaType){MediaListCollection(userId:$id,type:$type){lists{name status
  entries{status score progress progressVolumes repeat startedAt{year month day} completedAt{year month day} updatedAt notes
  media{id siteUrl format chapters episodes title{userPreferred}}}}}}`;

let user, activities = [], period = 'week', lists = {};

$('#f').onsubmit = e => { e.preventDefault(); load($('#name').value.trim()); };
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tab').forEach(t => t.hidden = t.id !== b.dataset.t);
  if (b.dataset.t === 'lists') showLists();
});

async function load(name) {
  const st = $('#status');
  $('#app').hidden = true;
  try {
    st.textContent = 'Loading profile…';
    user = (await gql(USER_Q, { name })).User;
    const fd = await gql(FOLLOW_Q, { id: user.id });
    user.counts = { followers: fd.a.pageInfo.total, following: fd.b.pageInfo.total, reviews: fd.c.pageInfo.total, threads: fd.d.pageInfo.total };
    renderProfile(); renderStats(); renderFavs();
    $('#app').hidden = false;
    activities = []; lists = {};
    for (let p = 1; ; p++) {
      st.textContent = `Loading manga activity… page ${p} (${activities.length} entries)`;
      const d = (await gql(ACT_Q, { id: user.id, page: p })).Page;
      activities.push(...d.activities.filter(a => a.id));
      if (p === 1 || p % 10 === 0 || !d.pageInfo.hasNextPage) renderReads();
      if (!d.pageInfo.hasNextPage) break;
      await sleep(1500);
    }
    st.textContent = `Loaded ${activities.length} manga activities.`;
  } catch (e) {
    st.textContent = 'Error: ' + e.message;
    if (activities.length) {
      renderReads();
      st.textContent += ` Showing the ${activities.length} activities loaded so far.`;
    }
  }
}

const fmtDate = ts => new Date(ts * 1000).toLocaleString();
const days = ts => Math.floor((Date.now() / 1000 - ts) / 86400);

function renderProfile() {
  const u = user, c = u.counts, o = u.options, s = u.statistics;
  $('#profile').innerHTML = `
    <div class="banner" style="background-image:url('${esc(u.bannerImage || '')}')"></div>
    <div class="head"><img src="${esc(u.avatar.large)}" alt="">
      <div><h1><a href="${esc(u.siteUrl)}">${esc(u.name)}</a></h1>
      <div class="note">Joined ${fmtDate(u.createdAt)} (${days(u.createdAt)} days ago) · Title language: ${esc(o.titleLanguage)} ·
      Score format: ${esc(u.mediaListOptions.scoreFormat)} · Adult content: ${o.displayAdultContent} · Colour: ${esc(o.profileColor)}</div>
      <div>${u.about || ''}</div></div></div>
    <div class="grid">${[
      ['Followers', c.followers], ['Following', c.following], ['Reviews', c.reviews], ['Threads', c.threads],
      ['Anime', s.anime.count], ['Days watched', (s.anime.minutesWatched / 1440).toFixed(1)], ['Episodes', s.anime.episodesWatched],
      ['Manga', s.manga.count], ['Chapters read', s.manga.chaptersRead], ['Volumes read', s.manga.volumesRead],
      ['Anime mean', s.anime.meanScore], ['Manga mean', s.manga.meanScore]
    ].map(([k, v]) => `<div class="box">${k}<b>${esc(v)}</b></div>`).join('')}</div>`;
}

function bars(title, rows, label, val, extra) {
  const max = Math.max(1, ...rows.map(val));
  return `<div class="box"><h3>${title}</h3><table>${rows.map(r => `<tr><td>${esc(label(r))}</td>
    <td style="width:45%"><div class="bar" style="width:${val(r) / max * 100}%"></div></td>
    <td>${val(r)}${extra ? ' · ' + esc(extra(r)) : ''}</td></tr>`).join('')}</table></div>`;
}

const PALETTE = ['#3db4f2', '#c063ff', '#4cca51', '#f79a63', '#e85d75', '#f7d154', '#5cd6c4', '#8a7cff', '#ff8fb3', '#9fadbd', '#7bd88f', '#ffb86b'];
const charts = {};
function mk(id, cfg) {
  const el = document.getElementById(id);
  if (!el || typeof Chart === 'undefined') return;
  charts[id]?.destroy();
  Chart.defaults.color = '#9fadbd';
  Chart.defaults.borderColor = '#222f42';
  charts[id] = new Chart(el, { ...cfg, options: { responsive: true, maintainAspectRatio: false, ...cfg.options } });
}
const cv = id => `<div class="chart"><canvas id="${id}"></canvas></div>`;
const dough = (id, title, rows, label, val) => mk(id, {
  type: 'doughnut',
  data: { labels: rows.map(label), datasets: [{ data: rows.map(val), backgroundColor: PALETTE, borderWidth: 0 }] },
  options: { plugins: { title: { display: true, text: title, color: '#e6edf5' }, legend: { position: 'right', labels: { boxWidth: 12 } } } }
});
const barc = (id, title, rows, label, val, type = 'bar') => mk(id, {
  type,
  data: { labels: rows.map(label), datasets: [{ label: title, data: rows.map(val), backgroundColor: '#3db4f2', borderColor: '#3db4f2', tension: .3 }] },
  options: { plugins: { title: { display: true, text: title, color: '#e6edf5' }, legend: { display: false } } }
});

function statCharts(p, s) {
  const gen = s.genres.slice(0, 10);
  dough(p + 'g', 'Top genres', gen, r => r.genre, r => r.count);
  dough(p + 'f', 'Formats', s.formats, r => r.format, r => r.count);
  dough(p + 's', 'Statuses', s.statuses, r => r.status, r => r.count);
  barc(p + 'sc', 'Score distribution', s.scores, r => r.score, r => r.count);
  barc(p + 'ry', 'Release years', [...s.releaseYears].sort((a, b) => a.releaseYear - b.releaseYear), r => r.releaseYear, r => r.count, 'line');
  mk(p + 'gm', {
    type: 'bar',
    data: { labels: gen.map(r => r.genre), datasets: [{ label: 'Mean score', data: gen.map(r => r.meanScore), backgroundColor: '#c063ff' }] },
    options: { indexAxis: 'y', plugins: { title: { display: true, text: 'Mean score by genre', color: '#e6edf5' }, legend: { display: false } } }
  });
}

function statBlock(t, s, p) {
  const m = r => `mean ${r.meanScore}`;
  return `<h2>${t}</h2><div class="two">${['g', 'f', 's', 'sc', 'ry', 'gm'].map(k => cv(p + k)).join('')}</div>
  <div class="two">
    ${bars('Genres', s.genres, r => r.genre, r => r.count, m)}
    ${bars('Tags', s.tags, r => r.tag.name, r => r.count, m)}
    ${bars('Formats', s.formats, r => r.format, r => r.count)}
    ${bars('Statuses', s.statuses, r => r.status, r => r.count)}
    ${bars('Countries', s.countries, r => r.country, r => r.count)}
    ${bars('Scores', s.scores, r => r.score, r => r.count)}
    ${bars('Release years', s.releaseYears, r => r.releaseYear, r => r.count, m)}
    ${bars('Start years', s.startYears, r => r.startYear, r => r.count)}
    ${bars('Lengths', s.lengths, r => r.length, r => r.count)}
    ${bars('Staff', s.staff, r => r.staff.name.userPreferred, r => r.count, m)}
    ${bars('Studios', s.studios, r => r.studio.name, r => r.count, m)}
    ${s.voiceActors ? bars('Voice actors', s.voiceActors, r => r.voiceActor.name.userPreferred, r => r.count) : ''}
  </div>`;
}

function renderStats() {
  $('#stats').innerHTML = statBlock('Anime', user.statistics.anime, 'a') + statBlock('Manga', user.statistics.manga, 'm');
  statCharts('a', user.statistics.anime);
  statCharts('m', user.statistics.manga);
}

function renderFavs() {
  const f = user.favourites;
  const cards = (nodes, name, img) => `<div class="cards">${nodes.map(n =>
    `<a href="${esc(n.siteUrl)}">${img(n) ? `<img src="${esc(img(n))}" loading="lazy" alt="">` : ''}${esc(name(n))}</a>`).join('')}</div>`;
  $('#favs').innerHTML = `
    <h2>Anime</h2>${cards(f.anime.nodes, n => n.title.userPreferred, n => n.coverImage.medium)}
    <h2>Manga</h2>${cards(f.manga.nodes, n => n.title.userPreferred, n => n.coverImage.medium)}
    <h2>Characters</h2>${cards(f.characters.nodes, n => n.name.userPreferred, n => n.image.medium)}
    <h2>Staff</h2>${cards(f.staff.nodes, n => n.name.userPreferred, n => n.image.medium)}
    <h2>Studios</h2>${cards(f.studios.nodes, n => n.name, () => '')}`;
}

// Chapters from progress text such as "12" or "12 - 15"
function chapters(a) {
  if (!a.progress || !/read|reread/i.test(a.status)) return 0;
  const m = a.progress.match(/(\d+)\s*-\s*(\d+)/);
  return m ? Math.max(1, +m[2] - +m[1] + 1) : 1;
}

function weekStart(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function keyOf(ts) {
  const d = new Date(ts * 1000);
  if (period === 'year') return String(d.getFullYear());
  if (period === 'month') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  return 'Week of ' + ymd(weekStart(d));
}

function renderReads() {
  const groups = new Map();
  for (const a of activities) {
    const k = keyOf(a.createdAt);
    if (!groups.has(k)) groups.set(k, { ch: 0, n: 0, series: new Map(), done: [] });
    const g = groups.get(k), c = chapters(a);
    g.ch += c; g.n++;
    const t = a.media.title.userPreferred;
    const s = g.series.get(t) || { url: a.media.siteUrl, ch: 0, items: [] };
    s.ch += c; s.items.push(a.progress ? `${a.status} ${a.progress}` : a.status);
    g.series.set(t, s);
  }
  const rows = [...groups.entries()];
  const max = Math.max(1, ...rows.map(r => r[1].ch));
  const total = rows.reduce((n, r) => n + r[1].ch, 0);
  $('#reads').innerHTML = `
    <div><select id="per">${['week', 'month', 'year'].map(p => `<option value="${p}"${p === period ? ' selected' : ''}>${p}ly</option>`).join('')}</select>
    <span class="note">${total} chapters across ${activities.length} activities, ${rows.length} periods</span></div>
    <p class="note">Counted from your AniList activity feed: a range like "read chapter 5 - 9" counts 5; a single update counts 1.
    If you bulk-jump progress with one update, it counts as 1 chapter.</p>
    <div class="chart wide"><canvas id="rc"></canvas></div>
    <div class="two">${cv('rw')}${cv('rt')}</div>
    <h3>Daily chapters (last year)</h3><div class="heat" id="heat"></div>
    <table><tr><th>Period</th><th>Chapters</th><th></th><th>Series</th></tr>${rows.map(([k, g]) => `<tr>
      <td>${esc(k)}</td><td>${g.ch}</td>
      <td style="width:25%"><div class="bar" style="width:${g.ch / max * 100}%"></div></td>
      <td><details><summary>${g.series.size} series · ${g.n} updates</summary>${[...g.series.entries()].map(([t, s]) =>
        `<div><a href="${esc(s.url)}">${esc(t)}</a> — ${s.ch} ch <span class="note">(${esc(s.items.join('; '))})</span></div>`).join('')}</details></td></tr>`).join('')}</table>`;
  $('#per').onchange = e => { period = e.target.value; renderReads(); };
  readCharts(rows);
}

function readCharts(rows) {
  const shown = rows.slice(0, 60).reverse();
  barc('rc', `Chapters per ${period}`, shown, r => r[0].replace('Week of ', ''), r => r[1].ch);

  const wd = [0, 0, 0, 0, 0, 0, 0], hr = new Array(24).fill(0), day = new Map(), ser = new Map();
  for (const a of activities) {
    const c = chapters(a), d = new Date(a.createdAt * 1000);
    wd[(d.getDay() + 6) % 7] += c; hr[d.getHours()] += c;
    day.set(ymd(d), (day.get(ymd(d)) || 0) + c);
    const t = a.media.title.userPreferred;
    ser.set(t, (ser.get(t) || 0) + c);
  }
  barc('rw', 'Chapters by weekday', wd, (_, i) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i], v => v);
  barc('rt', 'Chapters by hour of day', hr, (_, i) => i + ':00', v => v);

  const top = [...ser.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  const cells = [], today = new Date();
  const mx = Math.max(1, ...day.values());
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 364);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const v = day.get(ymd(d)) || 0;
    const op = v ? 0.25 + 0.75 * Math.min(1, v / mx) : 0;
    cells.push(`<i title="${ymd(d)}: ${v} ch" style="${v ? `background:rgba(61,180,242,${op})` : ''}"></i>`);
  }
  $('#heat').innerHTML = cells.join('');
  $('#heat').scrollLeft = 0;
  $('#reads').insertAdjacentHTML('beforeend', `<div class="chart wide"><canvas id="rs"></canvas></div>`);
  mk('rs', {
    type: 'bar',
    data: { labels: top.map(r => r[0]), datasets: [{ label: 'Chapters', data: top.map(r => r[1]), backgroundColor: '#4cca51' }] },
    options: { indexAxis: 'y', plugins: { title: { display: true, text: 'Most-read series (chapters from activity)', color: '#e6edf5' }, legend: { display: false } } }
  });
}

const d8 = d => d && d.year ? `${d.year}-${pad(d.month || 0)}-${pad(d.day || 0)}` : '';

async function showLists() {
  const el = $('#lists');
  if (lists.done) return;
  el.textContent = 'Loading lists…';
  for (const type of ['ANIME', 'MANGA']) {
    lists[type] = (await gql(LIST_Q, { id: user.id, type })).MediaListCollection.lists;
  }
  lists.done = true;
  el.innerHTML = ['ANIME', 'MANGA'].map(t => `<h2>${t}</h2>` + lists[t].map(l => `
    <details><summary>${esc(l.name)} (${l.entries.length})</summary>
    <table><tr><th>Title</th><th>Status</th><th>Score</th><th>Progress</th><th>Repeat</th><th>Started</th><th>Completed</th><th>Updated</th><th>Notes</th></tr>
    ${l.entries.map(e => `<tr><td><a href="${esc(e.media.siteUrl)}">${esc(e.media.title.userPreferred)}</a></td>
      <td>${esc(e.status)}</td><td>${e.score}</td><td>${e.progress}${e.progressVolumes ? ' / vol ' + e.progressVolumes : ''}</td><td>${e.repeat}</td>
      <td>${d8(e.startedAt)}</td><td>${d8(e.completedAt)}</td><td>${new Date(e.updatedAt * 1000).toLocaleDateString()}</td><td>${esc(e.notes)}</td></tr>`).join('')}
    </table></details>`).join('')).join('');
}

load($('#name').value);
