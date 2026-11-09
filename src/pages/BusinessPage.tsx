import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import type { MaterialRecord } from '../services/dataContracts';
import MaterialImagePicker from '../components/MaterialImagePicker';
import { readLocalValue, writeLocalValue } from '../services/localDataAdapter';
import { businessDataAdapter, businessLocalKeys, type BusinessCaseRecord, type CompanyCertificationRecord, type CompanyProfileRecord, type LaborQuoteRecord } from '../services/businessData';
import { loadCompanyInquiries, updateInquiryStatus, type CompanyInquiry, type InquiryStatus } from '../services/inquiries';
import { loadBusinessCompleteness, type BusinessCompleteness } from '../services/businessCompleteness';
import { budgetUnitOptions, isUnitRecognized, unitUnknownBadge, unitUnknownHint } from '../services/budgetUnits';
import './BusinessPage.css';

type TabKey = 'overview' | 'cases' | 'materials' | 'workers' | 'inquiries' | 'certification';
type RecordStatus = 'draft' | 'published';
type CertStatus = 'draft' | CompanyCertificationRecord['status'];

type CaseRecord = BusinessCaseRecord;
type WorkerRecord = LaborQuoteRecord;
type CompanyProfile = CompanyProfileRecord;

type Certification = {
  id?: string;
  companyName: string;
  contactName: string;
  contactInfo: string;
  serviceAreas: string[];
  documentRefs: string[];
  status: CertStatus;
  reviewNote?: string | null;
  version?: number;
  submittedAt?: string;
  updatedAt?: string;
};

const tabs: { key: TabKey; label: string; description: string }[] = [
  { key: 'overview', label: '企业概览', description: '资料完整度和本地草稿状态' },
  { key: 'cases', label: '案例资料', description: '管理可展示的项目案例' },
  { key: 'materials', label: '材料报价', description: '维护材料和地区价格' },
  { key: 'workers', label: '人工报价', description: '维护工种和有效期' },
  { key: 'inquiries', label: '客户咨询', description: '查看并跟进用户咨询' },
  { key: 'certification', label: '认证资料', description: '准备企业认证信息' },
];

const inquiryStatusLabels: Record<InquiryStatus, string> = {
  NEW: '待跟进',
  CONTACTED: '已联系',
  QUOTED: '已报价',
  CLOSED: '已完成',
};

const emptyCase: Omit<CaseRecord, 'id' | 'updatedAt'> = {
  title: '', area: '', style: '', budget: '', status: 'draft', files: [],
};
const emptyMaterial: Omit<MaterialRecord, 'id' | 'updatedAt'> = {
  name: '', brand: '', spec: '', unit: '', price: '', category: '', region: '', validUntil: '', imageIds: [],
};
const emptyWorker: Omit<WorkerRecord, 'id' | 'updatedAt'> = {
  type: '', unit: '', price: '', region: '', validUntil: '',
};
const defaultProfile: CompanyProfile = { name: '', city: '', services: '', intro: '', publicContactName: '', publicContactInfo: '', serviceAreas: '', businessHours: '' };
const defaultCertification: Certification = {
  companyName: '', contactName: '', contactInfo: '', serviceAreas: [], documentRefs: [], status: 'draft',
};
function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function quoteExpiry(validUntil: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) return { kind: 'valid' as const, days: Number.POSITIVE_INFINITY };
  const [year, month, day] = validUntil.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = localDateString().split('-').map(Number);
  const days = Math.round((Date.UTC(year, month - 1, day) - Date.UTC(todayYear, todayMonth - 1, todayDay)) / 86_400_000);
  if (days < 0) return { kind: 'expired' as const, days };
  if (days <= 30) return { kind: 'soon' as const, days };
  return { kind: 'valid' as const, days };
}

const minValidDate = localDateString();
const latestValidDate = new Date();
latestValidDate.setFullYear(latestValidDate.getFullYear() + 10);
const maxValidDate = localDateString(latestValidDate);

function readStored<T>(key: string, fallback: T): T {
  if (businessDataAdapter.mode === 'api') return fallback;
  return readLocalValue(key, fallback);
}

function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => readStored(key, fallback));
  useEffect(() => {
    if (businessDataAdapter.mode === 'local') writeLocalValue(key, value);
  }, [key, value]);
  return [value, setValue] as const;
}

function now() {
  return new Date().toISOString();
}

function dateLabel(value: string) {
  if (!value) return '未设置';
  return value.includes('T') ? value.slice(0, 10) : value;
}

