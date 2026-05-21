const DATA_PATH = '../data/feeds/index.jsonl';
const ITEMS_PER_PAGE = 20;

let allItems = [];
let filteredItems = [];
let currentPage = 1;
let currentTab = 'for-you'; // 'for-you' or 'following'

const feedEl = document.getElementById('feed');
const paginationEl = document.getElementById('pagination');
const searchInputRight = document.getElementById('searchInputRight');
const trendsList = document.getElementById('trendsList');
const statsList = document.getElementById('statsList');
const lightbox = document.getElementById('lightbox');
const tabForYou = document.getElementById('tabForYou');
const tabFollowing = document.getElementById('tabFollowing');
const tabForYouIndicator = document.getElementById('tabForYouIndicator');
const tabFollowingIndicator = document.getElementById('tabFollowingIndicator');

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

function relativePath(localPath) {
  if (!localPath) return '';
  const idx = localPath.indexOf('data/feeds/media/');
  if (idx !== -1) return localPath.substring(idx);
  return localPath;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const now = new Date();
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  
  if (diffSec < 60) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  if (diffHr < 48) return 'Yesterday';
  
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMetric(n) {
  if (n == null || n === 0) return '';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function highlightText(text, query) {
  if (!query) return escapeHtml(text);
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  return escapeHtml(text).replace(regex, '<mark>$1</mark>');
}

function renderAvatar(d) {
  const fallback = `<div class="w-10 h-10 rounded-full bg-[#202327] flex items-center justify-center flex-shrink-0">
    <svg class="w-5 h-5 text-[#71767b]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08s5.97 1.09 6 3.08c-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
  </div>`;
  if (d.profileImageUrl) {
    // To prevent breaking the onerror attribute (delimited by double quotes),
    // we convert all double quotes in the fallback to single quotes,
    // and then escape those single quotes for the JS string.
    const safeFallback = fallback.replace(/"/g, "'").replace(/'/g, "\\'");
    return `<img class="w-10 h-10 rounded-full object-cover flex-shrink-0" src="${escapeHtml(d.profileImageUrl)}" alt="" loading="lazy" onerror="this.outerHTML='${safeFallback}'">`;
  }
  return fallback;
}

function renderMedia(mediaItems) {
  if (!mediaItems || !mediaItems.length) return '';
  
  const gridClass = mediaItems.length === 1 ? '' : 'grid grid-cols-2 gap-0.5';
  
  const parts = mediaItems.map(m => {
    const src = relativePath(m.local_path) || m.url;
    const type = m.type || 'photo';
    if (type === 'video' || type === 'animated_gif') {
      return `<div class="relative group cursor-pointer overflow-hidden rounded-2xl border border-[#2f3336] mt-3" onclick="openLightbox('${escapeHtml(src)}', 'video')">
        <video src="${escapeHtml(src)}" muted preload="metadata" class="w-full max-h-[500px] object-cover"></video>
        <div class="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-standard">
          <div class="w-12 h-12 rounded-full bg-[#1d9bf0] flex items-center justify-center text-white shadow-lg">
            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
      </div>`;
    }
    return `<div class="cursor-pointer overflow-hidden rounded-2xl border border-[#2f3336] mt-3 hover:opacity-90 transition-standard" onclick="openLightbox('${escapeHtml(src)}', 'image')">
      <img src="${escapeHtml(src)}" alt="" loading="lazy" class="w-full max-h-[500px] object-cover">
    </div>`;
  });
  
  return `<div class="${gridClass}">${parts.join('')}</div>`;
}

function openLightbox(src, type) {
  lightbox.innerHTML = type === 'video' 
    ? `<video src="${src}" controls autoplay class="max-w-full max-h-full"></video>`
    : `<img src="${src}" class="max-w-full max-h-full">`;
  lightbox.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

lightbox.addEventListener('click', () => {
  lightbox.style.display = 'none';
  lightbox.innerHTML = '';
  document.body.style.overflow = 'auto';
});

function renderTweet(d) {
  const query = searchInputRight.value.trim().toLowerCase();
  const likes = formatMetric(d.metrics.likes);
  const retweets = formatMetric(d.metrics.retweets);
  const replies = formatMetric(d.metrics.replies);
  const views = formatMetric(d.metrics.views);

  const verifiedBadge = d.verified ? `<svg class="w-[18px] h-[18px] text-[#1d9bf0] inline flex-shrink-0" viewBox="0 0 22 22" fill="currentColor"><path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.855-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.747 1.055-.875 1.69-.128.633-.076 1.29.147 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.223.606-.275 1.263-.147 1.896.128.634.43 1.218.875 1.687.47.443 1.054.747 1.687.878.633.13 1.29.083 1.897-.14.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.224 1.26.272 1.893.141.634-.131 1.22-.434 1.69-.878.445-.47.748-1.054.878-1.688.13-.634.08-1.29-.144-1.896.587-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.339 1.238z"/></svg>` : '';

  const retweetLabel = d.retweetedBy ? `<div class="flex items-center gap-3 text-[13px] font-bold text-[#71767b] px-12 mb-1"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.21 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.21 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"/></svg><span>${escapeHtml(d.retweetedBy)} Retweeted</span></div>` : '';

  return `
    <article class="px-4 py-3 hover:bg-white/[0.03] transition-standard cursor-pointer" data-id="${escapeHtml(d.id)}">
      ${retweetLabel}
      <div class="flex gap-3 items-start">
        <div class="flex-shrink-0">${renderAvatar(d)}</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1 leading-5 mb-0.5">
            <span class="font-bold text-[15px] text-[#e7e9ea] hover:underline truncate">${highlightText(d.displayName, query)}</span>
            ${verifiedBadge}
            <span class="text-[#71767b] text-[15px] truncate ml-0.5">@${highlightText(d.username, query)}</span>
            <span class="text-[#71767b] text-[15px]">·</span>
            <span class="text-[#71767b] text-[15px] hover:underline whitespace-nowrap" title="${escapeHtml(d.createdAt)}">${formatDate(d.createdAt)}</span>
          </div>
          <p class="text-[15px] text-[#e7e9ea] leading-normal whitespace-pre-wrap break-words">${highlightText(d.text, query)}</p>
          ${renderMedia(d.media)}
          <div class="flex items-center justify-between mt-3 max-w-md text-[#71767b]">
            <button class="group flex items-center gap-2 hover:text-[#1d9bf0] transition-standard">
              <div class="p-2 group-hover:bg-[#1d9bf0]/10 rounded-full -m-2 transition-standard">
                <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z"/></svg>
              </div>
              <span class="text-[13px]">${replies}</span>
            </button>
            <button class="group flex items-center gap-2 hover:text-[#00ba7c] transition-standard">
              <div class="p-2 group-hover:bg-[#00ba7c]/10 rounded-full -m-2 transition-standard">
                <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3"/></svg>
              </div>

              <span class="text-[13px]">${retweets}</span>
            </button>
            <button class="group flex items-center gap-2 hover:text-[#f91880] transition-standard">
              <div class="p-2 group-hover:bg-[#f91880]/10 rounded-full -m-2 transition-standard">
                <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"/></svg>
              </div>
              <span class="text-[13px]">${likes}</span>
            </button>
            <div class="group flex items-center gap-2">
              <div class="p-2 rounded-full -m-2">
                <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path d="M2.25 18L9 11.25l4.5 4.5L21.75 7.5M21.75 7.5V12m0-4.5H17.25"/></svg>
              </div>
              <span class="text-[13px]">${views}</span>
            </div>
            <div class="flex items-center gap-4">
               <svg class="w-[18px] h-[18px] hover:text-[#1d9bf0]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"/></svg>
               <svg class="w-[18px] h-[18px] hover:text-[#1d9bf0]" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
            </div>
          </div>
        </div>
      </div>
    </article>`;
}

function renderSkeleton() {
  feedEl.innerHTML = Array(5).fill(0).map(() => `
    <div class="px-4 py-3 border-b border-[#2f3336]">
      <div class="flex gap-3 animate-pulse">
        <div class="w-10 h-10 rounded-full bg-[#202327]"></div>
        <div class="flex-1 space-y-3">
          <div class="flex gap-2">
            <div class="h-4 w-24 bg-[#202327] rounded"></div>
            <div class="h-4 w-16 bg-[#202327] rounded"></div>
          </div>
          <div class="h-4 w-full bg-[#202327] rounded"></div>
          <div class="h-4 w-2/3 bg-[#202327] rounded"></div>
          <div class="h-40 w-full bg-[#202327] rounded-2xl"></div>
        </div>
      </div>
    </div>
  `).join('');
}

function renderPage() {
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const page = filteredItems.slice(start, start + ITEMS_PER_PAGE);
  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE) || 1;

  if (!page.length) {
    feedEl.innerHTML = `<div class="px-4 py-12 text-center max-w-sm mx-auto">
      <p class="text-3xl font-extrabold text-[#e7e9ea] leading-tight">No results for "${escapeHtml(searchInputRight.value)}"</p>
      <p class="text-[#71767b] mt-2 text-[15px]">Try searching for something else or check your spelling.</p>
    </div>`;
    paginationEl.innerHTML = '';
    return;
  }

  feedEl.innerHTML = page.map(renderTweet).join('');

  paginationEl.innerHTML = `
    <button id="prevBtn" ${currentPage <= 1 ? 'disabled' : ''} class="px-4 py-1.5 rounded-full border border-[#536471] text-[#e7e9ea] text-[15px] font-bold disabled:opacity-40 hover:bg-white/5 transition-standard">Newer</button>
    <span class="text-[#71767b] text-[15px]">Page ${currentPage} of ${totalPages}</span>
    <button id="nextBtn" ${currentPage >= totalPages ? 'disabled' : ''} class="px-4 py-1.5 rounded-full border border-[#536471] text-[#e7e9ea] text-[15px] font-bold disabled:opacity-40 hover:bg-white/5 transition-standard">Older</button>
  `;

  document.getElementById('prevBtn')?.addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; renderPage(); window.scrollTo(0, 0); }
  });
  document.getElementById('nextBtn')?.addEventListener('click', () => {
    if (currentPage < totalPages) { currentPage++; renderPage(); window.scrollTo(0, 0); }
  });
}

