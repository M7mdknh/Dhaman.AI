/**
 * Deterministic financial profiles for the three demo contractors.
 * Single source of truth for: parser unit tests, engine unit tests,
 * generated sample PDFs, and E2E flows. All figures are plain SAR and
 * balance-sheet consistent (assets = liabilities + equity).
 */

export interface YearFigures {
  fiscalYear: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  operatingIncome: number;
  financeCosts: number;
  netIncome: number;
  cash: number;
  receivables: number;
  inventory: number;
  ppe: number;
  currentAssets: number;
  totalAssets: number;
  shortTermDebt: number;
  tradePayables: number;
  currentLiabilities: number;
  longTermDebt: number;
  totalLiabilities: number;
  shareCapital: number;
  retainedEarnings: number;
  totalEquity: number;
  operatingCashFlow: number;
  investingCashFlow: number;
  financingCashFlow: number;
  capex: number;
}

export interface CompanyProfile {
  name: string;
  years: YearFigures[]; // newest first
}

export const STRONG_PROFILE: CompanyProfile = {
  name: "RAWABI CONTRACTING CO.",
  years: [
    {
      fiscalYear: 2025,
      revenue: 120_000_000, cogs: 84_000_000, grossProfit: 36_000_000,
      operatingIncome: 18_000_000, financeCosts: 2_000_000, netIncome: 14_000_000,
      cash: 25_000_000, receivables: 30_000_000, inventory: 15_000_000,
      ppe: 50_000_000, currentAssets: 70_000_000, totalAssets: 120_000_000,
      shortTermDebt: 5_000_000, tradePayables: 25_000_000, currentLiabilities: 30_000_000,
      longTermDebt: 15_000_000, totalLiabilities: 45_000_000,
      shareCapital: 40_000_000, retainedEarnings: 35_000_000, totalEquity: 75_000_000,
      operatingCashFlow: 20_000_000, investingCashFlow: -8_000_000,
      financingCashFlow: -5_000_000, capex: 8_000_000,
    },
    {
      fiscalYear: 2024,
      revenue: 100_000_000, cogs: 72_000_000, grossProfit: 28_000_000,
      operatingIncome: 14_000_000, financeCosts: 1_800_000, netIncome: 10_500_000,
      cash: 18_000_000, receivables: 26_000_000, inventory: 14_000_000,
      ppe: 47_000_000, currentAssets: 58_000_000, totalAssets: 105_000_000,
      shortTermDebt: 6_000_000, tradePayables: 24_000_000, currentLiabilities: 30_000_000,
      longTermDebt: 18_000_000, totalLiabilities: 48_000_000,
      shareCapital: 40_000_000, retainedEarnings: 17_000_000, totalEquity: 57_000_000,
      operatingCashFlow: 15_000_000, investingCashFlow: -6_000_000,
      financingCashFlow: -4_000_000, capex: 6_000_000,
    },
  ],
};

export const MODERATE_PROFILE: CompanyProfile = {
  name: "NIMAH CONSTRUCTION & TRADING",
  years: [
    {
      fiscalYear: 2025,
      revenue: 63_000_000, cogs: 50_400_000, grossProfit: 12_600_000,
      operatingIncome: 5_000_000, financeCosts: 1_200_000, netIncome: 3_150_000,
      cash: 6_000_000, receivables: 15_000_000, inventory: 9_000_000,
      ppe: 40_000_000, currentAssets: 30_000_000, totalAssets: 70_000_000,
      shortTermDebt: 7_000_000, tradePayables: 14_400_000, currentLiabilities: 21_400_000,
      longTermDebt: 20_600_000, totalLiabilities: 42_000_000,
      shareCapital: 20_000_000, retainedEarnings: 8_000_000, totalEquity: 28_000_000,
      operatingCashFlow: 4_200_000, investingCashFlow: -2_000_000,
      financingCashFlow: -1_500_000, capex: 2_000_000,
    },
    {
      fiscalYear: 2024,
      revenue: 60_000_000, cogs: 48_600_000, grossProfit: 11_400_000,
      operatingIncome: 4_400_000, financeCosts: 1_100_000, netIncome: 2_700_000,
      cash: 5_500_000, receivables: 14_000_000, inventory: 8_600_000,
      ppe: 37_900_000, currentAssets: 28_100_000, totalAssets: 66_000_000,
      shortTermDebt: 6_500_000, tradePayables: 13_700_000, currentLiabilities: 20_200_000,
      longTermDebt: 19_800_000, totalLiabilities: 40_000_000,
      shareCapital: 20_000_000, retainedEarnings: 6_000_000, totalEquity: 26_000_000,
      operatingCashFlow: 3_900_000, investingCashFlow: -1_800_000,
      financingCashFlow: -1_400_000, capex: 1_800_000,
    },
  ],
};

/**
 * Distressed profile: revenue −33%, negative net income, negative working
 * capital, negative operating cash flow, receivables ballooning against a
 * shrinking top line, equity eroding. Exercises every risk flag.
 */
export const WEAK_PROFILE: CompanyProfile = {
  name: "FAISAL TRADING & CONTRACTING EST.",
  years: [
    {
      fiscalYear: 2025,
      revenue: 30_000_000, cogs: 27_000_000, grossProfit: 3_000_000,
      operatingIncome: 500_000, financeCosts: 2_500_000, netIncome: -2_800_000,
      cash: 1_000_000, receivables: 18_000_000, inventory: 6_000_000,
      ppe: 35_000_000, currentAssets: 25_000_000, totalAssets: 60_000_000,
      shortTermDebt: 12_000_000, tradePayables: 16_000_000, currentLiabilities: 28_000_000,
      longTermDebt: 20_000_000, totalLiabilities: 48_000_000,
      shareCapital: 15_000_000, retainedEarnings: -3_000_000, totalEquity: 12_000_000,
      operatingCashFlow: -1_500_000, investingCashFlow: -500_000,
      financingCashFlow: 2_000_000, capex: 500_000,
    },
    {
      fiscalYear: 2024,
      revenue: 45_000_000, cogs: 36_000_000, grossProfit: 9_000_000,
      operatingIncome: 3_600_000, financeCosts: 2_000_000, netIncome: 1_200_000,
      cash: 4_000_000, receivables: 12_000_000, inventory: 7_000_000,
      ppe: 35_000_000, currentAssets: 23_000_000, totalAssets: 58_000_000,
      shortTermDebt: 8_000_000, tradePayables: 13_200_000, currentLiabilities: 21_200_000,
      longTermDebt: 20_000_000, totalLiabilities: 41_200_000,
      shareCapital: 15_000_000, retainedEarnings: 1_800_000, totalEquity: 16_800_000,
      operatingCashFlow: 2_500_000, investingCashFlow: -1_000_000,
      financingCashFlow: 1_500_000, capex: 1_000_000,
    },
  ],
};

export const ALL_PROFILES = {
  strong: STRONG_PROFILE,
  moderate: MODERATE_PROFILE,
  weak: WEAK_PROFILE,
} as const;
