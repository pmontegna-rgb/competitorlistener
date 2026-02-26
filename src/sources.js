const competitors = [
  {
    name: "Toast",
    domain: "toasttab.com",
    entityType: "competitor",
    rss: ["https://pos.toasttab.com/blog/rss.xml"],
    webPages: [
      "https://pos.toasttab.com/blog",
      "https://pos.toasttab.com/pricing",
      "https://careers.toasttab.com/jobs"
    ],
    linkedinCompanyPages: ["https://www.linkedin.com/company/toast-inc/"]
  },
  {
    name: "Square",
    domain: "squareup.com",
    entityType: "competitor",
    rss: ["https://squareup.com/us/en/the-bottom-line/rss"],
    webPages: [
      "https://squareup.com/us/en/point-of-sale/restaurants",
      "https://squareup.com/us/en/point-of-sale/restaurants/pricing",
      "https://careers.squareup.com/us/en/search-results"
    ],
    linkedinCompanyPages: ["https://www.linkedin.com/company/block/"]
  },
  {
    name: "Clover",
    domain: "clover.com",
    entityType: "competitor",
    rss: [],
    webPages: [
      "https://www.clover.com/blog",
      "https://www.clover.com/pricing",
      "https://www.clover.com/restaurant-pos"
    ],
    linkedinCompanyPages: ["https://www.linkedin.com/company/clover-network-inc/"]
  },
  {
    name: "Lightspeed",
    domain: "lightspeedhq.com",
    entityType: "competitor",
    rss: ["https://www.lightspeedhq.com/blog/feed/"],
    webPages: [
      "https://www.lightspeedhq.com/pos/restaurant/",
      "https://www.lightspeedhq.com/pricing/",
      "https://www.lightspeedhq.com/careers/"
    ],
    linkedinCompanyPages: ["https://www.linkedin.com/company/lightspeed-commerce/"]
  },
  {
    name: "Aloha (NCR Voyix)",
    domain: "ncrvoyix.com",
    entityType: "competitor",
    rss: [],
    webPages: [
      "https://www.ncrvoyix.com/restaurants",
      "https://www.ncrvoyix.com/newsroom",
      "https://careers.ncrvoyix.com/"
    ],
    linkedinCompanyPages: ["https://www.linkedin.com/company/ncr-voyix/"]
  },
  {
    name: "Shift4",
    domain: "shift4.com",
    entityType: "competitor",
    rss: ["https://investors.shift4.com/rss/news-releases.xml"],
    webPages: [
      "https://shift4.com/industries/restaurants",
      "https://shift4.com/blog",
      "https://shift4.com/careers"
    ],
    linkedinCompanyPages: ["https://www.linkedin.com/company/shift4/"]
  },
  {
    name: "TouchBistro",
    domain: "touchbistro.com",
    entityType: "competitor",
    rss: [],
    webPages: [
      "https://www.touchbistro.com/blog/",
      "https://www.touchbistro.com/pricing/",
      "https://www.touchbistro.com/careers/"
    ],
    linkedinCompanyPages: ["https://www.linkedin.com/company/touchbistro/"]
  },
  {
    name: "Revel Systems",
    domain: "revelsystems.com",
    entityType: "competitor",
    rss: [],
    webPages: [
      "https://revelsystems.com/blog/",
      "https://revelsystems.com/restaurant-pos-system/",
      "https://revelsystems.com/company/news/"
    ],
    linkedinCompanyPages: ["https://www.linkedin.com/company/revel-systems/"]
  },
  {
    name: "PAR Brink",
    domain: "partech.com",
    entityType: "competitor",
    rss: [],
    webPages: [
      "https://www.partech.com/blog/",
      "https://www.partech.com/products/brink-pos/",
      "https://www.partech.com/newsroom/"
    ],
    linkedinCompanyPages: ["https://www.linkedin.com/company/par-technology/"]
  },
  {
    name: "Oracle MICROS",
    domain: "oracle.com",
    entityType: "competitor",
    rss: [],
    webPages: [
      "https://www.oracle.com/food-beverage/micros/",
      "https://www.oracle.com/news/",
      "https://careers.oracle.com/"
    ],
    linkedinCompanyPages: ["https://www.linkedin.com/company/oracle/"]
  }
];

