export type SourceCategory =
  | "news"
  | "finance"
  | "science"
  | "geopolitics"
  | "transport"
  | "cyber"
  | "government";

export type SourceDefinition = {
  id: string;
  label: string;
  category: SourceCategory;
  kind: "rss" | "api" | "platform";
  endpoint: string;
  tags: string[];
};

export const SOURCE_DEFINITIONS: SourceDefinition[] = [
  {
    id: "guardian",
    label: "The Guardian",
    category: "news",
    kind: "rss",
    endpoint: "https://www.theguardian.com/world/rss",
    tags: ["uk", "global", "analysis"],
  },
  {
    id: "wsj",
    label: "WSJ World",
    category: "finance",
    kind: "rss",
    endpoint: "https://feeds.a.dj.com/rss/RSSWorldNews.xml",
    tags: ["business", "global", "finance"],
  },
  {
    id: "alarabiya",
    label: "Al Arabiya",
    category: "news",
    kind: "rss",
    endpoint: "https://news.google.com/rss/search?q=Al+Arabiya+english+news&hl=en-US&gl=US&ceid=US:en",
    tags: ["middle-east", "global"],
  },
  {
    id: "cnn",
    label: "CNN World",
    category: "news",
    kind: "rss",
    endpoint: "http://rss.cnn.com/rss/edition.rss",
    tags: ["breaking", "global", "us"],
  },
  {
    id: "skynews",
    label: "Sky News",
    category: "news",
    kind: "rss",
    endpoint: "https://feeds.skynews.com/feeds/rss/world.xml",
    tags: ["uk", "global", "video"],
  },
  {
    id: "france24",
    label: "France 24",
    category: "news",
    kind: "rss",
    endpoint: "https://www.france24.com/en/rss",
    tags: ["france", "europe", "global"],
  },
  {
    id: "aljazeera",
    label: "Al Jazeera",
    category: "news",
    kind: "rss",
    endpoint: "https://www.aljazeera.com/xml/rss/all.xml",
    tags: ["middle-east", "global", "analysis"],
  },
  {
    id: "reuters",
    label: "Reuters",
    category: "news",
    kind: "rss",
    endpoint: "https://news.google.com/rss/search?q=Reuters+world+news&hl=en-US&gl=US&ceid=US:en",
    tags: ["agency", "wire", "global"],
  },
  {
    id: "aajtak",
    label: "Aaj Tak",
    category: "news",
    kind: "rss",
    endpoint: "https://news.google.com/rss/search?q=Aaj+Tak+India+news&hl=en-IN&gl=IN&ceid=IN:en",
    tags: ["india", "hindi", "local"],
  },
  {
    id: "wion",
    label: "WION",
    category: "news",
    kind: "rss",
    endpoint: "https://news.google.com/rss/search?q=WION+world+news&hl=en-IN&gl=IN&ceid=IN:en",
    tags: ["india", "global", "analysis"],
  },
  {
    id: "ndtv",
    label: "NDTV India",
    category: "news",
    kind: "rss",
    endpoint: "https://news.google.com/rss/search?q=NDTV+India+top+stories&hl=en-IN&gl=IN&ceid=IN:en",
    tags: ["india", "breaking"],
  },
  {
    id: "bloomberg",
    label: "Bloomberg",
    category: "finance",
    kind: "rss",
    endpoint: "https://news.google.com/rss/search?q=Bloomberg+markets+finance&hl=en-US&gl=US&ceid=US:en",
    tags: ["business", "markets", "opinion"],
  },
  {
    id: "cnbc",
    label: "CNBC Markets",
    category: "finance",
    kind: "rss",
    endpoint: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    tags: ["business", "finance", "markets"],
  },
  {
    id: "rss-atom",
    label: "BBC World",
    category: "news",
    kind: "rss",
    endpoint: "https://feeds.bbci.co.uk/news/world/rss.xml",
    tags: ["breaking", "global", "publishers"],
  },
  {
    id: "rss2json",
    label: "RSS2JSON",
    category: "news",
    kind: "api",
    endpoint:
      "https://api.rss2json.com/v1/api.json?rss_url=https://feeds.bbci.co.uk/news/world/rss.xml",
    tags: ["normalization", "rss", "publishers"],
  },
  {
    id: "gdelt",
    label: "GDELT",
    category: "geopolitics",
    kind: "api",
    endpoint:
      "https://api.gdeltproject.org/api/v2/doc/doc?query=global%20conflict&mode=artlist&format=json&maxrecords=10",
    tags: ["events", "conflict", "geopolitics"],
  },
  {
    id: "hacker-news",
    label: "Hacker News",
    category: "news",
    kind: "platform",
    endpoint: "https://hacker-news.firebaseio.com/v0/topstories.json",
    tags: ["technology", "community", "software"],
  },
  {
    id: "github",
    label: "GitHub",
    category: "cyber",
    kind: "platform",
    endpoint: "https://api.github.com/events",
    tags: ["code", "security", "developer-signal"],
  },
  {
    id: "arxiv",
    label: "arXiv",
    category: "science",
    kind: "api",
    endpoint:
      "https://export.arxiv.org/api/query?search_query=all:ai&start=0&max_results=10",
    tags: ["research", "ai", "science"],
  },
  {
    id: "finnhub",
    label: "Finnhub",
    category: "finance",
    kind: "api",
    endpoint: "https://finnhub.io/api/v1/news?category=general",
    tags: ["markets", "equities", "macro"],
  },
  {
    id: "yahoo-finance",
    label: "Yahoo Finance",
    category: "finance",
    kind: "api",
    endpoint:
      "https://news.google.com/rss/search?q=Yahoo+Finance+stock+market&hl=en-US&gl=US&ceid=US:en",
    tags: ["markets", "equities", "news"],
  },
  {
    id: "coingecko",
    label: "CoinGecko",
    category: "finance",
    kind: "api",
    endpoint: "https://api.coingecko.com/api/v3/search/trending",
    tags: ["crypto", "markets", "assets"],
  },
  {
    id: "fred",
    label: "FRED",
    category: "finance",
    kind: "api",
    endpoint: "https://news.google.com/rss/search?q=Federal+Reserve+economic+data+release&hl=en-US&gl=US&ceid=US:en",
    tags: ["macro", "rates", "economy"],
  },
  {
    id: "eia",
    label: "EIA",
    category: "finance",
    kind: "api",
    endpoint: "https://api.eia.gov/v2/electricity/rto/region-data/data/",
    tags: ["energy", "commodities", "infrastructure"],
  },
  {
    id: "polymarket",
    label: "Polymarket",
    category: "finance",
    kind: "platform",
    endpoint: "https://gamma-api.polymarket.com/markets",
    tags: ["prediction", "sentiment", "probability"],
  },
  {
    id: "bis",
    label: "BIS",
    category: "finance",
    kind: "api",
    endpoint:
      "https://www.bis.org/doclist/cbspeeches.rss",
    tags: ["banking", "fx", "policy"],
  },
  {
    id: "usgs",
    label: "USGS",
    category: "science",
    kind: "api",
    endpoint:
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
    tags: ["earth", "hazards", "events"],
  },
  {
    id: "nasa-eonet",
    label: "NASA EONET",
    category: "science",
    kind: "api",
    endpoint: "https://eonet.gsfc.nasa.gov/api/v3/events?limit=10&days=30",
    tags: ["climate", "fires", "weather"],
  },
  {
    id: "nws",
    label: "NWS",
    category: "science",
    kind: "api",
    endpoint: "https://api.weather.gov/alerts/active?status=actual",
    tags: ["weather", "alerts", "risk"],
  },
  {
    id: "acled",
    label: "ACLED",
    category: "geopolitics",
    kind: "rss",
    endpoint: "https://news.google.com/rss/search?q=ACLED+armed+conflict+events&hl=en-US&gl=US&ceid=US:en",
    tags: ["conflict", "security", "risk"],
  },
  {
    id: "ucdp",
    label: "UCDP",
    category: "geopolitics",
    kind: "rss",
    endpoint: "https://news.google.com/rss/search?q=Uppsala+conflict+peace+research&hl=en-US&gl=US&ceid=US:en",
    tags: ["conflict", "historical", "incidents"],
  },
  {
    id: "unhcr",
    label: "UNHCR",
    category: "geopolitics",
    kind: "rss",
    endpoint: "https://news.google.com/rss/search?q=UNHCR+refugees+humanitarian+news&hl=en-US&gl=US&ceid=US:en",
    tags: ["migration", "displacement", "humanitarian"],
  },
  {
    id: "opensky",
    label: "OpenSky",
    category: "transport",
    kind: "api",
    endpoint: "https://opensky-network.org/api/states/all",
    tags: ["aviation", "movement", "airspace"],
  },
  {
    id: "faa",
    label: "FAA",
    category: "transport",
    kind: "api",
    endpoint: "https://news.google.com/rss/search?q=FAA+aviation+safety+advisory&hl=en-US&gl=US&ceid=US:en",
    tags: ["aviation", "advisory", "ops"],
  },
  {
    id: "ais",
    label: "AIS Vessels",
    category: "transport",
    kind: "api",
    endpoint: "https://news.google.com/rss/search?q=maritime+shipping+vessel+tracking&hl=en-US&gl=US&ceid=US:en",
    tags: ["shipping", "ports", "maritime"],
  },
  {
    id: "cloudflare-radar",
    label: "Cloudflare Radar",
    category: "cyber",
    kind: "api",
    endpoint: "https://blog.cloudflare.com/rss/",
    tags: ["internet", "outage", "traffic"],
  },
  {
    id: "abusech",
    label: "abuse.ch",
    category: "cyber",
    kind: "api",
    endpoint: "https://news.google.com/rss/search?q=malware+threat+intelligence+cyber&hl=en-US&gl=US&ceid=US:en",
    tags: ["malware", "threat-intel", "ioc"],
  },
  {
    id: "alienvault-otx",
    label: "AlienVault OTX",
    category: "cyber",
    kind: "api",
    endpoint: "https://news.google.com/rss/search?q=AlienVault+OTX+threat+intelligence&hl=en-US&gl=US&ceid=US:en",
    tags: ["threat-intel", "ioc", "pulses"],
  },
  {
    id: "abuseipdb",
    label: "AbuseIPDB",
    category: "cyber",
    kind: "api",
    endpoint: "https://news.google.com/rss/search?q=IP+abuse+cybersecurity+threat&hl=en-US&gl=US&ceid=US:en",
    tags: ["abuse", "ip-reputation", "security"],
  },
  {
    id: "c2intelfeeds",
    label: "C2IntelFeeds",
    category: "cyber",
    kind: "platform",
    endpoint:
      "https://news.google.com/rss/search?q=command+control+C2+threat+intelligence&hl=en-US&gl=US&ceid=US:en",
    tags: ["c2", "threat-intel", "github"],
  },
  {
    id: "usaspending",
    label: "USASpending.gov",
    category: "government",
    kind: "api",
    endpoint: "https://news.google.com/rss/search?q=USASpending+federal+government+contracts&hl=en-US&gl=US&ceid=US:en",
    tags: ["government", "contracts", "spending"],
  },
];

export const TOPICS = [
  "Macro",
  "Energy",
  "Cyber",
  "Geopolitics",
  "Climate",
  "Defense",
  "AI",
  "Logistics",
] as const;

export type Topic = (typeof TOPICS)[number];
