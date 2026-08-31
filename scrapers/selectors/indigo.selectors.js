/**
 * Centralized DOM & CSS Selectors for IndiGo Flight Portal
 */

module.exports = {
  // Navigation & URL Structure
  searchUrl: "https://www.goindigo.in",

  // Input Fields
  originInput: 'input[name="or-src"], input[placeholder*="From"], #source',
  destinationInput: 'input[name="or-dest"], input[placeholder*="To"], #destination',
  departureDateInput: 'input[name="or-depart"], input[placeholder*="Depart"], #departDate',
  searchButton: 'button[type="submit"], .btn-search, button:has-text("Search Flights")',

  // Flight Card Selectors
  flightCard: '.fare-accordion, .flight-card, [data-flight-card], .fare-accordion__head',
  flightInfoPrimary: '.fare-accordion__head__flight-info-pri, .flight-info-pri',
  flightNumber: '.flight-number, .fare-accordion__head__flight-info-pri .flight-no, .flight-num',
  departureTime: '.departure-time, .fare-accordion__head__flight-info-pri .dept-time, .time-dept',
  arrivalTime: '.arrival-time, .fare-accordion__head__flight-info-pri .arr-time, .time-arr',
  duration: '.flight-duration, .duration, .fare-accordion__head__flight-info-pri .time-duration',
  stops: '.flight-stops, .stops, .fare-accordion__head__flight-info-pri .non-stop',
  fareType: '.fare-type, .fare-badge, .cabin-class',
  totalPrice: '.fare-accordion__head__price, .price, .fare-price, .total-fare, .currency-inr',

  // Airport name hints
  nearbyAirport: '.near-by-airport',
  originAirportCode: '[data-origin-code], .dept-airport-code',
  destAirportCode: '[data-dest-code], .arr-airport-code'
};
