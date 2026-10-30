import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { MaterialRecord } from '../services/dataContracts';
import { readLocalValue, writeLocalValue } from '../services/localDataAdapter';
import './BusinessPage.css';

type TabKey = 'overview' | 'cases' | 'materials' | 'workers' | 'certification';
type RecordStatus = 'draft' | 'published';
type CertStatus = 'draft' | 'pending';

type CaseRecord = {
  id: string;
  title: string;
  area: string;
  style: string;
  budget: string;
  status: RecordStatus;
  files: string[];
  updatedAt: string;
};

type WorkerRecord = {
  id: string;
  type: string;
  unit: string;
  price: string;
  region: string;
  validUntil: string;
  updatedAt: string;
};

type CompanyProfile = {
  name: string;
  city: string;
  services: string;
  intro: string;
};

type Certification = {
  companyName: string;
  contact: string;
  serviceAreas: string;
  documents: string[];
  status: CertStatus;
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
  companyName: '', contact: '', serviceAreas: '', documents: [], status: 'draft',
};

function readStored<T>(key: string, fallback: T): T {
  return readLocalValue(key, fallback);
}

function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => readStored(key, fallback));
  useEffect(() => {
    writeLocalValue(key, value);
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
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [profile, setProfile] = useStoredState('decoration-business-profile', defaultProfile);
  const [cases, setCases] = useStoredState<CaseRecord[]>('decoration-business-cases', []);
  const [materials, setMaterials] = useStoredState<MaterialRecord[]>('decoration-business-materials', []);
  const [workers, setWorkers] = useStoredState<WorkerRecord[]>('decoration-business-workers', []);
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

  const completion = useMemo(() => {
    return [Boolean(profile.name), cases.length > 0, materials.length > 0, workers.length > 0, certification.status === 'pending'].filter(Boolean).length;
  }, [cases.length, certification.status, materials.length, profile.name, workers.length]);

  const goTo = (tab: TabKey) => setActiveTab(tab);
  const saveProfile = (event: FormEvent) => {
    event.preventDefault();
    setProfile(profileDraft);
    setShowProfileForm(false);
  };

  const addCase = (event: FormEvent) => {
    event.preventDefault();
    if (!caseForm.title.trim()) return;
    setCases((items) => editingCaseId
      ? items.map((item) => item.id === editingCaseId ? { ...item, ...caseForm, updatedAt: now() } : item)
      : [{ ...caseForm, id: crypto.randomUUID(), updatedAt: now() }, ...items]);
    setCaseForm(emptyCase);
    setEditingCaseId('');
    setShowCaseForm(false);
  };

  const addMaterial = (event: FormEvent) => {
    event.preventDefault();
    if (!materialForm.name.trim() || !materialForm.price.trim()) return;
    setMaterials((items) => editingMaterialId
      ? items.map((item) => item.id === editingMaterialId ? { ...item, ...materialForm, updatedAt: now() } : item)
      : [{ ...materialForm, id: crypto.randomUUID(), updatedAt: now() }, ...items]);
    setMaterialForm(emptyMaterial);
    setEditingMaterialId('');
    setShowMaterialForm(false);
  };

  const addWorker = (event: FormEvent) => {
    event.preventDefault();
    if (!workerForm.type.trim() || !workerForm.price.trim()) return;
    setWorkers((items) => editingWorkerId
      ? items.map((item) => item.id === editingWorkerId ? { ...item, ...workerForm, updatedAt: now() } : item)
      : [{ ...workerForm, id: crypto.randomUUID(), updatedAt: now() }, ...items]);
    setWorkerForm(emptyWorker);
    setEditingWorkerId('');
    setShowWorkerForm(false);
  };

  const submitCertification = (event: FormEvent) => {
    event.preventDefault();
    if (!certDraft.companyName.trim() || !certDraft.contact.trim()) {
      setCertError('请先填写企业名称和联系人。');
      return;
    }
    setCertError('');
    setCertification({ ...certDraft, status: 'pending' });
    setProfile((current) => ({ ...current, name: certDraft.companyName }));
    setProfileDraft((current) => ({ ...current, name: certDraft.companyName }));
  };

  const certLabel = certification.status === 'pending' ? '待同步' : '未提交';
  const statusLabel = (status: RecordStatus) => status === 'published' ? '待展示' : '草稿';

  return (
    <div className="business-page">
      <header className="business-hero">
        <div className="business-hero-copy">
          <div className="business-avatar"><Icon name="building" /></div>
          <div>
            <span className="business-eyebrow">BUSINESS WORKSPACE · 本地草稿</span>
            <h1>{profile.name || '企业业务工作区'}</h1>
            <p>{profile.name ? '资料会保存在当前浏览器，待后端接口接入后再同步到平台。' : '先把业务资料和规则录入清楚，暂不依赖真实业务数据。'}</p>
            <div className="business-meta">
              <span>{profile.city || '服务地区待填写'}</span>
              <span>{profile.services || '服务范围待填写'}</span>
              <span className={`cert-badge ${certification.status}`}>{certLabel}</span>
            </div>
          </div>
        </div>
        <div className="business-progress">
          <span>业务资料准备度</span>
          <strong>{completion}/5</strong>
          <div className="progress-track"><i style={{ width: `${completion * 20}%` }} /></div>
          <small>仅代表本机草稿，不代表平台认证结果</small>
        </div>
      </header>

      <nav className="business-nav" aria-label="企业业务模块">
        {tabs.map((tab) => <button key={tab.key} className={activeTab === tab.key ? 'active' : ''} onClick={() => setActiveTab(tab.key)}><span>{tab.label}</span><small>{tab.description}</small></button>)}
      </nav>

      <main className="business-content">
        {activeTab === 'overview' && <motion.div className="business-panel-stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <section className="business-section-heading"><div><span className="business-eyebrow">START WITH THE RECORD</span><h2>先建立一份可核对的企业资料</h2><p>当前没有真实业务数据，所有内容都由你手动录入，后续可直接替换为接口返回。</p></div><span className="local-badge">本地模式</span></section>
          <div className="overview-grid">
            <section className="overview-card profile-card">
              <div className="card-heading"><div><span className="card-kicker">01</span><h3>企业基础资料</h3></div><button className="text-action" onClick={() => setShowProfileForm((value) => !value)}>{showProfileForm ? '收起' : '编辑'} <Icon name="arrow" /></button></div>
              {showProfileForm ? <form className="business-form" onSubmit={saveProfile}>
                <Field label="企业名称"><input value={profileDraft.name} onChange={(event) => setProfileDraft({ ...profileDraft, name: event.target.value })} placeholder="例如：某某装饰设计有限公司" /></Field>
                <Field label="服务地区"><input value={profileDraft.city} onChange={(event) => setProfileDraft({ ...profileDraft, city: event.target.value })} placeholder="例如：上海、苏州" /></Field>
                <Field label="服务范围"><input value={profileDraft.services} onChange={(event) => setProfileDraft({ ...profileDraft, services: event.target.value })} placeholder="例如：全案设计、施工监理" /></Field>
                <Field label="企业简介"><textarea value={profileDraft.intro} onChange={(event) => setProfileDraft({ ...profileDraft, intro: event.target.value })} placeholder="描述企业擅长方向和服务特点" rows={3} /></Field>
                <button className="primary-button" type="submit"><Icon name="check" />保存本机草稿</button>
              </form> : <div className="profile-summary"><strong>{profile.name || '还没有企业名称'}</strong><p>{profile.intro || '完善企业简介后，这里会显示企业服务定位。'}</p><div className="summary-lines"><span>服务地区 <b>{profile.city || '未填写'}</b></span><span>服务范围 <b>{profile.services || '未填写'}</b></span></div></div>}
            </section>
            <section className="overview-card checklist-card">
              <div className="card-heading"><div><span className="card-kicker">02</span><h3>业务资料清单</h3></div><span className="completion-count">{completion}/5</span></div>
              <div className="checklist">
                <ChecklistItem done={Boolean(profile.name)} label="企业基础资料" onClick={() => { setShowProfileForm(true); setActiveTab('overview'); }} />
                <ChecklistItem done={cases.length > 0} label="至少一条案例资料" onClick={() => goTo('cases')} />
                <ChecklistItem done={materials.length > 0} label="至少一条材料报价" onClick={() => goTo('materials')} />
                <ChecklistItem done={workers.length > 0} label="至少一条人工报价" onClick={() => goTo('workers')} />
                <ChecklistItem done={certification.status === 'pending'} label="提交认证资料草稿" onClick={() => goTo('certification')} />
              </div>
            </section>
          </div>
          <section className="workflow-note"><div className="note-mark">!</div><div><strong>当前阶段的边界</strong><p>这里不展示虚构企业、价格、评分或认证结果。录入内容只用于页面联调和流程验证，真实数据接口接入后再替换。</p></div></section>
        </motion.div>}

        {activeTab === 'cases' && <motion.div className="business-panel-stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <SectionHeading eyebrow="CASE LIBRARY" title="案例资料" detail="先录入案例信息，图片文件仅保留当前会话中的文件名。" action={<button className="primary-button" onClick={() => { setShowCaseForm((value) => !value); setEditingCaseId(''); setCaseForm(emptyCase); }}><Icon name="plus" />{showCaseForm ? '收起表单' : '新增案例'}</button>} />
          {showCaseForm && <form className="entry-form" onSubmit={addCase}><div className="form-grid form-grid-4"><Field label="案例名称"><input required value={caseForm.title} onChange={(event) => setCaseForm({ ...caseForm, title: event.target.value })} placeholder="例如：三居室全案设计" /></Field><Field label="面积"><input value={caseForm.area} onChange={(event) => setCaseForm({ ...caseForm, area: event.target.value })} placeholder="例如：120㎡" /></Field><Field label="风格"><input value={caseForm.style} onChange={(event) => setCaseForm({ ...caseForm, style: event.target.value })} placeholder="例如：现代简约" /></Field><Field label="预算"><input value={caseForm.budget} onChange={(event) => setCaseForm({ ...caseForm, budget: event.target.value })} placeholder="例如：18万元" /></Field></div><div className="form-footer"><Field label="案例资料"><input type="file" multiple accept="image/*,.pdf" onChange={(event) => setCaseForm({ ...caseForm, files: [...caseForm.files, ...Array.from(event.target.files || []).map((file) => file.name)] })} /><small>{caseForm.files.length ? `已选择 ${caseForm.files.length} 个文件名，文件本身尚未上传。` : '当前只记录文件名，不上传到服务器。'}</small></Field><label className="switch-field"><input type="checkbox" checked={caseForm.status === 'published'} onChange={(event) => setCaseForm({ ...caseForm, status: event.target.checked ? 'published' : 'draft' })} /><span>标记为待展示</span></label><button className="primary-button" type="submit"><Icon name="check" />{editingCaseId ? '保存修改' : '保存案例'}</button></div></form>}
          {cases.length === 0 ? <EmptyState title="还没有案例资料" detail="新增一条案例，验证企业案例的录入、状态和资料管理流程。" action={() => setShowCaseForm(true)} /> : <div className="record-list">{cases.map((item) => <RecordRow key={item.id} title={item.title} meta={`${item.area || '面积未填'} · ${item.style || '风格未填'} · ${item.budget || '预算未填'}`} status={statusLabel(item.status)} detail={item.files.length ? `${item.files.length} 个资料文件` : '未附资料文件'} updatedAt={dateLabel(item.updatedAt)} onEdit={() => { setCaseForm({ title: item.title, area: item.area, style: item.style, budget: item.budget, status: item.status, files: item.files }); setEditingCaseId(item.id); setShowCaseForm(true); }} onDelete={() => setCases((items) => items.filter((entry) => entry.id !== item.id))} />)}</div>}
        </motion.div>}

        {activeTab === 'materials' && <motion.div className="business-panel-stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <SectionHeading eyebrow="MATERIAL PRICING" title="材料报价" detail="每条报价都要带地区和有效期，方便后续给 AI-03 提供可追溯数据。" action={<button className="primary-button" onClick={() => { setShowMaterialForm((value) => !value); setEditingMaterialId(''); setMaterialForm(emptyMaterial); }}><Icon name="plus" />{showMaterialForm ? '收起表单' : '新增报价'}</button>} />
          {showMaterialForm && <form className="entry-form" onSubmit={addMaterial}><div className="form-grid form-grid-4"><Field label="材料名称"><input required value={materialForm.name} onChange={(event) => setMaterialForm({ ...materialForm, name: event.target.value })} placeholder="例如：木地板" /></Field><Field label="规格"><input value={materialForm.spec} onChange={(event) => setMaterialForm({ ...materialForm, spec: event.target.value })} placeholder="例如：910×127×15mm" /></Field><Field label="单位"><input value={materialForm.unit} onChange={(event) => setMaterialForm({ ...materialForm, unit: event.target.value })} placeholder="例如：㎡" /></Field><Field label="价格（元）"><input required type="number" min="0" value={materialForm.price} onChange={(event) => setMaterialForm({ ...materialForm, price: event.target.value })} placeholder="0" /></Field><Field label="分类"><input value={materialForm.category} onChange={(event) => setMaterialForm({ ...materialForm, category: event.target.value })} placeholder="例如：地板" /></Field><Field label="适用地区"><input value={materialForm.region} onChange={(event) => setMaterialForm({ ...materialForm, region: event.target.value })} placeholder="例如：上海" /></Field><Field label="有效期至" hint="缺失有效期时，后续推荐应提示数据不完整"><input type="date" value={materialForm.validUntil} onChange={(event) => setMaterialForm({ ...materialForm, validUntil: event.target.value })} /></Field></div><div className="form-actions"><button className="primary-button" type="submit"><Icon name="check" />{editingMaterialId ? '保存修改' : '保存报价'}</button></div></form>}
          {materials.length === 0 ? <EmptyState title="还没有材料报价" detail="先录入一条材料价格，验证地区、单位和有效期字段。" action={() => setShowMaterialForm(true)} /> : <div className="record-list">{materials.map((item) => <RecordRow key={item.id} title={item.name} meta={`${item.spec || '规格未填'} · ${item.unit || '单位未填'} · ${item.category || '未分类'}`} status={`¥${item.price}`} detail={`${item.region || '地区未填'} · 有效期 ${dateLabel(item.validUntil)}`} updatedAt={dateLabel(item.updatedAt)} onEdit={() => { setMaterialForm({ name: item.name, spec: item.spec, unit: item.unit, price: item.price, category: item.category, region: item.region, validUntil: item.validUntil }); setEditingMaterialId(item.id); setShowMaterialForm(true); }} onDelete={() => setMaterials((items) => items.filter((entry) => entry.id !== item.id))} />)}</div>}
        </motion.div>}

        {activeTab === 'workers' && <motion.div className="business-panel-stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <SectionHeading eyebrow="LABOR PRICING" title="人工报价" detail="工种、单位、地区和有效期都由你手动录入，暂不连接真实报价源。" action={<button className="primary-button" onClick={() => { setShowWorkerForm((value) => !value); setEditingWorkerId(''); setWorkerForm(emptyWorker); }}><Icon name="plus" />{showWorkerForm ? '收起表单' : '新增工种'}</button>} />
          {showWorkerForm && <form className="entry-form" onSubmit={addWorker}><div className="form-grid form-grid-4"><Field label="工种"><input required value={workerForm.type} onChange={(event) => setWorkerForm({ ...workerForm, type: event.target.value })} placeholder="例如：水电工" /></Field><Field label="计价单位"><input value={workerForm.unit} onChange={(event) => setWorkerForm({ ...workerForm, unit: event.target.value })} placeholder="例如：工日/㎡" /></Field><Field label="单价（元）"><input required type="number" min="0" value={workerForm.price} onChange={(event) => setWorkerForm({ ...workerForm, price: event.target.value })} placeholder="0" /></Field><Field label="服务地区"><input value={workerForm.region} onChange={(event) => setWorkerForm({ ...workerForm, region: event.target.value })} placeholder="例如：上海" /></Field><Field label="有效期至"><input type="date" value={workerForm.validUntil} onChange={(event) => setWorkerForm({ ...workerForm, validUntil: event.target.value })} /></Field></div><div className="form-actions"><button className="primary-button" type="submit"><Icon name="check" />{editingWorkerId ? '保存修改' : '保存报价'}</button></div></form>}
          {workers.length === 0 ? <EmptyState title="还没有人工报价" detail="先录入一个工种，验证地区和有效期缺失时的展示方式。" action={() => setShowWorkerForm(true)} /> : <div className="record-list">{workers.map((item) => <RecordRow key={item.id} title={item.type} meta={`${item.unit || '单位未填'} · ¥${item.price}`} status={item.region || '地区未填'} detail={`有效期 ${dateLabel(item.validUntil)}`} updatedAt={dateLabel(item.updatedAt)} onEdit={() => { setWorkerForm({ type: item.type, unit: item.unit, price: item.price, region: item.region, validUntil: item.validUntil }); setEditingWorkerId(item.id); setShowWorkerForm(true); }} onDelete={() => setWorkers((items) => items.filter((entry) => entry.id !== item.id))} />)}</div>}
        </motion.div>}

        {activeTab === 'certification' && <motion.div className="business-panel-stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <SectionHeading eyebrow="CERTIFICATION PREP" title="认证资料" detail="这里只准备资料，不会伪造审核通过状态。接入后端后再进入真实审核流程。" />
          <form className="cert-form" onSubmit={submitCertification}><div className="cert-form-main"><Field label="企业名称"><input required value={certDraft.companyName} onChange={(event) => setCertDraft({ ...certDraft, companyName: event.target.value })} placeholder="请输入企业全称" /></Field><Field label="联系人及联系方式"><input required value={certDraft.contact} onChange={(event) => setCertDraft({ ...certDraft, contact: event.target.value })} placeholder="例如：王先生 138xxxx" /></Field><Field label="服务地区"><input value={certDraft.serviceAreas} onChange={(event) => setCertDraft({ ...certDraft, serviceAreas: event.target.value })} placeholder="例如：上海、苏州" /></Field><Field label="资质文件"><input type="file" multiple accept="image/*,.pdf" onChange={(event) => setCertDraft({ ...certDraft, documents: Array.from(event.target.files || []).map((file) => file.name) })} /><small>当前只记录文件名，文件不会上传到服务器。</small></Field><div className="selected-files">{certDraft.documents.length ? certDraft.documents.map((file) => <span key={file}><Icon name="file" />{file}</span>) : <span className="muted-copy">尚未选择文件</span>}</div><div className="cert-form-footer"><button className="primary-button" type="submit"><Icon name="upload" />保存本地资料</button>{certError && <span className="form-error">{certError}</span>}</div></div><aside className="cert-status-panel"><span className="card-kicker">CURRENT STATE</span><div className={`cert-state ${certification.status}`}><span className="state-dot" />{certLabel}</div><p>{certification.status === 'pending' ? '资料已保存在当前浏览器，待接入平台接口后再提交审核。' : '尚未保存认证资料。填写左侧表单后保存本机草稿。'}</p><div className="cert-steps"><span className="done"><b>1</b>填写资料</span><span className={certification.status === 'pending' ? 'done' : ''}><b>2</b>待同步</span><span><b>3</b>平台审核</span></div></aside></form>
        </motion.div>}
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

function RecordRow({ title, meta, status, detail, updatedAt, onEdit, onDelete }: { title: string; meta: string; status: string; detail: string; updatedAt: string; onEdit: () => void; onDelete: () => void }) {
  return <article className="record-row"><div className="record-icon"><Icon name="file" /></div><div className="record-main"><strong>{title}</strong><span>{meta}</span></div><div className="record-detail"><b>{status}</b><span>{detail}</span></div><div className="record-date">更新于 {updatedAt}</div><div className="record-actions"><button className="text-action" onClick={onEdit}>编辑</button><button className="icon-button danger" onClick={onDelete} aria-label={`删除${title}`} title="删除"><Icon name="trash" /></button></div></article>;
}
