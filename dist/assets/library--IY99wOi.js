import{s as d,n as c}from"./index-bkAPpy9F.js";async function m(){if(document.getElementById("view").innerHTML=`
    <div class="library-page">
      <h2 class="feed-title">My Library</h2>
      <div id="libraryContent"><div class="feed-loading">Loading...</div></div>
    </div>`,!d){document.getElementById("libraryContent").innerHTML='<p class="feed-empty">Connect Supabase to use the library.</p>';return}const{data:{user:e}}=await d.auth.getUser();if(!e){document.getElementById("libraryContent").innerHTML='<p class="feed-empty"><a href="/auth" data-route="/auth">Sign in</a> to see your library.</p>';return}const[{data:i},{data:r}]=await Promise.all([d.from("records").select("id, title, artist, duration, plays, created_at, thumbnail_path, is_public").eq("user_id",e.id).order("created_at",{ascending:!1}),d.from("collections").select("edition_number, collected_at, records(id, title, artist, plays, edition_size, thumbnail_path)").eq("user_id",e.id).order("collected_at",{ascending:!1})]);let a='<h3 class="profile-section-heading">My Records</h3>';i!=null&&i.length?a+=`<div class="feed-grid">${i.map(t=>o(t,t.is_public?null:"Private")).join("")}</div>`:a+='<p class="feed-empty">No records yet. <a href="/studio" data-route="/studio">Make something</a> in the studio.</p>';const s=(r==null?void 0:r.filter(t=>t.records))??[];s.length&&(a+='<h3 class="profile-section-heading">My Collection</h3>',a+=`<div class="feed-grid">${s.map(t=>o(t.records,`#${t.edition_number} of ${t.records.edition_size}`)).join("")}</div>`);const n=document.getElementById("libraryContent");n.innerHTML=a,n.querySelectorAll(".record-card[data-id]").forEach(t=>t.addEventListener("click",()=>c(`/r/${t.dataset.id}`)))}function o(e,i){const r=e.thumbnail_path?d.storage.from("records").getPublicUrl(e.thumbnail_path).data.publicUrl:null,a=r?`<img class="record-card-vinyl" src="${r}" alt="">`:'<div class="record-card-vinyl"></div>',s=[i,e.plays!=null?`${e.plays} plays`:null].filter(Boolean);return`
    <div class="record-card" data-id="${e.id}">
      ${a}
      <div class="record-card-info">
        <div class="record-card-title">${l(e.title)}</div>
        ${e.artist?`<div class="record-card-artist">${l(e.artist)}</div>`:""}
        <div class="record-card-meta">${s.map(l).join(" · ")}</div>
      </div>
    </div>`}function l(e){return String(e??"").replace(/[&<>"']/g,i=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[i])}export{m as libraryView};
