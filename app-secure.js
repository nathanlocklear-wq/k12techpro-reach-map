const STATES=['Missouri','Illinois','Indiana','California','Nebraska','North Dakota','Pennsylvania'];
const FALLBACK={Missouri:[38.4561,-92.2884],Illinois:[40,-89.2],Indiana:[39.8,-86.1],California:[36.8,-119.4],Nebraska:[41.5,-99.9],'North Dakota':[47.5,-100.5],Pennsylvania:[40.9,-77.8]};
let rows=[],activeFilter='all';
const maps={},layers={};
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const accessKey=params.get('access')||'';

function hasCoords(r){return Number.isFinite(Number(r.latitude))&&Number.isFinite(Number(r.longitude))}
function color(s){return s==='Member'?'#4aa3ff':s==='Contacted'?'#ff9f1c':'#ff3b3f'}
function esc(x=''){return String(x).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function popup(r){return `<div class="popup-title">${esc(r.school_district)}</div><div class="popup-status">${esc(r.status)}</div><div class="popup-row">${esc(r.address||'')}<br>${esc(r.city||'')} ${esc(r.zip||'')}</div>`}

function makeMap(state,index){
  const map=L.map(`map-${index}`,{zoomControl:false,attributionControl:index===6,scrollWheelZoom:false,doubleClickZoom:true,touchZoom:true,dragging:true,tap:true,keyboard:false,boxZoom:false});
  L.control.zoom({position:'bottomleft'}).addTo(map);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:20,attribution:'&copy; OpenStreetMap contributors &copy; CARTO'}).addTo(map);
  maps[state]=map;
  layers[state]=L.layerGroup().addTo(map);
  map.setView(FALLBACK[state],5);
}

function build(){
  const grid=$('mapsGrid');
  grid.innerHTML='';
  STATES.forEach((state,index)=>{
    const card=document.createElement('section');
    card.className='map-card';
    card.innerHTML=`<div id="map-${index}" class="map-canvas"></div><div class="map-title"><div class="name">${state}</div><div class="count" id="count-${index}"></div></div>`;
    grid.appendChild(card);
    makeMap(state,index);
  });
  render();
  setTimeout(()=>Object.values(maps).forEach(m=>m.invalidateSize()),250);
}

function render(){
  STATES.forEach((state,index)=>{
    const layer=layers[state];
    layer.clearLayers();
    const data=rows.filter(r=>r.state===state&&hasCoords(r)&&(activeFilter==='all'||r.status===activeFilter));
    const bounds=[];
    for(const r of data){
      const lat=Number(r.latitude),lon=Number(r.longitude);
      L.circleMarker([lat,lon],{radius:5,weight:1.4,color:'#ffffff',fillColor:color(r.status),fillOpacity:.96,interactive:true,bubblingMouseEvents:false})
        .bindPopup(popup(r)).addTo(layer);
      bounds.push([lat,lon]);
    }
    $(`count-${index}`).textContent=`${data.length.toLocaleString()} locations`;
    if(bounds.length) maps[state].fitBounds(bounds,{padding:[18,18],maxZoom:7});
    else maps[state].setView(FALLBACK[state],5);
  });
}

$('filterBtn').addEventListener('click',e=>{e.currentTarget.blur();$('filterPanel').classList.toggle('open')});
document.querySelectorAll('#filterPanel button').forEach(b=>b.addEventListener('click',()=>{
  activeFilter=b.dataset.filter;
  document.querySelectorAll('#filterPanel button').forEach(x=>x.classList.toggle('active',x===b));
  b.blur();
  $('filterPanel').classList.remove('open');
  render();
}));

async function load(){
  if(!accessKey){
    $('loading').textContent='Private map — access key required.';
    return;
  }
  try{
    const response=await fetch('/api/schools',{cache:'no-store',headers:{'x-map-key':accessKey}});
    if(response.status===401){$('loading').textContent='Private map — invalid access key.';return;}
    if(!response.ok) throw new Error(`API returned ${response.status}`);
    rows=await response.json();
    build();
    $('loading').style.display='none';
  }catch(error){
    console.error(error);
    $('loading').textContent='Could not load the private map data.';
  }
}
load();