const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/codec-BojUtfmC.js","assets/constants-DLOse1cr.js","assets/dsp-C2k8GsBn.js","assets/renderer-B0CEpKcw.js","assets/skin-CgR2CiEM.js","assets/playback-BmsgTywu.js"])))=>i.map(i=>d[i]);
import{s as l,n as N,_ as p}from"./index-CA5ANbvu.js";async function G({id:y}){var b;document.getElementById("view").innerHTML=`
    <div class="record-page">
      <div class="record-hero">
        <div class="record-disc-wrap">
          <canvas id="recordCanvas" width="1000" height="1000"></canvas>
        </div>
      </div>
      <div class="record-info">
        <div class="status-line info" id="recordStatus">Loading record...</div>
        <h1 id="recordTitle"></h1>
        <div class="record-artist" id="recordArtist"></div>
        <div class="record-meta" id="recordMeta"></div>
        <div class="record-transport">
          <div class="play-wrap" id="recordPlayWrap">
            <div class="play-ring"></div>
            <button class="play-btn" id="recordPlayBtn" disabled>&#9654;</button>
          </div>
          <span class="time-display">
            <span id="recordCurrentTime">0:00</span>
            <span class="t-sep"> / </span>
            <span id="recordTotalTime">0:00</span>
          </span>
        </div>
      </div>
    </div>`;const d=(e,a="info")=>{const m=document.getElementById("recordStatus");m&&(m.textContent=e,m.className=`status-line ${a}`)};if(!l){d("Supabase not configured.","error");return}const{data:t,error:L}=await l.from("records").select("*, users(username)").eq("id",y).single();if(L||!t){d("Record not found.","error");return}const _=e=>`${Math.floor(e/60)}:${String(Math.floor(e%60)).padStart(2,"0")}`;document.getElementById("recordTitle").textContent=t.title,document.getElementById("recordArtist").textContent=t.artist||"",document.getElementById("recordMeta").textContent=[(b=t.users)!=null&&b.username?`@${t.users.username}`:"",t.duration?_(t.duration):"",`${t.plays??0} plays`].filter(Boolean).join(" · ");const{data:{user:I}={}}=await l.auth.getUser().catch(()=>({data:{}}));if(I&&I.id===t.user_id){const e=document.createElement("button");e.className="action-btn record-delete-btn",e.textContent="Delete record",document.getElementById("recordMeta").after(e),e.addEventListener("click",async()=>{if(confirm("Delete this record? This cannot be undone.")){e.disabled=!0,e.textContent="Deleting...";try{await l.storage.from("records").remove([t.file_path]);const{error:a}=await l.from("records").delete().eq("id",y);if(a)throw a;N("/")}catch(a){d(`Delete failed: ${a.message}`,"error"),e.disabled=!1,e.textContent="Delete record"}}})}const{data:E}=l.storage.from("records").getPublicUrl(t.file_path),P=E==null?void 0:E.publicUrl;if(!P){d("Could not resolve file URL.","error");return}d("Fetching groove...");try{const e=await fetch(P);if(!e.ok)throw new Error(`HTTP ${e.status}`);const a=await e.text(),[{decodeFromSVG:m},{Renderer:S},{PlaybackManager:M},{SkinManager:A,SKINS:k},{DEFAULT_ROUT:F,DEFAULT_RIN:U,DEFAULT_CX:$,DEFAULT_CY:V,SPIN_SPEED:x}]=await Promise.all([p(()=>import("./codec-BojUtfmC.js"),__vite__mapDeps([0,1,2])),p(()=>import("./renderer-B0CEpKcw.js"),__vite__mapDeps([3,1,4])),p(()=>import("./playback-BmsgTywu.js"),__vite__mapDeps([5,1,2])),p(()=>import("./skin-CgR2CiEM.js"),[]),p(()=>import("./constants-DLOse1cr.js"),[])]),n={Rout:F,Rin:U,cx:$,cy:V},r=m(a,n);n.Rout=r.Rout,n.Rin=r.Rin,n.cx=r.cx,n.cy=r.cy;const O=r.samples.length/r.sampleRate;document.getElementById("recordTotalTime").textContent=_(O),d("Ready","success");const h=new A,B=h.restore()||k.owl;h.restore()||h.apply(B);const g=new S(document.getElementById("recordCanvas"));g.setSkin(B.canvas),g.preRenderGroove(r.groovePoints,n),g.drawDiscWithGroove(0,-1,n);let w=0,R=0,o=0,u=!1,T=performance.now();const s=new M({onFrame:({progress:i,audioTimePosition:c,amplitude:W=0})=>{const C=performance.now(),v=Math.min((C-T)/1e3,.05);if(T=C,u){if(o=Math.max(0,o-.7*v),s.setRate(o),w+=v*x*o,o===0){u=!1,s.stop();return}}else o=Math.min(1,o+1.5*v),w+=v*x*o,s.setRate(o);R=i,g.drawDiscWithGroove(w,R,n,W,s.getFrequencyData());const D=document.getElementById("recordCurrentTime");D&&(D.textContent=_(c))},onStop:()=>{const i=document.getElementById("recordPlayBtn"),c=document.getElementById("recordPlayWrap");i&&(i.textContent="▶"),c&&c.classList.remove("playing")},onDebug:()=>{}}),f=document.getElementById("recordPlayBtn");return f.disabled=!1,f.addEventListener("click",async()=>{var i,c;s.isPlaying||u?(u=!0,f.textContent="▶",(i=document.getElementById("recordPlayWrap"))==null||i.classList.remove("playing")):(s.unlock(),f.textContent="⏸",(c=document.getElementById("recordPlayWrap"))==null||c.classList.add("playing"),o=0,u=!1,await s.start({left:r.samples,right:r.samplesR||null,sampleRate:r.sampleRate},0,R),T=performance.now())}),l.from("records").update({plays:(t.plays??0)+1}).eq("id",y),()=>s.stop()}catch(e){d(`Failed to load: ${e.message}`,"error")}}export{G as recordView};
