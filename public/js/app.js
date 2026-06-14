// 主应用模块
class MusicApp {
  constructor() {
    this.activeCategory = '精选';
    this.activeSort = '最新';
    this.activeNav = 'discover';
    this.searchResults = [];
    this.currentPlaylistId = null;
    this.currentPlaylistIsUser = false;
    this.currentPlaylistMeta = null;
    this.currentRenderedSongs = [];
    this.currentRenderedTitle = '';
    this.currentRenderedOptions = {};
    this.favoriteBatchMode = false;
    this.favoriteSelectedIds = new Set();
    this.init();
  }

  async init() {
    // 检查登录状态
    await API.getMe();
    this.initTheme();
    this.renderSidebar();
    this.renderToolbar();
    this.renderContent();
    this.renderPlayer();
    this.renderMobileNav();
    this.createAuthModal();
    await this.renderInitialMusicContent();
    this.updateUserUI();
  }

  // 初始化主题
  initTheme() {
    const saved = localStorage.getItem('music-theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
  }

  // 切换主题
  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('music-theme', next);
    this.updateThemeIcon();
  }

  updateThemeIcon() {
    const btn = document.querySelector('.theme-toggle');
    if (btn) {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      btn.innerHTML = isDark ? Icons.sun || Icons.moon : Icons.moon;
      btn.title = isDark ? '切换浅色模式' : '切换深色模式';
    }
  }

  async renderInitialMusicContent() {
    if (API.isLoggedIn()) {
      await this.loadHomeData();
    } else {
      this.renderLoginRequiredHome();
    }
  }

  renderLoginRequiredHome() {
    this.currentPlaylistIsUser = false;
    this.currentPlaylistMeta = null;
    const sidebarEl = document.getElementById('sidebarPlaylists');
    if (sidebarEl) {
      sidebarEl.innerHTML = '<div class="nav-group-item" style="color:var(--text-tertiary);font-size:12px">登录后查看推荐</div>';
    }
    this.renderHomeActionCards(false);
    const container = document.getElementById('songListContainer');
    if (!container) return;
    container.innerHTML = `
      <div class="login-required-panel">
        <div class="login-required-icon">${Icons.music}</div>
        <h3>登录后使用音乐功能</h3>
        <p>为控制服务器资源，搜索、播放、歌词、榜单和推荐等音乐功能需注册并登录后使用。</p>
        <p>注册需要邀请码，请加 站内联系管理员 获取。</p>
        <button class="auth-submit" data-action="show-login">登录 / 注册</button>
      </div>
    `;
    container.querySelector('[data-action="show-login"]')?.addEventListener('click', () => this.showAuthModal());
  }

  requireLoginForMusic() {
    if (API.isLoggedIn()) return true;
    this.renderLoginRequiredHome();
    this.showAuthModal();
    return false;
  }
  renderSidebar() {
    const sidebar = document.querySelector('.sidebar');
    sidebar.innerHTML = `
      <div class="sidebar-header">
        <div class="sidebar-logo">${Icons.music}</div>
        <div class="sidebar-title">音乐发现</div>
      </div>
      <div class="sidebar-scroll">
        <div class="nav-section">
          ${navItems.map(item => `
            <div class="nav-item ${item.id === this.activeNav ? 'active' : ''} ${item.isFavorite ? 'is-favorite' : ''}" data-nav="${item.id}">
              <span class="nav-icon">${Icons[item.icon]}</span>
              <span class="nav-label">${item.label}</span>
            </div>
          `).join('')}
        </div>
        <div class="nav-group" id="myPlaylistsGroup" style="display:${API.isLoggedIn() ? 'block' : 'none'}">
          <div class="nav-group-title">
            <span>我的歌单</span>
            <button class="nav-group-btn" data-action="create-playlist" title="新建歌单">${Icons.plus}</button>
          </div>
          <div id="myPlaylists">
            <div class="nav-group-item" style="color:var(--text-tertiary);font-size:12px">加载中...</div>
          </div>
        </div>
        <div class="nav-group">
          <div class="nav-group-title">
            <span>推荐歌单</span>
          </div>
          <div id="sidebarPlaylists">
            <div class="nav-group-item" style="color:var(--text-tertiary);font-size:12px">加载中...</div>
          </div>
        </div>
      </div>
    `;

    sidebar.addEventListener('click', (e) => {
      const navItem = e.target.closest('.nav-item');
      if (navItem) {
        const navId = navItem.dataset.nav;
        this.setActiveNav(navId);
        this.handleNavClick(navId);
      }
      const userPlItem = e.target.closest('.nav-group-item[data-user-plid]');
      if (userPlItem) {
        this.loadUserPlaylist(userPlItem.dataset.userPlid);
      }
      const plItem = e.target.closest('.nav-group-item[data-plid]');
      if (plItem) {
        this.loadPlaylist(plItem.dataset.plid, plItem.dataset.provider || 'netease');
      }
      const createBtn = e.target.closest('[data-action="create-playlist"]');
      if (createBtn) {
        this.showCreatePlaylistDialog();
      }
    });
  }

