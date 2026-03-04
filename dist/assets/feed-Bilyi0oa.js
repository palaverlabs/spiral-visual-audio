import{s as i,n as o}from"./index-Dwbp2X2v.js";async function m(){if(document.getElementById("view").innerHTML=`
    <div class="feed-page">
      <h2 class="feed-title">Recent Records</h2>
      <div class="feed-grid" id="feedGrid">
        <div class="feed-loading">Loading...</div>
      </div>
    </div>`,!i){document.getElementById("feedGrid").innerHTML='<p class="feed-empty">Connect Supabase to see the feed.</p>';return}const{data:t,error:r}=await i.from("records").select("id, title, artist, duration, plays, created_at, cover_path, thumbnail_path, users(username)").eq("is_public",!0).order("created_at",{ascending:!1}).limit(24),d=document.getElementById("feedGrid");if(r||!(t!=null&&t.length)){d.innerHTML='<p class="feed-empty">No records yet. Be the first to publish one from the studio!</p>';return}d.innerHTML=t.map(e=>{var n;const s=e.cover_path||e.thumbnail_path,c=s?i.storage.from("records").getPublicUrl(s).data.publicUrl:null,l=c?`<img class="record-card-vinyl" src="${c}" alt="">`:'<div class="record-card-vinyl"></div>';return`
    <div class="record-card" data-id="${e.id}">
      ${l}
      <div class="record-card-info">
        <div class="record-card-title">${a(e.title)}</div>
        ${e.artist?`<div class="record-card-artist">${a(e.artist)}</div>`:""}
        <div class="record-card-meta">${(n=e.users)!=null&&n.username?`@${a(e.users.username)}`:""} &middot; ${e.plays??0} plays</div>
      </div>
    </div>`}).join(""),d.querySelectorAll(".record-card").forEach(e=>e.addEventListener("click",()=>o(`/r/${e.dataset.id}`)))}function a(t){return String(t??"").replace(/[&<>"']/g,r=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[r])}export{m as feedView};
