import { useState } from 'react';
import { motion } from 'framer-motion';
import './BusinessPage.css';

const tabs = [
  { key: 'overview', label: '企业概览' },
  { key: 'cases', label: '案例管理' },
  { key: 'materials', label: '材料报价' },
  { key: 'workers', label: '工时报价' },
  { key: 'certification', label: '认证中心' },
] as const;

const caseItems = [
  { id: 1, title: '现代简约三居室', area: '120m²', style: '现代简约', budget: '18万', status: '已发布' },
  { id: 2, title: '新中式别墅', area: '280m²', style: '新中式', budget: '65万', status: '已发布' },
  { id: 3, title: '北欧小户型', area: '65m²', style: '北欧极简', budget: '8万', status: '草稿' },
  { id: 4, title: '法式奶油风', area: '95m²', style: '奶油法式', budget: '15万', status: '已发布' },
];

const materials = [
  { id: 1, name: '马可波罗瓷砖', spec: '800×800mm', unit: '片', price: 128, category: '瓷砖', updatedAt: '2026-10-20' },
  { id: 2, name: '多乐士乳胶漆', spec: '5L/桶', unit: '桶', price: 458, category: '涂料', updatedAt: '2026-10-18' },
  { id: 3, name: '圣象实木地板', spec: '910×127×15mm', unit: 'm²', price: 328, category: '地板', updatedAt: '2026-10-15' },
  { id: 4, name: '欧派整体橱柜', spec: '定制', unit: '延米', price: 2980, category: '橱柜', updatedAt: '2026-10-22' },
  { id: 5, name: 'TOTO智能马桶', spec: '标准款', unit: '个', price: 3680, category: '卫浴', updatedAt: '2026-10-19' },
];

const workers = [
  { id: 1, type: '水电工', unit: '天', price: 450, experience: '5年以上', area: '上海' },
  { id: 2, type: '泥瓦工', unit: '天', price: 400, experience: '3年以上', area: '上海' },
  { id: 3, type: '木工', unit: '天', price: 500, experience: '5年以上', area: '上海' },
  { id: 4, type: '油漆工', unit: '天', price: 380, experience: '3年以上', area: '上海' },
  { id: 5, type: '设计师', unit: 'm²', price: 80, experience: '8年以上', area: '上海' },
];