  setActiveNav(nav) {
    this.activeNav = nav;
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.nav === nav);
    });
    document.querySelectorAll('.mobile-nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.nav === nav);
    });
  }

  async handleNavClick(nav) {
    switch (nav) {
      case 'discover':
        await this.renderInitialMusicContent();
        break;
      case 'favorite':
        if (!this.requireLoginForMusic()) return;
        await this.loadFavorites();
        break;
      case 'recent':
        if (!this.requireLoginForMusic()) return;
        await this.loadHistory();
        break;
      case 'recommend':
        await this.renderInitialMusicContent();
        break;
      case 'rank':
        if (!this.requireLoginForMusic()) return;
        await this.loadRankPage();
        break;
    }
  }

  renderToolbar() {
    const toolbar = document.querySelector('.toolbar');
    toolbar.innerHTML = `
      <div class="toolbar-nav">
        <button class="toolbar-btn" disabled>${Icons.chevronLeft}</button>
        <button class="toolbar-btn" disabled>${Icons.chevronRight}</button>
      </div>
      <div class="search-bar">
        ${Icons.search}
        <input type="text" placeholder="搜索歌曲、歌手..." id="searchInput">
      </div>
      <div class="toolbar-spacer"></div>
      <div class="provider-switcher">
        <button class="provider-btn" data-provider="qqmusic">接口 A</button>
        <button class="provider-btn active" data-provider="netease">接口 B</button>
        <button class="provider-btn" data-provider="kugou">接口 C</button>
      </div>
      <button class="theme-toggle" data-action="toggle-theme" title="切换深色模式">${Icons.moon}</button>
      <div class="user-area" id="userArea">
        <button class="toolbar-btn" data-action="show-login" title="登录">${Icons.user}</button>
      </div>
    `;

    const input = document.getElementById('searchInput');
    let debounce = null;
    let searchVersion = 0;

    const triggerSearch = () => {
      clearTimeout(debounce);
      debounce = setTimeout(async () => {
        const q = input.value.trim();
        if (!API.isLoggedIn()) {
          if (q.length > 0) this.requireLoginForMusic();
          return;
        }
        if (q.length === 0) {
          this.loadHomeData();
          return;
        }
        const ver = ++searchVersion;
        const songs = await API.searchSongs(q, 30);
        if (ver !== searchVersion) return;
        this.searchResults = songs;
        this.renderSongList(songs, `搜索 "${q}" 的结果`);
      }, 500);
    };

    input.addEventListener('input', triggerSearch);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(debounce);
        const q = input.value.trim();
        if (q && API.isLoggedIn()) {
          const ver = ++searchVersion;
          API.searchSongs(q, 30).then(songs => {
            if (ver !== searchVersion) return;
            this.searchResults = songs;
            this.renderSongList(songs, `搜索 "${q}" 的结果`);
          });
        } else if (q) {
          this.requireLoginForMusic();
        }
      }
    });

    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('.provider-btn');
      if (btn) {
        const provider = btn.dataset.provider;
        API.setProvider(provider);
        toolbar.querySelectorAll('.provider-btn').forEach(b => b.classList.toggle('active', b === btn));
        const q = document.getElementById('searchInput').value.trim();
        if (q) {
          if (!API.isLoggedIn()) {
            this.requireLoginForMusic();
            return;
          }
          API.searchSongs(q, 30).then(songs => {
            this.searchResults = songs;
            this.renderSongList(songs, `搜索 "${q}" 的结果`);
          });
        }
      }
      const loginBtn = e.target.closest('[data-action="show-login"]');
      if (loginBtn) this.showAuthModal();
      const userPageBtn = e.target.closest('[data-action="user-page"]');
      if (userPageBtn) { this.setActiveNav('user'); this.showUserPage(); }
      const logoutBtn = e.target.closest('[data-action="logout"]');
      if (logoutBtn) this.handleLogout();
      const adminBtn = e.target.closest('[data-action="admin-invites"]');
      if (adminBtn) this.showInviteAdminPage();
      const themeBtn = e.target.closest('[data-action="toggle-theme"]');
      if (themeBtn) this.toggleTheme();
    });
  }

  renderContent() {
    const content = document.querySelector('.content');
    content.innerHTML = `
      <div class="site-notice">
        <div class="site-notice-title">学习演示声明</div>
        <div class="site-notice-text">本站仅供学习交流与技术演示使用，不提供商业运营服务，无运营、无盈利。站内音乐数据来自第三方接口，版权归原权利人所有，请支持正版音乐。</div>
        <div class="site-notice-text strong">为控制服务器资源，搜索、播放、歌词、榜单和推荐等音乐功能需注册登录后使用。注册需邀请码，请加 站内联系管理员 获取。</div>
      </div>
      <div class="home-action-section" id="homeActionCards"></div>
      <div id="songListContainer"></div>
    `;
  }

  renderHomeActionCards(isLoggedIn = API.isLoggedIn()) {
    const container = document.getElementById('homeActionCards');
    if (!container) return;

    const cards = isLoggedIn ? [
      {
        theme: 'discover',
        icon: Icons.search,
        kicker: '快速开始',
        title: '发现音乐',
        desc: '搜索歌曲、歌手或专辑，找到想听的内容后可直接播放。',
        action: 'search',
        cta: '开始搜索'
      },
      {
        theme: 'favorite',
        icon: Icons.heart,
        kicker: '你的收藏',
        title: '我的收藏',
        desc: '快速回到你喜欢的歌曲，继续整理常听曲目。',
        action: 'favorites',
        cta: '查看收藏'
      },
      {
        theme: 'playlist',
        icon: Icons.folder,
        kicker: '个人空间',
        title: '个人歌单',
        desc: '创建、编辑和管理自己的歌单，把音乐按心情归类。',
        action: 'playlists',
        cta: '管理歌单'
      }
    ] : [
      {
        theme: 'invite',
        icon: Icons.plus,
        kicker: '邀请注册',
        title: '邀请注册开放中',
        desc: '本站采用邀请注册，请加 站内联系管理员 获取邀请码后使用。',
        action: 'register',
        cta: '去注册'
      },
      {
        theme: 'login',
        icon: Icons.user,
        kicker: '登录使用',
        title: '登录后开始听歌',
        desc: '搜索、播放、收藏、歌单和最近播放都需要登录后使用。',
        action: 'login',
        cta: '去登录'
      },
      {
        theme: 'notice',
        icon: Icons.star,
        kicker: '站点说明',
        title: '仅供学习交流',
        desc: '本站为个人学习演示项目，不做商业运营，请支持正版音乐。',
        action: 'notice',
        cta: '查看说明'
      }
    ];

    container.innerHTML = `
      <div class="home-card-grid ${isLoggedIn ? 'is-user' : 'is-guest'}">
        ${cards.map(card => `
          <article class="home-action-card theme-${card.theme}" data-home-action="${card.action}" tabindex="0" role="button">
            <div class="home-card-glow"></div>
            <div class="home-card-icon">${card.icon}</div>
            <div class="home-card-body">
              <div class="home-card-kicker">${this.escapeHtml(card.kicker)}</div>
              <h2>${this.escapeHtml(card.title)}</h2>
              <p>${this.escapeHtml(card.desc)}</p>
            </div>
            <span class="home-card-cta">${this.escapeHtml(card.cta)} ${Icons.chevronRight}</span>
          </article>
        `).join('')}
      </div>
    `;

    this.bindHomeActionCards(container);
  }

  bindHomeActionCards(container) {
    const runAction = async (action) => {
      switch (action) {
        case 'register':
          this.showAuthModal('register');
          break;
        case 'login':
          this.showAuthModal('login');
          break;
        case 'notice':
          document.querySelector('.site-notice')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          this.showToast('本站仅供学习交流，请支持正版音乐');
          break;
        case 'search': {
          this.setActiveNav('discover');
          const input = document.getElementById('searchInput');
          if (input) {
            input.focus();
            input.select();
          }
          break;
        }
        case 'favorites':
          this.setActiveNav('favorite');
          await this.loadFavorites();
          break;
        case 'playlists':
          this.setActiveNav('user');
          await this.showUserPage();
          break;
      }
    };

    container.querySelectorAll('[data-home-action]').forEach(card => {
      card.addEventListener('click', () => runAction(card.dataset.homeAction));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          runAction(card.dataset.homeAction);
        }
      });
    });
  }

  renderPlayer() {
    const playerBar = document.querySelector('.player-bar');
    this.player = new Player(playerBar);
  }

  // 移动端底部导航
  renderMobileNav() {
    const nav = document.createElement('div');
    nav.className = 'mobile-nav';
    nav.innerHTML = `
      <div class="mobile-nav-item active" data-nav="discover">
        ${Icons.discover}
        <span>发现</span>
      </div>
      <div class="mobile-nav-item" data-nav="recommend">
        ${Icons.star}
        <span>推荐</span>
      </div>
      <div class="mobile-nav-item" data-nav="favorite">
        ${Icons.heart}
        <span>收藏</span>
      </div>
      <div class="mobile-nav-item" data-nav="recent">
        ${Icons.clock}
        <span>历史</span>
      </div>
      <div class="mobile-nav-item" data-nav="user">
        ${Icons.user}
        <span>我的</span>
      </div>
    `;
    document.querySelector('.music-app').appendChild(nav);

    nav.addEventListener('click', (e) => {
      const item = e.target.closest('.mobile-nav-item');
      if (!item) return;
      const navId = item.dataset.nav;
      this.setActiveNav(navId);

      if (navId === 'user') {
        if (API.isLoggedIn()) this.showUserPage();
        else this.showAuthModal();
      } else {
        this.handleNavClick(navId);
      }
    });
  }

  // ====== 登录/注册弹窗 ======

  createAuthModal() {
    const modal = document.createElement('div');
    modal.className = 'auth-modal';
    modal.id = 'authModal';
    modal.innerHTML = `
      <div class="auth-modal-content">
        <button class="auth-modal-close" data-action="close-auth">${Icons.chevronRight}</button>
        <div class="auth-tabs">
          <button class="auth-tab active" data-tab="login">登录</button>
          <button class="auth-tab" data-tab="register">注册</button>
        </div>
        <form class="auth-form" id="loginForm">
          <div class="auth-field">
            <label>邮箱或用户名</label>
            <input type="text" id="loginEmail" placeholder="请输入邮箱或用户名" required>
          </div>
          <div class="auth-field">
            <label>密码</label>
            <input type="password" id="loginPassword" placeholder="请输入密码" required>
          </div>
          <div class="auth-error" id="loginError"></div>
          <button type="submit" class="auth-submit">登录</button>
          <div class="auth-alt"><button type="button" class="auth-link" data-action="show-recover">忘记密码？</button></div>
        </form>
        <form class="auth-form" id="recoverForm" style="display:none">
          <div class="auth-recover-step" id="recoverStep1">
            <div class="auth-field">
              <label>账号</label>
              <input type="text" id="recoverAccount" placeholder="请输入用户名或邮箱">
            </div>
            <div class="auth-error" id="recoverError"></div>
            <button type="button" class="auth-submit" data-action="recover-fetch">下一步</button>
          </div>
          <div class="auth-recover-step" id="recoverStep2" style="display:none">
            <div class="auth-hint">请回答你设置的全部安全问题（不区分大小写和空格）。</div>
            <div id="recoverQuestions"></div>
            <div class="auth-field">
              <label>新密码</label>
              <input type="password" id="recoverNewPassword" placeholder="6-128位新密码">
            </div>
            <div class="auth-error" id="recoverResetError"></div>
            <button type="button" class="auth-submit" data-action="recover-reset">重置密码</button>
          </div>
          <div class="auth-alt"><button type="button" class="auth-link" data-action="back-to-login">返回登录</button></div>
        </form>
        <form class="auth-form" id="registerForm" style="display:none">
          <div class="auth-field">
            <label>用户名</label>
            <input type="text" id="regUsername" placeholder="请输入用户名" required>
          </div>
          <div class="auth-field">
            <label>邮箱</label>
            <input type="email" id="regEmail" placeholder="请输入邮箱" required>
          </div>
          <div class="auth-field">
            <label>密码</label>
            <input type="password" id="regPassword" placeholder="请输入密码（至少6位）" required minlength="6">
          </div>
          <div class="auth-field">
            <label>邀请码</label>
            <input type="text" id="regInviteCode" placeholder="请加 站内联系管理员 获取邀请码" required>
          </div>
          <div class="auth-hint">注册需要邀请码，请加 站内联系管理员 获取。本站仅供学习演示使用。</div>
          <div class="auth-error" id="registerError"></div>
          <button type="submit" class="auth-submit">注册</button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    // 事件绑定
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.hideAuthModal();
      const closeBtn = e.target.closest('[data-action="close-auth"]');
      if (closeBtn) this.hideAuthModal();
      const tab = e.target.closest('.auth-tab');
      if (tab) {
        modal.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t === tab));
        document.getElementById('loginForm').style.display = tab.dataset.tab === 'login' ? 'block' : 'none';
        document.getElementById('registerForm').style.display = tab.dataset.tab === 'register' ? 'block' : 'none';
        document.getElementById('recoverForm').style.display = 'none';
      }
      if (e.target.closest('[data-action="show-recover"]')) {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('recoverForm').style.display = 'block';
        document.getElementById('recoverStep1').style.display = 'block';
        document.getElementById('recoverStep2').style.display = 'none';
        document.getElementById('recoverError').textContent = '';
      }
      if (e.target.closest('[data-action="back-to-login"]')) {
        document.getElementById('recoverForm').style.display = 'none';
        document.getElementById('loginForm').style.display = 'block';
      }
      if (e.target.closest('[data-action="recover-fetch"]')) this.handleRecoverFetch();
      if (e.target.closest('[data-action="recover-reset"]')) this.handleRecoverReset();
    });

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      const errorEl = document.getElementById('loginError');
      errorEl.textContent = '';

      const result = await API.login(email, password);
      if (result.code === 0) {
        this.hideAuthModal();
        this.updateUserUI();
        this.loadMyPlaylists();
        this.loadHomeData();
      } else {
        errorEl.textContent = result.message;
      }
    });

    document.getElementById('registerForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('regUsername').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value;
      const inviteCode = document.getElementById('regInviteCode').value.trim();
      const errorEl = document.getElementById('registerError');
      errorEl.textContent = '';

      const result = await API.register(username, email, password, inviteCode);
      if (result.code === 0) {
        this.hideAuthModal();
        this.updateUserUI();
        this.loadMyPlaylists();
        this.loadHomeData();
      } else {
        errorEl.textContent = result.message;
      }
    });
  }

  showAuthModal(tab) {
    const modal = document.getElementById('authModal');
    modal.classList.add('show');
    if (tab) modal.querySelector(`.auth-tab[data-tab="${tab}"]`)?.click();
  }

  hideAuthModal() {
    document.getElementById('authModal').classList.remove('show');
  }

  async handleRecoverFetch() {
    const account = document.getElementById('recoverAccount').value.trim();
    const errorEl = document.getElementById('recoverError');
    errorEl.textContent = '';
    if (!account) { errorEl.textContent = '请输入账号'; return; }

    const result = await API.recoverQuestions(account);
    if (result.code !== 0) {
      errorEl.textContent = result.message || '无法找回该账号';
      return;
    }
    this.recoverAccount = account;
    this.recoverQuestionList = result.data.questions || [];
    document.getElementById('recoverQuestions').innerHTML = this.recoverQuestionList.map((q, i) => `
      <div class="auth-field">
        <label>${this.escapeHtml(q.question)}</label>
        <input type="text" id="recoverAnswer${i}" data-qid="${q.id}" placeholder="请输入答案">
      </div>
    `).join('');
    document.getElementById('recoverStep1').style.display = 'none';
    document.getElementById('recoverStep2').style.display = 'block';
  }

  async handleRecoverReset() {
    const errorEl = document.getElementById('recoverResetError');
    errorEl.textContent = '';
    const answers = (this.recoverQuestionList || []).map((q, i) => {
      const input = document.getElementById('recoverAnswer' + i);
      return { id: Number(input.dataset.qid), answer: input.value.trim() };
    });
    if (answers.some(a => !a.answer)) { errorEl.textContent = '请回答全部安全问题'; return; }
    const newPassword = document.getElementById('recoverNewPassword').value;
    if (newPassword.length < 6 || newPassword.length > 128) { errorEl.textContent = '新密码长度需为6-128位'; return; }

    const result = await API.recoverReset(this.recoverAccount, answers, newPassword);
    if (result.code === 0) {
      this.showToast('密码已重置，请用新密码登录');
      document.getElementById('recoverForm').style.display = 'none';
      document.getElementById('loginForm').style.display = 'block';
      document.getElementById('loginEmail').value = this.recoverAccount;
    } else {
      errorEl.textContent = result.message || '重置失败';
    }
  }

  handleLogout() {
    API.logout();
    this.updateUserUI();
    document.getElementById('myPlaylistsGroup').style.display = 'none';
    this.renderLoginRequiredHome();
    this.showToast('已退出登录');
  }

  async showUserPage() {
    if (!API.isLoggedIn()) {
      this.showAuthModal();
      return;
    }
    const playlists = await API.getUserPlaylists();
    const content = document.getElementById('songListContainer');
    content.innerHTML = `
      <div class="user-page">
        <div class="song-list-header">
          <h3>我的音乐</h3>
          <button class="list-action-btn danger" data-action="logout">退出登录</button>
        </div>
        <div class="user-card">
          <div class="user-card-name">${this.escapeHtml(API.user?.nickname || API.user?.username || '用户')}</div>
          <div class="user-card-meta">${this.escapeHtml(API.user?.email || '')}${API.user?.role === 'admin' ? ' · 管理员' : ''}</div>
        </div>
        <div class="admin-entry-card">
          <div>
            <div class="admin-entry-title">账户设置</div>
            <div class="admin-entry-desc">修改昵称、用户名、密码、邮箱与安全问题</div>
          </div>
          <button class="list-action-btn" data-action="account-settings">进入设置</button>
        </div>
        ${API.user?.role === 'admin' ? `
          <div class="admin-entry-card">
            <div>
              <div class="admin-entry-title">邀请码管理</div>
              <div class="admin-entry-desc">生成、复制、启用或停用注册邀请码</div>
            </div>
            <button class="list-action-btn" data-action="admin-invites">进入管理</button>
          </div>
        ` : ''}
        <div class="song-list-header compact">
          <h3>我的歌单</h3>
          <button class="list-action-btn" data-action="create-playlist">新建歌单</button>
        </div>
        <div class="playlist-grid">
          ${playlists.map(pl => `
            <div class="playlist-card" data-user-plid="${pl.id}">
              <div class="playlist-card-cover">${Icons.music}</div>
              <div class="playlist-card-title">${this.escapeHtml(pl.name)}</div>
              <div class="playlist-card-meta">${pl.songCount || 0} 首 · ${pl.is_public ? '公开' : '私密'}</div>
            </div>
          `).join('') || '<div class="empty-state">暂无歌单</div>'}
        </div>
      </div>
    `;

    content.querySelector('[data-action="logout"]')?.addEventListener('click', () => this.handleLogout());
    content.querySelector('[data-action="account-settings"]')?.addEventListener('click', () => this.showAccountSettingsPage());
    content.querySelector('[data-action="admin-invites"]')?.addEventListener('click', () => this.showInviteAdminPage());
    content.querySelector('[data-action="create-playlist"]')?.addEventListener('click', () => this.showCreatePlaylistDialog());
    content.querySelectorAll('[data-user-plid]').forEach(el => {
      el.addEventListener('click', () => this.loadUserPlaylist(el.dataset.userPlid));
    });
  }

  updateUserUI() {
    const userArea = document.getElementById('userArea');
    if (API.isLoggedIn() && API.user) {
      userArea.innerHTML = `
        <div class="user-info">
          <span class="user-name" data-action="user-page" title="账户与我的歌单" role="button" tabindex="0">${this.escapeHtml(API.user.nickname || API.user.username)}</span>
          ${API.user.role === 'admin' ? `<button class="toolbar-btn" data-action="admin-invites" title="邀请码管理">${Icons.plus}</button>` : ''}
          <button class="toolbar-btn" data-action="logout" title="退出登录">${Icons.chevronRight}</button>
        </div>
      `;
      document.getElementById('myPlaylistsGroup').style.display = 'block';
      this.loadMyPlaylists();
    } else {
      userArea.innerHTML = `<button class="toolbar-btn" data-action="show-login" title="登录">${Icons.user}</button>`;
    }
  }

  async loadMyPlaylists() {
    if (!API.isLoggedIn()) return;
    const playlists = await API.getUserPlaylists();
    const container = document.getElementById('myPlaylists');
    if (!container) return;
    if (playlists.length === 0) {
      container.innerHTML = '<div class="nav-group-item" style="color:var(--text-tertiary);font-size:12px">暂无歌单</div>';
    } else {
      container.innerHTML = playlists.map(pl => `
        <div class="nav-group-item" data-user-plid="${pl.id}">
          <span class="playlist-icon">${Icons.music}</span>
          <span>${this.escapeHtml(pl.name)} (${pl.songCount || 0})</span>
        </div>
      `).join('');
    }
  }

  renderInviteRows(invites) {
    if (!invites.length) {
      return '<div class="empty-state">暂无邀请码</div>';
    }
    return `
      <div class="invite-table">
        ${invites.map(invite => {
          const usage = invite.max_uses === 0 ? `${invite.used_count}/不限` : `${invite.used_count}/${invite.max_uses}`;
          const usedUp = invite.max_uses !== 0 && invite.used_count >= invite.max_uses;
          const active = invite.is_active === 1 && !usedUp;
          return `
            <div class="invite-row" data-invite-id="${invite.id}">
              <div class="invite-main">
                <code class="invite-code">${this.escapeHtml(invite.code)}</code>
                <div class="invite-meta">${this.escapeHtml(invite.note || '无备注')} · ${this.escapeHtml(invite.created_at || '')}</div>
              </div>
              <div class="invite-usage">${usage}</div>
              <div class="invite-status ${active ? 'active' : 'inactive'}">${active ? '可用' : (usedUp ? '已用完' : '已停用')}</div>
              <div class="invite-actions">
                <button class="list-action-btn" data-action="copy-invite" data-code="${this.escapeHtml(invite.code)}">复制</button>
                <button class="list-action-btn ${invite.is_active === 1 ? 'danger' : ''}" data-action="toggle-invite" data-id="${invite.id}" data-active="${invite.is_active === 1 ? '0' : '1'}">${invite.is_active === 1 ? '停用' : '启用'}</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  async showAccountSettingsPage() {
    if (!API.isLoggedIn()) {
      this.showAuthModal();
      return;
    }
    this.showLoading();
    const questions = await API.getSecurityQuestions();
    this.hideLoading();

    const u = API.user || {};
    const content = document.getElementById('songListContainer');
    content.innerHTML = `
      <div class="settings-panel">
        <div class="song-list-header">
          <h3>账户设置</h3>
          <button class="list-action-btn" data-action="back-user">返回我的</button>
        </div>

        <div class="settings-section">
          <h4>个人资料</h4>
          <form class="settings-form" id="profileForm">
            <label><span>昵称</span><input type="text" id="setNickname" maxlength="32" value="${this.escapeHtml(u.nickname || '')}" placeholder="昵称"></label>
            <label class="wide"><span>简介</span><input type="text" id="setBio" maxlength="200" value="${this.escapeHtml(u.bio || '')}" placeholder="一句话介绍自己"></label>
            <button type="submit" class="auth-submit">保存资料</button>
            <div class="settings-msg" id="profileMsg"></div>
          </form>
        </div>

        <div class="settings-section">
          <h4>修改用户名</h4>
          <div class="settings-hint">当前用户名：${this.escapeHtml(u.username || '')}。修改后需用新用户名登录。</div>
          <form class="settings-form" id="usernameForm">
            <label><span>新用户名</span><input type="text" id="setUsername" maxlength="32" placeholder="2-32位中文/字母/数字/_.-"></label>
            <label><span>当前密码</span><input type="password" id="usernamePassword" placeholder="请输入当前密码"></label>
            <button type="submit" class="auth-submit">修改用户名</button>
            <div class="settings-msg" id="usernameMsg"></div>
          </form>
        </div>

        <div class="settings-section">
          <h4>修改密码</h4>
          <form class="settings-form" id="passwordForm">
            <label><span>当前密码</span><input type="password" id="curPassword" placeholder="请输入当前密码"></label>
            <label><span>新密码</span><input type="password" id="newPassword" placeholder="6-128位"></label>
            <button type="submit" class="auth-submit">修改密码</button>
            <div class="settings-msg" id="passwordMsg"></div>
          </form>
        </div>

        <div class="settings-section">
          <h4>修改邮箱</h4>
          <div class="settings-hint">当前邮箱：${this.escapeHtml(u.email || '')}。邮箱用于登录和找回账户。</div>
          <form class="settings-form" id="emailForm">
            <label><span>新邮箱</span><input type="email" id="setEmail" maxlength="128" placeholder="name@example.com"></label>
            <label><span>当前密码</span><input type="password" id="emailPassword" placeholder="请输入当前密码"></label>
            <button type="submit" class="auth-submit">修改邮箱</button>
            <div class="settings-msg" id="emailMsg"></div>
          </form>
        </div>

        <div class="settings-section">
          <h4>安全问题</h4>
          <div class="settings-hint">${questions.length ? '已设置 ' + questions.length + ' 个安全问题。重新设置会覆盖原有问题。' : '尚未设置。设置后可在忘记密码时用于找回账户。'}用于在忘记密码时验证身份，请设置只有你知道答案的问题。</div>
          <form class="settings-form" id="securityForm">
            <label class="wide"><span>问题1</span><input type="text" id="sq1" maxlength="100" placeholder="例如：我的小学校名" value="${this.escapeHtml(questions[0]?.question || '')}"></label>
            <label class="wide"><span>答案1</span><input type="text" id="sa1" maxlength="100" placeholder="${questions[0] ? '如需修改请重新填写答案' : '答案不区分大小写和空格'}"></label>
            <label class="wide"><span>问题2（可选）</span><input type="text" id="sq2" maxlength="100" placeholder="可留空" value="${this.escapeHtml(questions[1]?.question || '')}"></label>
            <label class="wide"><span>答案2</span><input type="text" id="sa2" maxlength="100" placeholder="可留空"></label>
            <label class="wide"><span>问题3（可选）</span><input type="text" id="sq3" maxlength="100" placeholder="可留空" value="${this.escapeHtml(questions[2]?.question || '')}"></label>
            <label class="wide"><span>答案3</span><input type="text" id="sa3" maxlength="100" placeholder="可留空"></label>
            <label><span>当前密码</span><input type="password" id="securityPassword" placeholder="请输入当前密码"></label>
            <button type="submit" class="auth-submit">保存安全问题</button>
            <div class="settings-msg" id="securityMsg"></div>
          </form>
        </div>
      </div>
    `;

    this.bindAccountSettingsActions(content);
  }

  bindAccountSettingsActions(content) {
    content.querySelector('[data-action="back-user"]')?.addEventListener('click', () => this.showUserPage());

    const setMsg = (id, text, ok) => {
      const el = document.getElementById(id);
      if (el) { el.textContent = text; el.className = 'settings-msg ' + (ok ? 'ok' : 'err'); }
    };

    content.querySelector('#profileForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const result = await API.updateProfile({
        nickname: document.getElementById('setNickname').value.trim(),
        bio: document.getElementById('setBio').value.trim()
      });
      if (result.code === 0) { setMsg('profileMsg', '资料已保存', true); this.updateUserUI(); }
      else setMsg('profileMsg', result.message || '保存失败', false);
    });

    content.querySelector('#usernameForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('setUsername').value.trim();
      const pwd = document.getElementById('usernamePassword').value;
      const result = await API.updateUsername(pwd, username);
      if (result.code === 0) {
        setMsg('usernameMsg', '用户名已修改', true);
        this.updateUserUI();
        this.showToast('用户名已修改');
      } else setMsg('usernameMsg', result.message || '修改失败', false);
    });

    content.querySelector('#passwordForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const result = await API.updatePassword(document.getElementById('curPassword').value, document.getElementById('newPassword').value);
      if (result.code === 0) {
        setMsg('passwordMsg', '密码已修改', true);
        document.getElementById('curPassword').value = '';
        document.getElementById('newPassword').value = '';
      } else setMsg('passwordMsg', result.message || '修改失败', false);
    });

    content.querySelector('#emailForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const result = await API.updateEmail(document.getElementById('emailPassword').value, document.getElementById('setEmail').value.trim());
      if (result.code === 0) { setMsg('emailMsg', '邮箱已修改', true); this.showToast('邮箱已修改'); }
      else setMsg('emailMsg', result.message || '修改失败', false);
    });

    content.querySelector('#securityForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const items = [];
      for (let i = 1; i <= 3; i += 1) {
        const q = document.getElementById('sq' + i).value.trim();
        const a = document.getElementById('sa' + i).value.trim();
        if (q && a) items.push({ question: q, answer: a });
      }
      if (items.length === 0) { setMsg('securityMsg', '请至少填写一个问题和答案', false); return; }
      const result = await API.setSecurityQuestions(document.getElementById('securityPassword').value, items);
      if (result.code === 0) { setMsg('securityMsg', '安全问题已保存', true); this.showToast('安全问题已保存'); }
      else setMsg('securityMsg', result.message || '保存失败', false);
    });
  }

  async showInviteAdminPage() {
    if (!API.isLoggedIn() || API.user?.role !== 'admin') {
      this.showToast('无管理员权限');
      return;
    }
    this.showLoading();
    const invites = await API.getAdminInvites();
    this.hideLoading();

    const content = document.getElementById('songListContainer');
    content.innerHTML = `
      <div class="admin-panel">
        <div class="song-list-header">
          <h3>邀请码管理</h3>
          <button class="list-action-btn" data-action="back-user">返回我的</button>
        </div>
        <form class="invite-admin-form" id="inviteAdminForm">
          <label>
            <span>生成数量</span>
            <input type="number" id="inviteCount" value="5" min="1" max="50">
          </label>
          <label>
            <span>每码可用次数</span>
            <input type="number" id="inviteMaxUses" value="1" min="0" max="1000000">
          </label>
          <label class="wide">
            <span>备注</span>
            <input type="text" id="inviteNote" placeholder="例如 QQ申请批次" maxlength="200">
          </label>
          <button type="submit" class="auth-submit">生成邀请码</button>
        </form>
        <div class="invite-help">提示：可用次数填 1 表示一次性邀请码，填 0 表示不限次数。</div>
        <div id="inviteList">${this.renderInviteRows(invites)}</div>
      </div>
    `;

    this.bindInviteAdminActions(content);
  }

  bindInviteAdminActions(content) {
    content.querySelector('[data-action="back-user"]')?.addEventListener('click', () => this.showUserPage());
    content.querySelector('#inviteAdminForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const count = parseInt(document.getElementById('inviteCount').value, 10) || 1;
      const maxUses = parseInt(document.getElementById('inviteMaxUses').value, 10);
      const note = document.getElementById('inviteNote').value.trim();
      const result = await API.createAdminInvites(count, Number.isSafeInteger(maxUses) ? maxUses : 1, note);
      if (result.code === 0) {
        this.showToast(`已生成 ${result.data.created.length} 个邀请码`);
        this.showInviteAdminPage();
      } else {
        this.showToast(result.message || '生成失败');
      }
    });

    content.querySelectorAll('[data-action="copy-invite"]').forEach(btn => {
      btn.addEventListener('click', () => this.copyText(btn.dataset.code, '邀请码已复制'));
    });

    content.querySelectorAll('[data-action="toggle-invite"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const result = await API.updateAdminInvite(btn.dataset.id, { is_active: btn.dataset.active === '1' });
        if (result.code === 0) {
          this.showInviteAdminPage();
          this.showToast(btn.dataset.active === '1' ? '已启用' : '已停用');
        } else {
          this.showToast(result.message || '操作失败');
        }
      });
    });
  }

  async copyText(text, message = '已复制') {
    try {
      await navigator.clipboard.writeText(text);
      this.showToast(message);
    } catch (e) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      this.showToast(ok ? message : '复制失败，请手动复制');
    }
  }

  async showCreatePlaylistDialog() {
    const name = prompt('请输入歌单名称：');
    if (!name) return;
    const isPublic = confirm('是否公开这个歌单？\n确定：公开；取消：私密');
    const result = await API.createPlaylist(name, '', isPublic);
    if (result.code === 0) {
      this.loadMyPlaylists();
    } else {
      alert(result.message || '创建失败');
    }
  }

  // ====== 收藏列表 ======

  async loadFavorites() {
    if (!API.isLoggedIn()) {
      this.showAuthModal();
      return;
    }
    this.showLoading();
    const favorites = await API.getFavorites();
    const songs = favorites.map(f => ({
      id: f.song_id, name: f.song_name, artist: f.song_artist,
      cover: f.song_cover, provider: f.provider
    }));
    this.favoriteSelectedIds.clear();
    this.favoriteBatchMode = false;
    this.renderSongList(songs, '我喜欢的音乐', { isFavoritesPage: true, showBatchManage: true });
    this.hideLoading();
  }

  // ====== 播放历史 ======

  async loadHistory() {
    if (!API.isLoggedIn()) {
      this.showAuthModal();
      return;
    }
    this.showLoading();
    const history = await API.getHistory();
    const songs = history.map(h => ({
      id: h.song_id, name: h.song_name, artist: h.song_artist,
      cover: h.song_cover, provider: h.provider
    }));
    this.renderSongList(songs, '最近播放', { showClearHistory: true });
    this.hideLoading();
  }

  // ====== 首页数据 ======

  async loadHomeData() {
    this.currentPlaylistIsUser = false;
    this.currentPlaylistMeta = null;
    this.showLoading();

    const [playlists, hotPlaylist] = await Promise.all([
      API.getRecommend(),
      API.getPlaylist(3778678, 'netease')
    ]);

    const sidebarEl = document.getElementById('sidebarPlaylists');
    if (sidebarEl && playlists.length > 0) {
      sidebarEl.innerHTML = playlists.map(pl => `
        <div class="nav-group-item" data-plid="${pl.id}" data-provider="netease">
          <span class="playlist-icon">${Icons.music}</span>
          <span>${this.escapeHtml(pl.name)}</span>
        </div>
      `).join('');
    }

    this.renderHomeActionCards(true);

    if (hotPlaylist && hotPlaylist.songs) {
      this.renderSongList(hotPlaylist.songs, hotPlaylist.name);
    }

    this.hideLoading();
  }

  async loadUserPlaylist(id) {
    this.showLoading();
    const pl = await API.getUserPlaylist(id);
    if (pl) {
      const songs = (pl.songs || []).map(s => ({
        id: s.song_id, name: s.song_name, artist: s.song_artist,
        cover: s.song_cover, provider: s.provider
      }));
      this.currentPlaylistId = id;
      this.currentPlaylistIsUser = !!pl.canEdit;
      this.currentPlaylistMeta = pl;
      this.renderSongList(songs, pl.name, { isUserPlaylist: !!pl.canEdit, playlistId: id, canEditPlaylist: !!pl.canEdit });
    }
    this.hideLoading();
  }

  async loadPlaylist(id, provider = 'netease') {
    this.currentPlaylistIsUser = false;
    this.currentPlaylistMeta = null;
    this.showLoading();
    const pl = await API.getPlaylist(id, provider);
    if (pl) {
      this.currentPlaylistId = id;
      this.renderSongList(pl.songs, pl.name);
    }
    this.hideLoading();
  }

  renderSongList(songs, title = '', options = {}) {
    const container = document.getElementById('songListContainer');
    const list = songs || [];
    this.currentRenderedSongs = list;
    this.currentRenderedTitle = title;
    this.currentRenderedOptions = options;
    const headerActions = [];
    if (options.isFavoritesPage) {
      const selectedCount = this.favoriteSelectedIds.size;
      headerActions.push(`<button class="list-action-btn" data-action="toggle-favorite-batch">${this.favoriteBatchMode ? '退出批量' : '批量管理'}</button>`);
      if (this.favoriteBatchMode) {
        headerActions.push(`<button class="list-action-btn" data-action="select-all-favorites">全选</button>`);
        headerActions.push(`<button class="list-action-btn" data-action="clear-favorite-selection">取消选择</button>`);
        headerActions.push(`<button class="list-action-btn danger" data-action="batch-remove-favorites" ${selectedCount ? '' : 'disabled'}>批量取消收藏</button>`);
        headerActions.push(`<button class="list-action-btn" data-action="batch-resolve-favorites" ${selectedCount ? '' : 'disabled'}>批量修复音源</button>`);
        headerActions.push(`<span class="song-list-count batch-count">已选 ${selectedCount} 首</span>`);
      }
    }
    if (options.showClearHistory && list.length > 0) headerActions.push(`<button class="list-action-btn danger" data-action="clear-history">清空历史</button>`);
    if (options.canEditPlaylist) {
      headerActions.push(`<button class="list-action-btn" data-action="edit-playlist">编辑</button>`);
      headerActions.push(`<button class="list-action-btn danger" data-action="delete-playlist">删除</button>`);
    }

    if (list.length === 0) {
      container.innerHTML = `
        <div class="song-list-header">
          <h3>${this.escapeHtml(title)}</h3>
          <div class="list-actions">${headerActions.join('')}</div>
        </div>
        <div class="empty-state">暂无歌曲</div>
      `;
      this.bindListHeaderActions(container, options);
      return;
    }

    container.innerHTML = `
      <div class="song-list-header">
        <h3>${this.escapeHtml(title)}</h3>
        <div class="list-actions">
          <span class="song-list-count">${list.length}首</span>
          ${headerActions.join('')}
        </div>
      </div>
      <div class="song-list">
        ${list.map((song, i) => {
          const selectedClass = options.isFavoritesPage && this.favoriteSelectedIds.has(String(song.id)) ? 'selected' : '';
          return `
          <div class="song-item ${selectedClass}" data-song-id="${this.escapeHtml(String(song.id))}" data-index="${i}">
            ${options.isFavoritesPage && this.favoriteBatchMode ? `<button class="song-select-btn ${this.favoriteSelectedIds.has(String(song.id)) ? 'selected' : ''}" data-song-idx="${i}" data-action="toggle-favorite-select" aria-label="选择收藏">${this.favoriteSelectedIds.has(String(song.id)) ? '✓' : ''}</button>` : `<div class="song-index">${(i + 1).toString().padStart(2, '0')}</div>`}
            <div class="song-info">
              <div class="song-name">${this.escapeHtml(song.name)}</div>
              <div class="song-artist">${this.escapeHtml(song.artist)}</div>
              ${this.renderSongBadges(song)}
            </div>
            <div class="song-album">${this.escapeHtml(song.album || '')}</div>
            <div class="song-duration">${this.formatDuration(song.duration)}</div>
            <button class="song-fav-btn" data-song-idx="${i}" title="收藏">${Icons.heart}</button>
            <button class="song-action-btn" data-song-idx="${i}" data-action="add-to-playlist" title="添加到歌单">${Icons.plus}</button>
            ${options.isFavoritesPage ? `<button class="song-action-btn" data-song-idx="${i}" data-action="resolve-favorite" title="修复音源">${Icons.repeat}</button>` : ''}
            ${options.isUserPlaylist ? `<button class="song-action-btn danger" data-song-idx="${i}" data-action="remove-from-playlist" title="从歌单移除">${Icons.trash || Icons.x || Icons.chevronRight}</button>` : ''}
            <button class="song-play-btn">${Icons.play}</button>
          </div>
        `;
        }).join('')}
      </div>
    `;

    this.bindListHeaderActions(container, options);

    container.querySelectorAll('.song-item').forEach((el, i) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        if (options.isFavoritesPage && this.favoriteBatchMode) {
          this.toggleFavoriteSelection(String(list[i].id));
          return;
        }
        this.player.playTrack(list, i);
        container.querySelectorAll('.song-item').forEach(s => s.classList.remove('playing'));
        el.classList.add('playing');
        if (API.isLoggedIn()) API.addHistory(list[i]);
      });
    });

    container.querySelectorAll('.song-fav-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.songIdx);
        this.toggleFavorite(list[idx], btn);
      });
    });

    container.querySelectorAll('[data-action="toggle-favorite-select"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.songIdx);
        this.toggleFavoriteSelection(String(list[idx].id));
      });
    });

    container.querySelectorAll('[data-action="resolve-favorite"]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.songIdx);
        await this.resolveFavoriteSong(list[idx]);
      });
    });

    container.querySelectorAll('[data-action="add-to-playlist"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.songIdx);
        this.showAddToPlaylistDialog(list[idx]);
      });
    });

    container.querySelectorAll('[data-action="remove-from-playlist"]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.songIdx);
        if (!confirm(`从歌单移除「${list[idx].name || '这首歌'}」？`)) return;
        const result = await API.removeFromPlaylist(options.playlistId, String(list[idx].id));
        if (result.code === 0) {
          this.showToast('已移除');
          this.loadUserPlaylist(options.playlistId);
          this.loadMyPlaylists();
        } else {
          this.showToast(result.message || '移除失败');
        }
      });
    });

    this.updateFavoriteStates(container, list);
  }

  bindListHeaderActions(container, options = {}) {
    container.querySelector('[data-action="clear-history"]')?.addEventListener('click', async () => {
      if (!confirm('确定清空最近播放？')) return;
      const result = await API.clearHistory();
      if (result.code === 0) {
        this.showToast('历史已清空');
        this.loadHistory();
      }
    });

    container.querySelector('[data-action="toggle-favorite-batch"]')?.addEventListener('click', () => {
      this.favoriteBatchMode = !this.favoriteBatchMode;
      if (!this.favoriteBatchMode) this.favoriteSelectedIds.clear();
      this.rerenderCurrentSongList();
    });

    container.querySelector('[data-action="select-all-favorites"]')?.addEventListener('click', () => {
      this.currentRenderedSongs.forEach(song => this.favoriteSelectedIds.add(String(song.id)));
      this.rerenderCurrentSongList();
    });

    container.querySelector('[data-action="clear-favorite-selection"]')?.addEventListener('click', () => {
      this.favoriteSelectedIds.clear();
      this.rerenderCurrentSongList();
    });

    container.querySelector('[data-action="batch-remove-favorites"]')?.addEventListener('click', () => this.batchRemoveFavorites());
    container.querySelector('[data-action="batch-resolve-favorites"]')?.addEventListener('click', () => this.batchResolveFavorites());

    container.querySelector('[data-action="edit-playlist"]')?.addEventListener('click', () => this.editCurrentUserPlaylist());
    container.querySelector('[data-action="delete-playlist"]')?.addEventListener('click', () => this.deleteCurrentUserPlaylist());
  }

  rerenderCurrentSongList() {
    this.renderSongList(this.currentRenderedSongs, this.currentRenderedTitle, this.currentRenderedOptions);
  }

  toggleFavoriteSelection(songId) {
    if (this.favoriteSelectedIds.has(songId)) this.favoriteSelectedIds.delete(songId);
    else this.favoriteSelectedIds.add(songId);
    this.rerenderCurrentSongList();
  }

  removeSongsFromCurrentList(songIds) {
    const ids = new Set(songIds.map(id => String(id)));
    this.currentRenderedSongs = this.currentRenderedSongs.filter(song => !ids.has(String(song.id)));
    ids.forEach(id => this.favoriteSelectedIds.delete(id));
    if (this.currentRenderedSongs.length === 0) {
      this.favoriteBatchMode = false;
      this.favoriteSelectedIds.clear();
    }
    this.rerenderCurrentSongList();
  }

  replaceSongInCurrentList(oldId, favorite) {
    const nextSong = {
      id: favorite.song_id,
      name: favorite.song_name,
      artist: favorite.song_artist,
      cover: favorite.song_cover,
      provider: favorite.provider,
      source: 'gdstudio'
    };
    this.currentRenderedSongs = this.currentRenderedSongs.map(song => String(song.id) === String(oldId) ? nextSong : song);
    if (String(oldId) !== String(nextSong.id)) {
      this.favoriteSelectedIds.delete(String(oldId));
      this.favoriteSelectedIds.add(String(nextSong.id));
    }
    this.rerenderCurrentSongList();
  }

  async batchRemoveFavorites() {
    const ids = [...this.favoriteSelectedIds];
    if (ids.length === 0) return;
    if (!confirm(`确定取消收藏选中的 ${ids.length} 首歌曲？`)) return;
    const result = await API.removeFavorites(ids);
    if (result.code === 0) {
      this.removeSongsFromCurrentList(ids);
      this.showToast(`已取消收藏 ${ids.length} 首`);
    } else {
      this.showToast(result.message || '批量取消失败');
    }
  }

  async batchResolveFavorites() {
    const ids = [...this.favoriteSelectedIds];
    if (ids.length === 0) return;
    if (!confirm(`将根据歌名和歌手重新匹配 ${ids.length} 首收藏的更好音源，继续？`)) return;
    this.showLoading();
    const result = await API.resolveFavorites(ids);
    this.hideLoading();
    if (result.code !== 0) {
      this.showToast(result.message || '批量修复失败');
      return;
    }
    let updated = 0;
    let merged = 0;
    for (const item of result.data?.results || []) {
      if (item.status === 'updated' && item.favorite) {
        this.replaceSongInCurrentList(item.songId, item.favorite);
        updated += 1;
      } else if (item.status === 'merged') {
        this.removeSongsFromCurrentList([item.songId]);
        merged += 1;
      }
    }
    this.favoriteSelectedIds.clear();
    this.favoriteBatchMode = false;
    this.rerenderCurrentSongList();
    this.showToast(`修复完成：更新 ${updated} 首${merged ? `，合并 ${merged} 首` : ''}`);
  }

  async resolveFavoriteSong(song) {
    if (!song?.id) return;
    this.showToast('正在修复音源...');
    const result = await API.resolveFavorite(String(song.id));
    if (result.code === 0) {
      const data = result.data || {};
      if (data.status === 'updated' && data.favorite) {
        this.replaceSongInCurrentList(song.id, data.favorite);
        this.showToast('已修复音源');
      } else if (data.status === 'merged') {
        this.removeSongsFromCurrentList([song.id]);
        this.showToast('已合并到已有收藏');
      } else {
        this.showToast('当前已经是较好版本');
      }
    } else {
      this.showToast(result.message || '修复失败');
    }
  }

  async updateFavoriteStates(container, songs) {
    if (!API.isLoggedIn()) return;
    const state = await API.checkFavorites(songs.map(song => song.id));
    container.querySelectorAll('.song-fav-btn').forEach(btn => {
      const idx = parseInt(btn.dataset.songIdx);
      btn.classList.toggle('favorited', !!state[String(songs[idx]?.id)]);
    });
  }

  async toggleFavorite(song, btn) {
    if (!API.isLoggedIn()) {
      this.showAuthModal();
      return;
    }
    const isFav = btn.classList.contains('favorited') || await API.checkFavorite(String(song.id));
    if (isFav) {
      const result = await API.removeFavorite(String(song.id));
      if (result.code === 0) {
        btn.classList.remove('favorited');
        this.showToast('已取消收藏');
        if (this.currentRenderedOptions.isFavoritesPage) this.removeSongsFromCurrentList([song.id]);
      } else {
        this.showToast(result.message || '取消收藏失败');
      }
    } else {
      const result = await API.addFavorite(song);
      if (result.code === 0) {
        btn.classList.add('favorited');
        this.showToast('已收藏');
      } else {
        this.showToast(result.message || '收藏失败');
      }
    }
  }

  // ====== 排行榜页面 ======

  async loadRankPage() {
    this.showLoading();

    const charts = await API.getCharts();

    const container = document.getElementById('songListContainer');
    container.innerHTML = `
      <div class="rank-page">
        <h3 class="rank-title">排行榜</h3>
        <div class="rank-charts" id="rankCharts"></div>
        <div id="rankContent"></div>
      </div>
    `;

    const chartsEl = document.getElementById('rankCharts');
    if (charts.length === 0) {
      chartsEl.innerHTML = '<div style="color:var(--text-tertiary)">暂无榜单数据</div>';
      this.hideLoading();
      return;
    }

    chartsEl.innerHTML = charts.map(c => `
      <div class="rank-chart-card" data-chart-id="${c.id}">
        <div class="rank-chart-name">${this.escapeHtml(c.name)}</div>
        <div class="rank-chart-desc">${this.escapeHtml(c.updateFrequency || c.description?.slice(0, 20) || '')}</div>
      </div>
    `).join('');

    chartsEl.addEventListener('click', async (e) => {
      const card = e.target.closest('.rank-chart-card');
      if (!card) return;
      const chartId = card.dataset.chartId;
      chartsEl.querySelectorAll('.rank-chart-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      await this.loadChartSongs(chartId);
    });

    // 默认加载第一个
    chartsEl.querySelector('.rank-chart-card').classList.add('active');
    await this.loadChartSongs(charts[0].id);
    this.hideLoading();
  }

  async loadChartSongs(chartId) {
    const pl = await API.getPlaylist(chartId, 'netease');
    const rankContent = document.getElementById('rankContent');
    if (!pl || !pl.songs || pl.songs.length === 0) {
      rankContent.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-tertiary)">暂无数据</div>';
      return;
    }

    rankContent.innerHTML = `
      <div class="song-list-header">
        <h3>${pl.name}</h3>
        <span class="song-list-count">${pl.songs.length}首</span>
      </div>
      <div class="song-list">
        ${pl.songs.map((song, i) => `
          <div class="song-item ${i < 3 ? 'rank-top' : ''}" data-index="${i}">
            <div class="song-index rank-index">${i < 3 ? `<span class="rank-badge rank-${i+1}">${i+1}</span>` : (i + 1).toString().padStart(2, '0')}</div>
            <div class="song-info">
              <div class="song-name">${this.escapeHtml(song.name)}</div>
              <div class="song-artist">${this.escapeHtml(song.artist)}</div>
              ${this.renderSongBadges(song)}
            </div>
            <div class="song-album">${this.escapeHtml(song.album || '')}</div>
            <div class="song-duration">${this.formatDuration(song.duration)}</div>
            <button class="song-fav-btn" data-song-idx="${i}" title="收藏">${Icons.heart}</button>
            <button class="song-action-btn" data-song-idx="${i}" data-action="add-to-playlist" title="添加到歌单">${Icons.plus}</button>
            <button class="song-play-btn">${Icons.play}</button>
          </div>
        `).join('')}
      </div>
    `;

    rankContent.querySelectorAll('.song-item').forEach((el, i) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.song-fav-btn')) return;
        this.player.playTrack(pl.songs, i);
        rankContent.querySelectorAll('.song-item').forEach(s => s.classList.remove('playing'));
        el.classList.add('playing');
        if (API.isLoggedIn()) API.addHistory(pl.songs[i]);
      });
    });

    rankContent.querySelectorAll('.song-fav-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.songIdx);
        this.toggleFavorite(pl.songs[idx], btn);
      });
    });

    rankContent.querySelectorAll('[data-action="add-to-playlist"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.songIdx);
        this.showAddToPlaylistDialog(pl.songs[idx]);
      });
    });

    this.updateFavoriteStates(rankContent, pl.songs);
  }

  async showAddToPlaylistDialog(song) {
    if (!API.isLoggedIn()) {
      this.showAuthModal();
      return;
    }
    const playlists = await API.getUserPlaylists();
    if (!playlists.length) {
      this.showToast('请先创建歌单');
      return;
    }

    const optionsText = playlists.map((pl, index) => `${index + 1}. ${pl.name}`).join('\n');
    const input = prompt(`把「${song.name}」加入哪个歌单？\n${optionsText}\n请输入序号：`);
    if (!input) return;
    const idx = Number.parseInt(input, 10) - 1;
    const target = playlists[idx];
    if (!target) {
      this.showToast('歌单序号不正确');
      return;
    }
    const result = await API.addToPlaylist(target.id, song);
    this.showToast(result.code === 0 ? '已添加到歌单' : (result.message || '添加失败'));
    if (result.code === 0) this.loadMyPlaylists();
  }

  async editCurrentUserPlaylist() {
    if (!this.currentPlaylistMeta || !this.currentPlaylistId) return;
    const nextName = prompt('修改歌单名称：', this.currentPlaylistMeta.name || '');
    if (!nextName) return;
    const nextDescription = prompt('修改歌单简介：', this.currentPlaylistMeta.description || '') || '';
    const isPublic = confirm('是否设为公开歌单？\n确定：公开；取消：私密');
    const result = await API.updatePlaylist(this.currentPlaylistId, {
      name: nextName,
      description: nextDescription,
      is_public: isPublic ? 1 : 0
    });
    if (result.code === 0) {
      this.showToast('歌单已更新');
      this.loadMyPlaylists();
      this.loadUserPlaylist(this.currentPlaylistId);
    } else {
      this.showToast(result.message || '更新失败');
    }
  }

  async deleteCurrentUserPlaylist() {
    if (!this.currentPlaylistMeta || !this.currentPlaylistId) return;
    if (!confirm(`确定删除歌单「${this.currentPlaylistMeta.name || '未命名歌单'}」？`)) return;
    const result = await API.deletePlaylist(this.currentPlaylistId);
    if (result.code === 0) {
      this.currentPlaylistId = null;
      this.currentPlaylistMeta = null;
      this.currentPlaylistIsUser = false;
      this.showToast('歌单已删除');
      this.loadMyPlaylists();
      this.loadHomeData();
    } else {
      this.showToast(result.message || '删除失败');
    }
  }

  renderSongBadges(song) {
    const providerNames = { qqmusic: '接口A', netease: '接口B', kugou: '接口C' };
    const badges = [];
    const provider = providerNames[song.provider] || song.provider || '未知来源';
    badges.push(`<span class="song-badge provider">${this.escapeHtml(provider)}</span>`);
    if (song.isVipOnly) badges.push('<span class="song-badge vip">VIP</span>');
    if (song.source === 'karpov') badges.push('<span class="song-badge official">优先</span>');
    if (song.source === 'gdstudio') badges.push('<span class="song-badge fallback">备用</span>');
    if (song.playable === false) badges.push('<span class="song-badge restricted">受限</span>');
    if (song.source === 'kuwo') badges.push('<span class="song-badge fallback">备用</span>');
    return `<div class="song-badges">${badges.join('')}</div>`;
  }

  // 工具函数
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  formatDuration(sec) {
    if (!sec) return '';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  formatPlayCount(count) {
    if (!count) return '0';
    if (count >= 100000000) return (count / 100000000).toFixed(1) + '亿';
    if (count >= 10000) return (count / 10000).toFixed(1) + '万';
    return String(count);
  }

  getRandomGradient() {
    const gradients = [
      'linear-gradient(135deg, #ff6b6b, #ee5a24)',
      'linear-gradient(135deg, #6c5ce7, #a29bfe)',
      'linear-gradient(135deg, #00b894, #00cec9)',
      'linear-gradient(135deg, #fdcb6e, #e17055)',
      'linear-gradient(135deg, #0984e3, #74b9ff)',
      'linear-gradient(135deg, #e84393, #fd79a8)',
      'linear-gradient(135deg, #2d3436, #636e72)'
    ];
    return gradients[Math.floor(Math.random() * gradients.length)];
  }

  showLoading() {
    let el = document.getElementById('loadingOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'loadingOverlay';
      el.className = 'loading-overlay';
      el.innerHTML = '<div class="loading-spinner"></div>';
      document.querySelector('.content').appendChild(el);
    }
    el.style.display = 'flex';
  }

  hideLoading() {
    const el = document.getElementById('loadingOverlay');
    if (el) el.style.display = 'none';
  }

  showToast(message) {
    const text = String(message || '').trim();
    if (!text) return;
    let el = document.getElementById('appToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'appToast';
      el.className = 'app-toast';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }
}

// 导航菜单数据
const navItems = [
  { icon: 'discover', label: '发现', id: 'discover' },
  { icon: 'star', label: '推荐', id: 'recommend' },
  { icon: 'trophy', label: '排行榜', id: 'rank' },
  { icon: 'clock', label: '最近播放', id: 'recent' },
  { icon: 'heart', label: '我喜欢的音乐', id: 'favorite', isFavorite: true }
];

document.addEventListener('DOMContentLoaded', () => {
  window.app = new MusicApp();
});
