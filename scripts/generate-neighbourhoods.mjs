/**
 * generate-neighbourhoods.mjs
 * Geocodes all Wikipedia Chennai neighbourhood/suburb/park/lake/island names
 * via Nominatim, computes interpolated scores from existing CHENNAI_ZONES data,
 * and writes data/neighbourhoods-auto.js
 *
 * Run: node scripts/generate-neighbourhoods.mjs
 */

import { writeFileSync } from 'fs';

// ── Existing zone anchor data (for IDW score interpolation) ──────────────────
const ANCHORS = [
  { name:"Anna Nagar",      lat:13.0850,lng:80.2101, flood:22, p:[9000,16000], s:{connectivity:92,amenities:90,schools:92,greenery:70,safety:78,value:45} },
  { name:"Velachery",       lat:12.9815,lng:80.2209, flood:82, p:[6500,9500],  s:{connectivity:92,amenities:80,schools:72,greenery:30,safety:18,value:40} },
  { name:"Pallikaranai",    lat:12.9412,lng:80.2126, flood:91, p:[4500,7500],  s:{connectivity:62,amenities:58,schools:55,greenery:22,safety:9, value:45} },
  { name:"Sholinganallur",  lat:12.9010,lng:80.2279, flood:62, p:[6000,9500],  s:{connectivity:75,amenities:72,schools:65,greenery:35,safety:40,value:52} },
  { name:"Perungudi",       lat:12.9601,lng:80.2349, flood:68, p:[6000,9000],  s:{connectivity:80,amenities:70,schools:60,greenery:28,safety:35,value:50} },
  { name:"Adyar",           lat:13.0012,lng:80.2565, flood:48, p:[9500,15000], s:{connectivity:88,amenities:88,schools:85,greenery:65,safety:68,value:38} },
  { name:"Besant Nagar",    lat:12.9990,lng:80.2657, flood:42, p:[11000,18000],s:{connectivity:85,amenities:90,schools:88,greenery:72,safety:72,value:32} },
  { name:"Thiruvanmiyur",   lat:12.9839,lng:80.2574, flood:38, p:[8000,13000], s:{connectivity:85,amenities:82,schools:78,greenery:55,safety:65,value:40} },
  { name:"Nungambakkam",    lat:13.0569,lng:80.2425, flood:30, p:[12000,22000],s:{connectivity:92,amenities:95,schools:90,greenery:60,safety:72,value:28} },
  { name:"T Nagar",         lat:13.0418,lng:80.2341, flood:35, p:[10000,18000],s:{connectivity:95,amenities:98,schools:88,greenery:40,safety:65,value:30} },
  { name:"Mylapore",        lat:13.0336,lng:80.2674, flood:32, p:[10000,18000],s:{connectivity:90,amenities:92,schools:88,greenery:55,safety:70,value:32} },
  { name:"Kodambakkam",     lat:13.0520,lng:80.2273, flood:45, p:[8000,14000], s:{connectivity:88,amenities:85,schools:82,greenery:45,safety:62,value:35} },
  { name:"Guindy",          lat:13.0067,lng:80.2206, flood:28, p:[7000,12000], s:{connectivity:90,amenities:80,schools:75,greenery:55,safety:65,value:42} },
  { name:"Tambaram",        lat:12.9249,lng:80.1000, flood:25, p:[4500,7000],  s:{connectivity:78,amenities:72,schools:70,greenery:50,safety:62,value:58} },
  { name:"Chromepet",       lat:12.9516,lng:80.1462, flood:32, p:[5000,8000],  s:{connectivity:80,amenities:75,schools:68,greenery:45,safety:60,value:55} },
  { name:"Porur",           lat:13.0359,lng:80.1567, flood:30, p:[6000,10000], s:{connectivity:78,amenities:72,schools:68,greenery:48,safety:60,value:52} },
  { name:"Mogappair",       lat:13.0827,lng:80.1742, flood:22, p:[6500,10000], s:{connectivity:75,amenities:72,schools:72,greenery:55,safety:65,value:52} },
  { name:"Ambattur",        lat:13.1142,lng:80.1548, flood:35, p:[5000,8000],  s:{connectivity:75,amenities:70,schools:65,greenery:42,safety:58,value:55} },
  { name:"Medavakkam",      lat:12.9217,lng:80.1944, flood:55, p:[4500,7000],  s:{connectivity:65,amenities:62,schools:60,greenery:38,safety:45,value:55} },
  { name:"Poonamallee",     lat:13.0465,lng:80.0966, flood:20, p:[4000,6500],  s:{connectivity:65,amenities:60,schools:58,greenery:52,safety:58,value:62} },
  { name:"Perambur",        lat:13.1152,lng:80.2354, flood:40, p:[5000,8000],  s:{connectivity:82,amenities:75,schools:70,greenery:38,safety:55,value:52} },
  { name:"Virugambakkam",   lat:13.0601,lng:80.1948, flood:28, p:[6000,9500],  s:{connectivity:80,amenities:75,schools:70,greenery:45,safety:62,value:50} },
  { name:"Kelambakkam",     lat:12.7905,lng:80.2196, flood:20, p:[3500,6000],  s:{connectivity:50,amenities:48,schools:45,greenery:55,safety:55,value:68} },
  { name:"Guduvanchery",    lat:12.8456,lng:80.0594, flood:18, p:[3500,6000],  s:{connectivity:55,amenities:52,schools:50,greenery:52,safety:58,value:68} },
  { name:"Madhavaram",      lat:13.1490,lng:80.2317, flood:30, p:[4500,7000],  s:{connectivity:70,amenities:65,schools:62,greenery:45,safety:58,value:58} },
  { name:"Manali",          lat:13.1659,lng:80.2627, flood:45, p:[3000,5500],  s:{connectivity:60,amenities:52,schools:50,greenery:35,safety:45,value:62} },
  { name:"Avadi",           lat:13.1151,lng:80.1014, flood:22, p:[3500,5500],  s:{connectivity:62,amenities:58,schools:55,greenery:48,safety:58,value:65} },
  { name:"Minjur",          lat:13.2750,lng:80.2600, flood:35, p:[2500,4500],  s:{connectivity:45,amenities:40,schools:38,greenery:50,safety:50,value:72} },
  { name:"Urapakkam",       lat:12.8697,lng:80.0703, flood:20, p:[3500,5500],  s:{connectivity:58,amenities:52,schools:50,greenery:52,safety:58,value:65} },
  { name:"Chengalpattu",    lat:12.6919,lng:79.9765, flood:18, p:[3000,5000],  s:{connectivity:52,amenities:50,schools:48,greenery:55,safety:58,value:70} },
  { name:"Injambakkam",     lat:12.9320,lng:80.2601, flood:30, p:[7000,12000], s:{connectivity:60,amenities:58,schools:55,greenery:65,safety:62,value:45} },
  { name:"Sriperumbudur",   lat:12.9673,lng:79.9412, flood:15, p:[2500,4000],  s:{connectivity:48,amenities:42,schools:40,greenery:50,safety:55,value:72} },
  { name:"Ponneri",         lat:13.3383,lng:80.1972, flood:30, p:[2000,3500],  s:{connectivity:40,amenities:38,schools:35,greenery:52,safety:52,value:75} },
];

