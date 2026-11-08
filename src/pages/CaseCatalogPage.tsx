import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadPublicCaseFile, loadPublicCases, type PublicCase } from '../services/caseCatalog';
import './CaseCatalogPage.css';

function formatAmount(value: number | null) { return value == null ? '未填写' : `${value} 万元`; }

export default function CaseCatalogPage() {
  const [cases, setCases] = useState<PublicCase[]>([]);
  const [query, setQuery] = useState('');
  const [style, setStyle] = useState('全部');
  const [city, setCity] = useState('全部');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [detail, setDetail] = useState<PublicCase | null>(null);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [assetError, setAssetError] = useState('');
  const assetUrlsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    setStatus('loading');
    void loadPublicCases({ query, style, city }).then((items) => {
      if (active) { setCases(items); setStatus('ready'); }
    }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [query, style, city]);

  useEffect(() => { assetUrlsRef.current = assetUrls; }, [assetUrls]);
  useEffect(() => () => Object.values(assetUrlsRef.current).forEach((url) => URL.revokeObjectURL(url)), []);

  const styles = useMemo(() => ['全部', ...new Set(cases.map((item) => item.style).filter((item): item is string => Boolean(item)))], [cases]);
  const cities = useMemo(() => ['全部', ...new Set(cases.map((item) => item.city).filter((item): item is string => Boolean(item)))], [cases]);
  const openCase = (item: PublicCase) => { setDetail(item); setAssetError(''); };
  const previewFile = async (item: PublicCase, fileId: string) => {
    if (assetUrls[fileId]) return;
    try {
      const blob = await loadPublicCaseFile(item.id, fileId);
      setAssetUrls((current) => ({ ...current, [fileId]: URL.createObjectURL(blob) }));
    } catch (error) { setAssetError(error instanceof Error ? error.message : '案例资料暂时无法读取。'); }
  };

  return <main className="case-catalog-page">
    <header className="case-catalog-header"><div><span className="case-catalog-eyebrow">CERTIFIED CASES</span><h1>认证企业案例</h1><p>浏览已认证企业公开的案例图片和施工资料，按风格和地区寻找适合的参考。</p></div><Link to="/materials">查看材料库</Link></header>
    <section className="case-catalog-filters" aria-label="案例筛选"><label><span>搜索案例</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="案例名称、风格或企业" /></label><label><span>风格</span><select value={style} onChange={(event) => setStyle(event.target.value)}>{styles.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>地区</span><select value={city} onChange={(event) => setCity(event.target.value)}>{cities.map((item) => <option key={item}>{item}</option>)}</select></label></section>
    {status === 'loading' ? <section className="case-catalog-empty"><h2>正在加载认证案例</h2><p>请稍候。</p></section> : status === 'error' ? <section className="case-catalog-empty" role="alert"><h2>案例暂时无法加载</h2><p>请刷新页面后重试。</p></section> : cases.length === 0 ? <section className="case-catalog-empty"><h2>暂无匹配案例</h2><p>可以更换风格、地区或搜索关键词。</p></section> : <section className="case-catalog-grid" aria-label="认证企业案例列表">{cases.map((item) => {
      const cover = item.files.find((file) => file.mediaType.startsWith('image/') || /\.bmp$/i.test(file.fileName));
      return <article className="case-catalog-card" key={item.id} onClick={() => openCase(item)}><div className="case-catalog-cover">{cover && assetUrls[cover.id] ? <img src={assetUrls[cover.id]} alt={`${item.title}案例图片`} /> : <div><span>{item.style || '企业案例'}</span><strong>{item.title}</strong></div>}{cover && !assetUrls[cover.id] && <button type="button" onClick={(event) => { event.stopPropagation(); void previewFile(item, cover.id); }}>加载图片</button>}</div><div className="case-catalog-card-body"><div className="case-catalog-card-meta"><span>{item.style || '风格未填写'}</span><span>{item.city || '地区未填写'}</span></div><h2>{item.title}</h2><Link className="case-company-link" to={`/companies/${item.companyId}`} onClick={(event) => event.stopPropagation()}>{item.companyName}</Link><div className="case-catalog-card-data"><span>{item.area == null ? '面积未填写' : `${item.area}㎡`}</span><span>预算 {formatAmount(item.budget)}</span><span>{item.files.length} 份资料</span></div></div></article>;
    })}</section>}
    {detail && <div className="case-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}><section className="case-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="case-detail-title"><header><div><span className="case-catalog-eyebrow">CERTIFIED COMPANY CASE</span><h2 id="case-detail-title">{detail.title}</h2><p><Link className="case-company-link" to={`/companies/${detail.companyId}`}>{detail.companyName}</Link>{detail.city ? ` · ${detail.city}` : ''}</p></div><button type="button" aria-label="关闭案例详情" onClick={() => setDetail(null)}>×</button></header><div className="case-detail-content"><div className="case-detail-specs"><span>风格<strong>{detail.style || '未填写'}</strong></span><span>面积<strong>{detail.area == null ? '未填写' : `${detail.area}㎡`}</strong></span><span>预算<strong>{formatAmount(detail.budget)}</strong></span></div><div className="case-detail-files">{detail.files.length ? detail.files.map((file) => <article key={file.id} className="case-detail-file">{file.mediaType.startsWith('image/') || /\.bmp$/i.test(file.fileName) ? assetUrls[file.id] ? <img src={assetUrls[file.id]} alt={file.fileName} /> : <button type="button" onClick={() => void previewFile(detail, file.id)}>查看图片</button> : assetUrls[file.id] ? <iframe src={assetUrls[file.id]} title={file.fileName} /> : <button type="button" onClick={() => void previewFile(detail, file.id)}>打开 {file.fileName}</button>}<span>{file.fileName}</span></article>) : <p>企业暂未公开案例附件。</p>}</div>{assetError && <p className="case-detail-error" role="alert">{assetError}</p>}<p className="case-detail-note">仅展示平台已认证企业主动发布的案例资料。</p></div></section></div>}
  </main>;
}
