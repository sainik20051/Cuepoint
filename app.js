const STORE='cuepoint_v1_auto_manual';
const PLAYER='cuepoint_current_player_v2';
const ADMIN='cuepoint_admin_session_v2';
const SUPER='cuepoint_super_session_v2';
const CLUB_ID='c1';
const bc=('BroadcastChannel' in window)?new BroadcastChannel('cuepoint-live'):null;
let supabaseClient=null;
let supabaseReady=false;
let remoteSyncing=false;
const REMOTE_STATE_ID='cuepoint-bolton-v1';
function initSupabaseClient(){
  if(!window.supabase||!window.CUEPOINT_SUPABASE_URL||!window.CUEPOINT_SUPABASE_ANON_KEY)return null;
  if(supabaseClient)return supabaseClient;
  supabaseClient=window.supabase.createClient(window.CUEPOINT_SUPABASE_URL,window.CUEPOINT_SUPABASE_ANON_KEY);
  return supabaseClient;
}
async function initSupabaseSync(){
  const client=initSupabaseClient();
  if(!client)return;
  try{
    const {data,error}=await client.from('app_state').select('data').eq('id',REMOTE_STATE_ID).maybeSingle();
    if(error){console.warn('Supabase sync not ready:',error.message);return;}
    if(data&&data.data){
      remoteSyncing=true;
      localStorage.setItem(STORE,JSON.stringify(migrate(data.data)));
      remoteSyncing=false;
    }else{
      await client.from('app_state').upsert({id:REMOTE_STATE_ID,data:migrate(getData()),updated_at:new Date().toISOString()});
    }
    supabaseReady=true;
    client.channel('cuepoint-app-state')
      .on('postgres_changes',{event:'*',schema:'public',table:'app_state',filter:`id=eq.${REMOTE_STATE_ID}`},payload=>{
        if(payload.new&&payload.new.data){
          remoteSyncing=true;
          localStorage.setItem(STORE,JSON.stringify(migrate(payload.new.data)));
          remoteSyncing=false;
          window.dispatchEvent(new Event('cuepoint:data'));
        }
      })
      .subscribe();
  }catch(err){console.warn('Supabase sync failed:',err.message)}
}
function pushSupabase(d){
  if(!supabaseReady||remoteSyncing||!supabaseClient)return;
  supabaseClient.from('app_state').upsert({id:REMOTE_STATE_ID,data:migrate(d),updated_at:new Date().toISOString()}).then(({error})=>{if(error)console.warn('Supabase save failed:',error.message)});
}

