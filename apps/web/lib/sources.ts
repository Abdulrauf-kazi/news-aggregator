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
    endpoint: "https://english.alarabiya.net/.mrss/en/all.xml",
    tags: ["middle-east", "global"],
  },
  {
    id: "cnn",
    label: "CNN World",
    category: "news",
    kind: "rss",
    endpoint: "https://rss.cnn.com/rss/edition.rss",
    tags: ["breaking", "global", "us"],
  },
  {
    id: "skynews",
    label: "Sky News",
    category: "news",
    kind: "rss",
    endpoint: "https://news.sky.com/feeds/rss/world.xml",
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
    endpoint: "https://www.reutersagency.com/feed/",
    tags: ["agency", "wire", "global"],
  },
  {
    id: "aajtak",
    label: "Aaj Tak",
    category: "news",
    kind: "rss",
    endpoint: "https://www.aajtak.in/rssfeed",
    tags: ["india", "hindi", "local"],
  },
  {
    id: "bloomberg",
    label: "Bloomberg",
    category: "finance",
    kind: "rss",
    endpoint: "https://www.bloomberg.com/feeds/bview/rss",
    tags: ["business", "markets", "opinion"],
  },
  {
    id: "cnbc",
    label: "CNN Business",
    category: "finance",
    kind: "rss",
    endpoint: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114",
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
      "https://query1.finance.yahoo.com/v1/finance/search?q=market&quotesCount=10&newsCount=10",
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
    endpoint: "https://api.stlouisfed.org/fred/releases?file_type=json",
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
      "https://stats.bis.org/api/v1/data/BIS,WS_EER,1.0/.D..A?format=sdmx-json",
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
    endpoint: "https://eonet.gsfc.nasa.gov/api/v3/events",
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
    endpoint: "https://acleddata.com/feed/",
    tags: ["conflict", "security", "risk"],
  },
  {
    id: "ucdp",
    label: "UCDP",
    category: "geopolitics",
    kind: "rss",
    endpoint: "https://www.prio.org/rss/prio-news.xml",
    tags: ["conflict", "historical", "incidents"],
  },
  {
    id: "unhcr",
    label: "UNHCR",
    category: "geopolitics",
    kind: "rss",
    endpoint: "https://www.unhcr.org/news/stories/feed",
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
    endpoint: "https://www.fly.faa.gov/flyfaa/flyfaaindex.jsp",
    tags: ["aviation", "advisory", "ops"],
  },
  {
    id: "ais",
    label: "AIS Vessels",
    category: "transport",
    kind: "api",
    endpoint: "https://www.vesselfinder.com/api",
    tags: ["shipping", "ports", "maritime"],
  },
  {
    id: "cloudflare-radar",
    label: "Cloudflare Radar",
    category: "cyber",
    kind: "api",
    endpoint: "https://radar.cloudflare.com/api/data",
    tags: ["internet", "outage", "traffic"],
  },
  {
    id: "abusech",
    label: "abuse.ch",
    category: "cyber",
    kind: "api",
    endpoint: "https://urlhaus-api.abuse.ch/v1/urls/recent/",
    tags: ["malware", "threat-intel", "ioc"],
  },
  {
    id: "alienvault-otx",
    label: "AlienVault OTX",
    category: "cyber",
    kind: "api",
    endpoint: "https://otx.alienvault.com/api/v1/pulses/subscribed",
    tags: ["threat-intel", "ioc", "pulses"],
  },
  {
    id: "abuseipdb",
    label: "AbuseIPDB",
    category: "cyber",
    kind: "api",
    endpoint: "https://api.abuseipdb.com/api/v2/blacklist",
    tags: ["abuse", "ip-reputation", "security"],
  },
  {
    id: "c2intelfeeds",
    label: "C2IntelFeeds",
    category: "cyber",
    kind: "platform",
    endpoint:
      "https://raw.githubusercontent.com/drb-ra/C2IntelFeeds/master/feeds/atomic-red-team/command-and-control.csv",
    tags: ["c2", "threat-intel", "github"],
  },
  {
    id: "usaspending",
    label: "USASpending.gov",
    category: "government",
    kind: "api",
    endpoint: "https://api.usaspending.gov/api/v2/awards/",
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
