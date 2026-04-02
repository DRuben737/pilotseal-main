export async function getLatLongFromLocation(query) {
  const response = await fetch(`/api/geocode?query=${encodeURIComponent(query)}`);
  if (!response.ok) return null;
  const data = await response.json();
  if (!data) return null;
  return {
    lat: parseFloat(data.lat),
    lon: parseFloat(data.lon),
    displayName: data.displayName || query,
  };
}
