export async function getLatLongFromLocation(query) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&format=json&limit=1`
  );
  const data = await response.json();
  if (!data || data.length === 0) return null;
  const { lat, lon, display_name } = data[0];
  return {
    lat: parseFloat(lat),
    lon: parseFloat(lon),
    displayName: display_name || query,
  };
}