import{s as i,n as l}from"./index-6dTybhvt.js";async function u(){if(document.getElementById("view").innerHTML=`
    <div class="feed-page">
      <h2 class="feed-title">Recent Records</h2>
      <div class="feed-grid" id="feedGrid">
        <div class="feed-loading">Loading...</div>
      </div>
    </div>`,!i){document.getElementById("feedGrid").innerHTML='<p class="feed-empty">Connect Supabase to see the feed.</p>';return}const{data:t,error:d}=await i.from("records").select("id, title, artist, duration, plays, created_at, thumbnail_path, users(username)").eq("is_public",!0).order("created_at",{ascending:!1}).limit(24),r=document.getElementById("feedGrid");if(d||!(t!=null&&t.length)){r.innerHTML='<p class="feed-empty">No records yet. Be the first to publish one from the studio!</p>';return}r.innerHTML=t.map(e=>{var c;const a=e.thumbnail_path?i.storage.from("records").getPublicUrl(e.thumbnail_path).data.publicUrl:null,n=a?`<img class="record-card-vinyl" src="${a}" alt="">`:'<div class="record-card-vinyl"></div>';return`
    <div class="record-card" data-id="${e.id}">
      ${n}
      <div class="record-card-info">
        <div class="record-card-title">${s(e.title)}</div>
        ${e.artist?`<div class="record-card-artist">${s(e.artist)}</div>`:""}
        <div class="record-card-meta">${(c=e.users)!=null&&c.username?`@${s(e.users.username)}`:""} &middot; ${e.plays??0} plays</div>
      </div>
    </div>`}).join(""),r.querySelectorAll(".record-card").forEach(e=>e.addEventListener("click",()=>l(`/r/${e.dataset.id}`)))}function s(t){return String(t??"").replace(/[&<>"']/g,d=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[d])}export{u as feedView};
