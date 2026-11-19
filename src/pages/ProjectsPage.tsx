import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { hasPersistentWorkspaceSession, listActiveGenerationTasks, workspaceDataAdapter, type RemoteGenerationTask } from '../services/workspaceData';
import type { Project } from '../stores/appStore';
import type { MaterialRecord } from '../services/dataContracts';
import { wholeHomeStyles, type WholeHomeStyle } from '../features/styleLibrary/wholeHomeStyles';
import { deriveProjectStatus, type ProjectStatus } from '../utils/projectStatus';
import './ProjectsPage.css';

const styleNames: Record<Project['style'], string> = {
  ...Object.fromEntries(wholeHomeStyles.map(style => [style.key, style.name])) as Record<WholeHomeStyle['key'], string>,
  modern: '现代简约', minimal: '北欧原木', chinese: '新中式', cream: '奶油法式', european: '轻奢欧式', wabi: '自然侘寂', song: '宋式美学', smallAmerican: '小美风格',
};

const statusNames: Record<ProjectStatus, string> = {
  draft: '草稿', generating: '生成中', completed: '已完成', failed: '未完成',
};

type FilterKey = 'all' | ProjectStatus;
const filters: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'generating', label: '生成中' },
  { key: 'completed', label: '已完成' },
  { key: 'draft', label: '草稿' },
  { key: 'failed', label: '未完成' },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function versionLabel(count: number) {
  return `V${String(count).padStart(2, '0')}`;
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

function ProjectTile({ project, status, progress, hero, onOpen }: { project: Project; status: ProjectStatus; progress?: number; hero: boolean; onOpen: () => void }) {
  const cover = project.thumbnail || project.versions.at(-1)?.coverImageUrl;
  const live = status === 'generating';
  return <article className={`project-tile ${hero ? 'is-hero' : ''} ${live ? 'is-live' : ''}`}>
    <button type="button" className="project-tile-open" onClick={onOpen} aria-label={`查看项目 ${project.name}`}>
      <span className="project-tile-media">
        {cover ? <img src={cover} alt={`${project.name}方案封面`} loading="lazy" decoding="async" /> : <span className="project-tile-placeholder"><Icon name="layers" /></span>}
        {live && <span className="project-tile-live"><i aria-hidden="true" />生成中</span>}
        {project.versions.length > 0 && !live && <span className="project-tile-version">{versionLabel(project.versions.length)}</span>}
        {typeof progress === 'number' && <span className="project-tile-track" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(3, progress))}%` }} /></span>}
      </span>
      <span className="project-tile-body">
        <span className="project-tile-title">{project.name}</span>
        <span className="project-tile-meta">{styleNames[project.style]} · {project.spaceType}</span>
        <span className="project-tile-foot">
          <span className={`project-tile-status ${status}`}>{statusNames[status]}</span>
          <span className="project-tile-foot-right">
            <time>{formatDate(project.updatedAt)}</time>
            <Link className="project-tile-cta" to={`/workspace?projectId=${project.id}`}>继续编辑<Icon name="arrow" /></Link>
          </span>
        </span>
      </span>
    </button>
  </article>;
}

function EmptyProjects() {
  return <div className="projects-empty"><div className="empty-project-mark"><Icon name="layers" /></div><h2>从第一个空间开始</h2><p>还没有项目。上传户型图或现场照片，生成的全屋方案会自动收进这本作品集。</p><Link className="projects-primary-button" to="/workspace"><Icon name="plus" />创建第一个项目</Link></div>;
}

export default function ProjectsPage() {
  const { projects, projectsStatus, projectsError, loadProjects, removeProject, setCurrentProject, storageWarning } = useAppStore();
  const navigate = useNavigate();
  const [materials, setMaterials] = useState<MaterialRecord[]>([]);
  const [materialsError, setMaterialsError] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [activeTasks, setActiveTasks] = useState<RemoteGenerationTask[]>([]);

  useEffect(() => {
    let active = true;
    void workspaceDataAdapter.loadMaterials().then((items) => {
      if (active) { setMaterials(items); setMaterialsError(''); }
    }).catch((error: unknown) => {
      if (active) setMaterialsError(error instanceof Error ? error.message : '材料资料暂时无法加载。');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hasPersistentWorkspaceSession()) return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      if (!cancelled && !document.hidden) {
        try {
          const tasks = await listActiveGenerationTasks();
          if (!cancelled) setActiveTasks(tasks);
        } catch {
          // Live progress is an enhancement; project loading already surfaces real errors.
        }
      }
      if (!cancelled) timer = window.setTimeout(poll, 4000);
    };
    void poll();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, []);

  const liveTaskByProject = useMemo(() => new Map(activeTasks.map((task) => [task.projectId, task])), [activeTasks]);
  const statusById = useMemo(() => new Map(projects.map((project) => [project.id, deriveProjectStatus(project)])), [projects]);
  const totalVersions = useMemo(() => projects.reduce((sum, project) => sum + project.versions.length, 0), [projects]);

  const filteredProjects = useMemo(() => {
    const keyword = query.trim();
    return projects.filter((project) => {
      const status = statusById.get(project.id) ?? 'draft';
      if (filter !== 'all' && status !== filter) return false;
      if (!keyword) return true;
      return project.name.toLowerCase().includes(keyword.toLowerCase())
        || styleNames[project.style].includes(keyword)
        || project.spaceType.includes(keyword);
    });
  }, [projects, statusById, filter, query]);

  const drawerProject = drawerId ? projects.find((project) => project.id === drawerId) ?? null : null;  const selectedVersion = drawerProject?.versions.find((version) => version.id === selectedVersionId) ?? drawerProject?.versions.at(-1);

  const openProject = (project: Project) => {
    setDrawerId(project.id);
    setSelectedVersionId(project.versions.at(-1)?.id ?? '');
    setCurrentProject(project);
  };

  const closeDrawer = () => setDrawerId(null);

  const confirmDelete = () => {
    if (!deleteTarget) return;
    removeProject(deleteTarget.id);
    if (drawerId === deleteTarget.id) setDrawerId(null);
    setDeleteTarget(null);
  };

  const localOnly = !hasPersistentWorkspaceSession();

  return <div className="projects-page">
    <header className="projects-hero">
      <div className="projects-hero-copy">
        <span className="projects-eyebrow">YOUR DESIGN ARCHIVE</span>
        <h1>我的项目</h1>
        <p>从第一张户型图到完整方案，每一次创作都留在这一本作品集里。</p>
      </div>
      <div className="projects-hero-side">
        <div className="projects-hero-stats">
          <span><strong>{projects.length}</strong><small>项目</small></span>
          <span><strong>{totalVersions}</strong><small>方案版本</small></span>
          <span><strong>{activeTasks.length}</strong><small>进行中</small></span>
        </div>
        <Link className="projects-primary-button" to="/workspace"><Icon name="plus" />新建项目</Link>
      </div>
    </header>

    {activeTasks.length > 0 && <section className="projects-live" aria-live="polite">
      <div className="projects-live-head"><span className="projects-live-dot" aria-hidden="true" /><strong>正在生成 {activeTasks.length} 个方案</strong><small>可以离开这个页面，进度会保存在账号里</small></div>
      <div className="projects-live-rows">{activeTasks.map((task) => {
        const project = projects.find((item) => item.id === task.projectId);
        const percent = typeof task.progress === 'number' ? task.progress : Math.round(((task.completedRooms ?? 0) / Math.max(task.totalRooms ?? 1, 1)) * 100);
        return <article className="projects-live-row" key={task.id}>
          <div className="projects-live-thumb">{project?.thumbnail ? <img src={project.thumbnail} alt="" /> : <Icon name="layers" />}</div>
          <div className="projects-live-copy">
            <strong>{project?.name ?? '新方案'}</strong>
            <small>{task.progressMessage || '正在生成空间效果图'}{task.totalRooms ? ` · ${task.completedRooms ?? 0}/${task.totalRooms} 个空间` : ''}</small>
            <div className="projects-live-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${Math.min(100, Math.max(3, percent))}%` }} /></div>
          </div>
          <Link className="detail-button primary" to={`/workspace?projectId=${task.projectId}&taskId=${task.id}`}>进入工作台 <Icon name="arrow" /></Link>
        </article>;
      })}</div>
    </section>}

    {localOnly && <div className={`projects-local-note ${storageWarning ? 'warning' : ''}`}><Icon name="clock" /><span>{storageWarning || '当前未登录平台账号：项目保存在本机浏览器，换设备或清理缓存后不可恢复。'}</span></div>}

    <div className="projects-toolbar">
      <div className="projects-filters" role="tablist" aria-label="按状态筛选">
        {filters.map((item) => <button key={item.key} type="button" role="tab" aria-selected={filter === item.key} className={filter === item.key ? 'active' : ''} onClick={() => setFilter(item.key)}>{item.label}</button>)}
      </div>
      <label className="projects-search"><span>搜索</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="项目名称、风格或空间" maxLength={60} /></label>
    </div>

    {projectsStatus === 'loading'
      ? <div className="projects-empty" role="status"><h2>正在加载项目</h2><p>请稍候。</p></div>
      : projectsStatus === 'error'
        ? <div className="projects-empty" role="alert"><h2>项目暂时无法加载</h2><p>{projectsError}</p><button className="projects-primary-button" onClick={() => void loadProjects()}>重试</button></div>
        : projects.length === 0
          ? <EmptyProjects />
          : filteredProjects.length === 0
            ? <div className="projects-empty"><div className="empty-project-mark"><Icon name="layers" /></div><h2>没有匹配的项目</h2><p>换一个筛选条件或清空搜索词试试。</p><button className="projects-primary-button" onClick={() => { setFilter('all'); setQuery(''); }}>清除筛选</button></div>
            : <div className="projects-grid">
              {filteredProjects.map((project, index) => <ProjectTile
                key={project.id}
                project={project}
                status={statusById.get(project.id) ?? 'draft'}
                progress={liveTaskByProject.get(project.id)?.progress}
                hero={index === 0 && filter === 'all' && !query.trim()}
                onOpen={() => openProject(project)}
              />)}
            </div>}

    {drawerProject && <div className="project-drawer-backdrop" role="presentation" onClick={closeDrawer}>
      <aside className="project-drawer" role="dialog" aria-modal="true" aria-label={`${drawerProject.name} 项目详情`} onClick={(event) => event.stopPropagation()}>
        <header className="project-drawer-head">
          <div>
            <span className="projects-eyebrow">PROJECT DETAIL</span>
            <h2>{drawerProject.name}</h2>
            <p>{styleNames[drawerProject.style]} · {drawerProject.spaceType}{drawerProject.budget !== undefined ? ` · 预算 ${drawerProject.budget} 万元` : ''} · 创建于 {formatDate(drawerProject.createdAt)}</p>
          </div>
          <button type="button" className="project-drawer-close" onClick={closeDrawer} aria-label="关闭项目详情"><Icon name="close" /></button>
        </header>
        <div className="project-drawer-actions">
          <Link className="detail-button primary" to={`/workspace?projectId=${drawerProject.id}${selectedVersion ? `&versionId=${selectedVersion.id}` : ''}`}>继续编辑 <Icon name="arrow" /></Link>
          <button type="button" className="detail-button danger" onClick={() => setDeleteTarget(drawerProject)}><Icon name="trash" />删除</button>
        </div>

        <div className="detail-summary">
          <div><span>项目状态</span><strong className={`detail-status ${statusById.get(drawerProject.id) ?? 'draft'}`}>{statusNames[statusById.get(drawerProject.id) ?? 'draft']}</strong></div>
          <div><span>方案版本</span><strong>{drawerProject.versions.length}</strong></div>
          <div><span>生成任务</span><strong>{drawerProject.tasks.length}</strong></div>
          <div><span>关联材料</span><strong>{drawerProject.materialIds.length}</strong></div>
        </div>

        <section className="detail-section">
          <div className="detail-section-heading"><div><span className="projects-eyebrow">VERSION HISTORY</span><h3>方案版本</h3></div><span>{drawerProject.versions.length} 个版本</span></div>
          {drawerProject.versions.length === 0
            ? <p className="detail-empty">项目还没有成功生成的方案版本。</p>
            : <div className="version-list">{[...drawerProject.versions].reverse().map((version, index) => <article className={`version-row ${selectedVersion?.id === version.id ? 'selected' : ''}`} key={version.id} onClick={() => setSelectedVersionId(version.id)}>
              <div className="version-index">{versionLabel(drawerProject.versions.length - index)}</div>
              <div className="version-copy"><strong>{version.mode === 'photo' ? '现场效果图' : '全屋方案'} · {styleNames[version.style]}</strong><span>{version.prompt || '未填写补充说明'}</span></div>
              <time>{formatDate(version.createdAt)}</time>
              <button type="button" className="version-open" onClick={(event) => { event.stopPropagation(); navigate(`/workspace?projectId=${drawerProject.id}&versionId=${version.id}`); }} aria-label={`继续编辑版本 ${drawerProject.versions.length - index}`}><Icon name="arrow" /></button>
            </article>)}</div>}
        </section>

        {selectedVersion && <div className="version-preview">
          <div className="version-preview-heading">
            <div><span className="projects-eyebrow">{versionLabel(drawerProject.versions.findIndex((version) => version.id === selectedVersion.id) + 1)} · {styleNames[selectedVersion.style]}</span><h4>{selectedVersion.mode === 'photo' ? '现场效果图' : '全屋方案'}</h4></div>
            <span>{formatDate(selectedVersion.createdAt)}</span>
          </div>
          <div className="version-images">{selectedVersion.images.map((image) => <figure key={image.id}><img src={image.imageUrl} alt={image.title} loading="lazy" /><figcaption><strong>{image.title}</strong>{image.description && <span>{image.description}</span>}</figcaption></figure>)}</div>
          {selectedVersion.analysis && <p className="version-analysis">{selectedVersion.analysis}</p>}
        </div>}

        <section className="detail-section">
          <div className="detail-section-heading"><div><span className="projects-eyebrow">PROJECT MATERIALS</span><h3>关联材料</h3></div><Link to="/materials">管理材料</Link></div>
          {materialsError
            ? <p className="detail-empty" role="alert">材料资料暂时无法加载：{materialsError}</p>
            : drawerProject.materialIds.length === 0
              ? <p className="detail-empty">还没有关联材料。浏览材料库，把需要对比的材料加入项目。</p>
              : <div className="project-material-list">{drawerProject.materialIds.map((id) => {
                const material = materials.find((item) => item.id === id);
                return <div className="project-material-row" key={id}><strong>{material?.name || '材料记录不可用'}</strong><span>{material ? `${material.category || '未分类'} · ${material.spec || '规格未填写'} · ${material.region || '地区未填写'}` : '该材料可能已从企业材料清单移除'}</span><b>{material ? `¥${material.price}${material.unit ? ` / ${material.unit}` : ''}` : '—'}</b></div>;
              })}</div>}
        </section>

        <section className="detail-section">
          <div className="detail-section-heading"><div><span className="projects-eyebrow">TASK LOG</span><h3>生成任务</h3></div><span>{drawerProject.tasks.length} 条记录</span></div>
          {drawerProject.tasks.length === 0
            ? <p className="detail-empty">还没有生成记录。完成素材上传并开始生成后，任务状态会显示在这里。</p>
            : <div className="task-list"><div className="task-list-head" aria-hidden="true"><span></span><span>任务</span><span>来源</span><span>风格</span><span>时间</span><span>状态</span><span>操作</span></div>{[...drawerProject.tasks].reverse().map((task) => <div className={`task-row ${task.status}`} key={task.id}>
              <div className="task-leading"><span className={`task-dot ${task.status}`} aria-hidden="true" /></div>
              <div className="task-main"><div className="task-title-line"><strong>{task.mode === 'photo' ? '现场照片效果图' : '户型图全屋方案'}</strong></div><span className="task-meta">{styleNames[task.style]} · {formatDate(task.startedAt)}</span>{task.error && <p className="task-error"><span className="task-error-label">失败原因</span>{task.error}</p>}</div>
              <span className="task-source">{task.mode === 'photo' ? '现场照片' : '户型图 / CAD'}</span>
              <span className="task-style">{styleNames[task.style]}</span>
              <time className="task-time">{formatDate(task.startedAt)}</time>
              <b className={`task-status ${task.status}`}>{task.status === 'completed' ? '成功' : task.status === 'failed' ? '失败' : '生成中'}</b>
              <div className="task-action">{task.status !== 'completed' && <Link className="task-retry" to={`/workspace?source=${drawerProject.spaceType.startsWith('CAD') ? 'cad' : 'floorplan'}&style=${task.style}&projectId=${drawerProject.id}&taskId=${task.id}`}>{task.status === 'generating' ? '查看进度' : '查看记录'}</Link>}</div>
            </div>)}</div>}
        </section>
      </aside>
    </div>}

    {deleteTarget && <div className="project-dialog-backdrop" role="presentation" onClick={() => setDeleteTarget(null)}><div className="project-dialog" role="dialog" aria-modal="true" aria-label="删除项目确认" onClick={(event) => event.stopPropagation()}><button className="dialog-close" onClick={() => setDeleteTarget(null)} aria-label="取消删除"><Icon name="close" /></button><span className="dialog-kicker">REMOVE PROJECT</span><h2>删除“{deleteTarget.name}”？</h2><p>项目、方案版本与生成记录会一并删除，且无法恢复。</p><div className="dialog-actions"><button className="detail-button" onClick={() => setDeleteTarget(null)}>取消</button><button className="detail-button danger solid" onClick={confirmDelete}><Icon name="trash" />确认删除</button></div></div></div>}
  </div>;
}
