const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRRDjkaoyGRAQWhN8ZxFCXj1c0TdBvoEIQ_0JaBi6PX7Ym3ezvdk7b1ME9Q6ISveDuAHjTBp5gPFAA8/pub?output=csv';
const STATES=['Missouri','Illinois','Indiana','California','Nebraska','North Dakota','Pennsylvania'];
const STATE_NAMES={MO:'Missouri',IL:'Illinois',IN:'Indiana',CA:'California',NE:'Nebraska',ND:'North Dakota',PA:'Pennsylvania'};
const FALLBACK_CENTERS={Missouri:[38.4561,-92.2884],Illinois:[40.0,-89.2],Indiana:[39.8,-86.1],California:[36.8,-119.4],Nebraska:[41.5,-99.9],'North Dakota':[47.5,-100.5],Pennsylvania:[40.9,-77.8]};
let rows=[];
let filter='all';
const maps={};
const layers={};
const $=id=>document.getElementById(id);

function normalizeState(value=''){
  const v=String(value).trim();
  return STATE_NAMES[v.toUpperCase()] || STATES.find(s=>s.toLowerCase()===v.toLowerCase()) || v;
}

function norm(value=''){
  return String(value).trim().toLowerCase().replace(/\s+/g,' ').replace(/[^a-z0-9 ]/g,'');
}

function hasCoords(r){
  const lat=Number(String(r.Latitude).trim());
  const lon=Number(String(r.Longitude).trim());
  return r.Latitude!==''&&r.Longitude!==''&&Number.isFinite(lat)&&Number.isFinite(lon);
}

function statusRank(status=''){
  return status==='Member'?3:status==='Contacted'?2:1;
}

function dedupeRows(input){
  const seen=new Map();
  input.forEach(r=>{
    r.State=normalizeState(r.State);
    const school=norm(r['School/District']);
    const city=norm(r.City);
    const address=norm(r.Address||r['Street Address']);
    const lat=Number(r.Latitude), lon=Number(r.Longitude);
    const coordKey=(Number.isFinite(lat)&&Number.isFinite(lon))?`${lat.toFixed(5)}|${lon.toFixed(5)}`:'';
    const key=school?`${r.State}|${school}|${city}`:address?`${r.State}|addr|${address}|${city}`:`${r.State}|coord|${coordKey}`;
    if(!seen.has(key)){seen.set(key,r);return;}
    const old=seen.get(key);
    if((hasCoords(r)&&!hasCoords(old))||statusRank(r.Status)>statusRank(old.Status)) seen.set(key,{...old,...r});
  });
  return [...seen.values()];
}

function csvParse(text){
  const result=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){
      if(quoted&&text[i+1]==='"'){field+='"';i++;} else quoted=!quoted;
    } else if(c===','&&!quoted){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);field='';if(row.some(v=>v!==''))result.push(row);row=[];}
    else field+=c;
  }
  if(field!==''||row.length){row.push(field);result.push(row);}
  if(!result.length)return[];
  const headers=result[0].map(h=>String(h).trim());
  return result.slice(1).map(a=>{const o={};headers.forEach((k,i)=>o[k]=String(a[i]??'').trim());o.State=normalizeState(o.State);return o;});
}

function markerColor(status){
  return status==='Member'?'#4aa3ff':status==='Contacted'?'#ff9f1c':'#ff3b3f';
}

function popupHtml(r){
  return `<div class="popup-title">${esc(r['School/District'])}</div><div class="popup-status">${esc(r.Status)}</div><div class="popup-row">${esc(r.Address||r['Street Address']||'')}<br>${esc(r.City||'')} ${esc(r.ZIP||r.Zipcode||'')}</div>`;
}

function buildDashboard(){
  const grid=$('mapsGrid');
  grid.innerHTML='';
  STATES.forEach((state,index)=>{
    const card=document.createElement('section');
    card.className='map-card';
    card.innerHTML=`<div id="map-${index}" class="map-canvas" aria-label="${state} reach map"></div><div class="map-title"><div class="name">${state}</div><div class="count" id="count-${index}"></div></div>`;
    grid.appendChild(card);

    const map=L.map(`map-${index}`,{
      zoomControl:index===6,
      attributionControl:index===6,
      scrollWheelZoom:false,
      doubleClickZoom:true,
      touchZoom:true,
      dragging:true,
      tap:true
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:20,attribution:'&copy; OpenStreetMap contributors &copy; CARTO'}).addTo(map);
    maps[state]=map;
    layers[state]=L.layerGroup().addTo(map);
    map.setView(FALLBACK_CENTERS[state],5);
  });
  renderAll();
  setTimeout(()=>Object.values(maps).forEach(m=>m.invalidateSize()),150);
}

function renderAll(){
  STATES.forEach((state,index)=>{
    const layer=layers[state];
    if(!layer)return;
    layer.clearLayers();
    const data=rows.filter(r=>r.State===state&&hasCoords(r)&&(filter==='all'||r.Status===filter));
    const bounds=[];
    data.forEach(r=>{
      const lat=Number(r.Latitude),lon=Number(r.Longitude);
      const marker=L.circleMarker([lat,lon],{
        radius:5,
        weight:1.5,
        color:'#fff',
        fillColor:markerColor(r.Status),
        fillOpacity:.95
      }).bindPopup(popupHtml(r));
      marker.addTo(layer);
      bounds.push([lat,lon]);
    });
    $(`count-${index}`).textContent=`${data.length.toLocaleString()} locations`;
    if(bounds.length){
      maps[state].fitBounds(bounds,{padding:[18,18],maxZoom:7});
    } else {
      maps[state].setView(FALLBACK_CENTERS[state],5);
    }
  });
}

async function loadData(){
  const r=await fetch(SHEET_CSV_URL,{cache:'no-store'});
  if(!r.ok)throw new Error(`Sheet returned ${r.status}`);
  rows=dedupeRows(csvParse(await r.text()));
  buildDashboard();
}

function esc(x=''){return String(x).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

$('filterBtn').onclick=()=>$('filterPanel').classList.toggle('open');
document.querySelectorAll('#filterPanel button').forEach(b=>b.onclick=()=>{
  filter=b.dataset.filter;
  document.querySelectorAll('#filterPanel button').forEach(x=>x.classList.toggle('active',x===b));
  $('filterPanel').classList.remove('open');
  renderAll();
});

loadData().catch(e=>{console.error(e);$('loading').textContent='Could not load the school data.'}).finally(()=>{$('loading').style.display='none';});