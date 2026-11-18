import { apiRequest } from './authSession';

export type InquiryStatus = 'NEW' | 'CONTACTED' | 'QUOTED' | 'CLOSED';

export interface CompanyInquiry {
  id: string;
  materialId: string | null;
  materialName: string;
  contactName: string;
  contactInfo: string;
  message: string;
  status: InquiryStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  events: InquiryEvent[];
}

export interface InquiryEvent {
  id: number;
  actorType: 'CONSUMER' | 'COMPANY' | 'SYSTEM';
  eventType: 'CREATED' | 'STATUS_CHANGED' | 'REPLY';
  status: InquiryStatus | null;
  content: string | null;
  createdAt: string;
}

export interface CreateInquiryInput {
  materialId: string;
  contactName: string;
  contactInfo: string;
  message: string;
}

export function createMaterialInquiry(input: CreateInquiryInput): Promise<CompanyInquiry> {
  return apiRequest<CompanyInquiry>('/api/v1/inquiries', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function loadCompanyInquiries(): Promise<CompanyInquiry[]> {
  return apiRequest<CompanyInquiry[]>('/api/v1/business/inquiries');
}

export function loadMyInquiries(): Promise<CompanyInquiry[]> {
  return apiRequest<CompanyInquiry[]>('/api/v1/inquiries');
}

export function replyToInquiry(inquiryId: string, content: string): Promise<CompanyInquiry> {
  return apiRequest<CompanyInquiry>(`/api/v1/business/inquiries/${encodeURIComponent(inquiryId)}/replies`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export function updateInquiryStatus(inquiry: CompanyInquiry, status: InquiryStatus): Promise<CompanyInquiry> {
  return apiRequest<CompanyInquiry>(`/api/v1/business/inquiries/${encodeURIComponent(inquiry.id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, version: inquiry.version }),
  });
}
