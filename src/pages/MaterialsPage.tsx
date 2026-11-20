import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { workspaceDataAdapter } from '../services/workspaceData';
import { loadCatalogMaterialImage } from '../services/materialCatalog';
import { createMaterialInquiry } from '../services/inquiries';
import type { MaterialRecord } from '../services/dataContracts';
import './MaterialsPage.css';

function contactHref(value: string): string | undefined {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;
  if (/^\+?[\d\s()-]{6,}$/.test(value)) return `tel:${value.replace(/[\s()-]/g, '')}`;
  return undefined;
}

function readFavorites(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || '{}');
    if (typeof value !== 'object' || value === null || !('favorites' in value)) return [];
    const favorites = (value as { favorites?: unknown }).favorites;
    return Array.isArray(favorites) ? favorites.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export default function MaterialsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const projects = useAppStore((state) => state.projects);
  const toggleProjectMaterial = useAppStore((state) => state.toggleProjectMaterial);
  const authSession = useAppStore((state) => state.authSession);
  const isAuthenticated = Boolean(authSession);
  const preferenceKey = `decoration-material-preferences:${authSession?.user.id || 'guest'}`;
  const requireLogin = () => {
    if (isAuthenticated) return true;
    navigate(`/login?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`);
    return false;
  };
  const [projectId, setProjectId] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const [libraryView, setLibraryView] = useState<'all' | 'saved'>('all');
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => authSession ? readFavorites(preferenceKey) : []);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [materials, setMaterials] = useState<MaterialRecord[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [materialsStatus, setMaterialsStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [detailMaterial, setDetailMaterial] = useState<MaterialRecord | null>(null);
  const [detailImageIndex, setDetailImageIndex] = useState(0);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [inquiryFormOpen, setInquiryFormOpen] = useState(false);
  const [inquirySubmitting, setInquirySubmitting] = useState(false);
  const [inquirySent, setInquirySent] = useState(false);
  const [inquiryError, setInquiryError] = useState('');
  const [inquiryForm, setInquiryForm] = useState({ contactName: '', contactInfo: '', message: '' });
  const touchStartX = useRef<number | null>(null);
  useEffect(() => {
    if (!isAuthenticated) return;
    try { localStorage.setItem(preferenceKey, JSON.stringify({ favorites: favoriteIds })); }
    catch { /* Browser storage may be unavailable or full. */ }
  }, [favoriteIds, preferenceKey, isAuthenticated]);
  const detailGallery = detailMaterial?.imageIds?.length
    ? detailMaterial.imageIds
    : detailMaterial?.imageId ? [detailMaterial.imageId] : [];
  const activeDetailImageId = detailGallery[detailImageIndex];

  useEffect(() => {
    let active = true;
    workspaceDataAdapter.loadMaterials().then((items) => {
      if (!active) return;
      setMaterials(items);
      setMaterialsStatus('ready');
    }).catch(() => {
      if (active) setMaterialsStatus('error');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const createdUrls: string[] = [];
    const imageMaterials = materials.flatMap((material) => (material.imageIds?.length ? material.imageIds : material.imageId ? [material.imageId] : []).map((imageId) => ({ materialId: material.id, imageId })));
    void Promise.all(imageMaterials.map(async ({ materialId, imageId }) => {
      try {
        const blob = await loadCatalogMaterialImage(materialId, imageId);
        const url = URL.createObjectURL(blob);
        createdUrls.push(url);
        return [imageId, url] as const;
      } catch {
        return null;
      }
    })).then((loaded) => {
      if (active) setImageUrls(Object.fromEntries(loaded.filter((item): item is readonly [string, string] => item !== null)));
    });
    return () => {
      active = false;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [materials]);

  useEffect(() => {
    if (!detailMaterial) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (imageViewerOpen) setImageViewerOpen(false);
        else setDetailMaterial(null);
      }
      if (imageViewerOpen && event.key === 'ArrowLeft') {
        setDetailImageIndex((index) => (index - 1 + detailGallery.length) % detailGallery.length);
      }
      if (imageViewerOpen && event.key === 'ArrowRight') {
        setDetailImageIndex((index) => (index + 1) % detailGallery.length);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [detailMaterial, imageViewerOpen, detailGallery.length]);

  const categories = ['全部', ...new Set(materials.map((material) => material.category).filter(Boolean))];
  const visibleMaterials = useMemo(() => materials.filter((material) => {
    const matchesQuery = `${material.name} ${material.spec} ${material.region}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesView = libraryView === 'all' || favoriteIds.includes(material.id);
    return matchesQuery && matchesView && (category === '全部' || material.category === category);
  }), [materials, query, category, libraryView, favoriteIds]);
  const selectedProjectId = projects.some((project) => project.id === projectId) ? projectId : (projects[0]?.id ?? '');
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const openDetails = (material: MaterialRecord) => {
    setDetailImageIndex(0);
    setImageViewerOpen(false);
    setInquiryFormOpen(false);
    setInquirySent(false);
    setInquiryError('');
    setDetailMaterial(material);
  };

  const openInquiryForm = () => {
    if (!requireLogin()) return;
    setInquiryForm({
      contactName: authSession?.user.displayName || '',
      contactInfo: authSession?.user.email || '',
      message: `您好，我想咨询“${detailMaterial?.name || '这款材料'}”的价格、库存和供货情况。`,
    });
    setInquiryError('');
    setInquirySent(false);
    setInquiryFormOpen(true);
  };

  const submitInquiry = async (event: FormEvent) => {
    event.preventDefault();
    if (!requireLogin() || !detailMaterial) return;
    setInquirySubmitting(true);
    setInquiryError('');
    try {
      await createMaterialInquiry({ materialId: detailMaterial.id, ...inquiryForm });
      setInquirySent(true);
      setInquiryFormOpen(false);
    } catch (error) {
      setInquiryError(error instanceof Error ? error.message : '咨询发送失败，请稍后重试。');
    } finally {
      setInquirySubmitting(false);
    }
  };

  const stepImage = (direction: -1 | 1) => {
    if (detailGallery.length < 2) return;
    setDetailImageIndex((index) => (index + direction + detailGallery.length) % detailGallery.length);
  };

  const toggleFavorite = (materialId: string) => {
    if (!isAuthenticated) {
      requireLogin();
      return;
    }
    setFavoriteIds((current) => current.includes(materialId)
      ? current.filter((id) => id !== materialId)
      : [...current, materialId]);
  };

  const toggleCompare = (materialId: string) => {
    setCompareIds((current) => {
      if (current.includes(materialId)) return current.filter((id) => id !== materialId);
      if (current.length >= 4) return current;
      return [...current, materialId];
    });
  };

  const availableCompareIds = compareIds.filter((id) => materials.some((item) => item.id === id));
  const comparedMaterials = availableCompareIds.map((id) => materials.find((item) => item.id === id)).filter((item): item is MaterialRecord => Boolean(item));
  const availableFavoriteCount = favoriteIds.filter((id) => materials.some((item) => item.id === id)).length;

  return <main className="materials-page">
    <header className="materials-header"><div><span className="materials-eyebrow">MATERIAL LIBRARY</span><h1>材料库</h1><p>浏览已认证企业录入的材料报价，并将选中的材料加入设计项目。</p></div>{isAuthenticated && <Link to="/projects">我的项目</Link>}</header>
    <div className="materials-toolbar"><label className="materials-search"><span>搜索材料</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名称、规格或地区" /></label>{isAuthenticated && <label className="materials-project-select"><span>关联到项目</span><select value={selectedProjectId} onChange={(event) => setProjectId(event.target.value)} disabled={!projects.length}><option value="">选择项目</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}</div>
    <div className="materials-library-controls"><div className="materials-view-switch" role="group" aria-label="材料视图"><button type="button" className={libraryView === 'all' ? 'active' : ''} aria-pressed={libraryView === 'all'} onClick={() => setLibraryView('all')}>全部材料</button>{isAuthenticated && <button type="button" className={libraryView === 'saved' ? 'active' : ''} aria-pressed={libraryView === 'saved'} onClick={() => setLibraryView('saved')}>已收藏 <span>{availableFavoriteCount}</span></button>}</div><div className="materials-compare-control"><span>{availableCompareIds.length}/4 项已选</span><button type="button" disabled={availableCompareIds.length < 2} onClick={() => setComparisonOpen(true)}>对比材料</button><button type="button" className="clear-compare" disabled={!availableCompareIds.length} onClick={() => setCompareIds([])}>清空</button></div></div>
    <nav className="materials-filters" aria-label="材料分类">{categories.map((item) => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</nav>
    {isAuthenticated && !projects.length && <div className="materials-notice">先创建一个项目，之后可以把材料加入项目清单。 <Link to="/workspace">创建项目</Link></div>}
    {materialsStatus === 'loading' ? <section className="materials-empty" role="status"><h2>正在加载材料</h2><p>请稍候。</p></section> : materialsStatus === 'error' ? <section className="materials-empty" role="alert"><h2>材料暂时无法加载</h2><p>请刷新页面后重试。</p></section> : materials.length === 0 ? <section className="materials-empty"><h2>当前没有已录入的材料</h2><p>材料库汇总已通过认证的企业录入、且在有效期内的报价。你可以先继续创建和编辑设计项目，不需要等待材料数据。</p><Link to="/workspace">继续设计</Link></section> : visibleMaterials.length === 0 ? <section className="materials-empty"><h2>{libraryView === 'saved' && !query ? '还没有收藏材料' : '没有匹配的材料'}</h2><p>{libraryView === 'saved' && !query ? '在材料卡片上选择“收藏”，方便之后回来看和比较。' : '试试其他名称、规格、地区或分类。'}</p></section> : <section className="materials-grid" aria-label="材料列表">{visibleMaterials.map((material) => {
      const attached = Boolean(selectedProject?.materialIds.includes(material.id));
      const favorited = favoriteIds.includes(material.id);
      const compared = compareIds.includes(material.id);
      const gallery = material.imageIds?.length ? material.imageIds : material.imageId ? [material.imageId] : [];
      const coverId = gallery[0];
      return <article className="material-item" key={material.id}>
        {coverId && imageUrls[coverId] ? <button type="button" className="material-image-trigger" aria-label={`查看${material.name}图片详情`} onClick={() => openDetails(material)}><img className="material-item-image" src={imageUrls[coverId]} alt={`${material.name}材料`} loading="lazy" decoding="async" />{gallery.length > 1 && <span className="material-item-image-count">{gallery.length} 张图片</span>}</button> : <div className="material-item-image-placeholder">{gallery.length ? '图片加载中' : '暂无材料图片'}</div>}
        <div className="material-item-top"><span>{material.category || '未分类'}</span><strong>{material.region || '地区未填写'}</strong></div>
        <h2><button type="button" className="material-title-button" onClick={() => openDetails(material)}>{material.name}</button></h2>
        <p>{material.spec || '规格未填写'}{material.unit ? ` · ${material.unit}` : ''}</p>
        {material.companyName && <p className="material-company">报价方：{material.companyId ? <Link to={`/companies/${material.companyId}`} onClick={(event) => event.stopPropagation()}>{material.companyName}</Link> : material.companyName}</p>}
        <div className="material-price">¥{material.price || '未报价'}<small> / {material.unit || '单位未填写'}</small></div>
        <div className="material-item-actions"><button type="button" className={`material-save-button ${favorited ? 'saved' : ''}`} aria-pressed={favorited} onClick={() => toggleFavorite(material.id)}>{favorited ? '已收藏' : '收藏'}</button><button type="button" className={`material-compare-button ${compared ? 'selected' : ''}`} aria-pressed={compared} disabled={!compared && compareIds.length >= 4} onClick={() => toggleCompare(material.id)}>{compared ? '已选对比' : '加入对比'}</button></div>
        <div className="material-item-foot"><button type="button" className="material-details-button" onClick={() => openDetails(material)}>查看详情</button><button disabled={isAuthenticated && !selectedProject} className={attached ? 'attached' : ''} onClick={() => requireLogin() && selectedProject && toggleProjectMaterial(selectedProject.id, material.id)}>{attached ? '已加入项目' : '加入项目'}</button></div>
      </article>;
    })}</section>}
    {detailMaterial && <div className="material-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailMaterial(null); }}>
      <section className="material-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="material-detail-title">
        <button type="button" className="material-detail-close" aria-label="关闭材料详情" onClick={() => setDetailMaterial(null)}>×</button>
        <div className="material-detail-gallery"
          onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }}
          onTouchEnd={(event) => {
            const start = touchStartX.current;
            const end = event.changedTouches[0]?.clientX;
            touchStartX.current = null;
            if (start !== null && end !== undefined && Math.abs(end - start) > 45) stepImage(end < start ? 1 : -1);
          }}>
          {activeDetailImageId && imageUrls[activeDetailImageId] ? <button type="button" className="material-detail-image-trigger" aria-label="放大查看材料图片" onClick={() => setImageViewerOpen(true)}><img className="material-detail-image" src={imageUrls[activeDetailImageId]} alt={`${detailMaterial.name}材料图片 ${detailImageIndex + 1}`} decoding="async" /></button> : <div className="material-detail-image-placeholder">{detailGallery.length ? '图片暂不可用' : '暂无材料图片'}</div>}
          {detailGallery.length > 1 && <><button type="button" className="material-gallery-arrow previous" aria-label="上一张材料图片" onClick={() => stepImage(-1)}>←</button><button type="button" className="material-gallery-arrow next" aria-label="下一张材料图片" onClick={() => stepImage(1)}>→</button><div className="material-gallery-thumbnails">{detailGallery.map((imageId, index) => <button type="button" key={imageId} className={index === detailImageIndex ? 'active' : ''} aria-label={`查看第 ${index + 1} 张`} aria-current={index === detailImageIndex ? 'true' : undefined} onClick={() => setDetailImageIndex(index)}>{imageUrls[imageId] && <img src={imageUrls[imageId]} alt="" loading="lazy" decoding="async" />}</button>)}</div><span className="material-gallery-count">{detailImageIndex + 1} / {detailGallery.length}</span></>}
        </div>
        <div className="material-detail-content">
          <div className="material-detail-kicker">{detailMaterial.category || '材料'} · {detailMaterial.region || '地区未填写'}</div>
          <h2 id="material-detail-title">{detailMaterial.name}</h2>
          {detailMaterial.brand && <p className="material-detail-brand">{detailMaterial.brand}</p>}
          <div className="material-detail-price">¥{detailMaterial.price}<small> / {detailMaterial.unit || '单位未填写'}</small></div>
          <dl className="material-detail-specs">
            <div><dt>产品规格</dt><dd>{detailMaterial.spec || '未填写'}</dd></div>
            <div><dt>计价单位</dt><dd>{detailMaterial.unit || '未填写'}</dd></div>
            <div><dt>材料分类</dt><dd>{detailMaterial.category || '未分类'}</dd></div>
            <div><dt>适用地区</dt><dd>{detailMaterial.region || '未填写'}</dd></div>
            <div><dt>报价企业</dt><dd>{detailMaterial.companyName || '未填写'}</dd></div>
            <div><dt>报价有效期</dt><dd>{detailMaterial.validUntil || '未填写'}</dd></div>
          </dl>
          <section className="material-contact" aria-label="企业业务联系方式">
            <h3>业务联系</h3>
            <p>{detailMaterial.companyId ? <Link to={`/companies/${detailMaterial.companyId}`}>{detailMaterial.companyName || '报价企业'}</Link> : detailMaterial.companyName || '报价企业'}</p>
            {detailMaterial.companyContactName && <div><span>联系人</span><strong>{detailMaterial.companyContactName}</strong></div>}
            {detailMaterial.companyContactInfo ? <div><span>联系方式</span><strong>{contactHref(detailMaterial.companyContactInfo) ? <a href={contactHref(detailMaterial.companyContactInfo)}>{detailMaterial.companyContactInfo}</a> : detailMaterial.companyContactInfo}</strong></div> : <p className="material-contact-empty">企业暂未公开业务联系方式</p>}
          </section>
          <div className="material-detail-actions"><button type="button" className="material-inquiry-trigger" onClick={openInquiryForm}>咨询企业</button><button type="button" className={favoriteIds.includes(detailMaterial.id) ? 'saved' : ''} aria-pressed={favoriteIds.includes(detailMaterial.id)} onClick={() => toggleFavorite(detailMaterial.id)}>{favoriteIds.includes(detailMaterial.id) ? '已收藏' : '收藏'}</button><button type="button" disabled={isAuthenticated && !selectedProject} className={selectedProject?.materialIds.includes(detailMaterial.id) ? 'attached' : ''} onClick={() => requireLogin() && selectedProject && toggleProjectMaterial(selectedProject.id, detailMaterial.id)}>{selectedProject?.materialIds.includes(detailMaterial.id) ? '已加入项目' : '加入项目'}</button></div>
          {inquirySent && <p className="material-inquiry-success" role="status">咨询已发送，企业可在企业端查看并跟进。</p>}
        </div>
      </section>
    </div>}
    {inquiryFormOpen && detailMaterial && <div className="material-inquiry-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !inquirySubmitting) setInquiryFormOpen(false); }}>
      <section className="material-inquiry-dialog" role="dialog" aria-modal="true" aria-labelledby="material-inquiry-title">
        <header className="material-inquiry-header"><div><span className="materials-eyebrow">CONTACT COMPANY</span><h2 id="material-inquiry-title">咨询企业</h2><p>{detailMaterial.name}{detailMaterial.companyName ? ` · ${detailMaterial.companyName}` : ''}</p></div><button type="button" aria-label="关闭咨询窗口" disabled={inquirySubmitting} onClick={() => setInquiryFormOpen(false)}>×</button></header>
        <form className="material-inquiry-form" onSubmit={(event) => void submitInquiry(event)}>
          <div className="material-inquiry-context"><span>咨询材料</span><strong>{detailMaterial.name}</strong><span>报价企业</span><strong>{detailMaterial.companyName || '企业暂未填写'}</strong></div>
          <label>联系人<input required maxLength={120} value={inquiryForm.contactName} onChange={(event) => setInquiryForm((current) => ({ ...current, contactName: event.target.value }))} placeholder="请输入您的姓名" /></label>
          <label>联系方式<input required maxLength={160} value={inquiryForm.contactInfo} onChange={(event) => setInquiryForm((current) => ({ ...current, contactInfo: event.target.value }))} placeholder="手机号或邮箱" /></label>
          <label>咨询内容<textarea required maxLength={2000} rows={5} value={inquiryForm.message} onChange={(event) => setInquiryForm((current) => ({ ...current, message: event.target.value }))} placeholder="例如：想了解库存、供货周期和最新报价" /></label>
          {inquiryError && <p className="material-inquiry-error" role="alert">{inquiryError}</p>}
          <div className="material-inquiry-actions"><button type="button" onClick={() => setInquiryFormOpen(false)} disabled={inquirySubmitting}>取消</button><button type="submit" disabled={inquirySubmitting}>{inquirySubmitting ? '发送中…' : '发送咨询'}</button></div>
        </form>
      </section>
    </div>}
    {comparisonOpen && <div className="material-compare-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setComparisonOpen(false); }}><section className="material-compare-dialog" role="dialog" aria-modal="true" aria-labelledby="material-compare-title"><header><div><span className="materials-eyebrow">COMPARE MATERIALS</span><h2 id="material-compare-title">材料对比</h2></div><button type="button" aria-label="关闭材料对比" onClick={() => setComparisonOpen(false)}>×</button></header><div className="material-compare-table-wrap"><table className="material-compare-table"><thead><tr><th scope="col">对比项目</th>{comparedMaterials.map((item) => <th scope="col" key={item.id}><strong>{item.name}</strong><button type="button" onClick={() => toggleCompare(item.id)}>移除</button></th>)}</tr></thead><tbody>{([
      ['品牌', (item: MaterialRecord) => item.brand || '未填写'],
      ['规格', (item: MaterialRecord) => item.spec || '未填写'],
      ['报价', (item: MaterialRecord) => `¥${item.price || '未报价'}${item.unit ? ` / ${item.unit}` : ''}`],
      ['分类', (item: MaterialRecord) => item.category || '未分类'],
      ['适用地区', (item: MaterialRecord) => item.region || '未填写'],
      ['报价企业', (item: MaterialRecord) => item.companyName || '未填写'],
      ['有效期至', (item: MaterialRecord) => item.validUntil || '未填写'],
      ['更新时间', (item: MaterialRecord) => item.updatedAt?.slice(0, 10) || '未填写'],
    ] as const).map(([label, value]) => <tr key={label}><th scope="row">{label}</th>{comparedMaterials.map((item) => <td key={item.id}>{value(item)}</td>)}</tr>)}</tbody></table></div></section></div>}
    {imageViewerOpen && activeDetailImageId && imageUrls[activeDetailImageId] && <div className="material-image-viewer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setImageViewerOpen(false); }}>
      <button type="button" className="material-image-viewer-close" aria-label="关闭大图" onClick={() => setImageViewerOpen(false)}>×</button>
      {detailGallery.length > 1 && <button type="button" className="material-image-viewer-arrow previous" aria-label="上一张图片" onClick={() => stepImage(-1)}>←</button>}
      <img src={imageUrls[activeDetailImageId]} alt={`${detailMaterial?.name || '材料'}图片 ${detailImageIndex + 1}`} />
      {detailGallery.length > 1 && <button type="button" className="material-image-viewer-arrow next" aria-label="下一张图片" onClick={() => stepImage(1)}>→</button>}
      {detailGallery.length > 1 && <span className="material-image-viewer-count">{detailImageIndex + 1} / {detailGallery.length}</span>}
    </div>}
  </main>;
}
