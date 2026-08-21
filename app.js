const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRRDjkaoyGRAQWhN8ZxFCXj1c0TdBvoEIQ_0JaBi6PX7Ym3ezvdk7b1ME9Q6ISveDuAHjTBp5gPFAA8/pub?output=csv';
const STATES=['Missouri','Illinois','Indiana','California','Nebraska','North Dakota','Pennsylvania'];
const STATE_NAMES={MO:'Missouri',IL:'Illinois',IN:'Indiana',CA:'California',NE:'Nebraska',ND:'North Dakota',PA:'Pennsylvania'};
const mapCenters={Missouri:[38.4561,-92.2884],Illinois:[40.0,-89.2],Indiana:[39.8,-86.1],California:[36.8,-119.4],Nebraska:[41.5,-99.9],'North Dakota':[47.5,-100.5],Pennsylvania:[40.9,-77.8]};
let rows=[],map,cluster,state=null,filter='all',idleTimer;
const $=id=>document.getElementById(id);

function normalizeState(value=''){
  const v=String(value).trim();
  const upper=v.toUpperCase();
  return STATE_NAMES[upper] || STATES.find(s=>s.toLowerCase()===v.toLowerCase()) || v;
}

function norm(value=''){
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g,' ')
    .replace(/[^a-z0-9 ]/g,'');
}

function statusRank(status=''){
  return status==='Member' ? 3 : status==='Contacted' ? 2 : 1;
}

function dedupeRows(input){
  const seen=new Map();

  input.forEach(r=>{
    const stateName=normalizeState(r.State);
    const school=norm(r['School/District']);
    const city=norm(r.City);
    const address=norm(r.Address||r['Street Address']);
    const lat=Number(r.Latitude), lon=Number(r.Longitude);
    const coordKey=(Number.isFinite(lat)&&Number.isFinite(lon)) ? `${lat.toFixed(5)}|${lon.toFixed(5)}` : '';

    // Primary duplicate check: same school name in the same city/state.
    // Fallback: same street address or exact location when a name is missing.
    const key=school
      ? `${stateName}|${school}|${city}`
      : address
        ? `${stateName}|addr|${address}|${city}`
        : `${stateName}|coord|${coordKey}`;

    if(!seen.has(key)){
      seen.set(key,r);
      return;
    }

    const existing=seen.get(key);
    const existingHasCoords=hasCoords(existing);
    const newHasCoords=hasCoords(r);

    // Keep the most useful copy: coordinates first, then the highest-value status.
    if((newHasCoords&&!existingHasCoords) || statusRank(r.Status)>statusRank(existing.Status)){
      seen.set(key,{...existing,...r});
    }
  });

  return [...seen.values()];
}

function csvParse(text){
  const result=[];
  let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){
      if(quoted && text[i+1]==='"'){field+='"';i++;}
      else quoted=!quoted;
    } else if(c===',' && !quoted){
      row.push(field);field='';
    } else if((c==='\n' || c==='\r') && !quoted){
      if(c==='\r' && text[i+1]==='\n') i++;
      row.push(field);field='';
      if(row.some(v=>v!=='')) result.push(row);
      row=[];
    } else field+=c;
  }
  if(field!=='' || row.length){row.push(field);result.push(row);}
  if(!result.length)return[];
  const headers=result[0].map(h=>String(h).trim());
  return result.slice(1).map(a=>{
    const o={}; headers.forEach((k,i)=>o[k]=String(a[i]??'').trim());
    o.State=normalizeState(o.State);
    return o;
  });
}

async function loadData(){
  const r=await fetch(SHEET_CSV_URL,{cache:'no-store'});
  if(!r.ok) throw new Error(`Sheet returned ${r.status}`);
  const parsed=csvParse(await r.text());
  rows=dedupeRows(parsed);
  console.log(`Loaded ${parsed.length} rows; ${rows.length} unique locations after deduplication.`);
  buildStates();
}

function buildStates(){
  const box=$('states');box.innerHTML='';
  STATES.forEach(s=>{
    const n=rows.filter(r=>normalizeState(r.State)===s).length;
    const b=document.createElement('button');
    b.className='state';
    b.innerHTML=`<div class="name">${s}</div><div class="count">${n.toLocaleString()} schools & districts</div>`;
    b.onclick=()=>openState(s);
    box.appendChild(b);
  });
}

function hasCoords(r){
  const lat=Number(String(r.Latitude).trim()), lon=Number(String(r.Longitude).trim());
  return r.Latitude!==''&&r.Longitude!==''&&Number.isFinite(lat)&&Number.isFinite(lon);
}

function initMap(){
  map=L.map('map',{zoomControl:false,tap:true}).setView([39.5,-96],4);
  L.control.zoom({position:'bottomright'}).addTo(map);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{
    subdomains:'abcd',
    maxZoom:20,
    attribution:'&copy; OpenStreetMap contributors &copy; CARTO'
  }).addTo(map);
  cluster=L.markerClusterGroup({chunkedLoading:true});
  map.addLayer(cluster);
}

function markerColor(s){return s==='Member'?'#4aa3ff':s==='Contacted'?'#ff9f1c':'#ff3b3f';}
function makeMarker(r){
  if(!hasCoords(r))return null;
  const lat=Number(r.Latitude),lon=Number(r.Longitude);
  const color=markerColor(r.Status);
  const icon=L.divIcon({className:'',html:`<div style="width:17px;height:17px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 2px #0008,0 0 10px ${color}aa"></div>`,iconSize:[17,17],iconAnchor:[8,8]});
  const m=L.marker([lat,lon],{icon});
  m.bindPopup(`<div class="popup-title">${esc(r['School/District'])}</div><div class="popup-status">${esc(r.Status)}</div><div class="popup-row">${esc(r.Address||r['Street Address']||'')}<br>${esc(r.City||'')} ${esc(r.ZIP||r.Zipcode||'')}</div>`);
  return m;
}

function render(){
  cluster.clearLayers();
  const data=rows.filter(r=>(!state||normalizeState(r.State)===state)&&(filter==='all'||r.Status===filter));
  const bounds=[];
  data.forEach(r=>{
    const m=makeMarker(r);
    if(m){cluster.addLayer(m);bounds.push(m.getLatLng());}
  });
  $('stateTitle').textContent=state||'All Schools';
  if(map && bounds.length){
    setTimeout(()=>map.fitBounds(L.latLngBounds(bounds),{padding:[30,30],maxZoom:7}),100);
  }
}

function openState(s){
  state=s;filter='all';
  $('home').style.display='none';$('mapView').style.display='block';$('homeBtn').style.display='block';
  if(!map)initMap();
  render();
  if(!cluster.getLayers().length) map.setView(mapCenters[s]||[39.5,-96],6);
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