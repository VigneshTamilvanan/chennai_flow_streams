// ============================================================
// IllamAI — Smart Property Decision Tool
// app.js — Core application logic
// ============================================================

const App = (() => {

  // ── State ──────────────────────────────────────────────────
  const state = {
    map: null,
    userPersona: null,         // filled after onboarding
    selectedZone: null,
    zoneMarkers: {},           // id → leaflet marker
    streamLayer: null,
    demLayer: null,
    substreamsLayer: null,
    searchTimeout: null,
    facilitiesCache: {},       // zone_id → facilities data
    recommendations: [],
    layerPanelOpen: false,
    // Drop-a-pin
    pinMode: false,
    pinMarker: null,
    pinBuffer: null,
    pinMask: null,        // unused (kept for safety)
    _bufferClipUpdate: null,
    _pinData: null,
    _layerSnapshot: null, // toggle states saved on pin-drop; restored on clear
    // OSM locality layer
    localityLayer: null,
    // Metro layer (split by line)
    metroLayers: {},  // id → L.layerGroup per line
    // Employment hotspot layer
    employmentLayer: null,
    // Road layers
    orrLayer: null,
    irrLayer: null,
    nhLayer: null,
    suburbanLayer: null,
    busTerminusLayer: null,
    // Transit station data for nearest-transit lookups
    metroStations: [],    // [{name, lat, lng, phase}]
    suburbStations: [],   // [{name, lat, lng}]
    busTermini: [],       // [{name, lat, lng}]
    // Custom work location (from survey text input)
    customWorkLoc: null,  // { lat, lng, name }
    // Work location map marker (shown after survey, removed on retake)
    workMarker: null,
    // Top Picks sort mode: 'score' | 'commute' | 'price'
    recoSort: 'score',
    // Basemap tile layers for switcher
    baseLayers: {},
    activeBasemap: 'hybrid',
  };

  // ── Haversine travel-time helper ───────────────────────────
  // Returns estimated one-way commute in minutes.
  // Uses haversine straight-line distance × 1.35 road-factor
  // then divides by Chennai urban avg speed (20 km/h peak).
  function commuteMinutes(lat1, lng1, lat2, lng2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;
    const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const roadKm = distKm * 1.35;   // straight-line → road distance factor
    const speedKmh = 20;            // Chennai peak-hour average
    return Math.round(roadKm / speedKmh * 60);
  }

  // Straight-line km between two coords
  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Estimate travel time to a transit stop (walk ≤1.5km, else auto)
  function transitMinutes(km) {
    const roadKm = km * 1.35;
    return km <= 1.5
      ? Math.round(roadKm / 5 * 60)   // walking 5 km/h
      : Math.round(roadKm / 20 * 60); // auto 20 km/h
  }

  // Major intercity bus terminals — always shown as reference points
  const MAJOR_BUS_HUBS = [
    { name: 'Koyambedu CMBT', lat: 13.0694, lng: 80.1948 },
    { name: 'Kilambakkam', lat: 12.8635, lng: 80.0698 },
  ];

  // Major train terminals — always shown as reference distances
  const MAJOR_TRAIN_TERMINALS = [
    { name: 'Chennai Central', lat: 13.0827, lng: 80.2707 },
    { name: 'Chennai Egmore',  lat: 13.0784, lng: 80.2621 },
    { name: 'Tambaram',        lat: 12.9252, lng: 80.1273 },
  ];

  // Employment hotspot clusters (IT, Manufacturing, Govt)
  const EMPLOYMENT_HOTSPOTS = [
    // IT Clusters
    { id: 'omr-it',           name: 'OMR IT Corridor',            type: 'IT',            lat: 12.9200, lng: 80.2280, desc: 'DLF, Olympia, Ascendas — 200k+ IT jobs' },
    { id: 'tidel-park',       name: 'Tidel Park',                  type: 'IT',            lat: 12.9912, lng: 80.2489, desc: 'STPI IT Park, 15,000+ employees' },
    { id: 'perungudi-it',     name: 'Perungudi IT Zone',           type: 'IT',            lat: 12.9620, lng: 80.2460, desc: 'Infosys, HCL, Cognizant campuses' },
    { id: 'sholinganallur-it',name: 'Sholinganallur IT Hub',       type: 'IT',            lat: 12.9008, lng: 80.2278, desc: 'Amazon, Google, TCS campuses' },
    { id: 'ambattur-it',      name: 'Ambattur IT Park (ELNET)',    type: 'IT',            lat: 13.1100, lng: 80.1640, desc: 'ELNET Software City, Wipro campus' },
    { id: 'sriperumbudur-tech',name: 'Sriperumbudur Tech Corridor',type: 'IT',            lat: 12.9674, lng: 79.9460, desc: 'Nokia, Foxconn tech manufacturing' },
    // Manufacturing
    { id: 'ambattur-sidco',   name: 'Ambattur SIDCO Estate',       type: 'Manufacturing', lat: 13.1143, lng: 80.1548, desc: 'Largest industrial estate in TN, 1000+ units' },
    { id: 'guindy-industrial', name: 'Guindy Industrial Estate',   type: 'Manufacturing', lat: 13.0050, lng: 80.2080, desc: 'SIPCOT auto-parts & light engineering' },
    { id: 'manali-petrochem', name: 'Manali Petrochem Zone',       type: 'Manufacturing', lat: 13.1700, lng: 80.2580, desc: 'SPIC, HPCL, Chennai Petroleum refinery' },
    { id: 'mepz-tambaram',    name: 'MEPZ (Tambaram)',             type: 'Manufacturing', lat: 12.9700, lng: 80.1480, desc: 'Multi-product export processing zone' },
    { id: 'sriperumbudur-sez', name: 'Sriperumbudur SEZ',          type: 'Manufacturing', lat: 12.9800, lng: 79.9300, desc: 'Hyundai, BMW, Royal Enfield plants' },
    { id: 'redhills-industrial',name: 'Red Hills Industrial Area', type: 'Manufacturing', lat: 13.1900, lng: 80.1800, desc: 'Chemicals, textiles, SME manufacturing units' },
    // Government / Services
    { id: 'secretariat',      name: 'Secretariat (Fort St George)', type: 'Govt',         lat: 13.0808, lng: 80.2836, desc: 'Tamil Nadu State Secretariat, High Court' },
    { id: 'dms-campus',       name: 'Govt Hospital / DMS Area',    type: 'Govt',          lat: 13.0688, lng: 80.2583, desc: 'Directorate of Medical Services, Stanley Hospital' },
    { id: 'anna-salai-offices',name: 'Anna Salai Offices',         type: 'Govt',          lat: 13.0500, lng: 80.2450, desc: 'LIC, nationalised banks, insurance HQs' },
    { id: 'rajaji-bhavan',    name: 'Rajaji Bhavan (Besant Nagar)', type: 'Govt',         lat: 12.9980, lng: 80.2590, desc: 'Central Govt complex — Income Tax, DOPT' },
    { id: 'cmda-offices',     name: 'CMDA / Planning Zone',        type: 'Govt',          lat: 13.0680, lng: 80.2760, desc: 'CMDA, CMWSSB, government authorities cluster' },
  ];

  const EMPLOYMENT_STYLE = {
    IT:            { color: '#2563eb', fillColor: '#3b82f6', label: '💻', title: 'IT / Tech' },
    Manufacturing: { color: '#c2410c', fillColor: '#f97316', label: '🏭', title: 'Manufacturing' },
    Govt:          { color: '#15803d', fillColor: '#22c55e', label: '🏛️', title: 'Govt / Service' },
  };

  function loadEmploymentLayer() {
    const group = L.layerGroup();
    EMPLOYMENT_HOTSPOTS.forEach(spot => {
      const style = EMPLOYMENT_STYLE[spot.type] || EMPLOYMENT_STYLE.IT;
      const marker = L.circleMarker([spot.lat, spot.lng], {
        radius: 9,
        color: style.color,
        fillColor: style.fillColor,
        fillOpacity: 0.88,
        weight: 2,
      });
      marker.bindTooltip(
        `<span style="font-size:13px">${style.label}</span> <strong>${spot.name}</strong><br><span style="font-size:11px;color:#6b7280">${spot.desc}</span>`,
        { direction: 'top', maxWidth: 220 }
      );
      marker.addTo(group);
    });
    state.employmentLayer = group;
  }

  // Find nearest transit stop of each type for a given lat/lng
  function findNearestTransit(lat, lng) {
    function nearestInList(list) {
      let best = null, bestKm = Infinity;
      list.forEach(s => {
        const km = haversineKm(lat, lng, s.lat, s.lng);
        if (km < bestKm) { bestKm = km; best = { ...s, km }; }
      });
      return best ? { ...best, minutes: transitMinutes(best.km) } : null;
    }
    const busHubs = MAJOR_BUS_HUBS.map(h => {
      const km = haversineKm(lat, lng, h.lat, h.lng);
      return { ...h, km, minutes: transitMinutes(km) };
    });
    const trainHubs = MAJOR_TRAIN_TERMINALS.map(t => {
      const km = haversineKm(lat, lng, t.lat, t.lng);
      return { ...t, km, minutes: transitMinutes(km) };
    }).sort((a, b) => a.km - b.km);
    return {
      metro: nearestInList(state.metroStations),
      suburban: nearestInList(state.suburbStations),
      busNearest: nearestInList(state.busTermini),
      busHubs,
      trainHubs,
    };
  }

  // Pre-compute commute minutes from each zone to each work hub
  function getCommute(zone, workKey, customLat, customLng) {
    if (workKey === 'custom' && customLat != null) {
      return commuteMinutes(zone.lat, zone.lng, customLat, customLng);
    }
    const hub = typeof WORK_ZONES !== 'undefined' && WORK_ZONES[workKey];
    if (!hub) return zone.commute?.[workKey] ?? null;
    return commuteMinutes(zone.lat, zone.lng, hub.lat, hub.lng);
  }

  // ── Onboarding ─────────────────────────────────────────────
  const OB_STEPS = [
    {
      q: "Where do you work?",
      key: "work",
      hasLocationSearch: true,
      options: [
        { icon: "💻", label: "IT / Tech", sub: "OMR, Tidel, Sholinganallur", val: "omr" },
        { icon: "🏭", label: "Manufacturing", sub: "Ambattur, Sriperumbudur, Guindy", val: "ambattur" },
        { icon: "🏛️", label: "Government", sub: "Secretariat, DMS, Central", val: "central" },
        { icon: "🏠", label: "WFH / Freelance", sub: "Location flexibility", val: "wfh" },
        { icon: "✈️", label: "Airport area", sub: "Pallavaram, Chromepet, Guindy", val: "airport" },
        { icon: "📦", label: "Other / NA", sub: "", val: "other" },
      ]
    },
    {
      q: "Who's moving in?",
      key: "family",
      options: [
        { icon: "🧑", label: "Just me", sub: "Single professional", val: "single" },
        { icon: "👫", label: "Couple", sub: "No kids yet", val: "couple" },
        { icon: "👨‍👩‍👧", label: "Family + Kids", sub: "School proximity matters", val: "family" },
        { icon: "👴", label: "Retired / Elderly", sub: "Peaceful, safe area", val: "retired" },
        { icon: "📈", label: "Investment", sub: "Rental / resale", val: "investment" },
      ]
    },
    {
      q: "Max commute time you're comfortable with?",
      key: "commute_tolerance",
      options: [
        { icon: "⚡", label: "Under 20 min", sub: "Live close to work", val: "under-20" },
        { icon: "🚶", label: "20 – 40 min", sub: "Short commute", val: "20-40" },
        { icon: "🚌", label: "40 – 60 min", sub: "Acceptable if area is good", val: "40-60" },
        { icon: "🕐", label: "Over 60 min", sub: "Commute is not a priority", val: "over-60" },
      ]
    },
    {
      q: "What's your top priority?",
      key: "priority",
      options: [
        { icon: "🌊", label: "Flood Safety", sub: "I remember 2015", val: "flood-safe" },
        { icon: "💰", label: "Best Price", sub: "Value for money", val: "affordable" },
        { icon: "🚇", label: "Metro Access", sub: "Daily commute matters", val: "metro" },
        { icon: "🏫", label: "Good Schools", sub: "For kids' education", val: "schools" },
        { icon: "🌿", label: "Green & Peaceful", sub: "Open spaces, calm area", val: "greenery" },
      ]
    },
    {
      q: "Budget per sqft?",
      key: "budget",
      options: [
        { icon: "🟢", label: "Under ₹4,000", sub: "Affordable zones", val: "under-4k" },
        { icon: "🟡", label: "₹4,000 – ₹7,000", sub: "Mid-range", val: "4k-7k" },
        { icon: "🟠", label: "₹7,000 – ₹12,000", sub: "Premium mid", val: "7k-12k" },
        { icon: "🔴", label: "Above ₹12,000", sub: "Premium", val: "above-12k" },
      ]
    }
  ];

  let obStep = 0;
  const obAnswers = {};

  function initOnboarding() {
    renderObStep();
    document.getElementById('ob-skip').addEventListener('click', skipOnboarding);
    document.getElementById('ob-back').addEventListener('click', prevObStep);
    document.getElementById('ob-next').addEventListener('click', nextObStep);
  }

  function renderObStep() {
    const step = OB_STEPS[obStep];
    document.getElementById('ob-question').textContent = step.q;

    const grid = document.getElementById('ob-options');
    grid.innerHTML = '';
    step.options.forEach(opt => {
      const btn = document.createElement('div');
      btn.className = 'ob-option' + (obAnswers[step.key] === opt.val ? ' selected' : '');
      btn.dataset.val = opt.val;
      btn.innerHTML = `
        <div class="opt-icon">${opt.icon}</div>
        <div class="opt-label">${opt.label}</div>
        ${opt.sub ? `<div class="opt-sub">${opt.sub}</div>` : ''}
      `;
      btn.addEventListener('click', () => {
        obAnswers[step.key] = opt.val;
        // Clear custom work location when a preset is chosen
        if (step.hasLocationSearch) {
          state.customWorkLoc = null;
          const input = document.getElementById('ob-work-search');
          if (input) input.value = '';
          const drop = document.getElementById('ob-work-dropdown');
          if (drop) drop.innerHTML = '';
        }
        grid.querySelectorAll('.ob-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        document.getElementById('ob-next').disabled = false;
      });
      grid.appendChild(btn);
    });

    // Custom location search box + pick from map (work step only)
    if (step.hasLocationSearch) {
      const searchWrap = document.createElement('div');
      searchWrap.className = 'ob-location-search';
      const savedName = state.customWorkLoc?.name || '';
      const savedSelected = obAnswers[step.key] === 'custom';
      searchWrap.innerHTML = `
        <div class="ob-location-label">— or pinpoint your exact workplace —</div>
        <div class="ob-location-row">
          <div class="ob-location-input-wrap" style="flex:1">
            <input id="ob-work-search" type="text" placeholder="e.g. DLF IT Park, Perungudi…"
              value="${savedName}"
              class="${savedSelected ? 'ob-location-selected' : ''}"
              autocomplete="off" spellcheck="false"/>
          </div>
          <button id="ob-pick-map-btn" class="ob-pick-map-btn" title="Pick location on map">
            📌 Pick from map
          </button>
        </div>
        <div id="ob-work-dropdown" class="ob-work-dropdown"></div>
        <div id="ob-pick-map-hint" class="ob-pick-map-hint hidden">
          Click anywhere on the map to set your work location
          <button id="ob-pick-cancel" class="ob-pick-cancel">Cancel</button>
        </div>
      `;
      grid.appendChild(searchWrap);

      const input = searchWrap.querySelector('#ob-work-search');
      const dropEl = searchWrap.querySelector('#ob-work-dropdown');
      const pickBtn = searchWrap.querySelector('#ob-pick-map-btn');
      const pickHint = searchWrap.querySelector('#ob-pick-map-hint');
      const pickCancel = searchWrap.querySelector('#ob-pick-cancel');
      let searchTimer = null;

      input.addEventListener('input', () => {
        const q = input.value.trim();
        input.classList.remove('ob-location-selected');
        clearTimeout(searchTimer);
        dropEl.innerHTML = '';
        if (q.length < 2) return;
        searchTimer = setTimeout(() => obWorkNominatimSearch(q, input, dropEl), 400);
      });

      // "Pick from map" — hide survey card, show full map, floating cancel bar
      pickBtn.addEventListener('click', () => {
        state._pickingWorkLoc = true;
        document.getElementById('onboarding').classList.add('ob-picking');
      });

      pickCancel.addEventListener('click', cancelPickMode);

      // Also wire the floating cancel button in the overlay
      const floatingCancel = document.getElementById('ob-pick-floating-cancel');
      if (floatingCancel) floatingCancel.addEventListener('click', cancelPickMode);
    }

    // Progress dots
    document.querySelectorAll('.ob-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i <= obStep);
    });

    // Footer buttons: Skip on step 0, Back on step 1+
    document.getElementById('ob-skip').classList.toggle('hidden', obStep > 0);
    document.getElementById('ob-back').classList.toggle('hidden', obStep === 0);

    const nextBtn = document.getElementById('ob-next');
    nextBtn.disabled = !obAnswers[step.key];
    nextBtn.textContent = obStep === OB_STEPS.length - 1 ? 'Show My Matches →' : 'Next →';
  }

  function cancelPickMode() {
    state._pickingWorkLoc = false;
    document.getElementById('pick-work-hint')?.classList.add('hidden');
    document.getElementById('filter-bar')?.classList.add('open');
    if (state._pickPreviewMarker) {
      state._pickPreviewMarker.remove();
      state._pickPreviewMarker = null;
    }
  }

  async function obWorkNominatimSearch(q, input, dropEl) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ', Chennai, India')}&format=json&limit=4&accept-language=en`;
      const resp = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const results = await resp.json();
      dropEl.innerHTML = '';
      results.slice(0, 4).forEach(r => {
        const item = document.createElement('div');
        item.className = 'ob-work-result';
        const name = r.display_name.split(',')[0];
        const sub = r.display_name.split(',').slice(1, 3).join(',').trim();
        item.innerHTML = `<span class="ob-work-result-name">${name}</span><span class="ob-work-result-sub">${sub}</span>`;
        item.addEventListener('click', () => {
          state.customWorkLoc = { lat: parseFloat(r.lat), lng: parseFloat(r.lon), name };
          obAnswers[OB_STEPS[obStep].key] = 'custom';
          input.value = name;
          input.classList.add('ob-location-selected');
          dropEl.innerHTML = '';
          // Deselect option buttons
          document.querySelectorAll('#ob-options .ob-option').forEach(b => b.classList.remove('selected'));
          document.getElementById('ob-next').disabled = false;
        });
        dropEl.appendChild(item);
      });
    } catch (_) {
      // Network fail — silently ignore
    }
  }

  function prevObStep() {
    if (obStep > 0) { obStep--; renderObStep(); }
  }

  function nextObStep() {
    if (!obAnswers[OB_STEPS[obStep].key]) return;
    if (obStep < OB_STEPS.length - 1) {
      obStep++;
      renderObStep();
    } else {
      finishOnboarding();
    }
  }

  function skipOnboarding() {
    document.getElementById('filter-bar')?.classList.remove('open');
    // If user skipped a retake, restore previous picks
    if (state._prevRecommendations?.length) {
      state.recommendations = state._prevRecommendations;
      state.userPersona = state._prevPersona;
      state._prevRecommendations = null;
      state._prevPersona = null;
      highlightRecommendations();
      showRecoPanel();
    } else {
      showToast('Explore the map — click any zone to see insights');
    }
  }

  function finishOnboarding() {
    state.userPersona = { ...obAnswers };
    document.getElementById('filter-bar')?.classList.remove('open');

    // Remove pick preview marker (replaced by permanent work marker below)
    if (state._pickPreviewMarker) { state._pickPreviewMarker.remove(); state._pickPreviewMarker = null; }
    // Place / refresh work location marker on the map
    if (state.workMarker) { state.workMarker.remove(); state.workMarker = null; }
    if (state.userPersona.work === 'custom' && state.customWorkLoc) {
      const workIcon = L.divIcon({
        className: '',
        html: `<div class="work-pin">💼 Work</div>`,
        iconSize: [72, 28],
        iconAnchor: [36, 28],
      });
      state.workMarker = L.marker(
        [state.customWorkLoc.lat, state.customWorkLoc.lng],
        { icon: workIcon, zIndexOffset: 900 }
      )
        .addTo(state.map)
        .bindTooltip(state.customWorkLoc.name, { permanent: false, direction: 'top' });
    }

    state.recommendations = computeRecommendations(state.userPersona);
    highlightRecommendations();
    showRecoPanel();
    showToast('Your top zones are highlighted on the map!');
  }

  // ── Recommendations Engine ─────────────────────────────────
  function computeRecommendations(persona) {
    // Commute tolerance ceiling (minutes)
    const TOLERANCE_MAX = { 'under-20': 20, '20-40': 40, '40-60': 60, 'over-60': 999 };
    const toleranceMax = TOLERANCE_MAX[persona.commute_tolerance] ?? 999;

    // Budget ceiling per sqft
    const BUDGET_CEIL = { 'under-4k': 4000, '4k-7k': 7000, '7k-12k': 12000, 'above-12k': Infinity };
    const budgetCeil = BUDGET_CEIL[persona.budget] ?? Infinity;

    // Work destination
    const workKey = persona.work === 'wfh' || persona.work === 'other' ? null : persona.work;
    const customLat = workKey === 'custom' ? state.customWorkLoc?.lat : null;
    const customLng = workKey === 'custom' ? state.customWorkLoc?.lng : null;

    // Only use curated (non-auto-generated) zones for recommendations
    const curatedZones = CHENNAI_ZONES.filter(z => !z.autoGenerated);

    // Pre-compute tWork for all zones (needed for pre-filter + sort)
    const withCommute = curatedZones.map(zone => ({
      ...zone,
      tWork: workKey ? getCommute(zone, workKey, customLat, customLng) : null,
    }));

    // Pre-filter: exclude zones that far exceed commute tolerance
    // Relax threshold if too few zones survive, then remove cap entirely
    let filtered = withCommute;
    if (workKey && toleranceMax < 999) {
      const strict  = withCommute.filter(z => z.tWork == null || z.tWork <= toleranceMax * 1.5);
      const relaxed = withCommute.filter(z => z.tWork == null || z.tWork <= toleranceMax * 2.0);
      if      (strict.length  >= 3) filtered = strict;
      else if (relaxed.length >= 3) filtered = relaxed;
      // else filtered = withCommute (no filter, show all)
    }

    const scored = filtered.map(zone => {
      const { tWork } = zone;
      let score = 0;
      const reasons = [];

      // Budget match
      const avgPrice = (zone.priceMin + zone.priceMax) / 2;
      if (persona.budget === 'under-4k' && zone.priceMin < 4000) { score += 30; reasons.push('Within your budget'); }
      if (persona.budget === '4k-7k' && avgPrice <= 7500) { score += 25; reasons.push('Good value'); }
      if (persona.budget === '7k-12k' && avgPrice <= 12500) { score += 20; }
      if (persona.budget === 'above-12k') score += 15;
      // Extra penalty for zones way over budget
      if (budgetCeil < Infinity && avgPrice > budgetCeil * 1.4) score -= 20;

      // Work proximity — tiered scoring
      // Zones at/near the work location get a strong priority boost
      if (tWork !== null) {
        if      (tWork <= 8)  { score += 60; reasons.push(`Live where you work (${tWork} min)`); }
        else if (tWork <= 15) { score += 35; reasons.push(`~${tWork} min to work`); }
        else if (tWork <= 25) { score += 25; reasons.push(`~${tWork} min to work`); }
        else if (tWork <= 35) { score += 15; }
        else if (tWork <= 50) { score += 5; }
        // > 50 min → 0 pts
      } else if (!workKey) {
        score += 15; // WFH — no commute penalty
      }

      // Family
      if (persona.family === 'family' && zone.scores.schools >= 78) { score += 20; reasons.push('Great schools nearby'); }
      if (persona.family === 'retired' && zone.floodScore <= 30) { score += 20; reasons.push('Safe & peaceful'); }
      if (persona.family === 'retired' && zone.scores.amenities >= 80) score += 10;
      if (persona.family === 'single' || persona.family === 'couple') {
        if (zone.scores.connectivity >= 85) { score += 15; reasons.push('Excellent connectivity'); }
      }
      if (persona.family === 'investment') {
        if (zone.priceTrend && parseInt(zone.priceTrend) >= 10) { score += 20; reasons.push(`Price up ${zone.priceTrend}`); }
      }

      // Priority
      if (persona.priority === 'flood-safe' && zone.floodScore <= 30) { score += 35; reasons.push('Low flood risk'); }
      if (persona.priority === 'flood-safe' && zone.floodScore > 30) score -= 20;
      if (persona.priority === 'affordable' && zone.priceMin <= 5000) { score += 25; reasons.push('Affordable rates'); }
      if (persona.priority === 'metro' && zone.metroDistance <= 0.5) { score += 25; reasons.push('Metro within 500m'); }
      if (persona.priority === 'schools' && zone.scores.schools >= 80) { score += 25; reasons.push('Top-rated schools'); }
      if (persona.priority === 'greenery' && zone.scores.greenery >= 70) { score += 25; reasons.push('Green & open'); }

      // Commute tolerance — progressive penalty (replaces flat -15)
      if (tWork !== null && toleranceMax < 999) {
        const overage = tWork - toleranceMax;
        if (overage > 0) {
          // -5 pts per 10 min over tolerance, max penalty -60
          const penalty = Math.min(60, Math.floor(overage / 10) * 5 + 5);
          score -= penalty;
        } else {
          // Bonus for fitting comfortably within tolerance
          if (persona.commute_tolerance === 'under-20') { score += 15; reasons.push(`Only ~${tWork} min commute`); }
          else if (persona.commute_tolerance === '20-40') score += 8;
          else if (persona.commute_tolerance === '40-60') score += 5;
        }
      }

      return { ...zone, tWork, matchScore: score, reasons };
    });

    return scored.sort((a, b) => b.matchScore - a.matchScore).slice(0, 6);
  }

  function highlightRecommendations() {
    const recoIds = new Set(state.recommendations.map(z => z.id));
    const top3Ids = new Set(state.recommendations.slice(0, 3).map(z => z.id));

    Object.entries(state.zoneMarkers).forEach(([id, marker]) => {
      // Hide non-recommended zones; show only the matched ones
      if (recoIds.has(id)) {
        marker.addTo(state.map);
        const el = marker.getElement();
        if (!el) return;
        const circle = el.querySelector('.zone-circle');
        if (circle) {
          circle.classList.toggle('top-pick', top3Ids.has(id));
          circle.classList.toggle('highlighted', top3Ids.has(id));
        }
      } else {
        state.map.removeLayer(marker);
      }
    });

    // Show "show all zones" chip on the map
    _showAllZonesChip();
  }

  function _showAllZonesChip() {
    let chip = document.getElementById('show-all-zones-chip');
    if (chip) return; // already showing
    chip = document.createElement('div');
    chip.id = 'show-all-zones-chip';
    chip.className = 'show-all-chip';
    chip.innerHTML = `
      <span>Showing <strong>${state.recommendations.length} matched zones</strong></span>
      <button onclick="App.showAllZones()">Show all zones</button>
    `;
    document.body.appendChild(chip);
  }

  function showAllZones() {
    Object.values(state.zoneMarkers).forEach(m => m.addTo(state.map));
    const chip = document.getElementById('show-all-zones-chip');
    if (chip) chip.remove();
  }

  function showRecoPanel() {
    const panel = document.getElementById('reco-panel');
    const list = document.getElementById('reco-list');
    list.innerHTML = '';
    panel.classList.add('ready'); // enables peek mode

    // Sort bar — placed in the header, not the scroll list
    let sortBar = panel.querySelector('.sort-bar');
    if (!sortBar) {
      sortBar = document.createElement('div');
      sortBar.className = 'sort-bar';
      const lbl = document.createElement('span');
      lbl.className = 'sort-bar-label';
      lbl.textContent = 'Sort:';
      sortBar.appendChild(lbl);
      const sortBtns = [
        { key: 'score',   label: '⭐ Score' },
        { key: 'commute', label: '🕐 Commute' },
        { key: 'price',   label: '💰 Price' },
      ];
      sortBtns.forEach(({ key, label }) => {
        const btn = document.createElement('button');
        btn.dataset.sort = key;
        btn.textContent = label;
        btn.addEventListener('click', () => {
          state.recoSort = key;
          // Update active state without full re-render
          sortBar.querySelectorAll('.sort-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.sort === key)
          );
          _renderRecoCards(list, state.recoSort);
        });
        sortBar.appendChild(btn);
      });
      // Insert after the reco-header
      const header = panel.querySelector('.reco-header');
      header.insertAdjacentElement('afterend', sortBar);
    }
    // Sync active button
    sortBar.querySelectorAll('button[data-sort]').forEach(b =>
      b.classList.toggle('sort-btn', true) ||
      b.classList.toggle('active', b.dataset.sort === state.recoSort)
    );

    _renderRecoCards(list, state.recoSort);
    panel.classList.add('open');
    document.body.classList.add('reco-open');
  }

  function _renderRecoCards(list, sortKey) {
    // Remove existing cards only (keep sort bar if it's in the list)
    list.querySelectorAll('.reco-card').forEach(c => c.remove());

    const panel = document.getElementById('reco-panel');
    let sorted = [...state.recommendations];
    if (sortKey === 'commute') {
      sorted.sort((a, b) => {
        if (a.tWork == null && b.tWork == null) return 0;
        if (a.tWork == null) return 1;
        if (b.tWork == null) return -1;
        return a.tWork - b.tWork;
      });
    } else if (sortKey === 'price') {
      sorted.sort((a, b) =>
        ((a.priceMin + a.priceMax) / 2) - ((b.priceMin + b.priceMax) / 2)
      );
    }

    sorted.forEach((zone, i) => {
      const card = document.createElement('div');
      card.className = 'reco-card' + (i === 0 ? ' top-pick' : '');
      const commuteBadge = zone.tWork != null
        ? `<span class="reco-commute">🕐 ~${zone.tWork} min</span>`
        : '';
      card.innerHTML = `
        <div class="reco-rank">${i === 0 ? '⭐ Best Match' : `#${i + 1} Pick`}</div>
        <div class="reco-zone-name">${zone.name}</div>
        <div class="reco-badges">
          <span class="reco-flood-badge risk-${zone.floodTier}">${floodTierLabel(zone.floodTier)}</span>
          ${commuteBadge}
        </div>
        <div class="reco-price">₹${zone.priceMin.toLocaleString('en-IN')} – ${zone.priceMax.toLocaleString('en-IN')}/sqft</div>
        <div class="reco-why">${zone.reasons.slice(0, 2).join(' · ')}</div>
      `;
      card.addEventListener('click', () => {
        flyToZone(zone);
        openZoneProfile(zone);
        panel.classList.remove('open');
        document.body.classList.remove('reco-open');
      });
      list.appendChild(card);
    });
  }

  function retakeQuiz() {
    // Remove work location marker + pick preview
    if (state.workMarker) { state.workMarker.remove(); state.workMarker = null; }
    if (state._pickPreviewMarker) { state._pickPreviewMarker.remove(); state._pickPreviewMarker = null; }

    // Reset quiz state
    obStep = 0;
    // Save previous picks so skip can restore them
    state._prevRecommendations = state.recommendations.slice();
    state._prevPersona = state.userPersona;

    Object.keys(obAnswers).forEach(k => delete obAnswers[k]);
    state.userPersona = null;
    state.recommendations = [];

    // Restore all zone markers
    showAllZones();

    // Hide reco panel fully until quiz re-completes
    const panel = document.getElementById('reco-panel');
    panel.classList.remove('open');
    panel.classList.remove('ready');

    // Open filter bar so user can update preferences
    const bar = document.getElementById('filter-bar');
    if (bar) {
      bar.classList.add('open');
      syncFilterChips();
      updateFilterPills();
    }
    const workInp = document.getElementById('fb-work-input');
    if (workInp) workInp.value = '';
  }

  // ── Filter Bar (replaces onboarding modal) ─────────────────
  function initFilterBar() {
    const groupsEl = document.getElementById('fb-groups');
    if (!groupsEl) return;

    // Build one group per OB_STEPS entry
    OB_STEPS.forEach(step => {
      const grp = document.createElement('div');
      grp.className = 'fb-group';
      const titleEl = document.createElement('div');
      titleEl.className = 'fb-group-title';
      titleEl.textContent = step.q;
      const optsEl = document.createElement('div');
      optsEl.className = 'fb-opts';
      optsEl.dataset.key = step.key;

      step.options.forEach(opt => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'fb-chip';
        chip.dataset.val = opt.val;
        chip.dataset.key = step.key;
        chip.textContent = `${opt.icon} ${opt.label}`;
        if (obAnswers[step.key] === opt.val) chip.classList.add('selected');
        chip.addEventListener('click', () => {
          obAnswers[step.key] = opt.val;
          // Clear custom work loc when a preset is chosen
          if (step.hasLocationSearch && opt.val !== 'custom') {
            state.customWorkLoc = null;
            const inp = document.getElementById('fb-work-input');
            if (inp) { inp.value = ''; inp.classList.remove('fb-work-selected'); }
          }
          optsEl.querySelectorAll('.fb-chip').forEach(c =>
            c.classList.toggle('selected', c.dataset.val === opt.val)
          );
          updateFilterPills();
        });
        optsEl.appendChild(chip);
      });

      grp.appendChild(titleEl);
      grp.appendChild(optsEl);
      groupsEl.appendChild(grp);
    });

    // Work location Nominatim search in filter bar
    const workInput  = document.getElementById('fb-work-input');
    const workDrop   = document.getElementById('fb-work-dropdown');
    const pickBtn    = document.getElementById('fb-pick-map-btn');
    let workTimer    = null;

    if (workInput) {
      workInput.addEventListener('input', () => {
        const q = workInput.value.trim();
        workInput.classList.remove('fb-work-selected');
        clearTimeout(workTimer);
        workDrop.innerHTML = '';
        if (q.length < 2) return;
        workTimer = setTimeout(() => fbWorkNominatimSearch(q, workInput, workDrop), 400);
      });
    }

    if (pickBtn) {
      pickBtn.addEventListener('click', () => {
        state._pickingWorkLoc = true;
        document.getElementById('filter-bar')?.classList.remove('open');
        document.getElementById('pick-work-hint')?.classList.remove('hidden');
        showToast('Click anywhere on the map to set your work location');
      });
    }

    const pickCancel = document.getElementById('pick-work-cancel');
    if (pickCancel) pickCancel.addEventListener('click', cancelPickMode);

    // Tab toggle — mark as seen on first click to stop pulse animation
    document.getElementById('fb-tab')?.addEventListener('click', () => {
      const bar = document.getElementById('filter-bar');
      bar?.classList.toggle('open');
      bar?.classList.add('seen');
    });

    // Apply button
    document.getElementById('fb-apply-btn')?.addEventListener('click', () => {
      const filled = OB_STEPS.filter(s => obAnswers[s.key]).length;
      if (filled === 0) {
        showToast('Select at least one preference to find your best zones');
        return;
      }
      finishOnboarding();
    });

    // Reset button
    document.getElementById('fb-reset-btn')?.addEventListener('click', () => {
      Object.keys(obAnswers).forEach(k => delete obAnswers[k]);
      state.customWorkLoc = null;
      document.querySelectorAll('.fb-chip').forEach(c => c.classList.remove('selected'));
      if (workInput) { workInput.value = ''; workInput.classList.remove('fb-work-selected'); }
      if (workDrop) workDrop.innerHTML = '';
      updateFilterPills();
    });

    updateFilterPills();
  }

  function syncFilterChips() {
    document.querySelectorAll('.fb-chip').forEach(chip => {
      chip.classList.toggle('selected',
        obAnswers[chip.dataset.key] === chip.dataset.val
      );
    });
  }

  function updateFilterPills() {
    const pillsEl = document.getElementById('fb-pills-row');
    if (!pillsEl) return;
    const pills = [];
    OB_STEPS.forEach(step => {
      const val = obAnswers[step.key];
      if (!val) return;
      if (val === 'custom' && state.customWorkLoc) {
        pills.push(`<span class="fb-pill">📍 ${state.customWorkLoc.name.slice(0, 14)}</span>`);
      } else {
        const opt = step.options.find(o => o.val === val);
        if (opt) pills.push(`<span class="fb-pill">${opt.icon} ${opt.label}</span>`);
      }
    });
    pillsEl.innerHTML = pills.join('');
  }

  async function fbWorkNominatimSearch(q, input, dropEl) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ', Chennai, India')}&format=json&limit=4&accept-language=en`;
      const resp = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const results = await resp.json();
      dropEl.innerHTML = '';
      results.slice(0, 4).forEach(r => {
        const item = document.createElement('div');
        item.className = 'fb-work-result';
        const name = r.display_name.split(',')[0];
        const sub  = r.display_name.split(',').slice(1, 3).join(',').trim();
        item.innerHTML = `<span class="fb-work-result-name">${name}</span><span class="fb-work-result-sub">${sub}</span>`;
        item.addEventListener('click', () => {
          state.customWorkLoc = { lat: parseFloat(r.lat), lng: parseFloat(r.lon), name };
          obAnswers['work'] = 'custom';
          input.value = name;
          input.classList.add('fb-work-selected');
          dropEl.innerHTML = '';
          document.querySelectorAll('.fb-opts[data-key="work"] .fb-chip')
            .forEach(c => c.classList.remove('selected'));
          updateFilterPills();
        });
        dropEl.appendChild(item);
      });
    } catch (_) {}
  }

  // ── Map Setup ──────────────────────────────────────────────
  function initMap(streamData) {
    state.map = L.map('map', {
      zoomControl: true,
      maxZoom: 28,
      minZoom: 9,
      attributionControl: true,
    }).fitBounds([
      [12.87, 80.09],
      [13.25, 80.34],
    ]);

    state.map.attributionControl.setPrefix(
      '<a href="https://leafletjs.com">Leaflet</a>'
    );


    // ── Basemap tile layers ─────────────────────────────────
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20,
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
    });
    const hybridLayer = L.tileLayer(
      'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
      { opacity: 0.65, maxNativeZoom: 20, maxZoom: 28, attribution: '© Google' }
    );
    const normalLayer = L.tileLayer(
      'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
      { maxNativeZoom: 20, maxZoom: 28, attribution: '© Google' }
    );

    // Default: OSM + Google Hybrid (same as before)
    osmLayer.addTo(state.map);
    hybridLayer.addTo(state.map);

    // Store for basemap switcher
    state.baseLayers = { osm: osmLayer, hybrid: hybridLayer, normal: normalLayer };
    state.activeBasemap = 'hybrid';

    // Basemap switcher button handlers
    document.querySelectorAll('.bm-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const bm = btn.dataset.bm;
        if (bm === state.activeBasemap) return;
        // Remove all base layers
        [osmLayer, hybridLayer, normalLayer].forEach(l => {
          if (state.map.hasLayer(l)) state.map.removeLayer(l);
        });
        // Apply selected basemap
        if (bm === 'hybrid') {
          osmLayer.addTo(state.map);
          hybridLayer.addTo(state.map);
        } else if (bm === 'normal') {
          normalLayer.addTo(state.map);
        } else {
          osmLayer.addTo(state.map);
        }
        state.activeBasemap = bm;
        document.querySelectorAll('.bm-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.bm === bm)
        );
      });
    });

    // DEM overlay — off by default, user enables via layer panel
    const demBounds = [[12.469166667, 79.55], [13.5625, 80.348333333]];
    state.demLayer = L.imageOverlay('data/DEM_1.png', demBounds, { opacity: 0.5 });

    // Substreams overlay — off by default
    const subBounds = [[12.47325, 79.554116667], [13.55005, 80.345916667]];
    state.substreamsLayer = L.imageOverlay('data/substreams_2.png', subBounds, { opacity: 0.6 });

    // Stream lines — off by default
    if (streamData) {
      state.streamLayer = L.geoJson(streamData, {
        style: { color: '#001FE7', opacity: 0.65, weight: 3 },
        interactive: false,
      });
    }

    // Road network layers — off by default
    if (typeof json_ORR_21 !== 'undefined') {
      state.orrLayer = L.geoJson(json_ORR_21, {
        style: { color: '#f97316', weight: 3.5, opacity: 0.85 },
        interactive: false,
      });
    }
    if (typeof json_IRR_18 !== 'undefined') {
      state.irrLayer = L.geoJson(json_IRR_18, {
        style: { color: '#eab308', weight: 3, opacity: 0.85 },
        interactive: false,
      });
    }
    if (typeof json_NH_16 !== 'undefined') {
      state.nhLayer = L.geoJson(json_NH_16, {
        style: { color: '#dc2626', weight: 2.5, opacity: 0.8 },
        interactive: false,
      });
    }
    if (typeof json_SuburbanCorridor_2 !== 'undefined' || typeof json_SuburbanStations_3 !== 'undefined') {
      state.suburbanLayer = L.layerGroup();
      // Corridor lines
      if (typeof json_SuburbanCorridor_2 !== 'undefined') {
        L.geoJson(json_SuburbanCorridor_2, {
          style: { color: '#92400e', weight: 3, opacity: 0.85, dashArray: '8 4' },
          interactive: false,
        }).addTo(state.suburbanLayer);
      }
      // Stations
      if (typeof json_SuburbanStations_3 !== 'undefined') {
        json_SuburbanStations_3.features.forEach(f => {
          if (f.geometry?.type !== 'Point') return;
          const [lng2, lat2] = f.geometry.coordinates;
          const name = (f.properties?.Name || 'Suburban Station').trim();
          state.suburbStations.push({ name, lat: lat2, lng: lng2 });
          L.circleMarker([lat2, lng2], {
            radius: 5,
            color: '#fff',
            fillColor: '#92400e',
            fillOpacity: 0.9,
            weight: 1.5,
          })
          .bindTooltip(`🚉 ${name}`, { direction: 'top' })
          .addTo(state.suburbanLayer);
        });
      }
    }
    if (typeof json_MajorBusTerminus_1 !== 'undefined') {
      state.busTerminusLayer = L.geoJson(json_MajorBusTerminus_1, {
        pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
          radius: 7,
          color: '#fff',
          fillColor: '#0d9488',
          fillOpacity: 0.9,
          weight: 2,
        }),
        onEachFeature: (feature, layer) => {
          const name = (feature.properties?.['Name of th'] || feature.properties?.Name || 'Bus Terminus').trim();
          // Store for nearest-transit lookup
          if (feature.geometry?.type === 'Point') {
            const [lng2, lat2] = feature.geometry.coordinates;
            state.busTermini.push({ name, lat: lat2, lng: lng2 });
          }
          // Tooltip shows MTC logo + name
          layer.bindTooltip(
            `<span class="tt-mtc-badge">MTC</span> ${name}`,
            { direction: 'top', permanent: false }
          );
        },
      });
    }

    // Merge auto-generated neighbourhood zones into the master list
    if (typeof NEIGHBOURHOOD_ZONES !== 'undefined') {
      const existingIds = new Set(CHENNAI_ZONES.map(z => z.id));
      NEIGHBOURHOOD_ZONES.forEach(z => { if (!existingIds.has(z.id)) CHENNAI_ZONES.push(z); });
    }

    // Zone / neighbourhood markers
    addZoneMarkers();

    // Parks, lakes, islands layers
    addParkMarkers();
    addLakeMarkers();

    // OSM locality discovery (async, non-blocking)
    loadOSMLocalities();

    // Chennai Metro layer (async, non-blocking)
    loadMetroLayer();

    // Employment hotspot layer (built immediately)
    loadEmploymentLayer();

    // Click on map → reverse geocode and show nearest zone
    state.map.on('click', onMapClick);

    // Layer toggles — all wrapped with ?. to survive any HTML/JS version mismatch
    const _on = (id, ev, fn) => document.getElementById(id)?.addEventListener(ev, fn);

    _on('toggle-streams',    'change', e => { e.target.checked ? state.map.addLayer(state.streamLayer) : state.map.removeLayer(state.streamLayer); });
    _on('toggle-dem',        'change', e => { e.target.checked ? state.map.addLayer(state.demLayer) : state.map.removeLayer(state.demLayer); });
    _on('toggle-substreams', 'change', e => { e.target.checked ? state.map.addLayer(state.substreamsLayer) : state.map.removeLayer(state.substreamsLayer); });
    _on('toggle-zones',      'change', e => { Object.values(state.zoneMarkers).forEach(m => { e.target.checked ? m.addTo(state.map) : state.map.removeLayer(m); }); });
    _on('toggle-parks',      'change', e => { if (!state.parkLayer) return; e.target.checked ? state.parkLayer.addTo(state.map) : state.map.removeLayer(state.parkLayer); });
    _on('toggle-lakes',      'change', e => { if (!state.lakeLayer) return; e.target.checked ? state.lakeLayer.addTo(state.map) : state.map.removeLayer(state.lakeLayer); });
    _on('toggle-localities', 'change', e => { if (!state.localityLayer) return; e.target.checked ? state.localityLayer.addTo(state.map) : state.map.removeLayer(state.localityLayer); });
    _on('toggle-employment', 'change', e => { if (!state.employmentLayer) return; e.target.checked ? state.employmentLayer.addTo(state.map) : state.map.removeLayer(state.employmentLayer); });
    // Metro per-line toggles (ids match state.metroLayers keys)
    ['line6', 'line7', 'line3', 'line4', 'line5'].forEach(lid => {
      _on(`toggle-metro-${lid}`, 'change', ev => {
        const layer = state.metroLayers[lid];
        if (!layer) return;
        ev.target.checked ? layer.addTo(state.map) : state.map.removeLayer(layer);
      });
    });
    _on('toggle-orr',          'change', e => { if (!state.orrLayer) return; e.target.checked ? state.orrLayer.addTo(state.map) : state.map.removeLayer(state.orrLayer); });
    _on('toggle-irr',          'change', e => { if (!state.irrLayer) return; e.target.checked ? state.irrLayer.addTo(state.map) : state.map.removeLayer(state.irrLayer); });
    _on('toggle-nh',           'change', e => { if (!state.nhLayer) return; e.target.checked ? state.nhLayer.addTo(state.map) : state.map.removeLayer(state.nhLayer); });
    _on('toggle-suburban',     'change', e => { if (!state.suburbanLayer) return; e.target.checked ? state.suburbanLayer.addTo(state.map) : state.map.removeLayer(state.suburbanLayer); });
    _on('toggle-bus-terminus', 'change', e => { if (!state.busTerminusLayer) return; e.target.checked ? state.busTerminusLayer.addTo(state.map) : state.map.removeLayer(state.busTerminusLayer); });

    // FABs
    _on('fab-locate',       'click', locateUser);
    _on('fab-pin',          'click', togglePinMode);
    _on('fab-layers',       'click', toggleLayerPanel);
    _on('layer-panel-close','click', toggleLayerPanel);

    // Info panel
    _on('info-btn',        'click', () => { document.getElementById('info-panel')?.classList.remove('hidden'); });
    _on('info-panel-close','click', () => { document.getElementById('info-panel')?.classList.add('hidden'); });
    _on('info-panel',      'click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden'); });

    // My Picks button
    _on('my-picks-btn', 'click', () => {
      if (state.recommendations.length > 0) showRecoPanel();
      else {
        document.getElementById('filter-bar')?.classList.add('open');
        showToast('Set your preferences to find your best zones');
      }
    });
  }

  function addZoneMarkers() {
    CHENNAI_ZONES.forEach(zone => {
      // Auto-generated neighbourhood zones use a smaller icon (26px vs 36px)
      const iconSize = zone.autoGenerated ? 26 : 36;
      const icon = createZoneIcon(zone, iconSize);
      const marker = L.marker([zone.lat, zone.lng], { icon, zIndexOffset: 100 });

      const composite = getCompositeScore(zone);
      const compTier = getCompositeTier(composite);
      const compLabel = composite >= 72 ? 'Excellent' : composite >= 55 ? 'Good' : composite >= 38 ? 'Average' : 'Below Avg';
      const tooltip = `
        <div class="zone-tooltip">
          <div class="zone-tooltip-name">${zone.name}</div>
          <div class="zone-tooltip-price">₹${zone.priceMin.toLocaleString('en-IN')} – ${zone.priceMax.toLocaleString('en-IN')}/sqft</div>
          <div class="zone-tooltip-score risk-${compTier}">⭐ Overall ${composite}/100 · ${compLabel}</div>
        </div>
      `;
      marker.bindTooltip(tooltip, { direction: 'top', offset: [0, -20], className: 'zone-tooltip-wrap', permanent: false });

      marker.on('click', () => openZoneProfile(zone));
      marker.addTo(state.map);
      state.zoneMarkers[zone.id] = marker;
    });
  }

  // ── Parks layer ───────────────────────────────────────────────────────────
  function addParkMarkers() {
    if (typeof CHENNAI_PARKS === 'undefined' || !CHENNAI_PARKS.length) return;
    const parkIcon = name => L.divIcon({
      className: '',
      html: `<div style="
        width:18px;height:18px;border-radius:50%;
        background:#16a34a;border:2px solid #fff;
        box-shadow:0 1px 4px rgba(0,0,0,.35);
        display:flex;align-items:center;justify-content:center;
        font-size:9px;color:#fff;font-weight:700;line-height:1">🌳</div>`,
      iconSize: [18, 18], iconAnchor: [9, 9],
    });
    const markers = CHENNAI_PARKS.map(park => {
      const m = L.marker([park.lat, park.lng], { icon: parkIcon(park.name), zIndexOffset: 50 });
      m.bindTooltip(`<div style="font-size:12px;font-weight:600;padding:2px 6px">${park.name}</div>`,
        { direction: 'top', offset: [0, -10], className: 'zone-tooltip-wrap' });
      return m;
    });
    state.parkLayer = L.layerGroup(markers);
    // Not added to map by default (toggle-parks is unchecked)
  }

  // ── Lakes layer ───────────────────────────────────────────────────────────
  function addLakeMarkers() {
    if (typeof CHENNAI_LAKES === 'undefined' || !CHENNAI_LAKES.length) return;
    const lakeIcon = () => L.divIcon({
      className: '',
      html: `<div style="
        width:16px;height:16px;border-radius:50%;
        background:#0ea5e9;border:2px solid #fff;
        box-shadow:0 1px 4px rgba(0,0,0,.35);
        display:flex;align-items:center;justify-content:center;
        font-size:8px;color:#fff;line-height:1">💧</div>`,
      iconSize: [16, 16], iconAnchor: [8, 8],
    });
    const markers = CHENNAI_LAKES.map(lake => {
      const m = L.marker([lake.lat, lake.lng], { icon: lakeIcon(), zIndexOffset: 50 });
      m.bindTooltip(`<div style="font-size:12px;font-weight:600;padding:2px 6px">${lake.name}</div>`,
        { direction: 'top', offset: [0, -10], className: 'zone-tooltip-wrap' });
      return m;
    });
    state.lakeLayer = L.layerGroup(markers);
    // Not added to map by default (toggle-lakes is unchecked)
  }

  function getCompositeScore(zone) {
    const s = zone.scores;
    if (!s) return 50;
    return Math.round((s.connectivity + s.amenities + s.schools + s.greenery + s.safety + s.value) / 6);
  }

  function getCompositeTier(score) {
    if (score >= 72) return 'low';       // green  — great overall
    if (score >= 55) return 'moderate';  // yellow — decent
    if (score >= 38) return 'high';      // orange — below avg
    return 'very-high';                  // red    — poor
  }

  function createZoneIcon(zone, size = 36) {
    const composite = getCompositeScore(zone);
    const tier = getCompositeTier(composite);
    const el = document.createElement('div');
    el.className = 'zone-marker-wrapper';
    el.innerHTML = `
      <div class="zone-circle risk-${tier}" style="width:${size}px;height:${size}px;line-height:${size}px;font-size:${Math.floor(size * 0.28)}px;">
        ${composite}
      </div>`;
    return L.divIcon({ html: el.outerHTML, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
  }

  async function onMapClick(e) {
    const { lat, lng } = e.latlng;

    // Pick-from-map mode: drop red marker, reverse-geocode, restore survey
    if (state._pickingWorkLoc) {
      state._pickingWorkLoc = false;

      // Remove any previous pick preview marker
      if (state._pickPreviewMarker) { state._pickPreviewMarker.remove(); state._pickPreviewMarker = null; }

      // Drop a red "Work" marker immediately so user sees the pick
      const redIcon = L.divIcon({
        className: '',
        html: `<div class="work-pick-marker"><div class="work-pick-dot"></div><div class="work-pick-label">Work</div></div>`,
        iconSize: [48, 48],
        iconAnchor: [24, 44],
      });
      state._pickPreviewMarker = L.marker([lat, lng], { icon: redIcon, zIndexOffset: 1100 }).addTo(state.map);

      // Restore survey overlay immediately
      document.getElementById('onboarding').classList.remove('ob-picking');

      // Reverse-geocode asynchronously
      let name = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`;
        const r = await fetch(url, { headers: { 'Accept-Language': 'en' } });
        const d = await r.json();
        const a = d.address || {};
        name = a.amenity || a.building || a.road || a.neighbourhood || a.hamlet
             || a.suburb || d.display_name.split(',')[0] || name;
      } catch (_) {}

      state.customWorkLoc = { lat, lng, name };
      obAnswers['work'] = 'custom';
      // Update filter bar work input
      const fbInput = document.getElementById('fb-work-input');
      if (fbInput) { fbInput.value = name; fbInput.classList.add('fb-work-selected'); }
      // Re-open filter bar and hide hint
      document.getElementById('pick-work-hint')?.classList.add('hidden');
      document.getElementById('filter-bar')?.classList.add('open');
      syncFilterChips();
      updateFilterPills();
      // Update marker tooltip with resolved name
      state._pickPreviewMarker.bindTooltip(name, { permanent: false, direction: 'top' });
      return;
    }

    // Pin mode: drop pin at click location
    if (state.pinMode) {
      dropPin(lat, lng);
      return;
    }

    // Normal mode: drop pin at exact clicked location
    dropPin(lat, lng);
  }

  function findNearestZone(lat, lng) {
    let best = null, bestDist = Infinity;
    CHENNAI_ZONES.forEach(zone => {
      const d = Math.hypot(zone.lat - lat, zone.lng - lng);
      if (d < bestDist) { bestDist = d; best = zone; }
    });
    // Only snap if within ~8km (roughly 0.07 degrees)
    return bestDist < 0.07 ? best : null;
  }

  function flyToZone(zone) {
    state.map.flyTo([zone.lat, zone.lng], 14, { duration: 1.2 });
  }

  // ── Zone Profile ───────────────────────────────────────────
  function openZoneProfile(zone) {
    state.selectedZone = zone;
    flyToZone(zone);
    renderProfile(zone);
    document.getElementById('sidebar').classList.add('open');
  }

  function renderProfile(zone) {
    const persona = state.userPersona;
    const workKey = persona?.work && !['wfh', 'other'].includes(persona.work) ? persona.work : null;

    const content = document.getElementById('sidebar-content');
    const matchScore = state.recommendations.find(r => r.id === zone.id);

    // Composite score
    const composite = getCompositeScore(zone);
    const compTier = getCompositeTier(composite);
    const compLabel = composite >= 72 ? 'Excellent' : composite >= 55 ? 'Good' : composite >= 38 ? 'Average' : 'Below Average';

    // Stream-proximity score for flood section
    const streamAnalysis = FloodScorer.analyze(zone.lat, zone.lng);
    const blendedScore = streamAnalysis
      ? FloodScorer.blendedScore(zone.floodScore, streamAnalysis.score)
      : zone.floodScore;
    const streamNote = streamAnalysis
      ? `Nearest stream: ${streamAnalysis.distLabel} away`
      : '';

    content.innerHTML = `
      ${matchScore ? `<div class="match-badge">⭐ #${state.recommendations.indexOf(matchScore) + 1} match for you</div>` : ''}

      <div class="zone-name">${zone.name}</div>
      <div class="zone-district">
        <span>📍</span>
        ${zone.district} · ${zone.elevation} elevation
      </div>

      <!-- Overall Composite Score — shown first -->
      <div class="profile-section composite-score-section">
        <div class="section-label">Overall Score</div>
        <div class="composite-score-row">
          <div class="composite-score-pill risk-${compTier}">${composite}<span class="composite-score-denom">/100</span></div>
          <div class="composite-score-meta">
            <div class="composite-score-label">${compLabel}</div>
            <div class="composite-score-bar-wrap">
              <div class="composite-score-bar" style="width:${composite}%"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Property Rates -->
      <div class="profile-section">
        <div class="section-label">Property Rates</div>
        <div class="price-display">₹${zone.priceMin.toLocaleString('en-IN')} – ₹${zone.priceMax.toLocaleString('en-IN')}<span style="font-size:13px;font-weight:400"> /sqft</span></div>
        <div class="price-sub">
          ${zone.autoGenerated
            ? `<span style="color:#f59e0b">⚠ Estimated from nearby zones</span>`
            : `<span>Guideline rate · TN Reg. Dept</span>
               <span class="price-trend">${zone.priceTrend} ${zone.priceTrend ? 'since 2023' : ''}</span>`}
        </div>
      </div>

      <!-- Commute -->
      <div class="profile-section">
        <div class="section-label">Commute Times (by road)</div>
        ${renderCommuteRows(zone, workKey)}
      </div>

      <!-- Transit -->
      <div class="profile-section">
        <div class="section-label">Nearest Transit</div>
        ${renderNearestTransit(zone.lat, zone.lng)}
      </div>

      <!-- Area Scores -->
      <div class="profile-section">
        <div class="section-label">Area Scores</div>
        <div class="scores-grid">
          ${renderScoreItem(zone.scores.connectivity, 'Connectivity')}
          ${renderScoreItem(zone.scores.amenities, 'Amenities')}
          ${renderScoreItem(zone.scores.schools, 'Schools')}
          ${renderScoreItem(zone.scores.greenery, 'Greenery')}
          ${renderScoreItem(zone.scores.value, 'Value')}
        </div>
      </div>

      <!-- Facilities (loaded async) -->
      <div class="profile-section" id="facilities-section">
        <div class="section-label">Nearby Facilities <span style="font-weight:400;color:#9ca3af">(within 2km)</span></div>
        <div class="facility-loading" id="facilities-loading">Loading facilities...</div>
        <div class="facilities-grid" id="facilities-grid" style="display:none"></div>
      </div>

      <!-- Best For / Concerns -->
      ${(zone.highlights?.length || zone.concerns?.length) ? `
      <div class="profile-section">
        ${zone.highlights?.length ? `
        <div class="section-label" style="margin-bottom:6px">Highlights</div>
        <div class="tags-row">
          ${zone.highlights.map(h => `<span class="profile-tag tag-good">✓ ${h}</span>`).join('')}
        </div>` : ''}
        ${zone.concerns?.length ? `
        <div class="section-label" style="margin-top:12px;margin-bottom:6px">Watch Out For</div>
        <div class="tags-row">
          ${zone.concerns.map(c => `<span class="profile-tag tag-concern">⚠ ${c}</span>`).join('')}
        </div>` : ''}
      </div>` : ''}

      <!-- Flood Risk — always last -->
      <div class="flood-block risk-${zone.floodTier}" style="margin-top:4px">
        <div class="flood-label">🛡️ Flood Risk Assessment</div>
        <div class="flood-tier-badge risk-${zone.floodTier}">
          ${floodTierLabel(zone.floodTier)}
          <span style="font-size:13px;font-weight:400;opacity:0.7">&nbsp;${blendedScore}/100</span>
        </div>
        <div class="flood-score-bar">
          <div class="flood-score-fill" style="width:${blendedScore}%"></div>
        </div>
        <div class="flood-note">${zone.floodNote}</div>
        ${zone.floodEvents.length ? `<div class="flood-events">⚠️ Flooded: ${zone.floodEvents.join(', ')}</div>` : ''}
        ${streamNote ? `<div class="flood-events" style="color:inherit;opacity:0.65">📍 ${streamNote}</div>` : ''}
      </div>

      <!-- Actions -->
      <div class="profile-actions">
        <button class="btn-primary" onclick="App.shareZone()">
          📲 Share
        </button>
        <button class="btn-outline" onclick="App.compareZone()">
          ⚖️ Compare
        </button>
      </div>
    `;

    // Sidebar header
    document.querySelector('.sidebar-location').textContent = zone.name;

    // Wikipedia enrichment (non-blocking)
    injectWikiInfo('.zone-name', zone.name);

    // Fetch facilities asynchronously
    loadFacilities(zone);
  }

  function renderCommuteRows(zone, highlightKey) {
    const destinations = [
      { key: 'omr', icon: '💻', label: 'IT Corridor (OMR)' },
      { key: 'guindy', icon: '🏭', label: 'Guindy' },
      { key: 'ambattur', icon: '⚙️', label: 'Ambattur Industrial' },
      { key: 'airport', icon: '✈️', label: 'Airport' },
      { key: 'tnagar', icon: '🛍️', label: 'T Nagar' },
      { key: 'central', icon: '🏛️', label: 'Central / Egmore' },
    ];
    let rows = '';
    // If user typed a custom work location, show it first highlighted
    if (highlightKey === 'custom' && state.customWorkLoc) {
      const t = getCommute(zone, 'custom', state.customWorkLoc.lat, state.customWorkLoc.lng);
      rows += `
        <div class="commute-row">
          <div class="commute-dest"><span class="commute-dest-icon">📍</span> ${state.customWorkLoc.name}</div>
          <div class="commute-time highlighted">~${t} min</div>
        </div>`;
    }
    rows += destinations.map(dest => {
      const t = getCommute(zone, dest.key);
      const isHighlighted = dest.key === highlightKey;
      return `
        <div class="commute-row">
          <div class="commute-dest"><span class="commute-dest-icon">${dest.icon}</span> ${dest.label}</div>
          <div class="commute-time ${isHighlighted ? 'highlighted' : ''}">~${t} min</div>
        </div>`;
    }).join('');
    return rows;
  }

  // Compute commute times from an exact lat/lng to all standard work hubs
  function renderPinCommute(lat, lng) {
    const persona = state.userPersona;
    const highlightKey = persona?.work && !['wfh', 'other'].includes(persona.work) ? persona.work : null;
    const dests = [
      { key: 'omr',      icon: '💻', label: 'IT Corridor (OMR)' },
      { key: 'guindy',   icon: '🏭', label: 'Guindy Industrial' },
      { key: 'ambattur', icon: '⚙️', label: 'Ambattur' },
      { key: 'airport',  icon: '✈️', label: 'Airport' },
      { key: 'tnagar',   icon: '🛍️', label: 'T Nagar' },
      { key: 'central',  icon: '🏛️', label: 'Central / Egmore' },
    ];
    let rows = '';
    // Custom work location if set
    if (highlightKey === 'custom' && state.customWorkLoc) {
      const t = commuteMinutes(lat, lng, state.customWorkLoc.lat, state.customWorkLoc.lng);
      rows += `<div class="commute-row">
        <div class="commute-dest"><span class="commute-dest-icon">📍</span> ${state.customWorkLoc.name}</div>
        <div class="commute-time highlighted">~${t} min</div>
      </div>`;
    }
    rows += dests.map(dest => {
      const hub = typeof WORK_ZONES !== 'undefined' && WORK_ZONES[dest.key];
      if (!hub) return '';
      const t = commuteMinutes(lat, lng, hub.lat, hub.lng);
      const isHighlighted = dest.key === highlightKey;
      return `<div class="commute-row">
        <div class="commute-dest"><span class="commute-dest-icon">${dest.icon}</span> ${dest.label}</div>
        <div class="commute-time ${isHighlighted ? 'highlighted' : ''}">~${t} min</div>
      </div>`;
    }).filter(Boolean).join('');
    return rows;
  }

  // Estimate area scores at exact lat/lng by weighted avg of 3 nearest zones
  function estimatePinScores(lat, lng) {
    const withDist = CHENNAI_ZONES.map(z => ({
      ...z,
      dist: haversineKm(lat, lng, z.lat, z.lng),
    })).sort((a, b) => a.dist - b.dist).slice(0, 3);

    const totalW = withDist.reduce((sum, z) => sum + (1 / (z.dist + 0.1)), 0);
    const keys = ['connectivity', 'amenities', 'schools', 'greenery', 'safety', 'value'];
    const result = {};
    keys.forEach(k => {
      result[k] = Math.round(
        withDist.reduce((sum, z) => sum + (z.scores[k] || 50) * (1 / (z.dist + 0.1)), 0) / totalW
      );
    });
    return result;
  }

  function renderNearestTransit(lat, lng) {
    const nearby = findNearestTransit(lat, lng);
    const rows = [];

    const fmtDist = km => km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
    const fmtTime = min => min < 60 ? `~${min} min` : `~${Math.round(min / 6) / 10}h`;
    const modeLabel = km => km <= 1.5 ? 'walk' : 'auto';

    const mkRow = (icon, name, km, minutes) => `
      <div class="commute-row">
        <div class="commute-dest"><span class="commute-dest-icon">${icon}</span> ${name}</div>
        <div class="commute-time" style="flex-direction:column;align-items:flex-end;gap:0">
          <span>${fmtTime(minutes)}</span>
          <span style="font-size:10px;color:#9ca3af">${fmtDist(km)} ${modeLabel(km)}</span>
        </div>
      </div>`;

    if (nearby.metro) rows.push(mkRow('🚇', nearby.metro.name, nearby.metro.km, nearby.metro.minutes));
    if (nearby.suburban) rows.push(mkRow('🚉', nearby.suburban.name, nearby.suburban.km, nearby.suburban.minutes));

    // Nearest local terminus (if different from major hubs)
    if (nearby.busNearest) rows.push(mkRow('🚌', nearby.busNearest.name, nearby.busNearest.km, nearby.busNearest.minutes));

    // Always show Koyambedu + Kilambakkam
    nearby.busHubs.forEach(h => {
      rows.push(mkRow('🏢', h.name, h.km, h.minutes));
    });

    // Major train terminals (always shown, sorted by distance)
    if (nearby.trainHubs?.length) {
      rows.push(`<div class="transit-section-label">🚆 Train Terminals</div>`);
      nearby.trainHubs.forEach(t => {
        rows.push(mkRow('🚆', t.name, t.km, t.minutes));
      });
    }

    return rows.length
      ? rows.join('')
      : `<div style="color:#9ca3af;font-size:12px">Enable transit layers to see nearest stops</div>`;
  }

  function renderScoreItem(val, label) {
    return `
      <div class="score-item">
        <div class="score-val">${val}</div>
        <div class="score-item-label">${label}</div>
      </div>`;
  }

  // ── Overture Maps Integration (optional static file) ───────
  // Run scripts/fetch_overture_places.py once to generate this file.
  // When present, Overture counts are merged with OSM Overpass counts.
  let _overturePlaces = null; // null = not loaded, [] = loaded but empty

  async function loadOverturePlaces() {
    if (_overturePlaces !== null) return _overturePlaces;
    try {
      const resp = await fetch('data/overture-places-chennai.json');
      if (!resp.ok) { _overturePlaces = []; return []; }
      const json = await resp.json();
      _overturePlaces = json.places || [];
      console.info(`[Overture] Loaded ${_overturePlaces.length} places`);
    } catch (_) {
      _overturePlaces = [];
    }
    return _overturePlaces;
  }

  function countOvertureNearby(places, lat, lng, radiusM) {
    const latDeg = radiusM / 111320;
    const lngDeg = radiusM / (111320 * Math.cos(lat * Math.PI / 180));
    const counts = { hospital: 0, school: 0, supermarket: 0, bank: 0, pharmacy: 0, park: 0 };
    places.forEach(p => {
      if (Math.abs(p.t - lat) > latDeg || Math.abs(p.g - lng) > lngDeg) return;
      // Precise haversine check
      const dlat = (p.t - lat) * Math.PI / 180;
      const dlng = (p.g - lng) * Math.PI / 180;
      const a = Math.sin(dlat / 2) ** 2 +
                Math.cos(lat * Math.PI / 180) * Math.cos(p.t * Math.PI / 180) *
                Math.sin(dlng / 2) ** 2;
      const dist = 6371000 * 2 * Math.asin(Math.sqrt(a));
      if (dist <= radiusM && counts[p.c] !== undefined) counts[p.c]++;
    });
    return counts;
  }

  function mergeCounts(osm, overture) {
    // Take the max of OSM and Overture for each category (both may undercount)
    return {
      hospitals:    Math.max(osm.hospitals,    overture.hospital    || 0),
      schools:      Math.max(osm.schools,      overture.school      || 0),
      supermarkets: Math.max(osm.supermarkets, overture.supermarket || 0),
      banks:        Math.max(osm.banks,        overture.bank        || 0),
      pharmacies:   Math.max(osm.pharmacies,   overture.pharmacy    || 0),
      parks:        Math.max(osm.parks,        overture.park        || 0),
    };
  }

  // ── Facilities via Overpass API ────────────────────────────
  async function loadFacilities(zone) {
    const loadingEl = document.getElementById('facilities-loading');
    const gridEl = document.getElementById('facilities-grid');

    if (state.facilitiesCache[zone.id]) {
      renderFacilities(state.facilitiesCache[zone.id], loadingEl, gridEl);
      return;
    }

    const r = 2000; // 2km radius
    const lat = zone.lat, lng = zone.lng;
    const query = `[out:json][timeout:20];(node["amenity"~"hospital|clinic|school|college|bank|pharmacy"](around:${r},${lat},${lng});node["shop"="supermarket"](around:${r},${lat},${lng});node["leisure"="park"](around:${r},${lat},${lng});way["leisure"="park"](around:${r},${lat},${lng});node["railway"="station"](around:${r},${lat},${lng});node["public_transport"="station"](around:${r},${lat},${lng}););out tags;`;

    try {
      const resp = await fetch(`https://overpass-api.de/api/interpreter`, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
      });
      const json = await resp.json();
      const counts = {};
      json.elements.forEach(el => {
        const a = el.tags?.amenity;
        const s = el.tags?.shop;
        const l = el.tags?.leisure;
        const key = a || s || l;
        if (key) counts[key] = (counts[key] || 0) + 1;
      });
      const osmData = {
        hospitals: (counts.hospital || 0) + (counts.clinic || 0),
        schools: (counts.school || 0) + (counts.college || 0),
        supermarkets: counts.supermarket || 0,
        banks: counts.bank || 0,
        pharmacies: counts.pharmacy || 0,
        parks: counts.park || 0,
      };
      // Optionally merge with Overture Maps if available
      const overturePlaces = await loadOverturePlaces();
      const data = overturePlaces.length
        ? mergeCounts(osmData, countOvertureNearby(overturePlaces, lat, lng, r))
        : osmData;
      state.facilitiesCache[zone.id] = data;
      renderFacilities(data, loadingEl, gridEl);
    } catch (err) {
      if (loadingEl) loadingEl.textContent = 'Facilities data unavailable offline';
    }
  }

  function renderFacilities(data, loadingEl, gridEl) {
    if (!loadingEl || !gridEl) return;
    loadingEl.style.display = 'none';
    gridEl.style.display = 'grid';

    const items = [
      { icon: '🏥', label: 'Hospitals', count: data.hospitals },
      { icon: '🏫', label: 'Schools', count: data.schools },
      { icon: '🛒', label: 'Supermarkets', count: data.supermarkets },
      { icon: '🏦', label: 'Banks', count: data.banks },
      { icon: '💊', label: 'Pharmacies', count: data.pharmacies },
      { icon: '🌳', label: 'Parks', count: data.parks },
    ];

    gridEl.innerHTML = items.map(item => `
      <div class="facility-chip">
        <span class="fac-icon">${item.icon}</span>
        <span class="fac-count">${item.count}</span>
        <span style="font-size:11px;color:#6b7280">${item.label}</span>
      </div>
    `).join('');
  }

  // ── Search ─────────────────────────────────────────────────
  function initSearch() {
    const input = document.getElementById('search-input');
    const dropdown = document.getElementById('search-dropdown');
    const clearBtn = document.getElementById('clear-search');

    input.addEventListener('input', () => {
      const q = input.value.trim();
      clearBtn.classList.toggle('hidden', q.length === 0);

      clearTimeout(state.searchTimeout);
      if (q.length < 2) { dropdown.classList.add('hidden'); return; }

      // First: local zone search
      const localMatches = CHENNAI_ZONES.filter(z =>
        z.name.toLowerCase().includes(q.toLowerCase()) ||
        z.tags.some(t => t.includes(q.toLowerCase()))
      );

      if (localMatches.length > 0) {
        showLocalResults(localMatches, dropdown);
      }

      // Then: Nominatim for landmarks/pincodes
      state.searchTimeout = setTimeout(() => nominatimSearch(q, dropdown), 350);
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.classList.add('hidden');
      dropdown.classList.add('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) dropdown.classList.add('hidden');
    });
  }

  function showLocalResults(zones, dropdown) {
    dropdown.innerHTML = '';
    zones.forEach(zone => {
      const item = document.createElement('div');
      item.className = 'search-item';
      item.innerHTML = `
        <span class="search-item-icon">📍</span>
        <div>
          <div class="search-item-name">${zone.name}</div>
          <div class="search-item-area">${zone.district} · ${floodTierLabel(zone.floodTier)} flood risk · ₹${zone.priceMin.toLocaleString('en-IN')}+/sqft</div>
        </div>
      `;
      item.addEventListener('click', () => {
        document.getElementById('search-input').value = zone.name;
        dropdown.classList.add('hidden');
        openZoneProfile(zone);
      });
      dropdown.appendChild(item);
    });
    dropdown.classList.remove('hidden');
  }

  async function nominatimSearch(q, dropdown) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ', Chennai, India')}&format=json&limit=4&accept-language=en`;
      const resp = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const results = await resp.json();

      if (results.length === 0) return;

      // Append Nominatim results below local ones
      const existing = dropdown.querySelectorAll('.search-item');
      const divider = document.createElement('div');
      divider.style.cssText = 'font-size:10px;padding:4px 14px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;background:#f9fafb;border-bottom:1px solid #e5e7eb;';
      divider.textContent = 'Nearby Places';
      if (existing.length > 0) dropdown.appendChild(divider);

      results.slice(0, 3).forEach(r => {
        const item = document.createElement('div');
        item.className = 'search-item';
        item.innerHTML = `
          <span class="search-item-icon" style="color:#9ca3af">🔍</span>
          <div>
            <div class="search-item-name">${r.display_name.split(',')[0]}</div>
            <div class="search-item-area">${r.display_name.split(',').slice(1, 3).join(',').trim()}</div>
          </div>`;
        item.addEventListener('click', () => {
          state.map.flyTo([parseFloat(r.lat), parseFloat(r.lon)], 15, { duration: 1.2 });
          document.getElementById('search-input').value = r.display_name.split(',')[0];
          dropdown.classList.add('hidden');
          // Find nearest zone to this point
          const nearest = findNearestZone(parseFloat(r.lat), parseFloat(r.lon));
          if (nearest) openZoneProfile(nearest);
        });
        dropdown.appendChild(item);
      });

      dropdown.classList.remove('hidden');
    } catch (e) {
      // network fail — local results already shown
    }
  }

  // ── User Location ──────────────────────────────────────────
  function locateUser() {
    if (!navigator.geolocation) { showToast('Location not supported by browser'); return; }
    showToast('Finding your location...');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        state.map.flyTo([lat, lng], 15, { duration: 1.2 });
        L.circleMarker([lat, lng], { radius: 8, color: '#1a56db', fillColor: '#3b82f6', fillOpacity: 0.9, weight: 2 })
          .addTo(state.map)
          .bindPopup('You are here').openPopup();
        const nearest = findNearestZone(lat, lng);
        if (nearest) {
          showToast(`You're near ${nearest.name}`);
          setTimeout(() => openZoneProfile(nearest), 800);
        }
      },
      () => showToast('Could not access your location')
    );
  }

  // ── Chennai Metro Layer (per-line) ────────────────────────
  // Phase 2 line definitions: id, color, line GeoJSON var, stations GeoJSON var, label
  const METRO_LINE_DEFS = [
    // Blue and Green lines first
    {
      id: 'line6', label: 'Blue Line', sublabel: 'Airport ↔ Wimco Nagar',
      color: '#1d4ed8', fillColor: '#60a5fa', dashArray: '7 4',
      lineVar: 'json_AirporttoWimcoNagarMetro_10',
      stnVar:  'json_AirporttoWimcoNagarMetroStations_11',
    },
    {
      id: 'line7', label: 'Green Line', sublabel: 'St Thomas Mount ↔ Central',
      color: '#16a34a', fillColor: '#4ade80', dashArray: '7 4',
      lineVar: 'json_StThomasMounttoCentralMetro_12',
      stnVar:  'json_StThomasMounttoCentralMetroStations_13',
    },
    // Phase 2 corridor lines
    {
      id: 'line3', label: 'Yellow Line', sublabel: 'Madhavaram ↔ Sholinganallur',
      color: '#d97706', fillColor: '#fbbf24', dashArray: '7 4',
      lineVar: 'json_MadhavaramtoSholinganallur_4',
      stnVar:  'json_MadhavaramtoSholinganallurStations_5',
    },
    {
      id: 'line4', label: 'Pink Line', sublabel: 'Lighthouse ↔ Poonamallee',
      color: '#db2777', fillColor: '#f472b6', dashArray: '7 4',
      lineVar: 'json_LighthousetoPoonamalleeMetro_6',
      stnVar:  'json_LighthousetoPoonamalleeMetroStations_7',
    },
    {
      id: 'line5', label: 'Violet Line', sublabel: 'Madhavaram ↔ SIPCOT',
      color: '#7c3aed', fillColor: '#a78bfa', dashArray: '7 4',
      lineVar: 'json_MadhavaramtoSIPCOTMetro_8',
      stnVar:  'json_MadhavaramtoSIPCOTMetroStations_9',
    },
  ];

  async function loadMetroLayer() {
    // ── Phase 2 lines + stations (local files — immediate) ──
    METRO_LINE_DEFS.forEach(def => {
      const group = L.layerGroup();
      state.metroLayers[def.id] = group;

      const lineData = typeof window[def.lineVar] !== 'undefined' ? window[def.lineVar] : null;
      if (lineData) {
        L.geoJson(lineData, {
          style: { color: def.color, weight: 3.5, opacity: 0.8, dashArray: def.dashArray },
          interactive: false,
        }).addTo(group);
      }

      const stnData = typeof window[def.stnVar] !== 'undefined' ? window[def.stnVar] : null;
      if (stnData) {
        stnData.features.forEach(f => {
          if (f.geometry?.type !== 'Point') return;
          const [lng2, lat2] = f.geometry.coordinates;
          const name = (f.properties?.Name || 'Metro Stop').trim();
          state.metroStations.push({ name, lat: lat2, lng: lng2, phase: 2, line: def.id });
          L.circleMarker([lat2, lng2], {
            radius: 4,
            color: '#fff',
            fillColor: def.fillColor,
            fillOpacity: 0.9,
            weight: 1.5,
          })
          .bindTooltip(
            `<span class="tt-metro-badge" style="background:${def.color}">Ⓜ</span> ${name} <span style="opacity:0.6;font-size:10px">${def.label}</span>`,
            { direction: 'top' }
          )
          .addTo(group);
        });
      }

      // Auto-show if toggle is checked
      if (document.getElementById(`toggle-metro-${def.id}`)?.checked) {
        group.addTo(state.map);
      }
    });

  }

  // ── OSM Locality Discovery ─────────────────────────────────
  const OSM_LOCALITY_CACHE_KEY = 'csafe_osm_localities_v4'; // bump to re-fetch with wider CMA bbox
  const OSM_LOCALITY_TTL = 24 * 60 * 60 * 1000; // 24h

  async function loadOSMLocalities() {
    // Try cache first
    try {
      const cached = sessionStorage.getItem(OSM_LOCALITY_CACHE_KEY);
      if (cached) {
        const { ts, data } = JSON.parse(cached);
        if (Date.now() - ts < OSM_LOCALITY_TTL) {
          renderLocalityMarkers(data);
          return;
        }
      }
    } catch (_) {}

    // Overpass query — full Chennai Metropolitan Area bbox
    // South: 12.55 (below Mahabalipuram), North: 13.45 (above Ponneri),
    // West: 79.55 (beyond Tirutani), East: 80.36 (coast)
    const bbox = '12.55,79.55,13.45,80.36';
    const query =
      `[out:json][timeout:45];(` +
      `node["place"~"suburb|neighbourhood|quarter|town|village|hamlet"]["name"](${bbox});` +
      `way["place"~"suburb|neighbourhood|quarter|town|village"]["name"](${bbox});` +
      `relation["place"~"suburb|neighbourhood|quarter|town|village"]["name"](${bbox});` +
      `);out center tags;`;

    try {
      const resp = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
      });
      const json = await resp.json();

      // Keywords that indicate infrastructure/utility nodes, not residential localities
      const INFRA_BLOCKLIST = /cmwssb|water\s*board|sewerage|pumping\s*station|oht|overhead\s*tank|reservoir|water\s*tank|borewell|substati|transformer|pylon|power\s*station|garbage|compost|cemetery|burial|cremation|temple\s*tank|storm\s*drain/i;

      const localities = json.elements
        .filter(el => el.tags?.name)
        .map(el => ({
          name: el.tags['name:en'] || el.tags.name,
          nameTa: el.tags['name:ta'] || '',
          lat: el.lat ?? el.center?.lat,
          lng: el.lon ?? el.center?.lon,
          place: el.tags.place,
          population: el.tags.population ? Number(el.tags.population) : null,
          osmId: el.id,
        }))
        .filter(l => l.lat && l.lng)
        // Drop infrastructure/utility nodes
        .filter(l => !INFRA_BLOCKLIST.test(l.name))
        // Skip localities already covered by curated zones (within ~1.5km)
        .filter(l => !CHENNAI_ZONES.some(z => Math.hypot(z.lat - l.lat, z.lng - l.lng) < 0.015));

      sessionStorage.setItem(OSM_LOCALITY_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: localities }));
      renderLocalityMarkers(localities);
    } catch (e) {
      // Non-critical — app works fine without this
    }
  }

  function renderLocalityMarkers(localities) {
    if (state.localityLayer) state.map.removeLayer(state.localityLayer);
    const showLocalities = document.getElementById('toggle-localities')?.checked ?? false;
    state.localityLayer = showLocalities ? L.layerGroup().addTo(state.map) : L.layerGroup();

    localities.forEach(loc => {
      const initials = loc.name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
      const icon = L.divIcon({
        html: `<div class="locality-marker" title="${loc.name}">${initials}</div>`,
        className: '',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      const popText = loc.population ? `Pop: ~${loc.population.toLocaleString('en-IN')}` : loc.place;
      const marker = L.marker([loc.lat, loc.lng], { icon });
      marker.bindTooltip(
        `<div class="zone-tooltip"><div class="zone-tooltip-name">${loc.name}</div><div class="zone-tooltip-price" style="color:#6b7280">${popText}</div></div>`,
        { direction: 'top', offset: [0, -14], className: 'zone-tooltip-wrap' }
      );
      marker.on('click', e => {
        L.DomEvent.stopPropagation(e);
        // Use full dropPin pipeline: places pin marker + 2km buffer + flood score + facilities
        dropPin(loc.lat, loc.lng);
      });
      marker.addTo(state.localityLayer);
    });

    // Update layer toggle label with count
    const subEl = document.getElementById('localities-sub');
    if (subEl) subEl.textContent = `${localities.length} areas from OpenStreetMap`;
  }

  // ── Wikipedia Enrichment ────────────────────────────────────
  const _wikiCache = {};

  async function fetchWikiSummary(name) {
    if (_wikiCache[name] !== undefined) return _wikiCache[name];
    const tryFetch = async (title) => {
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
      const r = await fetch(url);
      if (!r.ok) return null;
      const d = await r.json();
      if (d.type === 'disambiguation' || !d.extract) return null;
      return { extract: d.extract.slice(0, 220), url: d.content_urls?.desktop?.page };
    };
    try {
      const result = (await tryFetch(name + ', Chennai')) || (await tryFetch(name));
      _wikiCache[name] = result;
      return result;
    } catch (_) {
      _wikiCache[name] = null;
      return null;
    }
  }

  function injectWikiInfo(containerSelector, name) {
    fetchWikiSummary(name).then(wiki => {
      if (!wiki) return;
      const el = document.querySelector(containerSelector);
      if (!el) return;
      const div = document.createElement('div');
      div.className = 'wiki-excerpt';
      div.innerHTML = `
        <div class="wiki-icon">W</div>
        <div class="wiki-text">
          ${wiki.extract}…
          <a href="${wiki.url}" target="_blank" rel="noopener" class="wiki-link">Wikipedia ↗</a>
        </div>`;
      el.insertAdjacentElement('afterend', div);
    });
  }

  // ── Drop-a-Pin Feature ─────────────────────────────────────
  function togglePinMode() {
    state.pinMode = !state.pinMode;
    const btn = document.getElementById('fab-pin');
    btn.classList.toggle('active', state.pinMode);
    document.body.classList.toggle('pin-mode', state.pinMode);
    if (state.pinMode) {
      showToast('Click anywhere on the map to drop a pin');
    } else {
      clearPin();
    }
  }

  // ── SVG clip — restricts overlay visibility to the buffer circle ─────────
  function applyBufferClip(lat, lng, radiusM) {
    removeBufferClip();
    const svg = state.map.getPanes().overlayPane.querySelector('svg');
    if (!svg) return;
    let defs = svg.querySelector('defs');
    if (!defs) { defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); svg.insertBefore(defs, svg.firstChild); }
    const cp = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
    cp.id = 'bufferClip';
    cp.setAttribute('clipPathUnits', 'userSpaceOnUse');
    const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circ.id = 'bufferClipCircle';
    cp.appendChild(circ);
    defs.appendChild(cp);
    function update() {
      const cPt = state.map.latLngToLayerPoint([lat, lng]);
      const ePt = state.map.latLngToLayerPoint([lat + radiusM / 111320, lng]);
      circ.setAttribute('cx', cPt.x);
      circ.setAttribute('cy', cPt.y);
      circ.setAttribute('r',  Math.abs(cPt.y - ePt.y));
      svg.querySelectorAll(':scope > g').forEach(g => g.setAttribute('clip-path', 'url(#bufferClip)'));
    }
    update();
    state.map.on('move zoom viewreset zoomend moveend', update);
    state._bufferClipUpdate = update;
  }

  function removeBufferClip() {
    if (state._bufferClipUpdate) {
      state.map.off('move zoom viewreset zoomend moveend', state._bufferClipUpdate);
      state._bufferClipUpdate = null;
    }
    const svg = state.map.getPanes().overlayPane?.querySelector('svg');
    if (svg) {
      svg.querySelectorAll(':scope > g').forEach(g => g.removeAttribute('clip-path'));
      document.getElementById('bufferClip')?.remove();
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // ── Layer snapshot helpers ────────────────────────────────────────────────
  // When a pin is dropped we force-enable every overlay so the user sees full
  // context. The previous toggle states are snapshotted and restored on clear.
  function _layerPairs() {
    return [
      ['toggle-streams',      () => state.streamLayer],
      ['toggle-dem',          () => state.demLayer],
      ['toggle-substreams',   () => state.substreamsLayer],
      ['toggle-parks',        () => state.parkLayer],
      ['toggle-lakes',        () => state.lakeLayer],
      ['toggle-localities',   () => state.localityLayer],
      ['toggle-employment',   () => state.employmentLayer],
      ['toggle-orr',          () => state.orrLayer],
      ['toggle-irr',          () => state.irrLayer],
      ['toggle-nh',           () => state.nhLayer],
      ['toggle-suburban',     () => state.suburbanLayer],
      ['toggle-bus-terminus', () => state.busTerminusLayer],
      ...['line6','line7','line3','line4','line5'].map(lid => [
        `toggle-metro-${lid}`, () => state.metroLayers[lid],
      ]),
    ];
  }

  function snapshotAndEnableLayers() {
    const snapshot = {};
    _layerPairs().forEach(([id, getLayer]) => {
      const el = document.getElementById(id);
      if (!el) return;
      snapshot[id] = el.checked;
      if (!el.checked) { el.checked = true; const l = getLayer(); if (l) l.addTo(state.map); }
    });
    // Zones — collection of markers
    const zonesEl = document.getElementById('toggle-zones');
    if (zonesEl) {
      snapshot['toggle-zones'] = zonesEl.checked;
      if (!zonesEl.checked) {
        zonesEl.checked = true;
        Object.values(state.zoneMarkers).forEach(m => m.addTo(state.map));
      }
    }
    state._layerSnapshot = snapshot;
  }

  function restoreLayerSnapshot() {
    const snap = state._layerSnapshot;
    if (!snap) return;
    state._layerSnapshot = null;
    _layerPairs().forEach(([id, getLayer]) => {
      if (!(id in snap)) return;
      const el = document.getElementById(id);
      if (!el) return;
      el.checked = snap[id];
      if (!snap[id]) { const l = getLayer(); if (l) state.map.removeLayer(l); }
    });
    if ('toggle-zones' in snap) {
      const el = document.getElementById('toggle-zones');
      if (el) {
        el.checked = snap['toggle-zones'];
        if (!snap['toggle-zones']) Object.values(state.zoneMarkers).forEach(m => state.map.removeLayer(m));
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  function dropPin(lat, lng) {
    // Remove previous pin + buffer
    if (state.pinMarker) state.map.removeLayer(state.pinMarker);
    if (state.pinBuffer) state.map.removeLayer(state.pinBuffer);

    // Custom pin icon
    const pinIcon = L.divIcon({
      html: `<div class="drop-pin-marker"><div class="pin-head"></div><div class="pin-tail"></div></div>`,
      className: '',
      iconSize: [28, 40],
      iconAnchor: [14, 40],
    });
    state.pinMarker = L.marker([lat, lng], { icon: pinIcon, zIndexOffset: 1000 }).addTo(state.map);

    // 2.5km dashed buffer circle
    state.pinBuffer = L.circle([lat, lng], {
      radius: 2500,
      color: '#1a56db',
      fillColor: '#1a56db',
      fillOpacity: 0.05,
      weight: 2,
      dashArray: '7 5',
    }).addTo(state.map);

    // 1. Force-enable all overlay layers (snapshot old state for restore)
    snapshotAndEnableLayers();
    // 2. Clip all SVG overlays to the buffer so only the 2.5km area is visible
    applyBufferClip(lat, lng, 2500);

    // Zoom to fit buffer
    state.map.fitBounds(state.pinBuffer.getBounds(), { padding: [50, 50] });

    // Analyse and show profile
    openPinProfile(lat, lng);
  }

  async function openPinProfile(lat, lng) {
    document.getElementById('sidebar').classList.add('open');
    document.querySelector('.sidebar-location').textContent = 'Analysing location…';
    document.getElementById('sidebar-content').innerHTML = `
      <div style="padding:32px 20px;text-align:center;color:#6b7280">
        <div style="font-size:32px;margin-bottom:10px">📍</div>
        <div style="font-size:14px;font-weight:600;color:#374151">Analysing this location…</div>
        <div style="font-size:12px;margin-top:4px">Fetching address &amp; flood data</div>
      </div>`;

    // Parallel: reverse geocode + flood score (local, instant)
    const [address, streamData] = await Promise.all([
      reverseGeocode(lat, lng),
      Promise.resolve(FloodScorer.analyze(lat, lng)),
    ]);

    document.querySelector('.sidebar-location').textContent = address.short || 'Custom Location';
    renderPinProfile(lat, lng, address, streamData);

    // Facilities loaded async after render
    loadPinFacilities(lat, lng);
  }

  async function reverseGeocode(lat, lng) {
    try {
      // Overpass API: query place nodes within 1500m for locality name, road WAYS within
      // 100m for road name, and postcode nodes within 400m.
      // Key fixes vs Nominatim:
      //  - Includes place=locality (most common type in Chennai/India, missing from OSM neighbourhood)
      //  - Roads in OSM are way elements, not node elements — use way["highway"]["name"]
      //  - Avoids Nominatim polygon-containment returning "Chennai" / "CMWSSB Division 106"
      const query = `[out:json][timeout:10];
(
  node["place"~"^(neighbourhood|suburb|quarter|hamlet|village|locality)$"]["name"](around:1500,${lat},${lng});
  way["place"~"^(neighbourhood|suburb|quarter|hamlet|village|locality)$"]["name"](around:1500,${lat},${lng});
  way["highway"]["name"](around:100,${lat},${lng});
  node["addr:postcode"](around:400,${lat},${lng});
);out tags center;`;

      const resp = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
      });
      const data = await resp.json();
      const elements = data.elements || [];

      // Filter out utility/administrative division names
      const isAdminTag = v => v && /\b(division|ward|zone|block|sector|taluk)\b[\s\-]*\d/i.test(v);

      // Distance from pin to element centre
      const distTo = e => {
        const eLat = e.lat ?? e.center?.lat;
        const eLng = e.lon ?? e.center?.lon;
        if (eLat == null) return 9999;
        const dLat = (lat - eLat) * 111320;
        const dLng = (lng - eLng) * Math.cos(lat * Math.PI / 180) * 111320;
        return Math.sqrt(dLat * dLat + dLng * dLng);
      };

      const places = elements
        .filter(e => e.tags?.place && e.tags?.name && !isAdminTag(e.tags.name))
        .sort((a, b) => distTo(a) - distTo(b));

      const roads = elements
        .filter(e => e.tags?.highway && e.tags?.name && !isAdminTag(e.tags.name))
        .sort((a, b) => distTo(a) - distTo(b));

      const locality = places[0]?.tags.name;
      const road     = roads[0]?.tags.name;
      const pincode  = elements.find(e => e.tags?.['addr:postcode'])?.tags['addr:postcode'] || '';

      // "Vyasarpadi · Perambur High Road" / locality only / road only / fallback
      const short = locality && road ? `${locality} · ${road}`
                  : locality || road
                  || 'Custom Location';

      return { short, district: '', pincode };
    } catch (_) {
      return { short: 'Custom Location', district: '', pincode: '' };
    }
  }

  function renderPinProfile(lat, lng, address, streamData) {
    const tierClass = streamData ? `risk-${streamData.tier}` : '';
    const tierLabel = streamData ? floodTierLabel(streamData.tier) : '—';
    const score = streamData ? streamData.score : '—';

    // Estimated composite from nearby zones
    const pinScores = estimatePinScores(lat, lng);
    const pinComposite = Math.round(
      (pinScores.connectivity + pinScores.amenities + pinScores.schools +
       pinScores.greenery + pinScores.safety + pinScores.value) / 6
    );
    const pinCompTier = getCompositeTier(pinComposite);
    const pinCompLabel = pinComposite >= 72 ? 'Excellent' : pinComposite >= 55 ? 'Good' : pinComposite >= 38 ? 'Average' : 'Below Average';

    document.getElementById('sidebar-content').innerHTML = `
      <div class="pin-mode-hint" id="pin-mode-hint">📍 Custom pin — 2.5km buffer active</div>
      <div class="zone-name">${address.short || 'Custom Location'}</div>
      ${address.district
        ? `<div class="zone-district"><span>🗺</span>${address.district}${address.pincode ? ' · PIN ' + address.pincode : ''}</div>`
        : ''}
      <div class="pin-coords-chip">
        🌐 ${lat.toFixed(5)}, ${lng.toFixed(5)}
        <span class="pin-radius-note" id="pin-radius-note">· 2.5km buffer</span>
      </div>

      <!-- Estimated Overall Score — first, matching zone profile -->
      <div class="profile-section composite-score-section">
        <div class="section-label">Estimated Overall Score <span style="font-weight:400;color:#9ca3af">(interpolated)</span></div>
        <div class="composite-score-row">
          <div class="composite-score-pill risk-${pinCompTier}">${pinComposite}<span class="composite-score-denom">/100</span></div>
          <div class="composite-score-meta">
            <div class="composite-score-label">${pinCompLabel}</div>
            <div class="composite-score-bar-wrap">
              <div class="composite-score-bar" style="width:${pinComposite}%"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Commute Times -->
      <div class="profile-section">
        <div class="section-label">Commute Times (by road)</div>
        ${renderPinCommute(lat, lng)}
      </div>

      <!-- Nearest Transit -->
      <div class="profile-section">
        <div class="section-label">Nearest Transit</div>
        ${renderNearestTransit(lat, lng)}
      </div>

      <!-- Estimated Area Scores -->
      <div class="profile-section">
        <div class="section-label">Area Scores <span style="font-weight:400;color:#9ca3af">(interpolated)</span></div>
        <div class="scores-grid">
          ${['connectivity','amenities','schools','greenery','safety','value'].map(k =>
            renderScoreItem(pinScores[k], k.charAt(0).toUpperCase()+k.slice(1))
          ).join('')}
        </div>
      </div>

      <!-- Facilities (loaded async) -->
      <div class="profile-section" id="pin-fac-section">
        <div class="section-label">Nearby Facilities <span style="font-weight:400;color:#9ca3af">(within 2.5km via OSM)</span></div>
        <div class="facility-loading" id="pin-fac-loading">Loading from OpenStreetMap…</div>
        <div class="facilities-grid" id="pin-fac-grid" style="display:none"></div>
      </div>

      <!-- Flood Score — always last -->
      <div class="flood-block ${tierClass}" style="margin-top:4px">
        <div class="flood-label">🛡️ Flood Risk Assessment</div>
        ${streamData ? `
          <div class="flood-tier-badge ${tierClass}">
            ${tierLabel}
            <span style="font-size:13px;font-weight:400;opacity:0.7">&nbsp;${score}/100</span>
          </div>
          <div class="flood-score-bar">
            <div class="flood-score-fill" style="width:${score}%"></div>
          </div>
          <div class="flood-note">Computed from ALOS PALSAR DEM stream network</div>
          <div class="flood-events" style="color:inherit;opacity:0.65">📍 Nearest stream: ${streamData.distLabel} away</div>
        ` : '<div class="flood-note">Stream data unavailable</div>'}
      </div>

      <!-- Actions -->
      <div class="profile-actions">
        <button class="btn-primary" onclick="App.sharePinLocation()">📲 Share</button>
        <button class="btn-outline" id="btn-clear-buffer" onclick="App.clearBuffer()">🗺️ Remove Buffer</button>
        <button class="btn-outline" onclick="App.clearDroppedPin()">🗑️ Clear Pin</button>
      </div>
    `;

    // Store for share
    state._pinData = { lat, lng, address, streamData };

    // Wikipedia enrichment for the reverse-geocoded name
    if (address.short && address.short !== 'Custom Location') {
      injectWikiInfo('.zone-name', address.short);
    }
  }

  async function loadPinFacilities(lat, lng) {
    const r = 2500;
    const query = `[out:json][timeout:25];(node["amenity"~"hospital|clinic|school|college|bank|pharmacy"](around:${r},${lat},${lng});node["shop"="supermarket"](around:${r},${lat},${lng});node["leisure"="park"](around:${r},${lat},${lng});way["leisure"="park"](around:${r},${lat},${lng});node["railway"="station"](around:${r},${lat},${lng}););out tags;`;
    const loadingEl = document.getElementById('pin-fac-loading');
    const gridEl = document.getElementById('pin-fac-grid');

    try {
      const resp = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
      });
      const json = await resp.json();
      const counts = {};
      json.elements.forEach(el => {
        const key = el.tags?.amenity || el.tags?.shop || el.tags?.leisure || el.tags?.railway;
        if (key) counts[key] = (counts[key] || 0) + 1;
      });
      const osmData = {
        hospitals: (counts.hospital || 0) + (counts.clinic || 0),
        schools: (counts.school || 0) + (counts.college || 0),
        supermarkets: counts.supermarket || 0,
        banks: counts.bank || 0,
        pharmacies: counts.pharmacy || 0,
        parks: counts.park || 0,
      };
      const overturePlaces = await loadOverturePlaces();
      const data = overturePlaces.length
        ? mergeCounts(osmData, countOvertureNearby(overturePlaces, lat, lng, r))
        : osmData;
      renderFacilities(data, loadingEl, gridEl);
    } catch (_) {
      if (loadingEl) loadingEl.textContent = 'Facilities unavailable (offline)';
    }
  }

  function clearPin() {
    if (state.pinMarker) { state.map.removeLayer(state.pinMarker); state.pinMarker = null; }
    if (state.pinBuffer) { state.map.removeLayer(state.pinBuffer); state.pinBuffer = null; }
    removeBufferClip();
    restoreLayerSnapshot();
    state._pinData = null;
    document.getElementById('sidebar').classList.remove('open');
  }

  // Remove buffer ring + clip + restore layer toggles, but keep pin + sidebar open
  function clearBuffer() {
    if (state.pinBuffer) { state.map.removeLayer(state.pinBuffer); state.pinBuffer = null; }
    removeBufferClip();
    restoreLayerSnapshot();
    // Update sidebar hint and hide the button
    const hint = document.getElementById('pin-mode-hint');
    if (hint) hint.textContent = '📍 Custom pin';
    const coordChip = document.getElementById('pin-radius-note');
    if (coordChip) coordChip.style.display = 'none';
    const clearBufBtn = document.getElementById('btn-clear-buffer');
    if (clearBufBtn) clearBufBtn.style.display = 'none';
  }

  function sharePinLocation() {
    const d = state._pinData;
    if (!d) return;
    const { lat, lng, address, streamData } = d;
    const tier = streamData ? floodTierLabel(streamData.tier) : 'Unknown';
    const score = streamData ? streamData.score + '/100' : 'N/A';
    const dist = streamData ? `Nearest stream: ${streamData.distLabel}\n` : '';
    const text =
      `🌊 *IllamAI — Custom Location Analysis*\n\n` +
      `📍 ${address.short || 'Custom Location'}${address.district ? ', ' + address.district : ''}\n` +
      `🌐 ${lat.toFixed(5)}, ${lng.toFixed(5)}\n\n` +
      `Flood Risk: ${tier} (${score})\n${dist}` +
      `Analysis radius: 2km\n\n` +
      `Check flood risk before buying property 👇\nchennaifloods.in`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }

  // ── Layer Panel ────────────────────────────────────────────
  function toggleLayerPanel() {
    state.layerPanelOpen = !state.layerPanelOpen;
    const panel = document.getElementById('layer-panel');
    const btn = document.getElementById('fab-layers');
    panel.classList.toggle('open', state.layerPanelOpen);
    btn.classList.toggle('active', state.layerPanelOpen);
  }

  // ── Share ──────────────────────────────────────────────────
  function shareZone() {
    const zone = state.selectedZone;
    if (!zone) return;
    const streamA = FloodScorer.analyze(zone.lat, zone.lng);
    const score = streamA ? FloodScorer.blendedScore(zone.floodScore, streamA.score) : zone.floodScore;
    const streamLine = streamA ? `📍 Nearest flood stream: ${streamA.distLabel} away\n` : '';
    const text =
      `🌊 *IllamAI — ${zone.name}*\n\n` +
      `Flood Risk: ${floodTierLabel(zone.floodTier)} (${score}/100)\n` +
      `${streamLine}` +
      `💰 Rate: ₹${zone.priceMin.toLocaleString('en-IN')}–${zone.priceMax.toLocaleString('en-IN')}/sqft (${zone.priceTrend})\n` +
      `🚇 Metro: ${zone.metro} (${zone.metroDistance < 1 ? zone.metroDistance * 1000 + 'm' : zone.metroDistance + 'km'})\n` +
      `🏙️ Connectivity: ${zone.scores.connectivity}/100 · Schools: ${zone.scores.schools}/100\n\n` +
      `Check flood risk before buying property in Chennai 👇\nchennaifloods.in`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank');
  }

  function compareZone() {
    showToast('Compare feature coming soon!');
  }

  // ── Helpers ────────────────────────────────────────────────
  function floodTierLabel(tier) {
    const labels = {
      'low': '🟢 Low Risk',
      'moderate': '🟡 Moderate Risk',
      'high': '🔴 High Risk',
      'very-high': '⛔ Very High Risk',
    };
    return labels[tier] || tier;
  }

  function floodTierEmoji(tier) {
    const emojis = { 'low': '🟢', 'moderate': '🟡', 'high': '🔴', 'very-high': '⛔' };
    return emojis[tier] || '⚪';
  }

  function showToast(msg) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2800);
  }

  // ── Public API ─────────────────────────────────────────────
  // Expose these so pick-mode map-click handler can call them directly
  // (they are already in scope within the IIFE, so just declare access points)

  return {
    init(streamData) {
      if (streamData) FloodScorer.init(streamData);
      initMap(streamData);
      initSearch();
      initFilterBar();

      // Sidebar close
      document.getElementById('sidebar-close').addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('open');
      });

      // Reco panel — close collapses to peek; restore map controls
      document.getElementById('reco-close').addEventListener('click', e => {
        e.stopPropagation();
        document.getElementById('reco-panel').classList.remove('open');
        document.body.classList.remove('reco-open');
      });
      // Handle + header (but not close/retake buttons) expand when peeking
      ['.reco-handle', '.reco-header'].forEach(sel => {
        document.querySelector(sel)?.addEventListener('click', e => {
          if (e.target.closest('#reco-close') || e.target.closest('#retake-quiz-btn')) return;
          const panel = document.getElementById('reco-panel');
          if (!panel.classList.contains('open')) {
            panel.classList.add('open');
            document.body.classList.add('reco-open');
          }
        });
      });
      document.getElementById('retake-quiz-btn')?.addEventListener('click', e => {
        e.stopPropagation();
        retakeQuiz();
      });
    },
    shareZone,
    compareZone,
    openZone: openZoneProfile,
    clearDroppedPin: clearPin,
    clearBuffer,
    sharePinLocation,
    showAllZones,
  };
})();
