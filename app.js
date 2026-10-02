let liveEpisodes = [];
let subscriptions = [];
let podcastResults = [];
let searchTimer;
const state = { view:"inbox", query:"", showFilter:"", unplayed:false, sort:"date-desc", activeId:null, menuId:null, playing:false, elapsed:0, queue:new Set(), starred:new Set(), deleted:new Set() };
const $ = (selector) => document.querySelector(selector);
const list = $("#episode-list"), empty = $("#empty-state"), title = $("#view-title");
const audio = $("#audio");

function allEpisodes() { return [...liveEpisodes]; }
function escapeHtml(value="") { return String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function isStarred(id) { return state.starred.has(String(id)) || state.starred.has(Number(id)); }

function formatDuration(seconds) {
  const h=Math.floor(seconds/3600), m=Math.floor((seconds%3600)/60), s=seconds%60;
  return h ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function currentEpisodes() {
  let data = [...allEpisodes()];
  data = data.filter(e => !state.deleted.has(String(e.id)));

  if (state.view === "queue") data = data.filter(e => state.queue.has(String(e.id)) || state.queue.has(e.id));
  if (state.view === "starred") data = data.filter(e => isStarred(e.id));
  if (state.showFilter) data = data.filter(e => e.show === state.showFilter);
  if (state.unplayed) data = data.filter(e => !e.played);

  const q = state.query.trim().toLowerCase();
  if (q) data = data.filter(e => `${e.title} ${e.show}`.toLowerCase().includes(q));

  // Inbox contains all available episodes. Sorting is applied to the actual
  // episode list so every sort option has a visible effect.
  const releaseTime = episode => {
    if (episode.releaseTime != null && Number.isFinite(Number(episode.releaseTime))) {
      return Number(episode.releaseTime);
    }
    const value = Date.parse(episode.date || "");
    return Number.isNaN(value) ? 0 : value;
  };

  if (state.sort === "date-desc") {
    data.sort((a, b) => releaseTime(b) - releaseTime(a));
  } else if (state.sort === "date-asc") {
    data.sort((a, b) => releaseTime(a) - releaseTime(b));
  } else if (state.sort === "duration-desc") {
    data.sort((a, b) => (Number(b.seconds) || 0) - (Number(a.seconds) || 0));
  } else if (state.sort === "duration-asc") {
    data.sort((a, b) => (Number(a.seconds) || 0) - (Number(b.seconds) || 0));
  } else if (state.sort === "name-asc") {
    data.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), undefined, {sensitivity: "base"}));
  } else if (state.sort === "name-desc") {
    data.sort((a, b) => String(b.title || "").localeCompare(String(a.title || ""), undefined, {sensitivity: "base"}));
  }

  return data;
}
function render() {
  const data=currentEpisodes();
  list.innerHTML=data.map((e,i)=>`<article class="episode-row ${String(state.activeId)===String(e.id)?"playing":""} ${isStarred(e.id)?"starred":""}" data-id="${escapeHtml(e.id)}">
    <span class="episode-number">${i+1}</span>
    <div class="episode-main"><div class="cover ${e.cover||"convo"}">${e.image?`<img src="${escapeHtml(e.image)}" alt="" />`:`<span>${escapeHtml(e.art)}</span>`}</div><div class="episode-copy"><strong class="episode-title">${escapeHtml(e.title)}</strong><span class="episode-show">${escapeHtml(e.show)}</span></div></div>
    <time class="date">${e.date}</time><span class="duration">${formatDuration(e.seconds)}</span>
    <div class="row-actions"><button class="more" aria-label="Episode actions" aria-haspopup="menu">•••</button></div>
  </article>`).join("");
  empty.hidden=state.view==="search" || data.length>0;
  $("#queue-count").textContent=state.queue.size || "";
  $("#queue-count").dataset.count=state.queue.size;
}

