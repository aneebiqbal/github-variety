(function () {
  'use strict';

  // ====== State ======
  var TOKEN_KEY = 'gv_admin_token';
  var token = null;
  var editingProjectId = null;
  var projectsCache = [];

  // ====== Element refs ======
  var $ = function (id) { return document.getElementById(id); };
  var loginScreen = $('login-screen');
  var dashboardEl = $('dashboard');
  var loginForm = $('login-form');
  var loginPassword = $('login-password');
  var loginError = $('login-error');
  var logoutBtn = $('logout-btn');
  var addProjectBtn = $('add-project-btn');
  var projectsTbody = $('projects-tbody');
  var projectsEmpty = $('projects-empty');

  var projectModal = $('project-modal');
  var projectForm = $('project-form');
  var projectModalTitle = $('project-modal-title');
  var pfName = $('pf-name');
  var pfKey = $('pf-key');
  var pfOwner = $('pf-owner');
  var pfRepo = $('pf-repo');
  var pfInstall = $('pf-install');
  var pfActive = $('pf-active');
  var projectError = $('project-error');

  var snippetModal = $('snippet-modal');
  var snippetCode = $('snippet-code');
  var snippetCopyBtn = $('snippet-copy-btn');
  var snippetCopyMsg = $('snippet-copy-msg');

  var feedbacksModal = $('feedbacks-modal');
  var feedbacksTbody = $('feedbacks-tbody');
  var feedbacksEmpty = $('feedbacks-empty');
  var feedbacksProjectName = $('feedbacks-project-name');

  var toastEl = $('toast');

  // ====== Helpers ======
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    setTimeout(function () { toastEl.hidden = true; }, 2200);
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function apiBase() {
    // admin.js is served from <origin>/admin/admin.js, so same origin.
    return window.location.origin;
  }

  function authHeaders(extra) {
    var h = extra || {};
    h['x-admin-password'] = token || '';
    h['Content-Type'] = 'application/json';
    return h;
  }

  async function api(path, opts) {
    opts = opts || {};
    opts.headers = authHeaders(opts.headers || {});
    var res;
    try {
      res = await fetch(apiBase() + path, opts);
    } catch (networkErr) {
      console.error('Network error:', networkErr);
      throw new Error('Network error. Please check your connection.');
    }
    var body = null;
    var text = await res.text();
    if (text) {
      try { body = JSON.parse(text); } catch (e) { body = null; }
    }
    return { ok: res.ok, status: res.status, body: body, raw: text };
  }

  function showLogin() {
    loginScreen.hidden = false;
    dashboardEl.hidden = true;
    clearProjectModal();
  }

  function showDashboard() {
    loginScreen.hidden = true;
    dashboardEl.hidden = false;
    loadProjects();
  }

  function openModal(modalEl) { modalEl.hidden = false; }
  function closeModal(modalEl) { modalEl.hidden = true; }

  function clearProjectModal() {
    projectForm.reset();
    pfActive.checked = true;
    projectError.textContent = '';
    editingProjectId = null;
    projectModalTitle.textContent = 'Add New Project';
  }

  // ====== Auth flow ======
  function getStoredToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  function storeToken(t) {
    try { localStorage.setItem(TOKEN_KEY, t); } catch (e) {}
  }
  function clearStoredToken() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  async function verifyToken(t) {
    // Validate by attempting to list projects
    token = t;
    try {
      var r = await api('/api/admin/projects');
      return r.ok && r.body && r.body.success;
    } catch (e) {
      return false;
    }
  }

  async function init() {
    var saved = getStoredToken();
    if (saved) {
      var valid = await verifyToken(saved);
      if (valid) {
        storeToken(saved);
        showDashboard();
        return;
      } else {
        clearStoredToken();
        token = null;
      }
    }
    showLogin();
  }

  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    loginError.textContent = '';
    var pw = loginPassword.value;
    if (!pw) {
      loginError.textContent = 'Please enter the admin password.';
      return;
    }
    try {
      var res = await fetch(apiBase() + '/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw })
      });
      var body = await res.json().catch(function () { return null; });
      if (res.ok && body && body.success && body.token) {
        token = body.token;
        storeToken(token);
        loginPassword.value = '';
        showDashboard();
      } else {
        loginError.textContent = (body && body.error) ? body.error : 'Invalid password.';
      }
    } catch (err) {
      console.error(err);
      loginError.textContent = 'Network error. Please try again.';
    }
  });

  logoutBtn.addEventListener('click', function () {
    clearStoredToken();
    token = null;
    projectsCache = [];
    projectsTbody.innerHTML = '';
    showLogin();
    loginPassword.value = '';
    loginError.textContent = '';
  });

  // ====== Projects list ======
  async function loadProjects() {
    try {
      var r = await api('/api/admin/projects');
      if (r.ok && r.body && r.body.success) {
        projectsCache = r.body.projects || [];
        renderProjects(projectsCache);
      } else if (r.status === 401) {
        // token invalid
        clearStoredToken();
        token = null;
        showLogin();
        loginError.textContent = 'Session expired. Please log in again.';
      } else {
        showToast('Failed to load projects.');
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to load projects.');
    }
  }

  function renderProjects(projects) {
    projectsTbody.innerHTML = '';
    if (!projects || projects.length === 0) {
      projectsEmpty.hidden = false;
      return;
    }
    projectsEmpty.hidden = true;
    projects.forEach(function (p) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(p.name) + '</td>' +
        '<td class="key-cell">' + escapeHtml(p.projectKey) + '</td>' +
        '<td class="repo-cell">' + escapeHtml(p.githubOwner) + '/' + escapeHtml(p.githubRepo) + '</td>' +
        '<td><span class="badge ' + (p.isActive ? 'badge-active' : 'badge-inactive') + '">' +
          (p.isActive ? 'Active' : 'Inactive') + '</span></td>' +
        '<td>' + (p._count ? p._count.feedbacks : 0) + '</td>' +
        '<td class="actions-cell"><div class="row-actions">' +
          '<button class="btn btn-neutral btn-sm" data-act="edit" data-id="' + escapeHtml(p.id) + '">Edit</button>' +
          '<button class="btn btn-neutral btn-sm" data-act="view" data-id="' + escapeHtml(p.id) + '">View Feedbacks</button>' +
          '<button class="btn btn-danger btn-sm" data-act="delete" data-id="' + escapeHtml(p.id) + '">Delete</button>' +
        '</div></td>';
      projectsTbody.appendChild(tr);
    });
  }

  projectsTbody.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    var id = btn.getAttribute('data-id');
    var p = projectsCache.find(function (x) { return x.id === id; });
    if (act === 'edit' && p) openEditModal(p);
    else if (act === 'view' && p) openFeedbacksModal(p);
    else if (act === 'delete' && p) confirmDelete(p);
  });

  // ====== Add / Edit ======
  addProjectBtn.addEventListener('click', function () {
    clearProjectModal();
    openModal(projectModal);
  });

  function openEditModal(p) {
    clearProjectModal();
    editingProjectId = p.id;
    projectModalTitle.textContent = 'Edit Project';
    pfName.value = p.name || '';
    pfKey.value = p.projectKey || '';
    pfOwner.value = p.githubOwner || '';
    pfRepo.value = p.githubRepo || '';
    pfInstall.value = p.installationId || '';
    pfActive.checked = !!p.isActive;
    openModal(projectModal);
  }

  projectForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    projectError.textContent = '';

    var payload = {
      name: pfName.value.trim(),
      projectKey: pfKey.value.trim(),
      githubOwner: pfOwner.value.trim(),
      githubRepo: pfRepo.value.trim(),
      installationId: pfInstall.value.trim(),
      isActive: pfActive.checked
    };

    if (!payload.name || !payload.projectKey || !payload.githubOwner ||
        !payload.githubRepo || !payload.installationId) {
      projectError.textContent = 'All fields are required.';
      return;
    }

    try {
      if (editingProjectId) {
        var r = await api('/api/admin/projects/' + encodeURIComponent(editingProjectId), {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        if (r.ok && r.body && r.body.success) {
          closeModal(projectModal);
          showToast('Project updated.');
          await loadProjects();
        } else {
          projectError.textContent = (r.body && r.body.error) ? r.body.error : 'Failed to update project.';
        }
      } else {
        var created = await api('/api/admin/projects', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        if (created.ok && created.body && created.body.success && created.body.project) {
          closeModal(projectModal);
          await loadProjects();
          showSnippet(created.body.widgetSnippet);
        } else {
          projectError.textContent = (created.body && created.body.error)
            ? created.body.error
            : 'Failed to create project.';
        }
      }
    } catch (err) {
      console.error(err);
      projectError.textContent = 'Something went wrong. Please try again.';
    }
  });

  // ====== Delete ======
  function confirmDelete(p) {
    var ok = window.confirm('Are you sure you want to delete this project and all its feedback?');
    if (!ok) return;
    (async function () {
      try {
        var r = await api('/api/admin/projects/' + encodeURIComponent(p.id), { method: 'DELETE' });
        if (r.ok && r.body && r.body.success) {
          showToast('Project deleted.');
          await loadProjects();
        } else {
          showToast((r.body && r.body.error) ? r.body.error : 'Failed to delete project.');
        }
      } catch (err) {
        console.error(err);
        showToast('Something went wrong. Please try again.');
      }
    })();
  }

  // ====== Snippet ======
  function showSnippet(snippet) {
    snippetCode.textContent = snippet || '';
    snippetCopyMsg.hidden = true;
    openModal(snippetModal);
  }

  snippetCopyBtn.addEventListener('click', async function () {
    var text = snippetCode.textContent || '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      snippetCopyMsg.hidden = false;
      setTimeout(function () { snippetCopyMsg.hidden = true; }, 1800);
    } catch (err) {
      // Fallback
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        snippetCopyMsg.hidden = false;
        setTimeout(function () { snippetCopyMsg.hidden = true; }, 1800);
      } catch (e2) {
        showToast('Copy failed. Please select and copy manually.');
      }
    }
  });

  // ====== Feedbacks ======
  async function openFeedbacksModal(p) {
    feedbacksProjectName.textContent = '— ' + p.name;
    feedbacksTbody.innerHTML = '';
    feedbacksEmpty.hidden = true;
    openModal(feedbacksModal);
    try {
      var r = await api('/api/admin/feedbacks/' + encodeURIComponent(p.id));
      if (r.ok && r.body && r.body.success) {
        renderFeedbacks(r.body.feedbacks || []);
      } else {
        showToast((r.body && r.body.error) ? r.body.error : 'Failed to load feedback.');
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to load feedback.');
    }
  }

  function statusBadge(status) {
    var s = (status || 'PENDING').toUpperCase();
    return '<span class="badge badge-status-' + s + '">' + s + '</span>';
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      var opts = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
      return d.toLocaleString(undefined, opts);
    } catch (e) { return iso; }
  }

  function renderFeedbacks(feedbacks) {
    feedbacksTbody.innerHTML = '';
    if (!feedbacks || feedbacks.length === 0) {
      feedbacksEmpty.hidden = false;
      return;
    }
    feedbacksEmpty.hidden = true;
    feedbacks.forEach(function (f) {
      var tr = document.createElement('tr');
      tr.className = 'feedback-row';
      tr.setAttribute('data-id', f.id);
      var issueCell;
      if (f.githubIssueUrl) {
        issueCell = '<a href="' + escapeHtml(f.githubIssueUrl) + '" target="_blank" rel="noopener noreferrer">View issue</a>';
      } else {
        issueCell = '—';
      }
      tr.innerHTML =
        '<td>' + escapeHtml(formatDate(f.createdAt)) + '</td>' +
        '<td>' + escapeHtml(f.reporterName) + '</td>' +
        '<td>' + escapeHtml(f.title) + '</td>' +
        '<td>' + statusBadge(f.status) + '</td>' +
        '<td>' + issueCell + '</td>';
      feedbacksTbody.appendChild(tr);

      // Hidden detail row
      var detail = document.createElement('tr');
      detail.className = 'feedback-description-row';
      detail.hidden = true;
      var detailTd = document.createElement('td');
      detailTd.colSpan = 5;
      detailTd.innerHTML =
        '<div>' + escapeHtml(f.description) + '</div>' +
        '<div class="feedback-meta-line">Page URL: ' +
          (f.pageUrl ? ('<a href="' + escapeHtml(f.pageUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(f.pageUrl) + '</a>') : '—') +
        '</div>';
      detail.appendChild(detailTd);
      feedbacksTbody.appendChild(detail);

      tr.addEventListener('click', function () {
        detail.hidden = !detail.hidden;
      });
    });
  }

  // ====== Global listeners ======
  // Close buttons via data-close
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-close]');
    if (!btn) return;
    var id = btn.getAttribute('data-close');
    var modal = $(id);
    if (modal) closeModal(modal);
  });

  // Click on overlay background closes modal
  document.addEventListener('mousedown', function (e) {
    if (!e.target.classList || !e.target.classList.contains('modal-overlay')) return;
    closeModal(e.target);
  });

  // Escape closes any open modal
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var modals = document.querySelectorAll('.modal-overlay:not([hidden])');
    modals.forEach(function (m) { closeModal(m); });
  });

  // ====== Init ======
  init();
})();