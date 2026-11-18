import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  confirmCertificationPayment,
  downloadCertificationPaymentProof,
  loadAdminCertificationPaymentOrders,
  loadCertificationFeeConfig,
  rejectCertificationPaymentProof,
  updateCertificationFee,
  type CertificationFeeConfig,
  type CertificationPaymentOrder,
} from '../services/certificationBilling';
import './AdminPage.css';
import './AdminCertificationPaymentsPage.css';

function money(cents: number) { return `¥${(cents / 100).toFixed(2)}`; }
function dateTime(value: string | null) { return value ? new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }

export function CertificationPaymentsPanel() {
  const [config, setConfig] = useState<CertificationFeeConfig | null>(null);
  const [orders, setOrders] = useState<CertificationPaymentOrder[]>([]);
  const [fee, setFee] = useState('299.00');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reviewOrder, setReviewOrder] = useState<CertificationPaymentOrder | null>(null);
  const [paymentReference, setPaymentReference] = useState('');
  const [confirmationNote, setConfirmationNote] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [proofLoading, setProofLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [nextConfig, nextOrders] = await Promise.all([loadCertificationFeeConfig(), loadAdminCertificationPaymentOrders()]);
      setConfig(nextConfig); setFee((nextConfig.amountCents / 100).toFixed(2)); setOrders(nextOrders);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '认证收费数据加载失败。'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const pending = useMemo(() => orders.filter((order) => order.status === 'PENDING'), [orders]);
  const readyToReview = useMemo(() => pending.filter((order) => order.proofStatus === 'SUBMITTED'), [pending]);
  const rejected = useMemo(() => pending.filter((order) => order.proofStatus === 'REJECTED'), [pending]);
  const history = useMemo(() => orders.filter((order) => order.status !== 'PENDING').slice(0, 50), [orders]);

  async function saveFee(event: FormEvent) {
    event.preventDefault();
    const yuan = Number(fee);
    const cents = Math.round(yuan * 100);
    if (!Number.isFinite(yuan) || yuan < 0 || cents > 100_000_000) { setError('认证费用必须是 0 到 100 万元之间的金额。'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const saved = await updateCertificationFee(cents);
      setConfig(saved); setFee((saved.amountCents / 100).toFixed(2)); setNotice(`认证费用已调整为 ${money(saved.amountCents)}，仅影响之后创建的新订单。`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '认证费用保存失败。'); }
    finally { setSaving(false); }
  }

  useEffect(() => () => { if (proofUrl) URL.revokeObjectURL(proofUrl); }, [proofUrl]);

  async function openReview(order: CertificationPaymentOrder) {
    if (!order.proofAssetId || order.proofStatus !== 'SUBMITTED') return;
    setReviewOrder(order); setPaymentReference(''); setConfirmationNote(''); setRejectionReason(''); setProofLoading(true); setError('');
    try {
      const blob = await downloadCertificationPaymentProof(order.id);
      if (proofUrl) URL.revokeObjectURL(proofUrl);
      setProofUrl(URL.createObjectURL(blob));
    } catch (reason) { setError(reason instanceof Error ? reason.message : '付款凭证读取失败。'); setReviewOrder(null); }
    finally { setProofLoading(false); }
  }

  function closeReview() { setReviewOrder(null); setProofUrl(''); setPaymentReference(''); setConfirmationNote(''); setRejectionReason(''); }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!reviewOrder || !paymentReference.trim()) return;
    const order = reviewOrder;
    setBusyId(order.id); setError(''); setNotice('');
    try {
      const saved = await confirmCertificationPayment(order.id, paymentReference.trim(), confirmationNote.trim());
      setOrders((current) => current.map((item) => item.id === saved.id ? saved : item));
      setNotice(`${order.companyName} 的认证费已确认，企业现在可以提交认证资料。`);
      closeReview();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '收款确认失败。'); }
    finally { setBusyId(''); }
  }

  async function rejectProof() {
    if (!reviewOrder || !rejectionReason.trim()) return;
    const order = reviewOrder;
    setBusyId(order.id); setError(''); setNotice('');
    try {
      const saved = await rejectCertificationPaymentProof(order.id, rejectionReason.trim());
      setOrders((current) => current.map((item) => item.id === saved.id ? saved : item));
      setNotice(`${order.companyName} 的付款凭证已驳回，企业会收到原因并可重新上传。`);
      closeReview();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '付款凭证驳回失败。'); }
    finally { setBusyId(''); }
  }

  return <div className="certification-payments-page">
      <div className="certification-billing-toolbar"><div><span className="admin-kicker">CERTIFICATION / BILLING</span><h2>认证收费与收款</h2><p>认证申请、费用配置和付款凭证在同一处处理。</p></div><button className="admin-refresh" type="button" onClick={() => void load()} disabled={loading}>{loading ? '同步中' : '刷新收费数据'}</button></div>
      {error && <div className="admin-error" role="alert">{error}</div>}{notice && <div className="certification-payment-notice" role="status">{notice}</div>}
      <section className="certification-payment-summary">
        <form onSubmit={saveFee}><span className="admin-kicker">FEE CONFIGURATION</span><h2>认证费用</h2><p>当前采用管理员线下确认，不会调用微信或支付宝。</p><label><span>每家企业认证费</span><div><i>¥</i><input type="number" min="0" max="1000000" step="0.01" value={fee} onChange={(event) => setFee(event.target.value)} /></div></label><button type="submit" disabled={saving}>{saving ? '保存中' : '保存费用'}</button><small>更新时间：{dateTime(config?.updatedAt || null)}</small></form>
        <div><span className="admin-kicker">PAYMENT QUEUE</span><strong>{readyToReview.length}</strong><h2>笔凭证待核对</h2><p>{rejected.length > 0 ? `${rejected.length} 笔已驳回，等待企业重新提交。` : pending.length - readyToReview.length > 0 ? `另有 ${pending.length - readyToReview.length} 笔等待企业上传凭证。` : '核对后，企业才可以首次提交认证资料。'}</p></div>
      </section>
      <section className="certification-payment-panel"><header><div><span className="admin-kicker">PENDING PAYMENTS</span><h2>待确认收款</h2></div><span>{pending.length} 笔</span></header>
        {loading ? <div className="admin-empty">正在读取认证缴费单…</div> : !pending.length ? <div className="admin-empty">目前没有等待确认的认证缴费单。</div> : <div className="certification-payment-rows">{pending.map((order) => { const submitted = order.proofStatus === 'SUBMITTED'; const rejectedProof = order.proofStatus === 'REJECTED'; return <article key={order.id}><div><strong>{order.companyName}</strong><small>{order.orderNo}{rejectedProof && order.proofRejectionReason ? ` · ${order.proofRejectionReason}` : ''}</small></div><b>{money(order.amountCents)}</b><time>{dateTime(order.proofReviewedAt || order.proofSubmittedAt || order.createdAt)}</time><span className={`certification-proof-status ${submitted ? 'ready' : rejectedProof ? 'rejected' : 'waiting'}`}>{submitted ? '凭证待核对' : rejectedProof ? '已驳回，待重传' : '等待凭证'}</span><button type="button" onClick={() => void openReview(order)} disabled={!submitted || busyId === order.id}>{submitted ? '核对凭证' : '暂不可确认'}</button></article>; })}</div>}
      </section>
      <section className="certification-payment-panel"><header><div><span className="admin-kicker">PAYMENT HISTORY</span><h2>最近处理记录</h2></div><span>{history.length} 笔</span></header>
        {!history.length ? <div className="admin-empty">暂无已处理认证缴费单。</div> : <div className="certification-payment-history">{history.map((order) => <div key={order.id}><span><strong>{order.companyName}</strong><small>{order.orderNo} · {order.paymentChannel === 'LEGACY' ? '历史免缴' : order.paymentReference || order.note || '线下收款'}</small></span><b>{money(order.amountCents)}</b><em>{dateTime(order.paidAt)}</em><i>{order.status === 'PAID' ? '已确认' : '已取消'}</i></div>)}</div>}
      </section>
    {reviewOrder && <div className="certification-proof-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeReview(); }}><section className="certification-proof-dialog" role="dialog" aria-modal="true" aria-label={`核对 ${reviewOrder.companyName} 的付款凭证`}><header><div><span className="admin-kicker">PAYMENT VERIFICATION</span><h2>核对付款凭证</h2></div><button type="button" onClick={closeReview} aria-label="关闭凭证核对">×</button></header><div className="certification-proof-dialog-body"><div className="certification-proof-preview">{proofLoading ? <span>正在读取凭证…</span> : proofUrl ? <img src={proofUrl} alt={`${reviewOrder.companyName}付款凭证`} /> : <span>凭证暂时无法显示</span>}</div><form onSubmit={confirm}><dl><div><dt>企业</dt><dd>{reviewOrder.companyName}</dd></div><div><dt>订单号</dt><dd>{reviewOrder.orderNo}</dd></div><div><dt>金额</dt><dd>{money(reviewOrder.amountCents)}</dd></div><div><dt>付款说明</dt><dd>{reviewOrder.payerNote || '未填写'}</dd></div></dl><label>付款流水号或收款标识<input maxLength={120} value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="确认到账时填写，例如 BANK-20261112-001" /></label><label>确认备注<textarea maxLength={500} value={confirmationNote} onChange={(event) => setConfirmationNote(event.target.value)} placeholder="确认到账时可记录核对结果" /></label><label className="certification-proof-rejection">驳回原因<textarea maxLength={500} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} placeholder="驳回时必填，例如图片模糊、金额不符或流水无法核实" /></label><div><button type="button" onClick={closeReview}>暂不处理</button><button type="button" className="certification-proof-reject" onClick={() => void rejectProof()} disabled={!rejectionReason.trim() || busyId === reviewOrder.id || proofLoading}>{busyId === reviewOrder.id ? '处理中…' : '驳回凭证'}</button><button type="submit" disabled={!paymentReference.trim() || busyId === reviewOrder.id || proofLoading}>{busyId === reviewOrder.id ? '确认中…' : '确认已收款'}</button></div></form></div></section></div>}
  </div>;
}
