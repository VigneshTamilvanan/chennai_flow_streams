// ============================================================
// ChennaiSafe — Smart Property Decision Tool
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
  };

  // ── Onboarding ─────────────────────────────────────────────
  const OB_STEPS = [
    {
      q: "Where do you work?",
      key: "work",
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
        grid.querySelectorAll('.ob-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        document.getElementById('ob-next').disabled = false;
      });
      grid.appendChild(btn);
    });

    // Progress dots
    document.querySelectorAll('.ob-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i <= obStep);
    });

    const nextBtn = document.getElementById('ob-next');
    nextBtn.disabled = !obAnswers[step.key];
    nextBtn.textContent = obStep === OB_STEPS.length - 1 ? 'Show My Matches →' : 'Next →';
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
    document.getElementById('onboarding').classList.add('hidden');
    showToast('Explore the map — click any zone to see insights');
  }

  function finishOnboarding() {
    state.userPersona = { ...obAnswers };
    document.getElementById('onboarding').classList.add('hidden');
    state.recommendations = computeRecommendations(state.userPersona);
    highlightRecommendations();
    showRecoPanel();
    showToast('Your top zones are highlighted on the map!');
  }

  // ── Recommendations Engine ─────────────────────────────────
  function computeRecommendations(persona) {
    const scored = CHENNAI_ZONES.map(zone => {
      let score = 0;
      const reasons = [];

      // Budget match
      const avgPrice = (zone.priceMin + zone.priceMax) / 2;
      if (persona.budget === 'under-4k' && zone.priceMin < 4000) { score += 30; reasons.push('Within your budget'); }
      if (persona.budget === '4k-7k' && avgPrice <= 7500) { score += 25; reasons.push('Good value'); }
      if (persona.budget === '7k-12k' && avgPrice <= 12500) { score += 20; }
      if (persona.budget === 'above-12k') score += 15;

      // Work proximity
      const workKey = persona.work === 'wfh' || persona.work === 'other' ? null : persona.work;
      if (workKey && zone.commute[workKey] !== undefined) {
        const t = zone.commute[workKey];
        if (t <= 15) { score += 30; reasons.push(`~${t} min to work`); }
        else if (t <= 25) { score += 20; reasons.push(`~${t} min to work`); }
        else if (t <= 35) score += 10;
      } else if (!workKey) {
        score += 15; // WFH doesn't penalize
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

      return { ...zone, matchScore: score, reasons };
    });

    return scored.sort((a, b) => b.matchScore - a.matchScore).slice(0, 6);
  }

  function highlightRecommendations() {
    const topIds = new Set(state.recommendations.slice(0, 3).map(z => z.id));
    Object.entries(state.zoneMarkers).forEach(([id, marker]) => {
      const el = marker.getElement();
      if (!el) return;
      const circle = el.querySelector('.zone-circle');
      if (circle) {
        circle.classList.toggle('top-pick', topIds.has(id));
        circle.classList.toggle('highlighted', topIds.has(id));
      }
    });
  }

  function showRecoPanel() {
    const panel = document.getElementById('reco-panel');
    const list = document.getElementById('reco-list');
    list.innerHTML = '';

    state.recommendations.forEach((zone, i) => {
      const card = document.createElement('div');
      card.className = 'reco-card' + (i === 0 ? ' top-pick' : '');
      card.innerHTML = `
        <div class="reco-rank">${i === 0 ? '⭐ Best Match' : `#${i + 1} Pick`}</div>
        <div class="reco-zone-name">${zone.name}</div>
        <span class="reco-flood-badge risk-${zone.floodTier}">${floodTierLabel(zone.floodTier)}</span>
        <div class="reco-price">₹${zone.priceMin.toLocaleString('en-IN')} – ${zone.priceMax.toLocaleString('en-IN')}/sqft</div>
        <div class="reco-why">${zone.reasons.slice(0, 2).join(' · ')}</div>
      `;
      card.addEventListener('click', () => {
        flyToZone(zone);
        openZoneProfile(zone);
        panel.classList.remove('open');
      });
      list.appendChild(card);
    });

    panel.classList.add('open');
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

    // Base layer — OSM
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20,
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
    }).addTo(state.map);

    // Google hybrid on top
    const googleHybrid = L.tileLayer(
      'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
      { opacity: 0.65, maxNativeZoom: 20, maxZoom: 28, attribution: '© Google' }
    ).addTo(state.map);

    // DEM overlay
    const demBounds = [[12.469166667, 79.55], [13.5625, 80.348333333]];
    state.demLayer = L.imageOverlay('data/DEM_1.png', demBounds, { opacity: 0.5 }).addTo(state.map);

    // Substreams overlay
    const subBounds = [[12.47325, 79.554116667], [13.55005, 80.345916667]];
    state.substreamsLayer = L.imageOverlay('data/substreams_2.png', subBounds, { opacity: 0.6 }).addTo(state.map);

    // Stream lines (your flood data)
    if (streamData) {
      state.streamLayer = L.geoJson(streamData, {
        style: { color: '#001FE7', opacity: 0.65, weight: 3 },
        interactive: false,
      }).addTo(state.map);
    }

    // Zone markers
    addZoneMarkers();

    // Click on map → reverse geocode and show nearest zone
    state.map.on('click', onMapClick);

    // Layer toggles
    document.getElementById('toggle-streams').addEventListener('change', e => {
      e.target.checked ? state.map.addLayer(state.streamLayer) : state.map.removeLayer(state.streamLayer);
    });
    document.getElementById('toggle-dem').addEventListener('change', e => {
      e.target.checked ? state.map.addLayer(state.demLayer) : state.map.removeLayer(state.demLayer);
    });
    document.getElementById('toggle-substreams').addEventListener('change', e => {
      e.target.checked ? state.map.addLayer(state.substreamsLayer) : state.map.removeLayer(state.substreamsLayer);
    });
    document.getElementById('toggle-zones').addEventListener('change', e => {
      Object.values(state.zoneMarkers).forEach(m => {
        e.target.checked ? m.addTo(state.map) : state.map.removeLayer(m);
      });
    });

    // FABs
    document.getElementById('fab-locate').addEventListener('click', locateUser);
    document.getElementById('fab-layers').addEventListener('click', toggleLayerPanel);

    // My Picks button
    document.getElementById('my-picks-btn').addEventListener('click', () => {
      if (state.recommendations.length > 0) showRecoPanel();
      else showToast('Complete the quiz to see your picks');
    });
  }

  function addZoneMarkers() {
    CHENNAI_ZONES.forEach(zone => {
      const icon = createZoneIcon(zone);
      const marker = L.marker([zone.lat, zone.lng], { icon, zIndexOffset: 100 });

      const tooltip = `
        <div class="zone-tooltip">
          <div class="zone-tooltip-name">${zone.name}</div>
          <div class="zone-tooltip-price">₹${zone.priceMin.toLocaleString('en-IN')} – ${zone.priceMax.toLocaleString('en-IN')}/sqft</div>
          <div class="zone-tooltip-risk risk-${zone.floodTier}">${floodTierLabel(zone.floodTier)}</div>
        </div>
      `;
      marker.bindTooltip(tooltip, { direction: 'top', offset: [0, -20], className: 'zone-tooltip-wrap', permanent: false });

      marker.on('click', () => openZoneProfile(zone));
      marker.addTo(state.map);
      state.zoneMarkers[zone.id] = marker;
    });
  }

  function createZoneIcon(zone, size = 36) {
    const el = document.createElement('div');
    el.className = 'zone-marker-wrapper';
    el.innerHTML = `
      <div class="zone-circle risk-${zone.floodTier}" style="width:${size}px;height:${size}px;line-height:${size}px;font-size:${Math.floor(size * 0.28)}px;">
        ${zone.floodScore}
      </div>`;
    return L.divIcon({ html: el.outerHTML, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
  }

  async function onMapClick(e) {
    const { lat, lng } = e.latlng;
    // Find nearest zone
    const nearest = findNearestZone(lat, lng);
    if (nearest) openZoneProfile(nearest);
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

    // Stream-proximity score for this zone center
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

      <!-- Flood Safety -->
      <div class="flood-block risk-${zone.floodTier}">
        <div class="flood-label">🌊 Flood Safety Score</div>
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

      <!-- Property Rates -->
      <div class="profile-section">
        <div class="section-label">Property Rates</div>
        <div class="price-display">₹${zone.priceMin.toLocaleString('en-IN')} – ₹${zone.priceMax.toLocaleString('en-IN')}<span style="font-size:13px;font-weight:400"> /sqft</span></div>
        <div class="price-sub">
          <span>Guideline rate · TN Reg. Dept</span>
          <span class="price-trend">${zone.priceTrend} ${zone.priceTrend ? 'since 2023' : ''}</span>
        </div>
      </div>

      <!-- Commute -->
      <div class="profile-section">
        <div class="section-label">Commute Times (by road)</div>
        ${renderCommuteRows(zone, workKey)}
      </div>

      <!-- Metro -->
      <div class="profile-section">
        <div class="section-label">Transit</div>
        <div class="commute-row">
          <div class="commute-dest"><span class="commute-dest-icon">🚇</span> ${zone.metro}</div>
          <div class="commute-time">${zone.metroDistance < 1 ? zone.metroDistance * 1000 + 'm' : zone.metroDistance + 'km'}</div>
        </div>
        <div class="commute-row">
          <div class="commute-dest"><span class="commute-dest-icon">🚌</span> Bus</div>
          <div class="commute-time">${zone.bus}</div>
        </div>
      </div>

      <!-- Facilities (loaded async) -->
      <div class="profile-section" id="facilities-section">
        <div class="section-label">Nearby Facilities <span style="font-weight:400;color:#9ca3af">(within 2km)</span></div>
        <div class="facility-loading" id="facilities-loading">Loading facilities...</div>
        <div class="facilities-grid" id="facilities-grid" style="display:none"></div>
      </div>

      <!-- Area Scores -->
      <div class="profile-section">
        <div class="section-label">Area Scores</div>
        <div class="scores-grid">
          ${renderScoreItem(zone.scores.connectivity, 'Connectivity')}
          ${renderScoreItem(zone.scores.amenities, 'Amenities')}
          ${renderScoreItem(zone.scores.schools, 'Schools')}
          ${renderScoreItem(zone.scores.greenery, 'Greenery')}
          ${renderScoreItem(zone.scores.safety, 'Flood Safety')}
          ${renderScoreItem(zone.scores.value, 'Value')}
        </div>
      </div>

      <!-- Best For / Concerns -->
      <div class="profile-section">
        <div class="section-label" style="margin-bottom:6px">Best For</div>
        <div class="tags-row">
          ${zone.highlights.map(h => `<span class="profile-tag tag-good">✓ ${h}</span>`).join('')}
        </div>
        <div class="section-label" style="margin-top:12px;margin-bottom:6px">Watch Out For</div>
        <div class="tags-row">
          ${zone.concerns.map(c => `<span class="profile-tag tag-concern">⚠ ${c}</span>`).join('')}
        </div>
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
    return destinations.map(dest => {
      const t = zone.commute[dest.key];
      const isHighlighted = dest.key === highlightKey;
      return `
        <div class="commute-row">
          <div class="commute-dest"><span class="commute-dest-icon">${dest.icon}</span> ${dest.label}</div>
          <div class="commute-time ${isHighlighted ? 'highlighted' : ''}">~${t} min</div>
        </div>`;
    }).join('');
  }

  function renderScoreItem(val, label) {
    return `
      <div class="score-item">
        <div class="score-val">${val}</div>
        <div class="score-item-label">${label}</div>
      </div>`;
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
      const data = {
        hospitals: (counts.hospital || 0) + (counts.clinic || 0),
        schools: (counts.school || 0) + (counts.college || 0),
        supermarkets: counts.supermarket || 0,
        banks: counts.bank || 0,
        pharmacies: counts.pharmacy || 0,
        parks: counts.park || 0,
      };
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
      `🌊 *ChennaiSafe — ${zone.name}*\n\n` +
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
  return {
    init(streamData) {
      if (streamData) FloodScorer.init(streamData);
      initMap(streamData);
      initSearch();
      initOnboarding();

      // Sidebar close
      document.getElementById('sidebar-close').addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('open');
      });

      // Reco panel close
      document.getElementById('reco-close').addEventListener('click', () => {
        document.getElementById('reco-panel').classList.remove('open');
      });
    },
    shareZone,
    compareZone,
    openZone: openZoneProfile,
  };
})();
