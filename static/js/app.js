(() => {
  const ROLE_LABELS = {
    executive_producer: 'Executive Producer',
    casting_director: 'Casting Director',
    casting_assistant: 'Casting Assistant',
    public: 'Signed Out (Public)',
  };

  const ALL_PERMISSIONS = [
    { perm: 'get:movies', endpoint: 'GET /movies' },
    { perm: 'post:movies', endpoint: 'POST /movies' },
    { perm: 'patch:movies', endpoint: 'PATCH /movies/:id' },
    { perm: 'delete:movies', endpoint: 'DELETE /movies/:id' },
    { perm: 'get:actors', endpoint: 'GET /actors' },
    { perm: 'post:actors', endpoint: 'POST /actors' },
    { perm: 'patch:actors', endpoint: 'PATCH /actors/:id' },
    { perm: 'delete:actors', endpoint: 'DELETE /actors/:id' },
  ];

  const state = {
    activeTab: 'overview',
    role: localStorage.getItem('casting_role') || 'executive_producer',
    customJwt: localStorage.getItem('casting_custom_jwt') || '',
    authConfig: null,
    movies: [],
    actors: [],
    apiLog: [],
    activeCastMovieId: null,
    pendingDelete: null,
  };

  const el = {
    roleSelect: document.getElementById('role-select'),
    authModeLabel: document.getElementById('auth-mode-label'),
    signedOutBanner: document.getElementById('signed-out-banner'),
    viewSections: document.querySelectorAll('.view-section'),
    navTabs: document.querySelectorAll('.nav-tab'),
    navMoviesCount: document.getElementById('nav-movies-count'),
    navActorsCount: document.getElementById('nav-actors-count'),
    heroRoleBadge: document.getElementById('hero-role-badge'),
    heroPermsList: document.getElementById('hero-permissions-list'),
    heroAddMovieBtn: document.getElementById('hero-add-movie-btn'),
    heroAddActorBtn: document.getElementById('hero-add-actor-btn'),
    addMovieBtn: document.getElementById('add-movie-btn'),
    addActorBtn: document.getElementById('add-actor-btn'),
    kpiMovies: document.getElementById('kpi-movies'),
    kpiActors: document.getElementById('kpi-actors'),
    kpiCast: document.getElementById('kpi-cast'),
    kpiUnassignedSub: document.getElementById('kpi-unassigned-sub'),
    kpiPerms: document.getElementById('kpi-perms'),
    kpiRoleSub: document.getElementById('kpi-role-sub'),
    overviewMoviesList: document.getElementById('overview-movies-list'),
    overviewActorsList: document.getElementById('overview-actors-list'),
    moviesGrid: document.getElementById('movies-grid'),
    actorsGrid: document.getElementById('actors-grid'),
    movieSearch: document.getElementById('movie-search'),
    movieSort: document.getElementById('movie-sort'),
    actorSearch: document.getElementById('actor-search'),
    actorGenderFilter: document.getElementById('actor-gender-filter'),
    actorMovieFilter: document.getElementById('actor-movie-filter'),
    actorSort: document.getElementById('actor-sort'),
    rbacMatrixBody: document.getElementById('rbac-matrix-body'),
    apiTesterForm: document.getElementById('api-tester-form'),
    apiMethod: document.getElementById('api-method'),
    apiPath: document.getElementById('api-path'),
    apiBody: document.getElementById('api-body'),
    apiOutput: document.getElementById('api-tester-output'),
    apiOutputStatus: document.getElementById('api-output-status'),
    apiOutputUrl: document.getElementById('api-output-url'),
    apiOutputJson: document.getElementById('api-output-json'),
    apiLogList: document.getElementById('api-log-list'),
    toastContainer: document.getElementById('toast-container'),
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getPermissionsForRole() {
    if (state.customJwt) {
      try {
        const parts = state.customJwt.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          if (Array.isArray(payload.permissions)) {
            return payload.permissions;
          }
        }
      } catch (_) {
        return [];
      }
      return [];
    }
    if (state.role === 'public' || !state.authConfig?.roles) {
      return [];
    }
    return state.authConfig.roles[state.role] || [];
  }

  function hasPermission(permission) {
    return getPermissionsForRole().includes(permission);
  }

  function getAuthHeader() {
    if (state.customJwt) {
      return `Bearer ${state.customJwt}`;
    }
    if (state.role === 'public') {
      return null;
    }
    return `Bearer demo:${state.role}`;
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    el.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3600);
  }

  function recordApiLog(method, path, status) {
    state.apiLog.unshift({
      method,
      path,
      status,
      time: new Date().toLocaleTimeString(),
    });
    state.apiLog = state.apiLog.slice(0, 25);
    renderApiLog();
  }

  async function apiFetch(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = { ...(options.headers || {}) };
    const authHeader = getAuthHeader();
    if (authHeader) {
      headers.Authorization = authHeader;
    }
    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(path, {
      ...options,
      method,
      headers,
    });
    let data = {};
    try {
      data = await res.json();
    } catch (_) {
      data = { success: false, message: res.statusText };
    }
    recordApiLog(method, path, res.status);
    return { status: res.status, ok: res.ok, data };
  }

  function switchTab(tabName) {
    state.activeTab = tabName;
    el.navTabs.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    el.viewSections.forEach((sec) => {
      sec.classList.toggle('active', sec.id === `view-${tabName}`);
    });
  }

  function openModal(id) {
    document.getElementById(id)?.classList.remove('hidden');
  }

  function closeModal(id) {
    document.getElementById(id)?.classList.add('hidden');
  }

  function formatDateDisplay(dateStr) {
    if (!dateStr) return 'TBD';
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function isUpcoming(dateStr) {
    if (!dateStr) return true;
    const today = new Date().toISOString().slice(0, 10);
    return dateStr >= today;
  }

  function getInitials(name) {
    return String(name || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('');
  }

  function updateRoleUI() {
    el.roleSelect.value = state.role;
    const perms = getPermissionsForRole();
    const isSignedOut = !state.customJwt && state.role === 'public';

    el.authModeLabel.textContent = state.customJwt
      ? 'Custom JWT'
      : state.authConfig?.auth_mode === 'auth0'
      ? 'Auth0 Mode'
      : 'Studio Mode';

    el.signedOutBanner.classList.toggle('hidden', !isSignedOut);

    el.heroRoleBadge.textContent = state.customJwt
      ? 'Custom Bearer JWT'
      : ROLE_LABELS[state.role] || state.role;

    el.heroPermsList.innerHTML = perms.length
      ? perms.map((p) => `<span class="perm-pill">${escapeHtml(p)}</span>`).join('')
      : '<span class="perm-pill">No active permissions</span>';

    const canPostMovie = hasPermission('post:movies');
    const canPostActor = hasPermission('post:actors');

    [el.heroAddMovieBtn, el.addMovieBtn].forEach((btn) => {
      btn.classList.toggle('is-locked', !canPostMovie);
      btn.title = canPostMovie ? 'Create a new movie' : 'Requires Executive Producer (post:movies)';
    });

    [el.heroAddActorBtn, el.addActorBtn].forEach((btn) => {
      btn.classList.toggle('is-locked', !canPostActor);
      btn.title = canPostActor ? 'Create a new actor' : 'Requires Casting Director or Producer (post:actors)';
    });

    renderRbacMatrix();
  }

  function renderKpis() {
    const perms = getPermissionsForRole();
    const assignedCount = state.actors.filter((a) => a.movie_id != null).length;
    const unassignedCount = state.actors.length - assignedCount;

    el.navMoviesCount.textContent = state.movies.length;
    el.navActorsCount.textContent = state.actors.length;

    el.kpiMovies.textContent = state.movies.length;
    el.kpiActors.textContent = state.actors.length;
    el.kpiCast.textContent = assignedCount;
    el.kpiUnassignedSub.textContent = `${unassignedCount} unassigned talent`;
    el.kpiPerms.textContent = perms.length;
    el.kpiRoleSub.textContent = state.customJwt ? 'Custom Token' : ROLE_LABELS[state.role];
  }

  function renderOverview() {
    if (!state.movies.length) {
      el.overviewMoviesList.innerHTML = '<div class="empty-inline">No movies available for current role.</div>';
    } else {
      el.overviewMoviesList.innerHTML = state.movies
        .slice(0, 4)
        .map(
          (movie) => `
          <div class="mini-item">
            <div class="mini-item-main">
              <div>
                <div class="mini-item-title">${escapeHtml(movie.title)}</div>
                <div class="mini-item-sub">Release: ${escapeHtml(formatDateDisplay(movie.release_date))}</div>
              </div>
            </div>
            <span class="badge badge-gold">${(movie.actors || []).length} cast</span>
          </div>`
        )
        .join('');
    }

    if (!state.actors.length) {
      el.overviewActorsList.innerHTML = '<div class="empty-inline">No actors available for current role.</div>';
    } else {
      el.overviewActorsList.innerHTML = state.actors
        .slice(0, 4)
        .map(
          (actor) => `
          <div class="mini-item">
            <div class="mini-item-main">
              <div class="avatar">${escapeHtml(getInitials(actor.name))}</div>
              <div>
                <div class="mini-item-title">${escapeHtml(actor.name)}</div>
                <div class="mini-item-sub">${escapeHtml(actor.age)} yrs · ${escapeHtml(actor.gender)}</div>
              </div>
            </div>
            <span class="badge ${actor.movie_title ? 'badge-sky' : 'badge-muted'}">
              ${escapeHtml(actor.movie_title || 'Free Agent')}
            </span>
          </div>`
        )
        .join('');
    }
  }

  function renderMovies() {
    const query = el.movieSearch.value.trim().toLowerCase();
    const sortBy = el.movieSort.value;

    let list = state.movies.filter((m) => {
      if (!query) return true;
      const castMatch = (m.actors || []).some((a) => a.name.toLowerCase().includes(query));
      return m.title.toLowerCase().includes(query) || castMatch;
    });

    list.sort((a, b) => {
      if (sortBy === 'title_asc') return a.title.localeCompare(b.title);
      if (sortBy === 'date_desc') return (b.release_date || '').localeCompare(a.release_date || '');
      if (sortBy === 'cast_desc') return (b.actors?.length || 0) - (a.actors?.length || 0);
      return (a.release_date || '').localeCompare(b.release_date || '');
    });

    if (!list.length) {
      el.moviesGrid.innerHTML = `
        <div class="empty-state">
          <h3>No movies found</h3>
          <p>${
            hasPermission('get:movies')
              ? 'Try adjusting your search or add a new movie to the slate.'
              : 'Sign in with a studio role that has get:movies permission.'
          }</p>
        </div>`;
      return;
    }

    const canEdit = hasPermission('patch:movies');
    const canDelete = hasPermission('delete:movies');

    el.moviesGrid.innerHTML = list
      .map((movie) => {
        const cast = movie.actors || [];
        const upcoming = isUpcoming(movie.release_date);
        const castMarkup = cast.length
          ? cast.map((a) => `<span class="cast-chip">${escapeHtml(a.name)}</span>`).join('')
          : '<span class="entity-meta">No actors cast yet</span>';

        return `
          <article class="entity-card">
            <div>
              <div class="entity-top">
                <span class="badge ${upcoming ? 'badge-emerald' : 'badge-muted'}">
                  ${upcoming ? 'Upcoming' : 'Released'}
                </span>
                <span class="badge badge-gold">${escapeHtml(formatDateDisplay(movie.release_date))}</span>
              </div>
              <h3 class="entity-title">${escapeHtml(movie.title)}</h3>
              <p class="entity-meta">${cast.length} assigned ${cast.length === 1 ? 'actor' : 'actors'}</p>
              <div class="cast-chips">${castMarkup}</div>
            </div>
            <div class="entity-actions">
              <button type="button" class="btn btn-secondary btn-sm" data-cast-movie="${movie.id}">
                View Cast
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-sm ${canEdit ? '' : 'is-locked'}"
                data-edit-movie="${movie.id}"
                title="${canEdit ? 'Edit movie' : 'Requires patch:movies'}"
              >
                Edit
              </button>
              <button
                type="button"
                class="btn btn-danger btn-sm ${canDelete ? '' : 'is-locked'}"
                data-delete-movie="${movie.id}"
                title="${canDelete ? 'Delete movie' : 'Requires delete:movies'}"
              >
                Delete
              </button>
            </div>
          </article>`;
      })
      .join('');
  }

  function populateMovieSelects() {
    const filterValue = el.actorMovieFilter.value;
    const movieOptions = state.movies
      .map((m) => `<option value="${m.id}">${escapeHtml(m.title)}</option>`)
      .join('');

    el.actorMovieFilter.innerHTML = `
      <option value="all">All Assignments</option>
      <option value="unassigned">Unassigned Only</option>
      ${movieOptions}`;
    if ([...el.actorMovieFilter.options].some((o) => o.value === filterValue)) {
      el.actorMovieFilter.value = filterValue;
    }

    const actorMovieInput = document.getElementById('actor-movie-input');
    const prevMovieVal = actorMovieInput.value;
    actorMovieInput.innerHTML = `
      <option value="">Unassigned / Free Agent</option>
      ${movieOptions}`;
    if ([...actorMovieInput.options].some((o) => o.value === prevMovieVal)) {
      actorMovieInput.value = prevMovieVal;
    }
  }

  function renderActors() {
    const query = el.actorSearch.value.trim().toLowerCase();
    const genderFilter = el.actorGenderFilter.value;
    const movieFilter = el.actorMovieFilter.value;
    const sortBy = el.actorSort.value;

    let list = state.actors.filter((a) => {
      if (query) {
        const matchesName = a.name.toLowerCase().includes(query);
        const matchesMovie = (a.movie_title || '').toLowerCase().includes(query);
        if (!matchesName && !matchesMovie) return false;
      }
      if (genderFilter !== 'all' && a.gender.toLowerCase() !== genderFilter.toLowerCase()) {
        return false;
      }
      if (movieFilter === 'unassigned' && a.movie_id != null) {
        return false;
      }
      if (movieFilter !== 'all' && movieFilter !== 'unassigned' && String(a.movie_id) !== movieFilter) {
        return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'age_asc') return a.age - b.age;
      if (sortBy === 'age_desc') return b.age - a.age;
      return a.name.localeCompare(b.name);
    });

    if (!list.length) {
      el.actorsGrid.innerHTML = `
        <div class="empty-state">
          <h3>No actors found</h3>
          <p>${
            hasPermission('get:actors')
              ? 'Adjust your filters or add a new actor to the agency roster.'
              : 'Sign in with a studio role that has get:actors permission.'
          }</p>
        </div>`;
      return;
    }

    const canEdit = hasPermission('patch:actors');
    const canDelete = hasPermission('delete:actors');

    el.actorsGrid.innerHTML = list
      .map(
        (actor) => `
        <article class="entity-card">
          <div>
            <div class="actor-header">
              <div class="avatar">${escapeHtml(getInitials(actor.name))}</div>
              <div>
                <h3 class="entity-title" style="margin-top:0">${escapeHtml(actor.name)}</h3>
                <p class="entity-meta">Age ${escapeHtml(actor.age)} · ${escapeHtml(actor.gender)}</p>
              </div>
            </div>
            <div class="mt-md">
              <span class="badge ${actor.movie_title ? 'badge-sky' : 'badge-muted'}">
                ${actor.movie_title ? `Cast in: ${escapeHtml(actor.movie_title)}` : 'Unassigned / Free Agent'}
              </span>
            </div>
          </div>
          <div class="entity-actions">
            <button
              type="button"
              class="btn btn-ghost btn-sm ${canEdit ? '' : 'is-locked'}"
              data-edit-actor="${actor.id}"
              title="${canEdit ? 'Edit actor' : 'Requires patch:actors'}"
            >
              Edit
            </button>
            <button
              type="button"
              class="btn btn-danger btn-sm ${canDelete ? '' : 'is-locked'}"
              data-delete-actor="${actor.id}"
              title="${canDelete ? 'Delete actor' : 'Requires delete:actors'}"
            >
              Delete
            </button>
          </div>
        </article>`
      )
      .join('');
  }

  function renderRbacMatrix() {
    const roles = state.authConfig?.roles || {};
    const activeRole = state.customJwt ? null : state.role;

    document.querySelectorAll('#rbac-matrix-table th[data-col-role]').forEach((th) => {
      th.classList.toggle('active-col', th.dataset.colRole === activeRole);
    });

    el.rbacMatrixBody.innerHTML = ALL_PERMISSIONS.map(({ perm, endpoint }) => {
      const cells = ['casting_assistant', 'casting_director', 'executive_producer']
        .map((r) => {
          const allowed = (roles[r] || []).includes(perm);
          const activeClass = r === activeRole ? 'active-col' : '';
          return `<td class="${activeClass} ${allowed ? 'check-yes' : 'check-no'}">${allowed ? '✓' : '—'}</td>`;
        })
        .join('');
      return `<tr><td>${escapeHtml(endpoint)} <span class="entity-meta">(${escapeHtml(perm)})</span></td>${cells}</tr>`;
    }).join('');
  }

  function renderApiLog() {
    if (!state.apiLog.length) {
      el.apiLogList.innerHTML = '<div class="empty-inline">No API calls recorded yet.</div>';
      return;
    }
    el.apiLogList.innerHTML = state.apiLog
      .map((entry) => {
        const ok = entry.status >= 200 && entry.status < 300;
        return `
          <div class="api-log-row">
            <div class="api-log-left">
              <span class="status-pill ${ok ? 'status-ok' : 'status-err'}">${entry.status}</span>
              <strong>${escapeHtml(entry.method)}</strong>
              <span>${escapeHtml(entry.path)}</span>
            </div>
            <span class="entity-meta">${escapeHtml(entry.time)}</span>
          </div>`;
      })
      .join('');
  }

  async function refreshData() {
    if (!state.customJwt && state.role === 'public') {
      state.movies = [];
      state.actors = [];
      renderKpis();
      renderOverview();
      renderMovies();
      renderActors();
      return;
    }

    const [moviesRes, actorsRes] = await Promise.all([apiFetch('/movies'), apiFetch('/actors')]);
    state.movies = moviesRes.ok ? moviesRes.data.movies || [] : [];
    state.actors = actorsRes.ok ? actorsRes.data.actors || [] : [];

    if (!moviesRes.ok && moviesRes.status === 401) {
      showToast(moviesRes.data.message || 'Authentication required.', 'error');
    }

    populateMovieSelects();
    renderKpis();
    renderOverview();
    renderMovies();
    renderActors();
  }

  function openMovieModal(movie = null) {
    if (!movie && !hasPermission('post:movies')) {
      showToast('Executive Producer permission (post:movies) is required to add movies.', 'error');
      return;
    }
    if (movie && !hasPermission('patch:movies')) {
      showToast('Casting Director or Producer permission (patch:movies) is required to edit movies.', 'error');
      return;
    }
    document.getElementById('movie-modal-title').textContent = movie ? 'Edit Movie' : 'New Movie';
    document.getElementById('movie-id-input').value = movie ? movie.id : '';
    document.getElementById('movie-title-input').value = movie ? movie.title : '';
    document.getElementById('movie-date-input').value =
      movie?.release_date || new Date().toISOString().slice(0, 10);
    openModal('movie-modal');
  }

  function openActorModal(actor = null) {
    if (!actor && !hasPermission('post:actors')) {
      showToast('Casting Director or Producer permission (post:actors) is required to add actors.', 'error');
      return;
    }
    if (actor && !hasPermission('patch:actors')) {
      showToast('Casting Director or Producer permission (patch:actors) is required to edit actors.', 'error');
      return;
    }
    populateMovieSelects();
    document.getElementById('actor-modal-title').textContent = actor ? 'Edit Actor' : 'New Actor';
    document.getElementById('actor-id-input').value = actor ? actor.id : '';
    document.getElementById('actor-name-input').value = actor ? actor.name : '';
    document.getElementById('actor-age-input').value = actor ? actor.age : 28;
    document.getElementById('actor-gender-input').value = actor ? actor.gender : 'Female';
    document.getElementById('actor-movie-input').value =
      actor && actor.movie_id != null ? String(actor.movie_id) : '';
    openModal('actor-modal');
  }

  function openCastModal(movieId) {
    const movie = state.movies.find((m) => m.id === movieId);
    if (!movie) return;
    state.activeCastMovieId = movieId;
    const canManageCast = hasPermission('patch:actors');

    document.getElementById('cast-modal-title').textContent = movie.title;
    document.getElementById('cast-modal-subtitle').textContent =
      `Release Date: ${formatDateDisplay(movie.release_date)} · ${(movie.actors || []).length} cast members`;

    const assignBar = document.getElementById('cast-assign-bar');
    assignBar.classList.toggle('hidden', !canManageCast);

    const assignSelect = document.getElementById('cast-assign-select');
    const availableActors = state.actors.filter((a) => a.movie_id !== movieId);
    assignSelect.innerHTML = `<option value="">Select an actor to cast in ${escapeHtml(movie.title)}...</option>` +
      availableActors
        .map(
          (a) =>
            `<option value="${a.id}">${escapeHtml(a.name)} (${a.movie_title ? `currently in ${escapeHtml(a.movie_title)}` : 'Free Agent'})</option>`
        )
        .join('');

    const castList = document.getElementById('cast-modal-list');
    const cast = movie.actors || [];
    if (!cast.length) {
      castList.innerHTML = '<div class="empty-inline">No actors assigned to this movie yet.</div>';
    } else {
      castList.innerHTML = cast
        .map(
          (actor) => `
          <div class="mini-item">
            <div class="mini-item-main">
              <div class="avatar">${escapeHtml(getInitials(actor.name))}</div>
              <div>
                <div class="mini-item-title">${escapeHtml(actor.name)}</div>
                <div class="mini-item-sub">Age ${escapeHtml(actor.age)} · ${escapeHtml(actor.gender)}</div>
              </div>
            </div>
            ${
              canManageCast
                ? `<button type="button" class="btn btn-ghost btn-sm" data-unassign-actor="${actor.id}">Remove</button>`
                : ''
            }
          </div>`
        )
        .join('');
    }
    openModal('cast-modal');
  }

  function openDeleteConfirm(type, id) {
    if (type === 'movie' && !hasPermission('delete:movies')) {
      showToast('Executive Producer permission (delete:movies) is required to delete movies.', 'error');
      return;
    }
    if (type === 'actor' && !hasPermission('delete:actors')) {
      showToast('Casting Director or Producer permission (delete:actors) is required to delete actors.', 'error');
      return;
    }
    const item =
      type === 'movie'
        ? state.movies.find((m) => m.id === id)
        : state.actors.find((a) => a.id === id);
    if (!item) return;

    state.pendingDelete = { type, id };
    document.getElementById('confirm-modal-message').textContent =
      type === 'movie'
        ? `Delete "${item.title}"? Assigned actors will remain in the roster as unassigned.`
        : `Remove "${item.name}" from the agency roster? This action cannot be undone.`;
    openModal('confirm-modal');
  }

  function openAuthModal() {
    const modeBox = document.getElementById('auth-mode-summary');
    const cfg = state.authConfig || {};
    modeBox.innerHTML = `
      <div><strong>Server Auth Mode:</strong> ${escapeHtml(cfg.auth_mode === 'auth0' ? 'Auth0 RS256' : 'Local Studio Mode')}</div>
      <div><strong>Demo Role Switcher:</strong> ${cfg.allow_demo_auth ? 'Enabled' : 'Disabled'}</div>
      ${cfg.auth0_domain ? `<div><strong>Auth0 Domain:</strong> ${escapeHtml(cfg.auth0_domain)}</div>` : ''}
      ${cfg.api_audience ? `<div><strong>API Audience:</strong> ${escapeHtml(cfg.api_audience)}</div>` : ''}
    `;
    document.getElementById('custom-jwt-input').value = state.customJwt;
    openModal('auth-modal');
  }

  function bindEvents() {
    el.navTabs.forEach((tab) => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    document.querySelectorAll('[data-goto-tab]').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.gotoTab));
    });

    document.querySelector('.brand').addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('overview');
    });

    el.roleSelect.addEventListener('change', async (e) => {
      state.role = e.target.value;
      state.customJwt = '';
      localStorage.setItem('casting_role', state.role);
      localStorage.removeItem('casting_custom_jwt');
      updateRoleUI();
      await refreshData();
      showToast(`Switched role to ${ROLE_LABELS[state.role] || state.role}`, 'success');
    });

    document.querySelectorAll('[data-quick-role]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.role = btn.dataset.quickRole;
        state.customJwt = '';
        localStorage.setItem('casting_role', state.role);
        localStorage.removeItem('casting_custom_jwt');
        updateRoleUI();
        await refreshData();
        showToast(`Signed in as ${ROLE_LABELS[state.role]}`, 'success');
      });
    });

    document.getElementById('open-token-modal-btn').addEventListener('click', openAuthModal);

    [el.heroAddMovieBtn, el.addMovieBtn].forEach((btn) => {
      btn.addEventListener('click', () => openMovieModal(null));
    });
    [el.heroAddActorBtn, el.addActorBtn].forEach((btn) => {
      btn.addEventListener('click', () => openActorModal(null));
    });

    el.movieSearch.addEventListener('input', renderMovies);
    el.movieSort.addEventListener('change', renderMovies);
    el.actorSearch.addEventListener('input', renderActors);
    el.actorGenderFilter.addEventListener('change', renderActors);
    el.actorMovieFilter.addEventListener('change', renderActors);
    el.actorSort.addEventListener('change', renderActors);

    el.moviesGrid.addEventListener('click', (e) => {
      const castBtn = e.target.closest('[data-cast-movie]');
      if (castBtn) return openCastModal(Number(castBtn.dataset.castMovie));
      const editBtn = e.target.closest('[data-edit-movie]');
      if (editBtn) {
        const movie = state.movies.find((m) => m.id === Number(editBtn.dataset.editMovie));
        return openMovieModal(movie);
      }
      const delBtn = e.target.closest('[data-delete-movie]');
      if (delBtn) return openDeleteConfirm('movie', Number(delBtn.dataset.deleteMovie));
    });

    el.actorsGrid.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-edit-actor]');
      if (editBtn) {
        const actor = state.actors.find((a) => a.id === Number(editBtn.dataset.editActor));
        return openActorModal(actor);
      }
      const delBtn = e.target.closest('[data-delete-actor]');
      if (delBtn) return openDeleteConfirm('actor', Number(delBtn.dataset.deleteActor));
    });

    document.getElementById('movie-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('movie-id-input').value;
      const title = document.getElementById('movie-title-input').value.trim();
      const release_date = document.getElementById('movie-date-input').value;

      const res = await apiFetch(id ? `/movies/${id}` : '/movies', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify({ title, release_date }),
      });

      if (!res.ok) {
        showToast(res.data.message || 'Could not save movie.', 'error');
        return;
      }
      closeModal('movie-modal');
      showToast(id ? `Updated "${title}"` : `Added "${title}" to slate`, 'success');
      await refreshData();
    });

    document.getElementById('actor-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('actor-id-input').value;
      const name = document.getElementById('actor-name-input').value.trim();
      const age = Number(document.getElementById('actor-age-input').value);
      const gender = document.getElementById('actor-gender-input').value;
      const rawMovieId = document.getElementById('actor-movie-input').value;
      const movie_id = rawMovieId ? Number(rawMovieId) : null;

      const res = await apiFetch(id ? `/actors/${id}` : '/actors', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify({ name, age, gender, movie_id }),
      });

      if (!res.ok) {
        showToast(res.data.message || 'Could not save actor.', 'error');
        return;
      }
      closeModal('actor-modal');
      showToast(id ? `Updated "${name}"` : `Added "${name}" to roster`, 'success');
      await refreshData();
    });

    document.getElementById('cast-assign-btn').addEventListener('click', async () => {
      const actorId = Number(document.getElementById('cast-assign-select').value);
      if (!actorId || !state.activeCastMovieId) return;
      const res = await apiFetch(`/actors/${actorId}`, {
        method: 'PATCH',
        body: JSON.stringify({ movie_id: state.activeCastMovieId }),
      });
      if (!res.ok) {
        showToast(res.data.message || 'Could not assign actor.', 'error');
        return;
      }
      showToast('Actor assigned to movie cast.', 'success');
      await refreshData();
      openCastModal(state.activeCastMovieId);
    });

    document.getElementById('cast-modal-list').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-unassign-actor]');
      if (!btn) return;
      const actorId = Number(btn.dataset.unassignActor);
      const res = await apiFetch(`/actors/${actorId}`, {
        method: 'PATCH',
        body: JSON.stringify({ movie_id: null }),
      });
      if (!res.ok) {
        showToast(res.data.message || 'Could not unassign actor.', 'error');
        return;
      }
      showToast('Actor removed from movie cast.', 'success');
      await refreshData();
      openCastModal(state.activeCastMovieId);
    });

    document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
      if (!state.pendingDelete) return;
      const { type, id } = state.pendingDelete;
      const path = type === 'movie' ? `/movies/${id}` : `/actors/${id}`;
      const res = await apiFetch(path, { method: 'DELETE' });
      closeModal('confirm-modal');
      state.pendingDelete = null;
      if (!res.ok) {
        showToast(res.data.message || 'Delete failed.', 'error');
        return;
      }
      showToast(`${type === 'movie' ? 'Movie' : 'Actor'} deleted.`, 'success');
      await refreshData();
    });

    document.getElementById('custom-token-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      state.customJwt = document.getElementById('custom-jwt-input').value.trim();
      if (state.customJwt) {
        localStorage.setItem('casting_custom_jwt', state.customJwt);
        showToast('Custom Bearer JWT applied.', 'success');
      } else {
        localStorage.removeItem('casting_custom_jwt');
        showToast('Reverted to role switcher.', 'info');
      }
      closeModal('auth-modal');
      updateRoleUI();
      await refreshData();
    });

    document.getElementById('clear-custom-jwt-btn').addEventListener('click', async () => {
      state.customJwt = '';
      localStorage.removeItem('casting_custom_jwt');
      closeModal('auth-modal');
      updateRoleUI();
      await refreshData();
      showToast('Switched back to Studio Role Switcher.', 'info');
    });

    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
    });

    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) backdrop.classList.add('hidden');
      });
    });

    document.querySelectorAll('.preset-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        el.apiMethod.value = chip.dataset.method;
        el.apiPath.value = chip.dataset.path;
        el.apiBody.value = chip.dataset.body || '';
      });
    });

    el.apiTesterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const method = el.apiMethod.value;
      const path = el.apiPath.value.trim() || '/';
      const opts = { method };
      if (['POST', 'PATCH'].includes(method) && el.apiBody.value.trim()) {
        opts.body = el.apiBody.value.trim();
      }
      const res = await apiFetch(path, opts);
      el.apiOutput.classList.remove('hidden');
      el.apiOutputStatus.textContent = `${res.status}`;
      el.apiOutputStatus.className = `status-pill ${res.ok ? 'status-ok' : 'status-err'}`;
      el.apiOutputUrl.textContent = `${method} ${path}`;
      el.apiOutputJson.textContent = JSON.stringify(res.data, null, 2);
      if (res.ok && method !== 'GET') {
        await refreshData();
      }
    });

    document.getElementById('clear-log-btn').addEventListener('click', () => {
      state.apiLog = [];
      renderApiLog();
    });
  }

  async function init() {
    bindEvents();
    try {
      const res = await fetch('/auth/config');
      state.authConfig = await res.json();
    } catch (_) {
      state.authConfig = { auth_mode: 'demo', allow_demo_auth: true, roles: {} };
    }
    updateRoleUI();
    await refreshData();
  }

  init();
})();