// ── Names to geocode ─────────────────────────────────────────────────────────

// Already in CHENNAI_ZONES — skip these (normalised to lowercase for matching)
const EXISTING = new Set([
  'anna nagar','velachery','pallikaranai','sholinganallur','perungudi','adyar',
  'besant nagar','thiruvanmiyur','nungambakkam','t nagar','mylapore','kodambakkam',
  'guindy','tambaram','chromepet','porur','mogappair','ambattur','medavakkam',
  'poonamallee','perambur','virugambakkam','kelambakkam','guduvanchery','madhavaram',
  'red hills','minjur','avadi','ponneri','tiruvallur','tirutani','sriperumbudur',
  'kanchipuram','urapakkam','chengalpattu','ecr / akkarai','injambakkam','kovalam',
  'thiruporur','mahabalipuram','manali',
]);

// Non-place filter — entries that are infrastructure/admin/nature features
const NON_PLACE_RE = /\b(lake|aeri|reservoir|canal|nullah|taluk|division|corporation zone|mall|park|church|college|trust|project|corridor|beach|memorial|bus terminus|engineering|zoological|national park|flyover|links|square|grove|ganga)\b/i;

// Clean Wikipedia name → search query friendly
function cleanName(n) {
  return n
    .replace(/,\s*(Chennai|Anakaputhur|Chengalpattu|Tiruvallur)\s*$/i, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .trim();
}

function toId(n) {
  return n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Raw name lists ────────────────────────────────────────────────────────────

const NEIGHBOURHOOD_RAW = `Adambakkam
Adayalampattu
Adyar, Chennai
Agaram
Alandur
Alapakkam
Alwarpet
Alwarthirunagar
Ambattur
Aminjikarai
Amullaivoyal
Andarkuppam
Anna Nagar
Anna Nagar West
Arani, Chennai
Ariyalur, Chennai
Arumbakkam
Ashok Nagar, Chennai
Athipattu
Ayanavaram
Ayyappa Nagar
Basin bridge
Beemannapettai
Central Chennai
Chetpet (Chennai)
Chettimedu, Chennai
Chinnakudal
Chinnasekkadu
Chintadripet
Choolai
Choolaimedu
Doveton, Chennai
Echankuzhi
Edayanchavadi
Egmore
Ekkaduthangal
Elandhanjery
Elanthanoor
Elephant Gate
Ernavoor
Erukkanchery
Gandhi Nagar, Chennai
General Kumaramangalam Colony
Gerugambakkam
Gnayiru
Gopalapuram, Chennai
Gounderpalayam
Grant Lyon
Greenways Road
Guindy
Guindy Thiru Vi Ka Estate
ICF Colony
Indira Nagar, Chennai
The Island, Chennai
Jafferkhanpet
Jalladiampet
Jawahar Nagar
K. K. Nagar, Chennai
Kadapakkam, Chennai
Kadaperi
Kalakkral
Kalanji
Kallikuppam
Kamarajapuram, Anakaputhur
Kannammapet
Kanniammanpettai
Karapakkam
Karungali
Kasturba Nagar, Chennai
Kattupakkam
Kattupalli
Kattur, Chennai
Kavankarai
Kaviyarasu Kannadhasan Nagar
Kelambakkam
Kellys
Kilpauk
Kodambakkam
Kodungaiyur
Kolathur, Chennai
Kondithope
Korattur
Korukkupet
Kosapet
Kosappur
Kothawal Chavadi
Kotturpuram
Koyambedu
Kumaran Nagar
Lakshmipuram, Chennai
Madhavaram Milk Colony
Madhavaram, Chennai
Madhya Kailash Junction
Madipakkam, Chennai
Maduravoyal
Mahakavi Bharathi Nagar
Mambalam
Manali Pudhunagar
Manali, Chennai
Manapakkam
Mandavelli
Mangadu
Manjambakkam
Mathur, Chennai
Meenambakkam
MGR Nagar
Minjur
Mogappair
Moolakadai
Moolakothalam
Moulivakkam
Mugalivakkam
Mylapore
Mylapore (Corporation zone)
Nandambakkam
Nandanam
Nanganallur
Nerkundram
Nesapakkam
Nolambur
Nungambakkam
Otteri
Padi, Chennai
Padianallur
Palavakkam
Palavanthangal
Pallikaranai
Pammal
Parameshwari Nagar
Park Town, Chennai
Parry's Corner
Pattalam, Chennai
Pazhaya Erumaivettipalayam
Pazhayanaappaalayam
Peddanaickenpettah
Perambur
Peravallur
Periamet
Periyakudal
Periyar Nagar
Periyasekkadu
Perungavoor
Perungudi
Ponniammanmedu
Porur
Pudhu Erumaivettipalayam
Pudhunaappaalayam
Pudhur
Pudupet (Chennai)
Pulianthope
Pulli Lyon
Purasawalkam
Puzhudhivakkam
Puzhuthivakkam
Raghava Nagar
Raja Annamalaipuram
Raja Nagar
Rajakilpakkam
Ramapuram, Chennai
Royapettah
Sadayankuppam
Saidapet
Saligramam
Salt Cotaurs
Sathiya Moorthy Nagar
Selavayal
Sembium
Semmencherry
Sencheri
Sengundram
Senthil Nagar
Shenoy Nagar
Sholavaram
Sholinganallur
Sirugavoor
Siruvallur
South Chennai
Sowcarpet
Srinivasapuram
St. Thomas Mount
Subramania Nagar
Surapet
T. Nagar
Tambaram Sanatorium
Teynampet
Thangalperumbulam
Tharamani
Theeyampakkam
Thiru. Vi. Ka. Nagar
Thirumalai nagar
Thirumangalam, Chennai
Thirumudivakkam
Thirumullaivoyal
Thuraipakkam
Tiruverkadu
Tondiarpet
Trustpuram
Vada Agaram`.split('\n').map(s => s.trim()).filter(Boolean);

const SUBURB_RAW = `Arakkonam
Avadi
Ayanambakkam
Chengalpattu
Covelong
Cowl Bazaar
Egattur
Guduvancheri
Iyyapanthangal
Karanodai
Keelkattalai
Kilambakkam
Kovur, Chennai
Mannadi, Chennai
Mannivakkam
Morai, Chennai
Nagappa Nagar
Navalur
Nazarethpettai
Oragadam
Padappai
Pallavaram
Panambakkam
Pattabiram
Perambakkam
Polichalur
Poonamallee
Pudupakkam
Pulhal
Selaiyur
Siruseri
Sriperumbudur
Thalambur
Thiruninravur
Tirusulam
Urapakkam
Vandalur`.split('\n').map(s => s.trim()).filter(Boolean);

const EXTRA_RAW = `Assisi Nagar
Chepauk
Foreshore Estate
Kathivakkam
Kanathur, Chennai
Pudhuvannarapettai
Vallalar Nagar
Varadharajapuram
Vichoor
Vilangadupakkam
Ottivakkam
Pattaravakkam
Perumbakkam
Vadaperumbakkam
Sembiyam
Madhya Kailash Junction
Foreshore Estate
Royapuram
Washermenpet
Flower Bazaar
Mannady
Mint, Chennai
Triplicane`.split('\n').map(s => s.trim()).filter(Boolean);

const PARK_RAW = `Anna Nagar Tower Park
Arignar Anna Zoological Park
Dr. Annie Besant Park
Guindy National Park
Kalaignar Centenary Park
Mathur MMDA Park
May Day Park, Chennai
Nageshwara Rao Park
Natesan Park
Nehru Park, Chennai
Panagal Park
People's Park, Chennai
Perambur Flyover Park
Secretariat Park
Thiru. Vi. Ka. Park`.split('\n').map(s => s.trim()).filter(Boolean);

const LAKE_RAW = `Adambakkam Lake
Ambattur Lake
Ayanambakkam Lake
Chembarambakkam Lake
Chetpet Lake
Chitlapakkam Lake
ICF Lake
Korattur Lake
Madambakkam Lake
Madhavaram Lake
Pallavaram Lake
Paruthipattu Lake
Perungudi Lake
Porur Lake
Pulhal Lake
Retteri Lake
Sholavaram Lake
Velachery Lake
Vilanjiyambakkam Lake
Villivakkam Lake`.split('\n').map(s => s.trim()).filter(Boolean);

const ISLAND_RAW = `Kattupalli Island
Quibble Island`.split('\n').map(s => s.trim()).filter(Boolean);

// ── Build deduplicated zone list ─────────────────────────────────────────────

const allPlaceRaw = [...NEIGHBOURHOOD_RAW, ...SUBURB_RAW, ...EXTRA_RAW];
const seen = new Set();
const ZONE_NAMES = [];

for (const raw of allPlaceRaw) {
  const clean = cleanName(raw);
  const key = clean.toLowerCase().trim();
  if (seen.has(key)) continue;
  if (NON_PLACE_RE.test(raw)) continue;
  if (EXISTING.has(key)) continue;
  seen.add(key);
  ZONE_NAMES.push({ raw, clean });
}

console.log(`Zone names to geocode: ${ZONE_NAMES.length}`);
console.log(`Parks: ${PARK_RAW.length}, Lakes: ${LAKE_RAW.length}, Islands: ${ISLAND_RAW.length}`);

// ── Geocoding ────────────────────────────────────────────────────────────────

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
// Chennai metro area bounding box: S,W,N,E
const BBOX = '12.55,79.7,13.45,80.4';

async function geocode(name, suffix = 'Chennai, India') {
  const q = encodeURIComponent(`${name}, ${suffix}`);
  const url = `${NOMINATIM}?q=${q}&format=json&limit=1&accept-language=en&bounded=1&viewbox=79.7,12.55,80.4,13.45`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'ChennaiSafe/1.0 (educational project)' } });
    const data = await r.json();
    if (data && data[0]) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display: data[0].display_name };
    }
    // Retry without bounding box
    const url2 = `${NOMINATIM}?q=${q}&format=json&limit=1&accept-language=en`;
    const r2 = await fetch(url2, { headers: { 'User-Agent': 'ChennaiSafe/1.0 (educational project)' } });
    const data2 = await r2.json();
    if (data2 && data2[0]) {
      return { lat: parseFloat(data2[0].lat), lng: parseFloat(data2[0].lon), display: data2[0].display_name };
    }
  } catch (e) {
    console.error(`  Error geocoding "${name}":`, e.message);
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Score interpolation ──────────────────────────────────────────────────────

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function interpolate(lat, lng) {
  // IDW (inverse distance weighting) from anchors
  const dists = ANCHORS.map(a => ({ a, d: haversineKm(lat, lng, a.lat, a.lng) }));
  dists.sort((x, y) => x.d - y.d);
  const nearest = dists.slice(0, 6);

  const eps = 0.01; // avoid div by zero
  const weights = nearest.map(({ d }) => 1 / (d + eps) ** 2);
  const wSum = weights.reduce((s, w) => s + w, 0);

  const scoreKeys = ['connectivity','amenities','schools','greenery','safety','value'];
  const scores = {};
  for (const k of scoreKeys) {
    scores[k] = Math.round(nearest.reduce((s, { a }, i) => s + weights[i] * a.s[k], 0) / wSum);
  }
  const flood = Math.round(nearest.reduce((s, { a }, i) => s + weights[i] * a.flood, 0) / wSum);
  const priceMin = Math.round(nearest.reduce((s, { a }, i) => s + weights[i] * a.p[0], 0) / wSum / 100) * 100;
  const priceMax = Math.round(nearest.reduce((s, { a }, i) => s + weights[i] * a.p[1], 0) / wSum / 100) * 100;

  return { scores, flood, priceMin, priceMax };
}

function floodTier(score) {
  if (score <= 25) return 'low';
  if (score <= 45) return 'medium';
  if (score <= 65) return 'high';
  return 'very-high';
}

// Rough commute estimate (haversine + avg speed)
const HUBS = {
  omr:     { lat: 12.9010, lng: 80.2279 },
  guindy:  { lat: 13.0067, lng: 80.2206 },
  ambattur:{ lat: 13.1142, lng: 80.1548 },
  airport: { lat: 12.9941, lng: 80.1709 },
  tnagar:  { lat: 13.0418, lng: 80.2341 },
  central: { lat: 13.0827, lng: 80.2707 },
};
function estimateCommute(lat, lng) {
  const commute = {};
  for (const [k, h] of Object.entries(HUBS)) {
    const km = haversineKm(lat, lng, h.lat, h.lng);
    commute[k] = Math.round(Math.max(8, km * 3.5)); // ~17km/h avg city speed
  }
  return commute;
}

function autoTags(scores, flood) {
  const tags = [];
  if (scores.connectivity >= 80) tags.push('well-connected');
  if (scores.amenities >= 80) tags.push('amenities-rich');
  if (scores.schools >= 80) tags.push('schools');
  if (scores.greenery >= 65) tags.push('green');
  if (flood <= 25) tags.push('low-flood-risk');
  if (flood >= 65) tags.push('flood-prone');
  if (scores.value >= 65) tags.push('affordable');
  if (scores.value <= 35) tags.push('premium');
  return tags;
}

function bestFor(scores, flood) {
  const bf = [];
  if (scores.schools >= 75 && flood <= 45) bf.push('families');
  if (scores.connectivity >= 80) bf.push('it-workers');
  if (scores.value >= 60) bf.push('budget');
  if (scores.value <= 35 && scores.amenities >= 80) bf.push('premium');
  if (flood <= 30 && scores.amenities >= 70) bf.push('retired');
  return bf.length ? bf : ['general'];
}

// ── Main geocoding loop ──────────────────────────────────────────────────────

async function geocodeAll(items, suffix = 'Chennai, India') {
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const name = typeof items[i] === 'string' ? items[i] : items[i].clean;
    const display = typeof items[i] === 'string' ? items[i] : items[i].raw;
    process.stdout.write(`  [${i+1}/${items.length}] ${name} ... `);
    const geo = await geocode(name, suffix);
    if (geo) {
      console.log(`✓ ${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}`);
      results.push({ name: typeof items[i] === 'string' ? items[i] : items[i].raw, clean: name, ...geo });
    } else {
      console.log(`✗ not found`);
      results.push({ name: display, clean: name, lat: null, lng: null });
    }
    await sleep(1100); // Nominatim rate limit: 1 req/sec
  }
  return results;
}

