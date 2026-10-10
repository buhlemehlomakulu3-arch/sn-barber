(function(){
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
let S=null,tab='dash',knownPending=null,poll=null;
function toast(m,bad){const t=$('toast');t.textContent=m;t.classList.toggle('bad',!!bad);t.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.add('hidden'),2800)}
async function api(method,url,body){
 const o={method,headers:{'Content-Type':'application/json'}};if(method!=='GET')o.body=JSON.stringify(body===undefined?{}:body)
 const r=await fetch(url,o);const j=await r.json().catch(()=>({}));
 if(r.status===401&&url!=='/api/admin/login'){showLogin();throw new Error('Not logged in')}
 if(!r.ok)throw new Error(j.error||'Error '+r.status);return j}
async function act(fn,msg,card){try{await fn();if(card){card.classList.add('out');await new Promise(r=>setTimeout(r,260))}if(msg)toast(msg);await load()}catch(e){toast(e.message,true)}}
function showLogin(){$('app').classList.add('hidden');$('login').classList.remove('hidden');clearInterval(poll)}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginErr').textContent='';
 try{const j=await api('POST','/api/admin/login',{password:$('pw').value});$('pw').value='';$('login').classList.add('hidden');await start();if(j.mustChange){tab='settings';render()}}catch(err){$('loginErr').textContent=err.message}});
$('logout').onclick=async e=>{e.preventDefault();await fetch('/api/admin/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});showLogin()};
async function start(){$('app').classList.remove('hidden');await load();clearInterval(poll);poll=setInterval(()=>load(true),20000)}
async function load(quiet){
 const st=await api('GET','/api/admin/state');const sig=JSON.stringify(st);const same=quiet&&sig===load.sig;load.sig=sig;S=st;if(same)return;
 const p=S.bookings.filter(b=>b.status==='pending').length;
 if(quiet&&knownPending!==null&&p>knownPending)toast('New booking received!');
 knownPending=p;$('pendBadge').textContent=p;$('pendBadge').classList.toggle('hidden',!p);
 $('pwBanner').classList.toggle('hidden',!S.mustChange);
 if(quiet&&(tab==='settings'||tab==='services'||tab==='gallery'||!$('modal').classList.contains('hidden')))return;
 render();
}
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>{tab=b.dataset.t;render()});
function render(){
 document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.t===tab));
 ['dash','bookings','services','gallery','settings'].forEach(t=>$('t-'+t).classList.toggle('hidden',t!==tab));
 ({dash:rDash,bookings:rBookings,services:rServices,gallery:rGallery,settings:rSettings})[tab]();
}
const money=n=>'R'+n;
function waLink(b,text){const d=String(b.phone).replace(/\D/g,'').replace(/^0/,'27');return 'https://wa.me/'+d+'?text='+encodeURIComponent(text)}
function rDash(){
 const today=S.now.date,B=S.bookings;
 const td=B.filter(b=>b.date===today&&['pending','confirmed','completed'].includes(b.status));
 const pend=B.filter(b=>b.status==='pending').length;
 const upc=B.filter(b=>b.date>=today&&['pending','confirmed'].includes(b.status)).length;
 const rev=B.filter(b=>b.status==='completed').reduce((a,b)=>a+(+b.price||0),0);
 const revT=B.filter(b=>b.status==='completed'&&b.date===today).reduce((a,b)=>a+(+b.price||0),0);
 const next=B.filter(b=>b.date>=today&&['pending','confirmed'].includes(b.status)).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).slice(0,6);
 $('t-dash').innerHTML=`<div class="stats"><div class="stat"><b>${td.length}</b>Today</div><div class="stat"><b>${pend}</b>Pending</div><div class="stat"><b>${upc}</b>Upcoming</div><div class="stat"><b>${money(revT)}</b>Earned today</div><div class="stat"><b>${money(rev)}</b>Total completed</div></div><h3>Next up</h3>`+(next.map(bCard).join('')||'<p class="muted">No upcoming bookings.</p>');
 bind($('t-dash'));
}
function bCard(b){
 const wa=waLink(b,`Hi ${b.name}, this is Sergio. Your ${b.serviceName} on ${b.date} at ${b.time} is ${b.status==='cancelled'?'cancelled':'confirmed'}. Ref ${b.ref}.`);
 return `<div class="card" data-id="${esc(b.id)}"><b>${esc(b.date)} ${esc(b.time)}</b> · ${esc(b.name)} <span class="pill ${esc(b.status)}">${esc(b.status)}</span> <span class="muted">${esc(b.ref)}${b.source==='admin'?' · manual':''}</span>
 <div>${esc(b.serviceName)} – ${money(esc(b.price))} · <a href="tel:${esc(b.phone)}">${esc(b.phone)}</a></div>
 ${b.address?`<div>📍 ${esc(b.address)}</div>`:''}${b.notes?`<div class="muted">“${esc(b.notes)}”</div>`:''}${b.adminNote?`<div class="muted">Note: ${esc(b.adminNote)}</div>`:''}
 <div class="acts">${b.status==='pending'?'<button class="btn sm" data-s="confirmed">Confirm</button>':''}${['pending','confirmed'].includes(b.status)?'<button class="btn sm" data-s="completed">Complete</button><button class="btn sm ghost" data-s="no-show">No-show</button><button class="btn sm ghost" data-s="cancelled">Cancel</button>':'<button class="btn sm ghost" data-s="pending">Reopen</button>'}
 <a class="btn sm ghost" target="_blank" rel="noopener" href="${wa}">WhatsApp</a><button class="btn sm ghost" data-note="1">Note</button><button class="btn sm danger" data-del="1">Delete</button></div></div>`}
