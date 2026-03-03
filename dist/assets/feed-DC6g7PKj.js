import{s as a,n as c}from"./index-BtUnXu5b.js";async function o(){if(document.getElementById("view").innerHTML=`
    <div class="feed-page">
      <h2 class="feed-title">Recent Records</h2>
      <div class="feed-grid" id="feedGrid">
        <div class="feed-loading">Loading...</div>
      </div>
    </div>`,!a){document.getElementById("feedGrid").innerHTML='<p class="feed-empty">Connect Supabase to see the feed.</p>';return}const{data:d,error:t}=await a.from("records").select("id, title, artist, duration, plays, created_at, users(username)").eq("is_public",!0).order("created_at",{ascending:!1}).limit(24),i=document.getElementById("feedGrid");if(t||!(d!=null&&d.length)){i.innerHTML='<p class="feed-empty">No records yet. Be the first to publish one from the studio!</p>';return}i.innerHTML=d.map(e=>{var s;return`
    <div class="record-card" data-id="${e.id}">
      <div class="record-card-vinyl"></div>
      <div class="record-card-info">
        <div class="record-card-title">${r(e.title)}</div>
        ${e.artist?`<div class="record-card-artist">${r(e.artist)}</div>`:""}
        <div class="record-card-meta">${(s=e.users)!=null&&s.username?`@${r(e.users.username)}`:""} &middot; ${e.plays??0} plays</div>
      </div>
    </div>`}).join(""),i.querySelectorAll(".record-card").forEach(e=>e.addEventListener("click",()=>c(`/r/${e.dataset.id}`)))}function r(d){return String(d??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t])}export{o as feedView};
