# 🏠 IllamAI — Smart Neighbourhood Guide

> **AI-powered home-buying guide for Indian cities** — compare risk factors, commute times, property prices and liveability across neighbourhoods, all on one interactive map.

🔗 **Live site:** [vigneshtamilvanan.github.io/Illam-AI](https://vigneshtamilvanan.github.io/Illam-AI/)

---

## What is IllamAI?

IllamAI (*illam* = home/place in Tamil/Sanskrit) helps home buyers in India make confident, data-driven decisions before purchasing property.

Instead of relying on broker recommendations or gut feeling, IllamAI lets you:

- **See every neighbourhood at a glance** — colour-coded markers on a map show composite liveability scores across 57 curated zones + 146 neighbourhoods
- **Know the real risk factors** — built on ALOS PALSAR 12.5 m satellite DEM data and historical events, not just anecdotal reports
- **Compare commute times** — to 6 major employment hubs (OMR/IT Corridor, Guindy, Ambattur, Airport, T Nagar, Central)
- **Get personalised Top Picks** — set your budget, commute and lifestyle preferences and get an instant ranked shortlist

---

## Key Features

| Feature | Description |
|---------|-------------|
| 🗺️ **Interactive Map** | Hybrid satellite / Google Normal / OSM basemaps with toggleable layers |
| 🎯 **Preference Engine** | Filter by budget, work location, lifestyle and family needs |
| 📍 **Drop-a-Pin** | Click anywhere on the map for an instant area risk & liveability report |
| 🌊 **Risk Factor Layers** | Stream network overlay from ALOS PALSAR DEM analysis |
| 🚇 **Metro Lines** | CMRL Phase 1, Phase 2 and approved Phase 3 corridors |
| 🌳 **Parks & Lakes** | 249 parks and 310 lakes plotted as toggleable layers |
| ⭐ **My Picks** | Save and compare your shortlisted zones |
| 📊 **Zone Profiles** | Property rates, commute times, metro distance, school scores, safety scores per zone |

---

## Data Sources

| Data | Source |
|------|--------|
| Risk factor scores | ALOS PALSAR 12.5 m DEM stream network + historical events |
| Property rates | TN Registration Dept. guideline values (₹/sq ft) |
| Commute estimates | Haversine × 1.35 road factor at 20 km/h peak average |
| Facilities (hospitals, schools, malls) | OpenStreetMap Overpass API (live query) |
| Metro lines & stations | CMRL Phase 1, 2 & approved Phase 3 data |
| Neighbourhood boundaries | Wikipedia + OpenStreetMap |

---

## How to Use

1. **Open the map** at the live link above
2. **Tap the Preferences bar** at the bottom → set your budget, work location and lifestyle
3. **Explore zone markers** — green = high liveability, yellow = moderate, red = lower
4. **Tap any zone** for a full area report (risk score, price range, commute, metro, nearby facilities)
5. **Drop a custom pin** anywhere for an instant report on any location
6. **Hit "Show My Best Zones"** to get a ranked Top Picks shortlist personalised to your preferences

---

## Coverage

Currently covering **Chennai, Tamil Nadu** with:
- 57 hand-curated zones with full data profiles
- 146 auto-generated neighbourhood zones
- 249 parks and 310 lakes

**Coming soon:** Mumbai, Bengaluru, Hyderabad, Delhi NCR, Pune

---

## Tech Stack

- **Leaflet.js** — interactive maps
- **ALOS PALSAR DEM** — terrain & risk analysis
- **OpenStreetMap / Overpass API** — facilities data
- **Vanilla JS / HTML / CSS** — no frameworks, fast load
- **GitHub Pages** — hosting

---

## Project Structure

```
Illam-AI/
├── index.html              # Main app shell
├── css/app.css             # All styles
├── js/
│   ├── app.js              # Core app logic, map, filters, scoring
│   └── flood-score.js      # Risk proximity scorer
├── data/
│   ├── chennai-data.js     # 57 curated zone profiles
│   ├── neighbourhoods-auto.js  # 146 auto-generated zones + parks/lakes
│   └── streams_line_3.js   # Stream network GeoJSON
└── README.md
```

---

## Contributing

Pull requests are welcome. If you'd like to add data for a new city or improve zone profiles, open an issue first to discuss.

---

*Built for Indian home-buyers · Data updated 2025*
