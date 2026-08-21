const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRRDjkaoyGRAQWhN8ZxFCXj1c0TdBvoEIQ_0JaBi6PX7Ym3ezvdk7b1ME9Q6ISveDuAHjTBp5gPFAA8/pub?gid=1624321924&single=true&output=csv';
const STATES=['Missouri','Illinois','Indiana','California','Nebraska','North Dakota','Pennsylvania'];
const mapCenters={Missouri:[38.4561,-92.2884],Illinois:[40.0,-89.2],Indiana:[39.8,-86.1],California:[36.8,-119.4],Nebraska:[41.5,-99.9],'North Dakota':[47.5,-100.5],Pennsylvania:[40.9,-77.8]};
let rows=[],map,cluster,state=null,filter='all',idleTimer;
const $=id=>document.getElementById(id);

function csvParse(text){
  const lines=text.trim().split(/\r?\n/);
  if(!lines.length)return[];
  const parse=s=>{
    let a=[],v='',q=false;
    for(let i=0;i<s.length;i++){
      const c=s[i];
      if(c==='"'&&s[i+1]==='"'){v+='"';i++;continue;}
      if(c==='"'){q=!q;continue;}
      if(c===','&&!q){a.push(v);v='';continue;}
      v+=c;
    }
    a.push(v);return a;
  };
  const h=parse(lines[0]);
  return lines.slice(1).filter(Boolean).map(l=>{
    const a=parse(l),o={};
    h.forEach((k,i)=>o[k]=(a[i]||'').trim());
    return o;
  });
}

async function loadData(){
  const r=await fetch(SHEET_CSV_URL,{cache:'no-store'});
  if(!r.ok) throw new Error(`Sheet returned ${r.status}`);
  rows=csvParse(await r.text());
  buildStates();
  const ready=rows.filter(r=>r.Latitude!==''&&r.Longitude!==''&&Number.isFinite(Number(r.Latitude))&&Number.isFinite(Number(r.Longitude))).length;
  console.log(`Loaded ${rows.length} rows; ${ready} have coordinates.`);
}

function buildStates(){
  const box=$('states');box.innerHTML='';
  STATES.forEach(s=>{
    const n=rows.filter(r=>r.State===s).length;
    const b=document.createElement('button');
    b.className='state';
    b.innerHTML=`<div class="name">${s}</div><div class="count">${n.toLocaleString()} schools & districts</div>`;
    b.onclick=()=>openState(s);
    box.appendChild(b);
  });
}

function initMap(){
  map=L.map('map',{zoomControl:false,tap:true}).setView([39.5,-96],4);
  L.control.zoom({position:'bottomright'}).addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
  cluster=L.markerClusterGroup({chunkedLoading:true});
  map.addLayer(cluster);
}

function markerColor(s){return s==='Member'?'#2f78b9':s==='Contacted'?'#f57c00':'#e02427';}

function makeMarker(r){
  const lat=Number(r.Latitude),lon=Number(r.Longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
  const color=markerColor(r.Status);
  const icon=L.divIcon({className:'',html:`<div style="width:15px;height:15px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 5px #0008"></div>`,iconSize:[15,15],iconAnchor:[7,7]});
  const m=L.marker([lat,lon],{icon});
  m.bindPopup(`<div class="popup-title">${esc(r['School/District'])}</div><div class="popup-status">${esc(r.Status)}</div><div class="popup-row">${esc(r.Address||r['Street Address']||'')}<br>${esc(r.City||'')} ${esc(r.ZIP||r.Zipcode||'')}</div>`);
  return m;
}

function render(){
  cluster.clearLayers();
  const data=rows.filter(r=>(!state||r.State===state)&&(filter==='all'||r.Status===filter));
  data.forEach(r=>{const m=makeMarker(r);if(m)cluster.addLayer(m);});
  $('stateTitle').textContent=state||'All Schools';
}

function openState(s){
  state=s;filter='all';
  $('home').style.display='none';$('mapView').style.display='block';$('homeBtn').style.display='block';
  if(!map)initMap();
  render();
  map.setView(mapCenters[s]||[39.5,-96],6);
  setTimeout(()=>map.invalidateSize(),100);
  resetIdle();
}

function home(){
  clearTimeout(idleTimer);
  $('mapView').style.display='none';$('home').style.display='flex';$('homeBtn').style.display='none';
  if(map)map.remove();
  map=null;cluster=null;
}

function resetIdle(){clearTimeout(idleTimer);idleTimer=setTimeout(home,120000);}
function esc(x=''){return String(x).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

$('homeBtn').onclick=home;
$('backBtn').onclick=home;
$('filterBtn').onclick=()=>$('filterPanel').classList.toggle('open');
document.querySelectorAll('#filterPanel button').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;$('filterPanel').classList.remove('open');render();resetIdle();});
['pointerdown','pointermove','touchstart','wheel','keydown'].forEach(e=>document.addEventListener(e,resetIdle,{passive:true}));
loadData().catch(e=>{console.error(e);$('loading').textContent='Could not load the school data.'}).finally(()=>{$('loading').style.display='none';});
