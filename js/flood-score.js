// ============================================================
// IllamAI — Stream-Proximity Flood Scorer
// Computes real-time flood risk for any lat/lng using the
// actual stream GeoJSON derived from ALOS PALSAR DEM data.
// ============================================================

const FloodScorer = (() => {

  // Minimum distance to nearest stream (degrees), cached after first run
  let _streamCoords = null;  // flat array of [lat, lng] pairs per segment

  function buildSegmentCache(geojson) {
    if (_streamCoords) return;
    _streamCoords = [];
    geojson.features.forEach(f => {
      const coords = f.geometry.coordinates; // [lng, lat] per GeoJSON spec
      for (let i = 0; i < coords.length - 1; i++) {
        // Store as [lat, lng] pairs for each segment
        _streamCoords.push([
          coords[i][1],  coords[i][0],   // start lat, lng
          coords[i+1][1], coords[i+1][0] // end lat, lng
        ]);
      }
    });
  }

  // Squared distance from point (px,py) to segment (ax,ay)-(bx,by)
  function sqDistToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    if (dx === 0 && dy === 0) {
      return (px - ax) ** 2 + (py - ay) ** 2;
    }
    const t = Math.max(0, Math.min(1,
      ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    ));
    return (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
  }

  // Returns distance to nearest stream in meters
  function distToNearestStream(lat, lng) {
    if (!_streamCoords || _streamCoords.length === 0) return null;

    let minSqDist = Infinity;
    for (let i = 0; i < _streamCoords.length; i++) {
      const [ax, ay, bx, by] = _streamCoords[i];
      const sq = sqDistToSegment(lat, lng, ax, ay, bx, by);
      if (sq < minSqDist) minSqDist = sq;
    }

    // 1 degree lat ≈ 111,320m; 1 degree lng ≈ 111,320 * cos(lat)
    const latM = 111320;
    const lngM = 111320 * Math.cos(lat * Math.PI / 180);
    // Convert from degrees² to meters — approximate via average scale
    const avgScale = (latM + lngM) / 2;
    return Math.sqrt(minSqDist) * avgScale;
  }

  // Score: 0 = safe, 100 = on a stream
  function streamProximityScore(distMeters) {
    if (distMeters === null) return null;
    if (distMeters < 30)   return 95;
    if (distMeters < 100)  return 88;
    if (distMeters < 250)  return 78;
    if (distMeters < 500)  return 65;
    if (distMeters < 800)  return 52;
    if (distMeters < 1200) return 40;
    if (distMeters < 2000) return 28;
    if (distMeters < 3000) return 18;
    return 10;
  }

  function tierFromScore(score) {
    if (score >= 70) return 'very-high';
    if (score >= 50) return 'high';
    if (score >= 30) return 'moderate';
    return 'low';
  }

  function humanDist(m) {
    return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
  }

  // ── Public API ────────────────────────────────────────────
  return {
    init(geojson) {
      if (geojson) buildSegmentCache(geojson);
    },

    // Returns { distMeters, score, tier, label } for a lat/lng
    analyze(lat, lng) {
      const dist = distToNearestStream(lat, lng);
      if (dist === null) return null;
      const score = streamProximityScore(dist);
      const tier = tierFromScore(score);
      return { distMeters: Math.round(dist), score, tier, distLabel: humanDist(dist) };
    },

    // Blended score: 60% zone historical data, 40% stream proximity
    blendedScore(zoneScore, streamScore) {
      if (streamScore === null) return zoneScore;
      return Math.round(zoneScore * 0.6 + streamScore * 0.4);
    },
  };
})();
