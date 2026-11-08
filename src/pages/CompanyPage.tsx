import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { loadPublicCompany, loadPublicCompanyAsset, type PublicCompany } from '../services/companyCatalog';
import './CompanyPage.css';

function contactHref(value: string | null) {
  if (!value) return null;
  if (/^\+?[\d\s-]{7,}$/.test(value)) return `tel:${value.replace(/[\s-]/g, '')}`;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;
  return null;
}

export default function CompanyPage() {
  const { companyId = '' } = useParams();
  const [company, setCompany] = useState<PublicCompany | null>(null);
  const [images, setImages] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const urlsRef = useRef<Record<string, string>>({});

  useEffect(() => { urlsRef.current = images; }, [images]);
  useEffect(() => () => Object.values(urlsRef.current).forEach((url) => URL.revokeObjectURL(url)), []);
  useEffect(() => {
    let active = true;
    setStatus('loading'); setError('');
    void loadPublicCompany(companyId).then(async (next) => {
      if (!active) return;
      setCompany(next);
      const ids = [next.logoAssetId, next.storefrontAssetId].filter((id): id is string => Boolean(id));
      const entries = await Promise.all(ids.map(async (id) => {
        try { return [id, URL.createObjectURL(await loadPublicCompanyAsset(companyId, id))] as const; }
        catch { return null; }
      }));
      if (!active) return;
      const nextImages: Record<string, string> = {};
      entries.forEach((entry) => { if (entry) nextImages[entry[0]] = entry[1]; });
      setImages(nextImages); setStatus('ready');
    }).catch((reason: unknown) => { if (active) { setError(reason instanceof Error ? reason.message : '企业主页暂时无法加载。'); setStatus('error'); } });
    return () => { active = false; };
  }, [companyId]);

  if (status === 'loading') return <main className="company-page company-state"><strong>正在加载企业主页</strong><span>请稍候。</span></main>;
  if (status === 'error' || !company) return <main className="company-page company-state" role="alert"><strong>企业主页暂时无法打开</strong><span>{error || '该企业可能尚未通过认证。'}</span><Link to="/cases">返回认证企业案例</Link></main>;

  const contactLink = contactHref(company.publicContactInfo);
  const coverUrl = company.storefrontAssetId ? images[company.storefrontAssetId] : undefined;
  const logoUrl = company.logoAssetId ? images[company.logoAssetId] : undefined;
  return <main className="company-page">
    <header className="company-hero">
      <div className="company-hero-media">{coverUrl ? <img src={coverUrl} alt={`${company.name}门店图片`} /> : <div className="company-hero-placeholder">{company.name.slice(0, 1)}</div>}<span className="company-certified">已认证企业</span></div>
      <div className="company-hero-copy"><div className="company-identity">{logoUrl ? <img src={logoUrl} alt="企业 Logo" /> : <div className="company-logo-fallback">{company.name.slice(0, 1)}</div>}<div><span className="company-eyebrow">CERTIFIED COMPANY</span><h1>{company.name}</h1><p>{company.city || '服务地区待填写'}{company.services ? ` · ${company.services}` : ''}</p></div></div><div className="company-hero-actions"><Link to="/cases">浏览案例</Link><Link to="/materials">查看材料</Link></div></div>
    </header>
    <section className="company-stats" aria-label="企业公开数据"><div><strong>{company.caseCount}</strong><span>公开案例</span></div><div><strong>{company.materialCount}</strong><span>有效材料</span></div><div><strong>已认证</strong><span>平台状态</span></div></section>
    <div className="company-content-grid"><section className="company-main-column"><article className="company-section"><span className="company-section-label">ABOUT THE STUDIO</span><h2>关于企业</h2><p>{company.intro || '企业暂未填写简介。'}</p></article><article className="company-section"><span className="company-section-label">SERVICE AREA</span><h2>服务区域</h2><div className="company-tags">{(company.serviceAreas.length ? company.serviceAreas : [company.city || '服务区域待填写']).map((area) => <span key={area}>{area}</span>)}</div></article></section><aside className="company-side-column"><article className="company-contact"><span className="company-section-label">CONTACT</span><h2>业务联系</h2>{company.publicContactName && <div><small>联系人</small><strong>{company.publicContactName}</strong></div>}{company.publicContactInfo && <div><small>联系方式</small><strong>{contactLink ? <a href={contactLink}>{company.publicContactInfo}</a> : company.publicContactInfo}</strong></div>}{!company.publicContactName && !company.publicContactInfo && <p>企业暂未公开业务联系方式。</p>}</article><article className="company-hours"><span className="company-section-label">OPENING HOURS</span><h2>营业时间</h2><p>{company.businessHours || '营业时间待填写'}</p></article></aside></div>
  </main>;
}