function filterAndRender() {
  const q = searchInputRight.value.toLowerCase().trim();
  
  let baseItems = allItems;
  if (currentTab === 'following') {
    baseItems = allItems.filter(d => d.source === 'following');
  } else {
    baseItems = allItems.filter(d => d.source === 'for-you' || !d.source);
  }

  filteredItems = q
    ? baseItems.filter(d =>
        d.text.toLowerCase().includes(q) ||
        d.displayName.toLowerCase().includes(q) ||
        d.username.toLowerCase().includes(q)
      )
    : baseItems;
    
  currentPage = 1;
  renderPage();
  updateStats();
}

function updateStats() {
  if (!allItems.length) return;
  const total = allItems.length;
  const totalLikes = allItems.reduce((s, d) => s + (d.metrics.likes || 0), 0);
  const totalViews = allItems.reduce((s, d) => s + (d.metrics.views || 0), 0);
  const authors = new Set(allItems.map(d => d.username)).size;

  statsList.innerHTML = `
    <div class="flex justify-between items-center"><span class="text-[#71767b]">Total Tweets</span><span class="font-bold text-[#e7e9ea]">${total.toLocaleString()}</span></div>
    <div class="flex justify-between items-center"><span class="text-[#71767b]">Unique Authors</span><span class="font-bold text-[#e7e9ea]">${authors.toLocaleString()}</span></div>
    <div class="flex justify-between items-center"><span class="text-[#71767b]">Global Likes</span><span class="font-bold text-[#e7e9ea]">${formatMetric(totalLikes) || '0'}</span></div>
    <div class="flex justify-between items-center"><span class="text-[#71767b]">Global Views</span><span class="font-bold text-[#e7e9ea]">${formatMetric(totalViews) || '0'}</span></div>
  `;

  const hashtags = {};
  allItems.forEach(d => {
    (d.text.match(/#\w+/g) || []).forEach(h => { hashtags[h] = (hashtags[h] || 0) + 1; });
  });
  const topTags = Object.entries(hashtags).sort((a, b) => b[1] - a[1]).slice(0, 5);
  trendsList.innerHTML = topTags.length
    ? topTags.map(([tag, count]) => `
        <div class="px-4 py-3 hover:bg-white/5 transition-standard cursor-pointer">
          <div class="text-[13px] text-[#71767b]">Trending in Archive</div>
          <div class="font-bold text-[15px] text-[#e7e9ea]">${escapeHtml(tag)}</div>
          <div class="text-[13px] text-[#71767b]">${count.toLocaleString()} tweets</div>
        </div>
      `).join('')
    : '<div class="text-[#71767b] px-4 py-4 text-[15px]">No hashtags found</div>';
}

function extract(item) {
  const r = item.raw || {};
  const a = r.author || {};
  
  // Safely get retweetedBy name
  let retweetedBy = null;
  if (r.retweetedBy) {
    if (typeof r.retweetedBy === 'string') retweetedBy = r.retweetedBy;
    else retweetedBy = r.retweetedBy.name || r.retweetedBy.screenName || r.retweetedBy.screen_name;
  }

  return {
    id: item.id,
    source: item.source,
    username: a.screenName || item.user?.username || '',
    displayName: a.name || item.user?.display_name || '',
    profileImageUrl: a.profileImageUrl || item.user?.profile_image || '',
    text: item.text || '',
    createdAt: r.createdAt || r.createdAtISO || item.created_at || '',
    metrics: r.metrics || item.metrics || {},
    media: item.media || [],
    isRetweet: r.isRetweet || false,
    retweetedBy: retweetedBy,
    verified: a.verified || false,
  };
}

async function loadData() {
  renderSkeleton();

  try {
    const res = await fetch(DATA_PATH);
    if (!res.ok) throw new Error('File not found');
    
    const text = await res.text();
    const lines = text.split('\n').filter(Boolean);
    const parsed = lines.map(line => {
      try { return extract(JSON.parse(line)); } catch(e) { return null; }
    }).filter(Boolean);

    if (!parsed.length) throw new Error('Empty data');

    allItems = parsed.reverse();
    filterAndRender();
  } catch (err) {
    feedEl.innerHTML = `<div class="px-4 py-12 text-center text-[#71767b]">
      <p class="text-xl font-bold text-[#e7e9ea]">Could not load archive data</p>
      <p class="mt-2">Ensure you have run <code class="bg-[#202327] px-1 rounded text-[#1d9bf0]">scripts/aggregate_feeds.py</code></p>
    </div>`;
  }
}

// Tab Switching
tabForYou.addEventListener('click', () => {
  currentTab = 'for-you';
  tabForYou.classList.add('font-bold', 'text-[#e7e9ea]');
  tabForYou.classList.remove('font-medium', 'text-[#71767b]');
  tabFollowing.classList.remove('font-bold', 'text-[#e7e9ea]');
  tabFollowing.classList.add('font-medium', 'text-[#71767b]');
  tabForYouIndicator.classList.remove('hidden');
  tabFollowingIndicator.classList.add('hidden');
  filterAndRender();
  window.scrollTo(0, 0);
});

tabFollowing.addEventListener('click', () => {
  currentTab = 'following';
  tabFollowing.classList.add('font-bold', 'text-[#e7e9ea]');
  tabFollowing.classList.remove('font-medium', 'text-[#71767b]');
  tabForYou.classList.remove('font-bold', 'text-[#e7e9ea]');
  tabForYou.classList.add('font-medium', 'text-[#71767b]');
  tabFollowingIndicator.classList.remove('hidden');
  tabForYouIndicator.classList.add('hidden');
  filterAndRender();
  window.scrollTo(0, 0);
});

// Search
let searchTimer;
searchInputRight.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(filterAndRender, 200);
});

document.getElementById('homeLink').addEventListener('click', (e) => {
  e.preventDefault();
  searchInputRight.value = '';
  filterAndRender();
  window.scrollTo(0, 0);
});

loadData();
