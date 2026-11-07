import { apiRequest } from './authSession';

export interface BusinessCompleteness {
  certificationMaterialCount: number;
  caseCount: number;
  casesWithImages: number;
  hasPublicContact: boolean;
}

export function loadBusinessCompleteness(): Promise<BusinessCompleteness> {
  return apiRequest<BusinessCompleteness>('/api/v1/business/completeness');
}
