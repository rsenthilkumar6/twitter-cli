(async function(){
  const indexPath = '../data/feeds/index.jsonl';
  const tweetsEl = document.getElementById('tweets');
  const pagerEl = document.getElementById('pager');
  const errorEl = document.getElementById('error');
  const perPageSelect = document.getElementById('perPage');
  const searchInput = document.getElementById('search');

  function showError(msg){ errorEl.style.display='block'; errorEl.textContent=msg; }
  function hideError(){ errorEl.style.display='none'; errorEl.textContent=''; }

  async function fetchIndex(){
    try{
      const res = await fetch(indexPath);
      if(!res.ok) throw new Error('HTTP '+res.status);
      const text = await res.text();
      if(!text.trim()) return [];
      const lines = text.split(/\r?\n/).filter(Boolean);
      return lines.map(l=>JSON.parse(l));
    }catch(e){
      showError('Could not load index.jsonl: '+e.message);
      return null;
    }
  }

  function renderTweet(t){
    const d = document.createElement('div'); d.className='tweet';
    const u = t.user||{};
    const html = `
      <div class="tweet-meta">
        <div class="avatar">${u.profile_image?'<img src="'+u.profile_image+'"/>':''}</div>
        <div class="user">${u.display_name||''} <span class="handle">${u.username? '@'+u.username:''}</span></div>
        <div class="time">${t.created_at||''}</div>
      </div>
      <div class="tweet-text">${(t.text||'').replace(/\n/g,'<br/>')}</div>
      <div class="tweet-media">${(t.media||[]).map(m=>`<a href="../data/feeds/media/${t.id}/${encodeURIComponent(m.url.split('/').pop())}" target="_blank"><img src="../data/feeds/media/${t.id}/${encodeURIComponent(m.url.split('/').pop())}" alt="media"/></a>`).join('')}</div>
      <div class="metrics">Likes: ${t.metrics?.likes||0} · RT: ${t.metrics?.retweets||0} · Replies: ${t.metrics?.replies||0}</div>
    `;
    d.innerHTML = html;
    return d;
  }

  function renderPage(items, page, perPage){
    tweetsEl.innerHTML='';
    const start = (page-1)*perPage; const end = start+perPage;
    const pageItems = items.slice(start,end);
    if(pageItems.length===0){ tweetsEl.innerHTML='<p>No tweets to show.</p>'; }
    pageItems.forEach(it=>tweetsEl.appendChild(renderTweet(it)));
    // pager
    const total = items.length; const pages = Math.max(1, Math.ceil(total/perPage));
    pagerEl.innerHTML='';
    for(let i=1;i<=pages;i++){
      const b = document.createElement('button'); b.textContent=i; if(i===page) b.disabled=true;
      b.addEventListener('click',()=>{ renderPage(items,i,perPage); });
      pagerEl.appendChild(b);
    }
  }

  const data = await fetchIndex();
  if(data===null) return;
  hideError();
  let items = data.sort((a,b)=> (b.created_at||'').localeCompare(a.created_at||''));
  const applyFilters = ()=>{
    const q = (searchInput.value||'').toLowerCase().trim();
    const perPage = parseInt(perPageSelect.value,10)||20;
    const filtered = items.filter(it=>{
      if(!q) return true;
      const text = (it.text||'') + ' ' + (it.user?.username||'') + ' ' + (it.user?.display_name||'');
      return text.toLowerCase().includes(q);
    });
    renderPage(filtered,1,perPage);
  };
  searchInput.addEventListener('input', applyFilters);
  perPageSelect.addEventListener('change', applyFilters);
  applyFilters();
})();