const partners = [
  {
    name: "Shogo",
    domain: "shogo.io",
    entityType: "partner",
    rss: [],
    webPages: ["https://shogo.io/blog/", "https://shogo.io/"],
    linkedinCompanyPages: ["https://www.linkedin.com/company/shogo-technologies/"]
  },
  {
    name: "Davo",
    domain: "davochain.com",
    entityType: "partner",
    rss: [],
    webPages: ["https://davochain.com/resources/", "https://davochain.com/"],
    linkedinCompanyPages: ["https://www.linkedin.com/company/davo-by-avalara/"]
  },
  {
    name: "Chowly",
    domain: "chowly.com",
    entityType: "partner",
    rss: [],
    webPages: ["https://www.chowly.com/blog/", "https://www.chowly.com/"],
    linkedinCompanyPages: ["https://www.linkedin.com/company/chowly-inc/"]
  },
  {
    name: "Margin Edge",
    domain: "marginedge.com",
    entityType: "partner",
    rss: [],
    webPages: ["https://www.marginedge.com/blog", "https://www.marginedge.com/product", "https://www.marginedge.com/company"],
    linkedinCompanyPages: ["https://www.linkedin.com/company/marginedge/"]
  },
  {
    name: "Reddie",
    domain: "reddie.com",
    entityType: "partner",
    rss: [],
    webPages: ["https://reddie.com/"],
    linkedinCompanyPages: []
  },
  {
    name: "7shifts",
    domain: "7shifts.com",
    entityType: "partner",
    rss: [],
    webPages: ["https://www.7shifts.com/blog", "https://www.7shifts.com/"],
    linkedinCompanyPages: ["https://www.linkedin.com/company/7shifts/"]
  },
  {
    name: "DoorDash",
    domain: "doordash.com",
    entityType: "partner",
    rss: ["https://about.doordash.com/en-us/news/rss"],
    webPages: ["https://about.doordash.com/en-us/news", "https://merchant.doordash.com/en-us/products"],
    linkedinCompanyPages: ["https://www.linkedin.com/company/doordash/"]
  },
  {
    name: "Uber Eats",
    domain: "ubereats.com",
    entityType: "partner",
    rss: [],
    webPages: ["https://www.uber.com/newsroom/", "https://merchants.ubereats.com/us/en/services/"],
    linkedinCompanyPages: ["https://www.linkedin.com/company/uber-com/"]
  },
  {
    name: "Popmenu",
    domain: "popmenu.com",
    entityType: "partner",
    rss: [],
    webPages: ["https://get.popmenu.com/blog/", "https://get.popmenu.com/"],
    linkedinCompanyPages: ["https://www.linkedin.com/company/popmenu/"]
  },
  {
    name: "Loman",
    domain: "loman.ai",
    entityType: "partner",
    rss: [],
    webPages: ["https://www.loman.ai/", "https://www.loman.ai/blog"],
    linkedinCompanyPages: ["https://www.linkedin.com/company/loman-ai/"]
  },
  {
    name: "Parafin",
    domain: "parafin.com",
    entityType: "partner",
    rss: [],
    webPages: ["https://www.parafin.com/blog", "https://www.parafin.com/"],
    linkedinCompanyPages: ["https://www.linkedin.com/company/parafin/"]
  },
  {
    name: "Deliverect",
    domain: "deliverect.com",
    entityType: "partner",
    rss: [],
    webPages: ["https://www.deliverect.com/en/blog", "https://www.deliverect.com/en"],
    linkedinCompanyPages: ["https://www.linkedin.com/company/deliverect/"]
  }
];

const entities = [...competitors, ...partners];

function encode(q) {
  return encodeURIComponent(q).replace(/%20/g, "+");
}

function linkedInSearchFeedsForEntity(entityName) {
  const queries = [
    `site:linkedin.com "${entityName}" "activity-"`,
    `site:linkedin.com/posts "${entityName}"`,
    `site:linkedin.com "${entityName}" integration`,
    `site:linkedin.com "${entityName}" partnership`,
    `site:linkedin.com "${entityName}" product launch`,
    `site:linkedin.com "${entityName}" employee`,
    `site:linkedin.com "${entityName}" VP OR Director OR Head of OR CTO OR CEO`
  ];

  const feeds = [];
  for (const q of queries) {
    feeds.push({
      name: `Google LinkedIn - ${entityName} - ${q}`,
      url: `https://news.google.com/rss/search?q=${encode(q)}`
    });
    feeds.push({
      name: `Bing LinkedIn - ${entityName} - ${q}`,
      url: `https://www.bing.com/news/search?q=${encode(q)}&format=RSS`
    });
  }

  return feeds;
}

function pressSearchFeedsForEntity(entityName) {
  const pressQueries = [
    `"${entityName}" "press release"`,
    `"${entityName}" "announces"`,
    `"${entityName}" "partnership"`,
    `"${entityName}" "launches"`,
    `"${entityName}" "new product"`,
    `"${entityName}" "funding"`,
    `site:prnewswire.com "${entityName}"`,
    `site:businesswire.com "${entityName}"`,
    `site:globenewswire.com "${entityName}"`,
    `site:einnews.com "${entityName}"`,
    `site:finance.yahoo.com "${entityName}" press release`
  ];

  const feeds = [];
  for (const q of pressQueries) {
    feeds.push({
      name: `Google Press - ${entityName} - ${q}`,
      url: `https://news.google.com/rss/search?q=${encode(q)}`
    });
    feeds.push({
      name: `Bing Press - ${entityName} - ${q}`,
      url: `https://www.bing.com/news/search?q=${encode(q)}&format=RSS`
    });
  }

  return feeds;
}

const linkedinSearchRss = entities.flatMap((e) => linkedInSearchFeedsForEntity(e.name));
const pressSearchRss = entities.flatMap((e) => pressSearchFeedsForEntity(e.name));

module.exports = { competitors, partners, entities, linkedinSearchRss, pressSearchRss };
