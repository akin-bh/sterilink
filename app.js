// app.js — SterileLoop demo (vanilla JS)
// - initMap is the Google Maps callback (loaded with &callback=initMap)
// - Uses localStorage for simple persistence of users/bookings/reports

let map, autocomplete, userMarker;
let providers = []; // loaded from CSV
let pendingProviderId = null; // set when a user clicks a provider but hasn't filled form yet
const STORAGE_KEYS = {USER:'sterile_user', BOOKINGS:'sterile_bookings'};
// Charts
let lineChart, barChart, areaChart, pieChart;
// ESG charts
let esgGhgBar, esgGhgPie, esgScalingChart;
// Mini sidebar charts
// mini charts removed

// Metric animation tuning: delay before starting (ms) and animation duration (ms)
const METRIC_ANIM_DELAY_MS = 900; // simulate calculation time
const METRIC_ANIM_DURATION = 1200; // longer count-up for a slower feel

// Seeded regional sample data for visualizations (demo)
const regionSeeds = [
  {region:'North America', lat:40.0, lng:-100.0, basePesticide:1200},
  {region:'South America', lat:-10.0, lng:-60.0, basePesticide:800},
  {region:'Europe', lat:50.0, lng:10.0, basePesticide:900},
  {region:'Asia', lat:30.0, lng:100.0, basePesticide:2000},
  {region:'Africa', lat:0.0, lng:20.0, basePesticide:700},
  {region:'Oceania', lat:-25.0, lng:135.0, basePesticide:200}
];

// Minimal centroids for US states (copied from pesticide dashboard module)
const STATE_CENTROIDS = {
  "Alabama":[32.806671,-86.79113],"Arizona":[33.729759,-111.431221],"Arkansas":[34.969704,-92.373123],"California":[36.116203,-119.681564],"Colorado":[39.059811,-105.311104],"Connecticut":[41.597782,-72.755371],"Delaware":[39.318523,-75.507141],"Florida":[27.766279,-81.686783],"Georgia":[33.040619,-83.643074],"Idaho":[44.240459,-114.478828],"Illinois":[40.349457,-88.986137],"Indiana":[39.849426,-86.258278],"Iowa":[42.011539,-93.210526],"Kansas":[38.5266,-96.726486],"Kentucky":[37.66814,-84.670067],"Louisiana":[31.169546,-91.867805],"Maine":[44.693947,-69.381927],"Maryland":[39.063946,-76.802101],"Massachusetts":[42.230171,-71.530106],"Michigan":[43.326618,-84.536095],"Minnesota":[45.694454,-93.900192],"Mississippi":[32.741646,-89.678696],"Missouri":[38.456085,-92.288368],"Montana":[46.921925,-110.454353],"Nebraska":[41.12537,-98.268082],"Nevada":[38.313515,-117.055374],"New Hampshire":[43.452492,-71.563896],"New Jersey":[40.298904,-74.521011],"New Mexico":[34.840515,-106.248482],"New York":[42.165726,-74.948051],"North Carolina":[35.630066,-79.806419],"North Dakota":[47.528912,-99.784012],"Ohio":[40.388783,-82.764915],"Oklahoma":[35.565342,-96.928917],"Oregon":[44.572021,-122.070938],"Pennsylvania":[40.590752,-77.209755],"Rhode Island":[41.680893,-71.51178],"South Carolina":[33.856892,-80.945007],"South Dakota":[44.299782,-99.438828],"Tennessee":[35.747845,-86.692345],"Texas":[31.054487,-97.563461],"Utah":[40.150032,-111.862434],"Vermont":[44.045876,-72.710686],"Virginia":[37.769337,-78.169968],"Washington":[47.400902,-121.490494],"West Virginia":[38.491226,-80.954453],"Wisconsin":[44.268543,-89.616508],"Wyoming":[42.755966,-107.30249]
};

// Pesticide overlay state circles and summary data
let pesticideSummary = null;
let pesticideCircles = [];
let pesticideInfoWindow = null;

function scaleRadiusForMap(total, max){
  const minR = 8000, maxR = 600000; // meters scale (tuned)
  if(!max || max<=0) return minR;
  const scaled = Math.sqrt(total/max);
  return Math.max(minR, Math.round(scaled*(maxR-minR)+minR));
}

function colorForMap(total, max){
  if(!max || max<=0) return 'hsl(140 60% 45%)';
  const t = total/max; const light = 65 - t*30; const sat = 40 + t*45;
  return `hsl(140 ${sat}% ${light}%)`;
}

function clearPesticideCircles(){
  pesticideCircles.forEach(c=>c.setMap(null)); pesticideCircles = [];
}

function drawPesticideOverlay(year, selectedState){
  if(!pesticideSummary || !map) return;
  clearPesticideCircles();
  const by_state_year = pesticideSummary.by_state_year || {};
  const perStateVals = {};
  // build per-state value for selected year (or total if year missing)
  if(year && by_state_year[year]){
    Object.entries(by_state_year[year]).forEach(([st,val])=> perStateVals[st]=val);
  } else if(pesticideSummary.by_state){
    Object.entries(pesticideSummary.by_state).forEach(([st,obj])=> perStateVals[st]=obj.total);
  }
  const entries = Object.entries(perStateVals).map(e=>({state:e[0],value:e[1] || 0})).filter(e=>e.value>0);
  if(entries.length===0) return;
  const maxVal = Math.max(...entries.map(e=>e.value));
  entries.forEach(e=>{
    const center = STATE_CENTROIDS[e.state]; if(!center) return;
    if(selectedState && selectedState!=='All' && selectedState!==e.state) return;
    const [lat,lng] = center; const radius = scaleRadiusForMap(e.value, maxVal);
    const color = colorForMap(e.value, maxVal);
    const circle = new google.maps.Circle({map, center:{lat,lng}, radius, strokeColor:color, strokeOpacity:0.9, strokeWeight:1, fillColor:color, fillOpacity:0.45, clickable:true});
    circle.addListener('click', (ev)=>{
      // Use a single InfoWindow for pesticide overlays so multiple openings reuse it
      try{
        console.log('pesticide circle clicked', e.state, e.value, ev);
        if(!pesticideInfoWindow) pesticideInfoWindow = new google.maps.InfoWindow();
        const lbs = Math.round((e.value || 0) * 2.20462);
        const content = `<div style="min-width:220px"><strong>${e.state}</strong><br>Total use: ${numberWithCommas(lbs)} lbs</div>`;
        pesticideInfoWindow.setContent(content);
        // prefer event latLng when available
        const pos = (ev && ev.latLng) ? ev.latLng : new google.maps.LatLng(lat,lng);
        pesticideInfoWindow.setPosition(pos);
        // ensure info window is visible by panning the map slightly if needed
        try{ map.panTo(pos); if(map.getZoom && map.getZoom()<5) map.setZoom(6); }catch(e2){}
        pesticideInfoWindow.open(map);
      }catch(err){ console.warn('pesticide circle click handler error', err); }
    });
    pesticideCircles.push(circle);
  });
}

async function loadPesticideSummaryAndWire(){
  try{
    const resp = await fetch('data/pesticide_summary.json');
    if(!resp.ok) throw new Error(resp.statusText||'Failed to fetch');
    pesticideSummary = await resp.json();
    // populate year and state selects
    const ySel = $('pesticideYearSelect'); const sSel = $('pesticideStateSelect');
    if(ySel && pesticideSummary.years){ ySel.innerHTML = ''; pesticideSummary.years.forEach(y=>{ const o=document.createElement('option'); o.value=o.textContent=y; ySel.appendChild(o); }); }
    if(sSel && pesticideSummary.states){ pesticideSummary.states.forEach(s=>{ const o=document.createElement('option'); o.value=o.textContent=s; sSel.appendChild(o); }); }
    // wire handlers
    const showCb = $('showPesticide'); if(showCb){ showCb.addEventListener('change', ()=>{ const show = showCb.checked; if(show) drawPesticideOverlay($('pesticideYearSelect').value, $('pesticideStateSelect').value); else clearPesticideCircles(); }); }
    if($('pesticideYearSelect')) $('pesticideYearSelect').addEventListener('change', ()=>{ if($('showPesticide').checked) drawPesticideOverlay($('pesticideYearSelect').value, $('pesticideStateSelect').value); });
    if($('pesticideStateSelect')) $('pesticideStateSelect').addEventListener('change', ()=>{ const st=$('pesticideStateSelect').value; // filter providers by state
      filterProvidersByState(st);
      if($('showPesticide').checked) drawPesticideOverlay($('pesticideYearSelect').value, st);
      // if a specific state selected, zoom to it
      if(st && st!=='All' && STATE_CENTROIDS[st]){ const [lat,lng]=STATE_CENTROIDS[st]; map.setCenter({lat,lng}); map.setZoom(6); }
    });
  }catch(err){ console.warn('Could not load pesticide summary', err); }
}

