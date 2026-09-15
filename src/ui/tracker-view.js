import { groupApplications } from '../lib/company.js';
import {
  chinaDateKey,
  chinaHour,
  countApplicationsForChinaDate,
  currentCheckinStreak,
  goalMessage
} from '../lib/checkins.js';
import { getDueMeta } from '../lib/dates.js';
import { downloadBackup as downloadCloudBackup } from '../lib/export.js';

const STATUSES = ['准备投递', '已投递', '笔试', '面试中', '已录用', '已拒绝', '已放弃'];
const COMPANY_GROUPS_PER_PAGE = 5;

function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value = '') {
  return escapeHtml(value);
}

function safeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function formatDate(value, fallback = '未填写') {
  if (!value) return fallback;
  return escapeHtml(String(value).slice(0, 10));
}

function truncate(value, length = 72) {
  const text = String(value ?? '').trim();
  if (!text) return '未填写问题';
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

function statusOptions(selected = '') {
  return STATUSES.map(status =>
    `<option value="${status}" ${status === selected ? 'selected' : ''}>${status}</option>`
  ).join('');
}

function emptyData() {
  return { applications: [], interviews: [], statusHistory: [], dailyGoal: 3, checkins: [], checkinsAvailable: true };
}

function normalizeData(data) {
  return {
    applications: Array.isArray(data?.applications) ? data.applications : [],
    interviews: Array.isArray(data?.interviews) ? data.interviews : [],
    statusHistory: Array.isArray(data?.statusHistory) ? data.statusHistory : [],
    dailyGoal: Number.isInteger(Number(data?.dailyGoal)) ? Number(data.dailyGoal) : 3,
    checkins: Array.isArray(data?.checkins) ? data.checkins : [],
    checkinsAvailable: data?.checkinsAvailable !== false
  };
}

function applicationForm(application = {}) {
  return {
    id: application.id ?? '',
    company: application.company ?? '',
    role: application.role ?? '',
    location: application.location ?? '',
    channel: application.channel ?? '',
    appliedDate: application.appliedDate ?? '',
    status: application.status ?? '准备投递',
    nextAction: application.nextAction ?? '',
    nextDate: application.nextDate ?? '',
    salary: application.salary ?? '',
    contact: application.contact ?? '',
    jobUrl: application.jobUrl ?? '',
    tags: Array.isArray(application.tags) ? application.tags.join(', ') : (application.tags ?? ''),
    notes: application.notes ?? ''
  };
}

function interviewForm(interview = {}) {
  return {
    id: interview.id ?? '',
    applicationId: interview.applicationId ?? '',
    date: interview.date ?? '',
    stage: interview.stage ?? '',
    rating: interview.rating ?? '',
    questions: interview.questions ?? '',
    highlights: interview.highlights ?? '',
    gaps: interview.gaps ?? '',
    nextPlan: interview.nextPlan ?? '',
    feedback: interview.feedback ?? ''
  };
}

export function createTrackerView(root, {
  trackerService,
  authService,
  downloadBackup = downloadCloudBackup
}) {
  let destroyed = false;
  let mounted = false;
  let initialLoading = true;
  let mutationInFlight = false;
  let signOutInFlight = false;
  let exportInFlight = false;
  let loadGeneration = 0;
  let data = emptyData();
  let syncState = '正在加载…';
  let reloadOnlyRetry = false;
  let filters = { query: '', status: '' };
  let currentPage = 1;
  let checkinFeedback = '';
  let goalRefreshTimer = null;
  let modal = null;
  const documentRef = root.ownerDocument;

  function filteredGroups() {
    const query = filters.query.trim().toLocaleLowerCase();
    const visibleApplications = data.applications.filter(application => {
      const matchesStatus = !filters.status || application.status === filters.status;
      const matchesQuery = !query || [
        application.company,
        application.role,
        application.location,
        application.channel,
        application.tags?.join?.(' '),
        application.notes
      ].some(value => String(value ?? '').toLocaleLowerCase().includes(query));
      return matchesStatus && matchesQuery;
    });
    return groupApplications(visibleApplications);
  }

  function stats() {
    return {
      total: data.applications.length,
      interviewing: data.applications.filter(application => application.status === '面试中').length,
      offered: data.applications.filter(application => application.status === '已录用').length,
      dueSoon: data.applications.filter(application => getDueMeta(application.nextDate).state === 'soon').length
    };
  }

  function previousDateKey(dateKey) {
    const date = new Date(`${dateKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }

  function dailyGoalSnapshot(now = new Date()) {
    const today = chinaDateKey(now);
    const target = Math.min(99, Math.max(1, Number(data.dailyGoal) || 3));
    const completed = countApplicationsForChinaDate(data.applications, today);
    const checkedIn = data.checkins.some(checkin => checkin.checkinDate === today);
    const message = checkedIn
      ? { tone: 'complete', text: '今日目标完成，打卡已记录。继续保持！' }
      : goalMessage({ completed, target, chinaHour: chinaHour(now) });
    return {
      today,
      target,
      completed,
      checkedIn,
      message,
      streak: currentCheckinStreak(data.checkins, today)
    };
  }

  function renderDailyGoal() {
    const goal = dailyGoalSnapshot();
    const progress = Math.min(100, Math.round((goal.completed / goal.target) * 100));
    const unavailable = data.checkinsAvailable ? '' : ' disabled';
    const feedback = data.checkinsAvailable
      ? checkinFeedback
      : '请先完成 Supabase 初始化，再启用云端打卡';
    return `
      <section class="daily-goal-card" data-daily-goal data-tone="${goal.message.tone}" aria-labelledby="daily-goal-title">
        <div class="daily-goal-main">
          <div class="daily-goal-heading">
            <div>
              <p class="goal-kicker">今日投递目标 · 中国时间</p>
              <h2 id="daily-goal-title">今天完成 <strong data-goal-progress>${goal.completed}/${goal.target}</strong></h2>
            </div>
            <span class="streak-pill" data-checkin-streak>连续打卡 ${goal.streak} 天</span>
          </div>
          <div class="goal-progress" aria-label="今日投递进度 ${goal.completed}/${goal.target}"><span style="width:${progress}%"></span></div>
          <p class="goal-message" data-goal-message>${escapeHtml(goal.message.text)}</p>
        </div>
        <div class="daily-goal-tools">
          <form data-form="daily-goal" class="goal-form">
            <label for="daily-target">每日目标</label>
            <input id="daily-target" name="daily-target" type="number" inputmode="numeric" min="1" max="99" required value="${goal.target}">
            <button type="submit" class="button-secondary"${unavailable}>更新</button>
          </form>
          <form data-form="makeup-checkin" class="goal-form makeup-form">
            <label for="makeup-date">历史补签</label>
            <input id="makeup-date" name="makeup-date" type="date" max="${previousDateKey(goal.today)}" required>
            <button type="submit" class="button-secondary"${unavailable}>补签</button>
          </form>
          <p class="checkin-feedback" data-checkin-feedback aria-live="polite">${escapeHtml(feedback)}</p>
        </div>
      </section>`;
  }

  function renderRole(application) {
    const due = getDueMeta(application.nextDate);
    const tags = Array.isArray(application.tags) ? application.tags : [];
    const mutationDisabled = initialLoading ? ' disabled' : '';
    return `
      <article class="role-card" data-application-id="${escapeAttribute(application.id)}">
        <div class="role-main">
          <div class="role-title-row">
            <h3>${escapeHtml(application.role || '未命名岗位')}</h3>
            <span class="status-badge">状态：${escapeHtml(application.status || '准备投递')}</span>
          </div>
          <p class="role-meta">${escapeHtml(application.location || '地点未填写')} · ${escapeHtml(application.channel || '渠道未填写')}</p>
          <p class="due due-${due.state}">跟进：${escapeHtml(due.text)}${application.nextAction ? ` · ${escapeHtml(application.nextAction)}` : ''}</p>
          ${tags.length ? `<p class="tags">${tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</p>` : ''}
        </div>
        <div class="card-actions" aria-label="岗位操作">
          <button type="button" class="button-link" data-action="view-application" data-id="${escapeAttribute(application.id)}"${mutationDisabled}>详情</button>
          <button type="button" class="button-link" data-action="edit-application" data-id="${escapeAttribute(application.id)}"${mutationDisabled}>编辑</button>
          <button type="button" class="button-link danger-link" data-action="delete-application" data-id="${escapeAttribute(application.id)}"${mutationDisabled}>删除</button>
        </div>
      </article>`;
  }

  function renderGroups(groups) {
    if (!groups.length) {
      return '<p class="empty-state">没有匹配的投递记录。</p>';
    }
    const mutationDisabled = initialLoading ? ' disabled' : '';
    return groups.map(group => `
      <section class="company-group" data-company-key="${escapeAttribute(group.key)}">
        <header class="company-header">
          <div>
            <h2>${escapeHtml(group.company || '未命名公司')}</h2>
            <p>${group.applications.length} 个岗位 · 最近更新 ${formatDate(group.updatedAt)}</p>
          </div>
          <button type="button" class="button-link" data-action="add-interview" data-prefill-application-id="${escapeAttribute(group.applications[0]?.id ?? '')}"${mutationDisabled}>记录面试</button>
        </header>
        <div class="role-list">${group.applications.map(renderRole).join('')}</div>
      </section>`).join('');
  }

  function paginationItems(pageCount) {
    if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
    const pages = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, pageCount])]
      .filter(page => page >= 1 && page <= pageCount)
      .sort((a, b) => a - b);
    const items = [];
    pages.forEach((page, index) => {
      if (index && page - pages[index - 1] > 1) items.push(`ellipsis-${page}`);
      items.push(page);
    });
    return items;
  }

  function renderPagination(groups, pageCount) {
    if (!groups.length) return '';
    const applicationCount = groups.reduce((total, group) => total + group.applications.length, 0);
    const pageButtons = paginationItems(pageCount).map(item => {
      if (typeof item === 'string') return '<span class="page-ellipsis" aria-hidden="true">…</span>';
      return `<button type="button" class="page-button${item === currentPage ? ' is-current' : ''}" data-action="set-page" data-page="${item}" aria-label="第 ${item} 页"${item === currentPage ? ' aria-current="page"' : ''}>${item}</button>`;
    }).join('');
    return `
      <nav class="pagination" data-pagination aria-label="投递记录分页">
        <p class="pagination-summary" data-pagination-summary>共 ${applicationCount} 个岗位 · ${groups.length} 家公司</p>
        <div class="pagination-actions">
          <div class="pagination-controls">
            <button type="button" class="page-button page-step" data-action="page-previous"${currentPage === 1 ? ' disabled' : ''}>上一页</button>
            <span class="page-numbers">${pageButtons}</span>
            <span class="page-position" data-page-position>第 ${currentPage} / ${pageCount} 页</span>
            <button type="button" class="page-button page-step" data-action="page-next"${currentPage === pageCount ? ' disabled' : ''}>下一页</button>
          </div>
          <form class="pagination-jump" data-form="pagination-jump">
            <label for="page-number">跳至</label>
            <input id="page-number" name="page-number" type="number" inputmode="numeric" min="1" max="${pageCount}" aria-label="跳转页码">
            <button type="submit" class="page-button">跳转</button>
          </form>
        </div>
      </nav>`;
  }

  function renderInterview(interview) {
    const application = data.applications.find(item => item.id === interview.applicationId);
    const company = application?.company ?? '关联岗位已删除';
    const role = application?.role ?? '未知岗位';
    const rating = interview.rating === null || interview.rating === undefined || interview.rating === ''
      ? '未评分'
      : `${interview.rating}/5`;
    const mutationDisabled = initialLoading ? ' disabled' : '';
    return `
      <article class="interview-card" data-interview-id="${escapeAttribute(interview.id)}">
        <div>
          <h3>${escapeHtml(company)} · ${escapeHtml(role)}</h3>
          <p class="interview-meta">${escapeHtml(interview.stage || '面试轮次未填写')} · ${formatDate(interview.date)} · 自评 ${escapeHtml(rating)}</p>
          <p><strong>问题：</strong>${escapeHtml(truncate(interview.questions))}</p>
        </div>
        <div class="card-actions" aria-label="面试操作">
          <button type="button" class="button-link" data-action="edit-interview" data-id="${escapeAttribute(interview.id)}"${mutationDisabled}>编辑</button>
          <button type="button" class="button-link danger-link" data-action="delete-interview" data-id="${escapeAttribute(interview.id)}"${mutationDisabled}>删除</button>
        </div>
      </article>`;
  }

  function renderApplicationModal(form) {
    const editing = Boolean(form.id);
    return `
      <section class="modal-backdrop" data-modal-backdrop>
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="application-modal-title">
          <header class="modal-header">
            <h2 id="application-modal-title">${editing ? '编辑投递记录' : '新增投递记录'}</h2>
            <button type="button" class="icon-button" data-action="close-modal" aria-label="关闭">×</button>
          </header>
          <form data-form="application" class="record-form" novalidate>
            <p class="form-message is-error" data-form-error aria-live="polite"></p>
            <input name="id" type="hidden" value="${escapeAttribute(form.id)}">
            <div class="form-grid">
              <label>公司名称<input name="company" required value="${escapeAttribute(form.company)}"></label>
              <label>岗位名称<input name="role" required value="${escapeAttribute(form.role)}"></label>
              <label>工作地点<input name="location" value="${escapeAttribute(form.location)}"></label>
              <label>投递渠道<input name="channel" value="${escapeAttribute(form.channel)}"></label>
              <label>投递日期<input name="appliedDate" type="date" value="${escapeAttribute(form.appliedDate)}"></label>
              <label>当前状态<select name="status">${statusOptions(form.status)}</select></label>
              <label>下一步行动<input name="nextAction" value="${escapeAttribute(form.nextAction)}"></label>
              <label>跟进日期<input name="nextDate" type="date" value="${escapeAttribute(form.nextDate)}"></label>
              <label>薪资范围<input name="salary" value="${escapeAttribute(form.salary)}"></label>
              <label>联系人<input name="contact" value="${escapeAttribute(form.contact)}"></label>
              <label class="full-width">职位链接<input name="jobUrl" type="url" inputmode="url" value="${escapeAttribute(form.jobUrl)}"></label>
              <label class="full-width">标签（用逗号分隔）<input name="tags" value="${escapeAttribute(form.tags)}"></label>
              <label class="full-width">备注<textarea name="notes" rows="4">${escapeHtml(form.notes)}</textarea></label>
            </div>
            <footer class="modal-actions">
              <button type="button" class="button-secondary" data-action="close-modal">取消</button>
              <button type="submit">${editing ? '保存修改' : '保存投递'}</button>
            </footer>
          </form>
        </div>
      </section>`;
  }

  function renderInterviewModal(form) {
    const editing = Boolean(form.id);
    return `
      <section class="modal-backdrop" data-modal-backdrop>
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="interview-modal-title">
          <header class="modal-header">
            <h2 id="interview-modal-title">${editing ? '编辑面试复盘' : '新增面试复盘'}</h2>
            <button type="button" class="icon-button" data-action="close-modal" aria-label="关闭">×</button>
          </header>
          <form data-form="interview" class="record-form" novalidate>
            <p class="form-message is-error" data-form-error aria-live="polite"></p>
            <input name="id" type="hidden" value="${escapeAttribute(form.id)}">
            <div class="form-grid">
              <label class="full-width">关联岗位<select name="applicationId" required>
                <option value="">请选择岗位</option>
                ${data.applications.map(application => `<option value="${escapeAttribute(application.id)}" ${application.id === form.applicationId ? 'selected' : ''}>${escapeHtml(application.company)} · ${escapeHtml(application.role)}</option>`).join('')}
              </select></label>
              <label>面试日期<input name="date" type="date" required value="${escapeAttribute(form.date)}"></label>
              <label>面试轮次<input name="stage" required value="${escapeAttribute(form.stage)}" placeholder="如：一面"></label>
              <label>自评分数<select name="rating"><option value="" ${form.rating === '' ? 'selected' : ''}>未评分</option>${[0, 1, 2, 3, 4, 5].map(value => `<option value="${value}" ${String(form.rating) === String(value) ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
              <label class="full-width">面试问题<textarea name="questions" rows="3">${escapeHtml(form.questions)}</textarea></label>
              <label class="full-width">回答与亮点<textarea name="highlights" rows="3">${escapeHtml(form.highlights)}</textarea></label>
              <label class="full-width">卡点与不足<textarea name="gaps" rows="3">${escapeHtml(form.gaps)}</textarea></label>
              <label class="full-width">下一步改进<textarea name="nextPlan" rows="3">${escapeHtml(form.nextPlan)}</textarea></label>
              <label class="full-width">结果或面试官反馈<textarea name="feedback" rows="3">${escapeHtml(form.feedback)}</textarea></label>
            </div>
            <footer class="modal-actions">
              <button type="button" class="button-secondary" data-action="close-modal">取消</button>
              <button type="submit">${editing ? '保存复盘' : '保存复盘'}</button>
            </footer>
          </form>
        </div>
      </section>`;
  }

  function renderDetailsModal(application) {
    const history = data.statusHistory.filter(item => item.applicationId === application.id);
    const url = safeUrl(application.jobUrl);
    return `
      <section class="modal-backdrop" data-modal-backdrop>
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="details-modal-title">
          <header class="modal-header">
            <h2 id="details-modal-title">${escapeHtml(application.company)} · ${escapeHtml(application.role)}</h2>
            <button type="button" class="icon-button" data-action="close-modal" aria-label="关闭">×</button>
          </header>
          <div class="details-content">
            <p><strong>状态：</strong>${escapeHtml(application.status || '准备投递')}</p>
            <p><strong>地点：</strong>${escapeHtml(application.location || '未填写')}</p>
            <p><strong>渠道：</strong>${escapeHtml(application.channel || '未填写')}</p>
            <p><strong>投递日期：</strong>${formatDate(application.appliedDate)}</p>
            <p><strong>薪资：</strong>${escapeHtml(application.salary || '未填写')}</p>
            <p><strong>联系人：</strong>${escapeHtml(application.contact || '未填写')}</p>
            <p><strong>下一步：</strong>${escapeHtml(application.nextAction || '未填写')} ${application.nextDate ? `（${formatDate(application.nextDate)}）` : ''}</p>
            <p><strong>职位链接：</strong>${url ? `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">安全打开职位页面</a>` : '未填写或链接无效'}</p>
            <p><strong>标签：</strong>${escapeHtml((application.tags ?? []).join('、') || '未填写')}</p>
            <p><strong>备注：</strong>${escapeHtml(application.notes || '未填写')}</p>
            <section class="status-history" aria-labelledby="history-title">
              <h3 id="history-title">状态时间线</h3>
              ${history.length ? `<ol>${history.map(item => `<li>${formatDate(item.changedAt, '时间未记录')} · ${escapeHtml(item.status)}</li>`).join('')}</ol>` : '<p>暂无状态历史。</p>'}
            </section>
          </div>
          <footer class="modal-actions">
            <button type="button" class="button-secondary" data-action="close-modal">关闭</button>
            <button type="button" data-action="edit-application" data-id="${escapeAttribute(application.id)}">编辑投递</button>
          </footer>
        </div>
      </section>`;
  }

  function renderModal() {
    if (!modal) return '';
    if (modal.type === 'application') return renderApplicationModal(modal.form);
    if (modal.type === 'interview') return renderInterviewModal(modal.form);
    if (modal.type === 'details') return renderDetailsModal(modal.application);
    return '';
  }

  function render() {
    if (destroyed) return;
    const count = stats();
    const groups = filteredGroups();
    const pageCount = Math.max(1, Math.ceil(groups.length / COMPANY_GROUPS_PER_PAGE));
    currentPage = Math.min(Math.max(currentPage, 1), pageCount);
    const pageStart = (currentPage - 1) * COMPANY_GROUPS_PER_PAGE;
    const visibleGroups = groups.slice(pageStart, pageStart + COMPANY_GROUPS_PER_PAGE);
    const mutationDisabled = initialLoading ? ' disabled' : '';
    const exportDisabled = initialLoading ? ' disabled' : '';
    root.innerHTML = `
      <main class="tracker-shell" aria-labelledby="tracker-title">
        <header class="app-header">
          <div class="brand-lockup">
            <span class="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false"><path d="M8 7V5.8A1.8 1.8 0 0 1 9.8 4h4.4A1.8 1.8 0 0 1 16 5.8V7M5.5 7h13A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9A1.5 1.5 0 0 1 5.5 7Zm-1.5 4.5c2.3 1 5 1.5 8 1.5s5.7-.5 8-1.5M12 12v2"/></svg>
            </span>
            <div>
              <p class="brand-title">求职进度板</p>
              <p class="brand-subtitle">记录每一次投递，也记住每一次成长</p>
            </div>
          </div>
          <div class="header-actions">
            <span class="sync-status" data-sync-status aria-live="polite">${escapeHtml(syncState)}</span>
            ${reloadOnlyRetry ? '<button type="button" class="button-secondary" data-action="retry-reload">重新加载</button>' : ''}
            <button type="button" class="button-secondary header-button" data-action="export-backup"${exportDisabled}>
              <span aria-hidden="true">↓</span> 导出备份
            </button>
            <button type="button" class="primary-button header-button" data-action="add-application"${mutationDisabled}>
              <span aria-hidden="true">＋</span> 新增投递
            </button>
            <button type="button" class="quiet-button" data-action="sign-out">退出</button>
          </div>
        </header>
        <section class="tracker-hero">
          <div class="hero-copy">
            <p class="eyebrow">你的求职进度，一目了然</p>
            <h1 id="tracker-title">每个岗位都一目了然</h1>
            <p>从投递到面试，再到录用，让你的求职之路井然有序。</p>
          </div>
          ${renderDailyGoal()}
        </section>
        <section class="stats-grid" aria-label="求职概览">
          <article data-metric="total">
            <span class="metric-icon metric-icon-blue" aria-hidden="true">⌁</span>
            <div><strong>${count.total}</strong><span class="metric-label">全部投递</span></div>
          </article>
          <article data-metric="interviewing">
            <span class="metric-icon metric-icon-cyan" aria-hidden="true">···</span>
            <div><strong>${count.interviewing}</strong><span class="metric-label">面试进行中</span></div>
          </article>
          <article data-metric="offered">
            <span class="metric-icon metric-icon-green" aria-hidden="true">✓</span>
            <div><strong>${count.offered}</strong><span class="metric-label">已获录用</span></div>
          </article>
          <article data-metric="due-soon">
            <span class="metric-icon metric-icon-amber" aria-hidden="true">◷</span>
            <div><strong>${count.dueSoon}</strong><span class="metric-label">7天内待跟进</span></div>
          </article>
        </section>
        <nav class="section-tabs" aria-label="进度内容">
          <a class="is-active" href="#applications-title">投递记录</a>
          <a href="#interviews-title">面试问题与复盘</a>
        </nav>
        <section class="tracker-section applications-section" aria-labelledby="applications-title">
          <div class="section-heading">
            <div><h2 id="applications-title">投递记录</h2><p>按公司归组，始终按最近活动排序。</p></div>
            <span class="sort-indicator" aria-label="当前排序">最近更新</span>
          </div>
          <div class="filters" aria-label="筛选投递记录">
            <label class="search-field"><span class="visually-hidden">搜索岗位或公司</span><input name="search-query" type="search" value="${escapeAttribute(filters.query)}" placeholder="搜索公司、岗位、标签或备注"></label>
            <label class="status-field"><span class="visually-hidden">状态筛选</span><select name="status-filter"><option value="">全部状态</option>${statusOptions(filters.status)}</select></label>
          </div>
          <div class="company-groups">${renderGroups(visibleGroups)}</div>
          ${renderPagination(groups, pageCount)}
        </section>
        <section class="tracker-section" aria-labelledby="interviews-title">
          <div class="section-heading">
            <div><h2 id="interviews-title">面试问题与复盘</h2><p>记录问题、亮点与下一次改进。</p></div>
            <button type="button" data-action="add-interview"${mutationDisabled}>新增面试复盘</button>
          </div>
          <div class="interview-list">${data.interviews.length ? data.interviews.map(renderInterview).join('') : '<p class="empty-state">暂无面试复盘。</p>'}</div>
        </section>
      </main>
      ${renderModal()}`;
  }

  function setSync(nextState) {
    syncState = nextState;
    const element = root.querySelector('[data-sync-status]');
    if (element) element.textContent = nextState;
  }

  async function reload() {
    const generation = ++loadGeneration;
    let nextData;
    try {
      nextData = normalizeData(await trackerService.loadAll());
    } catch (error) {
      if (generation !== loadGeneration || destroyed) return false;
      throw error;
    }
    if (generation !== loadGeneration || destroyed) return false;
    data = nextData;
    reloadOnlyRetry = false;
    return true;
  }

  function ensureAutomaticCheckin() {
    const goal = dailyGoalSnapshot();
    if (!data.checkinsAvailable || goal.checkedIn || goal.completed < goal.target || destroyed) return null;
    return trackerService.saveCheckin({
      checkinDate: goal.today,
      goalTarget: goal.target,
      completedCount: goal.completed,
      source: 'automatic'
    }).then(checkin => {
      data.checkins = [checkin, ...data.checkins.filter(item => item.checkinDate !== goal.today)];
    });
  }

  async function saveDailyGoal(form) {
    if (mutationInFlight || destroyed) return;
    const target = Number(form.elements['daily-target'].value);
    if (!Number.isInteger(target) || target < 1 || target > 99) {
      checkinFeedback = '每日目标需为 1–99 之间的整数';
      render();
      return;
    }
    mutationInFlight = true;
    setSync('正在同步');
    try {
      data.dailyGoal = await trackerService.saveDailyGoal(target);
      const automaticCheckin = ensureAutomaticCheckin();
      if (automaticCheckin) await automaticCheckin;
      checkinFeedback = '每日目标已更新';
      syncState = '已同步';
      render();
    } catch {
      checkinFeedback = '目标同步失败，请重试';
      setSync('同步失败，请重试');
      render();
    } finally {
      mutationInFlight = false;
    }
  }

  async function saveMakeupCheckin(form) {
    if (mutationInFlight || destroyed) return;
    const checkinDate = form.elements['makeup-date'].value;
    const goal = dailyGoalSnapshot();
    if (!checkinDate || checkinDate >= goal.today) {
      checkinFeedback = '请选择今天之前的日期进行补签';
      render();
      return;
    }
    mutationInFlight = true;
    setSync('正在同步');
    try {
      const checkin = await trackerService.saveCheckin({
        checkinDate,
        goalTarget: goal.target,
        completedCount: goal.target,
        source: 'makeup'
      });
      data.checkins = [checkin, ...data.checkins.filter(item => item.checkinDate !== checkinDate)];
      checkinFeedback = `${checkinDate} 已补签`;
      syncState = '已同步';
      render();
    } catch {
      checkinFeedback = '补签同步失败，请重试';
      setSync('同步失败，请重试');
      render();
    } finally {
      mutationInFlight = false;
    }
  }

  function scheduleGoalRefresh() {
    if (goalRefreshTimer) clearTimeout(goalRefreshTimer);
    const now = new Date();
    const today = chinaDateKey(now);
    const boundaries = [
      Date.parse(`${today}T12:00:00Z`),
      Date.parse(`${today}T14:00:00Z`),
      Date.parse(`${today}T16:00:00Z`)
    ];
    const nextBoundary = boundaries.find(timestamp => timestamp > now.valueOf())
      ?? boundaries[0] + 24 * 60 * 60 * 1000;
    goalRefreshTimer = setTimeout(() => {
      if (destroyed) return;
      render();
      scheduleGoalRefresh();
    }, Math.max(1, nextBoundary - now.valueOf()));
  }

  function openApplication(application) {
    if (mutationInFlight) return;
    modal = { type: 'application', form: applicationForm(application) };
    render();
    root.querySelector('[name="company"]')?.focus();
  }

  function openInterview(interview, applicationId = '') {
    if (mutationInFlight) return;
    modal = { type: 'interview', form: interviewForm({ ...interview, applicationId: interview?.applicationId ?? applicationId }) };
    render();
    root.querySelector('[name="applicationId"]')?.focus();
  }

  function openDetails(application) {
    if (mutationInFlight) return;
    modal = { type: 'details', application };
    render();
    root.querySelector('[data-action="close-modal"]')?.focus();
  }

  function closeModal() {
    if (mutationInFlight) return;
    modal = null;
    render();
  }

  function valuesFromForm(form) {
    const value = name => form.elements.namedItem(name)?.value ?? '';
    if (form.dataset.form === 'application') {
      return {
        id: value('id'), company: value('company').trim(), role: value('role').trim(),
        location: value('location').trim(), channel: value('channel').trim(), appliedDate: value('appliedDate'),
        status: value('status'), nextAction: value('nextAction').trim(), nextDate: value('nextDate'),
        salary: value('salary').trim(), contact: value('contact').trim(), jobUrl: value('jobUrl').trim(),
        tags: value('tags'), notes: value('notes').trim()
      };
    }
    return {
      id: value('id'), applicationId: value('applicationId'), date: value('date'), stage: value('stage').trim(),
      rating: value('rating'), questions: value('questions').trim(), highlights: value('highlights').trim(),
      gaps: value('gaps').trim(), nextPlan: value('nextPlan').trim(), feedback: value('feedback').trim()
    };
  }

  function setSubmitting(form, pending) {
    form.querySelectorAll('button, input, select, textarea').forEach(control => {
      control.disabled = pending;
    });
  }

  async function saveForm(form) {
    if (mutationInFlight || destroyed) return;
    const values = valuesFromForm(form);
    const formError = form.querySelector('[data-form-error]');
    if (form.dataset.form === 'application' && (!values.company || !values.role)) {
      formError.textContent = '请填写公司和岗位名称';
      return;
    }
    if (form.dataset.form === 'interview' && (!values.applicationId || !values.date || !values.stage)) {
      formError.textContent = '请选择关联岗位并填写面试日期和轮次';
      return;
    }

    mutationInFlight = true;
    formError.textContent = '';
    setSubmitting(form, true);
    setSync('正在同步');
    try {
      if (form.dataset.form === 'application') await trackerService.saveApplication(values);
      else await trackerService.saveInterview(values);
      if (destroyed) return;
    } catch {
      if (destroyed) return;
      setSubmitting(form, false);
      formError.textContent = '同步失败，请重试';
      setSync('同步失败，请重试');
      mutationInFlight = false;
      return;
    }

    try {
      const applied = await reload();
      if (destroyed) return;
      if (!applied) return;
      const automaticCheckin = ensureAutomaticCheckin();
      if (automaticCheckin) await automaticCheckin;
      modal = null;
      syncState = '已同步';
      render();
    } catch {
      if (destroyed) return;
      modal = null;
      reloadOnlyRetry = true;
      syncState = '已保存，但刷新失败，请重新加载';
      render();
    } finally {
      mutationInFlight = false;
    }
  }

  async function deleteRecord(kind, id) {
    if (mutationInFlight || destroyed) return;
    const text = kind === 'application'
      ? '删除该投递记录？关联的面试记录和状态历史将一并删除，且无法恢复。'
      : '删除这条面试复盘？此操作无法恢复。';
    if (!globalThis.confirm(text)) return;

    mutationInFlight = true;
    setSync('正在同步');
    try {
      if (kind === 'application') await trackerService.deleteApplication(id);
      else await trackerService.deleteInterview(id);
      if (destroyed) return;
      const applied = await reload();
      if (destroyed) return;
      if (!applied) return;
      modal = null;
      syncState = '已同步';
      render();
    } catch {
      if (!destroyed) setSync('同步失败，请重试');
    } finally {
      mutationInFlight = false;
    }
  }

  async function exportBackup() {
    if (exportInFlight || mutationInFlight || destroyed) return;

    exportInFlight = true;
    setSync('正在同步');
    try {
      const applied = await reload();
      if (destroyed) return;
      if (!applied) return;
      downloadBackup(data, documentRef);
      syncState = '已同步';
      render();
    } catch {
      if (!destroyed) setSync('同步失败，请重试');
    } finally {
      exportInFlight = false;
    }
  }

  async function retryReload() {
    if (mutationInFlight || exportInFlight || destroyed) return;

    exportInFlight = true;
    setSync('正在同步');
    try {
      const applied = await reload();
      if (destroyed) return;
      if (!applied) return;
      syncState = '已同步';
      render();
    } catch {
      if (destroyed) return;
      reloadOnlyRetry = true;
      syncState = '已保存，但刷新失败，请重新加载';
      render();
    } finally {
      exportInFlight = false;
    }
  }

  async function signOut() {
    if (signOutInFlight || destroyed) return;
    signOutInFlight = true;
    setSync('正在同步');
    try {
      await authService.signOut();
    } catch {
      if (!destroyed) setSync('同步失败，请重试');
    } finally {
      signOutInFlight = false;
    }
  }

  function onClick(event) {
    const control = event.target.closest('[data-action]');
    if (!control || !root.contains(control)) return;
    event.preventDefault();
    const mutationActions = new Set([
      'add-application',
      'edit-application',
      'view-application',
      'delete-application',
      'add-interview',
      'edit-interview',
      'delete-interview',
      'export-backup'
    ]);
    if (initialLoading && mutationActions.has(control.dataset.action)) return;
    const application = data.applications.find(item => item.id === control.dataset.id);
    const interview = data.interviews.find(item => item.id === control.dataset.id);

    switch (control.dataset.action) {
      case 'page-previous': currentPage = Math.max(1, currentPage - 1); render(); break;
      case 'page-next': currentPage += 1; render(); break;
      case 'set-page': currentPage = Number(control.dataset.page) || 1; render(); break;
      case 'add-application': openApplication(); break;
      case 'edit-application': if (application) openApplication(application); break;
      case 'view-application': if (application) openDetails(application); break;
      case 'delete-application': deleteRecord('application', control.dataset.id); break;
      case 'add-interview': openInterview(undefined, control.dataset.prefillApplicationId); break;
      case 'edit-interview': if (interview) openInterview(interview); break;
      case 'delete-interview': deleteRecord('interview', control.dataset.id); break;
      case 'close-modal': closeModal(); break;
      case 'export-backup': exportBackup(); break;
      case 'retry-reload': retryReload(); break;
      case 'sign-out': signOut(); break;
      default: break;
    }
  }

  function onInput(event) {
    if (event.target.name === 'search-query') {
      filters.query = event.target.value;
      currentPage = 1;
      render();
      root.querySelector('[name="search-query"]')?.focus();
    }
  }

  function onChange(event) {
    if (event.target.name === 'status-filter') {
      filters.status = event.target.value;
      currentPage = 1;
      render();
      root.querySelector('[name="status-filter"]')?.focus();
    }
  }

  function onSubmit(event) {
    const form = event.target.closest('form[data-form]');
    if (!form || !root.contains(form)) return;
    event.preventDefault();
    if (form.dataset.form === 'daily-goal') {
      void saveDailyGoal(form);
      return;
    }
    if (form.dataset.form === 'makeup-checkin') {
      void saveMakeupCheckin(form);
      return;
    }
    if (form.dataset.form === 'pagination-jump') {
      const requestedPage = Number(form.elements['page-number'].value);
      if (Number.isFinite(requestedPage)) currentPage = Math.max(1, Math.floor(requestedPage));
      render();
      return;
    }
    saveForm(form);
  }

  function onKeydown(event) {
    if (event.key === 'Escape' && modal) {
      event.preventDefault();
      closeModal();
    }
  }

  return {
    async mount() {
      if (destroyed || mounted) return;
      mounted = true;
      root.addEventListener('click', onClick);
      root.addEventListener('input', onInput);
      root.addEventListener('change', onChange);
      root.addEventListener('submit', onSubmit);
      documentRef.addEventListener('keydown', onKeydown);
      render();
      try {
        const applied = await reload();
        if (destroyed) return;
        if (applied) {
          const automaticCheckin = ensureAutomaticCheckin();
          if (automaticCheckin) await automaticCheckin;
          syncState = '已同步';
        }
      } catch {
        if (destroyed) return;
        syncState = '同步失败，请重试';
      } finally {
        initialLoading = false;
      }
      scheduleGoalRefresh();
      render();
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      root.removeEventListener('click', onClick);
      root.removeEventListener('input', onInput);
      root.removeEventListener('change', onChange);
      root.removeEventListener('submit', onSubmit);
      documentRef.removeEventListener('keydown', onKeydown);
      if (goalRefreshTimer) clearTimeout(goalRefreshTimer);
      goalRefreshTimer = null;
      root.replaceChildren();
    }
  };
}