function libraryShows(){
  const byName=new Map();
  for(const sub of subscriptions){
    if(!sub.collectionName)continue;
    byName.set(sub.collectionName,{name:sub.collectionName,creator:sub.artistName||"Subscribed podcast",image:sub.artworkUrl600||"",feedUrl:sub.feedUrl||"",count:0});
  }
  for(const episode of allEpisodes()){
    if(!episode.show)continue;
    const show=byName.get(episode.show)||{name:episode.show,creator:episode.live?"Subscribed podcast":"Podcast",image:episode.image||"",feedUrl:episode.feedUrl||"",count:0,cover:episode.cover};
    show.count+=1;
    if(!show.image&&episode.image)show.image=episode.image;
    byName.set(episode.show,show);
  }
  return [...byName.values()].sort((a,b)=>a.name.localeCompare(b.name));
}

function renderLibraryShows(){
  // Library is a show-only view: never leave episode rows from another view visible.
  list.innerHTML="";
  list.hidden=true;
  $(".column-head").hidden=true;
  $("#empty-state").hidden=true;
  const q=state.query.trim().toLowerCase();
  const shows=libraryShows().filter(show=>!q||`${show.name} ${show.creator}`.toLowerCase().includes(q));
  $("#show-count").textContent=`${shows.length} ${shows.length===1?"show":"shows"}`;
  $("#library-empty").hidden=shows.length>0;
  $("#show-grid").innerHTML=shows.map((show,index)=>`<article class="show-card">
    <div class="show-cover ${show.cover||""}">${show.image?`<img src="${escapeHtml(show.image)}" alt="" />`:`<span>${escapeHtml(show.name.charAt(0))}</span>`}</div>
    <div class="show-copy"><strong>${escapeHtml(show.name)}</strong><span>${escapeHtml(show.creator)} · ${show.count} ${show.count===1?"episode":"episodes"}</span></div>
    <div class="show-actions"><button class="view-show" data-show="${escapeHtml(show.name)}">View</button><button class="unsubscribe-show" data-show="${escapeHtml(show.name)}" data-feed="${escapeHtml(show.feedUrl)}">Unsubscribe</button></div>
  </article>`).join("");
}

function selectEpisode(id) {
  const e=allEpisodes().find(item=>String(item.id)===String(id)); if(!e)return;
  state.activeId=id; state.elapsed=0; e.played=true;
  $("#player").hidden=false; $("#player-title").textContent=e.title; $("#player-show").textContent=e.show;
  $("#player-cover").className=`player-cover cover ${e.cover}`;
  audio.src=e.audio;
  audio.play().catch(()=>{ state.playing=false; $("#play-main").textContent="▶"; });
  updatePlayer(); render(); save();
}

function updatePlayer() {
  const duration=Number.isFinite(audio.duration)?audio.duration:0;
  state.elapsed=audio.currentTime || 0;
  $("#player-time").textContent=`${formatDuration(Math.floor(state.elapsed))} / ${formatDuration(Math.floor(duration))}`;
  $("#progress-fill").style.width=duration?`${Math.min(100,state.elapsed/duration*100)}%`:"0%";
}

list.addEventListener("click", e=>{
  const row=e.target.closest(".episode-row"); if(!row)return; const id=row.dataset.id;
  const more=e.target.closest(".more");
  if(more) { openEpisodeMenu(id,more); return; }
  selectEpisode(id);
});

function openEpisodeMenu(id,button){
  state.menuId=String(id);
  const menu=$("#episode-menu");
  const starred=isStarred(id);
  $("#star-label").textContent=starred?"Unstar episode":"Star episode";
  $("#queue-label").textContent=state.queue.has(id)||state.queue.has(Number(id))?"Remove from queue":"Add to queue";
  menu.hidden=false;
  const rect=button.getBoundingClientRect();
  const menuWidth=190, menuHeight=126;
  menu.style.left=`${Math.max(8,Math.min(window.innerWidth-menuWidth-8,rect.right-menuWidth))}px`;
  menu.style.top=`${Math.max(8,Math.min(window.innerHeight-menuHeight-8,rect.bottom+6))}px`;
}

function closeEpisodeMenu(){ $("#episode-menu").hidden=true; state.menuId=null; }
function showToast(message){ const toast=$("#toast");toast.textContent=message;toast.hidden=false;clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.hidden=true,2600); }

