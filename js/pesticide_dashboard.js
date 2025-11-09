// Pesticide Dashboard module
// Exposes initPesticideDashboard() as the maps callback

import Chart from 'https://cdn.jsdelivr.net/npm/chart.js/dist/chart.esm.js';

let map;
let circleMarkers = [];
let infoWindow;
let allRecords = [];
let stateTotals = {};
let yearSet = new Set();
let barChart, pieChart;

// Minimal centroids for US states (state name -> [lat, lng])
// Approximate centroids for display purposes
const STATE_CENTROIDS = {
  "Alabama":[32.806671,-86.79113],"Alaska":[61.370716,-152.404419],"Arizona":[33.729759,-111.431221],
  "Arkansas":[34.969704,-92.373123],"California":[36.116203,-119.681564],"Colorado":[39.059811,-105.311104],
  "Connecticut":[41.597782,-72.755371],"Delaware":[39.318523,-75.507141],"Florida":[27.766279,-81.686783],
  "Georgia":[33.040619,-83.643074],"Hawaii":[21.094318,-157.498337],"Idaho":[44.240459,-114.478828],
  "Illinois":[40.349457,-88.986137],"Indiana":[39.849426,-86.258278],"Iowa":[42.011539,-93.210526],
  "Kansas":[38.5266,-96.726486],"Kentucky":[37.66814,-84.670067],"Louisiana":[31.169546,-91.867805],
  "Maine":[44.693947,-69.381927],"Maryland":[39.063946,-76.802101],"Massachusetts":[42.230171,-71.530106],
  "Michigan":[43.326618,-84.536095],"Minnesota":[45.694454,-93.900192],"Mississippi":[32.741646,-89.678696],
  "Missouri":[38.456085,-92.288368],"Montana":[46.921925,-110.454353],"Nebraska":[41.12537,-98.268082],
  "Nevada":[38.313515,-117.055374],"New Hampshire":[43.452492,-71.563896],"New Jersey":[40.298904,-74.521011],
  "New Mexico":[34.840515,-106.248482],"New York":[42.165726,-74.948051],"North Carolina":[35.630066,-79.806419],
  "North Dakota":[47.528912,-99.784012],"Ohio":[40.388783,-82.764915],"Oklahoma":[35.565342,-96.928917],
  "Oregon":[44.572021,-122.070938],"Pennsylvania":[40.590752,-77.209755],"Rhode Island":[41.680893,-71.51178],
  "South Carolina":[33.856892,-80.945007],"South Dakota":[44.299782,-99.438828],"Tennessee":[35.747845,-86.692345],
  "Texas":[31.054487,-97.563461],"Utah":[40.150032,-111.862434],"Vermont":[44.045876,-72.710686],
  "Virginia":[37.769337,-78.169968],"Washington":[47.400902,-121.490494],"West Virginia":[38.491226,-80.954453],
  "Wisconsin":[44.268543,-89.616508],"Wyoming":[42.755966,-107.30249]
};

function parseTSV(text){
  const lines = text.split(/\r?\n/).filter(l=>l.trim());
  if(lines.length<2) return [];
  const headers = lines[0].split(/\t/).map(h=>h.trim());
  const rows = lines.slice(1).map(line=>{
    const cols = line.split(/\t/);
    const obj = {};
    headers.forEach((h,i)=>obj[h]=cols[i] ? cols[i].trim() : '');
    return obj;
  });
  return rows;
}

function numeric(v){
  if(v==null||v==='') return 0;
  const n = Number(v.replace(/[^0-9eE.\-+]/g,''));
  return isNaN(n)?0:n;
}

function computeTotals(records){
  stateTotals = {};
  yearSet = new Set();
  records.forEach(r=>{
    // sum crop columns: find all keys that look like crop names after 'Units'
    const cropKeys = Object.keys(r).filter(k=>!['State_FIPS_code','State','Compound','Year','Units'].includes(k));
    let rowTotal = 0;
    cropKeys.forEach(k=> rowTotal += numeric(r[k]));
    r._rowTotal = rowTotal;
    // group by state
    const state = r.State || 'Unknown';
    if(!stateTotals[state]) stateTotals[state]={total:0, records:[]};
    stateTotals[state].total += rowTotal;
    stateTotals[state].records.push(r);
    yearSet.add(r.Year);
  });
}