function filterProvidersByState(state){
  if(!providers || providers.length===0) return;
  if(!state || state==='All'){
    providers.forEach(p=>{ try{ if(p._marker) p._marker.setVisible(true); }catch(e){} });
    return;
  }
  const center = STATE_CENTROIDS[state]; if(!center) return;
  const [slat,slng] = center;
  providers.forEach(p=>{
    try{
      const d = haversineKm(slat, slng, Number(p.lat), Number(p.lng));
      // show providers within ~250 km of centroid
      if(p._marker) p._marker.setVisible(d<=250);
    }catch(e){}
  });
}

function $(id){return document.getElementById(id)}

/* ---------- Initialization & UI wiring ---------- */
function initControls(){
  // Simplified controls for hackathon: no sign-in flow
  // Header button opens the New Job form
  const headerBtn = $('openNewJobHeader');
  if(headerBtn) headerBtn.addEventListener('click', ()=>{ document.querySelector('.form-col').scrollIntoView({behavior:'smooth'}); });
  // removed openNewJob button from page; no handler needed
  // Reset form instead of hiding (form is always visible in dashboard)
  $('cancelJob').addEventListener('click', ()=>{ const f = $('jobForm'); if(f) f.reset(); showMessage('Form reset'); });

  $('calcBtn').addEventListener('click', (e)=>{ e.preventDefault(); previewReport(); });
  $('jobForm').addEventListener('submit', (e)=>{ e.preventDefault(); openRequestCardFromForm(); });

  // Wire range sliders -> display live values
  try{
    const sizeInput = $('sizeInput'); const sizeDisplay = $('sizeInputDisplay'); const sizeUnit = $('sizeUnit');
    if(sizeInput && sizeDisplay){
      const updateSizeDisplay = ()=>{ const unit = (sizeUnit && sizeUnit.value) ? ` ${sizeUnit.value}` : ''; sizeDisplay.textContent = `${Number(sizeInput.value).toLocaleString()}${unit}`; };
      sizeInput.addEventListener('input', updateSizeDisplay);
      if(sizeUnit) sizeUnit.addEventListener('change', updateSizeDisplay);
      updateSizeDisplay();
    }

  const pIn = $('pesticideInput'); const pDisp = $('pesticideInputDisplay');
  if(pIn && pDisp){ const upd = ()=> pDisp.textContent = `${Number(pIn.value).toLocaleString()} lbs / yr`; pIn.addEventListener('input', upd); upd(); }

    const costIn = $('pesticideCostYear'); const costDisp = $('pesticideCostYearDisplay');
    if(costIn && costDisp){ const updC = ()=> costDisp.textContent = `$${Number(costIn.value).toLocaleString()} / yr`; costIn.addEventListener('input', updC); updC(); }
    
  // Post-harvest loss slider
  const lossIn = $('lossInput'); const lossDisp = $('lossInputDisplay');
  if(lossIn && lossDisp){ const updL = ()=> lossDisp.textContent = `${Number(lossIn.value)} %`; lossIn.addEventListener('input', updL); updL(); }

  // Expected pesticide reduction slider
  const expIn = $('expectedReduction'); const expDisp = $('expectedReductionDisplay');
  if(expIn && expDisp){ const updE = ()=> expDisp.textContent = `${Number(expIn.value)} %`; expIn.addEventListener('input', updE); updE(); }
  }catch(e){ console.warn('range wiring failed', e); }

  // pest select -> show/hide 'Other' free-text field
  try{
    // show/hide optional 'Other' text fields for the three new selects
    const pestSel = $('pestTargetSelect'); const pestOther = $('pestTargetOther');
    const foodSel = $('foodTargetSelect'); const foodOther = $('foodTargetOther');
    const goalSel = $('treatmentGoalSelect'); const goalOther = $('treatmentGoalOther');
    const wireToggle = (sel, other)=>{ if(!sel || !other) return; const toggle = ()=>{ other.style.display = (sel.value === 'Other') ? 'block' : 'none'; }; sel.addEventListener('change', toggle); toggle(); };
    wireToggle(pestSel, pestOther); wireToggle(foodSel, foodOther); wireToggle(goalSel, goalOther);
    // pesticide names select (single dropdown) -> show/hide 'Other' input when 'Other' selected
    const pNamesSel = $('pesticideNamesSelect'); const pNamesOther = $('pesticideNamesOther');
    if(pNamesSel && pNamesOther){
      const toggleNames = ()=>{ pNamesOther.style.display = (pNamesSel.value === 'Other') ? 'block' : 'none'; };
      pNamesSel.addEventListener('change', toggleNames);
      toggleNames();
    }
  }catch(e){ /* ignore */ }

  // Note: modal-based request removed; using inline request card instead

  // Inline request card handlers
  const inlineSend = $('inlineReqSend');
  if(inlineSend) inlineSend.addEventListener('click', (e)=>{ e.preventDefault(); submitInlineRequest(); });
  const inlineCancel = $('inlineReqCancel');
  if(inlineCancel) inlineCancel.addEventListener('click', ()=>{ $('inlineRequestCard').classList.add('hidden'); const bb=document.getElementById('inlineBackdrop'); if(bb) bb.remove(); });
  const inlineCloseBtn = $('inlineReqCloseBtn');
  if(inlineCloseBtn) inlineCloseBtn.addEventListener('click', ()=>{ $('inlineRequestCard').classList.add('hidden'); const bb=document.getElementById('inlineBackdrop'); if(bb) bb.remove(); });

  // Report controls
  $('downloadReport').addEventListener('click', ()=>window.print());
  $('closeReport').addEventListener('click', ()=>$('reportPreview').classList.add('hidden'));

  // Visualization controls
  const vizRegion = $('vizRegion'); if(vizRegion) vizRegion.addEventListener('change', ()=>updateCharts());
  const vizScenario = $('vizScenario'); if(vizScenario) vizScenario.addEventListener('change', ()=>updateCharts());
  const vizYears = $('vizYears'); if(vizYears) vizYears.addEventListener('change', ()=>updateCharts());

  // ESG reporter controls (Generate & export PDF)
  const genESG = $('genESG'); if(genESG) genESG.addEventListener('click', (e)=>{ e.preventDefault(); handleGenerateESG(); });
  const exportPDF = $('exportPDF'); if(exportPDF) exportPDF.addEventListener('click', (e)=>{ e.preventDefault(); exportESGToPDF(); });

  // initialize charts
  setTimeout(()=>{ try{ initCharts(); updateCharts(); }catch(e){ console.warn('Chart init failed',e);} }, 300);
  // mini sidebar charts removed

  // Load profile if present
  refreshUI();

  // Sidebar toggle behaviour: collapse/expand on click
  try{
    const sidebar = document.getElementById('sideMenu');
    const toggle = document.getElementById('sidebarToggle');
    const closeBtn = document.getElementById('sideClose');
    // legacy toggle (if present) will toggle collapsed class
    if(toggle && sidebar){
      toggle.addEventListener('click', (e)=>{ e.preventDefault(); sidebar.classList.toggle('collapsed'); });
    }
    // new floating panel minimize button: toggle .minimized (icon-only collapsed state)
    if(closeBtn && sidebar){
      closeBtn.addEventListener('click', (e)=>{
        e.preventDefault();
        const isMin = sidebar.classList.toggle('minimized');
        // update accessible state and title
        closeBtn.setAttribute('aria-pressed', isMin ? 'true' : 'false');
        closeBtn.setAttribute('title', isMin ? 'Restore' : 'Minimize');
      });
    }
    // wire side-nav links: set active class and ensure panel opens if collapsed/closed
    const navLinks = document.querySelectorAll('.side-nav a[data-page]');
    navLinks.forEach(a=> a.addEventListener('click', (ev)=>{
      try{
        ev.preventDefault();
        navLinks.forEach(n=>n.classList.remove('active'));
        a.classList.add('active');
        // if minimized or collapsed, restore to expanded view on click
        if(sidebar.classList.contains('collapsed')) sidebar.classList.remove('collapsed');
        if(sidebar.classList.contains('minimized')) sidebar.classList.remove('minimized');
        if(sidebar.classList.contains('closed')) sidebar.classList.remove('closed');

        // SPA-like page handling: render content into #pageContent for certain pages
        const page = a.dataset.page;
        const pageContent = document.getElementById('pageContent');
        if(page && pageContent){
          if(page === 'home'){
            // Show main dashboard
            const main = document.getElementById('mainDashboard') || document.body;
            main.scrollIntoView({behavior:'smooth'});
            try{ history.replaceState(null, '', 'index.html'); }catch(e){}
            return;
          }
          if(page === 'api'){
            // navigate via hash so the centralized loader handles loading api.html
            try{ location.hash = '#api'; }catch(e){}
            return;
          }
          // default: render a simple page stub for other items
          pageContent.innerHTML = `<div class="card"><h3>${page}</h3><p>Content for <strong>${page}</strong> will appear here.</p></div>`;
          pageContent.scrollIntoView({behavior:'smooth'});
        }
      }catch(e){console.warn('nav link handler failed', e);}    
    }));

    // Dashboard button: navigate to the main dashboard view (SPA-friendly)
    const dashboardBtn = document.getElementById('dashboardBtn');
    if(dashboardBtn){
      dashboardBtn.addEventListener('click', (ev)=>{
        try{
          // prevent a full reload if already on the SPA
          ev.preventDefault();
          // mark active
          navLinks.forEach(n=>n.classList.remove('active'));
          dashboardBtn.classList.add('active');
          // restore panel if minimized/collapsed/closed
          if(sidebar.classList.contains('collapsed')) sidebar.classList.remove('collapsed');
          if(sidebar.classList.contains('minimized')) sidebar.classList.remove('minimized');
          if(sidebar.classList.contains('closed')) sidebar.classList.remove('closed');
          // scroll the main dashboard area into view smoothly
          const main = document.getElementById('mainDashboard') || document.body;
          main.scrollIntoView({behavior:'smooth'});
          // also update history so the URL remains consistent
          try{ history.replaceState(null, '', 'index.html'); }catch(e){}
        }catch(err){ console.warn('dashboardBtn click failed', err); }
      });
    }
  }catch(e){console.warn('sidebar toggle wiring failed', e)}
}

