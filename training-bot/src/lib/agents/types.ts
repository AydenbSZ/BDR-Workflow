import type { PrismaClient } from "@/generated/prisma/client";

export interface AgentContext {
  runId: string;
  triggeredBy: string;
  db: PrismaClient;
}

export interface AgentResult {
  success: boolean;
  summary: string;
  counts: Record<string, number>;
  errors: string[];
}

export type AgentFn<TInput = unknown> = (
  ctx: AgentContext,
  input: TInput
) => Promise<AgentResult>;

export const ICP_CONFIG = {
  industries: [
    "Restaurant",
    "QSR",
    "Fast Casual",
    "Franchise Restaurant",
    "Fitness",
    "Gym",
    "Med Spa",
    "Beauty Salon",
    "Wellness",
    "Oil Change",
    "Tire",
    "Car Wash",
    "Automotive Service",
    "Retail",
  ],
  minLocations: 50,
  targetTitles: {
    primary: [
      "Chief Development Officer",
      "VP Development",
      "Vice President Development",
      "Director of Development",
      "VP Real Estate",
      "Vice President Real Estate",
      "Director Real Estate",
      "Director of Real Estate",
      "Head of Real Estate",
      "VP Franchise Development",
      "Vice President Franchise Development",
      "Director Franchise Development",
      "Director of Franchise Development",
      "Chief Growth Officer",
    ],
    secondary: [
      "COO",
      "Chief Operating Officer",
      "CEO",
      "Chief Executive Officer",
      "VP Operations",
      "Vice President Operations",
      "VP Strategy",
      "Vice President Strategy",
    ],
  },
  apolloSeniorities: ["c_suite", "vp", "director"],
  expansionKeywords: [
    "expansion",
    "new locations",
    "franchise growth",
    "opening",
    "new market",
    "development pipeline",
    "unit growth",
    "signed franchise agreements",
    "territory",
    "real estate",
  ],
  searchQueries: [
    "restaurant chain expansion 2025 2026",
    "QSR franchise growth new locations",
    "fast casual restaurant opening new markets",
    "fitness gym chain expansion plans",
    "franchise development agreement signed",
    "multi-unit restaurant brand growth",
    "car wash chain expansion new locations",
    "med spa franchise growth",
    "retail chain expansion plans 2026",
    "private equity restaurant investment growth",
  ],
} as const;

export const SCORING_WEIGHTS = {
  EXPANSION_ANNOUNCEMENT: 25,
  FRANCHISE_GROWTH: 20,
  FUNDING_ROUND: 15,
  PE_ACQUISITION: 15,
  DEVELOPMENT_HIRING: 10,
  NEW_MARKET_ENTRY: 20,
  EXECUTIVE_HIRE: 5,
  NEWS_MENTION: 5,
  LOCATION_CLOSURE: -25,
  LOCATIONS_100_PLUS: 15,
  LOCATIONS_50_99: 5,
  LOCATIONS_UNDER_50: -15,
  FRANCHISE_MODEL: 10,
  NO_GROWTH_SIGNALS: -20,
} as const;
