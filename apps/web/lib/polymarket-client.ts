import axios, { AxiosError, AxiosInstance } from "axios";

/**
 * Custom Error for Polymarket Rate Limits (HTTP 429)
 */
export class PolymarketRateLimitError extends Error {
  constructor(message: string = "Polymarket API Rate Limit exceeded") {
    super(message);
    this.name = "PolymarketRateLimitError";
  }
}

/**
 * Interface for Market data from Gamma API
 */
export interface Market {
  question: string;
  conditionId: string;
  description: string;
  [key: string]: any; // Allow for other fields returned by the API
}

/**
 * Interface for Orderbook Entry
 */
export interface OrderbookEntry {
  price: string;
  size: string;
}

/**
 * Interface for CLOB Orderbook
 */
export interface Orderbook {
  market: string;
  asset_id: string;
  timestamp: string;
  bids: OrderbookEntry[];
  asks: OrderbookEntry[];
  min_order_size: string;
  tick_size: string;
  last_trade_price: string;
}

/**
 * Interface for Open Interest data
 */
export interface OpenInterest {
  timestamp: number;
  open_interest_usd: number;
  daily_net_change_usd: number;
}

/**
 * Modular Client for Polymarket APIs (Gamma, Data, and CLOB)
 */
export class PolymarketDataClient {
  private gammaClient: AxiosInstance;
  private dataClient: AxiosInstance;
  private clobClient: AxiosInstance;

  constructor() {
    this.gammaClient = axios.create({
      baseURL: "https://gamma-api.polymarket.com",
    });

    this.dataClient = axios.create({
      baseURL: "https://data-api.polymarket.com",
    });

    this.clobClient = axios.create({
      baseURL: "https://clob.polymarket.com",
    });

    // Add response interceptor for unified 429 handling
    [this.gammaClient, this.dataClient, this.clobClient].forEach((client) => {
      client.interceptors.response.use(
        (response) => response,
        (error: AxiosError) => {
          if (error.response?.status === 429) {
            return Promise.reject(new PolymarketRateLimitError());
          }
          return Promise.reject(error);
        }
      );
    });
  }

  /**
   * Fetch active markets from Gamma API
   * @param limit Maximum number of markets to return
   * @param offset Offset for pagination
   */
  async getActiveMarkets(limit: number = 100, offset: number = 0): Promise<Market[]> {
    const response = await this.gammaClient.get<Market[]>("/markets", {
      params: {
        closed: false,
        limit,
        offset,
      },
    });
    return response.data;
  }

  /**
   * Fetch 'Open Interest' for a specific market from Data API
   * @param conditionId The hex conditionId of the market
   */
  async getOpenInterest(conditionId: string): Promise<OpenInterest[]> {
    const response = await this.dataClient.get("/open-interest", {
      params: {
        condition_ids: conditionId,
      },
    });
    // The API returns { data: OpenInterest[], meta: ... }
    return response.data.data;
  }

  /**
   * Fetch the orderbook for a given token_id from CLOB API
   * @param tokenId The decimal string token_id (asset_id)
   */
  async getOrderbook(tokenId: string): Promise<Orderbook> {
    const response = await this.clobClient.get<Orderbook>("/book", {
      params: {
        token_id: tokenId,
      },
    });
    return response.data;
  }
}

/**
 * Note on Official SDKs:
 * Polymarket provides official SDKs that include these types:
 * - @polymarket/clob-client: For CLOB API interaction.
 * - @polymarket/gamma-client (if available) or checking the Gamma API documentation directly.
 * For production use, it is recommended to use these SDKs as they handle 
 * complex logic like signing for authenticated requests.
 */