/* ---------- ESG Impact model & reporting (uses user-provided benchmark assumptions) ---------- */
function computeESGImpact(opts){
  // opts: {farms, acres, pesticidePerAcre, sitReductionPct, irradiationShelfPct, productionTons}
  const farms = Number(opts.farms||0);
  const acres = Number(opts.acres||0);
  const pesticidePerAcre = Number(opts.pesticidePerAcre||0);
  const sitReduction = Number(opts.sitReductionPct||0)/100.0;
  const irradiationShelf = Number(opts.irradiationShelfPct||0)/100.0;
  const productionTons = Number(opts.productionTons||0);

  // Pesticide reduction (lbs)
  const baselinePesticideTotal = acres * pesticidePerAcre; // lbs/year
  const pesticideAvoided = baselinePesticideTotal * sitReduction; // lbs/year

  // Constants (per spec)
  const GHG_PER_LB_PEST_KG = 5; // kg CO2e per lb pesticide
  const GHG_PER_TON_FOOD_T = 2.5; // metric tons CO2e per ton food saved
  const CAR_EQ_TON = 4.6; // metric tons CO2e per car/year

  // GHG from pesticide avoided
  const ghgAvoidedFromPesticide_t = (pesticideAvoided * GHG_PER_LB_PEST_KG) / 1000.0; // metric tons

  // Water savings from spray cycles avoided: assume 3 cycles avoided * 200 gal/acre (example from spec)
  const waterSavedGallons = acres * 3 * 200; // gallons

  // Food saved via irradiation: assume irradiation reduces losses using provided percent
  // If productionTons is total production across farms, estimate food saved (tons)
  const baselineLossPct = 0.10; // baseline ~10% loss (spec)
  // Irradiation avoids a fraction of the loss proportional to shelf-life improvement (simplified)
  const lossAvoidedTons = productionTons * baselineLossPct * irradiationShelf; // tons/year

  // GHG avoided from food saved: 2.5 tons CO2e per ton food (spec)
  const ghgPerTonFood = 2.5; // metric tons CO2e per ton
  const ghgAvoidedFromFood_t = lossAvoidedTons * GHG_PER_TON_FOOD_T;

  // Total GHG avoided (sum)
  const totalGhgAvoided_t = round(ghgAvoidedFromPesticide_t + ghgAvoidedFromFood_t,3);

  // Cars-equivalent avoided
  const carsEquivalent = round(totalGhgAvoided_t / CAR_EQ_TON,3);

  // Sustainability score (0-100) — simple heuristic combining GHG and water savings.
  // Scale: 1000 t CO2e => 50 points, 1,000,000 gallons water => 50 points (capped)
  const ghgScore = Math.min(50, (totalGhgAvoided_t / 1000) * 50);
  const waterScore = Math.min(50, (waterSavedGallons / 1000000) * 50);
  const sustainabilityScore = Math.round(Math.max(0, Math.min(100, ghgScore + waterScore)));

  return {
    farms, acres, baselinePesticideTotal, pesticideAvoided: Math.round(pesticideAvoided), ghgAvoidedFromPesticide_t: round(ghgAvoidedFromPesticide_t,3),
    waterSavedGallons, productionTons, lossAvoidedTons: round(lossAvoidedTons,3), ghgAvoidedFromFood_t: round(ghgAvoidedFromFood_t,3),
    totalGhgAvoided_t, carsEquivalent, sustainabilityScore
  };
}

function handleGenerateESG(){
  const opts = {
    farms: Number($('esgFarms').value||0),
    acres: Number($('esgAcres').value||0),
    pesticidePerAcre: Number($('esgPesticidePerAcre').value||0),
    sitReductionPct: Number($('esgSITReduction').value||0),
    irradiationShelfPct: Number($('esgIrradiationShelf').value||0),
    productionTons: Number($('esgProductionTons').value||0)
  };
  const report = computeESGImpact(opts);
  renderESGReport(report, opts);
}

function renderESGReport(r, opts){
  const el = $('esgResults'); if(!el) return;
  // update summary cards
  try{
    $('cardPesticide').textContent = `${r.pesticideAvoided} lbs / yr`;
    $('cardGHG').textContent = `${r.totalGhgAvoided_t} t CO₂e / yr`;
    $('cardWater').textContent = `${r.waterSavedGallons.toLocaleString()} gallons / yr`;
    $('cardFood').textContent = `${r.lossAvoidedTons} tons / yr`;
    $('cardCars').textContent = `${r.carsEquivalent} cars / yr`;
    $('sustainabilityScore').textContent = `Score: ${r.sustainabilityScore}`;
  }catch(e){}

  // detailed notes
  el.innerHTML = `
    <div class="p-4 bg-gray-50 rounded-md">
      <h4 class="text-sm font-medium">Assumptions & Notes</h4>
      <ul class="text-sm text-gray-600 mt-2">
        <li>Baseline pesticide: ${r.baselinePesticideTotal} lbs/year across ${r.acres} acres (${opts.pesticidePerAcre} lbs/acre/year)</li>
        <li>SIT reduction used: ${opts.sitReductionPct}% (applied to baseline pesticide)</li>
        <li>GHG factor: 5 kg CO₂e per lb pesticide</li>
        <li>Irradiation shelf-life improvement: ${opts.irradiationShelfPct}% reducing post-harvest loss from baseline 10%</li>
        <li>GHG from avoided food waste: 2.5 t CO₂e per ton</li>
      </ul>
    </div>
  `;
  window._lastESGReport = {report:r, opts};

  // charts
  try{
    if(typeof Chart === 'undefined'){
      showMessage('Chart.js not loaded yet — charts will appear shortly');
      return;
    }
    const ghgPest = r.ghgAvoidedFromPesticide_t || 0;
    const ghgFood = r.ghgAvoidedFromFood_t || 0;
    // GHG breakdown bar
    const barCtx = document.getElementById('esgGhgBar').getContext('2d');
    const barData = {labels:['Pesticide','Avoided food waste'],datasets:[{label:'GHG avoided (t CO2e)',data:[ghgPest,ghgFood],backgroundColor:['#16a34a','#86efac']}]};
    if(esgGhgBar){ esgGhgBar.data = barData; esgGhgBar.update(); } else { esgGhgBar = new Chart(barCtx,{type:'bar',data:barData,options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}}); }

    // Scaling chart: hubs 1..100 linear scaling of total GHG avoided
    const scaleLabels = Array.from({length:100},(_,i)=>i+1);
    const scaleData = scaleLabels.map(h=>round(r.totalGhgAvoided_t * h,3));
    const scaleCtx = document.getElementById('esgScalingChart').getContext('2d');
    const scaleDataset = {labels:scaleLabels,datasets:[{label:'Total GHG avoided (t CO2e)',data:scaleData,fill:false,borderColor:'#16a34a',tension:0.15}]};
    if(esgScalingChart){ esgScalingChart.data = scaleDataset; esgScalingChart.update(); } else { esgScalingChart = new Chart(scaleCtx,{type:'line',data:scaleDataset,options:{responsive:true,maintainAspectRatio:false,scales:{x:{title:{display:true,text:'Number of hubs'}},y:{title:{display:true,text:'t CO₂e avoided'}}}}}); }
  }catch(e){ console.warn('ESG charts failed', e); }
}