$("#episode-menu").addEventListener("click",async event=>{
  const action=event.target.closest("button")?.dataset.action;
  const episode=allEpisodes().find(item=>String(item.id)===state.menuId);
  if(!action||!episode)return;
  if(action==="star") {
    const id=String(episode.id);
    if(state.starred.has(id)||state.starred.has(Number(id))) { state.starred.delete(id);state.starred.delete(Number(id));showToast("Episode unstarred"); }
    else { state.starred.add(id);showToast("Episode starred"); }
    save(); closeEpisodeMenu(); render(); return;
  }
  if(action==="queue") {
    const id=String(episode.id);
    const queued=state.queue.has(id)||state.queue.has(Number(id));
    if(queued){ state.queue.delete(id); state.queue.delete(Number(id)); showToast("Removed from queue"); }
    else { state.queue.add(id); showToast("Added to queue"); }
    save(); closeEpisodeMenu(); render(); return;
  }
  if(action==="download") {
    const extension=(episode.audio.split("?")[0].match(/\.([a-z0-9]{2,5})$/i)?.[1]||"mp3").toLowerCase();
    const link=document.createElement("a");
    link.href=episode.audio;link.download=`${episode.show} - ${episode.title}.${extension}`;link.target="_blank";link.rel="noopener";link.click();
    showToast("Audio download opened");
    closeEpisodeMenu(); return;
  }
  if(action==="delete") {
    if(!confirm(`Delete “${episode.title}” from Podcasts?`))return;
    state.deleted.add(String(episode.id));
    if(String(state.activeId)===String(episode.id)){audio.pause();$("#player").hidden=true;state.activeId=null;}
    save(); closeEpisodeMenu(); render(); showToast("Episode deleted");
  }
});

document.addEventListener("click",event=>{if(!event.target.closest("#episode-menu")&&!event.target.closest(".more"))closeEpisodeMenu();});
window.addEventListener("resize",closeEpisodeMenu);

document.querySelectorAll(".nav-item").forEach(button=>button.addEventListener("click",()=>{
  state.view=button.dataset.view; state.showFilter=""; state.query=""; $("#search-input").value=""; document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b===button));
  title.textContent=button.textContent.trim().replace(/\d+$/,"");
  const searching=state.view==="search";
  const library=state.view==="library";
  $("#discover").hidden=!searching; $("#show-library").hidden=!library; list.hidden=searching||library; $(".column-head").hidden=searching||library; empty.hidden=true;
  $("#sort-select").hidden=searching||library;
  $("#search-input").placeholder=searching?"Podcast name or RSS URL":library?"Search podcast shows":"Search episodes";
  if(searching) $("#search-input").focus(); else if(library){ renderLibraryShows(); } else render();
  $(".sidebar").classList.remove("open");
}));

$("#add-podcast-button").addEventListener("click",()=>{
  document.querySelector('.nav-item[data-view="search"]').click();
});

$("#search-input").addEventListener("input",e=>{
  state.query=e.target.value;
  if(state.view==="library") { renderLibraryShows(); return; }
  if(state.view!=="search") { render(); return; }
  clearTimeout(searchTimer);
  if(state.query.trim().length<2) { podcastResults=[]; renderPodcastResults("Search by podcast title, creator, or paste an RSS feed URL."); return; }
  searchTimer=setTimeout(searchPodcasts,350);
});