const now=new Date();
const iso=d=>d.toISOString().slice(0,10);
const addDays=n=>{const d=new Date(now);d.setDate(d.getDate()+n);return d};
const dates=[0,1,2].map(n=>({value:iso(addDays(n)),label:n===0?'Today':n===1?'Tomorrow':'Day after',nice:new Date(iso(addDays(n))+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}));
const seed={
  clubs:[{id:'c1',name:'Cue Point Bolton',licensePrice:8.99,playerSellPrice:15.99,licenseLimit:0,active:true,createdAt:new Date().toLocaleString('en-GB')}],
  players:[],
  tapIns:[],
  matches:[]
};
function migrate(d){
  d=d||{};
  d.clubs=d.clubs&&d.clubs.length?d.clubs:JSON.parse(JSON.stringify(seed.clubs));
  d.clubs=d.clubs.map(c=>({id:CLUB_ID,name:'Cue Point Bolton',licensePrice:c.licensePrice??c.licencePrice??8.99,playerSellPrice:c.playerSellPrice??15.99,licenseLimit:c.licenseLimit??c.licenceLimit??0,active:c.active??true,createdAt:c.createdAt||new Date().toLocaleString('en-GB')}));
  d.players=(d.players||[]).map(p=>({clubId:CLUB_ID,licenseStatus:p.licenseStatus||p.licenceStatus||'pending',...p,licenceStatus:undefined})).map(p=>{delete p.licenceStatus;return p});
  d.tapIns=d.tapIns||[];
  d.matches=d.matches||[];
  return d;
}
function getData(){const raw=localStorage.getItem(STORE);if(!raw){localStorage.setItem(STORE,JSON.stringify(seed));return JSON.parse(JSON.stringify(seed))}const d=migrate(JSON.parse(raw));localStorage.setItem(STORE,JSON.stringify(d));return d}
function setData(d){const cleanData=migrate(d);localStorage.setItem(STORE,JSON.stringify(cleanData));pushSupabase(cleanData);bc?.postMessage({type:'data'});window.dispatchEvent(new Event('cuepoint:data'))}
function $(s){return document.querySelector(s)}
function $all(s){return [...document.querySelectorAll(s)]}
function clean(v){return (v||'').trim().replace(/[<>]/g,'')}
function money(n){return '£'+Number(n||0).toFixed(2)}
function initials(n){return (n||'P').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()}
function club(d=getData()){return d.clubs.find(c=>c.id===CLUB_ID)||d.clubs[0]}
function activePlayers(d=getData()){return d.players.filter(p=>p.clubId===CLUB_ID&&p.licenseStatus==='active')}
function pendingPlayers(d=getData()){return d.players.filter(p=>p.clubId===CLUB_ID&&p.licenseStatus==='pending')}
function licenseLeft(d=getData()){const c=club(d);return Math.max(0,(c.licenseLimit||0)-activePlayers(d).length)}
function fillDates(){const html=dates.map(d=>`<option value="${d.value}">${d.label} · ${d.nice}</option>`).join('');$all('[data-dates]').forEach(x=>x.innerHTML=html)}
function fillTimes(){let t=[];for(let h=12;h<=19;h++){const hr=h===12?12:h-12;t.push(`${hr}:00 PM`);if(h<19)t.push(`${hr}:30 PM`)}$all('[data-times]').forEach(x=>x.innerHTML=t.map(v=>`<option>${v}</option>`).join(''))}
function bindChoices(){document.addEventListener('click',e=>{const b=e.target.closest('.choice');if(!b)return;const g=b.closest('[data-choice-group]');g.querySelectorAll('.choice').forEach(x=>x.classList.remove('selected'));b.classList.add('selected')})}
function choice(name){return $(`[data-choice-group="${name}"] .choice.selected`)?.dataset.value||''}
function currentPlayer(){const id=localStorage.getItem(PLAYER);if(!id)return null;return getData().players.find(p=>p.id===id)||null}
function requirePlayer(){const p=currentPlayer();if(!p)location.href='login.html';return p}
function requireAdmin(){if(localStorage.getItem(ADMIN)!=='yes'){location.href='login.html';return false}return true}
function requireSuper(){if(localStorage.getItem(SUPER)!=='yes'){location.href='login.html';return false}return true}
function dateLabel(value){return dates.find(d=>d.value===value)?.label||value}
function matchFor(id){return getData().matches.find(m=>m.playerIds.includes(id)&&m.status!=='declined')}
function live(draw){bc&&(bc.onmessage=draw);window.addEventListener('storage',draw);window.addEventListener('cuepoint:data',draw);setInterval(draw,2000)}
function adminStats(){const d=getData(),c=club(d),active=activePlayers(d).length,left=licenseLeft(d);$all('[data-live-count]').forEach(x=>x.textContent=d.tapIns.filter(t=>t.status==='waiting').length);$all('[data-member-count]').forEach(x=>x.textContent=d.players.length);$all('[data-match-count]').forEach(x=>x.textContent=d.matches.length);$all('[data-active-licenses]').forEach(x=>x.textContent=active);$all('[data-license-limit]').forEach(x=>x.textContent=c.licenseLimit||0);$all('[data-license-left]').forEach(x=>x.textContent=left);$all('[data-monthly-cost]').forEach(x=>x.textContent=money(active*(c.licensePrice||8.99)));$all('[data-club-profit]').forEach(x=>x.textContent=money(active*((c.playerSellPrice||15.99)-(c.licensePrice||8.99))))}
function makeMatch(aId,bId,source='manual'){const d=getData();const a=d.tapIns.find(t=>t.id===aId),b=d.tapIns.find(t=>t.id===bId);if(!a||!b)return {ok:false,msg:'Select two waiting players first'};if(a.id===b.id)return {ok:false,msg:'Choose two different players'};const time=a.time===b.time?a.time:`${a.time} / ${b.time}`;const mood=a.mood==='Either'?b.mood:(b.mood==='Either'?a.mood:(a.mood===b.mood?a.mood:`${a.mood} / ${b.mood}`));const level=a.level===b.level?a.level:`${a.level} / ${b.level}`;d.matches.push({id:'m'+Date.now(),playerIds:[a.playerId,b.playerId],players:[a.user,b.user],date:a.date,dateLabel:a.dateLabel,time,mood,level,status:'sent',source});a.status='matched';b.status='matched';setData(d);return {ok:true,msg:`Match sent: ${a.user} vs ${b.user}`}}
function initHome(){fillDates()}
function initLogin(){
  $('#playerLoginForm')?.addEventListener('submit', async e=>{
    e.preventDefault();

    const email=clean($('#email').value).toLowerCase();
    const password=$('#password').value;
    const box=$('#playerLoginForm');
    $('.login-error')?.remove();

    if(!email||!password)return;

    const client=initSupabaseClient();
    if(!client){
      box.insertAdjacentHTML('afterend','<p class="login-error">Login system not connected.</p>');
      return;
    }

    const {data:loginData,error:loginError}=await client.auth.signInWithPassword({
      email,
      password
    });

    if(loginError){
      box.insertAdjacentHTML('afterend',`<p class="login-error">${loginError.message}</p>`);
      return;
    }

    const user=loginData.user;

    const {data:player,error:playerError}=await client
      .from('players')
      .select('*')
      .eq('auth_user_id',user.id)
      .maybeSingle();

    if(playerError||!player){
      box.insertAdjacentHTML('afterend','<p class="login-error">Player profile not found. Ask the club desk to check your account.</p>');
      return;
    }

    const d=getData();
    let localPlayer=d.players.find(p=>p.email&&p.email.toLowerCase()===email);

    if(!localPlayer){
      localPlayer={
        id:player.id,
        clubId:CLUB_ID,
        name:player.full_name,
        email:player.email,
        contact:player.phone||player.email,
        level:player.skill_level||'Casual',
        licenseStatus:'active',
        lastSeen:new Date().toLocaleString('en-GB')
      };
      d.players.push(localPlayer);
    }else{
      localPlayer.id=player.id;
      localPlayer.name=player.full_name;
      localPlayer.email=player.email;
      localPlayer.contact=player.phone||player.email;
      localPlayer.level=player.skill_level||localPlayer.level;
      localPlayer.licenseStatus='active';
      localPlayer.lastSeen=new Date().toLocaleString('en-GB');
    }

    setData(d);
    localStorage.setItem(PLAYER,localPlayer.id);
    location.href='player.html';
  });
}
function initAdminLogin(){
  $('#adminLoginForm')?.addEventListener('submit',e=>{
    e.preventDefault();
    const pin=clean(($('#adminPin')||$('#pin')).value);
    const msg=$('#adminLoginMsg')||$('#msg');
    if(pin==='1234'){
      localStorage.setItem(ADMIN,'yes');
      location.href='dashboard.html';
    }else if(msg){
      msg.innerHTML='<div class="notice">Wrong PIN</div>';
    }
  });
}
function initSuperLogin(){
  $('#superLoginForm')?.addEventListener('submit',e=>{e.preventDefault();const pin=clean($('#pin').value);if(pin==='9000'){localStorage.setItem(SUPER,'yes');location.href='index.html'}else{$('#msg').innerHTML='<div class="notice">Wrong demo PIN — try 9000</div>'}})
}
function initPlayer(){
  const p=requirePlayer();if(!p)return;fillDates();fillTimes();bindChoices();$('#playerName').innerHTML=`<span class="initials">${initials(p.name)}</span>${p.name}`;
  function draw(){const d=getData();const me=d.players.find(x=>x.id===p.id)||p;if(me.licenseStatus!=='active'){$('#playerStatus').innerHTML='<div class="notice"><b>Your account is waiting for the club admin</b><br>Once they activate your player license, you can tap in</div>';return}const open=d.tapIns.find(t=>t.playerId===p.id&&t.status==='waiting');const match=d.matches.find(m=>m.playerIds.includes(p.id)&&m.status!=='declined');
    if(match){const other=match.players.find(x=>x!==me.name);$('#playerStatus').innerHTML=`<div class="card"><span class="pill">Match sent by admin</span><h2>You vs ${other}</h2><p class="quiet">${match.dateLabel} at ${match.time}<br>${match.mood} frame · ${match.level}</p><div class="actions"><button class="btn red" data-accept="${match.id}">Accept</button><button class="btn ghost" data-decline="${match.id}">Can't make it</button></div></div>`}
    else if(open){$('#playerStatus').innerHTML=`<div class="notice"><b>You’re tapped in</b><br>${open.dateLabel} at ${open.time}<br>Admin can see your request live now</div>`}
    else{$('#playerStatus').innerHTML='<div class="empty">Pick a day and time, then tap in — the organiser will sort the rest</div>'}
  }
  $('#tapForm')?.addEventListener('submit',e=>{e.preventDefault();const d=getData();const me=d.players.find(x=>x.id===p.id);if(!me||me.licenseStatus!=='active'){draw();return}d.tapIns=d.tapIns.filter(t=>!(t.playerId===p.id&&t.status==='waiting'));const date=$('#tapDate').value;d.tapIns.push({id:'t'+Date.now(),playerId:p.id,user:me.name,contact:me.contact,level:me.level,mood:choice('mood')||'Either',date,dateLabel:dateLabel(date),time:$('#tapTime').value,status:'waiting',createdAt:new Date().toLocaleString('en-GB')});setData(d);draw();$('#tapSaved').innerHTML='<div class="notice">You’re in — the organiser can see your request now</div>'});
  document.addEventListener('click',e=>{const accept=e.target.closest('[data-accept]'),decline=e.target.closest('[data-decline]');if(!accept&&!decline)return;const id=(accept||decline).dataset.accept||(accept||decline).dataset.decline;const d=getData();const m=d.matches.find(x=>x.id===id);if(m)m.status=accept?'accepted':'declined';setData(d);draw()});
  live(draw);draw();
}
function initMatch(){const p=requirePlayer();if(!p)return;$('#playerName').innerHTML=`<span class="initials">${initials(p.name)}</span>${p.name}`;function draw(){const m=matchFor(p.id);if(!m){$('#matchBox').innerHTML='<div class="empty">No match yet — when the organiser sends one, it will show here</div>';return}const other=m.players.find(x=>x!==p.name);$('#matchBox').innerHTML=`<div class="card"><span class="pill">${m.status}</span><h2>You vs ${other}</h2><p class="quiet">${m.dateLabel} · ${m.time}<br>${m.mood} frame · ${m.level}</p></div>`}live(draw);draw()}
function adminWaitingRows(){const d=getData();const date=$('#adminDate')?.value||dates[0].value;return d.tapIns.filter(t=>t.date===date&&t.status==='waiting')}
function requestOption(t){return `<option value="${t.id}">${t.user} · ${t.time} · ${t.level} · ${t.mood}</option>`}
function matchScore(a,b){
  const rank={Beginner:1,Casual:2,Intermediate:3,League:4,Advanced:5,Pro:6};
  let score=0;
  if(a.time===b.time)score+=45;
  else if(a.time.split(':')[0]===b.time.split(':')[0])score+=25;
  if(a.mood===b.mood||a.mood==='Either'||b.mood==='Either')score+=25;
  const gap=Math.abs((rank[a.level]||2)-(rank[b.level]||2));
  score+=Math.max(0,35-gap*12);
  if(gap>=3)score-=30;
  return Math.max(0,score);
}
function pairWaitingPlayers(rows){
  if(rows.length<2)return [];
  let pool=[...rows],pairs=[];
  while(pool.length>1){
    let best=null,bestScore=-1;
    for(let i=0;i<pool.length;i++){
      for(let j=i+1;j<pool.length;j++){
        const score=matchScore(pool[i],pool[j]);
        if(score>bestScore){bestScore=score;best=[pool[i],pool[j],score]}
      }
    }
    if(!best)break;
    pairs.push(best);
    pool=pool.filter(x=>x.id!==best[0].id&&x.id!==best[1].id);
  }
  return pairs;
}
function adminWaitingRows(){const d=getData();const date=$('#adminDate')?.value||dates[0].value;return d.tapIns.filter(t=>t.date===date&&t.status==='waiting')}
function requestOption(t){return `<option value="${t.id}">${t.user} · ${t.time} · ${t.level} · ${t.mood}</option>`}
function suggestions(rows){
  const pairs=pairWaitingPlayers(rows);
  if(!pairs.length)return '<div class="empty">Need at least two users waiting to suggest a pair</div>';
  return pairs.map(([a,b,s])=>`<div class="person"><div><b>${a.user} vs ${b.user}</b><div class="mini">${a.time===b.time?a.time:a.time+' / '+b.time} · ${a.level} / ${b.level}<br>${a.mood==='Either'?b.mood:a.mood} · match score ${s}</div></div><button class="btn red" data-send="${a.id}|${b.id}">Send match</button></div>`).join('')
}
function autoMatchRows(rows){
  const pairs=pairWaitingPlayers(rows);
  if(!pairs.length)return {count:0,msg:'Need at least two waiting players to auto match'};
  let sent=0,last='';
  for(const [a,b] of pairs){
    const res=makeMatch(a.id,b.id,'auto');
    if(res.ok){sent++;last=res.msg}
  }
  return {count:sent,msg:sent?`${sent} match${sent===1?'':'es'} sent automatically`:last||'No matches sent'};
}
function initAdmin(){
  if(!requireAdmin())return;fillDates();
  function draw(){adminStats();const rows=adminWaitingRows();$('#liveCount')&&($('#liveCount').textContent=rows.length);$('#requestList')&&($('#requestList').innerHTML=rows.length?rows.map(t=>`<div class="person"><div><b>${t.user}</b><div class="mini">${t.time} · ${t.level} · ${t.mood}<br>${t.contact}</div></div><span class="pill"><span class="live-dot"></span>waiting</span></div>`).join(''):'<div class="empty">No players waiting for this day yet</div>');$('#tapRows')&&($('#tapRows').innerHTML=rows.length?rows.map(t=>`<tr><td>${t.user}</td><td>${t.contact}</td><td>${t.dateLabel}</td><td>${t.time}</td><td>${t.level}</td><td>${t.mood}</td><td><span class="pill">live</span></td></tr>`).join(''):'<tr><td colspan="7"><div class="empty">No live tap-ins yet</div></td></tr>')}
  $('#adminDate')?.addEventListener('change',draw);$('#clearDemo')?.addEventListener('click',()=>{localStorage.setItem(STORE,JSON.stringify(seed));bc?.postMessage({type:'data'});draw()});live(draw);draw();
}
function initAdminMatch(){
  if(!requireAdmin())return;fillDates();let mode='auto';
  function setMode(next){mode=next;$('#autoMode')?.classList.toggle('hidden',mode!=='auto');$('#manualMode')?.classList.toggle('hidden',mode!=='manual');$all('[data-mode]').forEach(b=>{b.classList.toggle('red',b.dataset.mode===mode);b.classList.toggle('ghost',b.dataset.mode!==mode)})}
  function draw(){adminStats();const rows=adminWaitingRows();const html='<option value="">Select user</option>'+rows.map(requestOption).join('');$('#manualPlayerOne').innerHTML=html;$('#manualPlayerTwo').innerHTML=html;$('#requestList').innerHTML=rows.length?rows.map(t=>`<div class="person"><div><b>${t.user}</b><div class="mini">${t.time} · ${t.level} · ${t.mood}<br>${t.contact}</div></div><span class="pill">waiting</span></div>`).join(''):'<div class="empty">No players waiting for this day yet</div>';$('#suggestions').innerHTML=suggestions(rows);$('#matchRows').innerHTML=getData().matches.slice().reverse().map(m=>`<tr><td>${m.players.join(' vs ')}</td><td>${m.dateLabel}</td><td>${m.time}</td><td>${m.status}</td><td>${m.source||'manual'}</td></tr>`).join('')||'<tr><td colspan="5"><div class="empty">No matches sent yet</div></td></tr>'}
  $('#manualMatchForm')?.addEventListener('submit',e=>{e.preventDefault();const res=makeMatch($('#manualPlayerOne').value,$('#manualPlayerTwo').value,'manual');$('#manualMsg').innerHTML=`<div class="notice">${res.msg}</div>`;draw()});
  $('#suggestions')?.addEventListener('click',e=>{const btn=e.target.closest('[data-send]');if(!btn)return;const [a,b]=btn.dataset.send.split('|');const res=makeMatch(a,b,'suggested');$('#autoMsg').innerHTML=`<div class="notice">${res.msg}</div>`;draw()});
  $('#autoMatchBtn')?.addEventListener('click',()=>{const res=autoMatchRows(adminWaitingRows());$('#autoMsg').innerHTML=`<div class="notice">${res.msg}</div>`;draw()});
  $all('[data-mode]').forEach(btn=>btn.addEventListener('click',()=>setMode(btn.dataset.mode)));
  $('#adminDate')?.addEventListener('change',draw);setMode('auto');live(draw);draw();
}
function initAdminAddPlayer(){
  if(!requireAdmin())return;

  async function ensureSupabaseAdminSession(client){
    const {data:{session}}=await client.auth.getSession();
    if(session)return true;

    const email=prompt('Enter your admin email for Supabase invite access');
    if(!email)return false;
    const password=prompt('Enter your Supabase admin password');
    if(!password)return false;

    const {error}=await client.auth.signInWithPassword({email,password});
    if(error){
      $('#addPlayerMsg').innerHTML=`<div class="notice"><b>Admin login failed</b><br>${error.message}</div>`;
      return false;
    }
    return true;
  }

  function draw(){adminStats()}

  $('#addPlayerForm')?.addEventListener('submit',async e=>{
    e.preventDefault();

    const msg=$('#addPlayerMsg');
    const client=initSupabaseClient();

    if(!client){
      msg.innerHTML='<div class="notice">Supabase is not connected.</div>';
      return;
    }

    const full_name=clean($('#newName').value);
    const email=clean($('#newEmail').value).toLowerCase();
    const phone=clean($('#newContact').value);
    const skill_level=$('#newLevel').value;
    const license_status=$('#newStatus').value;

    if(!full_name||!email){
      msg.innerHTML='<div class="notice">Name and email are required.</div>';
      return;
    }

    const loggedIn=await ensureSupabaseAdminSession(client);
    if(!loggedIn)return;

    msg.innerHTML='<div class="notice">Sending player invite...</div>';

    try{
      const {data,error}=await client.functions.invoke('invite-player',{
        body:{
          full_name,
          email,
          phone,
          club:'Cue Point Bolton',
          skill_level,
          notes:`Licence status: ${license_status}`
        }
      });

      if(error||data?.success===false){
        throw new Error(error?.message||data?.error||'Unknown invite error');
      }

      const d=getData();
      let p=d.players.find(x=>(x.email&&x.email.toLowerCase()===email)||(x.contact&&x.contact.toLowerCase()===email));
      if(p){
        p.name=full_name;
        p.email=email;
        p.contact=phone||email;
        p.level=skill_level;
        p.licenseStatus=license_status;
        p.inviteStatus='sent';
        p.lastSeen='Invite sent by admin';
      }else{
        d.players.push({id:'p'+Date.now(),clubId:CLUB_ID,name:full_name,email,contact:phone||email,level:skill_level,licenseStatus:license_status,inviteStatus:'sent',lastSeen:'Invite sent by admin'});
      }
      setData(d);

      $('#addPlayerForm').reset();
      msg.innerHTML='<div class="notice">Player added and invite sent.</div>';
      draw();
    }catch(err){
      msg.innerHTML=`<div class="notice"><b>Invite failed</b><br>${err.message}</div>`;
    }
  });

  live(draw);draw();
}
function initAdminMembers(){
  if(!requireAdmin())return;
  function draw(){adminStats();const d=getData();$('#memberRows').innerHTML=d.players.slice().reverse().map(p=>`<tr><td>${p.name}</td><td>${p.email||p.contact||'—'}</td><td>${p.level}</td><td>${p.licenseStatus||'pending'}</td><td>${p.lastSeen||'—'}</td><td>${p.licenseStatus==='active'?`<button class="btn ghost small" data-deactivate="${p.id}">Deactivate</button>`:`<button class="btn red small" data-activate="${p.id}">Activate</button>`}</td></tr>`).join('')||'<tr><td colspan="6"><div class="empty">No players added yet</div></td></tr>'}
  $('#memberRows')?.addEventListener('click',e=>{const a=e.target.closest('[data-activate]'),de=e.target.closest('[data-deactivate]');if(!a&&!de)return;const d=getData();const p=d.players.find(x=>x.id===(a?.dataset.activate||de?.dataset.deactivate));if(!p)return;if(a){if(licenseLeft(d)<=0){$('#memberMsg').innerHTML='<div class="notice"><b>You have ran out of licenses</b><br>Ask the super admin to add more before activating another player</div>';return}p.licenseStatus='active'}else{p.licenseStatus='inactive';d.tapIns=d.tapIns.filter(t=>t.playerId!==p.id)}setData(d);draw()});
  live(draw);draw();
}
function initSuperAdmin(){
  if(!requireSuper())return;
  function draw(){const d=getData();const c=club(d);const active=activePlayers(d).length,pending=pendingPlayers(d).length,left=licenseLeft(d);$('#clubName').textContent=c.name;$('#superLicenseLimit').textContent=c.licenseLimit||0;$('#superActive').textContent=active;$('#superUnused').textContent=left;$('#superPending').textContent=pending;$('#superRevenue').textContent=money(active*(c.licensePrice||8.99));$('#superClubProfit').textContent=money(active*((c.playerSellPrice||15.99)-(c.licensePrice||8.99)));$('#licensePrice').value=c.licensePrice||8.99;$('#playerSellPrice').value=c.playerSellPrice||15.99;$('#clubRows').innerHTML=`<tr><td>${c.name}</td><td>${c.licenseLimit||0}</td><td>${active}</td><td>${left}</td><td>${money(c.licensePrice||8.99)}</td><td>${money(active*(c.licensePrice||8.99))}</td></tr>`;$('#superPlayers').innerHTML=d.players.slice().reverse().map(p=>`<tr><td>${p.name}</td><td>${p.contact}</td><td>${p.level}</td><td>${p.licenseStatus}</td></tr>`).join('')||'<tr><td colspan="4"><div class="empty">No players yet</div></td></tr>'}
  $('#addLicensesForm')?.addEventListener('submit',e=>{e.preventDefault();const amount=Math.max(0,parseInt($('#addLicenseCount').value||'0',10));if(!amount)return;const d=getData();const c=club(d);c.licenseLimit=(c.licenseLimit||0)+amount;setData(d);$('#addLicenseCount').value='';$('#superMsg').innerHTML=`<div class="notice">${amount} licenses added to ${c.name}</div>`;draw()});
  $('#pricingForm')?.addEventListener('submit',e=>{e.preventDefault();const d=getData();const c=club(d);c.licensePrice=parseFloat($('#licensePrice').value||'8.99');c.playerSellPrice=parseFloat($('#playerSellPrice').value||'15.99');setData(d);$('#superMsg').innerHTML='<div class="notice">Pricing updated</div>';draw()});
  $('#superReset')?.addEventListener('click',()=>{localStorage.setItem(STORE,JSON.stringify(seed));bc?.postMessage({type:'data'});draw()});
  live(draw);draw();
}
document.addEventListener('DOMContentLoaded',async()=>{await initSupabaseSync();const page=document.body.dataset.page;if(page==='home')initHome();if(page==='login')initLogin();if(page==='player')initPlayer();if(page==='match')initMatch();if(page==='admin-login')initAdminLogin();if(page==='admin')initAdmin();if(page==='admin-match')initAdminMatch();if(page==='admin-add-player')initAdminAddPlayer();if(page==='admin-members')initAdminMembers();if(page==='super-login')initSuperLogin();if(page==='super-admin')initSuperAdmin()});
