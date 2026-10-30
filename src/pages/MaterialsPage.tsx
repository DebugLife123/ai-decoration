import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { localWorkspaceDataAdapter } from '../services/localDataAdapter';
import './MaterialsPage.css';

export default function MaterialsPage() {
  const projects = useAppStore((state) => state.projects);
  const toggleProjectMaterial = useAppStore((state) => state.toggleProjectMaterial);
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const materials = localWorkspaceDataAdapter.loadMaterials();
  const categories = ['全部', ...new Set(materials.map((material) => material.category).filter(Boolean))];
  const visibleMaterials = useMemo(() => materials.filter((material) => {
    const matchesQuery = `${material.name} ${material.spec} ${material.region}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesQuery && (category === '全部' || material.category === category);
  }), [materials, query, category]);
  const selectedProject = projects.find((project) => project.id === projectId);

  return <main className="materials-page">
    <header className="materials-header"><div><span className="materials-eyebrow">MATERIAL LIBRARY</span><h1>材料库</h1><p>浏览已录入的材料报价，并将选中的材料加入设计项目。</p></div><Link to="/projects">我的项目</Link></header>
    <div className="materials-toolbar"><label className="materials-search"><span>搜索材料</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名称、规格或地区" /></label><label className="materials-project-select"><span>关联到项目</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)} disabled={!projects.length}><option value="">选择项目</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label></div>
    <nav className="materials-filters" aria-label="材料分类">{categories.map((item) => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</nav>
    {!projects.length && <div className="materials-notice">先创建一个项目，之后可以把材料加入项目清单。 <Link to="/workspace">创建项目</Link></div>}
    {materials.length === 0 ? <section className="materials-empty"><h2>当前没有已录入的材料</h2><p>材料报价由企业端手动录入。你可以先继续创建和编辑设计项目，不需要等待材料数据。</p><Link to="/workspace">继续设计</Link></section> : visibleMaterials.length === 0 ? <section className="materials-empty"><h2>没有匹配的材料</h2><p>试试其他名称、规格、地区或分类。</p></section> : <section className="materials-grid" aria-label="材料列表">{visibleMaterials.map((material) => {
      const attached = Boolean(selectedProject?.materialIds.includes(material.id));
      return <article className="material-item" key={material.id}><div className="material-item-top"><span>{material.category || '未分类'}</span><strong>{material.region || '地区未填写'}</strong></div><h2>{material.name}</h2><p>{material.spec || '规格未填写'}{material.unit ? ` · ${material.unit}` : ''}</p><div className="material-price">¥{material.price || '未报价'}<small> / {material.unit || '单位未填写'}</small></div><div className="material-item-foot"><span>有效期 {material.validUntil || '未填写'}</span><button disabled={!selectedProject} className={attached ? 'attached' : ''} onClick={() => selectedProject && toggleProjectMaterial(selectedProject.id, material.id)}>{attached ? '已加入项目' : '加入项目'}</button></div></article>;
    })}</section>}
  </main>;
}