$("#show-grid").addEventListener("click",async event=>{
  const unsubscribe=event.target.closest(".unsubscribe-show");
  if(unsubscribe){
    const showName=unsubscribe.dataset.show,feedUrl=unsubscribe.dataset.feed;
    if(!confirm(`Unsubscribe from “${showName}”?`))return;
    const removedEpisodes=liveEpisodes.filter(episode=>episode.feedUrl===feedUrl||episode.show===showName);
    const removedIds=new Set(removedEpisodes.map(episode=>String(episode.id)));
    subscriptions=subscriptions.filter(show=>show.feedUrl!==feedUrl&&show.collectionName!==showName);
    liveEpisodes=liveEpisodes.filter(episode=>!removedIds.has(String(episode.id)));
    for(const id of removedIds){state.queue.delete(id);state.starred.delete(id);state.deleted.delete(id);}
    if(removedIds.has(String(state.activeId))){audio.pause();audio.removeAttribute("src");$("#player").hidden=true;state.activeId=null;}
    save();saveLibrary();renderLibraryShows();render();showToast(`${showName} unsubscribed`);return;
  }
  const button=event.target.closest(".view-show");if(!button)return;
  state.view="inbox";state.showFilter=button.dataset.show;state.query="";$("#search-input").value="";
  document.querySelectorAll(".nav-item").forEach(item=>item.classList.toggle("active",item.dataset.view==="inbox"));
  title.textContent=state.showFilter;$("#show-library").hidden=true;list.hidden=false;$(".column-head").hidden=false;render();
  const subscription=subscriptions.find(show=>show.collectionName===state.showFilter);
  if(subscription){showToast("Refreshing live episodes…");try{await refreshSubscription(subscription);saveLibrary();render();showToast(`${currentEpisodes().length} episodes loaded`);}catch(error){showToast(error.message||"Episodes could not be loaded");}}
});
$("#sort-select").addEventListener("change",e=>{state.sort=e.target.value;render();});
$("#filter-button").addEventListener("click",e=>{state.unplayed=!state.unplayed;e.currentTarget.setAttribute("aria-pressed",state.unplayed);render();});
$("#menu-button").addEventListener("click",()=>$(".sidebar").classList.toggle("open"));
$("#play-main").addEventListener("click",()=>{ if(!audio.src)return; audio.paused?audio.play():audio.pause(); });
$("#back-button").addEventListener("click",()=>{audio.currentTime=Math.max(0,audio.currentTime-15);});
$("#forward-button").addEventListener("click",()=>{audio.currentTime=Math.min(audio.duration||0,audio.currentTime+30);});
$(".progress").addEventListener("click",e=>{if(!audio.duration)return;const r=e.currentTarget.getBoundingClientRect();audio.currentTime=((e.clientX-r.left)/r.width)*audio.duration;});
$("#close-player").addEventListener("click",()=>{audio.pause();$("#player").hidden=true;});
audio.addEventListener("play",()=>{state.playing=true;$("#play-main").textContent="❚❚";});
audio.addEventListener("pause",()=>{state.playing=false;$("#play-main").textContent="▶";});
audio.addEventListener("timeupdate",updatePlayer);
audio.addEventListener("durationchange",updatePlayer);
audio.addEventListener("ended",()=>{$("#play-main").textContent="▶";});

