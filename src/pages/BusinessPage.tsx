import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import type { MaterialRecord } from '../services/dataContracts';
import { readLocalValue, writeLocalValue } from '../services/localDataAdapter';
import { businessDataAdapter, businessLocalKeys, type BusinessCaseRecord, type CompanyCertificationRecord, type CompanyProfileRecord, type LaborQuoteRecord } from '../services/businessData';
import './BusinessPage.css';

type TabKey = 'overview' | 'cases' | 'materials' | 'workers' | 'certification';
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
  { key: 'certification', label: '认证资料', description: '准备企业认证信息' },
];

const emptyCase: Omit<CaseRecord, 'id' | 'updatedAt'> = {
  title: '', area: '', style: '', budget: '', status: 'draft', files: [],
};
const emptyMaterial: Omit<MaterialRecord, 'id' | 'updatedAt'> = {
  name: '', spec: '', unit: '', price: '', category: '', region: '', validUntil: '',
};
const emptyWorker: Omit<WorkerRecord, 'id' | 'updatedAt'> = {
  type: '', unit: '', price: '', region: '', validUntil: '',
};
const defaultProfile: CompanyProfile = { name: '', city: '', services: '', intro: '' };
const defaultCertification: Certification = {
  companyName: '', contactName: '', contactInfo: '', serviceAreas: [], documentRefs: [], status: 'draft',
};
function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  const [profileDraft, setProfileDraft] = useState(() => profile);
  const [certDraft, setCertDraft] = useState(() => certification);
  const [showProfileForm, setShowProfileForm] = useState(!profile.name);
  const [showCaseForm, setShowCaseForm] = useState(false);
  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [showWorkerForm, setShowWorkerForm] = useState(false);
  const [editingCaseId, setEditingCaseId] = useState('');
  const [editingMaterialId, setEditingMaterialId] = useState('');
  const [editingWorkerId, setEditingWorkerId] = useState('');
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
  const [loading, setLoading] = useState(businessDataAdapter.mode === 'api');


  useEffect(() => {
    if (businessDataAdapter.mode !== 'api') return;
    let active = true;
    void Promise.all([
      businessDataAdapter.loadProfile(),
      businessDataAdapter.loadCases(),
      businessDataAdapter.loadMaterials(),
      businessDataAdapter.loadWorkers(),
      businessDataAdapter.loadCertification(),
    ]).then(([nextProfile, nextCases, nextMaterials, nextWorkers, nextCertification]) => {
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
      setShowProfileForm(!nextProfile.name);
      setLoading(false);
    }).catch((error: unknown) => {
      if (!active) return;
      setOperationError(error instanceof Error ? error.message : '业务资料加载失败。');
      setLoading(false);
    });
    return () => { active = false; };
  }, [setCases, setMaterials, setProfile, setWorkers, setCertification]);

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
    } catch (error) {
      setCertError(error instanceof Error ? error.message : '认证文件上传失败。');
    } finally {
      setUploadingFiles(false);
    }
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
  const statusLabel = (status: RecordStatus) => status === 'published' ? '待展示' : '草稿';

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
          <div className="overview-grid">
            <section className="overview-card profile-card">
              <div className="card-heading"><div><span className="card-kicker">01</span><h3>企业基础资料</h3></div><button className="text-action" onClick={() => setShowProfileForm((value) => !value)}>{showProfileForm ? '收起' : '编辑'} <Icon name="arrow" /></button></div>
              {showProfileForm ? <form className="business-form" onSubmit={saveProfile}>
                <Field label="企业名称"><input value={profileDraft.name} onChange={(event) => setProfileDraft({ ...profileDraft, name: event.target.value })} placeholder="例如：某某装饰设计有限公司" /></Field>
                <Field label="服务地区"><input value={profileDraft.city} onChange={(event) => setProfileDraft({ ...profileDraft, city: event.target.value })} placeholder="例如：上海、苏州" /></Field>
                <Field label="服务范围"><input value={profileDraft.services} onChange={(event) => setProfileDraft({ ...profileDraft, services: event.target.value })} placeholder="例如：全案设计、施工监理" /></Field>
                <Field label="企业简介"><textarea value={profileDraft.intro} onChange={(event) => setProfileDraft({ ...profileDraft, intro: event.target.value })} placeholder="描述企业擅长方向和服务特点" rows={3} /></Field>
                <div className="profile-form-actions"><button className="primary-button" type="submit"><Icon name="check" />{businessDataAdapter.mode === 'api' ? '保存企业资料' : '保存本机草稿'}</button>{profileFeedback && <span className="form-success" role="status">{profileFeedback}</span>}</div>
              </form> : <div className="profile-summary"><strong>{profile.name || '还没有企业名称'}</strong><p>{profile.intro || '完善企业简介后，这里会显示企业服务定位。'}</p><div className="summary-lines"><span>服务地区 <b>{profile.city || '未填写'}</b></span><span>服务范围 <b>{profile.services || '未填写'}</b></span></div></div>}
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
          {showCaseForm && <form className="entry-form" onSubmit={addCase}><div className="form-grid form-grid-4"><Field label="案例名称"><input required value={caseForm.title} onChange={(event) => setCaseForm({ ...caseForm, title: event.target.value })} placeholder="例如：三居室全案设计" /></Field><Field label="面积"><input value={caseForm.area} onChange={(event) => setCaseForm({ ...caseForm, area: event.target.value })} placeholder="例如：120㎡" /></Field><Field label="风格"><input value={caseForm.style} onChange={(event) => setCaseForm({ ...caseForm, style: event.target.value })} placeholder="例如：现代简约" /></Field><Field label="预算"><input value={caseForm.budget} onChange={(event) => setCaseForm({ ...caseForm, budget: event.target.value })} placeholder="例如：18万元" /></Field></div><div className="form-footer"><Field label="案例资料"><input type="file" multiple accept="image/*,.pdf" disabled={uploadingFiles} onChange={(event) => { void uploadSelectedFiles(Array.from(event.target.files || [])); event.target.value = ''; }} /><small>{uploadingFiles ? '正在上传文件…' : caseForm.files.length ? `已关联 ${caseForm.files.length} 个文件；保存案例后可下载或移除关联。` : '支持图片和 PDF，单个文件不超过 15 MB。'}</small></Field><label className="switch-field"><input type="checkbox" checked={caseForm.status === 'published'} onChange={(event) => setCaseForm({ ...caseForm, status: event.target.checked ? 'published' : 'draft' })} /><span>标记为待展示</span></label><button className="primary-button" type="submit" disabled={uploadingFiles}><Icon name="check" />{editingCaseId ? '保存修改' : '保存案例'}</button></div>{caseForm.files.length > 0 && <div className="selected-files">{caseForm.files.map((fileId, index) => <span key={fileId}><Icon name="file" />资料 {index + 1}<button type="button" className="text-action" onClick={() => setCaseForm((current) => ({ ...current, files: current.files.filter((id) => id !== fileId) }))}>移除</button></span>)}</div>}</form>}
          {cases.length === 0 ? <EmptyState title="还没有案例资料" detail="新增一条案例，验证企业案例的录入、状态和资料管理流程。" action={() => setShowCaseForm(true)} /> : <div className="record-list">{cases.map((item) => <RecordRow key={item.id} title={item.title} meta={`${item.area || '面积未填'} · ${item.style || '风格未填'} · ${item.budget || '预算未填'}`} status={statusLabel(item.status)} detail={item.files.length ? `${item.files.length} 个资料文件` : '未附资料文件'} updatedAt={dateLabel(item.updatedAt)} attachments={item.files.map((fileId, index) => <button className="text-action" key={fileId} onClick={() => void downloadAsset(fileId)}>下载资料 {index + 1}</button>)} onEdit={() => { setCaseForm({ title: item.title, area: item.area, style: item.style, budget: item.budget, status: item.status, files: item.files }); setEditingCaseId(item.id); setShowCaseForm(true); }} onDelete={() => { setOperationError(''); void businessDataAdapter.deleteCase(item).then(() => setCases((items) => items.filter((entry) => entry.id !== item.id))).catch((error: unknown) => setOperationError(error instanceof Error ? error.message : '案例删除失败。')); }} />)}</div>}
        </motion.div>}

        {activeTab === 'materials' && <motion.div className="business-panel-stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <SectionHeading eyebrow="MATERIAL PRICING" title="材料报价" detail="每条报价都要带地区和有效期，方便后续给 AI-03 提供可追溯数据。" action={<button className="primary-button" onClick={() => { setShowMaterialForm((value) => !value); setEditingMaterialId(''); setMaterialForm(emptyMaterial); setMaterialFeedback(''); }}><Icon name="plus" />{showMaterialForm ? '收起表单' : '新增报价'}</button>} />
          {showMaterialForm && <form className="entry-form" onSubmit={addMaterial}><div className="form-grid form-grid-4"><Field label="材料名称"><input required value={materialForm.name} onChange={(event) => { setMaterialFeedback(''); setMaterialForm({ ...materialForm, name: event.target.value }); }} placeholder="例如：木地板" /></Field><Field label="规格"><input required={businessDataAdapter.mode === 'api'} value={materialForm.spec} onChange={(event) => setMaterialForm({ ...materialForm, spec: event.target.value })} placeholder="例如：910×127×15mm" /></Field><Field label="单位"><input required={businessDataAdapter.mode === 'api'} value={materialForm.unit} onChange={(event) => setMaterialForm({ ...materialForm, unit: event.target.value })} placeholder="例如：㎡" /></Field><Field label="价格（元）"><input required type="number" min="0.01" step="0.01" value={materialForm.price} onChange={(event) => { setMaterialFeedback(''); setMaterialForm({ ...materialForm, price: event.target.value }); }} placeholder="例如：299" /></Field><Field label="分类"><input required={businessDataAdapter.mode === 'api'} value={materialForm.category} onChange={(event) => setMaterialForm({ ...materialForm, category: event.target.value })} placeholder="例如：地板" /></Field><Field label="适用地区"><input required value={materialForm.region} onChange={(event) => { setMaterialFeedback(''); setMaterialForm({ ...materialForm, region: event.target.value }); }} placeholder="例如：上海" /></Field><Field label="有效期至" hint="必填，可选今天至未来 10 年"><input required type="date" min={minValidDate} max={maxValidDate} value={materialForm.validUntil} onChange={(event) => { setMaterialFeedback(''); setMaterialForm({ ...materialForm, validUntil: event.target.value }); }} /></Field></div><div className="form-actions"><button className="primary-button" type="submit"><Icon name="check" />{editingMaterialId ? '保存修改' : '保存报价'}</button>{materialFeedback && <span className={materialFeedback.includes('已保存') ? 'form-success' : 'form-error'}>{materialFeedback}</span>}</div></form>}
          {materials.length === 0 ? <EmptyState title="还没有材料报价" detail="先录入一条材料价格，验证地区、单位和有效期字段。" action={() => setShowMaterialForm(true)} /> : <div className="record-list">{materials.map((item) => <RecordRow key={item.id} title={item.name} meta={`${item.spec || '规格未填'} · ${item.unit || '单位未填'} · ${item.category || '未分类'}`} status={`¥${item.price}`} detail={`${item.region || '地区未填'} · 有效期 ${dateLabel(item.validUntil)}`} updatedAt={dateLabel(item.updatedAt)} onEdit={() => { setMaterialForm({ name: item.name, spec: item.spec, unit: item.unit, price: item.price, category: item.category, region: item.region, validUntil: item.validUntil }); setEditingMaterialId(item.id); setShowMaterialForm(true); }} onDelete={() => { setOperationError(''); void businessDataAdapter.deleteMaterial(item).then(() => setMaterials((items) => items.filter((entry) => entry.id !== item.id))).catch((error: unknown) => setOperationError(error instanceof Error ? error.message : '材料报价删除失败。')); }} />)}</div>}
        </motion.div>}

        {activeTab === 'workers' && <motion.div className="business-panel-stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <SectionHeading eyebrow="LABOR PRICING" title="人工报价" detail="工种、单位、地区和有效期都由你手动录入，暂不连接真实报价源。" action={<button className="primary-button" onClick={() => { setShowWorkerForm((value) => !value); setEditingWorkerId(''); setWorkerForm(emptyWorker); setWorkerFeedback(''); }}><Icon name="plus" />{showWorkerForm ? '收起表单' : '新增工种'}</button>} />
          {showWorkerForm && <form className="entry-form" onSubmit={addWorker}><div className="form-grid form-grid-4"><Field label="工种"><input required value={workerForm.type} onChange={(event) => { setWorkerFeedback(''); setWorkerForm({ ...workerForm, type: event.target.value }); }} placeholder="例如：水电工" /></Field><Field label="计价单位"><input required={businessDataAdapter.mode === 'api'} value={workerForm.unit} onChange={(event) => setWorkerForm({ ...workerForm, unit: event.target.value })} placeholder="例如：工日/㎡" /></Field><Field label="单价（元）"><input required type="number" min="0.01" step="0.01" value={workerForm.price} onChange={(event) => { setWorkerFeedback(''); setWorkerForm({ ...workerForm, price: event.target.value }); }} placeholder="例如：450" /></Field><Field label="服务地区"><input required value={workerForm.region} onChange={(event) => { setWorkerFeedback(''); setWorkerForm({ ...workerForm, region: event.target.value }); }} placeholder="例如：上海" /></Field><Field label="有效期至" hint="必填，可选今天至未来 10 年"><input required type="date" min={minValidDate} max={maxValidDate} value={workerForm.validUntil} onChange={(event) => { setWorkerFeedback(''); setWorkerForm({ ...workerForm, validUntil: event.target.value }); }} /></Field></div><div className="form-actions"><button className="primary-button" type="submit"><Icon name="check" />{editingWorkerId ? '保存修改' : '保存报价'}</button>{workerFeedback && <span className={workerFeedback.includes('已保存') ? 'form-success' : 'form-error'}>{workerFeedback}</span>}</div></form>}
          {workers.length === 0 ? <EmptyState title="还没有人工报价" detail="先录入一个工种，验证地区和有效期缺失时的展示方式。" action={() => setShowWorkerForm(true)} /> : <div className="record-list">{workers.map((item) => <RecordRow key={item.id} title={item.type} meta={`${item.unit || '单位未填'} · ¥${item.price}`} status={item.region || '地区未填'} detail={`有效期 ${dateLabel(item.validUntil)}`} updatedAt={dateLabel(item.updatedAt)} onEdit={() => { setWorkerForm({ type: item.type, unit: item.unit, price: item.price, region: item.region, validUntil: item.validUntil }); setEditingWorkerId(item.id); setShowWorkerForm(true); }} onDelete={() => { setOperationError(''); void businessDataAdapter.deleteWorker(item).then(() => setWorkers((items) => items.filter((entry) => entry.id !== item.id))).catch((error: unknown) => setOperationError(error instanceof Error ? error.message : '人工报价删除失败。')); }} />)}</div>}
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
              <div className="selected-files">{certDraft.documentRefs.length ? certDraft.documentRefs.map((file) => <span key={file}><Icon name="file" />{file}</span>) : <span className="muted-copy">尚未填写材料引用</span>}</div>
              <div className="cert-form-footer"><button className="primary-button" type="submit" disabled={certSaving}><Icon name="upload" />{certSaving ? '正在提交…' : certification.status === 'REJECTED' ? '修改并重新提交' : certification.status === 'APPROVED' ? '提交新版本' : '提交认证资料'}</button>{certFeedback && <span className="form-success" role="status">{certFeedback}</span>}{certError && <span className="form-error" role="alert">{certError}</span>}</div>
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
    </div>
  );
}

