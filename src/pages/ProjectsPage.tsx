import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { workspaceDataAdapter } from '../services/workspaceData';
import type { Project } from '../stores/appStore';
import type { MaterialRecord } from '../services/dataContracts';
import './ProjectsPage.css';

const styleNames: Record<Project['style'], string> = {
  modern: '现代简约', minimal: '北欧原木', chinese: '新中式', cream: '奶油法式', european: '轻奢欧式', wabi: '自然侘寂', song: '宋式美学', smallAmerican: '小美风格',
};

const statusNames: Record<Project['status'], string> = {
  draft: '草稿', generating: '生成中', completed: '已完成', failed: '生成失败',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function Icon({ name }: { name: 'arrow' | 'plus' | 'trash' | 'layers' | 'clock' | 'close' }) {
  const paths = {
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
    layers: <><path d="m12 3 8 4-8 4-8-4 8-4Z" /><path d="m4 12 8 4 8-4M4 17l8 4 8-4" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function ProjectCard({ project, selected, onSelect }: { project: Project; selected: boolean; onSelect: () => void }) {
  return <button className={`project-card ${selected ? 'selected' : ''}`} onClick={onSelect}>
    <div className="project-card-media">{project.thumbnail ? <img src={project.thumbnail} alt={`${project.name}方案缩略图`} /> : <div className="project-card-placeholder"><Icon name="layers" /></div>}<span className={`project-status ${project.status}`}>{statusNames[project.status]}</span></div>
    <div className="project-card-body"><strong>{project.name}</strong><span>{styleNames[project.style]} · {project.spaceType}</span><small>更新于 {formatDate(project.updatedAt)}</small></div>
  </button>;
}

function EmptyProjects() {
  return <div className="projects-empty"><div className="empty-project-mark"><Icon name="layers" /></div><h2>从第一个空间开始</h2><p>当前还没有保存的项目。创建项目并上传现场照片或户型图，生成后会保存在这里。</p><Link className="projects-primary-button" to="/workspace"><Icon name="plus" />创建第一个项目</Link></div>;
}

export default function ProjectsPage() {
  const { projects, projectsStatus, projectsError, loadProjects, removeProject, setCurrentProject, storageWarning } = useAppStore();
  const [materials, setMaterials] = useState<MaterialRecord[]>([]);
  const [materialsError, setMaterialsError] = useState('');
  useEffect(() => {
    let active = true;
    void workspaceDataAdapter.loadMaterials().then((items) => {
      if (active) { setMaterials(items); setMaterialsError(''); }
    }).catch((error: unknown) => {
      if (active) setMaterialsError(error instanceof Error ? error.message : '材料资料暂时无法加载。');
    });
    return () => { active = false; };
  }, []);
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(projects[0]?.id || '');
  const [selectedVersionId, setSelectedVersionId] = useState(projects[0]?.versions.at(-1)?.id || '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const selectedProject = useMemo(() => projects.find((project) => project.id === selectedId) || projects[0], [projects, selectedId]);
  const selectedVersion = selectedProject?.versions.find((version) => version.id === selectedVersionId) || selectedProject?.versions.at(-1);

  const chooseProject = (project: Project) => {
    setSelectedId(project.id);
    setSelectedVersionId(project.versions.at(-1)?.id || '');
    setCurrentProject(project);
  };

  const deleteSelected = () => {
    if (!selectedProject) return;
    removeProject(selectedProject.id);
    setConfirmDelete(false);
    const nextProject = projects.find((project) => project.id !== selectedProject.id);
    setSelectedId(nextProject?.id || '');
    setSelectedVersionId(nextProject?.versions.at(-1)?.id || '');
    if (nextProject) setCurrentProject(nextProject);
  };

  return <div className="projects-page">
    <header className="projects-header"><div><span className="projects-eyebrow">YOUR DESIGN ARCHIVE</span><h1>我的项目</h1><p>所有设计尝试、生成任务和方案版本都集中在这里。</p></div><Link className="projects-primary-button" to="/workspace"><Icon name="plus" />新建项目</Link></header>
    <div className={`projects-local-note ${storageWarning ? 'warning' : ''}`}><Icon name="clock" /><span>{storageWarning || '当前使用本机保存，等后端接口接入后再同步到账号。'}</span></div>
    {projectsStatus === 'loading' ? <div className="projects-empty" role="status"><h2>正在加载项目</h2><p>请稍候。</p></div> : projectsStatus === 'error' ? <div className="projects-empty" role="alert"><h2>项目暂时无法加载</h2><p>{projectsError}</p><button className="projects-primary-button" onClick={() => void loadProjects()}>重试</button></div> : projects.length === 0 ? <EmptyProjects /> : <div className="projects-layout">
      <section className="projects-list" aria-label="项目列表"><div className="projects-list-heading"><strong>全部项目</strong><span>{projects.length} 个</span></div>{projects.map((project) => <ProjectCard key={project.id} project={project} selected={selectedProject?.id === project.id} onSelect={() => chooseProject(project)} />)}</section>
      {selectedProject && <section className="project-detail"><div className="project-detail-head"><div><span className="projects-eyebrow">PROJECT DETAIL</span><h2>{selectedProject.name}</h2><p>{styleNames[selectedProject.style]} · {selectedProject.spaceType}{selectedProject.budget !== undefined ? ` · 预算 ${selectedProject.budget} 万元` : ''} · 创建于 {formatDate(selectedProject.createdAt)}</p></div><div className="detail-actions"><Link className="detail-button primary" to={`/workspace?projectId=${selectedProject.id}${selectedVersion ? `&versionId=${selectedVersion.id}` : ''}`}>继续编辑 <Icon name="arrow" /></Link><button className="detail-button danger" onClick={() => setConfirmDelete(true)}><Icon name="trash" />删除</button></div></div>
        <div className="detail-summary"><div><span>项目状态</span><strong className={`detail-status ${selectedProject.status}`}>{statusNames[selectedProject.status]}</strong></div><div><span>方案版本</span><strong>{selectedProject.versions.length}</strong></div><div><span>生成任务</span><strong>{selectedProject.tasks.length}</strong></div><div><span>关联材料</span><strong>{selectedProject.materialIds.length}</strong></div></div>
        <section className="detail-section"><div className="detail-section-heading"><div><span className="projects-eyebrow">PROJECT MATERIALS</span><h3>关联材料</h3></div><Link to="/materials">管理材料</Link></div>{materialsError ? <p className="detail-empty" role="alert">材料资料暂时无法加载：{materialsError}</p> : selectedProject.materialIds.length === 0 ? <p className="detail-empty">还没有关联材料。浏览材料库，把需要对比的材料加入项目。</p> : <div className="project-material-list">{selectedProject.materialIds.map((id) => {
          const material = materials.find((item) => item.id === id);
          return <div className="project-material-row" key={id}><strong>{material?.name || '材料记录不可用'}</strong><span>{material ? `${material.category || '未分类'} · ${material.spec || '规格未填写'} · ${material.region || '地区未填写'}` : '该材料可能已从企业材料清单移除'}</span><b>{material ? `¥${material.price}${material.unit ? ` / ${material.unit}` : ''}` : '—'}</b></div>;
        })}</div>}</section>
        <section className="detail-section"><div className="detail-section-heading"><div><span className="projects-eyebrow">VERSION HISTORY</span><h3>方案版本</h3></div><span>{selectedProject.versions.length} 个版本</span></div>{selectedProject.versions.length === 0 ? <p className="detail-empty">项目还没有成功生成的方案版本。</p> : <div className="version-list">{[...selectedProject.versions].reverse().map((version, index) => <article className={`version-row ${selectedVersion?.id === version.id ? 'selected' : ''}`} key={version.id} onClick={() => setSelectedVersionId(version.id)}><div className="version-index">V{selectedProject.versions.length - index}</div><div className="version-copy"><strong>{version.mode === 'photo' ? '现场效果图' : '全屋方案'} · {styleNames[version.style]}</strong><span>{version.prompt || '未填写补充说明'}</span></div><time>{formatDate(version.createdAt)}</time><button className="version-open" onClick={(event) => { event.stopPropagation(); navigate(`/workspace?projectId=${selectedProject.id}&versionId=${version.id}`); }} aria-label={`继续编辑版本 ${selectedProject.versions.length - index}`}><Icon name="arrow" /></button></article>)}</div>}</section>
        {selectedVersion && <div className="version-preview"><div className="version-preview-heading"><div><span className="projects-eyebrow">V{selectedProject.versions.findIndex((version) => version.id === selectedVersion.id) + 1} · {styleNames[selectedVersion.style]}</span><h4>{selectedVersion.mode === 'photo' ? '现场效果图' : '全屋方案'}</h4></div><span>{formatDate(selectedVersion.createdAt)}</span></div><div className="version-images">{selectedVersion.images.map((image) => <figure key={image.id}><img src={image.imageUrl} alt={image.title} /><figcaption><strong>{image.title}</strong>{image.description && <span>{image.description}</span>}</figcaption></figure>)}</div>{selectedVersion.analysis && <p className="version-analysis">{selectedVersion.analysis}</p>}</div>}
        <section className="detail-section"><div className="detail-section-heading"><div><span className="projects-eyebrow">TASK LOG</span><h3>生成任务</h3></div><span>{selectedProject.tasks.length} 条记录</span></div>{selectedProject.tasks.length === 0 ? <p className="detail-empty">还没有生成记录。完成素材上传并开始生成后，任务状态会显示在这里。</p> : <div className="task-list">{[...selectedProject.tasks].reverse().map((task) => <div className={`task-row ${task.status}`} key={task.id}><span className={`task-dot ${task.status}`} /><div><strong>{task.mode === 'photo' ? '现场照片效果图' : '户型图全屋方案'}</strong><span>{styleNames[task.style]} · {formatDate(task.startedAt)}</span>{task.error && <p className="task-error">{task.error}</p>}</div><b className={`task-status ${task.status}`}>{task.status === 'completed' ? '成功' : task.status === 'failed' ? '失败' : '生成中'}</b>{task.status !== 'completed' && <Link className="task-retry" to={`/workspace?source=${selectedProject.spaceType.startsWith('CAD') ? 'cad' : 'floorplan'}&style=${task.style}&projectId=${selectedProject.id}&taskId=${task.id}`}>{task.status === 'generating' ? '查看进度' : '查看记录'}</Link>}</div>)}</div>}</section>
      </section>}
    </div>}
    {confirmDelete && selectedProject && <div className="project-dialog-backdrop" role="presentation"><div className="project-dialog" role="dialog" aria-modal="true" aria-label="删除项目确认"><button className="dialog-close" onClick={() => setConfirmDelete(false)} aria-label="取消删除"><Icon name="close" /></button><span className="dialog-kicker">REMOVE PROJECT</span><h2>删除“{selectedProject.name}”？</h2><p>项目和其中的本地版本记录会从当前浏览器移除，后端接入前无法恢复。</p><div className="dialog-actions"><button className="detail-button" onClick={() => setConfirmDelete(false)}>取消</button><button className="detail-button danger solid" onClick={deleteSelected}><Icon name="trash" />确认删除</button></div></div></div>}
  </div>;
}
