import{s as r,n as v}from"./index-6dTybhvt.js";async function m({username:l}){if(document.getElementById("view").innerHTML=`
    <div class="profile-page">
      <div class="profile-header">
        <div class="profile-avatar"></div>
        <div>
          <h2>@${a(l)}</h2>
          <p class="profile-bio" id="profileBio"></p>
        </div>
      </div>
      <div class="feed-grid" id="profileGrid">
        <div class="feed-loading">Loading...</div>
      </div>
      <div id="profileCollection"></div>
    </div>`,!r)return;const{data:d}=await r.from("users").select("id, username, bio").eq("username",l).single();if(!d){document.getElementById("view").innerHTML='<p style="color:#888;padding:40px;text-align:center">User not found</p>';return}d.bio&&(document.getElementById("profileBio").textContent=d.bio);const{data:c}=await r.from("records").select("id, title, artist, plays, created_at, thumbnail_path").eq("user_id",d.id).eq("is_public",!0).order("created_at",{ascending:!1}),o=document.getElementById("profileGrid");if(!(c!=null&&c.length)){o.innerHTML='<p class="feed-empty">No public records yet.</p>';return}o.innerHTML=c.map(e=>{const t=e.thumbnail_path?r.storage.from("records").getPublicUrl(e.thumbnail_path).data.publicUrl:null,i=t?`<img class="record-card-vinyl" src="${t}" alt="">`:'<div class="record-card-vinyl"></div>';return`
    <div class="record-card" data-id="${e.id}">
      ${i}
      <div class="record-card-info">
        <div class="record-card-title">${a(e.title)}</div>
        ${e.artist?`<div class="record-card-artist">${a(e.artist)}</div>`:""}
        <div class="record-card-meta">${e.plays??0} plays</div>
      </div>
    </div>`}).join(""),o.querySelectorAll(".record-card").forEach(e=>e.addEventListener("click",()=>v(`/r/${e.dataset.id}`)));const{data:s}=await r.from("collections").select("edition_number, records(id, title, artist, plays, edition_size, thumbnail_path)").eq("user_id",d.id).order("collected_at",{ascending:!1});if(s!=null&&s.length){const e=document.getElementById("profileCollection");e.innerHTML=`<h3 class="profile-section-heading">Collection</h3>
      <div class="feed-grid" id="collectionGrid"></div>`,document.getElementById("collectionGrid").innerHTML=s.map(t=>{const i=t.records,n=i.thumbnail_path?r.storage.from("records").getPublicUrl(i.thumbnail_path).data.publicUrl:null,p=n?`<img class="record-card-vinyl" src="${n}" alt="">`:'<div class="record-card-vinyl"></div>';return`<div class="record-card" data-id="${i.id}">
        ${p}
        <div class="record-card-info">
          <div class="record-card-title">${a(i.title)}</div>
          ${i.artist?`<div class="record-card-artist">${a(i.artist)}</div>`:""}
          <div class="record-card-meta">#${t.edition_number} of ${i.edition_size} · ${i.plays??0} plays</div>
        </div>
      </div>`}).join(""),document.getElementById("collectionGrid").querySelectorAll(".record-card").forEach(t=>t.addEventListener("click",()=>v(`/r/${t.dataset.id}`)))}}function a(l){return String(l??"").replace(/[&<>"']/g,d=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[d])}export{m as profileView};
