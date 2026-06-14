// 播放器模块 - 真实音频播放
class Player {
  constructor(container) {
    this.container = container;
    this.audio = new Audio();
    this.playlist = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    this.quality = 'MP3_320';
    this.qualityLabels = { MP3_128: '128k', MP3_320: '320k', FLAC: 'FLAC' };
    this.pendingCurrentTime = 0;
    this.lyrics = [];
    this.currentLyricIdx = -1;
    this.lyricColors = this.loadLyricColors();
    this.desktopOpacity = this.loadDesktopOpacity();
    this.pipWindow = null;
    this.pipStyleEl = null;
    this.desktopBar = null;
    this.failureCount = 0;
    this.maxFailureCount = 5;

    // 播放模式: sequence=顺序, loop=单曲循环, random=随机
    this.playMode = 'sequence';
    this.playModes = ['sequence', 'loop', 'random'];

    this.render();
    this.createLyricsPage();
    this.createQueuePanel();
    this.bindAudioEvents();
    this.bindUIEvents();
    this.restoreState();
  }

  get currentTrack() {
    return this.currentIndex >= 0 ? this.playlist[this.currentIndex] : null;
  }

  render() {
    this.container.innerHTML = `
      <div class="player-progress-bar">
        <div class="player-progress-fill"></div>
      </div>
      <div class="player-main">
        <div class="player-left">
          <div class="player-cover" data-action="open-lyric" title="点击查看歌词">${Icons.music}</div>
          <div class="player-track-info">
            <div class="player-track-name">未播放</div>
            <div class="player-track-artist">-</div>
            <div class="player-source-label">未加载音源</div>
          </div>
        </div>
        <div class="player-center">
          <button class="player-btn" data-action="mode" title="播放模式">${Icons.repeat}</button>
          <button class="player-btn" data-action="prev">${Icons.skipBack}</button>
          <button class="player-btn play-pause" data-action="toggle">${Icons.play}</button>
          <button class="player-btn" data-action="next">${Icons.skipForward}</button>
          <button class="player-btn" data-action="shuffle" title="随机播放">${Icons.shuffle}</button>
        </div>
        <div class="player-right">
          <span class="player-time">00:00 / 00:00</span>
          <div class="volume-control">
            <button class="player-action" data-action="mute" title="音量">${Icons.volume2}</button>
            <div class="volume-slider-wrap">
              <input type="range" class="volume-slider" min="0" max="100" value="80" />
            </div>
          </div>
          <button class="quality-badge" data-action="quality">320k</button>
          <button class="player-action" data-action="queue" title="播放队列">
            ${Icons.list}
            <span class="queue-badge">0</span>
          </button>
          <div class="quality-popup">
            <div class="quality-option" data-quality="MP3_128"><span>标准 128K</span></div>
            <div class="quality-option active" data-quality="MP3_320"><span>极高 320K</span><span class="check">✓</span></div>
            <div class="quality-option" data-quality="FLAC"><span>Hi-Res 无损</span></div>
          </div>
        </div>
      </div>
    `;

    this.progressFill = this.container.querySelector('.player-progress-fill');
    this.progressBar = this.container.querySelector('.player-progress-bar');
    this.playPauseBtn = this.container.querySelector('[data-action="toggle"]');
    this.timeDisplay = this.container.querySelector('.player-time');
    this.qualityBadge = this.container.querySelector('[data-action="quality"]');
    this.qualityPopup = this.container.querySelector('.quality-popup');
    this.trackName = this.container.querySelector('.player-track-name');
    this.trackArtist = this.container.querySelector('.player-track-artist');
    this.cover = this.container.querySelector('.player-cover');
    this.queueBadge = this.container.querySelector('.queue-badge');
    this.volumeSlider = this.container.querySelector('.volume-slider');
    this.volumeBtn = this.container.querySelector('[data-action="mute"]');
    this.modeBtn = this.container.querySelector('[data-action="mode"]');
    this.sourceLabel = this.container.querySelector('.player-source-label');

    this.audio.volume = 0.8;
    this.prevVolume = 0.8;
  }

