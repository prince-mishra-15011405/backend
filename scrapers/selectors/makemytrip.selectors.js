/**
 * Centralized DOM, CSS & XPath Selectors for MakeMyTrip Flight Search & Listing
 * Matches the React Virtuoso layout, booking widget, and image overlay modal.
 */

module.exports = {
  // Navigation
  baseUrl: "https://www.makemytrip.com/flights/",
  searchUrlTemplate: "https://www.makemytrip.com/flight/search?itinerary={ORIGIN}-{DESTINATION}-{DATE}&tripType=O&paxType=A-1_C-0_I-0&intl=false&cabinClass=E",

  // Image Overlay / Login Modal Selectors
  overlay: {
    outsideModal: '[data-cy="outsideModal"], .imageSliderModal, .modalLogin, [data-cy="CommonModal_2"]',
    closeButton: '[data-cy="closeModal"], .commonModal__close, span.commonModal__close',
    sliderContainer: ".imageSlideContainer",
    sliderWrapper: ".loginSliderCompWrapper, [data-cy='login-slider-comp-wrapper']",
    modalSection: 'section[data-cy="CommonModal_2"], .modalMain.tcnFooter',
    allOverlays: [
      '[data-cy="outsideModal"]',
      ".imageSliderModal",
      ".modalLogin",
      ".imageSlideContainer",
      ".loginSliderCompWrapper",
      '[data-cy="CommonModal_2"]',
      ".modalMain",
      "#g_id_onload",
      ".g_id_signin",
      ".loginFooter",
      ".overlay",
      ".landingContainerOverlay",
      ".pushNotificationOverlay"
    ]
  },

  // Flight Search Widget Form (Homepage)
  widget: {
    container: ".flightWidgetSection, .flightSearchWidget, [data-cy='flightSW']",
    tripTypeOneWay: 'li[data-cy="oneWayTrip"]',
    tripTypeRoundTrip: 'li[data-cy="roundTrip"]',
    tripTypeMultiCity: 'li[data-cy="mulitiCityTrip"]',

    // From (Origin)
    fromCityBox: ".flt_fsw_inputBox.searchCity, label[for='fromCity']",
    fromCityInput: "input#fromCity, input[data-cy='fromCity']",

    // To (Destination)
    toCityBox: ".flt_fsw_inputBox.searchToCity, label[for='toCity']",
    toCityInput: "input#toCity, input[data-cy='toCity']",

    // Autocomplete dropdown input field when active
    autoSuggestInput: "input[placeholder='From'], input[placeholder='To'], input.react-autosuggest__input, input.autoSuggest__input",
    suggestionList: "ul.react-autosuggest__suggestions-list, [role='listbox']",
    suggestionItem: "li.react-autosuggest__suggestion, [role='option'], ul.react-autosuggest__suggestions-list li",

    // Departure Date
    departureBox: ".flt_fsw_inputBox.dates, label[for='departure']",
    departureInput: "input#departure, input[data-cy='departure']",
    departureDateDisplay: "p[data-cy='departureDate']",

    // Calendar
    calendarContainer: ".DayPicker, .DayPicker-wrapper, .DayPicker-Months",
    calendarMonth: ".DayPicker-Month",
    calendarCaption: ".DayPicker-Caption",
    calendarDay: ".DayPicker-Day",
    calendarNextButton: ".DayPicker-NavButton--next, span[aria-label='Next Month']",
    calendarPrevButton: ".DayPicker-NavButton--prev, span[aria-label='Previous Month']",

    // Travellers & Cabin Class
    travellersBox: "[data-cy='flightTravellersOnly'], label[for='travellers']",
    travellersInput: "input#travellers, input[data-cy='travellers']",
    cabinClassBox: "[data-cy='flightCabinClass'], label[for='cabinClass']",

    // Search CTA Button
    searchButton: "p[data-cy='submit'] a, a.widgetSearchBtn, .widgetSearchBtn, [data-cy='submit']"
  },

  // Flight Listing Results Selectors (Cluster View / React Virtuoso)
  results: {
    listingContainer: "#listing-id, [data-test='component-listingV4ClusterView'], .listingCardWrap",
    clusterTabs: ".clusterTabs, [data-test='component-listingV4ClusterTabs']",
    cheapestTab: ".tabListV4__tab--active, [data-test='component-tabListV4Item']",
    
    // Virtuoso Scroller
    virtuosoScroller: "[data-virtuoso-scroller='true'], [data-testid='virtuoso-item-list']",
    virtuosoItemList: "[data-testid='virtuoso-item-list']",
    virtuosoItem: "[data-test='component-clusterItem'], .listingCardItem",

    // Flight Card Structure
    flightCard: ".flightCard, [data-test='component-clusterSingleCardBody']",
    flightCardTag: ".flightCardTag, [data-test='component-flightCardTag'], .flightCardTag__segment",

    // Airline & Flight Info
    airlineBlock: ".flightCard__airlineBlock, .flightCard__contentRow__airlineBlock",
    airlineHeading: ".flightCard__airlineHeading",
    flightSub: ".flightCard__airlineSub",
    airlineLogo: ".flightCard__logo",

    // Journeys / Timings / Stations
    journeyRow: ".flightCard__journeyRow",
    departureBlock: ".flightCard__journeyRow .flightCard__timeBlock:first-child",
    departureTime: ".flightCard__journeyRow .flightCard__timeBlock:first-child .flightCard__time",
    departureAirport: ".flightCard__journeyRow .flightCard__timeBlock:first-child .flightCard__airport",

    arrivalBlock: ".flightCard__timeBlock--arr",
    arrivalTime: ".flightCard__timeBlock--arr .flightCard__time",
    arrivalAirport: ".flightCard__timeBlock--arr .flightCard__airport",

    // Stops & Duration
    midBlock: ".flightCard__mid, .flightCard__mid--stops",
    duration: ".stop-info .boldFont, .v4-stop-info p.boldFont",
    stopsInfo: ".flightsLayoverInfo, .stops-info-hover-zone p",

    // Ancillary / Perks
    ancillaryBlock: ".ancillaryPersuasionBlock, .flightCard__ancillaryPersuasion",

    // Price Section
    priceBlock: ".flightCard__priceBlock, .priceSection",
    priceTag: ".clusterViewPrice, .fareBlock__fareRow span, [data-test='component-fareRow'] span, [data-test='component-fare']",
    viewPricesButton: "button.flightCard__viewFares",
    couponText: ".couponPersuasionText__text, [data-test='component-couponPersuasionText'], .couponPersuasionText",
    priceLockText: ".priceLock__text, [data-test='component-priceLock'] .priceLock__text",

    // Direct flight alternative banner (calendar suggestion)
    directFlightBanner: ".nonStopBanner, .directFlightWrapper",
    directFlightCard: ".directFlightCard"
  }
};