// ── Run ──────────────────────────────────────────────────────────────────────

console.log('\n=== Geocoding neighbourhood zones ===');
const zoneGeo = await geocodeAll(ZONE_NAMES);

console.log('\n=== Geocoding parks ===');
const parkGeo = await geocodeAll(PARK_RAW.map(n => n.replace(/,\s*Chennai$/, '')));

console.log('\n=== Geocoding lakes ===');
const lakeGeo = await geocodeAll(LAKE_RAW.map(n => n.replace(/,\s*Chennai$/, '')));

console.log('\n=== Geocoding islands ===');
const islandGeo = await geocodeAll(ISLAND_RAW);

// ── Build output data ────────────────────────────────────────────────────────

function buildZone(item) {
  const { scores, flood, priceMin, priceMax } = interpolate(item.lat, item.lng);
  const tier = floodTier(flood);
  const commute = estimateCommute(item.lat, item.lng);
  const cleanN = cleanName(item.name);
  return {
    id: toId(cleanN),
    name: cleanN,
    lat: parseFloat(item.lat.toFixed(5)),
    lng: parseFloat(item.lng.toFixed(5)),
    district: 'Chennai',
    autoGenerated: true,
    floodScore: flood,
    floodTier: tier,
    floodEvents: [],
    floodNote: tier === 'very-high' ? 'High flood risk area based on proximity to flood-prone zones.'
             : tier === 'high' ? 'Moderate-high flood risk. Check local drainage before buying.'
             : tier === 'medium' ? 'Moderate flood risk. Generally safe on upper floors.'
             : 'Low flood risk area.',
    priceMin, priceMax, priceTrend: 'N/A',
    elevation: flood <= 30 ? 'Medium-High' : flood <= 50 ? 'Medium' : 'Low',
    commute,
    metro: 'Check local transit', metroDistance: null,
    bus: 'Available',
    highlights: autoTags(scores, flood).map(t => t.charAt(0).toUpperCase() + t.slice(1).replace(/-/g, ' ')),
    concerns: flood >= 65 ? ['Flood-prone area'] : [],
    bestFor: bestFor(scores, flood),
    tags: autoTags(scores, flood),
    scores,
  };
}

