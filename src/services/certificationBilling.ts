import { apiDownload, apiRequest } from './authSession';

export type CertificationPaymentStatus = 'PENDING' | 'PAID' | 'CANCELLED';
export type CertificationProofStatus = 'NOT_SUBMITTED' | 'SUBMITTED' | 'REJECTED';

export interface CertificationPaymentOrder {
  id: string;
  orderNo: string;
  companyId: string;
  companyName: string;
  amountCents: number;
  status: CertificationPaymentStatus;
  paymentChannel: 'MANUAL' | 'LEGACY';
  proofAssetId: string | null;
  proofFileName: string | null;
  payerNote: string | null;
  proofSubmittedAt: string | null;
  proofStatus: CertificationProofStatus;
  proofRejectionReason: string | null;
  proofReviewedBy: string | null;
  proofReviewedAt: string | null;
  paymentReference: string | null;
  note: string | null;
  confirmedBy: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface CertificationBillingSummary {
  amountCents: number;
  eligible: boolean;
  exempt: boolean;
  exemptionReason: string | null;
  latestOrder: CertificationPaymentOrder | null;
}

export interface CertificationFeeConfig {
  amountCents: number;
  updatedBy: string | null;
  updatedAt: string;
}

export function loadCertificationBilling() {
  return apiRequest<CertificationBillingSummary>('/api/v1/business/certification/payment');
}

export function createCertificationPaymentOrder() {
  const key = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return apiRequest<CertificationPaymentOrder>('/api/v1/business/certification/payment/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': `certification:${key}` },
  });
}

export function submitCertificationPaymentProof(orderId: string, proofAssetId: string, payerNote: string) {
  return apiRequest<CertificationPaymentOrder>(`/api/v1/business/certification/payment/orders/${encodeURIComponent(orderId)}/proof`, {
    method: 'PUT',
    body: JSON.stringify({ proofAssetId, payerNote }),
  });
}

export function loadCertificationFeeConfig() {
  return apiRequest<CertificationFeeConfig>('/api/v1/admin/certification-payments/config');
}

export function updateCertificationFee(amountCents: number) {
  return apiRequest<CertificationFeeConfig>('/api/v1/admin/certification-payments/config', {
    method: 'PUT',
    body: JSON.stringify({ amountCents }),
  });
}

export function loadAdminCertificationPaymentOrders(status?: CertificationPaymentStatus) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiRequest<CertificationPaymentOrder[]>(`/api/v1/admin/certification-payments/orders${query}`);
}

export function confirmCertificationPayment(orderId: string, paymentReference: string, note: string) {
  return apiRequest<CertificationPaymentOrder>(`/api/v1/admin/certification-payments/orders/${encodeURIComponent(orderId)}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ paymentReference, note }),
  });
}

export function downloadCertificationPaymentProof(orderId: string) {
  return apiDownload(`/api/v1/admin/certification-payments/orders/${encodeURIComponent(orderId)}/proof`);
}

export function rejectCertificationPaymentProof(orderId: string, reason: string) {
  return apiRequest<CertificationPaymentOrder>(`/api/v1/admin/certification-payments/orders/${encodeURIComponent(orderId)}/proof/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}