function save(){ localStorage.setItem("podcasts-actions",JSON.stringify({queue:[...state.queue],starred:[...state.starred],deleted:[...state.deleted]})); }
function saveLibrary(){ localStorage.setItem("podcasts-library",JSON.stringify({subscriptions,liveEpisodes})); }
function escapeXml(value="") { return String(value).replace(/[<>&'"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"}[c])); }
function localText(node,...names){
  const wanted=new Set(names.map(name=>name.toLowerCase()));
  const found=[...node.getElementsByTagName("*")].find(element=>wanted.has(element.localName.toLowerCase())&&element.textContent.trim());
  return found?.textContent.trim()||"";
}
function stableId(value){let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(36);}

async function searchPodcasts(){
  const query=state.query.trim();
  if(/^https?:\/\//i.test(query)) {
    podcastResults=[{collectionName:"Direct RSS feed",artistName:new URL(query).hostname,feedUrl:query,artworkUrl100:"",artworkUrl600:""}];
    renderPodcastResults("");
    return;
  }
  renderPodcastResults("Searching Apple Podcasts…");
  try {
    const response=await searchApplePodcasts(query);
    podcastResults=response.filter(show=>show.feedUrl);
    renderPodcastResults(podcastResults.length?"":"No podcasts found.");
  } catch(error) { podcastResults=[]; renderPodcastResults(error.message); }
}

async function searchApplePodcasts(query){
  const url=new URL("https://itunes.apple.com/search");
  url.searchParams.set("term",query);url.searchParams.set("media","podcast");url.searchParams.set("entity","podcast");url.searchParams.set("country","AU");url.searchParams.set("limit","20");
  return (await fetchAppleJson(url,"Podcast search is unavailable")).results||[];
}

async function fetchAppleJson(url,errorMessage){
  try{const response=await fetch(url);if(!response.ok)throw new Error();return await response.json();}catch{
    return new Promise((resolve,reject)=>{
      const callback=`podcastApple_${Date.now()}_${Math.random().toString(36).slice(2)}`;const script=document.createElement("script");
      const timeout=setTimeout(()=>finish(new Error(errorMessage)),12000);
      function finish(error,data){clearTimeout(timeout);delete window[callback];script.remove();error?reject(error):resolve(data);}
      window[callback]=data=>finish(null,data);script.onerror=()=>finish(new Error(errorMessage));url.searchParams.set("callback",callback);script.src=url;document.head.appendChild(script);
    });
  }
}

async function fetchFeedXml(feedUrl){
  try{const response=await fetch(feedUrl,{headers:{Accept:"application/rss+xml, application/atom+xml, application/xml, text/xml, */*"}});if(!response.ok)throw new Error();return await response.text();}catch(directError){
    const proxies=window.PODCAST_CONFIG?.feedProxies||[];
    for(const proxy of proxies){
      const entry=typeof proxy==="string"?{url:proxy,encode:true}:proxy;
      const target=entry.encode===false?feedUrl:encodeURIComponent(feedUrl);
      try{const response=await fetch(`${entry.url}${target}`);if(response.ok)return await response.text();}catch{}
    }
    throw new Error("This feed blocks browser access. Configure a feed proxy in config.js.");
  }
}

function renderPodcastResults(message=""){
  $("#discover-status").textContent=message;
  $("#discover-status").hidden=!message;
  $("#podcast-results").innerHTML=podcastResults.map((show,index)=>{
    const added=subscriptions.some(item=>item.feedUrl===show.feedUrl);
    return `<article class="podcast-card"><img src="${escapeHtml(show.artworkUrl100||show.artworkUrl600||"")}" alt="" /><div class="podcast-card-copy"><strong>${escapeHtml(show.collectionName)}</strong><span>${escapeHtml(show.artistName)}</span></div><button class="add-show" data-result="${index}" ${added?"disabled":""}>${added?"Added":"+ Add"}</button></article>`;
  }).join("");
}

function nodeText(node,...selectors){ for(const selector of selectors){const found=node.querySelector(selector);if(found?.textContent)return found.textContent.trim();}return ""; }
function parseFeed(xml,show){
  const doc=new DOMParser().parseFromString(xml,"application/xml");
  if(doc.querySelector("parsererror")) throw new Error("This podcast feed could not be read.");
  const channel=[...doc.getElementsByTagName("*")].find(element=>["channel","feed"].includes(element.localName.toLowerCase()))||doc;
  const directTitle=[...channel.children].find(element=>element.localName.toLowerCase()==="title")?.textContent.trim();
  const feedTitle=directTitle||show.collectionName;
  const feedImage=doc.getElementsByTagName("itunes:image")[0]?.getAttribute("href")||nodeText(doc,"channel > image > url")||show.artworkUrl600||show.artworkUrl100;
  const entries=[...doc.getElementsByTagName("*")].filter(element=>["item","entry"].includes(element.localName.toLowerCase()));
  return entries.slice(0,40).map((item,index)=>{
    const elements=[...item.getElementsByTagName("*")];
    const enclosure=elements.find(element=>element.localName.toLowerCase()==="enclosure"&&element.getAttribute("url"));
    const atomLink=elements.find(element=>element.localName.toLowerCase()==="link"&&element.getAttribute("rel")==="enclosure"&&element.getAttribute("href"));
    const media=elements.find(element=>element.localName.toLowerCase()==="content"&&element.getAttribute("url")&&(/audio/i.test(element.getAttribute("type")||"")||/\.(mp3|m4a|aac|ogg|opus)(\?|$)/i.test(element.getAttribute("url"))));
    const rawAudio=enclosure?.getAttribute("url")||atomLink?.getAttribute("href")||media?.getAttribute("url")||"";
    let audioUrl="";try{audioUrl=new URL(rawAudio,show.feedUrl).href;}catch{}
    const dateValue=localText(item,"pubDate","published","updated","date");
    const parsedDate=new Date(dateValue);
    const durationText=localText(item,"duration");
    const parts=durationText.split(":").map(Number);
    const seconds=parts.length===3?parts[0]*3600+parts[1]*60+parts[2]:parts.length===2?parts[0]*60+parts[1]:Number(durationText)||0;
    const guid=localText(item,"guid","id")||audioUrl||`${show.feedUrl}-${index}`;
    return {id:`live-${stableId(`${show.feedUrl}|${guid}`)}`,title:localText(item,"title")||"Untitled episode",show:feedTitle,date:Number.isNaN(parsedDate.getTime())?"":parsedDate.toLocaleDateString("en-CA"),releaseTime:Number.isNaN(parsedDate.getTime())?0:parsedDate.getTime(),seconds,cover:"",art:"",image:feedImage,audio:audioUrl,played:false,live:true,feedUrl:show.feedUrl};
  }).filter(item=>item.audio);
}

async function fetchAppleEpisodes(show){
  let collectionId=show.collectionId;
  if(!collectionId){
    const candidates=await searchApplePodcasts(show.collectionName);
    const normal=value=>String(value||"").toLowerCase().replace(/\/$/,"");
    const match=candidates.find(item=>normal(item.feedUrl)===normal(show.feedUrl))||candidates.find(item=>normal(item.collectionName)===normal(show.collectionName))||candidates[0];
    if(!match?.collectionId)throw new Error("This show was not found in Apple Podcasts");
    collectionId=match.collectionId;show.collectionId=collectionId;show.feedUrl=show.feedUrl||match.feedUrl;show.artworkUrl600=show.artworkUrl600||match.artworkUrl600||match.artworkUrl100;
  }
  const url=new URL("https://itunes.apple.com/lookup");
  url.searchParams.set("id",collectionId);url.searchParams.set("media","podcast");url.searchParams.set("entity","podcastEpisode");url.searchParams.set("country","AU");url.searchParams.set("limit","40");
  const data=await fetchAppleJson(url,"Apple Podcasts episodes are unavailable");
  return (data.results||[]).filter(item=>item.episodeUrl&&(item.wrapperType==="podcastEpisode"||item.kind==="podcast-episode")).map(item=>({
    id:`apple-${item.trackId||stableId(item.episodeUrl)}`,title:item.trackName||"Untitled episode",show:item.collectionName||show.collectionName,
    date:item.releaseDate?new Date(item.releaseDate).toISOString().slice(0,10):"",releaseTime:item.releaseDate?new Date(item.releaseDate).getTime():0,seconds:Math.floor((item.trackTimeMillis||0)/1000),cover:"",art:"",
    image:item.artworkUrl600||item.artworkUrl160||item.artworkUrl100||show.artworkUrl600||"",audio:item.episodeUrl,played:false,live:true,feedUrl:show.feedUrl
  }));
}

async function loadEpisodes(show){
  try{const episodes=parseFeed(await fetchFeedXml(show.feedUrl),show);if(episodes.length)return episodes;}catch{}
  const episodes=await fetchAppleEpisodes(show);if(!episodes.length)throw new Error("No playable episodes were found");return episodes;
}

async function subscribeToShow(show,{saveNow=true}={}){
  if(subscriptions.some(item=>item.feedUrl===show.feedUrl))return false;
  const newEpisodes=await loadEpisodes(show);
  if(!newEpisodes.length)throw new Error("No playable audio was found in this feed.");
  subscriptions.push({feedUrl:show.feedUrl,collectionId:show.collectionId,collectionName:newEpisodes[0].show,artistName:show.artistName||"Imported podcast",artworkUrl600:newEpisodes[0].image});
  const ids=new Set(liveEpisodes.map(item=>item.id));
  liveEpisodes=[...newEpisodes.filter(item=>!ids.has(item.id)),...liveEpisodes];
  if(saveNow)saveLibrary();
  return true;
}

async function refreshSubscription(sub){
  const fresh=await loadEpisodes(sub);
  liveEpisodes=liveEpisodes.filter(item=>item.feedUrl!==sub.feedUrl&&item.show!==sub.collectionName);
  liveEpisodes.push(...fresh);
  sub.collectionName=fresh[0].show;sub.artworkUrl600=fresh[0].image||sub.artworkUrl600;
  return fresh.length;
}

async function refreshSubscriptions({notify=true}={}){
  if(!subscriptions.length)return;
  if(notify)showToast(`Refreshing ${subscriptions.length} podcast shows…`);
  let refreshed=0,failed=0;
  for(const sub of subscriptions){
    try{
      await refreshSubscription(sub);
      refreshed+=1;
    }catch{failed+=1;}
  }
  liveEpisodes.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  saveLibrary();
  if(state.view==="library")renderLibraryShows();else render();
  if(notify)showToast(`${refreshed} refreshed${failed?`, ${failed} unavailable`:""}`);
}

$("#podcast-results").addEventListener("click",async event=>{
  const button=event.target.closest(".add-show"); if(!button)return;
  const show=podcastResults[Number(button.dataset.result)]; if(!show)return;
  button.disabled=true; button.textContent="Adding…";
  try {
    await subscribeToShow(show); button.textContent="Added"; render();
  } catch(error) { button.disabled=false; button.textContent="Try again"; $("#discover-status").hidden=false; $("#discover-status").textContent=error.message; }
});

$("#export-button").addEventListener("click",()=>{
  const shows=subscriptions.filter(show=>show.feedUrl);
  if(!shows.length){showToast("There are no podcast subscriptions to export");return;}
  const outlines=shows.map(show=>`    <outline type="rss" text="${escapeXml(show.collectionName)}" title="${escapeXml(show.collectionName)}" xmlUrl="${escapeXml(show.feedUrl)}" />`).join("\n");
  const opml=`<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>Podcasts subscriptions</title></head>\n  <body>\n${outlines}\n  </body>\n</opml>\n`;
  const url=URL.createObjectURL(new Blob([opml],{type:"text/x-opml+xml"}));
  const link=document.createElement("a");link.href=url;link.download="podcasts-subscriptions.opml";link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);showToast(`${shows.length} podcast ${shows.length===1?"show":"shows"} exported`);
});

$("#import-button").addEventListener("click",()=>$("#import-file").click());
$("#refresh-button").addEventListener("click",()=>refreshSubscriptions());
$("#import-file").addEventListener("change",async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try{
    const doc=new DOMParser().parseFromString(await file.text(),"application/xml");
    if(doc.querySelector("parsererror"))throw new Error("That OPML file could not be read.");
    const feeds=[...doc.querySelectorAll("outline")].map(item=>({
      feedUrl:[...item.attributes].find(attribute=>attribute.name.toLowerCase()==="xmlurl")?.value||"",
      collectionName:[...item.attributes].find(attribute=>["title","text"].includes(attribute.name.toLowerCase()))?.value||"Imported podcast",
      artistName:"Imported from OPML",artworkUrl600:""
    })).filter(item=>/^https?:\/\//i.test(item.feedUrl));
    if(!feeds.length)throw new Error("No podcast RSS feeds were found in that OPML file.");
    const existing=new Set(subscriptions.map(show=>show.feedUrl));
    const unique=[...new Map(feeds.map(show=>[show.feedUrl,show])).values()].filter(show=>!existing.has(show.feedUrl));
    subscriptions.push(...unique);
    saveLibrary();renderLibraryShows();
    showToast(unique.length?`${unique.length} podcast shows imported · refreshing episodes…`:"All podcast shows were already imported");
    if(unique.length)refreshSubscriptions({notify:false});
  }catch(error){showToast(error.message||"Import failed");}
  event.target.value="";
});

function loadSavedData(){
  try{const actions=JSON.parse(localStorage.getItem("podcasts-actions")||"{}");state.queue=new Set(actions.queue||[]);state.starred=new Set(actions.starred||[]);state.deleted=new Set(actions.deleted||[]);}catch{}
  try{const library=JSON.parse(localStorage.getItem("podcasts-library")||"{}");subscriptions=library.subscriptions||[];liveEpisodes=library.liveEpisodes||[];}catch{}
  render();refreshSubscriptions({notify:false});
}

let installPrompt;
window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();installPrompt=event;$("#install-button").hidden=false;});
$("#install-button").addEventListener("click",async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$("#install-button").hidden=true;});
window.addEventListener("appinstalled",()=>showToast("Podcasts installed"));
function updateConnection(){ $("#connection-status").hidden=navigator.onLine; }
window.addEventListener("online",()=>{updateConnection();refreshSubscriptions({notify:false});});
window.addEventListener("offline",updateConnection);updateConnection();
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>showToast("Offline setup failed")));
loadSavedData();
