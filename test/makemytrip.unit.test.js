/**
 * MakeMyTrip Unit & DOM Extraction Verification Test
 */

const puppeteer = require("puppeteer");
const mmtScraper = require("../scrapers/makemytrip.scraper");
const selectors = require("../scrapers/selectors/makemytrip.selectors");

const SAMPLE_HTML = `
<!DOCTYPE html>
<html>
<head><title>MMT Mock</title></head>
<body>
  <!-- Overlay Modal -->
  <div data-cy="outsideModal" class="imageSliderModal modal displayBlock modalLogin dynHeight personal">
    <div class="imageSlideContainer">
      <section data-cy="CommonModal_2" class="modalMain tcnFooter">
        <span data-cy="closeModal" class="commonModal__close"></span>
        <div class="appendBottom25">
          <ul data-cy="LoginFlowPopup_82" class="makeFlex textCenter latoBlack font16 capText noSelection">
            <li class="active" data-acctype="personal" data-cy="personalLogin">Personal Account</li>
          </ul>
        </div>
      </section>
    </div>
  </div>

  <!-- Booking Widget -->
  <div class="flightWidgetSection appendBottom40">
    <div class="flightSearchWidget">
      <div class="searchWidgetContainer searchFormDecoupleTC">
        <div data-cy="flightSW" class="fltWidgetSection appendBottom40 primaryTraveler">
          <div class="makeFlex hrtlCenter fswTabsOuter">
            <ul class="fswTabs latoRegular darkGreyText">
              <li data-cy="oneWayTrip" class="selected">One Way</li>
            </ul>
          </div>
          <div class="fsw">
            <div class="fsw_inner returnPersuasion">
              <div class="flt_fsw_inputBox searchCity inactiveWidget">
                <label for="fromCity">
                  <span class="lbl_input appendBottom10">From</span>
                  <input data-cy="fromCity" id="fromCity" class="fsw_inputField lineHeight36 latoBlack font30" readonly="" type="text" value="Mumbai">
                </label>
              </div>
              <div class="flt_fsw_inputBox searchToCity inactiveWidget">
                <label for="toCity">
                  <span class="lbl_input appendBottom10">To</span>
                  <input data-cy="toCity" id="toCity" class="fsw_inputField lineHeight36 latoBlack font30" readonly="" type="text" value="Bengaluru">
                </label>
              </div>
              <div class="flt_fsw_inputBox dates inactiveWidget">
                <label for="departure">
                  <span class="lbl_input appendBottom10">Departure</span>
                  <input data-cy="departure" id="departure" class="fsw_inputField font20" readonly="" type="text" value="Tuesday, 1 Sep 2026">
                </label>
              </div>
            </div>
          </div>
          <p data-cy="submit" class="makeFlex vrtlCenter"><a class="primaryBtn font24 latoBold widgetSearchBtn">Search</a></p>
        </div>
      </div>
    </div>
  </div>

  <!-- Listing Cards (React Virtuoso) -->
  <div id="listing-id">
    <div class="listingCardWrap" data-test="component-listingV4ClusterView">
      <div class="clusterTabs appendTop16" data-test="component-listingV4ClusterTabs">
        <div class="tabListV4">
          <div class="tabListV4__row">
            <div class="tabListV4__tab tabListV4__tab--active" data-test="component-tabListV4Item">
              <p class="tabListV4__title fontSize14 blackFont blackText" data-test="component-title"><span class="tabListV4__titleText">Cheapest</span></p>
              <p class="tabListV4__subtitle fontSize12 lightFont blackText" data-test="component-clusterHeader">₹ 5,678 | 01h 55m</p>
            </div>
          </div>
        </div>
      </div>
      <div class="clusterContent">
        <div data-virtuoso-scroller="true" data-test="component-firstCards" style="position: relative; height: 6656px;">
          <div data-viewport-type="window" style="height: 100%; position: absolute; top: 0px; width: 100%;">
            <div data-testid="virtuoso-item-list">

              <!-- Card 1: Akasa Air -->
              <div data-index="1" data-item-index="1">
                <div class="" data-test="component-clusterItem">
                  <div class="listingCardItem appendBottom16 makeFlex column">
                    <div class="flightCard flightCard--full flightCard--clickable flightCard--hasTopTag" data-test="component-clusterSingleCardBody">
                      <div class="flightCardTag" data-test="component-flightCardTag" aria-label="100% on time"><span class="flightCardTag__segment">100% on time</span></div>
                      <div class="flightCard__mainRow">
                        <div class="flightCard__contentRow">
                          <div class="makeFlex flightCard__contentRow__airlineBlock">
                            <div class="flightCard__airlineBlock">
                              <span class="flightCard__logo" aria-hidden="true"></span>
                              <div class="flightCard__airlineText">
                                <div class="flightCard__airlineHeading">Akasa Air</div>
                                <div class="flightCard__airlineSub">QP-1382</div>
                              </div>
                            </div>
                            <div class="flightCard__journeys">
                              <div>
                                <div class="flightCard__journeyRow">
                                  <div class="flightCard__timeBlock"><span class="flightCard__time">18:20</span><span class="flightCard__airport">BOM</span></div>
                                  <div class="flightCard__mid flightCard__mid--stops">
                                    <div class="stop-info flexOne v4-stop-info">
                                      <p class="boldFont"><font color="#757575">02h</font></p>
                                      <div class="stops-info-hover-zone"><p class="flightsLayoverInfo"><font color="#757575">Non stop</font></p></div>
                                    </div>
                                  </div>
                                  <div class="flightCard__timeBlock flightCard__timeBlock--arr"><div class="flightCard__timeRow flightTimeInfo"><span class="flightCard__time">20:20</span></div><span class="flightCard__airport">BLR</span></div>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div class="makeFlex ancillaryPersuasionBlock hrtlCenter"><span class="flightCard__ancillaryPersuasion"><b>Free Seat with VISA Signature*</b></span></div>
                        </div>
                        <div class="flightCard__divider"></div>
                        <div class="priceSection priceLockPersuasionExists priceInfoWithCoupon flightCard__priceBlock">
                          <div class="makeFlex top gap-x-10">
                            <div class="moveUp5 textRight flexOne">
                              <div class="blackText fontSize18 blackFont white-space-no-wrap fareBlock-container makeFlex clusterViewPrice" data-test="component-fare">
                                <div class="makeFlex column">
                                  <div class="fareBlock__fareRow makeFlex hrtlCenter" data-test="component-fareRow"><span>₹ 6,237</span></div>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div class="couponPersuasionText"><span class="couponPersuasionText__text" data-test="component-couponPersuasionText">Get Flat 10% OFF using FLYMON</span></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Card 2: IndiGo -->
              <div data-index="3" data-item-index="3">
                <div class="" data-test="component-clusterItem">
                  <div class="listingCardItem appendBottom16 makeFlex column">
                    <div class="flightCard flightCard--full flightCard--clickable" data-test="component-clusterSingleCardBody">
                      <div class="flightCard__mainRow">
                        <div class="flightCard__contentRow">
                          <div class="makeFlex flightCard__contentRow__airlineBlock">
                            <div class="flightCard__airlineBlock">
                              <span class="flightCard__logo" aria-hidden="true"></span>
                              <div class="flightCard__airlineText">
                                <div class="flightCard__airlineHeading">IndiGo</div>
                                <div class="flightCard__airlineSub">6E-5382</div>
                              </div>
                            </div>
                            <div class="flightCard__journeys">
                              <div>
                                <div class="flightCard__journeyRow">
                                  <div class="flightCard__timeBlock"><span class="flightCard__time">14:30</span><span class="flightCard__airport">BOM</span></div>
                                  <div class="flightCard__mid flightCard__mid--stops">
                                    <div class="stop-info flexOne v4-stop-info">
                                      <p class="boldFont"><font color="#757575">01h 55m</font></p>
                                      <div class="stops-info-hover-zone"><p class="flightsLayoverInfo"><font color="#757575">Non stop</font></p></div>
                                    </div>
                                  </div>
                                  <div class="flightCard__timeBlock flightCard__timeBlock--arr"><div class="flightCard__timeRow flightTimeInfo"><span class="flightCard__time">16:25</span></div><span class="flightCard__airport">BLR</span></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div class="flightCard__divider"></div>
                        <div class="priceSection priceLockPersuasionExists priceInfoWithCoupon flightCard__priceBlock">
                          <div class="makeFlex top gap-x-10">
                            <div class="moveUp5 textRight flexOne">
                              <div class="blackText fontSize18 blackFont white-space-no-wrap fareBlock-container makeFlex clusterViewPrice" data-test="component-fare">
                                <div class="makeFlex column">
                                  <div class="fareBlock__fareRow makeFlex hrtlCenter" data-test="component-fareRow"><span>₹ 6,914</span></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Card 3: Air India -->
              <div data-index="6" data-item-index="6">
                <div class="" data-test="component-clusterItem">
                  <div class="listingCardItem appendBottom16 makeFlex column">
                    <div class="flightCard flightCard--full flightCard--clickable flightCard--hasTopTag" data-test="component-clusterSingleCardBody">
                      <div class="flightCardTag" data-test="component-flightCardTag" aria-label="100% on time"><span class="flightCardTag__segment">100% on time</span></div>
                      <div class="flightCard__mainRow">
                        <div class="flightCard__contentRow">
                          <div class="makeFlex flightCard__contentRow__airlineBlock">
                            <div class="flightCard__airlineBlock">
                              <span class="flightCard__logo" aria-hidden="true"></span>
                              <div class="flightCard__airlineText">
                                <div class="flightCard__airlineHeading">Air India</div>
                                <div class="flightCard__airlineSub">AI-2812</div>
                              </div>
                            </div>
                            <div class="flightCard__journeys">
                              <div>
                                <div class="flightCard__journeyRow">
                                  <div class="flightCard__timeBlock"><span class="flightCard__time">02:05</span><span class="flightCard__airport">BOM</span></div>
                                  <div class="flightCard__mid flightCard__mid--stops">
                                    <div class="stop-info flexOne v4-stop-info">
                                      <p class="boldFont"><font color="#757575">02h 05m</font></p>
                                      <div class="stops-info-hover-zone"><p class="flightsLayoverInfo"><font color="#757575">Non stop</font></p></div>
                                    </div>
                                  </div>
                                  <div class="flightCard__timeBlock flightCard__timeBlock--arr"><div class="flightCard__timeRow flightTimeInfo"><span class="flightCard__time">04:10</span></div><span class="flightCard__airport">BLR</span></div>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div class="makeFlex ancillaryPersuasionBlock hrtlCenter"><span class="flightCard__ancillaryPersuasion"><b>Free Hot Meal</b></span></div>
                        </div>
                        <div class="flightCard__divider"></div>
                        <div class="priceSection priceLockPersuasionExists priceInfoWithCoupon flightCard__priceBlock">
                          <div class="makeFlex top gap-x-10">
                            <div class="moveUp5 textRight flexOne">
                              <div class="blackText fontSize18 blackFont white-space-no-wrap fareBlock-container makeFlex clusterViewPrice" data-test="component-fare">
                                <div class="makeFlex column">
                                  <div class="fareBlock__fareRow makeFlex hrtlCenter" data-test="component-fareRow"><span>₹ 6,945</span></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`;

