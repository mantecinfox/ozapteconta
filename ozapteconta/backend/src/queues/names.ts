export const QUEUE_NAMES = {
  FIPE: "svc_fipe",
  MARKET: "svc_market",
  NUTRITION: "svc_nutrition",
  EXPENSES: "svc_expenses",
  FIPEZAP: "svc_fipezap",
  FLIGHTS: "svc_flights",
  RESERVE_2: "svc_reserve_2",
  RESERVE_3: "svc_reserve_3",
  RESERVE_4: "svc_reserve_4",
  RESERVE_5: "svc_reserve_5",
  /** @deprecated use FIPEZAP */
  RESERVE_1: "svc_fipezap",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const ALL_QUEUE_NAMES: QueueName[] = [
  QUEUE_NAMES.FIPE,
  QUEUE_NAMES.MARKET,
  QUEUE_NAMES.NUTRITION,
  QUEUE_NAMES.EXPENSES,
  QUEUE_NAMES.FIPEZAP,
  QUEUE_NAMES.FLIGHTS,
  QUEUE_NAMES.RESERVE_2,
  QUEUE_NAMES.RESERVE_3,
  QUEUE_NAMES.RESERVE_4,
  QUEUE_NAMES.RESERVE_5,
];

export const ACTIVE_SERVICE_QUEUES: QueueName[] = [
  QUEUE_NAMES.FIPE,
  QUEUE_NAMES.MARKET,
  QUEUE_NAMES.NUTRITION,
  QUEUE_NAMES.EXPENSES,
  QUEUE_NAMES.FIPEZAP,
];