function bind(root){
 root.querySelectorAll('.card[data-id]').forEach(c=>{const id=c.dataset.id;
  c.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>act(()=>api('PATCH','/api/admin/bookings/'+id,{status:b.dataset.s}),'Updated'));
  const n=c.querySelector('[data-note]');if(n)n.onclick=()=>{const bk=S.bookings.find(x=>x.id===id);const v=prompt('Private note',bk.adminNote||'');if(v!==null)act(()=>api('PATCH','/api/admin/bookings/'+id,{adminNote:v}),'Saved')};
  const d=c.querySelector('[data-del]');if(d)d.onclick=()=>{if(confirm('Delete this booking permanently?'))act(()=>api('DELETE','/api/admin/bookings/'+id),'Deleted',c)};
 })}
function rBookings(){
 const f=$('bFilter').value,d=$('bDate').value;
 let L=S.bookings.filter(b=>(f==='all'||b.status===f)&&(!d||b.date===d)).sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
 $('bList').innerHTML=L.map(bCard).join('')||'<p class="muted">No bookings.</p>';bind($('bList'));
}
$('bFilter').onchange=rBookings;$('bDate').onchange=rBookings;$('bClear').onclick=()=>{$('bDate').value='';rBookings()};
function openModal(html){$('modalBox').innerHTML=html;$('modal').classList.remove('hidden')}
function closeModal(){$('modal').classList.add('hidden')}
$('modal').addEventListener('click',e=>{if(e.target===$('modal'))closeModal()});
$('bNew').onclick=()=>{
 openModal(`<h3>Manual booking</h3><label>Service</label><select id="mS">${S.services.map(s=>`<option value="${esc(s.id)}">${esc(s.name)} – R${esc(s.price)}</option>`).join('')}</select>
 <label>Date</label><input type="date" id="mD" value="${esc(S.now.date)}"><label>Time</label><input type="time" id="mT" value="09:00">
 <label>Name</label><input id="mN"><label>Phone</label><input id="mP" type="tel"><label>Address (house call)</label><input id="mA"><label>Notes</label><input id="mNo">
 <p id="mErr" class="err"></p><div class="row"><button class="btn" id="mSave">Save as confirmed</button><button class="btn ghost" id="mX">Cancel</button></div>`);
 $('mX').onclick=closeModal;
 $('mSave').onclick=async()=>{try{await api('POST','/api/admin/bookings',{serviceId:$('mS').value,date:$('mD').value,time:$('mT').value,name:$('mN').value,phone:$('mP').value,address:$('mA').value,notes:$('mNo').value,status:'confirmed'});closeModal();toast('Booking added');await load()}catch(e){$('mErr').textContent=e.message}}
};
function rServices(){
 $('sList').innerHTML=S.services.map((s,i)=>`<div class="card" data-id="${esc(s.id)}"><div class="row"><input data-f="name" value="${esc(s.name)}"><input data-f="price" type="number" min="0" value="${esc(s.price)}"><input data-f="desc" value="${esc(s.desc)}"></div>
 <div class="acts"><label class="chk"><input type="checkbox" data-f="active" ${s.active?'checked':''}> Visible</label><label class="chk"><input type="checkbox" data-f="houseCall" ${s.houseCall?'checked':''}> House call</label>
 <button class="btn sm" data-save>Save</button><button class="btn sm ghost" data-up ${i===0?'disabled':''}>↑</button><button class="btn sm ghost" data-dn ${i===S.services.length-1?'disabled':''}>↓</button><button class="btn sm danger" data-del>Delete</button></div></div>`).join('');
 $('sList').querySelectorAll('.card').forEach(c=>{const id=c.dataset.id;
  c.querySelector('[data-save]').onclick=()=>{const g=f=>c.querySelector(`[data-f=${f}]`);act(()=>api('PATCH','/api/admin/services/'+id,{name:g('name').value,price:g('price').value,desc:g('desc').value,active:g('active').checked,houseCall:g('houseCall').checked}),'Saved')};
  const mv=d=>{const ids=S.services.map(s=>s.id),i=ids.indexOf(id);const j=i+d;[ids[i],ids[j]]=[ids[j],ids[i]];act(()=>api('POST','/api/admin/services/reorder',{ids}))};
  c.querySelector('[data-up]').onclick=()=>mv(-1);c.querySelector('[data-dn]').onclick=()=>mv(1);
  c.querySelector('[data-del]').onclick=()=>{if(confirm('Delete this service? Past bookings keep their name.'))act(()=>api('DELETE','/api/admin/services/'+id),'Deleted',c)};
 });
}
$('nsAdd').onclick=()=>act(async()=>{await api('POST','/api/admin/services',{name:$('nsName').value,price:$('nsPrice').value,desc:$('nsDesc').value,houseCall:$('nsHouse').checked});$('nsName').value=$('nsPrice').value=$('nsDesc').value='';$('nsHouse').checked=false},'Service added');
function rGallery(){
 $('gList').innerHTML=S.gallery.map((g,i)=>`<div class="card ${g.visible?'':'off'}" data-id="${esc(g.id)}"><img src="${esc(g.src)}" alt=""><input data-cap value="${esc(g.caption)}">
 <div class="acts"><button class="btn sm" data-save>Save</button><button class="btn sm ghost" data-vis>${g.visible?'Hide':'Show'}</button><button class="btn sm ghost" data-up ${i===0?'disabled':''}>↑</button><button class="btn sm ghost" data-dn ${i===S.gallery.length-1?'disabled':''}>↓</button><button class="btn sm danger" data-del>Delete</button></div></div>`).join('');
 $('gList').querySelectorAll('.card').forEach(c=>{const id=c.dataset.id,g=S.gallery.find(x=>x.id===id),u='/api/admin/gallery/'+id;
  c.querySelector('[data-save]').onclick=()=>act(()=>api('PATCH',u,{caption:c.querySelector('[data-cap]').value}),'Saved');
  c.querySelector('[data-vis]').onclick=()=>act(()=>api('PATCH',u,{visible:!g.visible}));
  c.querySelector('[data-up]').onclick=()=>act(()=>api('PATCH',u,{move:'up'}));c.querySelector('[data-dn]').onclick=()=>act(()=>api('PATCH',u,{move:'down'}));
  c.querySelector('[data-del]').onclick=()=>{if(confirm('Delete this photo?'))act(()=>api('DELETE',u),'Photo deleted',c)};
 });
}
function fileToDataUrl(f){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f)})}
// downscale big phone photos to keep uploads small
async function shrink(f){
 const url=await fileToDataUrl(f);if(f.size<1.5*1024*1024)return url;
 return new Promise(res=>{const im=new Image();im.onload=()=>{const k=Math.min(1,1600/Math.max(im.width,im.height));const c=document.createElement('canvas');c.width=im.width*k;c.height=im.height*k;c.getContext('2d').drawImage(im,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',.85))};im.onerror=()=>res(url);im.src=url});
}
$('upBtn').onclick=()=>{const f=$('upFile').files[0];if(!f)return toast('Choose a photo first',true);
 act(async()=>{await api('POST','/api/admin/gallery',{dataUrl:await shrink(f),caption:$('upCap').value});$('upFile').value='';$('upCap').value=''},'Photo uploaded')};
function rSettings(){
 const s=S.settings;
 $('t-settings').innerHTML=`<div class="card"><h3>Business</h3>
 ${[['businessName','Business name'],['tagline','Tagline'],['phone','Phone'],['whatsapp','WhatsApp (digits, e.g. 27784737295)'],['location','Location'],['areaNote','Area note'],['announcement','Announcement banner (empty = none)']].map(([k,l])=>`<label>${l}</label><input data-k="${k}" value="${esc(s[k])}">`).join('')}
 <label>Slot length</label><select data-k="slotMinutes">${[15,20,30,45,60].map(n=>`<option ${n==s.slotMinutes?'selected':''}>${n}</option>`).join('')}</select>
 <label>Chairs (bookings at the same time)</label><input data-k="chairs" type="number" min="1" max="10" value="${esc(s.chairs)}">
 <label>Book how many days ahead</label><input data-k="maxAdvanceDays" type="number" min="1" max="90" value="${esc(s.maxAdvanceDays)}"></div>
 <div class="card"><h3>Opening hours</h3>${[1,2,3,4,5,6,0].map(d=>{const h=s.hours[d];return `<div class="hrs" data-d="${d}"><span>${DAYS[d]}</span><label class="chk"><input type="checkbox" data-c ${h.closed?'checked':''}>Closed</label><input type="time" data-o value="${esc(h.open)}"><input type="time" data-cl value="${esc(h.close)}"></div>`}).join('')}</div>
 <div class="card"><h3>Closed dates</h3><div class="row"><input type="date" id="cdIn"><button class="btn sm" id="cdAdd">Add</button></div><div id="cdList">${s.closedDates.map(d=>`<span class="pill pending">${esc(d)} <a href="#" data-rm="${esc(d)}">×</a></span> `).join('')||'<span class="muted">None</span>'}</div></div>
 <button class="btn" id="setSave">Save settings</button>
 <div class="card" style="margin-top:1rem"><h3>Password</h3><label>Current</label><input type="password" id="pwC" autocomplete="current-password"><label>New (min 8 characters)</label><input type="password" id="pwN" autocomplete="new-password"><p><button class="btn sm" id="pwSave">Change password</button></p></div>`;
 let closed=[...s.closedDates];
 const root=$('t-settings');
 const draw=()=>{$('cdList').innerHTML=closed.map(d=>`<span class="pill pending">${esc(d)} <a href="#" data-rm="${esc(d)}">×</a></span> `).join('')||'<span class="muted">None</span>';$('cdList').querySelectorAll('[data-rm]').forEach(a=>a.onclick=e=>{e.preventDefault();closed=closed.filter(x=>x!==a.dataset.rm);draw()})};draw();
 $('cdAdd').onclick=()=>{const v=$('cdIn').value;if(v&&!closed.includes(v)){closed.push(v);closed.sort();draw()}};
 $('setSave').onclick=()=>{const b={hours:{},closedDates:closed};root.querySelectorAll('[data-k]').forEach(i=>b[i.dataset.k]=i.value);
  root.querySelectorAll('.hrs').forEach(r=>b.hours[r.dataset.d]={closed:r.querySelector('[data-c]').checked,open:r.querySelector('[data-o]').value,close:r.querySelector('[data-cl]').value});
  act(()=>api('PUT','/api/admin/settings',b),'Settings saved')};
 $('pwSave').onclick=()=>act(async()=>{await api('POST','/api/admin/password',{current:$('pwC').value,next:$('pwN').value})},'Password changed');
}
(async function boot(){try{await start()}catch(e){showLogin()}})();
})();
