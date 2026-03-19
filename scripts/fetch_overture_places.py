#!/usr/bin/env python3
"""
ChennaiSafe — Overture Maps Places Fetcher
==========================================
Downloads POI/place data for the Chennai bounding box from Overture Maps
(public S3 dataset) and converts it to a compact JSON file for the web app.

Usage:
    pip install overturemaps
    python scripts/fetch_overture_places.py

Output:
    data/overture-places-chennai.json   (~100-500 KB, served statically)

The app loads this file at runtime to supplement OSM Overpass facility counts
with Overture's richer, deduplicated dataset (sourced from Meta, TomTom, etc.)
"""

import json
import sys
from pathlib import Path

# ── Chennai bounding box: west, south, east, north ────────────────────────────
BBOX = "80.09,12.87,80.34,13.25"

# ── Category mapping: Overture → app categories ───────────────────────────────
# Overture uses GERS (Global Entity Reference System) category taxonomy
CATEGORY_MAP = {
    # Healthcare
    "health_and_medical":       "hospital",
    "hospital":                 "hospital",
    "clinic":                   "hospital",
    "doctor":                   "hospital",
    "pharmacy":                 "pharmacy",
    "dentist":                  "hospital",
    # Education
    "education":                "school",
    "school":                   "school",
    "college":                  "school",
    "university":               "school",
    "tutoring":                 "school",
    # Finance
    "bank":                     "bank",
    "atm":                      "bank",
    "financial_service":        "bank",
    # Shopping
    "grocery":                  "supermarket",
    "supermarket":              "supermarket",
    "convenience_store":        "supermarket",
    "shopping":                 "supermarket",
    # Parks / Recreation
    "park":                     "park",
    "recreation_area":          "park",
    "playground":               "park",
    "sports_and_recreation":    "park",
    # Transit
    "transit_station":          "transit",
    "train_station":            "transit",
    "bus_station":              "transit",
    "metro_station":            "transit",
    # Restaurants
    "restaurant":               "restaurant",
    "food_and_drink":           "restaurant",
    "cafe":                     "restaurant",
}


def fetch_with_cli(bbox: str, output_path: Path):
    """Use the official overturemaps CLI to download place data."""
    import subprocess
    tmp_file = output_path.parent / "_overture_tmp.geojson"
    cmd = [
        "overturemaps", "download",
        f"--bbox={bbox}",
        "-f", "geojson",
        "--type=place",
        "-o", str(tmp_file),
    ]
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"CLI error:\n{result.stderr}")
        sys.exit(1)
    return tmp_file


def categorize(feature: dict) -> str | None:
    """Extract a simplified app-category from an Overture place feature."""
    cats = feature.get("properties", {}).get("categories", {})
    primary = cats.get("primary", "")
    alternates = cats.get("alternate", []) or []
    for candidate in [primary] + alternates:
        key = candidate.lower().replace(" ", "_").replace("-", "_")
        if key in CATEGORY_MAP:
            return CATEGORY_MAP[key]
        # Prefix match (e.g. "health_and_medical_pharmacy" → pharmacy)
        for pattern, mapped in CATEGORY_MAP.items():
            if key.startswith(pattern) or pattern in key:
                return mapped
    return None


def extract_coords(geometry: dict) -> tuple[float, float] | None:
    """Return (lat, lng) from a GeoJSON geometry."""
    gtype = geometry.get("type")
    coords = geometry.get("coordinates")
    if gtype == "Point" and coords:
        return coords[1], coords[0]          # lng,lat → lat,lng
    if gtype in ("Polygon", "MultiPolygon"):
        # Centroid approximation using first ring's first point
        if gtype == "Polygon":
            ring = coords[0]
        else:
            ring = coords[0][0]
        lats = [c[1] for c in ring]
        lngs = [c[0] for c in ring]
        return sum(lats) / len(lats), sum(lngs) / len(lngs)
    return None


def convert(geojson_path: Path, out_path: Path):
    """Parse raw Overture GeoJSON → compact app JSON."""
    print(f"Converting {geojson_path} …")

    places = []
    skipped = 0

    with open(geojson_path) as f:
        # Overture CLI outputs newline-delimited features, not a full GeoJSON
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                feature = json.loads(line)
            except json.JSONDecodeError:
                skipped += 1
                continue

            category = categorize(feature)
            if not category:
                skipped += 1
                continue

            props = feature.get("properties", {})
            geom = feature.get("geometry", {})
            coords = extract_coords(geom)
            if not coords:
                skipped += 1
                continue

            lat, lng = coords
            names = props.get("names", {})
            name = (
                names.get("primary")
                or (names.get("common", [{}]) or [{}])[0].get("value", "")
                or ""
            )
            confidence = props.get("confidence", 0)

            places.append({
                "n": name,          # name
                "c": category,      # app category
                "t": round(lat, 6),  # lat
                "g": round(lng, 6),  # lng
                "cf": round(confidence, 2),
            })

    # Sort by confidence desc, then by name
    places.sort(key=lambda p: (-p["cf"], p["n"]))

    result = {
        "source": "Overture Maps Foundation",
        "bbox": BBOX,
        "generated": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "count": len(places),
        "places": places,
    }

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))

    print(f"✅  Wrote {len(places)} places to {out_path}  ({out_path.stat().st_size // 1024} KB)")
    print(f"    Skipped {skipped} features (uncategorised or no coords)")

    # Category breakdown
    from collections import Counter
    counts = Counter(p["c"] for p in places)
    for cat, n in counts.most_common():
        print(f"    {cat:15s}  {n}")


def main():
    repo_root = Path(__file__).parent.parent
    data_dir = repo_root / "data"
    data_dir.mkdir(exist_ok=True)

    out_path = data_dir / "overture-places-chennai.json"
    tmp_geojson = data_dir / "_overture_tmp.geojson"

    # Check if already downloaded
    if tmp_geojson.exists():
        print(f"Using existing download: {tmp_geojson}")
    else:
        try:
            tmp_geojson = fetch_with_cli(BBOX, data_dir / "overture-places")
        except FileNotFoundError:
            print(
                "ERROR: 'overturemaps' CLI not found.\n"
                "Install it with:  pip install overturemaps\n"
                "Then re-run this script."
            )
            sys.exit(1)

    convert(tmp_geojson, out_path)

    # Clean up temp file
    if tmp_geojson.exists():
        tmp_geojson.unlink()
        print("    Cleaned up temp file.")

    print(
        f"\nNext steps:\n"
        f"  1. The file data/overture-places-chennai.json is ready to serve.\n"
        f"  2. Add to index.html: <script src=\"data/overture-places-chennai.json\"></script>\n"
        f"     (Or load via fetch() in app.js using loadOverturePlaces())\n"
        f"  3. The app will merge Overture counts with OSM Overpass counts in facility grids."
    )


if __name__ == "__main__":
    main()
