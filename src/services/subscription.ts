import { apiRequest } from './authSession';

export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'GRACE_PERIOD' | 'EXPIRED' | 'CANCELLED';

export interface CompanySubscription {
  id: string;
  companyId: string;
  planCode: string;
  planName: string;
  status: SubscriptionStatus;
  startedAt: string;
  expiresAt: string;
  trialEndsAt: string | null;
  generationQuota: number;
  storageLimitBytes: number;
  materialLimit: number;
  caseLimit: number;
  materialCount: number;
  caseCount: number;
  generationUsed: number;
  version: number;
  updatedAt: string;
}

export interface SubscriptionPlan {
  code: string;
  name: string;
  generationQuota: number;
  storageLimitBytes: number;
  materialLimit: number;
  caseLimit: number;
  monthlyPriceCents: number;
}

export type SubscriptionOrderStatus = 'PENDING' | 'PAID' | 'CANCELLED';

export interface SubscriptionOrder {
  id: string;
  orderNo: string;
  planCode: string;
  planName: string;
  amountCents: number;
  status: SubscriptionOrderStatus;
  paymentChannel: string;
  createdAt: string;
  paidAt: string | null;
}

export function loadCompanySubscription(): Promise<CompanySubscription> {
  return apiRequest<CompanySubscription>('/api/v1/business/subscription');
}

export function loadSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  return apiRequest<SubscriptionPlan[]>('/api/v1/business/subscription/plans');
}

export function loadSubscriptionOrders(): Promise<SubscriptionOrder[]> {
  return apiRequest<SubscriptionOrder[]>('/api/v1/business/subscription/orders');
}

export function createSubscriptionOrder(planCode: string): Promise<SubscriptionOrder> {
  const key = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return apiRequest<SubscriptionOrder>('/api/v1/business/subscription/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify({ planCode }),
  });
}