function SectionHeading({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: ReactNode }) {
  return <div className="business-section-heading"><div><span className="business-eyebrow">{eyebrow}</span><h2>{title}</h2><p>{detail}</p></div>{action}</div>;
}

function ChecklistItem({ done, label, onClick }: { done: boolean; label: string; onClick: () => void }) {
  return <button className={`checklist-item ${done ? 'done' : ''}`} onClick={onClick}><span className="check-circle">{done && <Icon name="check" />}</span><span>{label}</span><Icon name="arrow" /></button>;
}

function RecordRow({ title, meta, status, detail, updatedAt, onEdit, onDelete, attachments }: { title: string; meta: string; status: string; detail: string; updatedAt: string; onEdit: () => void; onDelete: () => void; attachments?: ReactNode }) {
  return <article className="record-row"><div className="record-icon"><Icon name="file" /></div><div className="record-main"><strong>{title}</strong><span>{meta}</span>{attachments && <div className="record-attachments">{attachments}</div>}</div><div className="record-detail"><b>{status}</b><span>{detail}</span></div><div className="record-date">更新于 {updatedAt}</div><div className="record-actions"><button className="text-action" onClick={onEdit}>编辑</button><button className="icon-button danger" onClick={onDelete} aria-label={`删除${title}`} title="删除"><Icon name="trash" /></button></div></article>;
}
