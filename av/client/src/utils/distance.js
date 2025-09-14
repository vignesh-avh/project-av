/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 Latitude of point 1
 * @param {number} lon1 Longitude of point 1
 * @param {number} lat2 Latitude of point 2
 * @param {number} lon2 Longitude of point 2
 * @returns {number} Distance in kilometers
 */
export const haversine = (lat1, lon1, lat2, lon2) => {
  // Input validation
  if ([lat1, lon1, lat2, lon2].some(coord => 
      typeof coord !== 'number' || isNaN(coord))) {
    throw new Error("Invalid coordinate input");
  }
  
  // Convert to radians
  const toRad = value => value * Math.PI / 180;
  const R = 6371; // Earth radius in km
  
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(toRad(lat1)) * 
    Math.cos(toRad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return R * c;
};

/**
 * Validate Indian coordinates
 * @param {number} lat Latitude
 * @param {number} lng Longitude
 * @returns {boolean} True if valid Indian coordinates
 */
export const isValidIndianCoordinate = (lat, lng) => {
  return (
    !isNaN(lat) && !isNaN(lng) &&
    lat >= 6.0 && lat <= 38.0 &&  // Updated to 38.0
    lng >= 68.0 && lng <= 98.0
  );
};