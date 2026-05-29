import type { AIMessage } from "../services/aiService";
import type { FipeVehicleType } from "../services/fipeService";
import type { FipeZapQuery } from "../services/fipeZapService";
import type { MarketQuery } from "../services/marketDataService";

export interface FipeJobData {
  phone: string;
  rawQuery: string;
  vehicleType: FipeVehicleType;
}

export interface FipeZapJobData {
  phone: string;
  rawQuery: string;
  fipeZapQuery: FipeZapQuery;
}

export interface MarketJobData {
  query: MarketQuery;
}

export interface NutritionJobData {
  text: string;
  history: AIMessage[];
}

export interface ExpensesJobData {
  text: string;
  history: AIMessage[];
  allowedContexts: ("PESSOAL" | "COMERCIAL")[];
  source: "text" | "audio";
}

export interface FlightJobData {
  phone: string;
  flightQuery: import("../services/flightSearchService").FlightSearchQuery;
}

export interface QueueJobMap {
  svc_fipe: FipeJobData;
  svc_market: MarketJobData;
  svc_nutrition: NutritionJobData;
  svc_expenses: ExpensesJobData;
  svc_fipezap: FipeZapJobData;
  svc_flights: FlightJobData;
  svc_reserve_2: Record<string, never>;
  svc_reserve_3: Record<string, never>;
  svc_reserve_4: Record<string, never>;
  svc_reserve_5: Record<string, never>;
}
