export type PlanId = 'free' | 'pro_month' | 'pro_year';

export interface Plan {
  id: PlanId;
  name: string;
  tier: string;
  tagline: string;
  priceCents: number;
  period: 'none' | 'month' | 'year';
  creditsPerPeriod: number;
  badge?: string;
  highlights: string[];
  entitlements: {
    cad: boolean;
    nowatermark: boolean;
    hires: boolean;
    priority: boolean;
    history: boolean;
  };
  limits: {
    concurrency: number;
    historyDays: number;
  };
}

export interface CreditPack {
  id: string;
  name: string;
  credits: number;
  bonus: number;
  priceCents: number;
  validMonths: number;
  note: string;
}
