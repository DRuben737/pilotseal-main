export async function geocodeLocation(locationName) {
  try {
    const response = await fetch(`/api/geocode?query=${encodeURIComponent(locationName)}`);

    if (!response.ok) {
      throw new Error(`Geocoding API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (!data) {
      throw new Error('Location not found. Please try a different name or airport code.');
    }

    return {
      lat: parseFloat(data.lat),
      lon: parseFloat(data.lon),
      displayName: data.displayName || locationName,
    };
  } catch {
    throw new Error('Failed to fetch location coordinates.');
  }
}