function scaleRadius(total, max){
  const minR = 6, maxR = 60;
  if(!max || max<=0) return minR;
  // sqrt scale for area
  const scaled = Math.sqrt(total/max);
  return Math.max(minR, Math.round(scaled*(maxR-minR)+minR));
}

function colorFor(total, max){
  // green hue 140; use saturation and lightness to show intensity
  if(!max || max<=0) return 'hsl(140 60% 45%)';
  const t = total/max; // 0..1
  const light = 65 - t*30; // lighter -> darker
  const sat = 40 + t*45;
  return `hsl(140 ${sat}% ${light}%)`;
}

function clearMarkers(){
  circleMarkers.forEach(c=>{c.setMap(null);});
  circleMarkers = [];
}

function createMarkers(){
  clearMarkers();
  const entries = Object.entries(stateTotals);
  const max = Math.max(...entries.map(e=>e[1].total));
  entries.forEach(([state,data])=>{
    const center = STATE_CENTROIDS[state];
    if(!center) return; // skip if unknown
    const [lat,lng] = center;
    const radius = scaleRadius(data.total, max) * 1000; // multiply for meters
    const color = colorFor(data.total, max);
    const circle = new google.maps.Circle({
      strokeColor: color,
      strokeOpacity: 0.9,
      strokeWeight: 1,
      fillColor: color,
      fillOpacity: 0.55,
      map,
      center: {lat,lng},
      radius: radius
    });
    circleMarkers.push(circle);
    circle.addListener('click', ()=>{
      // derive top compound/year
      const byCompound = {};
      data.records.forEach(r=>{ const c=r.Compound||'Unknown'; const t = numeric(r._rowTotal); if(!byCompound[c]) byCompound[c]=0; byCompound[c]+=t; });
      const topCompound = Object.entries(byCompound).sort((a,b)=>b[1]-a[1])[0];
      const byYear = {};
      data.records.forEach(r=>{ const yr=r.Year||'Unknown'; const t = numeric(r._rowTotal); if(!byYear[yr]) byYear[yr]=0; byYear[yr]+=t; });
      const topYear = Object.entries(byYear).sort((a,b)=>b[1]-a[1])[0];
      const content = `<div style="min-width:220px"><strong>${state}</strong><br>Total use: ${numberWithCommas(Math.round(data.total))} kg<br>Top compound: ${topCompound?topCompound[0]:'-'} (${topCompound?Math.round(topCompound[1]):0} kg)<br>Top year: ${topYear?topYear[0]:'-'} (${topYear?Math.round(topYear[1]):0} kg)</div>`;
      infoWindow.setContent(content);
      infoWindow.setPosition({lat,lng});
      infoWindow.open(map);
    });
  });
}

function numberWithCommas(x){ return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g,","); }

function buildYearOptions(){
  const yearSelect = document.getElementById('yearSelect');
  yearSelect.innerHTML = '';
  const years = Array.from(yearSet).filter(y=>y && y.trim()).sort();
  years.forEach(y=>{
    const opt = document.createElement('option'); opt.value=y; opt.textContent=y; yearSelect.appendChild(opt);
  });
  if(years.length) yearSelect.value = years[years.length-1];
}

function drawBarChart(year){
  // per-state totals for the selected year
  const perState = {};
  Object.entries(stateTotals).forEach(([state,data])=>{ perState[state]=0; data.records.forEach(r=>{ if(r.Year==year) perState[state]+=numeric(r._rowTotal); }); });
  const items = Object.entries(perState).map(([s,t])=>({s,t})).filter(x=>x.t>0).sort((a,b)=>b.t-a.t).slice(0,50);
  const labels = items.map(i=>i.s);
  const dataVals = items.map(i=>i.t);
  if(barChart) barChart.destroy();
  const ctx = document.getElementById('barChart').getContext('2d');
  barChart = new Chart(ctx, {
    type:'bar',
    data:{labels, datasets:[{label:`Pesticide use in ${year} (kg)`, data:dataVals, backgroundColor: labels.map(l=>colorFor(perState[l]||0, Math.max(...dataVals))), borderColor:'#0b5', borderWidth:0.5}]},
    options:{responsive:true, maintainAspectRatio:false, scales:{y:{beginAtZero:true}}}
  });
}

