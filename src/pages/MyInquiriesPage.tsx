import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { loadMyInquiries, type CompanyInquiry, type InquiryStatus } from '../services/inquiries';
import './MyInquiriesPage.css';

const statusLabels: Record<InquiryStatus, string> = {
  NEW: '等待企业处理',
  CONTACTED: '企业已联系',
  QUOTED: '企业已报价',
  CLOSED: '已完成',
};

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未知' : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function MyInquiriesPage() {
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get('focus');
  const [items, setItems] = useState<CompanyInquiry[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [focusedId, setFocusedId] = useState('');

  const refresh = () => {
    setState('loading');
    setError('');
    void loadMyInquiries().then((result) => { setItems(result); setState('ready'); }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : '咨询记录暂时无法加载。');
      setState('error');
    });
  };

  useEffect(() => {
    let active = true;
    void loadMyInquiries().then((result) => { if (active) { setItems(result); setState('ready'); } }).catch((reason: unknown) => {
      if (!active) return;
      setError(reason instanceof Error ? reason.message : '咨询记录暂时无法加载。');
      setState('error');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (state !== 'ready' || !focusId || !items.some((item) => item.id === focusId)) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`inquiry-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFocusedId(focusId);
      window.setTimeout(() => setFocusedId(''), 2200);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [focusId, items, state]);

  return <main className="my-inquiries-page">
    <header className="my-inquiries-header"><div><span>CONSULTATION HISTORY</span><h1>我的咨询</h1></div><button type="button" onClick={refresh} disabled={state === 'loading'}>{state === 'loading' ? '同步中…' : '刷新记录'}</button></header>
    {error && <p className="my-inquiries-error" role="alert">{error}</p>}
    {state === 'loading' ? <section className="my-inquiries-empty"><strong>正在读取咨询记录</strong><span>请稍候。</span></section> : state === 'ready' && items.length === 0 ? <section className="my-inquiries-empty"><strong>还没有咨询记录</strong><span>在材料详情中咨询企业后，往来记录会保存在这里。</span><Link to="/materials">浏览材料</Link></section> : <section className="my-inquiries-list" aria-label="咨询历史记录">{items.map((item) => <article className={`my-inquiry ${focusedId === item.id ? 'focused' : ''}`} id={`inquiry-${item.id}`} key={item.id}>
      <header className="my-inquiry-heading"><div><span>咨询材料</span><h2>{item.materialName || '材料报价'}</h2></div><span className={`my-inquiry-status ${item.status.toLowerCase()}`}>{statusLabels[item.status]}</span></header>
      <div className="my-inquiry-contact"><span>{item.contactName}</span><a href={`${item.contactInfo.includes('@') ? 'mailto:' : 'tel:'}${item.contactInfo}`}>{item.contactInfo}</a><time>{dateLabel(item.createdAt)}</time></div>
      <div className="my-inquiry-message"><span>我的咨询</span><p>{item.message}</p></div>
      <ol className="my-inquiry-timeline">{item.events.map((event) => <li className={event.eventType === 'REPLY' ? 'company-event' : ''} key={event.id}>
        <span className="my-inquiry-dot" />
        <div><strong>{event.eventType === 'CREATED' ? '已提交咨询' : event.eventType === 'STATUS_CHANGED' ? statusLabels[event.status || 'NEW'] : '企业回复'}</strong><time>{dateLabel(event.createdAt)}</time>{event.content && <p>{event.content}</p>}</div>
      </li>)}</ol>
    </article>)}</section>}
  </main>;
}
