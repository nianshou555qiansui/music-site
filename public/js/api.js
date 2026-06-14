// API 封装层
const API = {
  currentProvider: 'netease',
  token: localStorage.getItem('music-token') || '',
  user: null,

  // 通用请求
  async request(url, options = {}) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
      const resp = await fetch(url, { headers, ...options });
      return await resp.json();
    } catch (e) {
      console.error('API error:', e);
      return { code: -1, message: e.message };
    }
  },

  // ====== 音乐相关 ======

  async searchSongs(query, limit = 20) {
    const data = await this.request(`/api/search?q=${encodeURIComponent(query)}&page_size=${limit}&provider=${this.currentProvider}`);
    return data.code === 0 ? data.data : [];
  },

  async getPlaylist(id, provider) {
    const p = provider || this.currentProvider;
    const data = await this.request(`/api/playlist/${p}/${id}`);
    return data.code === 0 ? data.data : null;
  },

  async getLyric(id, provider, name, artist) {
    const p = provider || this.currentProvider;
    let url = `/api/lyric?id=${encodeURIComponent(id)}&provider=${encodeURIComponent(p)}`;
    if (name) url += `&name=${encodeURIComponent(name)}`;
    if (artist) url += `&artist=${encodeURIComponent(artist)}`;
    const data = await this.request(url);
    return data.code === 0 ? data.data : { lyric: '', tlyric: '' };
  },

  async getSongUrl(id, provider, name, artist, quality = 'MP3_320') {
    const p = provider || this.currentProvider;
    let url = `/api/song/url?id=${id}&provider=${p}&quality=${quality}`;
    if (name) url += `&name=${encodeURIComponent(name)}`;
    if (artist) url += `&artist=${encodeURIComponent(artist)}`;
    const data = await this.request(url);
    return data.code === 0 ? data.data : null;
  },

  async getRecommend() {
    const data = await this.request('/api/recommend');
    return data.code === 0 ? data.data : [];
  },

  async getCharts() {
    const data = await this.request('/api/charts');
    return data.code === 0 ? data.data : [];
  },

  setProvider(provider) {
    this.currentProvider = provider;
  },

  // ====== 用户相关 ======

  async register(username, email, password, inviteCode) {
    const data = await this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, invite_code: inviteCode })
    });
    if (data.code === 0) {
      this.token = data.data.token;
      this.user = data.data.user;
      localStorage.setItem('music-token', this.token);
    }
    return data;
  },

  async login(email, password) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (data.code === 0) {
      this.token = data.data.token;
      this.user = data.data.user;
      localStorage.setItem('music-token', this.token);
    }
    return data;
  },

  logout() {
    this.token = '';
    this.user = null;
    localStorage.removeItem('music-token');
  },

  async getMe() {
    if (!this.token) return null;
    const data = await this.request('/api/auth/me');
    if (data.code === 0) {
      this.user = data.data;
      return data.data;
    }
    this.logout();
    return null;
  },

  isLoggedIn() {
    return !!this.token;
  },

  // ====== 账户设置 ======

  async updateProfile(data) {
    const result = await this.request('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    if (result.code === 0 && result.data) {
      this.user = { ...this.user, ...result.data };
    }
    return result;
  },

  async updateUsername(currentPassword, username) {
    const result = await this.request('/api/auth/username', {
      method: 'PUT',
      body: JSON.stringify({ current_password: currentPassword, username })
    });
    if (result.code === 0 && result.data?.token) {
      this.token = result.data.token;
      this.user = result.data.user;
      localStorage.setItem('music-token', this.token);
    }
    return result;
  },

  async updatePassword(currentPassword, newPassword) {
    return await this.request('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
    });
  },

  async updateEmail(currentPassword, email) {
    const result = await this.request('/api/auth/email', {
      method: 'PUT',
      body: JSON.stringify({ current_password: currentPassword, email })
    });
    if (result.code === 0 && result.data?.email) {
      this.user = { ...this.user, email: result.data.email };
    }
    return result;
  },

  async getSecurityQuestions() {
    const data = await this.request('/api/auth/security-questions');
    return data.code === 0 ? data.data : [];
  },

  async setSecurityQuestions(currentPassword, questions) {
    return await this.request('/api/auth/security-questions', {
      method: 'PUT',
      body: JSON.stringify({ current_password: currentPassword, questions })
    });
  },

  async recoverQuestions(account) {
    return await this.request('/api/auth/recover/questions', {
      method: 'POST',
      body: JSON.stringify({ account })
    });
  },

  async recoverReset(account, answers, newPassword) {
    return await this.request('/api/auth/recover/reset', {
      method: 'POST',
      body: JSON.stringify({ account, answers, new_password: newPassword })
    });
  },

  // ====== 收藏相关 ======

  async getFavorites() {
    const data = await this.request('/api/favorites');
    return data.code === 0 ? data.data : [];
  },

  async addFavorite(song) {
    return await this.request('/api/favorites', {
      method: 'POST',
      body: JSON.stringify({
        song_id: String(song.id),
        song_name: song.name,
        song_artist: song.artist,
        song_cover: song.cover,
        provider: song.provider || this.currentProvider
      })
    });
  },

  async removeFavorite(songId) {
    return await this.request(`/api/favorites/${encodeURIComponent(songId)}`, { method: 'DELETE' });
  },

  async removeFavorites(songIds) {
    return await this.request('/api/favorites', {
      method: 'DELETE',
      body: JSON.stringify({ song_ids: songIds })
    });
  },

  async resolveFavorite(songId) {
    return await this.request(`/api/favorites/${encodeURIComponent(songId)}/resolve`, { method: 'POST' });
  },

  async resolveFavorites(songIds) {
    return await this.request('/api/favorites/resolve', {
      method: 'POST',
      body: JSON.stringify({ song_ids: songIds })
    });
  },

  async checkFavorite(songId) {
    const data = await this.request(`/api/favorites/check/${songId}`);
    return data.code === 0 ? data.data.favorited : false;
  },

  async checkFavorites(songIds) {
    const ids = [...new Set((songIds || []).map(id => String(id)).filter(Boolean))].slice(0, 100);
    if (ids.length === 0) return {};
    const data = await this.request(`/api/favorites/check?ids=${encodeURIComponent(ids.join(','))}`);
    return data.code === 0 ? data.data : {};
  },

  // ====== 播放历史 ======

  async getHistory(limit = 50) {
    const data = await this.request(`/api/history?limit=${limit}`);
    return data.code === 0 ? data.data : [];
  },

  async addHistory(song) {
    return await this.request('/api/history', {
      method: 'POST',
      body: JSON.stringify({
        song_id: String(song.id),
        song_name: song.name,
        song_artist: song.artist,
        song_cover: song.cover,
        provider: song.provider || this.currentProvider
      })
    });
  },

  async clearHistory() {
    return await this.request('/api/history', { method: 'DELETE' });
  },

  // ====== 用户歌单 ======

  async getUserPlaylists() {
    const data = await this.request('/api/playlists');
    return data.code === 0 ? data.data : [];
  },

  async getUserPlaylist(id) {
    const data = await this.request(`/api/playlists/${id}`);
    return data.code === 0 ? data.data : null;
  },

  async createPlaylist(name, description, isPublic = true) {
    return await this.request('/api/playlists', {
      method: 'POST',
      body: JSON.stringify({ name, description, is_public: isPublic ? 1 : 0 })
    });
  },

  async updatePlaylist(id, data) {
    return await this.request(`/api/playlists/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deletePlaylist(id) {
    return await this.request(`/api/playlists/${id}`, { method: 'DELETE' });
  },

  async addToPlaylist(playlistId, song) {
    return await this.request(`/api/playlists/${playlistId}/songs`, {
      method: 'POST',
      body: JSON.stringify({
        song_id: String(song.id),
        song_name: song.name,
        song_artist: song.artist,
        song_cover: song.cover,
        provider: song.provider || this.currentProvider
      })
    });
  },

  async removeFromPlaylist(playlistId, songId) {
    return await this.request(`/api/playlists/${playlistId}/songs/${songId}`, { method: 'DELETE' });
  },

  // ====== 管理员：邀请码 ======

  async getAdminInvites() {
    const data = await this.request('/api/admin/invites');
    return data.code === 0 ? data.data : [];
  },

  async createAdminInvites(count = 1, maxUses = 1, note = '') {
    return await this.request('/api/admin/invites', {
      method: 'POST',
      body: JSON.stringify({ count, max_uses: maxUses, note })
    });
  },

  async updateAdminInvite(id, data) {
    return await this.request(`/api/admin/invites/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }
};
