(function(){
document.documentElement.classList.add('js');
const $=id=>document.getElementById(id);
const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
let PUB=null,selTime='';
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let io=null;
function reveal(){
 const els=document.querySelectorAll('.rv:not(.in),.wrap h2:not(.in)');
 if(!('IntersectionObserver' in window)){els.forEach(e=>e.classList.add('in','rd'));return}
 io=io||new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){const t=e.target;t.classList.add('in');setTimeout(()=>t.classList.add('rd'),1200);io.unobserve(t)}}),{threshold:.12,rootMargin:'0px 0px -40px 0px'});
 els.forEach(e=>io.observe(e));
}
window.addEventListener('scroll',()=>document.querySelector('.nav').classList.toggle('scrolled',scrollY>30),{passive:true});
function wa(text){return 'https://wa.me/'+PUB.settings.whatsapp+(text?'?text='+encodeURIComponent(text):'')}
async function init(){
 $('yr').textContent=new Date().getFullYear();
 let r;try{r=await fetch('/api/public');PUB=await r.json();}catch(e){$('svcList').innerHTML='<p class="err">Could not load. Please refresh.</p>';return}
 const s=PUB.settings;
 $('brandName').textContent=s.shortName||'SN';$('ftName').textContent=s.businessName;
 $('tagline').textContent=s.tagline||'';$('areaNote').textContent=s.areaNote||'';
 $('locLine').textContent='📍 '+s.location;
 $('phoneLink').textContent=s.phone;$('phoneLink').href='tel:'+s.phone.replace(/[^\d+]/g,'');
 ['heroWa','waFloat'].forEach(i=>{$(i).href=wa('Hi Sergio, I would like to book a cut.');$(i).target='_blank';$(i).rel='noopener'});
 if(s.announcement){$('announce').textContent=s.announcement;$('announce').classList.remove('hidden')}
 $('svcList').innerHTML=PUB.services.map((v,i)=>`<div class="svc rv" style="--d:${(i%6)*.07}s"><div><b>${esc(v.name)}</b><small>${esc(v.desc)}</small></div><span class="price">R${esc(v.price)}</span></div>`).join('');
 $('fSvc').innerHTML='<option value="">Choose a service…</option>'+PUB.services.map(v=>`<option value="${esc(v.id)}">${esc(v.name)} – R${esc(v.price)}</option>`).join('');
 $('galGrid').innerHTML=PUB.gallery.map((g,i)=>`<img class="rv" style="--d:${(i%4)*.08}s" loading="lazy" src="${esc(g.src)}" alt="${esc(g.caption)}" data-c="${esc(g.caption)}">`).join('');
 const order=[1,2,3,4,5,6,0];
 $('hoursTbl').innerHTML=order.map(d=>{const h=s.hours[d];return `<tr><td>${DAYS[d]}</td><td>${h.closed?'Closed':esc(h.open)+' – '+esc(h.close)}</td></tr>`}).join('');
 reveal();
 const dt=$('fDate');dt.min=PUB.today;
 const mx=new Date(PUB.today+'T00:00:00Z');mx.setUTCDate(mx.getUTCDate()+(s.maxAdvanceDays||30));dt.max=mx.toISOString().slice(0,10);
}
$('galGrid').addEventListener('click',e=>{if(e.target.tagName==='IMG'){$('lbImg').src=e.target.src;$('lbCap').textContent=e.target.dataset.c;$('lb').classList.remove('hidden')}});
$('lb').addEventListener('click',()=>$('lb').classList.add('hidden'));
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('lb').classList.add('hidden')});
$('fSvc').addEventListener('change',()=>{const v=PUB.services.find(x=>x.id===$('fSvc').value);$('addrWrap').classList.toggle('hidden',!(v&&v.houseCall))});
$('fDate').addEventListener('change',loadSlots);
async function loadSlots(){
 selTime='';const d=$('fDate').value,box=$('slots');if(!d){box.innerHTML='<span class="muted">Choose a date first</span>';return}
 box.innerHTML='<span class="muted">Loading…</span>';
 try{const r=await (await fetch('/api/slots?date='+encodeURIComponent(d))).json();
  if(r.closed){box.innerHTML='<span class="muted">'+esc(r.reason||'Closed')+'</span>';return}
  box.innerHTML=r.slots.map(s=>`<button type="button" class="slot" data-t="${esc(s.time)}" ${s.available?'':'disabled'}>${esc(s.time)}</button>`).join('')||'<span class="muted">No slots</span>';
 }catch(e){box.innerHTML='<span class="err">Could not load times</span>'}
}
$('slots').addEventListener('click',e=>{const b=e.target.closest('.slot');if(!b||b.disabled)return;selTime=b.dataset.t;document.querySelectorAll('.slot').forEach(x=>x.classList.toggle('sel',x===b))});
function showErr(m){const e=$('formErr');e.textContent=m;e.classList.toggle('hidden',!m)}
$('bookForm').addEventListener('submit',async ev=>{
 ev.preventDefault();showErr('');
 if(!$('fSvc').value)return showErr('Please choose a service.');
 if(!$('fDate').value)return showErr('Please choose a date.');
 if(!selTime)return showErr('Please choose a time.');
 const body={serviceId:$('fSvc').value,date:$('fDate').value,time:selTime,name:$('fName').value,phone:$('fPhone').value,address:$('fAddr').value,notes:$('fNotes').value,website:$('fWeb').value};
 $('submitBtn').disabled=true;
 try{
  const res=await fetch('/api/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await res.json().catch(()=>({}));
  if(!res.ok){showErr(j.error||'Something went wrong.');if(res.status===400)loadSlots();return}
  const b=j.booking;if(!b){return showErr('Something went wrong.')}
  const msg=`Hi Sergio, I booked on your website.\nRef: ${b.ref}\nName: ${b.name}\n${b.serviceName} (R${b.price})\n${b.date} at ${b.time}`+(b.address?`\nAddress: ${b.address}`:'');
  $('bookForm').classList.add('hidden');
  const d=$('done');d.classList.remove('hidden');
  d.innerHTML=`<svg class="tick" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28"/><path d="M20 33l9 9 16-18"/></svg><h3 style="text-align:center">Booking received</h3><p>Reference: <b>${esc(b.ref)}</b></p><p>${esc(b.serviceName)} – R${esc(b.price)}<br>${esc(b.date)} at ${esc(b.time)}</p><p class="muted">Sergio will confirm your booking. Send him a WhatsApp to speed things up.</p><a class="btn" target="_blank" rel="noopener" href="${wa(msg)}">Send on WhatsApp</a> <button class="btn ghost" id="again">Book another</button>`;
  $('again').onclick=()=>{d.classList.add('hidden');$('bookForm').classList.remove('hidden');$('bookForm').reset();$('addrWrap').classList.add('hidden');loadSlots()};
 }catch(e){showErr('Network error. Please try again.')}
 finally{$('submitBtn').disabled=false}
});
init();
})();