function drawPieChart(){
  const items = Object.entries(stateTotals).map(([s,d])=>({s,total:d.total})).sort((a,b)=>b.total-a.total).slice(0,10);
  const labels = items.map(i=>i.s);
  const dataVals = items.map(i=>i.total);
  const colors = dataVals.map((v,i)=>`hsl(140 ${30 + i*6}% ${65 - i*4}%)`);
  if(pieChart) pieChart.destroy();
  const ctx = document.getElementById('pieChart').getContext('2d');
  pieChart = new Chart(ctx, {type:'pie', data:{labels, datasets:[{data:dataVals, backgroundColor:colors} ]}, options:{responsive:true}});
}

function updateStats(){
  const el = document.getElementById('stats');
  const totalAll = Object.values(stateTotals).reduce((s,o)=>s+o.total,0);
  el.innerHTML = `<div><strong>Total pesticide (all states):</strong> ${numberWithCommas(Math.round(totalAll))} kg</div><div class="legend">States: ${Object.keys(stateTotals).length} — Years: ${Array.from(yearSet).length}</div>`;
}

// Public init called by Google Maps API callback
window.initPesticideDashboard = async function(){
  // initialize map centered on continental US
  map = new google.maps.Map(document.getElementById('map'),{center:{lat:39.5,lng:-98.35},zoom:4,fullscreenControl:true});
  infoWindow = new google.maps.InfoWindow();

  document.getElementById('reloadBtn').addEventListener('click', ()=>{ loadAndRender(); });
  document.getElementById('yearSelect').addEventListener('change', ()=>{ const y=document.getElementById('yearSelect').value; drawBarChart(y); });

  await loadAndRender();
};

async function loadAndRender(){
  // Use internal managed dataset path (clients cannot change this)
  const pathEl = document.getElementById('dataFilePath');
  const path = pathEl ? pathEl.value : 'data/HighEstimate_AgPestUsebyCropGroup92to16.txt';
  const loadingEl = document.getElementById('loadingHint');
  const reloadBtn = document.getElementById('reloadBtn');
  if(loadingEl) loadingEl.textContent = 'Loading dataset — this may take a few seconds...';
  if(reloadBtn) reloadBtn.disabled = true;
  try{
    // Load the precomputed JSON summary for fast client loads
    const summaryPath = 'data/pesticide_summary.json';
    const sresp = await fetch(summaryPath);
    if(!sresp.ok) throw new Error('Failed to load summary JSON: '+sresp.statusText);
    const summary = await sresp.json();
    // Build stateTotals from summary: include per-year records so charts can use same structures
    stateTotals = {};
    yearSet = new Set(summary.years || []);
    const years = summary.years || [];
    const states = summary.states || Object.keys(summary.by_state || {});
    states.forEach(s => {
      const total = (summary.by_state && summary.by_state[s] && summary.by_state[s].total) || 0;
      stateTotals[s] = { total: total, records: [] };
      years.forEach(yr => {
        const v = (summary.by_state_year && summary.by_state_year[yr] && summary.by_state_year[yr][s]) || 0;
        if(v && v>0){ stateTotals[s].records.push({ Year: yr, _rowTotal: v, Compound: '' }); }
      });
    });
    // create map and charts from summary
    buildYearOptions();
    createMarkers();
    updateStats();
    const yearSel = document.getElementById('yearSelect');
    const year = yearSel.value || years.slice(-1)[0];
    drawBarChart(year);
    drawPieChart();
  }catch(err){
    alert('Error loading dataset: '+err.message);
    console.error(err);
  }finally{
    if(loadingEl) loadingEl.textContent = '';
    if(reloadBtn) reloadBtn.disabled = false;
  }
}

export default {};
