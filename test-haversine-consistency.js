// Test if both Haversine implementations produce identical results

// Booking service Haversine
function haversineBooking(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRad(lat2 - lat1);
  const deltaLon = toRad(lon2 - lon1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(deltaLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Pricing engine Haversine
function haversinePricing(origin, destination) {
  if (!origin || !destination) return undefined;

  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(destination.latitude - origin.latitude);
  const deltaLon = toRadians(destination.longitude - origin.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(origin.latitude)) *
      Math.cos(toRadians(destination.latitude)) *
      Math.sin(deltaLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Test cases: (lat1, lon1, lat2, lon2)
const testCases = [
  [14.5995, 120.9842, 14.6091, 120.9930], // Manila area, ~1km apart
  [14.5995, 120.9842, 14.5, 121.5],       // ~55km apart
  [14.5995, 120.9842, 14.5995, 120.9842], // Same location
  [0, 0, 0, 1],                            // Equator
];

console.log('Testing Haversine consistency:');
console.log('═'.repeat(70));

testCases.forEach(([lat1, lon1, lat2, lon2], i) => {
  const bookingResult = haversineBooking(lat1, lon1, lat2, lon2);
  const pricingResult = haversinePricing(
    { latitude: lat1, longitude: lon1 },
    { latitude: lat2, longitude: lon2 }
  );
  
  const diff = Math.abs(bookingResult - pricingResult);
  const match = diff < 0.0001 ? '✓ MATCH' : '✗ MISMATCH';
  
  console.log(`\nTest ${i + 1}: (${lat1}, ${lon1}) → (${lat2}, ${lon2})`);
  console.log(`  Booking service: ${bookingResult.toFixed(6)} km`);
  console.log(`  Pricing engine:  ${pricingResult.toFixed(6)} km`);
  console.log(`  Difference:      ${diff.toFixed(8)} km ${match}`);
});

console.log('\n' + '═'.repeat(70));
