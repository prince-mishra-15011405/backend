/**
 * Centralized DOM, CSS & XPath Selectors for Air India Portal & Booking Widget
 * Extracted from Air India's Angular UI (<ai-bookingwidget> & <ai-pb-flight-item-listing>)
 */

module.exports = {
  // Navigation
  baseUrl: "https://www.airindia.com",

  // Cookie Consent & Overlay Selectors (OneTrust)
  cookies: {
    container: "#onetrust-consent-sdk",
    banner: "#onetrust-banner-sdk",
    acceptButton: "#onetrust-accept-btn-handler, #accept-recommended-btn-handler",
    closeButton: "#close-pc-btn-handler, .onetrust-close-btn-handler",
    darkFilter: ".onetrust-pc-dark-filter",
    allOverlays: "#onetrust-consent-sdk, #onetrust-banner-sdk, #onetrust-pc-sdk, .onetrust-pc-dark-filter, .ot-fade-in, .ot-sdk-container, .ot-pc-dark-filter"
  },

  // Booking Widget Form Selectors (Homepage)
  widget: {
    container: ".ai-home-booking-container, ai-bookingwidget, #search-flight",
    tripTypeOneWayRadio: 'input[type="radio"][value="one-way"], label:has-text("One Way"), .ai-radio-group__option:nth-child(2)',
    tripTypeRoundTripRadio: 'input[type="radio"][value="round-trip"]',

    // Origin Input
    originField: ".ai-origin-destination__field--origin",
    originInput: ".ai-origin-destination__field--origin input.ai-autocomplete-input, .ai-origin-destination__field--origin input[role='combobox']",

    // Destination Input
    destinationField: ".ai-origin-destination__field--destination",
    destinationInput: ".ai-origin-destination__field--destination input.ai-autocomplete-input, .ai-origin-destination__field--destination input[role='combobox']",

    // Autocomplete Dropdown
    autocompletePanel: "mat-autocomplete, .ai-autocomplete-dropdown, .mat-mdc-autocomplete-panel",
    autocompleteOption: "mat-option, .mat-mdc-option, .ai-autocomplete-dropdown mat-option",

    // Date & Passenger Selectors
    dateSectionButton: ".ai-booking-widget__date-section, button[aria-label='Open date picker'], .ai-booking-widget__date-field",
    searchButton: ".ai-booking-widget__search-btn button, button.ai-button--primary, button[aria-label='Search']"
  },

  // Date Picker Modal Selectors (<ai-date-picker>)
  datePicker: {
    container: ".ai-date-picker, .ai-date-picker__container",
    oneWayCheckbox: 'mat-checkbox[name="isOneWay"], #mat-mdc-checkbox-0, label[for="mat-mdc-checkbox-0-input"], .ai-date-picker__header-oneway-checkbox, input[name="isOneWay"]',
    oneWayCheckboxInput: 'input[type="checkbox"][name="isOneWay"], #mat-mdc-checkbox-0-input',
    nextMonthArrow: ".ai-date-picker__arrow--right, button[aria-label='Next month'], .mat-calendar-next-button",
    prevMonthArrow: ".ai-date-picker__arrow--left, button[aria-label='Previous month'], .mat-calendar-previous-button",
    monthDropdown: ".ai-date-picker__month-dropdown mat-select, #mat-select-0",
    monthLabel: ".ai-date-picker__label",
    calendar: "mat-calendar",
    fromCalendar: "mat-calendar[data-calendar-id='from-calendar']",
    toCalendar: "mat-calendar[data-calendar-id='to-calendar']",
    calendarCell: "button.mat-calendar-body-cell",
    activeCell: "button.mat-calendar-body-cell:not(.mat-calendar-body-disabled)",
    confirmButton: "button[aria-label='Confirm'], .ai-date-picker__footer-right button.ai-button--primary, .ai-date-picker__footer-section button.ai-button--primary",
    cancelButton: "button[aria-label='Cancel'], .ai-date-picker__footer--cancel-btn button",
    resetButton: ".ai-date-picker__header-reset-btn"
  },

  // Flight Search Results Listing Selectors
  results: {
    listingContainer: ".ai-pb-flight-item-listing, .ai-flight-list",
    flightItem: "ai-pb-flight-item, .ai-pb-flight-item, [id^='ai-pb-flight-item-SEG-']",
    
    // Flight Header / Identification
    flightId: ".ai-pb-flight-id",
    airlineIcon: ".ai-pb-airline-icon",
    operatedBy: ".ai-pb-operated-by-info",

    // Times & Stations
    departureTime: ".ai-pb-departure-time",
    departureCity: ".ai-pb-preferred-departure-city, .ai-pb-departure-city-code",
    arrivalTime: ".ai-pb-arrival-time",
    arrivalCity: ".ai-pb-preferred-arrival-city, .ai-pb-arrival-city-code",

    // Timeline / Duration / Stops
    duration: ".ai-pb-flight-duration",
    stopsInfo: ".ai-pb-total-stop-info span, .ai-pb-total-stop-info",
    layoverInfo: ".ai-pb-layover-info",

    // Summary Card Price
    priceTag: ".ai-pb-price-tag, .ai-pb-price-tag .ai-pb-price, .ai-pb-price",
    currency: ".ai-pb-currency-code",
    seatsLeft: ".ai-pb-seat-left-info, .ai-pb-seat-count-info",

    // Cabin Classes (Economy, Premium Economy, Business)
    cabinListing: ".ai-pb-cabin-card-listing",
    cabinCard: ".ai-pb-cabin-card",
    economyCard: ".ai-pb-economy-card",
    premiumEconomyCard: ".ai-pb-premium-economy-card",
    businessCard: ".ai-pb-business-card",
    cabinActualPrice: ".ai-pb-actual-price",
    cabinCurrency: ".ai-pb-actual-price-currency-code"
  }
};
