/**
 * Géocode une adresse via l'API Nominatim (OpenStreetMap).
 * Retourne { lat, lon, displayName } ou null si rien trouvé.
 * Lève une erreur si le service est indisponible.
 */
export async function geocodeAddress(address) {
  if (!address || !address.trim()) return null
  const url =
    'https://nominatim.openstreetmap.org/search?q=' +
    encodeURIComponent(address.trim()) +
    '&format=json&limit=1&addressdetails=0'
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'HubGuitariste/1.0 (usage-prive, professeur-guitare)',
      'Accept-Language': 'fr',
    },
  })
  if (!res.ok) throw new Error('Service de géocodage indisponible (HTTP ' + res.status + ').')
  const data = await res.json()
  if (!data.length) return null
  return {
    lat:         parseFloat(data[0].lat),
    lon:         parseFloat(data[0].lon),
    displayName: data[0].display_name,
  }
}