export default function BusinessPage() {
  const [activeTab, setActiveTab] = useState<typeof tabs[number]['key']>('overview');
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [newMaterial, setNewMaterial] = useState({ name: '', spec: '', unit: '', price: '', category: '瓷砖' });

  const [certStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');

  return (
    <div className="business-page">
      {/* Business Header */}
      <div className="business-header">
        <div className="business-header-content">
          <div className="business-avatar">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <div className="business-info">
            <h1>美家装饰设计有限公司</h1>
            <div className="business-meta">
              <span className="meta-tag">上海</span>
              <span className="meta-tag">全案设计</span>
              <span className={`cert-badge ${certStatus}`}>
                {certStatus === 'pending' && '认证审核中'}
                {certStatus === 'approved' && '已认证'}
                {certStatus === 'rejected' && '认证被拒'}
              </span>
            </div>
          </div>
        </div>
        <div className="business-stats">
          <div className="bstat">
            <span className="bstat-num">156</span>
            <span className="bstat-label">案例作品</span>
          </div>
          <div className="bstat">
            <span className="bstat-num">4.8</span>
            <span className="bstat-label">综合评分</span>
          </div>
          <div className="bstat">
            <span className="bstat-num">326</span>
            <span className="bstat-label">客户评价</span>
          </div>
          <div className="bstat">
            <span className="bstat-num">12年</span>
            <span className="bstat-label">从业经验</span>
          </div>
        </div>
      </div>

      {/* Business Navigation */}
      <div className="business-nav">
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`business-nav-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="business-content">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <motion.div
            className="overview-content"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="overview-grid">
              <div className="overview-card">
                <h3>企业简介</h3>
                <p>
                  美家装饰设计有限公司成立于2014年，专注为中高端住宅提供全案设计与施工服务。
                  公司拥有专业设计团队30余人，施工人员200余人，累计服务超过1000个家庭。
                  以"品质筑家，设计生活"为理念，致力于为客户打造舒适、美观、实用的居住空间。
                </p>
              </div>
              <div className="overview-card">
                <h3>服务范围</h3>
                <div className="service-tags">
                  <span>全案设计</span>
                  <span>软装搭配</span>
                  <span>施工监理</span>
                  <span>材料代购</span>
                  <span>售后维护</span>
                </div>
              </div>
              <div className="overview-card">
                <h3>近期动态</h3>
                <div className="activity-list">
                  <div className="activity-item">
                    <span className="activity-dot"></span>
                    <span>新案例「现代简约三居室」已发布</span>
                    <span className="activity-time">2天前</span>
                  </div>
                  <div className="activity-item">
                    <span className="activity-dot"></span>
                    <span>材料价格已更新</span>
                    <span className="activity-time">5天前</span>
                  </div>
                  <div className="activity-item">
                    <span className="activity-dot"></span>
                    <span>完成「新中式别墅」项目交付</span>
                    <span className="activity-time">1周前</span>
                  </div>
                </div>
              </div>
              <div className="overview-card">
                <h3>快捷操作</h3>
                <div className="quick-actions">
                  <button className="quick-action">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                    发布案例
                  </button>
                  <button className="quick-action">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    上传材料报价
                  </button>
                  <button className="quick-action">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="23 7 16 12 23 17 23 7"/>
                      <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                    </svg>
                    生成推广短片
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Cases Tab */}
        {activeTab === 'cases' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="tab-header">
              <h2>案例管理</h2>
              <button className="btn-add">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
                新增案例
              </button>
            </div>
            <div className="cases-table">
              <div className="table-header">
                <span>案例名称</span>
                <span>面积</span>
                <span>风格</span>
                <span>预算</span>
                <span>状态</span>
                <span>操作</span>
              </div>
              {caseItems.map(item => (
                <div key={item.id} className="table-row">
                  <span className="cell-title">{item.title}</span>
                  <span>{item.area}</span>
                  <span>{item.style}</span>
                  <span>{item.budget}</span>
                  <span>
                    <span className={`status-badge ${item.status === '已发布' ? 'published' : 'draft'}`}>
                      {item.status}
                    </span>
                  </span>
                  <span className="cell-actions">
                    <button className="btn-xs">编辑</button>
                    <button className="btn-xs danger">删除</button>
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Materials Tab */}
        {activeTab === 'materials' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="tab-header">
              <h2>材料报价</h2>
              <button className="btn-add" onClick={() => setShowAddMaterial(!showAddMaterial)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
                添加材料
              </button>
            </div>

            {showAddMaterial && (
              <motion.div
                className="add-material-form"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <div className="form-row-3">
                  <input placeholder="材料名称" value={newMaterial.name} onChange={e => setNewMaterial({...newMaterial, name: e.target.value})} />
                  <input placeholder="规格" value={newMaterial.spec} onChange={e => setNewMaterial({...newMaterial, spec: e.target.value})} />
                  <input placeholder="单位" value={newMaterial.unit} onChange={e => setNewMaterial({...newMaterial, unit: e.target.value})} />
                </div>
                <div className="form-row-3">
                  <input placeholder="价格 (元)" type="number" value={newMaterial.price} onChange={e => setNewMaterial({...newMaterial, price: e.target.value})} />
                  <select value={newMaterial.category} onChange={e => setNewMaterial({...newMaterial, category: e.target.value})}>
                    <option>瓷砖</option><option>涂料</option><option>地板</option><option>橱柜</option><option>卫浴</option><option>其他</option>
                  </select>
                  <button className="btn-save">保存材料</button>
                </div>
              </motion.div>
            )}

            <div className="cases-table">
              <div className="table-header materials-header">
                <span>材料名称</span>
                <span>规格</span>
                <span>单位</span>
                <span>价格</span>
                <span>分类</span>
                <span>更新时间</span>
              </div>
              {materials.map(item => (
                <div key={item.id} className="table-row materials-row">
                  <span className="cell-title">{item.name}</span>
                  <span>{item.spec}</span>
                  <span>{item.unit}</span>
                  <span className="price-cell">¥{item.price}</span>
                  <span>
                    <span className="category-tag">{item.category}</span>
                  </span>
                  <span>{item.updatedAt}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Workers Tab */}
        {activeTab === 'workers' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="tab-header">
              <h2>工时报价</h2>
              <button className="btn-add">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
                添加工种
              </button>
            </div>
            <div className="cases-table">
              <div className="table-header workers-header">
                <span>工种</span>
                <span>计价单位</span>
                <span>单价</span>
                <span>经验要求</span>
                <span>服务地区</span>
                <span>操作</span>
              </div>
              {workers.map(item => (
                <div key={item.id} className="table-row workers-row">
                  <span className="cell-title">{item.type}</span>
                  <span>{item.unit}</span>
                  <span className="price-cell">¥{item.price}/{item.unit}</span>
                  <span>{item.experience}</span>
                  <span>{item.area}</span>
                  <span className="cell-actions">
                    <button className="btn-xs">编辑</button>
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Certification Tab */}
        {activeTab === 'certification' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="tab-header">
              <h2>认证中心</h2>
            </div>
            <div className="cert-content">
              <div className="cert-status-card">
                <div className="cert-icon pending">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                </div>
                <h3>认证审核中</h3>
                <p>您的企业认证资料已提交，管理员将在1-3个工作日内完成审核</p>
                <div className="cert-timeline">
                  <div className="cert-step completed">
                    <div className="step-dot"></div>
                    <span>提交资料</span>
                  </div>
                  <div className="cert-step active">
                    <div className="step-dot"></div>
                    <span>资料审核</span>
                  </div>
                  <div className="cert-step">
                    <div className="step-dot"></div>
                    <span>认证完成</span>
                  </div>
                </div>
              </div>

              <div className="cert-documents">
                <h4>已提交资料</h4>
                <div className="document-list">
                  <div className="document-item">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <span>营业执照</span>
                    <span className="doc-status uploaded">已上传</span>
                  </div>
                  <div className="document-item">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <span>法人身份证</span>
                    <span className="doc-status uploaded">已上传</span>
                  </div>
                  <div className="document-item">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <span>资质证书</span>
                    <span className="doc-status uploaded">已上传</span>
                  </div>
                  <div className="document-item">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <span>施工案例</span>
                    <span className="doc-status uploaded">已上传</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