function buildPoint(item, type) {
  const cleanN = cleanName(item.name);
  return {
    id: toId(cleanN),
    name: cleanN,
    type,
    lat: parseFloat(item.lat.toFixed(5)),
    lng: parseFloat(item.lng.toFixed(5)),
  };
}

const zones    = zoneGeo.filter(z => z.lat).map(buildZone);
const parks    = parkGeo.filter(p => p.lat).map(p => buildPoint(p, 'park'));
const lakes    = lakeGeo.filter(l => l.lat).map(l => buildPoint(l, 'lake'));
const islands  = islandGeo.filter(i => i.lat).map(i => buildPoint(i, 'island'));

const failed = zoneGeo.filter(z => !z.lat).map(z => z.name);
if (failed.length) console.log(`\nFailed to geocode (${failed.length}): ${failed.join(', ')}`);

// ── Write output ─────────────────────────────────────────────────────────────

const outPath = new URL('../data/neighbourhoods-auto.js', import.meta.url).pathname;

const output = `// AUTO-GENERATED by scripts/generate-neighbourhoods.mjs
// Do not edit manually — re-run the script to regenerate.
// Generated: ${new Date().toISOString()}
// Sources: Wikipedia Category:Neighbourhoods_in_Chennai, Suburbs_of_Chennai, Chennai_geography_stubs
// ${zones.length} zones | ${parks.length} parks | ${lakes.length} lakes | ${islands.length} islands

const NEIGHBOURHOOD_ZONES = ${JSON.stringify(zones, null, 2)};

const CHENNAI_PARKS = ${JSON.stringify(parks, null, 2)};

const CHENNAI_LAKES = ${JSON.stringify(lakes, null, 2)};

const CHENNAI_ISLANDS = ${JSON.stringify(islands, null, 2)};
`;

writeFileSync(outPath, output, 'utf8');
console.log(`\n✅ Written to ${outPath}`);
console.log(`   ${zones.length} zones, ${parks.length} parks, ${lakes.length} lakes, ${islands.length} islands`);