function Icon({ name }: { name: 'building' | 'plus' | 'upload' | 'file' | 'arrow' | 'check' | 'trash' }) {
  const paths = {
    building: <><path d="M4 20V8h16v12M2 20h20M7 8V5h10v3M8 12h2M14 12h2M8 16h2M14 16h2" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action?: () => void }) {
  return (
    <div className="business-empty">
      <div className="empty-mark"><Icon name="file" /></div>
      <strong>{title}</strong>
      <p>{detail}</p>
      {action && <button className="text-action" onClick={action}>开始录入 <Icon name="arrow" /></button>}
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="business-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

const itemNatureOptions: { value: 'INCLUDED' | 'GIFT' | 'OWNER_SUPPLIED'; label: string }[] = [
  { value: 'INCLUDED', label: '计价项（计入造价）' },
  { value: 'GIFT', label: '赠送项（不计入造价）' },
  { value: 'OWNER_SUPPLIED', label: '业主自购（不计入造价）' },
];

/**
 * 单位下拉。历史上企业把规格「mm」填进单位字段，导致「299 元/㎡」被当成
 * 「299 元/mm」。这里改成从枚举里选，编辑老数据时把无法识别的原值显式列出来，
 * 让用户当场改掉。
 */
function UnitSelect({ value, onChange }: { value: string; onChange: (unit: string) => void }) {
  const recognized = isUnitRecognized(value);
  return (
    <select required value={recognized ? value : ''} onChange={(event) => onChange(event.target.value)}>
      {!recognized && <option value="">{value ? `未识别：${value}（请重选）` : '请选择计量单位'}</option>}
      {budgetUnitOptions.map((option) => (
        <option key={option.kind} value={option.unit}>{option.label} · {option.unit}</option>
      ))}
    </select>
  );
}

export default function BusinessPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const validTab = tabs.some((tab) => tab.key === requestedTab) ? requestedTab as TabKey : 'overview';
  const activeTab = validTab;
  const [profile, setProfile] = useStoredState<CompanyProfile>('decoration-business-profile', defaultProfile);
  const [cases, setCases] = useStoredState<CaseRecord[]>(businessLocalKeys.cases, []);
  const [materials, setMaterials] = useStoredState<MaterialRecord[]>(businessLocalKeys.materials, []);
  const [workers, setWorkers] = useStoredState<WorkerRecord[]>(businessLocalKeys.workers, []);
  const [certification, setCertification] = useStoredState<Certification>('decoration-business-certification', defaultCertification);
  const [inquiries, setInquiries] = useState<CompanyInquiry[]>([]);
  const [completeness, setCompleteness] = useState<BusinessCompleteness | null>(null);
  const [profileDraft, setProfileDraft] = useState(() => profile);
  const [certDraft, setCertDraft] = useState(() => certification);
  const [showProfileForm, setShowProfileForm] = useState(!profile.name);
  const [showCaseForm, setShowCaseForm] = useState(false);
  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [showWorkerForm, setShowWorkerForm] = useState(false);
  const [editingCaseId, setEditingCaseId] = useState('');
  const [editingMaterialId, setEditingMaterialId] = useState('');
  const [editingWorkerId, setEditingWorkerId] = useState('');
  const [publishingCaseId, setPublishingCaseId] = useState('');
  const [caseForm, setCaseForm] = useState(emptyCase);
  const [materialForm, setMaterialForm] = useState(emptyMaterial);
  const [workerForm, setWorkerForm] = useState(emptyWorker);
  const [certError, setCertError] = useState('');
  const [certFeedback, setCertFeedback] = useState('');
  const [certSaving, setCertSaving] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState('');
  const [materialFeedback, setMaterialFeedback] = useState('');
  const [workerFeedback, setWorkerFeedback] = useState('');
  const [operationError, setOperationError] = useState('');
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [removingDocumentId, setRemovingDocumentId] = useState('');
  const [certDocumentNames, setCertDocumentNames] = useState<Record<string, string>>({});
  const [inquiryFilter, setInquiryFilter] = useState<'ALL' | InquiryStatus>('ALL');
  const [updatingInquiryId, setUpdatingInquiryId] = useState('');
  const [previewingDocumentId, setPreviewingDocumentId] = useState('');
  const [certImagePreviews, setCertImagePreviews] = useState<Record<string, string>>({});
  const [certPreview, setCertPreview] = useState<{ id: string; url: string; type: string; name: string } | null>(null);
  const [profileImageUrls, setProfileImageUrls] = useState<Record<string, string>>({});
  const [profileImageBusy, setProfileImageBusy] = useState<'logo' | 'storefront' | ''>('');
  const profileImageUrlsRef = useRef<Record<string, string>>({});
  const certImagePreviewUrls = useRef(new Map<string, string>());
  const certPdfPreviewUrl = useRef('');
  const [loading, setLoading] = useState(businessDataAdapter.mode === 'api');

  useEffect(() => {
    return () => {
      certImagePreviewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      if (certPdfPreviewUrl.current) URL.revokeObjectURL(certPdfPreviewUrl.current);
    };
  }, []);

  useEffect(() => { profileImageUrlsRef.current = profileImageUrls; }, [profileImageUrls]);
  useEffect(() => () => Object.values(profileImageUrlsRef.current).forEach((url) => URL.revokeObjectURL(url)), []);
  useEffect(() => {
    if (businessDataAdapter.mode !== 'api') return;
    const assetIds = [profile.logoAssetId, profile.storefrontAssetId].filter((id): id is string => Boolean(id));
    let active = true;
    void Promise.all(assetIds.filter((id) => !profileImageUrls[id]).map(async (id) => {
      try {
        const blob = await businessDataAdapter.downloadAsset(id);
        return [id, URL.createObjectURL(blob)] as const;
      } catch { return null; }
    })).then((loaded) => {
      if (!active) return;
      const next: Record<string, string> = {};
      loaded.forEach((item) => { if (item) next[item[0]] = item[1]; });
      if (Object.keys(next).length) setProfileImageUrls((current) => ({ ...current, ...next }));
    });
    return () => { active = false; };
  }, [profile.logoAssetId, profile.storefrontAssetId, profileImageUrls]);

  useEffect(() => {
    if (businessDataAdapter.mode !== 'api') return;
    let active = true;
    void Promise.all([
      businessDataAdapter.loadProfile(),
      businessDataAdapter.loadCases(),
      businessDataAdapter.loadMaterials(),
      businessDataAdapter.loadWorkers(),
      businessDataAdapter.loadCertification(),
      loadCompanyInquiries(),
      loadBusinessCompleteness(),
    ]).then(([nextProfile, nextCases, nextMaterials, nextWorkers, nextCertification, nextInquiries, nextCompleteness]) => {
      if (!active) return;
      setProfile(nextProfile);
      setProfileDraft(nextProfile);
      setCases(nextCases);
      setMaterials(nextMaterials);
      setWorkers(nextWorkers);
      if (nextCertification) {
        setCertification(nextCertification);
        setCertDraft(nextCertification);
      }
      setInquiries(nextInquiries);
      setCompleteness(nextCompleteness);
      setShowProfileForm(!nextProfile.name);
      setLoading(false);
    }).catch((error: unknown) => {
      if (!active) return;
      setOperationError(error instanceof Error ? error.message : '业务资料加载失败。');
      setLoading(false);
    });
    return () => { active = false; };
  }, [setCases, setMaterials, setProfile, setWorkers, setCertification]);

  useEffect(() => {
    if (!editingMaterialId) return;
    const existing = materials.find((item) => item.id === editingMaterialId);
    if (existing) setMaterialForm((current) => ({ ...current, imageIds: existing.imageIds || (existing.imageId ? [existing.imageId] : []) }));
  }, [editingMaterialId, materials]);

  const completion = useMemo(() => {
    return [Boolean(profile.name), cases.length > 0, materials.length > 0, workers.length > 0, certification.status === 'APPROVED'].filter(Boolean).length;
  }, [cases.length, certification.status, materials.length, profile.name, workers.length]);

  const goTo = (tab: TabKey) => {
    setSearchParams({ tab }, { replace: true });
  };
  const uploadSelectedFiles = async (files: File[]) => {
    if (!files.length) return;
    const oversized = files.find((file) => file.size > 15 * 1024 * 1024);
    if (oversized) {
      setOperationError(`“${oversized.name}”超过 15 MB，请压缩后再上传。`);
      return;
    }
    setUploadingFiles(true);
    setOperationError('');
    try {
      const uploaded = await Promise.all(files.map((file) => businessDataAdapter.uploadAsset(file)));
      setCaseForm((current) => ({ ...current, files: [...current.files, ...uploaded.map((item) => item.id)] }));
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : '文件上传失败。');
    } finally {
      setUploadingFiles(false);
    }
  };
  const uploadCertificationFiles = async (files: File[]) => {
    if (!files.length) return;
    const oversized = files.find((file) => file.size > 15 * 1024 * 1024);
    if (oversized) {
      setCertError(`“${oversized.name}”超过 15 MB，请压缩后再上传。`);
      return;
    }
    setUploadingFiles(true);
    setCertError('');
    try {
      const uploaded = await Promise.all(files.map((file) => businessDataAdapter.uploadAsset(file)));
      setCertDraft((current) => ({ ...current, documentRefs: [...current.documentRefs, ...uploaded.map((item) => item.id)] }));
      setCertDocumentNames((current) => ({ ...current, ...Object.fromEntries(uploaded.map((item) => [item.id, item.fileName])) }));
    } catch (error) {
      setCertError(error instanceof Error ? error.message : '认证文件上传失败。');
    } finally {
      setUploadingFiles(false);
    }
  };
  const removeCertificationFile = async (fileId: string) => {
    if (certification.documentRefs.includes(fileId)) return;
    setRemovingDocumentId(fileId);
    setCertError('');
    setCertFeedback('');
    try {
      await businessDataAdapter.deleteAsset(fileId);
      setCertDraft((current) => ({ ...current, documentRefs: current.documentRefs.filter((item) => item !== fileId) }));
      setCertDocumentNames((current) => { const next = { ...current }; delete next[fileId]; return next; });
      const imagePreview = certImagePreviewUrls.current.get(fileId);
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      certImagePreviewUrls.current.delete(fileId);
      setCertImagePreviews((current) => { const next = { ...current }; delete next[fileId]; return next; });
      setCertFeedback('错误附件已移除。');
    } catch (error) {
      setCertError(error instanceof Error ? error.message : '附件移除失败。');
    } finally {
      setRemovingDocumentId('');
    }
  };
  const setInquiryStatus = async (inquiry: CompanyInquiry, status: InquiryStatus) => {
    setUpdatingInquiryId(inquiry.id);
    setOperationError('');
    try {
      const saved = await updateInquiryStatus(inquiry, status);
      setInquiries((items) => items.map((item) => item.id === saved.id ? saved : item));
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : '咨询状态更新失败。');
    } finally {
      setUpdatingInquiryId('');
    }
  };
  const previewCertificationFile = async (fileId: string) => {
    setPreviewingDocumentId(fileId);
    setCertError('');
    try {
      const blob = await businessDataAdapter.downloadAsset(fileId);
      if (!blob.type.startsWith('image/') && blob.type !== 'application/pdf') {
        throw new Error('该附件格式暂不支持预览。');
      }
      if (certPdfPreviewUrl.current) {
        URL.revokeObjectURL(certPdfPreviewUrl.current);
        certPdfPreviewUrl.current = '';
      }
      let url: string;
      if (blob.type.startsWith('image/')) {
        url = certImagePreviewUrls.current.get(fileId) || URL.createObjectURL(blob);
        certImagePreviewUrls.current.set(fileId, url);
        setCertImagePreviews((current) => ({ ...current, [fileId]: url }));
      } else {
        url = URL.createObjectURL(blob);
        certPdfPreviewUrl.current = url;
      }
      setCertPreview({
        id: fileId,
        url,
        type: blob.type,
        name: certDocumentNames[fileId] || fileId,
      });
    } catch (error) {
      setCertError(error instanceof Error ? error.message : '附件预览失败。');
    } finally {
      setPreviewingDocumentId('');
    }
  };
  const closeCertificationPreview = () => {
    if (certPreview?.type === 'application/pdf' && certPdfPreviewUrl.current) {
      URL.revokeObjectURL(certPdfPreviewUrl.current);
      certPdfPreviewUrl.current = '';
    }
    setCertPreview(null);
  };
  const downloadAsset = async (id: string) => {
    try {
      const blob = await businessDataAdapter.downloadAsset(id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `企业资料-${id.slice(0, 8)}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : '文件下载失败。');
    }
  };
  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setOperationError('');
    try {
      const saved = await businessDataAdapter.saveProfile(profileDraft);
      setProfile(saved);
      setProfileDraft(saved);
      setProfileFeedback(businessDataAdapter.mode === 'api' ? '企业资料已保存到平台。' : '企业资料已保存到本机草稿，尚未同步到平台。');
      setShowProfileForm(false);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : '企业资料保存失败。');
    }
  };
  const updateProfileImage = async (kind: 'logo' | 'storefront', file?: File) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { setOperationError('图片不能超过 15 MB。'); return; }
    if (!file.type.startsWith('image/')) { setOperationError('这里只能上传图片文件。'); return; }
    setProfileImageBusy(kind); setOperationError('');
    const oldId = kind === 'logo' ? profile.logoAssetId : profile.storefrontAssetId;
    try {
      const uploaded = await businessDataAdapter.uploadAsset(file);
      const next = { ...profileDraft, ...(kind === 'logo' ? { logoAssetId: uploaded.id } : { storefrontAssetId: uploaded.id }) };
      const saved = await businessDataAdapter.saveProfile(next);
      setProfile(saved); setProfileDraft(saved);
      const blob = await businessDataAdapter.downloadAsset(uploaded.id);
      setProfileImageUrls((current) => ({ ...current, [uploaded.id]: URL.createObjectURL(blob) }));
      if (oldId) {
        setProfileImageUrls((current) => { if (current[oldId]) URL.revokeObjectURL(current[oldId]); const nextUrls = { ...current }; delete nextUrls[oldId]; return nextUrls; });
        void businessDataAdapter.deleteAsset(oldId).catch(() => undefined);
      }
      setProfileFeedback('企业主页图片已保存。');
    } catch (error) { setOperationError(error instanceof Error ? error.message : '企业主页图片保存失败。'); }
    finally { setProfileImageBusy(''); }
  };
  const removeProfileImage = async (kind: 'logo' | 'storefront') => {
    const oldId = kind === 'logo' ? profile.logoAssetId : profile.storefrontAssetId;
    if (!oldId) return;
    setProfileImageBusy(kind); setOperationError('');
    try {
      const next = { ...profileDraft, ...(kind === 'logo' ? { logoAssetId: undefined } : { storefrontAssetId: undefined }) };
      const saved = await businessDataAdapter.saveProfile(next);
      setProfile(saved); setProfileDraft(saved);
      setProfileImageUrls((current) => { if (current[oldId]) URL.revokeObjectURL(current[oldId]); const nextUrls = { ...current }; delete nextUrls[oldId]; return nextUrls; });
      await businessDataAdapter.deleteAsset(oldId);
      setProfileFeedback('主页图片已移除。');
    } catch (error) { setOperationError(error instanceof Error ? error.message : '主页图片移除失败。'); }
    finally { setProfileImageBusy(''); }
  };

  const addCase = async (event: FormEvent) => {
    event.preventDefault();
    if (!caseForm.title.trim()) return;
    setOperationError('');
    try {
      const saved = editingCaseId
        ? await businessDataAdapter.updateCase({ ...caseForm, id: editingCaseId, updatedAt: now(), version: cases.find((item) => item.id === editingCaseId)?.version })
        : await businessDataAdapter.createCase(caseForm);
      setCases((items) => editingCaseId ? items.map((item) => item.id === saved.id ? saved : item) : [saved, ...items]);
      setCaseForm(emptyCase);
      setEditingCaseId('');
      setShowCaseForm(false);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : '案例保存失败。');
    }
  };

  const publishCase = async (item: CaseRecord) => {
    setPublishingCaseId(item.id);
    setOperationError('');
    try {
      const saved = await businessDataAdapter.publishCase(item);
      setCases((items) => items.map((current) => current.id === saved.id ? saved : current));
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : '案例发布失败。');
    } finally {
      setPublishingCaseId('');
    }
  };

  const addMaterial = async (event: FormEvent) => {
    event.preventDefault();
    const price = Number(materialForm.price);
    if (!materialForm.name.trim()) { setMaterialFeedback('请填写材料名称。'); return; }
    if (!Number.isFinite(price) || price <= 0) { setMaterialFeedback('价格必须是大于 0 的数字。'); return; }
    if (!materialForm.region.trim()) { setMaterialFeedback('请填写适用地区。'); return; }
    if (!materialForm.validUntil || materialForm.validUntil < localDateString()) { setMaterialFeedback('有效期不能早于今天。'); return; }
    if (materialForm.validUntil > maxValidDate) { setMaterialFeedback('有效期不能超过未来 10 年。'); return; }
    setOperationError('');
    try {
      const existing = materials.find((item) => item.id === editingMaterialId);
      const saved = editingMaterialId && existing
        ? await businessDataAdapter.updateMaterial({ ...existing, ...materialForm, id: editingMaterialId, updatedAt: now() })
        : await businessDataAdapter.createMaterial(materialForm);
      setMaterials((items) => editingMaterialId ? items.map((item) => item.id === saved.id ? saved : item) : [saved, ...items]);
      setMaterialFeedback(businessDataAdapter.mode === 'api' ? '报价已保存到平台。' : '本机草稿已保存，尚未同步到平台。');
      setMaterialForm(emptyMaterial);
      setEditingMaterialId('');
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : '材料报价保存失败。');
    }
  };

  const addWorker = async (event: FormEvent) => {
    event.preventDefault();
    const price = Number(workerForm.price);
    if (!workerForm.type.trim()) { setWorkerFeedback('请填写工种名称。'); return; }
    if (!Number.isFinite(price) || price <= 0) { setWorkerFeedback('单价必须是大于 0 的数字。'); return; }
    if (!workerForm.region.trim()) { setWorkerFeedback('请填写服务地区。'); return; }
    if (!workerForm.validUntil || workerForm.validUntil < localDateString()) { setWorkerFeedback('有效期不能早于今天。'); return; }
    if (workerForm.validUntil > maxValidDate) { setWorkerFeedback('有效期不能超过未来 10 年。'); return; }
    setOperationError('');
    try {
      const existing = workers.find((item) => item.id === editingWorkerId);
      const saved = editingWorkerId && existing
        ? await businessDataAdapter.updateWorker({ ...existing, ...workerForm, id: editingWorkerId, updatedAt: now() })
        : await businessDataAdapter.createWorker(workerForm);
      setWorkers((items) => editingWorkerId ? items.map((item) => item.id === saved.id ? saved : item) : [saved, ...items]);
      setWorkerFeedback(businessDataAdapter.mode === 'api' ? '报价已保存到平台。' : '本机草稿已保存，尚未同步到平台。');
      setWorkerForm(emptyWorker);
      setEditingWorkerId('');
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : '人工报价保存失败。');
    }
  };

  const submitCertification = async (event: FormEvent) => {
    event.preventDefault();
    if (!certDraft.companyName.trim() || !certDraft.contactName.trim() || !certDraft.contactInfo.trim()) {
      setCertError('请填写企业名称、联系人和联系方式。');
      return;
    }
    setCertError('');
    setCertFeedback('');
    setCertSaving(true);
    try {
      const saved = await businessDataAdapter.submitCertification({
        companyName: certDraft.companyName.trim(),
        contactName: certDraft.contactName.trim(),
        contactInfo: certDraft.contactInfo.trim(),
        serviceAreas: certDraft.serviceAreas,
        documentRefs: certDraft.documentRefs,
        ...(certDraft.version === undefined ? {} : { version: certDraft.version }),
      });
      setCertification(saved);
      setCertDraft(saved);
      setCertFeedback(businessDataAdapter.mode === 'api' ? '认证资料已提交，等待平台审核。' : '认证资料已保存为本机草稿，尚未提交到平台。');
      setProfile((current) => ({ ...current, name: saved.companyName }));
      setProfileDraft((current) => ({ ...current, name: saved.companyName }));
    } catch (error) {
      const message = error instanceof Error ? error.message : '认证资料提交失败。';
      setCertError(message.includes('VERSION_CONFLICT') || message.includes('changed by another request') || message.includes('版本')
        ? '认证资料已在其他地方更新，请刷新页面后再提交。'
        : message);
    } finally {
      setCertSaving(false);
    }
  };

  const certLabel = certification.status === 'PENDING' ? '待审核' : certification.status === 'APPROVED' ? '已认证' : certification.status === 'REJECTED' ? '已驳回' : '未提交';
  const statusLabel = (status: RecordStatus) => status === 'published' ? '已发布' : '草稿';
  const visibleInquiries = inquiries.filter((item) => inquiryFilter === 'ALL' || item.status === inquiryFilter);
  const expiredMaterials = materials.filter((item) => quoteExpiry(item.validUntil).kind === 'expired');
  const expiringMaterials = materials.filter((item) => quoteExpiry(item.validUntil).kind === 'soon');
  const expiredWorkers = workers.filter((item) => quoteExpiry(item.validUntil).kind === 'expired');
  const expiringWorkers = workers.filter((item) => quoteExpiry(item.validUntil).kind === 'soon');
  const completeItems = completeness ? [completeness.certificationMaterialCount > 0,
    completeness.caseCount > 0 && completeness.casesWithImages === completeness.caseCount,
    completeness.hasPublicContact] : [];
  const completeCount = completeItems.filter(Boolean).length;

  return (
    <div className="business-page">
      <header className="business-hero">
        <div className="business-hero-copy">
          <div>
            <span className="business-eyebrow">企业工作区 · {businessDataAdapter.mode === 'api' ? '平台数据' : '本地草稿'}</span>
            <h1>{profile.name || '企业业务工作区'}</h1>
            <p>{profile.name ? (businessDataAdapter.mode === 'api' ? '资料已通过企业业务接口同步，可继续在此维护。' : '资料会保存在当前浏览器，待后端接口接入后再同步到平台。') : '先把业务资料和规则录入清楚，暂不依赖真实业务数据。'}</p>
            <div className="business-meta">
              <span>{profile.city || '服务地区待填写'}</span>
              <span>{profile.services || '服务范围待填写'}</span>
              <span className={`cert-badge ${certification.status.toLowerCase()}`}>{certLabel}</span>
            </div>
          </div>
        </div>
        <div className="business-progress">
          <span>资料准备度</span>
          <strong>{completion}<i>/5</i></strong>
          <div className="progress-track"><i style={{ width: `${completion * 20}%` }} /></div>
        </div>
      </header>

      <main className="business-content">
        {loading ? <div className="business-empty" role="status"><strong>正在加载企业资料</strong><p>正在读取企业资料、案例和报价。</p></div> : <>
        {operationError && <div className="workflow-note" role="alert"><div className="note-mark">!</div><div><strong>同步失败</strong><p>{operationError}</p></div></div>}
        {activeTab === 'overview' && <motion.div className="business-panel-stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <section className="business-section-heading"><div><span className="business-eyebrow">START WITH THE RECORD</span><h2>先建立一份可核对的企业资料</h2><p>{businessDataAdapter.mode === 'api' ? '当前内容来自企业业务接口，保存后会按权限写回平台。' : '当前没有真实业务数据，所有内容都由你手动录入，后续可直接替换为接口返回。'}</p></div><span className="local-badge">{businessDataAdapter.mode === 'api' ? '接口模式' : '本地模式'}</span></section>
           {(expiredMaterials.length > 0 || expiringMaterials.length > 0 || expiredWorkers.length > 0 || expiringWorkers.length > 0) && <section className={`quote-expiry-summary ${(expiredMaterials.length + expiredWorkers.length) ? 'has-expired' : 'has-soon'}`} role="status"><div><strong>{(expiredMaterials.length + expiredWorkers.length) ? `${expiredMaterials.length + expiredWorkers.length} 条报价已过期下架` : `${expiringMaterials.length + expiringWorkers.length} 条报价即将到期`}</strong><p>{(expiredMaterials.length + expiredWorkers.length) && (expiringMaterials.length + expiringWorkers.length) ? `另有 ${expiringMaterials.length + expiringWorkers.length} 条报价将在 30 天内到期，请及时更新有效期和价格。` : (expiredMaterials.length + expiredWorkers.length) ? '这些报价已不在用户端展示，请编辑报价并更新有效期后重新发布。' : '这些报价将在 30 天内到期，请检查价格并提前续期。'}</p></div><button type="button" className="text-action" onClick={() => goTo(expiredMaterials.length + expiringMaterials.length > 0 ? 'materials' : 'workers')}>查看报价 <Icon name="arrow" /></button></section>}
          {completeness && <section className="completeness-section" aria-labelledby="completeness-title">
            <div className="completeness-heading"><div><span className="business-eyebrow">PROFILE CHECK</span><h2 id="completeness-title">企业资料完整度</h2><p>补全这些资料，让客户更容易了解并联系企业。</p></div><strong>{completeCount}<i>/3</i></strong></div>
            <div className="completeness-list">
              <CompletenessItem done={completeness.certificationMaterialCount > 0} title="认证材料" detail={completeness.certificationMaterialCount > 0 ? `已保存 ${completeness.certificationMaterialCount} 份认证材料` : '尚未添加认证材料'} action={() => goTo('certification')} actionLabel="管理认证材料" />
              <CompletenessItem done={completeness.caseCount > 0 && completeness.casesWithImages === completeness.caseCount} title="案例图片" detail={completeness.caseCount === 0 ? '尚未添加案例，建议上传项目图片' : `${completeness.casesWithImages}/${completeness.caseCount} 个案例含图片`} action={() => { setShowCaseForm(true); setEditingCaseId(''); setCaseForm(emptyCase); goTo('cases'); }} actionLabel="管理案例" />
              <CompletenessItem done={completeness.hasPublicContact} title="业务联系方式" detail={completeness.hasPublicContact ? '已填写对外联系人和联系方式' : '请填写对外联系人及业务联系方式'} action={() => { setShowProfileForm(true); goTo('overview'); }} actionLabel="补充联系方式" />
            </div>
          </section>}
          <div className="overview-grid">
            <section className="overview-card profile-card">
              <div className="card-heading"><div><span className="card-kicker">01</span><h3>企业基础资料</h3></div><button className="text-action" onClick={() => setShowProfileForm((value) => !value)}>{showProfileForm ? '收起' : '编辑'} <Icon name="arrow" /></button></div>
              {showProfileForm ? <form className="business-form" onSubmit={saveProfile}>
                <Field label="企业名称"><input value={profileDraft.name} onChange={(event) => setProfileDraft({ ...profileDraft, name: event.target.value })} placeholder="例如：某某装饰设计有限公司" /></Field>
                <Field label="服务地区"><input value={profileDraft.city} onChange={(event) => setProfileDraft({ ...profileDraft, city: event.target.value })} placeholder="例如：上海、苏州" /></Field>
                <Field label="服务区域" hint="可填写多个区域，用顿号或逗号分隔"><input maxLength={500} value={profileDraft.serviceAreas || ''} onChange={(event) => setProfileDraft({ ...profileDraft, serviceAreas: event.target.value })} placeholder="例如：浦东新区、静安区、苏州工业园区" /></Field>
                <Field label="服务范围"><input value={profileDraft.services} onChange={(event) => setProfileDraft({ ...profileDraft, services: event.target.value })} placeholder="例如：全案设计、施工监理" /></Field>
                <Field label="营业时间"><input maxLength={240} value={profileDraft.businessHours || ''} onChange={(event) => setProfileDraft({ ...profileDraft, businessHours: event.target.value })} placeholder="例如：周一至周日 09:00-18:00" /></Field>
                <Field label="企业简介"><textarea value={profileDraft.intro} onChange={(event) => setProfileDraft({ ...profileDraft, intro: event.target.value })} placeholder="描述企业擅长方向和服务特点" rows={3} /></Field>
                <Field label="对外联系人"><input maxLength={120} value={profileDraft.publicContactName || ''} onChange={(event) => setProfileDraft({ ...profileDraft, publicContactName: event.target.value })} placeholder="填写希望客户联系的人员" /></Field>
                <Field label="业务联系方式" hint="保存后会公开显示在用户端材料详情；认证审核联系方式不会自动公开。"><input maxLength={160} value={profileDraft.publicContactInfo || ''} onChange={(event) => setProfileDraft({ ...profileDraft, publicContactInfo: event.target.value })} placeholder="手机号、邮箱或微信号" /></Field>
                <div className="profile-image-fields"><div className="profile-image-field"><span>企业 Logo</span>{profile.logoAssetId && profileImageUrls[profile.logoAssetId] ? <img src={profileImageUrls[profile.logoAssetId]} alt="企业 Logo 预览" /> : <div className="profile-image-placeholder">暂无 Logo</div>}<input type="file" accept="image/*" disabled={profileImageBusy === 'logo' || businessDataAdapter.mode !== 'api'} onChange={(event) => { void updateProfileImage('logo', event.target.files?.[0]); event.target.value = ''; }} /><button type="button" className="text-action" disabled={!profile.logoAssetId || profileImageBusy === 'logo'} onClick={() => void removeProfileImage('logo')}>移除</button></div><div className="profile-image-field"><span>门店图片</span>{profile.storefrontAssetId && profileImageUrls[profile.storefrontAssetId] ? <img src={profileImageUrls[profile.storefrontAssetId]} alt="门店图片预览" /> : <div className="profile-image-placeholder">暂无门店图</div>}<input type="file" accept="image/*" disabled={profileImageBusy === 'storefront' || businessDataAdapter.mode !== 'api'} onChange={(event) => { void updateProfileImage('storefront', event.target.files?.[0]); event.target.value = ''; }} /><button type="button" className="text-action" disabled={!profile.storefrontAssetId || profileImageBusy === 'storefront'} onClick={() => void removeProfileImage('storefront')}>移除</button></div></div>
                <div className="profile-form-actions"><button className="primary-button" type="submit"><Icon name="check" />{businessDataAdapter.mode === 'api' ? '保存企业资料' : '保存本机草稿'}</button>{profileFeedback && <span className="form-success" role="status">{profileFeedback}</span>}</div>
              </form> : <div className="profile-summary"><strong>{profile.name || '还没有企业名称'}</strong><p>{profile.intro || '完善企业简介后，这里会显示企业服务定位。'}</p><div className="summary-lines"><span>服务地区 <b>{profile.city || '未填写'}</b></span><span>服务区域 <b>{profile.serviceAreas || '未填写'}</b></span><span>服务范围 <b>{profile.services || '未填写'}</b></span><span>营业时间 <b>{profile.businessHours || '未填写'}</b></span><span>对外联系人 <b>{profile.publicContactName || '未填写'}</b></span><span>业务联系方式 <b>{profile.publicContactInfo || '未填写'}</b></span></div></div>}
            </section>
            <section className="overview-card checklist-card">
              <div className="card-heading"><div><span className="card-kicker">02</span><h3>业务资料清单</h3></div><span className="completion-count">{completion}/5</span></div>
              <div className="checklist">
                <ChecklistItem done={Boolean(profile.name)} label={`企业基础资料 · ${profile.name ? '已填写' : '待填写'}`} onClick={() => { setShowProfileForm(true); setProfileFeedback(''); goTo('overview'); }} />
                <ChecklistItem done={cases.length > 0} label={`案例资料 · ${cases.length} 条`} onClick={() => { setShowCaseForm(true); setEditingCaseId(''); setCaseForm(emptyCase); goTo('cases'); }} />
                <ChecklistItem done={materials.length > 0} label={`材料报价 · ${materials.length} 条`} onClick={() => { setShowMaterialForm(true); setEditingMaterialId(''); setMaterialForm(emptyMaterial); setMaterialFeedback(''); goTo('materials'); }} />
                <ChecklistItem done={workers.length > 0} label={`人工报价 · ${workers.length} 条`} onClick={() => { setShowWorkerForm(true); setEditingWorkerId(''); setWorkerForm(emptyWorker); setWorkerFeedback(''); goTo('workers'); }} />
                <ChecklistItem done={certification.status === 'APPROVED'} label={`认证资料 · ${certification.status === 'APPROVED' ? '已认证' : certification.status === 'PENDING' ? '待审核' : certification.status === 'REJECTED' ? '需重新提交' : '待准备'}`} onClick={() => goTo('certification')} />
              </div>
            </section>
          </div>
          <section className="workflow-note"><div className="note-mark">!</div><div><strong>当前阶段的边界</strong><p>这里不展示虚构企业、价格、评分或认证结果。录入内容只用于页面联调和流程验证，真实数据接口接入后再替换。</p></div></section>
        </motion.div>}

        {activeTab === 'cases' && <motion.div className="business-panel-stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <SectionHeading eyebrow="CASE LIBRARY" title="案例资料" detail="维护案例信息，并关联已上传的施工图、案例图片和说明文件。" action={<button className="primary-button" onClick={() => { setShowCaseForm((value) => !value); setEditingCaseId(''); setCaseForm(emptyCase); }}><Icon name="plus" />{showCaseForm ? '收起表单' : '新增案例'}</button>} />
          {showCaseForm && <form className="entry-form" onSubmit={addCase}><div className="form-grid form-grid-4"><Field label="案例名称"><input required value={caseForm.title} onChange={(event) => setCaseForm({ ...caseForm, title: event.target.value })} placeholder="例如：三居室全案设计" /></Field><Field label="面积"><input value={caseForm.area} onChange={(event) => setCaseForm({ ...caseForm, area: event.target.value })} placeholder="例如：120㎡" /></Field><Field label="风格"><input value={caseForm.style} onChange={(event) => setCaseForm({ ...caseForm, style: event.target.value })} placeholder="例如：现代简约" /></Field><Field label="预算"><input value={caseForm.budget} onChange={(event) => setCaseForm({ ...caseForm, budget: event.target.value })} placeholder="例如：18万元" /></Field></div><div className="form-footer"><Field label="案例资料"><input type="file" multiple accept="image/*,.pdf" disabled={uploadingFiles} onChange={(event) => { void uploadSelectedFiles(Array.from(event.target.files || [])); event.target.value = ''; }} /><small>{uploadingFiles ? '正在上传文件…' : caseForm.files.length ? `已关联 ${caseForm.files.length} 个文件；保存案例后可下载或移除关联。` : '支持图片和 PDF，单个文件不超过 15 MB。'}</small></Field><label className="switch-field"><input type="checkbox" checked={caseForm.status === 'published'} onChange={(event) => setCaseForm({ ...caseForm, status: event.target.checked ? 'published' : 'draft' })} /><span>保存并发布到用户端</span></label><button className="primary-button" type="submit" disabled={uploadingFiles}><Icon name="check" />{editingCaseId ? '保存修改' : '保存案例'}</button></div>{caseForm.files.length > 0 && <div className="selected-files">{caseForm.files.map((fileId, index) => <span key={fileId}><Icon name="file" />资料 {index + 1}<button type="button" className="text-action" onClick={() => setCaseForm((current) => ({ ...current, files: current.files.filter((id) => id !== fileId) }))}>移除</button></span>)}</div>}</form>}
          {cases.length === 0 ? <EmptyState title="还没有案例资料" detail="新增一条案例，验证企业案例的录入、状态和资料管理流程。" action={() => setShowCaseForm(true)} /> : <div className="record-list">{cases.map((item) => <RecordRow key={item.id} title={item.title} meta={`${item.area || '面积未填'} · ${item.style || '风格未填'} · ${item.budget || '预算未填'}`} status={statusLabel(item.status)} detail={item.files.length ? `${item.files.length} 个资料文件` : '未附资料文件'} updatedAt={dateLabel(item.updatedAt)} attachments={item.files.map((fileId, index) => <button className="text-action" key={fileId} onClick={() => void downloadAsset(fileId)}>下载资料 {index + 1}</button>)} actions={item.status === 'draft' ? <button className="text-action" type="button" title={certification.status !== 'APPROVED' ? '企业认证通过后才能发布案例' : '发布到用户端认证企业案例'} disabled={certification.status !== 'APPROVED' || publishingCaseId === item.id} onClick={() => void publishCase(item)}>{publishingCaseId === item.id ? '发布中…' : '发布'}</button> : null} onEdit={() => { setCaseForm({ title: item.title, area: item.area, style: item.style, budget: item.budget, status: item.status, files: item.files }); setEditingCaseId(item.id); setShowCaseForm(true); }} onDelete={() => { setOperationError(''); void businessDataAdapter.deleteCase(item).then(() => setCases((items) => items.filter((entry) => entry.id !== item.id))).catch((error: unknown) => setOperationError(error instanceof Error ? error.message : '案例删除失败。')); }} />)}</div>}
        </motion.div>}

        {activeTab === 'materials' && <motion.div className="business-panel-stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <SectionHeading eyebrow="MATERIAL PRICING" title="材料报价" detail="每条报价都要带地区和有效期，方便后续给 AI-03 提供可追溯数据。" action={<button className="primary-button" onClick={() => { setShowMaterialForm((value) => !value); setEditingMaterialId(''); setMaterialForm(emptyMaterial); setMaterialFeedback(''); }}><Icon name="plus" />{showMaterialForm ? '收起表单' : '新增报价'}</button>} />
          {showMaterialForm && <form className="entry-form" onSubmit={addMaterial}><div className="form-grid form-grid-4"><Field label="材料名称"><input required value={materialForm.name} onChange={(event) => { setMaterialFeedback(''); setMaterialForm({ ...materialForm, name: event.target.value }); }} placeholder="例如：木地板" /></Field><Field label="品牌"><input value={materialForm.brand || ''} onChange={(event) => setMaterialForm({ ...materialForm, brand: event.target.value })} placeholder="例如：圣象" /></Field><Field label="规格"><input required={businessDataAdapter.mode === 'api'} value={materialForm.spec} onChange={(event) => setMaterialForm({ ...materialForm, spec: event.target.value })} placeholder="例如：910×127×15mm" /></Field><Field label="单位" hint={isUnitRecognized(materialForm.unit) ? '从下拉选择；规格尺寸填在「规格」字段' : unitUnknownHint}><UnitSelect value={materialForm.unit} onChange={(unit) => setMaterialForm({ ...materialForm, unit })} /></Field><Field label="项目性质" hint="赠送项与业主自购都不计入合同造价"><select value={materialForm.itemNature || 'INCLUDED'} onChange={(event) => setMaterialForm({ ...materialForm, itemNature: event.target.value as MaterialRecord['itemNature'] })}>{itemNatureOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field><Field label="价格（元）"><input required type="number" min="0.01" step="0.01" value={materialForm.price} onChange={(event) => { setMaterialFeedback(''); setMaterialForm({ ...materialForm, price: event.target.value }); }} placeholder="例如：299" /></Field><Field label="分类"><input required={businessDataAdapter.mode === 'api'} value={materialForm.category} onChange={(event) => setMaterialForm({ ...materialForm, category: event.target.value })} placeholder="例如：地板" /></Field><Field label="适用地区"><input required value={materialForm.region} onChange={(event) => { setMaterialFeedback(''); setMaterialForm({ ...materialForm, region: event.target.value }); }} placeholder="例如：上海" /></Field><Field label="有效期至" hint="必填，可选今天至未来 10 年"><input required type="date" min={minValidDate} max={maxValidDate} value={materialForm.validUntil} onChange={(event) => { setMaterialFeedback(''); setMaterialForm({ ...materialForm, validUntil: event.target.value }); }} /></Field><MaterialImagePicker imageIds={materialForm.imageIds} onChange={(imageIds) => setMaterialForm((current) => ({ ...current, imageIds }))} /></div><div className="form-actions"><button className="primary-button" type="submit"><Icon name="check" />{editingMaterialId ? '保存修改' : '保存报价'}</button>{materialFeedback && <span className={materialFeedback.includes('已保存') ? 'form-success' : 'form-error'}>{materialFeedback}</span>}</div></form>}
          {materials.length === 0 ? <EmptyState title="还没有材料报价" detail="先录入一条材料价格，验证地区、单位和有效期字段。" action={() => setShowMaterialForm(true)} /> : <div className="record-list">{materials.map((item) => { const expiry = quoteExpiry(item.validUntil); const notice = expiry.kind === 'expired' ? { text: '已过期 · 用户端已下架', tone: 'expired' as const } : !item.unitUnknown && expiry.kind === 'soon' ? { text: expiry.days === 0 ? '今天到期' : `${expiry.days} 天后到期`, tone: 'soon' as const } : undefined; return <RecordRow key={item.id} title={item.name} meta={`${item.brand ? `${item.brand} · ` : ''}${item.spec || '规格未填'} · ${item.unit || '单位未填'}${item.unitUnknown ? ` ⚠ ${unitUnknownBadge}` : ''} · ${item.category || '未分类'}${item.itemNature === 'GIFT' ? ' · 赠送项' : item.itemNature === 'OWNER_SUPPLIED' ? ' · 业主自购' : ''}`} status={`¥${item.price}`} detail={`${item.region || '地区未填'} · 有效期至 ${dateLabel(item.validUntil)}`} notice={item.unitUnknown ? { text: unitUnknownBadge, tone: 'soon' as const } : notice} updatedAt={dateLabel(item.updatedAt)} onEdit={() => { setMaterialForm({ name: item.name, brand: item.brand || '', spec: item.spec, unit: item.unit, price: item.price, category: item.category, region: item.region, validUntil: item.validUntil, itemNature: item.itemNature || 'INCLUDED', imageIds: item.imageIds || (item.imageId ? [item.imageId] : []) }); setEditingMaterialId(item.id); setShowMaterialForm(true); }} onDelete={() => { setOperationError(''); void businessDataAdapter.deleteMaterial(item).then(() => setMaterials((items) => items.filter((entry) => entry.id !== item.id))).catch((error: unknown) => setOperationError(error instanceof Error ? error.message : '材料报价删除失败。')); }} />; })}</div>}
        </motion.div>}

        {activeTab === 'workers' && <motion.div className="business-panel-stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <SectionHeading eyebrow="LABOR PRICING" title="人工报价" detail="工种、单位、地区和有效期都由你手动录入，暂不连接真实报价源。" action={<button className="primary-button" onClick={() => { setShowWorkerForm((value) => !value); setEditingWorkerId(''); setWorkerForm(emptyWorker); setWorkerFeedback(''); }}><Icon name="plus" />{showWorkerForm ? '收起表单' : '新增工种'}</button>} />
          {showWorkerForm && <form className="entry-form" onSubmit={addWorker}><div className="form-grid form-grid-4"><Field label="工种"><input required value={workerForm.type} onChange={(event) => { setWorkerFeedback(''); setWorkerForm({ ...workerForm, type: event.target.value }); }} placeholder="例如：水电工" /></Field><Field label="计价单位" hint="从下拉选择；规格尺寸不要填这里"><UnitSelect value={workerForm.unit} onChange={(unit) => setWorkerForm({ ...workerForm, unit })} /></Field><Field label="单价（元）"><input required type="number" min="0.01" step="0.01" value={workerForm.price} onChange={(event) => { setWorkerFeedback(''); setWorkerForm({ ...workerForm, price: event.target.value }); }} placeholder="例如：450" /></Field><Field label="服务地区"><input required value={workerForm.region} onChange={(event) => { setWorkerFeedback(''); setWorkerForm({ ...workerForm, region: event.target.value }); }} placeholder="例如：上海" /></Field><Field label="有效期至" hint="必填，可选今天至未来 10 年"><input required type="date" min={minValidDate} max={maxValidDate} value={workerForm.validUntil} onChange={(event) => { setWorkerFeedback(''); setWorkerForm({ ...workerForm, validUntil: event.target.value }); }} /></Field></div><div className="form-actions"><button className="primary-button" type="submit"><Icon name="check" />{editingWorkerId ? '保存修改' : '保存报价'}</button>{workerFeedback && <span className={workerFeedback.includes('已保存') ? 'form-success' : 'form-error'}>{workerFeedback}</span>}</div></form>}
          {workers.length === 0 ? <EmptyState title="还没有人工报价" detail="先录入一个工种，验证地区和有效期缺失时的展示方式。" action={() => setShowWorkerForm(true)} /> : <div className="record-list">{workers.map((item) => <RecordRow key={item.id} title={item.type} meta={`${item.unit || '单位未填'}${item.unitUnknown ? ` ⚠ ${unitUnknownBadge}` : ''} · ¥${item.price}`} status={item.region || '地区未填'} detail={`有效期 ${dateLabel(item.validUntil)}`} notice={item.unitUnknown ? { text: unitUnknownBadge, tone: 'soon' as const } : undefined} updatedAt={dateLabel(item.updatedAt)} onEdit={() => { setWorkerForm({ type: item.type, unit: item.unit, price: item.price, region: item.region, validUntil: item.validUntil, itemNature: item.itemNature || 'INCLUDED' }); setEditingWorkerId(item.id); setShowWorkerForm(true); }} onDelete={() => { setOperationError(''); void businessDataAdapter.deleteWorker(item).then(() => setWorkers((items) => items.filter((entry) => entry.id !== item.id))).catch((error: unknown) => setOperationError(error instanceof Error ? error.message : '人工报价删除失败。')); }} />)}</div>}
        </motion.div>}

        {activeTab === 'inquiries' && <motion.div className="business-panel-stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <SectionHeading eyebrow="CUSTOMER INQUIRIES" title="客户咨询" detail="查看用户对材料报价的咨询，并记录联系和报价进度。" />
          <section className="inquiries-panel">
            <div className="inquiries-toolbar">
              <div><strong>{visibleInquiries.length}</strong><span>条咨询</span></div>
              <label className="inquiry-filter"><span>状态</span><select value={inquiryFilter} onChange={(event) => setInquiryFilter(event.target.value as 'ALL' | InquiryStatus)}>
                <option value="ALL">全部状态</option>
                {Object.entries(inquiryStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></label>
            </div>
            {visibleInquiries.length === 0 ? <EmptyState title={inquiries.length ? '没有符合条件的咨询' : '还没有客户咨询'} detail={inquiries.length ? '试试其他状态筛选。' : '用户从材料详情提交咨询后，会显示在这里。'} /> : <div className="inquiry-list">{visibleInquiries.map((inquiry) => <article className="inquiry-row" key={inquiry.id}>
              <div className="inquiry-main">
                <div className="inquiry-heading"><h3>{inquiry.materialName}</h3><time dateTime={inquiry.createdAt}>{new Date(inquiry.createdAt).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })}</time></div>
                <div className="inquiry-contact"><strong>{inquiry.contactName}</strong><a href={`${inquiry.contactInfo.includes('@') ? 'mailto:' : 'tel:'}${inquiry.contactInfo}`}>{inquiry.contactInfo}</a></div>
                <p>{inquiry.message}</p>
              </div>
              <label className="inquiry-status"><span>跟进状态</span><select aria-label={`更新${inquiry.contactName}的咨询状态`} value={inquiry.status} disabled={updatingInquiryId === inquiry.id} onChange={(event) => void setInquiryStatus(inquiry, event.target.value as InquiryStatus)}>
                {Object.entries(inquiryStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></label>
            </article>)}</div>}
          </section>
        </motion.div>}

        {activeTab === 'certification' && <motion.div className="business-panel-stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <SectionHeading eyebrow="CERTIFICATION" title="企业认证" detail="提交企业资料后进入平台审核，审核结果和意见会实时显示在这里。" />
          <form className="cert-form" onSubmit={submitCertification}>
            <div className="cert-form-main">
              <Field label="企业名称"><input required value={certDraft.companyName} onChange={(event) => { setCertError(''); setCertDraft({ ...certDraft, companyName: event.target.value }); }} placeholder="请输入企业全称" /></Field>
              <div className="form-grid form-grid-2">
                <Field label="联系人"><input required value={certDraft.contactName} onChange={(event) => { setCertError(''); setCertDraft({ ...certDraft, contactName: event.target.value }); }} placeholder="例如：王先生" /></Field>
                <Field label="联系方式"><input required value={certDraft.contactInfo} onChange={(event) => { setCertError(''); setCertDraft({ ...certDraft, contactInfo: event.target.value }); }} placeholder="手机号或邮箱" /></Field>
              </div>
              <Field label="服务地区" hint="多个地区用逗号或顿号分隔"><input value={certDraft.serviceAreas.join('、')} onChange={(event) => setCertDraft({ ...certDraft, serviceAreas: event.target.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean) })} placeholder="例如：上海、苏州" /></Field>
              <Field label="资质材料" hint="支持图片和 PDF，单个文件不超过 15 MB"><input type="file" multiple accept="image/*,.pdf" disabled={uploadingFiles} onChange={(event) => { void uploadCertificationFiles(Array.from(event.target.files || [])); event.target.value = ''; }} /></Field>
              <div className="selected-files">{certDraft.documentRefs.length ? certDraft.documentRefs.map((file) => {
                const submitted = certification.documentRefs.includes(file);
                return <div className="selected-file" key={file}>{certImagePreviews[file] && <button className="selected-file-thumbnail" type="button" title="查看图片大图" onClick={() => void previewCertificationFile(file)}><img src={certImagePreviews[file]} alt={`${certDocumentNames[file] || '认证材料'}缩略图`} /></button>}<span><Icon name="file" />{certDocumentNames[file] || file}<small>{submitted ? '已提交' : '待提交'}</small></span><div className="selected-file-actions"><button className="selected-file-preview" type="button" title="预览附件" aria-label={`预览附件 ${certDocumentNames[file] || file}`} onClick={() => void previewCertificationFile(file)} disabled={Boolean(previewingDocumentId)}><Icon name="file" />{previewingDocumentId === file ? '读取中…' : '预览'}</button>{!submitted && <button className="selected-file-remove" type="button" title="移除错误附件" aria-label={`移除错误附件 ${certDocumentNames[file] || file}`} onClick={() => void removeCertificationFile(file)} disabled={uploadingFiles || certSaving || Boolean(removingDocumentId) || Boolean(previewingDocumentId)}><Icon name="trash" />{removingDocumentId === file ? '移除中…' : '移除'}</button>}</div></div>;
              }) : <span className="muted-copy">尚未填写材料引用</span>}</div>
              <p className="muted-copy">尚未提交的附件可以移除；已提交的认证材料会保留在平台记录中。</p>
              <div className="cert-form-footer"><button className="primary-button" type="submit" disabled={certSaving || Boolean(removingDocumentId)}><Icon name="upload" />{certSaving ? '正在提交…' : certification.status === 'REJECTED' ? '修改并重新提交' : certification.status === 'APPROVED' ? '提交新版本' : '提交认证资料'}</button>{certFeedback && <span className="form-success" role="status">{certFeedback}</span>}{certError && <span className="form-error" role="alert">{certError}</span>}</div>
            </div>
            <aside className="cert-status-panel">
              <span className="card-kicker">CURRENT STATE</span>
              <div className={`cert-state ${certification.status.toLowerCase()}`}><span className="state-dot" />{certLabel}</div>
              <p>{certification.status === 'PENDING' ? '资料已提交，平台管理员审核后会更新结果。' : certification.status === 'APPROVED' ? '企业认证已通过，可以继续使用企业业务功能。' : certification.status === 'REJECTED' ? `本次审核未通过。${certification.reviewNote ? `审核意见：${certification.reviewNote}` : '请根据审核意见修改后重新提交。'}` : '填写资料后提交，系统会创建一条待审核申请。'}</p>
              <div className="cert-steps"><span className={certification.status !== 'draft' ? 'done' : ''}><b>1</b>填写资料</span><span className={certification.status === 'PENDING' || certification.status === 'APPROVED' || certification.status === 'REJECTED' ? 'done' : ''}><b>2</b>提交审核</span><span className={certification.status === 'APPROVED' ? 'done' : ''}><b>3</b>平台审核</span></div>
            </aside>
          </form>
        </motion.div>}
        </>}
      </main>
      {certPreview && <div className="cert-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCertificationPreview(); }}><section className="cert-preview-dialog" role="dialog" aria-modal="true" aria-label={certPreview.name}><header><strong>{certPreview.name}</strong><button type="button" aria-label="关闭预览" onClick={closeCertificationPreview}>关闭</button></header><div className="cert-preview-content">{certPreview.type.startsWith('image/') ? <img src={certPreview.url} alt={certPreview.name} /> : certPreview.type === 'application/pdf' ? <iframe src={certPreview.url} title={certPreview.name} /> : <p>该附件格式暂不支持预览。</p>}</div></section></div>}
    </div>
  );
}

function SectionHeading({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: ReactNode }) {
  return <div className="business-section-heading"><div><span className="business-eyebrow">{eyebrow}</span><h2>{title}</h2><p>{detail}</p></div>{action}</div>;
}

function ChecklistItem({ done, label, onClick }: { done: boolean; label: string; onClick: () => void }) {
  return <button className={`checklist-item ${done ? 'done' : ''}`} onClick={onClick}><span className="check-circle">{done && <Icon name="check" />}</span><span>{label}</span><Icon name="arrow" /></button>;
}

function CompletenessItem({ done, title, detail, action, actionLabel }: { done: boolean; title: string; detail: string; action: () => void; actionLabel: string }) {
  return <div className={`completeness-item ${done ? 'done' : 'missing'}`}><span className="completeness-mark" aria-hidden="true">{done ? <Icon name="check" /> : '!'}</span><div className="completeness-copy"><strong>{title}</strong><span>{detail}</span></div><button type="button" className="text-action" onClick={action}>{actionLabel}<Icon name="arrow" /></button></div>;
}

function RecordRow({ title, meta, status, detail, notice, updatedAt, onEdit, onDelete, attachments, actions }: { title: string; meta: string; status: string; detail: string; notice?: { text: string; tone: 'soon' | 'expired' }; updatedAt: string; onEdit: () => void; onDelete: () => void; attachments?: ReactNode; actions?: ReactNode }) {
  return <article className="record-row"><div className="record-icon"><Icon name="file" /></div><div className="record-main"><strong>{title}</strong><span>{meta}</span>{attachments && <div className="record-attachments">{attachments}</div>}</div><div className="record-detail"><b>{status}</b><span>{detail}</span>{notice && <em className={`quote-expiry-label ${notice.tone}`}>{notice.text}</em>}</div><div className="record-date">更新于 {updatedAt}</div><div className="record-actions">{actions}<button className="text-action" onClick={onEdit}>编辑</button><button className="icon-button danger" onClick={onDelete} aria-label={`删除${title}`} title="删除"><Icon name="trash" /></button></div></article>;
}