const fs = require("fs");

function getExecutablePath() {
  const possiblePaths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

async function runTest() {
  console.log("==================================================");
  console.log("MAKEMYTRIP PARSER & MODAL DELETION VERIFICATION");
  console.log("==================================================");

  const execPath = getExecutablePath();
  const browser = await puppeteer.launch({
    headless: true,
    ...(execPath ? { executablePath: execPath } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.setContent(SAMPLE_HTML);

    // 1. Verify modal is present initially
    const modalBefore = await page.$('[data-cy="outsideModal"]');
    console.log("Modal before deletion:", modalBefore ? "PRESENT (found)" : "NOT FOUND");

    // 2. Test modal dismissal/deletion function
    await mmtScraper.dismissOrDeleteModal(page);
    const modalAfter = await page.$('[data-cy="outsideModal"]');
    console.log("Modal after deletion:", modalAfter ? "STILL PRESENT" : "DELETED SUCCESSFULLY (null)");

    // 3. Test flight card extraction from DOM
    const extracted = await page.evaluate((sel, orig, dest, canonicalRoute, depDate) => {
      const items = [];
      const now = new Date().toISOString();
      let cardNodes = document.querySelectorAll(".flightCard");
      if (!cardNodes || cardNodes.length === 0) {
        cardNodes = document.querySelectorAll("[data-test='component-clusterItem']");
      }
      if (!cardNodes || cardNodes.length === 0) {
        cardNodes = document.querySelectorAll(".listingCardItem");
      }

      cardNodes.forEach((card) => {
        try {
          const headingEl = card.querySelector(".flightCard__airlineHeading, .airlineName, [data-test='component-airlineHeading']");
          const airlineName = headingEl ? headingEl.textContent.trim() : "Unknown Airline";

          const subEl = card.querySelector(".flightCard__airlineSub, .flightNumber, [data-test='component-airlineSub']");
          const flightNo = subEl ? subEl.textContent.trim() : "";

          const depTimeEl = card.querySelector(".flightCard__journeyRow .flightCard__timeBlock:first-child .flightCard__time, .flightTimeInfo .flightCard__time");
          const departureTime = depTimeEl ? depTimeEl.textContent.trim() : "";

          const depAirportEl = card.querySelector(".flightCard__journeyRow .flightCard__timeBlock:first-child .flightCard__airport");
          const depAirport = depAirportEl ? depAirportEl.textContent.trim() : orig;

          const arrTimeEl = card.querySelector(".flightCard__timeBlock--arr .flightCard__time");
          const arrivalTime = arrTimeEl ? arrTimeEl.textContent.trim() : "";

          const arrAirportEl = card.querySelector(".flightCard__timeBlock--arr .flightCard__airport");
          const arrAirport = arrAirportEl ? arrAirportEl.textContent.trim() : dest;

          const durationEl = card.querySelector(".stop-info .boldFont, .v4-stop-info p.boldFont, .flightDuration");
          const duration = durationEl ? durationEl.textContent.trim() : "";

          const stopsEl = card.querySelector(".flightsLayoverInfo, .stops-info-hover-zone p, .stops");
          const stopsText = stopsEl ? stopsEl.textContent.trim() : "Non stop";
          let stops = 0;
          if (stopsText.toLowerCase().includes("non stop") || stopsText.toLowerCase().includes("non-stop")) {
            stops = 0;
          } else {
            const stopsMatch = stopsText.match(/(\d+)/);
            stops = stopsMatch ? parseInt(stopsMatch[1], 10) : 1;
          }

          const priceEl = card.querySelector(".clusterViewPrice, .fareBlock__fareRow span, [data-test='component-fareRow'] span, [data-test='component-fare'] span");
          let rawPriceText = priceEl ? priceEl.textContent.trim() : "";
          const cleanedPrice = rawPriceText.replace(/[^0-9]/g, "");
          const totalFare = cleanedPrice ? parseInt(cleanedPrice, 10) : 0;

          const tagEl = card.querySelector(".flightCardTag, [data-test='component-flightCardTag'], .flightCardTag__segment");
          const tag = tagEl ? tagEl.textContent.trim() : null;

          const ancillaryEl = card.querySelector(".flightCard__ancillaryPersuasion, .ancillaryPersuasionBlock");
          const ancillary = ancillaryEl ? ancillaryEl.textContent.trim() : null;

          const couponEl = card.querySelector(".couponPersuasionText__text, [data-test='component-couponPersuasionText']");
          const coupon = couponEl ? couponEl.textContent.trim() : null;

          if (totalFare > 0 && flightNo) {
            items.push({
              source: "MakeMyTrip",
              airline: airlineName,
              flightNo: flightNo.replace(/\s+/g, " "),
              origin: depAirport || orig,
              destination: arrAirport || dest,
              route: canonicalRoute,
              departureDate: depDate,
              returnDate: null,
              departureTime,
              arrivalTime,
              duration,
              stops,
              fareType: "Regular",
              cabinClass: "Economy",
              totalFare,
              currency: "INR",
              scrapedAt: now,
              searchTimestamp: now,
              metadata: {
                tag,
                ancillary,
                coupon,
                rawSource: "makemytrip-puppeteer-dom"
              }
            });
          }
        } catch {}
      });

      return items;
    }, selectors, "BOM", "BLR", "BOM-BLR", "2026-09-01");

    console.log(`Extracted flight count: ${extracted.length}`);
    console.log("Extracted items detail:");
    extracted.forEach((item, idx) => {
      console.log(`\n[Flight ${idx + 1}]`);
      console.log(`- Airline:        ${item.airline} (${item.flightNo})`);
      console.log(`- Route:          ${item.origin} (${item.departureTime}) → ${item.destination} (${item.arrivalTime})`);
      console.log(`- Duration/Stops: ${item.duration} | ${item.stops === 0 ? "Non-stop" : `${item.stops} Stop(s)`}`);
      console.log(`- Total Fare:     ₹${item.totalFare} ${item.currency}`);
      console.log(`- Tag/Ancillary:  ${item.metadata.tag || "N/A"} | ${item.metadata.ancillary || "N/A"}`);
    });

    // 4. Test RouteFareSearch Schema Converter
    const rfsDoc = mmtScraper.toRouteFareSearchDocument(extracted, "BOM", "BLR", "2026-09-01");
    console.log("\nRouteFareSearch Doc Schema Verification:");
    console.log("- Provider:", rfsDoc.source.provider);
    console.log("- Route:", `${rfsDoc.route.origin.airportCode} → ${rfsDoc.route.destination.airportCode}`);
    console.log("- Total Fares:", rfsDoc.fares.length);
    console.log("- Data Quality Status:", rfsDoc.dataQuality.status);

    if (extracted.length === 3 && modalAfter === null) {
      console.log("\n✅ ALL MAKEMYTRIP SCRAPER VERIFICATION TESTS PASSED!");
    } else {
      console.error("\n❌ TEST FAILED: Verification checks did not meet expectations");
    }

  } finally {
    await browser.close();
  }
}

runTest().catch((err) => {
  console.error("Test Error:", err);
  process.exit(1);
});