  // 创建全屏歌词页面
  createLyricsPage() {
    const page = document.createElement('div');
    page.className = 'lyrics-page';
    page.id = 'lyricsPage';
    page.innerHTML = `
      <div class="lyrics-bg"></div>
      <div class="lyrics-header">
        <button class="lyrics-close" data-action="close-lyric">${Icons.chevronLeft}<span>返回</span></button>
        <div class="lyrics-song-info">
          <div class="lyrics-song-name">-</div>
          <div class="lyrics-song-artist">-</div>
        </div>
        <div class="lyrics-tools">
          <button class="lyrics-tool-btn" data-action="toggle-desktop-lyric" title="桌面歌词（浮动窗）">${Icons.monitor}</button>
          <button class="lyrics-tool-btn" data-action="toggle-color-panel" title="歌词颜色">${Icons.palette}</button>
          <button class="lyrics-copy" data-action="copy-lyric" title="复制整首歌词">${Icons.copy}<span>复制</span></button>
          <button class="lyrics-tool-btn" data-action="toggle-help-panel" title="使用说明">${Icons.info}</button>
          <div class="lyric-help-panel">
            <div class="lhp-title">桌面歌词</div>
            <p class="lhp-text">点显示器图标开启/关闭。Chrome / Edge 会弹出可拖动的独立浮窗；其他浏览器使用页面内可拖动的悬浮条。</p>
            <div class="lhp-title">透明度</div>
            <p class="lhp-text">页面内悬浮条调低透明度后能透出后面的页面内容。独立浮窗是浏览器的独立系统窗口，无法穿透看到桌面，调节只改变自身底色深浅。</p>
            <div class="lhp-title">快捷键</div>
            <ul class="lhp-keys">
              <li><kbd>空格</kbd> 播放 / 暂停</li>
              <li><kbd>←</kbd><kbd>→</kbd> 快退 / 快进 5 秒</li>
              <li><kbd>↑</kbd><kbd>↓</kbd> 音量 + / -</li>
              <li><kbd>N</kbd><kbd>P</kbd> 下一首 / 上一首</li>
              <li><kbd>M</kbd> 静音 · <kbd>R</kbd> 模式 · <kbd>Q</kbd> 队列</li>
            </ul>
          </div>
          <div class="lyric-color-panel">
            <div class="lcp-section">
              <span class="lcp-label">高亮颜色</span>
              <div class="lcp-swatches">
                <button type="button" class="lcp-swatch" data-color="#ffffff" style="background:#ffffff"></button>
                <button type="button" class="lcp-swatch" data-color="#ff4d6d" style="background:#ff4d6d"></button>
                <button type="button" class="lcp-swatch" data-color="#ff9f1c" style="background:#ff9f1c"></button>
                <button type="button" class="lcp-swatch" data-color="#ffd60a" style="background:#ffd60a"></button>
                <button type="button" class="lcp-swatch" data-color="#2ec4b6" style="background:#2ec4b6"></button>
                <button type="button" class="lcp-swatch" data-color="#4cc9f0" style="background:#4cc9f0"></button>
                <button type="button" class="lcp-swatch" data-color="#7b2ff7" style="background:#7b2ff7"></button>
                <button type="button" class="lcp-swatch" data-color="#f72585" style="background:#f72585"></button>
              </div>
              <label class="lcp-custom">自定义<input type="color" id="lyricColorActive"></label>
            </div>
            <div class="lcp-section">
              <span class="lcp-label">普通颜色</span>
              <label class="lcp-custom">自定义<input type="color" id="lyricColorInactive"></label>
            </div>
            <div class="lcp-section">
              <span class="lcp-label">桌面歌词透明度</span>
              <input type="range" id="desktopOpacity" class="lcp-opacity" min="20" max="100" step="1">
            </div>
            <button type="button" class="lyric-color-reset" data-action="reset-lyric-color">恢复默认</button>
          </div>
        </div>
      </div>
      <div class="lyrics-body">
        <div class="lyrics-scroll" id="lyricsScroll">
          <div class="lyric-line lyric-empty">暂无歌词</div>
        </div>
      </div>
      <div class="lyrics-bottom">
        <div class="lyrics-progress">
          <span class="lyrics-time-current">00:00</span>
          <div class="lyrics-progress-bar">
            <div class="lyrics-progress-fill"></div>
          </div>
          <span class="lyrics-time-total">00:00</span>
        </div>
        <div class="lyrics-controls">
          <button class="lyrics-ctrl-btn" data-action="mode" title="播放模式">${Icons.repeat}</button>
          <button class="lyrics-ctrl-btn" data-action="prev">${Icons.skipBack}</button>
          <button class="lyrics-ctrl-btn lyrics-play-btn" data-action="toggle">${Icons.play}</button>
          <button class="lyrics-ctrl-btn" data-action="next">${Icons.skipForward}</button>
        </div>
      </div>
    `;
    document.querySelector('.music-app').appendChild(page);

    this.lyricsPage = page;
    this.lyricsBg = page.querySelector('.lyrics-bg');
    this.lyricsScroll = page.querySelector('#lyricsScroll');
    this.lyricsName = page.querySelector('.lyrics-song-name');
    this.lyricsArtist = page.querySelector('.lyrics-song-artist');
    this.lyricsTimeCurrent = page.querySelector('.lyrics-time-current');
    this.lyricsTimeTotal = page.querySelector('.lyrics-time-total');
    this.lyricsProgressFill = page.querySelector('.lyrics-progress-fill');
    this.lyricsPlayBtn = page.querySelector('.lyrics-play-btn');

    // 歌词页进度条点击
    page.querySelector('.lyrics-progress-bar').addEventListener('click', (e) => {
      if (!this.audio.duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      this.audio.currentTime = ((e.clientX - rect.left) / rect.width) * this.audio.duration;
    });

    // 歌词点击：复制按钮复制单句，否则跳转到该句时间
    this.lyricsScroll.addEventListener('click', (e) => {
      const copyBtn = e.target.closest('.lyric-copy-line');
      if (copyBtn) {
        e.stopPropagation();
        this.copyLine(parseInt(copyBtn.dataset.index));
        return;
      }
      const line = e.target.closest('.lyric-line[data-index]');
      if (!line || !this.audio.duration) return;
      const idx = parseInt(line.dataset.index);
      if (this.lyrics[idx]) {
        this.audio.currentTime = this.lyrics[idx].time;
      }
    });

    // 颜色选择器
    this.lyricColorPanel = page.querySelector('.lyric-color-panel');
    this.lyricHelpPanel = page.querySelector('.lyric-help-panel');
    this.lyricColorActive = page.querySelector('#lyricColorActive');
    this.lyricColorInactive = page.querySelector('#lyricColorInactive');
    this.desktopOpacityInput = page.querySelector('#desktopOpacity');
    this.lyricColorActive.value = this.lyricColors.active;
    this.lyricColorInactive.value = this.lyricColors.inactive;
    this.desktopOpacityInput.value = Math.round(this.desktopOpacity * 100);
    this.lyricColorActive.addEventListener('input', () => {
      this.lyricColors.active = this.lyricColorActive.value;
      this.applyLyricColors();
      this.saveLyricColors();
      this.updateSwatchSelection();
    });
    this.lyricColorInactive.addEventListener('input', () => {
      this.lyricColors.inactive = this.lyricColorInactive.value;
      this.applyLyricColors();
      this.saveLyricColors();
    });
    this.desktopOpacityInput.addEventListener('input', () => {
      this.desktopOpacity = Math.max(0.2, Math.min(1, parseInt(this.desktopOpacityInput.value) / 100));
      this.applyDesktopOpacity();
      this.saveDesktopOpacity();
    });
    // 预设色块（高亮色）
    page.querySelectorAll('.lcp-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        this.lyricColors.active = sw.dataset.color;
        this.lyricColorActive.value = sw.dataset.color;
        this.applyLyricColors();
        this.saveLyricColors();
        this.updateSwatchSelection();
      });
    });
    this.updateSwatchSelection();
    this.applyLyricColors();
  }

  // 创建播放队列面板
  createQueuePanel() {
    const panel = document.createElement('div');
    panel.className = 'queue-panel';
    panel.id = 'queuePanel';
    panel.innerHTML = `
      <div class="queue-header">
        <span>播放队列</span>
        <div class="queue-header-actions">
          <button class="queue-clear-btn" data-action="clear-queue">清空</button>
          <button class="queue-close-btn" data-action="close-queue">${Icons.chevronRight}</button>
        </div>
      </div>
      <div class="queue-list" id="queueList"></div>
    `;
    document.querySelector('.music-app').appendChild(panel);
    this.queuePanel = panel;
    this.queueList = panel.querySelector('#queueList');

    panel.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'close-queue') this.closeQueue();
      if (btn.dataset.action === 'clear-queue') this.clearQueue();

      const item = e.target.closest('.queue-item');
      if (item) {
        const idx = parseInt(item.dataset.index);
        if (!isNaN(idx)) {
          this.currentIndex = idx;
          this.loadAndPlay();
          this.renderQueue();
        }
      }
    });
  }

  bindAudioEvents() {
    this.audio.addEventListener('timeupdate', () => {
      if (!this.audio.duration) return;
      const pct = (this.audio.currentTime / this.audio.duration) * 100;
      this.progressFill.style.width = pct + '%';
      this.timeDisplay.textContent =
        `${this.formatTime(this.audio.currentTime)} / ${this.formatTime(this.audio.duration)}`;
      this.lyricsProgressFill.style.width = pct + '%';
      this.lyricsTimeCurrent.textContent = this.formatTime(this.audio.currentTime);
      this.lyricsTimeTotal.textContent = this.formatTime(this.audio.duration);
      this.syncLyric();
    });

    // 播放结束 - 根据模式决定行为
    this.audio.addEventListener('ended', () => {
      if (this.playMode === 'loop') {
        this.audio.currentTime = 0;
        this.audio.play();
      } else {
        this.next();
      }
    });

    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.playPauseBtn.innerHTML = Icons.pause;
      this.lyricsPlayBtn.innerHTML = Icons.pause;
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.playPauseBtn.innerHTML = Icons.play;
      this.lyricsPlayBtn.innerHTML = Icons.play;
    });

    this.audio.addEventListener('error', () => {
      this.handlePlaybackFailure('播放失败，尝试下一首');
    });
  }

  bindUIEvents() {
    this.container.addEventListener('click', async (e) => {
      const qualityOpt = e.target.closest('[data-quality]');
      if (qualityOpt) {
        const nextQuality = qualityOpt.dataset.quality;
        if (nextQuality === this.quality) {
          this.qualityPopup.classList.remove('show');
          return;
        }
        const previousQuality = this.quality;
        this.quality = nextQuality;
        this.updateQualityUI();
        this.qualityPopup.classList.remove('show');
        this.saveState();
        if (this.currentTrack && this.audio.src) {
          const ok = await this.reloadCurrentQuality();
          if (!ok) {
            this.quality = previousQuality;
            this.updateQualityUI();
            this.saveState();
          }
        }
        return;
      }

      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      switch (btn.dataset.action) {
        case 'toggle': this.togglePlay(); break;
        case 'prev': this.prev(); break;
        case 'next': this.next(); break;
        case 'quality': this.qualityPopup.classList.toggle('show'); break;
        case 'open-lyric': this.openLyricsPage(); break;
        case 'mute': this.toggleMute(); break;
        case 'mode': this.cyclePlayMode(); break;
        case 'shuffle': this.toggleShuffle(); break;
        case 'queue': this.toggleQueue(); break;
      }
    });

    this.progressBar.addEventListener('click', (e) => {
      if (!this.audio.duration) return;
      const rect = this.progressBar.getBoundingClientRect();
      this.audio.currentTime = ((e.clientX - rect.left) / rect.width) * this.audio.duration;
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.player-right')) {
        this.qualityPopup.classList.remove('show');
      }
    });

    this.volumeSlider.addEventListener('input', (e) => {
      const vol = parseInt(e.target.value) / 100;
      this.audio.volume = vol;
      this.prevVolume = vol;
      this.updateVolumeIcon();
      this.saveState();
    });

    this.lyricsPage.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      switch (btn.dataset.action) {
        case 'close-lyric': this.closeLyricsPage(); break;
        case 'copy-lyric': this.copyLyrics(); break;
        case 'toggle-color-panel':
          this.lyricHelpPanel?.classList.remove('show');
          this.lyricColorPanel.classList.toggle('show');
          break;
        case 'toggle-help-panel':
          this.lyricColorPanel?.classList.remove('show');
          this.lyricHelpPanel.classList.toggle('show');
          break;
        case 'reset-lyric-color': this.resetLyricColors(); break;
        case 'toggle-desktop-lyric': this.toggleDesktopLyrics(); break;
        case 'toggle': this.togglePlay(); break;
        case 'prev': this.prev(); break;
        case 'next': this.next(); break;
        case 'mode': this.cyclePlayMode(); break;
      }
    });

    // 点歌词页空白处关闭弹出面板
    this.lyricsPage.addEventListener('click', (e) => {
      if (!e.target.closest('.lyrics-tools')) {
        this.lyricColorPanel?.classList.remove('show');
        this.lyricHelpPanel?.classList.remove('show');
      }
    });

    // 键盘快捷键（主页面 + 桌面歌词浮窗共用）
    document.addEventListener('keydown', (e) => this.handleShortcut(e));
  }

  // 统一的快捷键处理，可被主文档和 PiP 浮窗文档共用
  handleShortcut(e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    switch (e.key) {
      case ' ': case 'Spacebar': e.preventDefault(); this.togglePlay(); break;
      case 'ArrowUp': e.preventDefault(); this.adjustVolume(0.05); break;
      case 'ArrowDown': e.preventDefault(); this.adjustVolume(-0.05); break;
      case 'ArrowRight': e.preventDefault(); this.seekBy(5); break;
      case 'ArrowLeft': e.preventDefault(); this.seekBy(-5); break;
      case 'm': case 'M': this.toggleMute(); break;
      case 'n': case 'N': this.next(); break;
      case 'p': case 'P': this.prev(); break;
      case 'r': case 'R': this.cyclePlayMode(); break;
      case 'q': case 'Q': this.toggleQueue(); break;
    }
  }

  // 播放指定歌曲列表中的某首
  async playTrack(songs, index) {
    this.playlist = songs;
    this.currentIndex = index;
    this.queueBadge.textContent = songs.length;
    await this.loadAndPlay();
    this.renderQueue();
    this.saveState();
  }

  // 加载并播放/准备当前歌曲
  async loadAndPlay(autoPlay = true) {
    const track = this.currentTrack;
    if (!track) return;

    this.applyTrackInfo(track);

    const audioInfo = await API.getSongUrl(track.id, track.provider, track.name, track.artist, this.quality);
    if (!audioInfo?.url) {
      this.handlePlaybackFailure('无法获取播放链接');
      return;
    }
    this.updateSourceLabel(audioInfo);

    if (this.pendingCurrentTime > 0) {
      this.audio.addEventListener('loadedmetadata', () => {
        if (this.pendingCurrentTime > 0 && this.audio.duration) {
          this.audio.currentTime = Math.min(this.pendingCurrentTime, Math.max(0, this.audio.duration - 1));
          this.pendingCurrentTime = 0;
        }
      }, { once: true });
    }

    this.failureCount = 0;
    this.audio.src = audioInfo.url;
    if (autoPlay) {
      try { await this.audio.play(); } catch (e) { console.error('播放失败:', e); }
    }
    this.loadLyrics(track.id, track.provider, track.name, track.artist);
    this.renderQueue();
    this.saveState();
  }

  async reloadCurrentQuality() {
    const track = this.currentTrack;
    if (!track) return false;
    const resumeAt = this.audio.currentTime || 0;
    const wasPlaying = this.isPlaying;
    const audioInfo = await API.getSongUrl(track.id, track.provider, track.name, track.artist, this.quality);
    if (!audioInfo?.url) {
      this.trackName.textContent = '该音质不可用';
      return false;
    }
    this.updateSourceLabel(audioInfo);
    this.pendingCurrentTime = resumeAt;
    this.audio.src = audioInfo.url;
    if (wasPlaying) {
      try { await this.audio.play(); } catch (e) { return false; }
    }
    this.saveState();
    return true;
  }

  handlePlaybackFailure(message) {
    this.failureCount += 1;
    this.trackName.textContent = message;
    if (!this.playlist.length || this.failureCount >= Math.min(this.maxFailureCount, this.playlist.length)) {
      this.trackName.textContent = '连续播放失败，请稍后重试';
      this.audio.pause();
      this.isPlaying = false;
      return;
    }
    setTimeout(() => this.next(), 1500);
  }

  updateSourceLabel(audioInfo) {
    if (!this.sourceLabel) return;
    const qualityText = audioInfo.qualityLabel || this.qualityLabels[this.quality] || '';
    if (audioInfo.source === 'karpov') {
      this.sourceLabel.textContent = `官方源${qualityText ? ' · ' + qualityText : ''}`;
      this.sourceLabel.className = 'player-source-label official';
    } else if (audioInfo.source === 'gdstudio') {
      this.sourceLabel.textContent = `备用源${qualityText ? ' · ' + qualityText : ''}`;
      this.sourceLabel.className = 'player-source-label fallback';
    } else if (audioInfo.source === 'kuwo') {
      this.sourceLabel.textContent = '备用源';
      this.sourceLabel.className = 'player-source-label fallback';
    } else {
      this.sourceLabel.textContent = '音源';
      this.sourceLabel.className = 'player-source-label';
    }
  }

  async writeClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      textarea.remove();
      return ok;
    }
  }

  async copyLyrics() {
    if (!this.lyrics.length) {
      this.showModeToast('暂无歌词可复制');
      return;
    }
    const text = this.lyrics.map(line => line.trans ? `${line.text}\n${line.trans}` : line.text).join('\n');
    const ok = await this.writeClipboard(text);
    this.showModeToast(ok ? '整首歌词已复制' : '复制失败，请手动选择歌词');
  }

  async copyLine(idx) {
    const line = this.lyrics[idx];
    if (!line) return;
    const text = line.trans ? `${line.text}\n${line.trans}` : line.text;
    const ok = await this.writeClipboard(text);
    this.showModeToast(ok ? '已复制本句' : '复制失败');
  }

  // ===== 歌词颜色调制 =====
  loadLyricColors() {
    const defaults = { active: '#ffffff', inactive: '#8a8a99' };
    try {
      const saved = JSON.parse(localStorage.getItem('lyric-colors') || '{}');
      return {
        active: /^#[0-9a-fA-F]{6}$/.test(saved.active) ? saved.active : defaults.active,
        inactive: /^#[0-9a-fA-F]{6}$/.test(saved.inactive) ? saved.inactive : defaults.inactive
      };
    } catch (e) { return defaults; }
  }

  saveLyricColors() {
    try { localStorage.setItem('lyric-colors', JSON.stringify(this.lyricColors)); } catch (e) {}
  }

  loadDesktopOpacity() {
    const v = parseFloat(localStorage.getItem('desktop-lyric-opacity'));
    return (isFinite(v) && v >= 0.2 && v <= 1) ? v : 0.92;
  }

  saveDesktopOpacity() {
    try { localStorage.setItem('desktop-lyric-opacity', String(this.desktopOpacity)); } catch (e) {}
  }

  applyDesktopOpacity() {
    const bg = `rgba(13,13,26,${this.desktopOpacity})`;
    if (this.pipWindow) {
      try { this.pipWindow.document.body.style.background = bg; } catch (e) {}
    }
    if (this.desktopBar) {
      this.desktopBar.style.background = bg;
    }
  }

  // 桌面歌词悬停提示文案（快捷键速记）
  desktopHelpText() {
    return '快捷键：空格 播放/暂停 · ←/→ 快退/快进 · ↑/↓ 音量 · N/P 下一首/上一首 · M 静音 · R 模式 · Q 队列。透明度：页面内悬浮条能透出网页内容；独立 PiP 浮窗是系统窗口，浏览器不允许穿透看到桌面/其他应用。';
  }

  applyLyricColors() {
    if (this.lyricsPage) {
      this.lyricsPage.style.setProperty('--lyric-active', this.lyricColors.active);
      this.lyricsPage.style.setProperty('--lyric-inactive', this.lyricColors.inactive);
    }
    this.updateDesktopColors();
  }

  // 高亮某个预设色块（当前高亮色命中预设时打勾，否则都不选）
  updateSwatchSelection() {
    if (!this.lyricsPage) return;
    const cur = String(this.lyricColors.active).toLowerCase();
    this.lyricsPage.querySelectorAll('.lcp-swatch').forEach(sw => {
      sw.classList.toggle('active', sw.dataset.color.toLowerCase() === cur);
    });
  }

  resetLyricColors() {
    this.lyricColors = { active: '#ffffff', inactive: '#8a8a99' };
    this.desktopOpacity = 0.92;
    if (this.lyricColorActive) this.lyricColorActive.value = this.lyricColors.active;
    if (this.lyricColorInactive) this.lyricColorInactive.value = this.lyricColors.inactive;
    if (this.desktopOpacityInput) this.desktopOpacityInput.value = Math.round(this.desktopOpacity * 100);
    this.applyLyricColors();
    this.applyDesktopOpacity();
    this.saveLyricColors();
    this.saveDesktopOpacity();
    this.updateSwatchSelection();
    this.showModeToast('已恢复默认歌词颜色');
  }

  // ===== 桌面歌词：优先 Document PiP 真浮窗，不支持则降级为页面内可拖动悬浮条 =====
  get desktopLyricsActive() {
    return !!(this.pipWindow || this.desktopBar);
  }

  async toggleDesktopLyrics() {
    if (this.desktopLyricsActive) {
      this.closeDesktopLyrics();
      return;
    }
    if (window.documentPictureInPicture) {
      try {
        await this.openPipLyrics();
        return;
      } catch (e) {
        // 用户取消或失败，降级到悬浮条
      }
    }
    this.openFallbackBar();
  }

  async openPipLyrics() {
    const pip = await window.documentPictureInPicture.requestWindow({ width: 480, height: 150 });
    this.pipWindow = pip;
    const style = pip.document.createElement('style');
    style.textContent = `
      :root { --lyric-active:${this.lyricColors.active}; --lyric-inactive:${this.lyricColors.inactive}; }
      html,body{margin:0;height:100%;}
      body{background:rgba(13,13,26,${this.desktopOpacity});font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;overflow:hidden;padding:12px;box-sizing:border-box;text-align:center;}
      .dl-cur{font-size:24px;font-weight:700;color:var(--lyric-active);line-height:1.3;}
      .dl-cur-trans{font-size:16px;color:var(--lyric-active);opacity:0.75;line-height:1.3;}
      .dl-next{font-size:15px;color:var(--lyric-inactive);line-height:1.3;margin-top:2px;}
      .dl-info{position:fixed;top:6px;right:8px;width:18px;height:18px;border-radius:50%;border:1px solid rgba(255,255,255,0.4);color:rgba(255,255,255,0.7);font-size:12px;font-style:italic;font-weight:700;line-height:16px;text-align:center;cursor:help;user-select:none;}
    `;
    pip.document.head.appendChild(style);
    const wrap = pip.document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:100%;';
    wrap.innerHTML = '<div class="dl-cur"></div><div class="dl-cur-trans"></div><div class="dl-next"></div>';
    pip.document.body.appendChild(wrap);
    const info = pip.document.createElement('div');
    info.className = 'dl-info';
    info.textContent = 'i';
    info.title = this.desktopHelpText();
    pip.document.body.appendChild(info);
    this.pipCur = wrap.querySelector('.dl-cur');
    this.pipCurTrans = wrap.querySelector('.dl-cur-trans');
    this.pipNext = wrap.querySelector('.dl-next');
    pip.addEventListener('pagehide', () => this.closeDesktopLyrics());
    pip.document.addEventListener('keydown', (e) => this.handleShortcut(e));
    this.updateDesktopBtnState(true);
    this.applyDesktopOpacity();
    this.renderDesktopLyric();
  }

  openFallbackBar() {
    const bar = document.createElement('div');
    bar.className = 'desktop-lyric-bar';
    bar.innerHTML = `<button class="dlb-info" title="${this.desktopHelpText()}">i</button><div class="dlb-text"><div class="dl-cur"></div><div class="dl-cur-trans"></div><div class="dl-next"></div></div><button class="dlb-close" title="关闭桌面歌词">✕</button>`;
    document.body.appendChild(bar);
    this.desktopBar = bar;
    this.pipCur = bar.querySelector('.dl-cur');
    this.pipCurTrans = bar.querySelector('.dl-cur-trans');
    this.pipNext = bar.querySelector('.dl-next');
    bar.querySelector('.dlb-close').addEventListener('click', () => this.closeDesktopLyrics());
    this.makeDraggable(bar);
    this.updateDesktopColors();
    this.applyDesktopOpacity();
    this.updateDesktopBtnState(true);
    this.showModeToast('当前浏览器不支持浮动窗，已用页面内悬浮歌词');
    this.renderDesktopLyric();
  }

  closeDesktopLyrics() {
    if (this.pipWindow) {
      try { this.pipWindow.close(); } catch (e) {}
      this.pipWindow = null;
    }
    if (this.desktopBar) {
      this.desktopBar.remove();
      this.desktopBar = null;
    }
    this.pipCur = null;
    this.pipCurTrans = null;
    this.pipNext = null;
    this.updateDesktopBtnState(false);
  }

  updateDesktopBtnState(active) {
    const btn = this.lyricsPage?.querySelector('[data-action="toggle-desktop-lyric"]');
    if (btn) btn.classList.toggle('active', active);
  }

  updateDesktopColors() {
    if (this.pipWindow) {
      const root = this.pipWindow.document.documentElement;
      root.style.setProperty('--lyric-active', this.lyricColors.active);
      root.style.setProperty('--lyric-inactive', this.lyricColors.inactive);
    }
    if (this.desktopBar) {
      this.desktopBar.style.setProperty('--lyric-active', this.lyricColors.active);
      this.desktopBar.style.setProperty('--lyric-inactive', this.lyricColors.inactive);
    }
  }

  renderDesktopLyric() {
    if (!this.pipCur) return;
    const idx = this.currentLyricIdx;
    const line = (idx >= 0) ? this.lyrics[idx] : null;
    const cur = line ? line.text : '';
    const curTrans = line ? (line.trans || '') : '';
    const next = (idx >= 0 && this.lyrics[idx + 1]) ? this.lyrics[idx + 1].text : '';
    this.pipCur.textContent = cur || (this.lyrics.length ? '♪' : '暂无歌词');
    if (this.pipCurTrans) {
      this.pipCurTrans.textContent = curTrans;
      this.pipCurTrans.style.display = curTrans ? '' : 'none';
    }
    this.pipNext.textContent = next;
  }

  makeDraggable(el) {
    let sx, sy, ox, oy, dragging = false;
    const onDown = (e) => {
      if (e.target.closest('.dlb-close, .dlb-info')) return;
      dragging = true;
      const p = e.touches ? e.touches[0] : e;
      sx = p.clientX; sy = p.clientY;
      const rect = el.getBoundingClientRect();
      ox = rect.left; oy = rect.top;
      el.style.transition = 'none';
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!dragging) return;
      const p = e.touches ? e.touches[0] : e;
      el.style.left = (ox + p.clientX - sx) + 'px';
      el.style.top = (oy + p.clientY - sy) + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    };
    const onUp = () => { dragging = false; };
    el.addEventListener('mousedown', onDown);
    el.addEventListener('touchstart', onDown, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
  }

  async loadLyrics(songId, provider, name, artist) {
    this.lyrics = [];
    this.currentLyricIdx = -1;

    const data = await API.getLyric(songId, provider, name, artist);
    if (!data || !data.lyric) {
      this.lyricsScroll.innerHTML = '<div class="lyric-line lyric-empty">暂无歌词</div>';
      return;
    }

    const origLines = this.parseLRC(data.lyric);
    const transLines = data.tlyric ? this.parseLRC(data.tlyric) : [];
    const transMap = {};
    transLines.forEach(t => { transMap[t.time] = t.text; });

    this.lyrics = origLines.map(line => ({
      time: line.time,
      text: line.text,
      trans: transMap[line.time] || ''
    })).filter(l => l.text.trim());

    this.renderLyrics();
  }

  parseLRC(lrc) {
    const lines = [];
    let offset = 0;
    String(lrc || '').split(/\r?\n/).forEach(rawLine => {
      const offsetMatch = rawLine.match(/^\[offset:([+-]?\d+)\]/i);
      if (offsetMatch) {
        offset = parseInt(offsetMatch[1], 10) / 1000;
        return;
      }

      const timeMatches = [...rawLine.matchAll(/\[(\d+):(\d+)(?:\.(\d+))?\]/g)];
      if (!timeMatches.length) return;
      const text = rawLine.replace(/\[(\d+):(\d+)(?:\.(\d+))?\]/g, '').trim();
      if (!text) return;

      timeMatches.forEach(match => {
        const min = parseInt(match[1], 10);
        const sec = parseInt(match[2], 10);
        const msText = match[3] || '0';
        const ms = parseInt(msText.padEnd(3, '0').slice(0, 3), 10);
        lines.push({ time: Math.max(0, min * 60 + sec + ms / 1000 + offset), text });
      });
    });
    return lines.sort((a, b) => a.time - b.time);
  }

  renderLyrics() {
    if (this.lyrics.length === 0) {
      this.lyricsScroll.innerHTML = '<div class="lyric-line lyric-empty">暂无歌词</div>';
      return;
    }

    this.lyricsScroll.innerHTML = this.lyrics.map((line, i) => `
      <div class="lyric-line" data-index="${i}" title="点击跳转，悬停可复制本句">
        <div class="lyric-text">${this.escapeHtml(line.text)}</div>
        ${line.trans ? `<div class="lyric-trans">${this.escapeHtml(line.trans)}</div>` : ''}
        <button class="lyric-copy-line" data-index="${i}" title="复制本句">${Icons.copy}</button>
      </div>
    `).join('') + '<div style="height:40vh"></div>';

    this.lyricEls = this.lyricsScroll.querySelectorAll('.lyric-line');
  }

  syncLyric() {
    if (!this.lyrics.length || !this.lyricEls) return;
    const time = this.audio.currentTime;
    let idx = -1;
    for (let i = this.lyrics.length - 1; i >= 0; i--) {
      if (time >= this.lyrics[i].time) { idx = i; break; }
    }
    if (idx === this.currentLyricIdx) return;
    this.currentLyricIdx = idx;
    this.renderDesktopLyric();
    this.lyricEls.forEach((el, i) => el.classList.toggle('active', i === idx));
    if (idx >= 0 && this.lyricEls[idx]) {
      const el = this.lyricEls[idx];
      const container = this.lyricsScroll;
      const offsetTop = el.offsetTop - container.offsetTop;
      container.scrollTo({ top: offsetTop - container.clientHeight / 3, behavior: 'smooth' });
    }
  }

  // 播放模式切换
  cyclePlayMode() {
    const idx = this.playModes.indexOf(this.playMode);
    this.playMode = this.playModes[(idx + 1) % this.playModes.length];
    this.updateModeIcon();
    this.showModeToast();
    this.saveState();
  }

  toggleShuffle() {
    this.playMode = this.playMode === 'random' ? 'sequence' : 'random';
    this.updateModeIcon();
    this.showModeToast();
    this.saveState();
  }

  updateModeIcon() {
    const modeIcons = { sequence: Icons.repeat, loop: Icons.repeat1 || Icons.repeat, random: Icons.shuffle };
    const modeNames = { sequence: '顺序播放', loop: '单曲循环', random: '随机播放' };
    this.modeBtn.innerHTML = modeIcons[this.playMode] || Icons.repeat;
    this.modeBtn.title = modeNames[this.playMode];
  }

  showModeToast(message) {
    const modeNames = { sequence: '顺序播放', loop: '单曲循环', random: '随机播放' };
    const toast = document.createElement('div');
    toast.className = 'mode-toast';
    toast.textContent = message || modeNames[this.playMode];
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1500);
  }

  next() {
    if (!this.playlist.length) return;
    if (this.playMode === 'random') {
      this.currentIndex = Math.floor(Math.random() * this.playlist.length);
    } else {
      this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
    }
    this.loadAndPlay();
  }

  prev() {
    if (!this.playlist.length) return;
    this.currentIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
    this.loadAndPlay();
  }

  openLyricsPage() {
    if (!this.currentTrack) return;
    this.lyricsPage.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  closeLyricsPage() {
    this.lyricsPage.classList.remove('show');
    document.body.style.overflow = '';
  }

  toggleQueue() {
    this.queuePanel.classList.toggle('show');
    if (this.queuePanel.classList.contains('show')) this.renderQueue();
  }

  closeQueue() {
    this.queuePanel.classList.remove('show');
  }

  clearQueue() {
    this.playlist = [];
    this.currentIndex = -1;
    this.audio.pause();
    this.audio.src = '';
    this.trackName.textContent = '未播放';
    this.trackArtist.textContent = '-';
    this.queueBadge.textContent = '0';
    this.renderQueue();
    this.saveState();
  }

  renderQueue() {
    if (!this.queueList) return;
    if (this.playlist.length === 0) {
      this.queueList.innerHTML = '<div class="queue-empty">队列为空</div>';
      return;
    }
    this.queueList.innerHTML = this.playlist.map((track, i) => `
      <div class="queue-item ${i === this.currentIndex ? 'active' : ''}" data-index="${i}">
        <span class="queue-item-idx">${i === this.currentIndex ? '▶' : i + 1}</span>
        <div class="queue-item-info">
          <div class="queue-item-name">${this.escapeHtml(track.name)}</div>
          <div class="queue-item-artist">${this.escapeHtml(track.artist)}</div>
        </div>
      </div>
    `).join('');
  }

  toggleMute() {
    if (this.audio.volume > 0) {
      this.prevVolume = this.audio.volume;
      this.audio.volume = 0;
      this.volumeSlider.value = 0;
    } else {
      this.audio.volume = this.prevVolume || 0.8;
      this.volumeSlider.value = this.audio.volume * 100;
    }
    this.updateVolumeIcon();
    this.saveState();
  }

  adjustVolume(delta) {
    const vol = Math.max(0, Math.min(1, this.audio.volume + delta));
    this.audio.volume = vol;
    this.volumeSlider.value = vol * 100;
    this.updateVolumeIcon();
    this.saveState();
  }

  seekBy(delta) {
    if (!this.audio.duration) return;
    this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, this.audio.currentTime + delta));
  }

  updateVolumeIcon() {
    this.volumeBtn.innerHTML = this.audio.volume === 0 ? (Icons.volumeX || Icons.volume2) : Icons.volume2;
  }

  updateQualityUI() {
    this.qualityBadge.textContent = this.qualityLabels[this.quality] || this.quality;
    this.qualityPopup.querySelectorAll('.quality-option').forEach(opt => {
      const isActive = opt.dataset.quality === this.quality;
      opt.classList.toggle('active', isActive);
      const existing = opt.querySelector('.check');
      if (existing) existing.remove();
      if (isActive) {
        const check = document.createElement('span');
        check.className = 'check';
        check.textContent = '✓';
        opt.appendChild(check);
      }
    });
  }

  applyTrackInfo(track) {
    if (!track) return;
    this.trackName.textContent = track.name || '未知歌曲';
    this.trackArtist.textContent = track.artist || '-';
    this.lyricsName.textContent = track.name || '-';
    this.lyricsArtist.textContent = track.artist || '-';

    if (track.cover) {
      const img = document.createElement('img');
      img.src = track.cover;
      img.alt = '';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      img.style.borderRadius = '8px';
      this.cover.replaceChildren(img);
      this.lyricsBg.style.backgroundImage = `url("${String(track.cover).replace(/"/g, '%22')}")`;
    } else {
      this.cover.innerHTML = Icons.music;
      this.cover.style.background = '#6c5ce7';
      this.lyricsBg.style.backgroundImage = 'none';
    }
  }

  togglePlay() {
    if (!this.audio.src && this.currentTrack) {
      this.loadAndPlay(true);
      return;
    }
    if (!this.audio.src) return;
    this.isPlaying ? this.audio.pause() : this.audio.play();
  }

  // 状态持久化
  saveState() {
    try {
      const state = {
        currentIndex: this.currentIndex,
        playMode: this.playMode,
        quality: this.quality,
        volume: this.audio.volume,
        currentTime: this.audio.currentTime || this.pendingCurrentTime || 0,
        playlist: this.playlist.map(t => ({ id: t.id, name: t.name, artist: t.artist, cover: t.cover, provider: t.provider, album: t.album, duration: t.duration }))
      };
      localStorage.setItem('music-player-state', JSON.stringify(state));
    } catch (e) {}
  }

  restoreState() {
    try {
      const saved = localStorage.getItem('music-player-state');
      if (!saved) return;
      const state = JSON.parse(saved);
      if (state.playlist?.length) {
        this.playlist = state.playlist;
        this.currentIndex = state.currentIndex || 0;
        this.queueBadge.textContent = this.playlist.length;
        this.applyTrackInfo(this.currentTrack);
        this.renderQueue();
      }
      if (state.playMode) {
        this.playMode = state.playMode;
        this.updateModeIcon();
      }
      if (state.quality) {
        this.quality = state.quality;
        this.updateQualityUI();
      }
      if (state.volume !== undefined) {
        this.audio.volume = state.volume;
        this.prevVolume = state.volume || this.prevVolume;
        this.volumeSlider.value = state.volume * 100;
        this.updateVolumeIcon();
      }
      if (state.currentTime) {
        this.pendingCurrentTime = state.currentTime;
        this.timeDisplay.textContent = `${this.formatTime(state.currentTime)} / 00:00`;
      }
    } catch (e) {}
  }

  formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
