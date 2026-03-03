import{s as a,n as c}from"./index-OVD8Z4-M.js";async function l({username:d}){if(document.getElementById("view").innerHTML=`
    <div class="profile-page">
      <div class="profile-header">
        <div class="profile-avatar"></div>
        <div>
          <h2>@${s(d)}</h2>
          <p class="profile-bio" id="profileBio"></p>
        </div>
      </div>
      <div class="feed-grid" id="profileGrid">
        <div class="feed-loading">Loading...</div>
      </div>
    </div>`,!a)return;const{data:i}=await a.from("users").select("id, username, bio").eq("username",d).single();if(!i){document.getElementById("view").innerHTML='<p style="color:#888;padding:40px;text-align:center">User not found</p>';return}i.bio&&(document.getElementById("profileBio").textContent=i.bio);const{data:r}=await a.from("records").select("id, title, artist, plays, created_at").eq("user_id",i.id).eq("is_public",!0).order("created_at",{ascending:!1}),t=document.getElementById("profileGrid");if(!(r!=null&&r.length)){t.innerHTML='<p class="feed-empty">No public records yet.</p>';return}t.innerHTML=r.map(e=>`
    <div class="record-card" data-id="${e.id}">
      <div class="record-card-vinyl"></div>
      <div class="record-card-info">
        <div class="record-card-title">${s(e.title)}</div>
        ${e.artist?`<div class="record-card-artist">${s(e.artist)}</div>`:""}
        <div class="record-card-meta">${e.plays??0} plays</div>
      </div>
    </div>`).join(""),t.querySelectorAll(".record-card").forEach(e=>e.addEventListener("click",()=>c(`/r/${e.dataset.id}`)))}function s(d){return String(d??"").replace(/[&<>"']/g,i=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[i])}export{l as profileView};
