import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Camera,
  Clock,
  Coins,
  Images,
  LogOut,
  Pencil,
  Ruler,
  Search,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { fetchCreditLedger, type CreditEntry, type CreditLedger as CreditLedgerData } from '../services/credits';
import { computeCreditStats } from '../services/creditStats';
import { findPlan, formatCredits } from '../subscription/catalog';
import { loadUserProfile, saveUserProfile } from '../services/userProfile';
import { compressImageFile, deleteUserShowcase, loadUserShowcases, type UserShowcase } from '../services/showcases';
import { styleCatalog } from '../services/styleCatalog';
import { useAppStore } from '../stores/appStore';
import './ProfilePage.css';

type Section = 'overview' | 'profile' | 'credits' | 'showcases';
type Tab = 'overview' | 'purchase' | 'detail';

function formatTime(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function entryState(entry: CreditEntry): { text: string; spent: boolean; pending?: boolean } {
  if (entry.type === 'hold') return entry.status === 'pending' ? { text: entry.label, spent: true, pending: true } : { text: entry.label, spent: true };
  if (entry.type === 'consume') return { text: `${entry.label}（结算）`, spent: true };
  return { text: entry.label, spent: false };
}

// 侧栏菜单分组：「我的积分」与「会员与订单」合并为「积分与订单」，避免重复入口
type MenuItem = { key: string; label: string; hint?: string };
const MENU_GROUPS: { label: string; items: MenuItem[] }[] = [
  {
    label: '展示管理',
    items: [
      { key: 'overview', label: '我的概览' },
      { key: 'profile', label: '资料与安全' },
      { key: 'showcases', label: '管理作品' },
    ],
  },
  {
    label: '账户与偏好',
    items: [{ key: 'credits', label: '积分与订单', hint: '余额 · 明细 · 购买记录' }],
  },
];

// 账户与安全列表（后端开放前仅展示状态，不提供操作）
function SecurityRows({ email }: { email?: string }) {
  const rows: { label: string; value: string; action?: string }[] = [
    { label: '邮箱账号', value: email || '未绑定' },
    { label: '密码设置', value: '已设置', action: '去修改' },
    { label: '实名认证', value: '未实名', action: '去认证' },
  ];
  return (
    <div className="profile-security">
      {rows.map((row) => (
        <div className="profile-security-row" key={row.label}>
          <span>{row.label}</span>
          <b>{row.value}</b>
          {row.action && (
            <button type="button" className="profile-quiet-button profile-security-action" disabled title="该能力随后端账号体系开放后上线">
              {row.action}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const authSession = useAppStore((state) => state.authSession);
  const signOut = useAppStore((state) => state.signOut);
  const user = authSession?.user;

  const [section, setSection] = useState<Section>('overview');

  // ---- 个人资料 ----
  const storedProfile = useMemo(() => (user ? loadUserProfile(user.id) : null), [user]);
  const [displayName, setDisplayName] = useState(storedProfile?.displayName ?? user?.displayName ?? '');
  const [region, setRegion] = useState(storedProfile?.region ?? '');
  const [bio, setBio] = useState(storedProfile?.bio ?? '');
  const [avatar, setAvatar] = useState(storedProfile?.avatar ?? '');
  const [defaultArea, setDefaultArea] = useState(storedProfile?.defaultArea ?? '');
  const [preferredStyle, setPreferredStyle] = useState(storedProfile?.preferredStyle ?? '');
  const [profileStatus, setProfileStatus] = useState('');
  const [profileError, setProfileError] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement | null>(null);

  // ---- 积分 ----
  const [creditData, setCreditData] = useState<CreditLedgerData | null>(null);
  const [creditError, setCreditError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');

  // ---- 管理作品 ----
  const [showcases, setShowcases] = useState<UserShowcase[]>([]);
  const [showcaseQuery, setShowcaseQuery] = useState('');

  useEffect(() => {
    let active = true;
    void fetchCreditLedger().then((ledger) => { if (active) setCreditData(ledger); }).catch((cause: unknown) => { if (active) setCreditError(cause instanceof Error ? cause.message : '积分信息读取失败。'); });
    setShowcases(loadUserShowcases());
    return () => { active = false; };
  }, []);

  const handleSignOut = () => {
    signOut();
    navigate('/login', { replace: true });
  };

  const pickAvatar = async (file?: File) => {
    if (!file) return;
    setUploadingAvatar(true);
    setProfileError('');
    setProfileStatus('');
    try {
      const dataUrl = await compressImageFile(file);
      setAvatar(dataUrl);
      saveUserProfile(user!.id, { displayName, avatar: dataUrl, region, bio, defaultArea, preferredStyle });
      setProfileStatus('已保存 · 头像已更新。');
    } catch (cause) {
      setProfileError(cause instanceof Error ? cause.message : '头像上传失败。');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const removeAvatar = () => {
    setAvatar('');
    saveUserProfile(user!.id, { displayName, avatar: '', region, bio, defaultArea, preferredStyle });
    setProfileStatus('已保存 · 头像已移除。');
  };

  const saveProfile = () => {
    setProfileError('');
    setProfileStatus('');
    if (!displayName.trim()) { setProfileError('昵称不能为空。'); return; }
    if (defaultArea.trim() && (!Number.isFinite(Number(defaultArea)) || Number(defaultArea) <= 0 || Number(defaultArea) > 2000)) {
      setProfileError('常用面积需为 0 至 2000 ㎡之间的数字。');
      return;
    }
    try {
      saveUserProfile(user!.id, { displayName: displayName.trim(), avatar, region: region.trim(), bio: bio.trim(), defaultArea: defaultArea.trim(), preferredStyle });
      setProfileStatus('已保存 · 修改会同步显示在作品署名与预算试算默认值。');
    } catch (cause) {
      setProfileError(cause instanceof Error ? cause.message : '资料保存失败。');
    }
  };

  const removeShowcase = (id: string) => {
    deleteUserShowcase(id);
    setShowcases(loadUserShowcases());
  };

  const summary = creditData?.summary;
  const entries = useMemo(() => creditData?.entries ?? [], [creditData]);
  const stats = useMemo(() => computeCreditStats(entries), [entries]);
  const maxTaskCost = stats.byTask.length > 0 ? stats.byTask[0][1] : 0;
  const detailEntries = entries.filter((entry) => entry.type !== 'consume');
  const purchaseEntries = entries.filter((entry) => entry.type === 'purchase' || entry.type === 'grant');
  const recentEntries = detailEntries.slice(0, 5);

  const initial = (avatar ? '' : displayName.trim().slice(0, 1) || '设');
  const savedProfile = user ? loadUserProfile(user.id) : null;
  const shownName = savedProfile?.displayName?.trim() || displayName || user?.displayName || '已登录用户';
  const planName = summary ? findPlan((summary.planId as 'free' | 'pro_month' | 'pro_year') || 'free').name : '个人免费版';

  // 资料完整度：头像/昵称/地区/简介/偏好各占 20%
  const completenessItems = [
    { done: Boolean(avatar), label: '头像' },
    { done: Boolean(displayName.trim()), label: '昵称' },
    { done: Boolean(region.trim()), label: '所在地区' },
    { done: Boolean(bio.trim()), label: '个人简介' },
    { done: Boolean(defaultArea.trim() || preferredStyle), label: '装修偏好' },
  ];
  const completeness = Math.round((completenessItems.filter((item) => item.done).length / completenessItems.length) * 100);
  const completenessHints = completenessItems.filter((item) => !item.done).map((item) => item.label);

  const filteredShowcases = showcases.filter((item) => item.title.toLowerCase().includes(showcaseQuery.trim().toLowerCase()));

  // 会员卡：概览与积分页共用
  const heroCard = (
    <section className="profile-hero" aria-label="账户权益">
      <div className="profile-hero-deco" aria-hidden="true"><i /><i /><i /></div>
      <div className="profile-hero-body">
        <span className="profile-hero-plan"><Sparkles size={13} />{planName}</span>
        <div className="profile-hero-balance">
          <span>可用积分</span>
          <strong>{summary ? formatCredits(summary.balance) : '—'}</strong>
        </div>
        <small className="profile-hero-note">积分可用于全屋方案生成、户型分析与局部编辑，长期有效。</small>
      </div>
      <Link className="profile-hero-buy" to="/subscription">购买积分</Link>
    </section>
  );

  const overviewStats = [
    { icon: Coins, label: '累计获得积分', value: `+${formatCredits(stats.totalEarned)}`, tone: 'in' },
    { icon: ArrowDownRight, label: '累计消耗积分', value: `-${formatCredits(stats.consumed)}`, tone: 'out' },
    { icon: Clock, label: '处理中的预扣', value: summary ? formatCredits(summary.pendingHolds) : '0', tone: 'muted' },
    { icon: Images, label: '已发布作品', value: String(showcases.length), tone: 'muted' },
  ];

  return (
    <main className="profile-page">
      <aside className="profile-side" aria-label="个人中心导航">
        <Link className="profile-back" to="/">
          <ArrowLeft size={15} />
          返回首页
        </Link>
        <div className="profile-side-card">
          <span className="profile-avatar">{avatar ? <img src={avatar} alt="用户头像" /> : initial}</span>
          <div className="profile-side-meta">
            <strong>{shownName}</strong>
            <small>{user?.email || '未登录'}</small>
            <em>{user?.accountType === 'business' ? '企业账号' : '个人账号'}</em>
          </div>
          <button type="button" className="profile-side-edit" title="编辑资料" aria-label="编辑资料" onClick={() => setSection('profile')}>
            <Pencil size={13} />
          </button>
        </div>
        <Link className="profile-home-link" to="/inspiration">
          查看我的主页
          <ArrowUpRight size={13} />
        </Link>
        <nav className="profile-menu">
          {MENU_GROUPS.map((group) => (
            <div className="profile-menu-group" key={group.label}>
              <span className="profile-menu-label">{group.label}</span>
              {group.items.map((item) => (
                <button type="button" key={item.key} className={section === item.key ? 'profile-menu-item active' : 'profile-menu-item'} onClick={() => setSection(item.key as Section)}>
                  <span>{item.label}</span>
                  {item.hint && <small>{item.hint}</small>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <button type="button" className="profile-signout" onClick={handleSignOut}>
          <LogOut size={15} />
          退出登录
        </button>
      </aside>

      <section className="profile-content">
        {section === 'overview' && (
          <div className="profile-panel">
            <header className="profile-panel-head">
              <h2>我的概览</h2>
              <p>欢迎回来，{shownName}。这里汇总了你的账户权益与最近动态。</p>
            </header>

            {heroCard}

            <section className="profile-stat-grid profile-stat-grid-4" aria-label="数据概览">
              {overviewStats.map((item) => (
                <div className={`profile-stat tone-${item.tone}`} key={item.label}>
                  <span className="profile-stat-icon"><item.icon size={16} /></span>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </section>

            <section className="profile-quick-cards" aria-label="快捷入口">
              <Link className="profile-quick-card" to="/workspace">
                <span className="profile-quick-icon"><Wand2 size={18} /></span>
                <strong>开始设计</strong>
                <p>上传户型图，AI 生成全屋方案。</p>
                <em>进入工作台 →</em>
              </Link>
              <Link className="profile-quick-card" to="/budget">
                <span className="profile-quick-icon"><Ruler size={18} /></span>
                <strong>预算试算</strong>
                <p>按面积和档位生成前期预算单。</p>
                <em>去试算预算 →</em>
              </Link>
              <Link className="profile-quick-card" to="/inspiration">
                <span className="profile-quick-icon"><Images size={18} /></span>
                <strong>发布作品</strong>
                <p>把装修成果分享到灵感广场。</p>
                <em>去发布 →</em>
              </Link>
            </section>

            <section className="profile-recent" aria-label="最近动态">
              <div className="profile-recent-head">
                <h3>最近动态</h3>
                <button type="button" className="profile-recent-more" onClick={() => { setSection('credits'); setTab('detail'); }}>
                  查看全部
                  <ArrowUpRight size={13} />
                </button>
              </div>
              {recentEntries.length === 0 ? (
                <p className="profile-recent-empty">还没有积分变动记录。去工作台生成第一套方案，或购买积分开始使用。</p>
              ) : (
                <ul className="profile-recent-list">
                  {recentEntries.map((entry) => {
                    const state = entryState(entry);
                    const positive = entry.delta > 0;
                    return (
                      <li className="profile-recent-item" key={entry.id}>
                        <span className={`profile-recent-dot ${positive ? 'in' : 'out'}`} aria-hidden="true" />
                        <div className="profile-recent-copy">
                          <strong>{state.text}{state.pending ? ' · 处理中' : ''}</strong>
                          <small>{formatTime(entry.at)}</small>
                        </div>
                        <b className={positive ? 'in' : 'out'}>{positive ? '+' : ''}{formatCredits(entry.delta)}</b>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}

        {section === 'profile' && (
          <div className="profile-panel">
            <header className="profile-panel-head">
              <h2>资料与安全</h2>
              <p>让你的个人信息清晰、完整，保持账户安全。</p>
            </header>

            <div className="profile-block">
              <div className="profile-block-head">
                <h3>基本资料</h3>
                <p>设置你的头像、昵称和个人简介。</p>
              </div>
              <div className="profile-block-body">
                <div className="profile-avatar-row">
                  <span className="profile-avatar profile-avatar-lg">{avatar ? <img src={avatar} alt="用户头像" /> : initial}</span>
                  <div className="profile-avatar-actions">
                    <button type="button" className="profile-primary-button" disabled={uploadingAvatar} onClick={() => avatarFileRef.current?.click()}>{uploadingAvatar ? '图片处理中…' : '更换头像'}</button>
                    {avatar && <button type="button" className="profile-quiet-button" onClick={removeAvatar}>移除头像</button>}
                    <input ref={avatarFileRef} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void pickAvatar(file); }} />
                    <small><Camera size={12} /> 支持 JPG / PNG，会自动压缩存储</small>
                  </div>
                  <div className="profile-completeness">
                    <span>资料完整度 <strong>{completeness}%</strong></span>
                    <span className="profile-completeness-bar"><i style={{ width: `${completeness}%` }} /></span>
                    <small>{completeness < 100 ? `还差：${completenessHints.join('、')}` : '资料已完善'}</small>
                  </div>
                </div>
                <div className="profile-basic-grid">
                  <div className="profile-basic-col">
                    <label className="profile-field">
                      <span>昵称 <i className="profile-required">*</i></span>
                      <div className="profile-input-counter">
                        <input value={displayName} maxLength={30} onChange={(event) => setDisplayName(event.target.value)} placeholder="展示在你的作品署名中" />
                        <b>{displayName.length} / 30</b>
                      </div>
                    </label>
                    <label className="profile-field">
                      <span>所在地区</span>
                      <input value={region} maxLength={40} onChange={(event) => setRegion(event.target.value)} placeholder="例如：上海" />
                    </label>
                  </div>
                  <label className="profile-field">
                    <span>个人简介</span>
                    <div className="profile-input-counter profile-input-counter-area profile-bio-field">
                      <textarea value={bio} maxLength={200} rows={5} onChange={(event) => setBio(event.target.value)} placeholder="介绍一下你的设计方向或装修偏好（选填）" />
                      <b>{bio.length} / 200</b>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="profile-block">
              <div className="profile-block-head">
                <h3>装修偏好</h3>
                <p>保存后自动作为预算试算的默认值。</p>
              </div>
              <div className="profile-block-body">
                <div className="profile-form-grid">
                  <label className="profile-field">
                    <span>常用面积 <small>选填</small></span>
                    <div className="profile-input-unit">
                      <input type="number" min="1" max="2000" step="1" value={defaultArea} onChange={(event) => setDefaultArea(event.target.value)} placeholder="例如 100" />
                      <b>㎡</b>
                    </div>
                  </label>
                  <label className="profile-field">
                    <span>偏好风格</span>
                    <select value={preferredStyle} onChange={(event) => setPreferredStyle(event.target.value)}>
                      <option value="">未选择</option>
                      {styleCatalog.map((style) => <option key={style.key} value={style.key}>{style.name}</option>)}
                    </select>
                  </label>
                </div>
              </div>
            </div>

            <div className="profile-block">
              <div className="profile-block-head">
                <h3>账户与安全</h3>
                <p>管理登录方式与身份验证。</p>
              </div>
              <div className="profile-block-body">
                <SecurityRows email={user?.email} />
              </div>
            </div>

            <footer className="profile-save-bar">
              <span>{profileError ? <b className="profile-save-error">{profileError}</b> : profileStatus || '修改完成后保存，资料安全设置单独生效。'}</span>
              <button type="button" className="profile-primary-button" onClick={saveProfile}>保存</button>
            </footer>
          </div>
        )}

        {section === 'credits' && (
          <div className="profile-panel">
            <header className="profile-panel-head">
              <h2>积分与订单</h2>
              <p>查看积分余额、获取记录与消耗明细。</p>
            </header>

            {creditError && <div className="profile-error" role="alert">{creditError}</div>}
            {heroCard}

            <section className="profile-ledger" aria-label="积分记录">
              <div className="profile-ledger-heading">
                <h3>积分记录</h3>
                <div className="profile-tabs" role="tablist">
                  <button type="button" role="tab" aria-selected={tab === 'overview'} className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>积分概览</button>
                  <button type="button" role="tab" aria-selected={tab === 'purchase'} className={tab === 'purchase' ? 'active' : ''} onClick={() => setTab('purchase')}>获取记录</button>
                  <button type="button" role="tab" aria-selected={tab === 'detail'} className={tab === 'detail' ? 'active' : ''} onClick={() => setTab('detail')}>消耗明细</button>
                </div>
              </div>

              {!creditData ? (
                <p className="profile-ledger-empty">正在读取积分记录…</p>
              ) : tab === 'overview' ? (
                <div className="profile-overview">
                  <div className="profile-stat-grid">
                    <div className="profile-stat">
                      <span>累计获得</span>
                      <strong>+{formatCredits(stats.totalEarned)}</strong>
                    </div>
                    <div className="profile-stat">
                      <span>累计消耗</span>
                      <strong>-{formatCredits(stats.consumed)}</strong>
                    </div>
                    <div className="profile-stat">
                      <span>处理中</span>
                      <strong>{summary ? formatCredits(summary.pendingHolds) : '0'}</strong>
                    </div>
                  </div>
                  <div className="profile-task-breakdown">
                    <h4>各任务消耗</h4>
                    {stats.byTask.length === 0 ? (
                      <p className="profile-ledger-empty">还没有消耗记录，去工作台生成第一套方案吧。</p>
                    ) : (
                      <ul>
                        {stats.byTask.map(([label, cost]) => (
                          <li key={label}>
                            <span className="profile-task-label">{label}</span>
                            <span className="profile-task-bar"><i style={{ width: `${maxTaskCost > 0 ? Math.max(6, (cost / maxTaskCost) * 100) : 0}%` }} /></span>
                            <strong>{formatCredits(cost)}</strong>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : tab === 'purchase' ? (
                purchaseEntries.length === 0 ? (
                  <p className="profile-ledger-empty">还没有获取记录。可以在订阅页购买积分包，或去工作台完成首次生成。</p>
                ) : (
                  <div className="profile-table" role="table" aria-label="积分获取记录">
                    <div className="profile-table-head profile-table-head-wide" role="row">
                      <span role="columnheader">项目名称</span>
                      <span role="columnheader">积分</span>
                      <span role="columnheader">时间</span>
                      <span role="columnheader">当时余额</span>
                    </div>
                    {purchaseEntries.map((entry) => (
                      <div className="profile-table-row profile-table-row-wide" role="row" key={entry.id}>
                        <div className="profile-table-request" role="cell"><strong>{entry.label}</strong></div>
                        <span className="profile-table-delta in" role="cell">+{formatCredits(entry.delta)}</span>
                        <span className="profile-table-time" role="cell">{formatTime(entry.at)}</span>
                        <span className="profile-table-balance" role="cell">{formatCredits(entry.balanceAfter)}</span>
                      </div>
                    ))}
                  </div>
                )
              ) : detailEntries.length === 0 ? (
                <p className="profile-ledger-empty">还没有积分记录，去工作台生成第一套方案吧。</p>
              ) : (
                <div className="profile-table" role="table" aria-label="积分消耗明细">
                  <div className="profile-table-head" role="row">
                    <span role="columnheader">请求与时间</span>
                    <span role="columnheader">积分变动</span>
                    <span role="columnheader">余额</span>
                  </div>
                  {detailEntries.map((entry) => {
                    const state = entryState(entry);
                    const positive = entry.delta > 0;
                    return (
                      <div className="profile-table-row" role="row" key={entry.id}>
                        <div className="profile-table-request" role="cell">
                          <strong>{state.text}{state.pending ? ' · 处理中' : ''}</strong>
                          <small>{formatTime(entry.at)}</small>
                        </div>
                        <span className={`profile-table-delta ${positive ? 'in' : 'out'}`} role="cell">
                          {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                          {positive ? '+' : ''}{formatCredits(entry.delta)}
                        </span>
                        <span className="profile-table-balance" role="cell">{formatCredits(entry.balanceAfter)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {section === 'showcases' && (
          <div className="profile-panel">
            <header className="profile-panel-head">
              <h2>管理作品</h2>
              <p>集中查看已发布到灵感广场的作品，管理你的作品展示。</p>
            </header>
            <div className="profile-showcase-toolbar">
              <div className="profile-search">
                <Search size={14} />
                <input value={showcaseQuery} onChange={(event) => setShowcaseQuery(event.target.value)} placeholder="搜索标题" aria-label="搜索作品标题" />
              </div>
              <Link className="profile-primary-button profile-create-link" to="/inspiration">创建作品</Link>
            </div>
            {showcases.length === 0 ? (
              <p className="profile-ledger-empty">还没有发布过作品。去灵感广场上传你的装修成果图吧。</p>
            ) : filteredShowcases.length === 0 ? (
              <p className="profile-ledger-empty">没有匹配「{showcaseQuery}」的作品。</p>
            ) : (
              <div className="profile-showcase-grid">
                {filteredShowcases.map((item) => (
                  <article className="profile-showcase-card" key={item.id}>
                    <img src={item.imageDataUrl} alt={item.title} loading="lazy" />
                    <div className="profile-showcase-copy">
                      <strong>{item.title}</strong>
                      <small>{item.style} · {formatTime(item.createdAt)}</small>
                      {item.description && <p>{item.description}</p>}
                    </div>
                    <button type="button" className="profile-showcase-delete" onClick={() => removeShowcase(item.id)} aria-label={`删除 ${item.title}`}>
                      <Trash2 size={14} />
                      删除
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
