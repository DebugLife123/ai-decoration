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

export function updateInquiryStatus(inquiry: CompanyInquiry, status: InquiryStatus): Promise<CompanyInquiry> {
  return apiRequest<CompanyInquiry>(`/api/v1/business/inquiries/${encodeURIComponent(inquiry.id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, version: inquiry.version }),
  });
}
