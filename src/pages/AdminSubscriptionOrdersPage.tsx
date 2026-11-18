import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../services/authSession';
import { useAppStore } from '../stores/appStore';
import AdminSidebar from '../components/AdminSidebar';
import AdminTopbar from '../components/AdminTopbar';
import AdminWorkspaceTabs from '../components/AdminWorkspaceTabs';
import './AdminResellersPage.css';
import './AdminSubscriptionOrdersPage.css';

interface Order { id: string; orderNo: string; companyId: string; companyName: string; planCode: string; planName: string; amountCents: number; status: string; paymentChannel: string; createdAt: string; }

export default function AdminSubscriptionOrdersPage() {
  const navigate = useNavigate();
  const signOut = useAppStore((state) => state.signOut);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmingOrder, setConfirmingOrder] = useState<Order | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  async function load() {
    try { setOrders(await apiRequest<Order[]>('/api/v1/admin/subscription/orders')); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : '订阅订单加载失败。'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void Promise.resolve().then(load); }, []);

  useEffect(() => {
    if (!confirmingOrder) return undefined;
    confirmButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyId) setConfirmingOrder(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [confirmingOrder, busyId]);

  async function confirmSelectedOrder() {
    const order = confirmingOrder;
    if (!order) return;
    setBusyId(order.id); setError(''); setNotice('');
    try {
      await apiRequest(`/api/v1/admin/subscription/orders/${order.id}/sandbox-confirm`, { method: 'POST' });
      setConfirmingOrder(null);
      setNotice(`${order.orderNo} 已在沙箱环境确认，企业订阅已激活。`);
      await load();
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '沙箱确认失败。'); }
    finally { setBusyId(''); }
  }

  function logout() { signOut(); navigate('/admin/login', { replace: true }); }

  return <div className="admin-page admin-resellers-page"><AdminSidebar />
    <div className="admin-stage"><AdminTopbar title="订阅订单" onLogout={logout} />
      <main className="admin-reseller-content"><div className="admin-heading"><div><span className="admin-kicker">SUBSCRIPTION ORDERS</span><h1>待处理订单</h1></div><button className="admin-refresh" type="button" onClick={() => { setLoading(true); void load(); }} disabled={loading}>{loading ? '同步中…' : '刷新'}</button></div><AdminWorkspaceTabs group="saas" />
        {error && <div className="admin-error" role="alert">{error}</div>}{notice && <div className="admin-reseller-notice" role="status">{notice}</div>}
        <section className="admin-reseller-list admin-orders-panel"><header><div><span className="admin-kicker">PENDING / SANDBOX</span><h2>等待沙箱确认</h2></div><span>{orders.length} 笔订单</span></header>
          {loading ? <div className="admin-empty">正在加载订单…</div> : !orders.length ? <div className="admin-empty">目前没有待处理订单</div> : <div className="admin-order-rows">{orders.map((order) => <article key={order.id}><div><strong>{order.companyName}</strong><small>{order.orderNo} · {order.planName}（{order.planCode}）</small></div><b>¥{(order.amountCents / 100).toFixed(2)}</b><time>{new Date(order.createdAt).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })}</time><button type="button" disabled={Boolean(busyId)} onClick={() => setConfirmingOrder(order)}>沙箱确认</button></article>)}</div>}
        </section></main>
      {confirmingOrder && <div className="admin-order-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyId) setConfirmingOrder(null); }}>
        <section className="admin-order-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-order-confirm-title" aria-describedby="admin-order-confirm-description">
          <span className="admin-kicker">SANDBOX SETTLEMENT</span>
          <h2 id="admin-order-confirm-title">确认开通企业订阅？</h2>
          <p id="admin-order-confirm-description">确认后将把此订单标记为沙箱已支付，并立即激活企业订阅。此操作不会产生真实扣款。</p>
          <dl><div><dt>企业</dt><dd>{confirmingOrder.companyName}</dd></div><div><dt>订阅套餐</dt><dd>{confirmingOrder.planName}（{confirmingOrder.planCode}）</dd></div><div><dt>订单金额</dt><dd>¥{(confirmingOrder.amountCents / 100).toFixed(2)}</dd></div><div><dt>订单号</dt><dd>{confirmingOrder.orderNo}</dd></div></dl>
          <div className="admin-order-confirm-actions"><button type="button" disabled={Boolean(busyId)} onClick={() => setConfirmingOrder(null)}>取消</button><button ref={confirmButtonRef} className="primary" type="button" disabled={Boolean(busyId)} onClick={() => void confirmSelectedOrder()}>{busyId ? '确认中…' : '确认并开通'}</button></div>
        </section>
      </div>}
    </div></div>;
}