function handleExportESG(){
  const data = window._lastESGReport;
  if(!data){ showMessage('Generate a report first'); return; }
  const r = data.report; const o = data.opts;
  const rows = [
    ['metric','value','units'],
    ['farms',o.farms,'count'],
    ['acres',o.acres,'acres'],
    ['pesticide_avoided_lbs',Math.round(r.pesticideAvoided),'lbs/year'],
    ['ghg_avoided',r.totalGhgAvoided_t,'tCO2e/year'],
    ['water_saved_gallons',r.waterSavedGallons,'gallons/year'],
    ['food_saved_tons',r.lossAvoidedTons,'tons/year']
  ];
  const csv = rows.map(rw=>rw.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'esg_report.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

// Export last ESG report to PDF using jsPDF
function exportESGToPDF(){
  const data = window._lastESGReport;
  if(!data){ showMessage('Generate a report first'); return; }
  const r = data.report; const o = data.opts;
  const jspdfModule = window.jspdf;
  if(!jspdfModule || !jspdfModule.jsPDF){ showMessage('PDF library not loaded'); return; }
  const { jsPDF } = jspdfModule;
  const doc = new jsPDF({unit:'pt',format:'a4'});
  let y = 40;
  doc.setFontSize(18); doc.text('SterileLoop — Sustainability Impact Report', 40, y);
  y += 24;
  doc.setFontSize(11);
  doc.text(`Farms: ${o.farms}    Acres: ${o.acres}    Production: ${o.productionTons} t/yr`, 40, y); y += 18;
  doc.text(`Pesticide avoided: ${r.pesticideAvoided} lbs/yr`, 40, y); y += 14;
  doc.text(`GHG avoided: ${r.totalGhgAvoided_t} t CO2e/yr    (${r.carsEquivalent} cars/yr)`, 40, y); y += 14;
  doc.text(`Water saved: ${r.waterSavedGallons.toLocaleString()} gallons/yr`, 40, y); y += 18;
  // include charts as images
  try{
    const ghgCanvas = document.getElementById('esgGhgBar');
    const scaleCanvas = document.getElementById('esgScalingChart');
    if(ghgCanvas){ const img = ghgCanvas.toDataURL('image/png',1.0); doc.addImage(img,'PNG',40,y,500,180); y += 190; }
    if(scaleCanvas){ const img2 = scaleCanvas.toDataURL('image/png',1.0); doc.addImage(img2,'PNG',40,y,500,180); y += 190; }
  }catch(e){ console.warn('PDF charts capture failed', e); }

  doc.setFontSize(10); doc.text('Generated by SterileLoop demo — use restricted API keys in production.', 40, y+10);
  doc.save('sterileloop_esg_report.pdf');
}

/* ---------- UI message helper (non-blocking) ---------- */
function showMessage(msg, timeout=4000){
  const el = $('messageBar');
  if(!el) { console.log('MSG:', msg); return; }
  el.textContent = msg; el.classList.remove('hidden');
  setTimeout(()=>{ el.classList.add('hidden'); }, timeout);
}

/* ---------- NOTE: Sign-in/profile removed for hackathon demo. Bookings will include contact fields entered in the New Job form. */
function loadProfile(){ return null; }

/* ---------- Map & Autocomplete ---------- */
function initMap(){
  // Default center (example: central US)
  const defaultCenter = {lat: 39.8283, lng: -98.5795};
  map = new google.maps.Map(document.getElementById('map'), {center: defaultCenter, zoom: 4});
  userMarker = new google.maps.Marker({map, visible:false});

    // Autocomplete binding: wire both the map input and the form input so users can select location from either place
    const mapInput = $('addressInput');
    const formInput = $('addressInputForm');

    // Shared handler for a selected place
    const handlePlaceSelection = (place)=>{
      if(!place || !place.geometry){ showMessage('Selected place has no geometry. Try another place.'); return; }
      const loc = place.geometry.location;
      map.setCenter(loc); map.setZoom(14);
      userMarker.setPosition(loc); userMarker.setVisible(true);
      userMarker.lat = loc.lat(); userMarker.lng = loc.lng();
      userMarker.address = place.formatted_address || place.name;
      // sync both inputs' visible values
      try{ if(mapInput) mapInput.value = place.formatted_address || place.name; if(formInput) formInput.value = place.formatted_address || place.name; }catch(e){}
      // automatically show nearest providers
      try{ showNearestProviders(userMarker.lat, userMarker.lng, 5); }catch(e){ console.warn('showNearestProviders failed', e); }
    };

    // create autocomplete for map input
    if(mapInput){
      const mapAuto = new google.maps.places.Autocomplete(mapInput, {fields:['geometry','formatted_address','name']});
      mapAuto.addListener('place_changed', ()=>{ const place = mapAuto.getPlace(); handlePlaceSelection(place); });
      // hide marker while typing on this input
      mapInput.addEventListener('input', ()=>{ try{ if(userMarker){ userMarker.setVisible(false); userMarker.lat = null; userMarker.lng = null; userMarker.address = null; } }catch(e){} });
      // keep global reference for backwards compatibility
      autocomplete = mapAuto;
    }

    // create autocomplete for form input (if present)
    if(formInput){
      const formAuto = new google.maps.places.Autocomplete(formInput, {fields:['geometry','formatted_address','name']});
      formAuto.addListener('place_changed', ()=>{ const place = formAuto.getPlace(); handlePlaceSelection(place); });
      formInput.addEventListener('input', ()=>{ try{ if(userMarker){ userMarker.setVisible(false); userMarker.lat = null; userMarker.lng = null; userMarker.address = null; } }catch(e){} });
      // if no global autocomplete set, set it to formAuto
      if(!autocomplete) autocomplete = formAuto;
    }

  // Load provider CSV and add markers
      fetch('providers.csv').then(r=>r.text()).then(txt => {
    providers = parseCSV(txt);
    providers.forEach(addProviderMarker);
    // add region markers for visualizations
    addRegionMarkers();
    // load pesticide summary and wire overlay controls
    loadPesticideSummaryAndWire();
  }).catch(err=>{
    console.warn('Could not load providers.csv — falling back to seeded array', err);
    // fallback sample
    providers = [
      {id:'p-1',name:'Mobile Lab A',lat:38.9,lng:-77.03,services:'SIT|Irradiation',contact:'labA@example.com'},
    ];
    providers.forEach(addProviderMarker);
    addRegionMarkers();
    loadPesticideSummaryAndWire();
  });
}

function addRegionMarkers(){
  // place region markers (clicking a region filters visualizations)
  if(!map) return;
  regionSeeds.forEach(r=>{
    const marker = new google.maps.Marker({position:{lat:r.lat,lng:r.lng},map,title:r.region,icon:{path:google.maps.SymbolPath.CIRCLE,scale:6,fillColor:'#2b7a78',fillOpacity:0.9,strokeWeight:0}});
    marker.addListener('click', ()=>{
      const sel = $('vizRegion'); if(sel) sel.value = r.region; updateCharts(); showMessage(`Filtering visualizations to ${r.region}`);
    });
  });
}

function addProviderMarker(p){
  const pos = {lat: parseFloat(p.lat), lng: parseFloat(p.lng)};
  const marker = new google.maps.Marker({position:pos,map,title:p.name});
  const content = document.createElement('div');
  content.innerHTML = `<strong>${p.name}</strong><div>${p.services}</div><div>${p.contact||''}</div>`;
  const reqBtn = document.createElement('button'); reqBtn.textContent='Request slot';
  reqBtn.addEventListener('click', ()=>openRequestModalForProvider(p));
  content.appendChild(reqBtn);
  const info = new google.maps.InfoWindow({content});
  marker.addListener('click', ()=>info.open(map, marker));
  // keep references for runtime operations (e.g., show nearest providers)
  p._marker = marker;
  p._info = info;
}

// Haversine distance (km) between two lat/lng pairs
function haversineKm(lat1, lon1, lat2, lon2){
  function toRad(v){return v*Math.PI/180;}
  const R = 6371; // km
  const dLat = toRad(lat2-lat1);
  const dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)*Math.sin(dLon/2);
  const c = 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R*c;
}

// Highlight and open info windows for the nearest N providers to a given location
function showNearestProviders(lat, lng, count=5){
  if(!providers || providers.length===0) return;
  // compute distances
  const list = providers.map(p=>{
    const plat = Number(p.lat); const plng = Number(p.lng);
    const d = isFinite(plat) && isFinite(plng) ? haversineKm(lat,lng,plat,plng) : Infinity;
    return {...p, _distance_km: d};
  }).sort((a,b)=>a._distance_km - b._distance_km);

  // clear previous animations/infowindows
  providers.forEach(p=>{ try{ if(p._marker) p._marker.setAnimation(null); if(p._info) p._info.close(); }catch(e){} });

  const nearest = list.slice(0,count);
  // open info windows and bounce or highlight markers
  const bounds = new google.maps.LatLngBounds();
  nearest.forEach((p,idx)=>{
    if(p._marker){
      try{ p._info.open(map, p._marker); p._marker.setAnimation(google.maps.Animation.DROP); }catch(e){}
      bounds.extend(p._marker.getPosition());
    }
  });

  // include user's location in bounds
  try{ bounds.extend(new google.maps.LatLng(lat,lng)); map.fitBounds(bounds, 80); }catch(e){ /* ignore */ }
  showMessage(`Showing ${nearest.length} nearest providers (within ${Math.round(nearest[nearest.length-1]._distance_km)} km)`);
}

function openRequestModalForProvider(provider){
  // Always show the inline request card as a popup-like panel when clicking a provider
  const card = $('inlineRequestCard');
  if(card){
    // Ensure dashboard visible (in case SPA is on another page)
    try{
      const md = document.getElementById('mainDashboard');
      const pc = document.getElementById('pageContent');
      if(pc) pc.classList.add('hidden');
      if(md) md.classList.remove('hidden');
      try{ history.replaceState(null, '', 'index.html'); }catch(e){}
    }catch(e){}

    // Remove backdrop usage for side popup variant (keep code path lightweight)

    card.classList.remove('hidden');
    $('inlineProviderInfo').innerHTML = `<p><strong>${provider.name}</strong><br/>Services: ${provider.services}</p>`;
    const serv = provider.services && provider.services.split('|')[0];
    if(serv) $('inlineReqService').value = serv;
    const summary = buildJobSummaryText();
    $('inlineReqNotes').value = `Requesting ${$('serviceSelect').value} for ${summary}`;
    // prefill datetime to near future
    const dt = new Date(Date.now() + 24*3600*1000); // +1 day
    $('inlineReqDatetime').value = dt.toISOString().slice(0,16);
    // remember provider id on the card
    card.dataset.providerId = provider.id;
    // ensure the card is in view
    try{ card.scrollIntoView({behavior:'smooth', block:'center'}); }catch(e){}
  }
}

function submitInlineRequest(){
  const providerId = $('inlineRequestCard').dataset.providerId || pendingProviderId || 'unknown';
  const booking = {
    id:'b-'+Date.now(),
    userName: $('contactName') ? $('contactName').value || 'Demo User' : 'Demo User',
    userEmail: $('contactEmail') ? $('contactEmail').value || '' : '',
    providerId,
    service: $('inlineReqService') ? $('inlineReqService').value : ($('reqService')?$('reqService').value:'SIT'),
    datetime: $('inlineReqDatetime') ? $('inlineReqDatetime').value : new Date().toISOString(),
    notes: $('inlineReqNotes') ? $('inlineReqNotes').value : '',
    status: 'requested',
    createdAt: new Date().toISOString()
  };
  try{ booking.inputs = collectJobInputs(); booking.outputs = computeSustainability(booking.inputs); }catch(e){}
  saveBooking(booking);
  $('inlineRequestCard').classList.add('hidden');
  pendingProviderId = null; if(document.getElementById('pendingProviderId')) document.getElementById('pendingProviderId').value='';
  refreshUI();
  showMessage('Order placed — we will contact you to confirm scheduling.');
  try{ location.hash = '#orders'; }catch(e){}
}

function openRequestCardFromForm(){
  const card = $('inlineRequestCard');
  if(!card) return;
  // Side-of-form display: ensure it's positioned relative to form column
  try{
    const formCol = document.querySelector('.form-col');
    if(formCol){
      formCol.style.position = 'relative';
      card.style.position = 'absolute';
      card.style.top = '12px';
      card.style.right = '-10px';
      card.style.left = 'auto';
      card.style.transform = 'none';
    }
  }catch(e){}
  // Populate provider info generically if no provider selected
  const prov = providers && providers.length ? providers[0] : {name:'Provider TBD',services:'SIT|Irradiation'};
  $('inlineProviderInfo').innerHTML = `<p><strong>${prov.name}</strong><br/>Services: ${prov.services}</p>`;
  const serv = $('serviceSelect') ? $('serviceSelect').value : 'SIT';
  if($('inlineReqService')) $('inlineReqService').value = serv;
  const summary = buildJobSummaryText();
  $('inlineReqNotes').value = `Requesting ${serv} for ${summary}`;
  const dt = new Date(Date.now() + 24*3600*1000); // +1 day
  $('inlineReqDatetime').value = dt.toISOString().slice(0,16);
  card.dataset.providerId = prov.id || prov.name || 'unknown';
  card.classList.remove('hidden');
}

function requiredKeyInputsFilled(){
  // Relaxed gating: do not require contact fields (they may be hidden in this build)
  // required: sizeInput (>0), pesticideInput (>=0), lossInput (>=0), pestInput (non-empty), address chosen
  const contact = true; // optional in this build
  const size = Number($('sizeInput')&&$('sizeInput').value || 0);
  const pesticide = $('pesticideInput') && $('pesticideInput').value !== '';
  const loss = $('lossInput') && $('lossInput').value !== '';
  const pest = getPestValue() || '';
  const hasAddress = userMarker && userMarker.lat && userMarker.lng;
  return contact && size>0 && pesticide && loss && pest && hasAddress;
}

function buildJobSummaryText(){
  const contact = $('contactName')?$('contactName').value:'';
  const service = $('serviceSelect')?$('serviceSelect').value:'';
  const size = $('sizeInput')?$('sizeInput').value:'';
  const unit = $('sizeUnit')?$('sizeUnit').value:'';
  const pest = getPestValue() || '';
  const pesticideNames = getPesticideNames();
  const address = userMarker && userMarker.address?userMarker.address:'(no address)';
  let summary = `${contact} — ${service} on ${size} ${unit} targeting ${pest} at ${address}`;
  if(pesticideNames) summary += ` — pesticides: ${pesticideNames}`;
  return summary;
}

// Small utility to escape HTML for simple string interpolation into innerHTML
function escapeHtml(s){ if(!s && s!=='') return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

/* ---------- CSV parser (very small) ---------- */
function parseCSV(txt){
  const lines = txt.trim().split(/\r?\n/).filter(l=>l.trim());
  const header = lines.shift().split(',').map(h=>h.trim());
  return lines.map((ln,idx)=>{
    const parts = ln.split(',').map(p=>p.trim());
    const obj = {};
    header.forEach((h,i)=>obj[h]=parts[i]||'');
    // ensure id
    if(!obj.id) obj.id = 'p-'+(idx+1);
    return obj;
  });
}

/* ---------- Charts & visualizations (Chart.js) ---------- */
function initCharts(){
  const lineCtx = document.getElementById('lineChart').getContext('2d');
  const barCtx = document.getElementById('barChart').getContext('2d');
  const areaCtx = document.getElementById('areaChart').getContext('2d');
  const pieCtx = document.getElementById('pieChart').getContext('2d');

  lineChart = new Chart(lineCtx, {type:'line',data:{labels:[],datasets:[{label:'CO2 avoided (t)',data:[],borderColor:'#2b7a78',backgroundColor:'rgba(43,122,120,0.1)',fill:true}]},options:{responsive:true,maintainAspectRatio:false}});
  barChart = new Chart(barCtx, {type:'bar',data:{labels:[],datasets:[{label:'Pesticide reduced (lbs)',data:[],backgroundColor:'#60a5fa'}]},options:{responsive:true,maintainAspectRatio:false}});
  areaChart = new Chart(areaCtx, {type:'line',data:{labels:[],datasets:[{label:'Water saved (L)',data:[],backgroundColor:'rgba(99,102,241,0.2)',borderColor:'#6366f1',fill:true}]},options:{responsive:true,maintainAspectRatio:false}});
  pieChart = new Chart(pieCtx, {type:'pie',data:{labels:['CO2','Water','Cost'],datasets:[{data:[1,1,1],backgroundColor:['#2b7a78','#60a5fa','#fb7185']}]},options:{responsive:true,maintainAspectRatio:false}});
}

// mini charts removed per user request

function aggregateForFilters(filters){
  // Filters: {region,years,scenario}
  const years = Number(filters.years||5);
  const scenario = Number(filters.scenario||50)/100.0;
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - years + 1;

  // construct time series per year for selected region(s)
  const times = [];
  for(let y=startYear;y<=currentYear;y++){
    let totalPesticideReduced_lbs = 0;
    let totalCO2 = 0;
    let totalWater = 0;
    let totalCost = 0;
    regionSeeds.forEach(r=>{
      if(filters.region && filters.region!=='All' && r.region!==filters.region) return;
      // simulate a small trend: basePesticide * (1 + trend)^(y-start)
      const trend = 0.01; // 1% annual
      const yearsAgo = currentYear - y;
      const base_lbs = r.basePesticide * Math.pow(1+trend, -yearsAgo); // interpret as lbs/year
      const pesticideReduced_lbs = base_lbs * scenario; // simple model
      const pesticideReduced_kg = pesticideReduced_lbs * 0.45359237;
      const co2 = (pesticideReduced_kg * 1.6) / 1000.0; // t
      const water = pesticideReduced_kg * 10; // L
      const cost = pesticideReduced_kg * 10; // $ (placeholder per-kg basis)
      totalPesticideReduced_lbs += pesticideReduced_lbs;
      totalCO2 += co2;
      totalWater += water;
      totalCost += cost;
    });
    times.push({year:y,pesticideReduced:Math.round(totalPesticideReduced_lbs),co2:round(totalCO2,3),water:Math.round(totalWater),cost:Math.round(totalCost)});
  }
  return times;
}

function updateCharts(){
  const region = $('vizRegion') ? $('vizRegion').value : 'All';
  const scenario = $('vizScenario') ? $('vizScenario').value : '50';
  const years = $('vizYears') ? $('vizYears').value : '5';
  const filters = {region,scenario,years};
  const series = aggregateForFilters(filters);

  // line chart (CO2 over years)
  const labels = series.map(s=>s.year.toString());
  const co2data = series.map(s=>s.co2);
  lineChart.data.labels = labels; lineChart.data.datasets[0].data = co2data; lineChart.update();

  // bar chart (last-year pesticide by region)
  const last = series[series.length-1];
  const barLabels = [];
  const barData = [];
  regionSeeds.forEach(r=>{ if(region==='All' || region===r.region){ barLabels.push(r.region); const val = Math.round(r.basePesticide * (Number(scenario)/100.0)); barData.push(val);} });
  barChart.data.labels = barLabels; barChart.data.datasets[0].data = barData; barChart.update();

  // area chart (water saved over years cumulative)
  const waterCum = []; let acc=0; series.forEach(s=>{ acc += s.water; waterCum.push(acc); });
  areaChart.data.labels = labels; areaChart.data.datasets[0].data = waterCum; areaChart.update();

  // pie chart (latest distribution)
  const latest = series[series.length-1];
  const pieData = [latest.co2, latest.water, latest.cost];
  pieChart.data.datasets[0].data = pieData; pieChart.update();

  // update top metric cards using latest
  try{
  $('metricPesticide').textContent = `${series[series.length-1].pesticideReduced} lbs / yr`;
    $('metricCO2').textContent = `${series[series.length-1].co2} t / yr`;
    $('metricWater').textContent = `${series[series.length-1].water} L / yr`;
    $('metricCost').textContent = `$${series[series.length-1].cost} / yr`;
  }catch(e){}
}

/* ---------- Request modal handling / bookings ---------- */
// submitRequestModal removed (inline request card replaces modal)

function saveBooking(b){
  const raw = localStorage.getItem(STORAGE_KEYS.BOOKINGS);
  const arr = raw ? JSON.parse(raw) : [];
  arr.push(b);
  localStorage.setItem(STORAGE_KEYS.BOOKINGS, JSON.stringify(arr));
}

function getBookings(){
  const raw = localStorage.getItem(STORAGE_KEYS.BOOKINGS);
  return raw ? JSON.parse(raw) : [];
}

/* ---------- New Job form -> schedule flow (client-only demo) ---------- */
function requestSlotFromForm(){
  // For demo we will create a booking using the job form inputs and the nearest provider (first in providers list)
  const service = $('serviceSelect').value;
  const contactName = $('contactName') ? $('contactName').value || 'Demo User' : 'Demo User';
  const contactEmail = $('contactEmail') ? $('contactEmail').value || '' : '';
  const size = Number($('sizeInput').value || 0);
  const pesticide = Number($('pesticideInput').value || 0);
  const loss = Number($('lossInput').value || 0);
  const pest = getPestValue();
  const reduction = Number($('expectedReduction').value || 50);

  // pick provider: if pendingProviderId is set, use that; otherwise fallback to first provider
  const chosenProviderId = pendingProviderId || (document.getElementById('pendingProviderId') && document.getElementById('pendingProviderId').value) || null;
  let provider = null;
  if(chosenProviderId){ provider = providers.find(p=>p.id===chosenProviderId) || null; }
  if(!provider) provider = providers[0] || {id:'p-demo',name:'Demo Provider'};
  const booking = {
    id:'b-'+Date.now(),
    userName: contactName,
    userEmail: contactEmail,
    providerId: provider.id,
    service, datetime: new Date().toISOString(), status:'requested', notes:`job form: pest=${pest}, size=${size}`
  };
  saveBooking(booking);
  // also immediately compute and show a report snapshot
  const inputs = collectJobInputs();
  const outputs = computeSustainability(inputs);
  // attach outputs to booking so refreshUI can pick them up
  try{ booking.inputs = inputs; booking.outputs = outputs; }catch(e){}
  renderReport(outputs, inputs);
  // update top metrics immediately
  updateTopMetricsFromOutputs(outputs);
  // save a simple report to localStorage reports array (optional)
  showMessage('Order placed — we will contact you to confirm scheduling.');
  try{ location.hash = '#orders'; }catch(e){}
  // keep the form visible; just clear pending provider after request
  // clear pending provider
  pendingProviderId = null; if(document.getElementById('pendingProviderId')) document.getElementById('pendingProviderId').value='';
  refreshUI();
}

function collectJobInputs(){
  // collect detailed inputs from form for computing outputs and saving with booking
  const size = Number($('sizeInput').value || 0);
  const unit = $('sizeUnit').value || '';
  const pesticide = Number($('pesticideInput').value || 0); // lbs/year from UI
  const pesticideCostYear = Number($('pesticideCostYear').value || 0);
  const loss = Number($('lossInput').value || 0);
  const pest = getPestValue() || '';
  const reduction = Number($('expectedReduction').value || 50);
  const climate = {temp: Number($('climateTemp').value||0), humidity: Number($('climateHum').value||0)};
  // also return structured selections for later use
  const pestTarget = $('pestTargetSelect') ? $('pestTargetSelect').value : ( $('pestInput') ? $('pestInput').value : '' );
  const foodTarget = $('foodTargetSelect') ? $('foodTargetSelect').value : '';
  const treatmentGoal = $('treatmentGoalSelect') ? $('treatmentGoalSelect').value : '';
  const pesticideNames = $('pesticideNames') ? $('pesticideNames').value.trim() : '';
  // Prefer select-based pesticide names (multi-select) if present
  const pesticideNamesFinal = getPesticideNames();
  return {size,unit,pesticide,pesticideCostYear,loss,pest,reduction,climate,pestTarget,foodTarget,treatmentGoal,pesticideNames:pesticideNamesFinal};
}

// Helper to read the pest/food type input whether it's a select or a free-text other field
function getPestValue(){
  // Prefer the structured selects if present. Build a concise summary string combining pest, food and treatment goal.
  const parts = [];
  const pestSel = $('pestTargetSelect');
  if(pestSel){ const v = pestSel.value || ''; if(v && v!=='Other') parts.push(v); if(v==='Other'){ const o = $('pestTargetOther'); if(o && o.value.trim()) parts.push(o.value.trim()); } }
  const foodSel = $('foodTargetSelect');
  if(foodSel){ const v = foodSel.value || ''; if(v && v!=='Other') parts.push(v); if(v==='Other'){ const o = $('foodTargetOther'); if(o && o.value.trim()) parts.push(o.value.trim()); } }
  const goalSel = $('treatmentGoalSelect');
  if(goalSel){ const v = goalSel.value || ''; if(v && v!=='Other') parts.push(v); if(v==='Other'){ const o = $('treatmentGoalOther'); if(o && o.value.trim()) parts.push(o.value.trim()); } }

  // fallback to legacy pestInput if present
  if(parts.length === 0){ const legacy = $('pestInput'); if(legacy){ const val = legacy.value || ''; if(val && val!=='Other') parts.push(val); if(val==='Other'){ const o = $('pestInputOther'); if(o && o.value.trim()) parts.push(o.value.trim()); } } }

  return parts.join(' — ');
}

// Read pesticide product names from the multi-select or legacy textarea
function getPesticideNames(){
  const sel = $('pesticideNamesSelect');
  if(sel){
    const v = sel.value || '';
    if(v && v !== 'Other') return v;
    if(v === 'Other'){ const o = $('pesticideNamesOther'); if(o && o.value.trim()) return o.value.trim(); }
  }
  // fallback to legacy textarea if present
  const legacy = $('pesticideNames'); if(legacy && legacy.value && legacy.value.trim()) return legacy.value.trim();
  return '';
}

/* ---------- Sustainability calculation (example) ---------- */
function computeSustainability(inputs){
  // Inputs: {pesticide (lbs/year user input), reduction (%), size, unit, loss, pesticideCostYear, ...}
  // Internally convert lbs -> kg for emission & water factors which remain kg-based.
  // Assumptions (simple demo):
  // - Emission factor for pesticide production & use: 1.6 kgCO2e per kg pesticide
  // - Water saved per kg pesticide avoided: 10 liters/kg (placeholder)
  const ef_co2_per_kg = 1.6; // kg CO2e per kg pesticide
  const water_per_kg = 10; // liters per kg

  const pesticide_lbs = Number(inputs.pesticide || 0); // lbs/year (UI)
  const pesticide_kg = pesticide_lbs * 0.45359237; // convert to kg/year
  const reduction_pct = Number(inputs.reduction || 50) / 100.0;
  const pesticide_reduced_kg = pesticide_kg * reduction_pct; // kg/year
  const co2_avoided_kg = pesticide_reduced_kg * ef_co2_per_kg; // kgCO2e/year
  const co2_avoided_t = co2_avoided_kg / 1000.0; // metric tons/year
  const water_saved_l = pesticide_reduced_kg * water_per_kg; // liters/year
  // cost savings: prefer user-provided pesticide cost/year; otherwise use placeholder $10 per kg-equivalent
  const cost_per_kg = inputs.cost_per_kg || 10;
  let cost_savings = 0;
  if(inputs.pesticideCostYear && inputs.pesticide>0){
    cost_savings = inputs.pesticideCostYear * reduction_pct;
  }else{
    cost_savings = pesticide_reduced_kg * cost_per_kg;
  }

  // food loss reduction (naive) logic unchanged
  const loss_pct = Number(inputs.loss || 0);
  const loss_reduction_pct = Math.min(25, loss_pct * 0.2 * reduction_pct);
  let loss_tonnes_avoided = null;
  if(inputs.unit === 'kg/month' && inputs.size){
    const annual_prod_kg = inputs.size * 12;
    loss_tonnes_avoided = (annual_prod_kg * (loss_pct/100) * (loss_reduction_pct/100)) / 1000.0;
    loss_tonnes_avoided = round(loss_tonnes_avoided,3);
  }

  const pesticide_reduced_lbs = pesticide_reduced_kg * 2.20462;

  return {
    pesticide_reduced_lbs: round(pesticide_reduced_lbs,2), // primary display unit
    pesticide_reduced_kg: round(pesticide_reduced_kg,2), // reference (internal)
    pesticide_reduced_pct: round(reduction_pct*100,1),
    co2_avoided_t: round(co2_avoided_t,3),
    co2_formula: `CO2 avoided (t/year) = pesticide_reduced_lbs × 0.453592 kg/lb × ${ef_co2_per_kg} kgCO2e/kg ÷ 1000`,
    water_saved_l: Math.round(water_saved_l),
    cost_savings: round(cost_savings,2),
    loss_reduction_pct: round(loss_reduction_pct,2),
    loss_tonnes_avoided,
    assumptions: {
      ef_co2_per_kg, water_per_kg, cost_per_kg
    }
  };
}

function round(n,dec=2){ return Math.round(n*Math.pow(10,dec))/Math.pow(10,dec); }

function previewReport(){
  const pesticide = Number($('pesticideInput').value || 0); // lbs/year
  const reduction = Number($('expectedReduction').value || 50);
  const loss = Number($('lossInput').value || 0);
  const inputs = {pesticide,reduction,loss};
  const outputs = computeSustainability(inputs);
  renderReport(outputs, inputs);
  // update top metrics so the dashboard reflects the preview
  updateTopMetricsFromOutputs(outputs);
  $('reportPreview').classList.remove('hidden');
}

// Update the top metrics row from a computed outputs object
function updateTopMetricsFromOutputs(outputs){
  try{
    // helper: format number with commas
    function fmt(n){ if(n===null||n===undefined||isNaN(n)) return '—'; if(Math.abs(n) >= 1000) return n.toLocaleString(); return String(n); }
    // animate helper: count up
    function animateNumber(el, endValue, unit=''){
      if(!el) return;
      const startText = el.textContent || '';
      const match = startText.replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);
      const start = match ? Number(match[0]) : 0;
      const duration = METRIC_ANIM_DURATION; // ms (configurable)
      const startTime = performance.now();
      const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
      const step = (now)=>{
        const t = Math.min(1, (now - startTime)/duration);
        const val = start + (endValue - start) * easeOutCubic(t);
        // choose decimals based on value
        const display = (Math.abs(endValue) < 1) ? val.toFixed(2) : (Math.abs(endValue) < 10 ? val.toFixed(2) : Math.round(val));
        el.textContent = `${fmt(Number(display))}${unit}`;
        if(t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      // flash effect
      el.classList.remove('metric-update-flash');
      // trigger reflow to restart animation
      void el.offsetWidth;
      el.classList.add('metric-update-flash');
      setTimeout(()=>{ el.classList.remove('metric-update-flash'); }, duration + 200);
    }

    // update each metric with animation
  if(outputs.pesticide_reduced_lbs !== undefined){ const el = $('metricPesticide'); if(el){ el.textContent='Calculating...'; setTimeout(()=>animateNumber(el, Number(outputs.pesticide_reduced_lbs), ' lbs / yr'), METRIC_ANIM_DELAY_MS); } }
  if(outputs.pesticide_reduced_pct !== undefined){ const el = $('metricPesticidePct'); if(el){ el.textContent='Calculating...'; setTimeout(()=>animateNumber(el, Number(outputs.pesticide_reduced_pct), '%'), METRIC_ANIM_DELAY_MS); } }
  if(outputs.co2_avoided_t !== undefined){ const el = $('metricCO2'); if(el){ el.textContent='Calculating...'; setTimeout(()=>animateNumber(el, Number(outputs.co2_avoided_t), ' t / yr'), METRIC_ANIM_DELAY_MS); } }
    if(outputs.co2_avoided_t !== undefined){ const el = $('metricCO2Delta'); const pct = outputs.pesticide_reduced_pct!==undefined ? `${outputs.pesticide_reduced_pct}% reduction` : 'Based on inputs'; el.textContent = `Based on inputs — ${pct}`; }
  if(outputs.water_saved_l !== undefined){ const el = $('metricWater'); if(el){ el.textContent='Calculating...'; setTimeout(()=>animateNumber(el, Number(outputs.water_saved_l), ' L / yr'), METRIC_ANIM_DELAY_MS); } }
  if(outputs.cost_savings !== undefined){ const el = $('metricCost'); if(el){ el.textContent='Calculating...'; setTimeout(()=>animateNumber(el, Number(outputs.cost_savings), ' / yr'), METRIC_ANIM_DELAY_MS); } }
  }catch(e){ console.warn('updateTopMetricsFromOutputs failed', e); }
}

function renderReport(outputs, inputs){
  const c = $('reportContent');
  c.innerHTML = `
    <h4>Snapshot</h4>
  <p><strong>Pesticide reduction:</strong> ${outputs.pesticide_reduced_lbs} lbs/year (${outputs.pesticide_reduced_pct}%)</p>
    <p><strong>CO₂ avoided:</strong> ${outputs.co2_avoided_t} metric tons/year</p>
    <p><strong>Water saved:</strong> ${outputs.water_saved_l} liters/year</p>
    <p><strong>Estimated annual cost savings:</strong> $${outputs.cost_savings}</p>
    <p><strong>Food loss reduction (qualitative):</strong> ${outputs.loss_reduction_pct}% projected improvement</p>
    <p><strong>Food loss tonnes avoided (if production provided as kg/month):</strong> ${outputs.loss_tonnes_avoided !== null ? outputs.loss_tonnes_avoided + ' t/year' : 'N/A (provide size in kg/month to estimate tonnes)'}</p>
    <details>
      <summary>How we calculate (click to expand)</summary>
      <pre>${outputs.co2_formula}\nAssumptions: emission factor ${outputs.assumptions.ef_co2_per_kg} kgCO2e/kg pesticide, water ${outputs.assumptions.water_per_kg} L/kg, cost $${outputs.assumptions.cost_per_kg}/kg.
Notes: Food loss tonnes require production in kg/month. These are demo estimates; replace with domain-sourced factors for accuracy.</pre>
    </details>
  `;
}

/* ---------- Small UI helpers ---------- */
function refreshUI(){
  // Demo mode: no sign-in
  // Update header/profile area (we removed profile card)
  // Update metrics summary if there's a recent report in localStorage
  const bookings = getBookings();
  const latest = bookings.length ? bookings[bookings.length-1] : null;
  if(latest && latest.outputs){
    // populate metric cards
    try{
  $('metricPesticide').textContent = `${latest.outputs.pesticide_reduced_lbs || (latest.outputs.pesticide_reduced_kg*2.20462)} lbs / yr`;
      $('metricPesticidePct').textContent = `${latest.outputs.pesticide_reduced_pct}%`;
      $('metricCO2').textContent = `${latest.outputs.co2_avoided_t} t / yr`;
      $('metricWater').textContent = `${latest.outputs.water_saved_l} L / yr`;
      $('metricCost').textContent = `$${latest.outputs.cost_savings} / yr`;
    }catch(e){}
  }
}

    // Data Set button: show the page content / dataset area
    const datasetBtn = document.getElementById('datasetBtn');
    if(datasetBtn){
      datasetBtn.addEventListener('click', (ev)=>{
        try{
          ev.preventDefault();
          // set active (query fresh nav links in case of scope differences)
          const navLinksLocal = document.querySelectorAll('.side-nav a[data-page]');
          navLinksLocal.forEach(n=>n.classList.remove('active'));
          datasetBtn.classList.add('active');
          // restore panel
          const sidebarLocal = document.getElementById('sideMenu');
          if(sidebarLocal){ sidebarLocal.classList.remove('collapsed'); sidebarLocal.classList.remove('minimized'); sidebarLocal.classList.remove('closed'); }
          // scroll to pageContent (where dataset UI would appear)
          const page = document.getElementById('pageContent') || document.body;
          page.scrollIntoView({behavior:'smooth'});
          // set URL hash for deep-linking
          try{ history.replaceState(null, '', '#dataset'); }catch(e){}
        }catch(err){ console.warn('datasetBtn click failed', err); }
      });
    }

/* ---------- Utility: load providers.csv has been added to root; sample CSV format: id,name,lat,lng,services,contact */

/* ---------- bootstrap on DOM ready ---------- */
document.addEventListener('DOMContentLoaded', ()=>{
  initControls();
  // initMap will be called by Google Maps callback (initMap)
  // Wire side menu links to load placeholder pages
  try{
    const links = document.querySelectorAll('#sideMenu a[data-page]');

    // When a sidebar link is clicked, update the hash. Hash handler will drive UI changes.
    links.forEach(a=>{
      a.addEventListener('click', (e)=>{
        e.preventDefault();
        const page = a.dataset.page;
        // set the hash which triggers navigation handling
        if(page) location.hash = `#${page}`;
      });
    });

    // Hash-based navigation handler
    const handleHash = ()=>{
      const h = (location.hash||'').replace('#','');
      const pc = document.getElementById('pageContent');
      const md = document.getElementById('mainDashboard');
      // clear previous active
      links.forEach(x=>x.classList.remove('active'));
      if(!h || h==='home'){
        // show dashboard
        if(md) md.classList.remove('hidden');
        if(pc){ pc.classList.add('hidden'); pc.innerHTML = ''; try{ pc.scrollTop = 0; }catch(e){} }
        window.scrollTo({top:0,behavior:'smooth'});
        return;
      }
      // show requested page in pageContent
      if(pc) pc.classList.remove('hidden');
      if(md) md.classList.add('hidden');
      // mark active link
      const targetLink = document.querySelector(`#sideMenu a[data-page="${h}"]`);
      if(targetLink) targetLink.classList.add('active');
      // load content
      try{ loadSidePage(h); }catch(e){ console.warn('loadSidePage failed', e); }
    };

    // listen to hash changes and handle initial hash
    window.addEventListener('hashchange', handleHash);
    handleHash();

    // ensure brand/logo forces return to dashboard (use hash so handler runs)
    try{
      const brandEl = document.querySelector('.brand');
      if(brandEl){
        brandEl.addEventListener('click', (e)=>{ e.preventDefault(); location.hash = '#home'; });
      }
    }catch(e){}
  }catch(e){}
});

function loadSidePage(key){
  const pc = document.getElementById('pageContent'); if(!pc) return;
  let html = '';
  if(key==='dataset'){
    html = `<h3 class="text-lg font-semibold text-green-700">Data Set used</h3><p class="mt-2 text-sm text-gray-700">This demo uses a seeded <code>providers.csv</code> with sample provider coordinates. Replace with your authoritative datasets (USDA, FAOSTAT) for production. Files available: <a href="providers.csv" target="_blank">providers.csv</a>.</p>`;
  } else if(key==='api'){
    // load detailed API page fragment from api.html (keeps content in one place)
    fetch('api.html').then(r=>{
      if(!r.ok) throw new Error('Failed to load api.html');
      return r.text();
    }).then(t=>{
      // parse the returned HTML and extract a sensible content fragment (prefer .center)
      try{
        const tmp = document.createElement('div'); tmp.innerHTML = t;
        const frag = tmp.querySelector('.center') || tmp.querySelector('main') || tmp;
        pc.innerHTML = frag ? frag.innerHTML : t;
      }catch(e){ pc.innerHTML = t; }
    }).catch(err=>{
      console.warn('Could not load api.html', err);
      html = `<h3 class="text-lg font-semibold text-green-700">API</h3><p class="mt-2 text-sm text-gray-700">The demo uses Google Maps Places API for location and Chart.js for client-side charts. In production, connect to a backend to persist bookings (Firestore / REST). Remember to restrict API keys by HTTP referrer.</p>`;
      pc.innerHTML = `<div class="p-4">${html}</div>`;
    });
    return;
  } else if(key==='formula'){
    html = `<h3 class="text-lg font-semibold text-green-700">Formula</h3><p class="mt-2 text-sm text-gray-700">Key formulas used in this demo:<ul><li>Pesticide avoided (lbs) = acres × baseline_lbs_per_acre × SIT_reduction%</li><li>GHG avoided (t) = pesticide_avoided_lbs × 5 kg CO2e/lb ÷ 1000</li><li>Water saved (gal) = acres × 3 cycles × 200 gal</li><li>Food saved (tons) = production_tons × baseline_loss% × irradiation_shelf_improvement%</li></ul></p>`;
  } else if(key==='orders'){
    // render simple Orders page pulling bookings from localStorage
    const bookings = getBookings();
    if(!bookings || bookings.length===0){
      html = `<h3 class="text-lg font-semibold text-green-700">Orders</h3><p class="mt-2 text-sm text-gray-700">You have not placed any orders yet.</p>`;
    } else {
      const rows = bookings.slice().reverse().map(b=>{
        const prov = providers.find(p=>p.id===b.providerId) || {};
        const created = b.createdAt ? new Date(b.createdAt).toLocaleString() : '';
        const when = b.datetime ? (new Date(b.datetime).toLocaleString()) : '';
        const inputs = b.inputs ? b.inputs : {};
        const pesticideNames = inputs.pesticideNames || '';
        const pestDesc = inputs.pest || '';
        const pestTarget = inputs.pestTarget || '';
        const foodTarget = inputs.foodTarget || '';
        const treatmentGoal = inputs.treatmentGoal || '';
        return `
          <div class="card order-row" style="margin-bottom:12px;padding:12px;border:1px solid #e6f4ea;border-radius:8px;background:#ffffff;">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div><strong>Order ${b.id}</strong> — <span style="color:#374151">${b.service}</span></div>
              <div style="font-size:0.9rem;color:#6b7280">${created}</div>
            </div>
            <div style="margin-top:8px">
              <div><strong>Provider:</strong> ${prov.name || b.providerId}</div>
              <div><strong>Requested for:</strong> ${when}</div>
              <div><strong>Status:</strong> ${b.status || 'requested'}</div>
              <div><strong>Summary:</strong> ${b.notes || buildJobSummaryText()}</div>
            </div>
            <div style="margin-top:8px;font-size:0.9rem;color:#374151">
              ${pestTarget ? `<div><strong>Pest target:</strong> ${pestTarget}</div>` : ''}
              ${foodTarget ? `<div><strong>Food type:</strong> ${foodTarget}</div>` : ''}
              ${treatmentGoal ? `<div><strong>Treatment goal:</strong> ${treatmentGoal}</div>` : ''}
              ${pesticideNames ? `<div><strong>Current pesticides:</strong> ${escapeHtml(pesticideNames)}</div>` : ''}
            </div>
            <div style="margin-top:10px;color:#065f46;font-weight:600">We'll contact you to confirm scheduling and next steps.</div>
          </div>`;
      }).join('\n');
      html = `<h3 class="text-lg font-semibold text-green-700">Orders</h3><p class="mt-2 text-sm text-gray-700">Below are your requested orders (most recent first):</p><div style="margin-top:12px">${rows}</div>`;
    }
  } else if(key==='reports'){
    html = `<h3 class="text-lg font-semibold text-green-700">Reports</h3><p class="mt-2 text-sm text-gray-700">You can generate ESG PDFs from the Sustainability Impact panel. Reports include summary metrics and the two charts. For richer exports, consider server-side PDF generation.</p>`;
  } else if(key==='settings'){
    html = `<h3 class="text-lg font-semibold text-green-700">Settings</h3><p class="mt-2 text-sm text-gray-700">Settings placeholder: add API keys, default assumption values, and theme options here.</p>`;
  } else html = `<h3>Page</h3><p>Not implemented</p>`;
  pc.innerHTML = `<div class="p-4">${html}</div>`;
  // add small fade animation
  pc.classList.remove('page-fade');
  void pc.offsetWidth; // force reflow
  pc.classList.add('page-fade');
}

/* Expose initMap globally for Google Maps callback */
window.initMap = initMap;
