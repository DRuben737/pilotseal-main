export async function geocodeLocation(locationName) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationName)}&format=json&limit=1`
    );

    if (!response.ok) {
      throw new Error(`Geocoding API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (!data || data.length === 0) {
      throw new Error('Location not found. Please try a different name or airport code.');
    }

    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      displayName: data[0].display_name || locationName,
    };
  } catch (error) {
    console.error('geocodeLocation error:', error);
    throw new Error('Failed to fetch location coordinates.');
  }
}