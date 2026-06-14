// 轮播模块
class Carousel {
  constructor(container, data) {
    this.container = container;
    this.data = data;
    this.activeIndex = 0;
    this.render();
    this.bindEvents();
    this.updatePositions();
  }

  render() {
    this.container.innerHTML = `
      <div class="carousel-container">
        <div class="carousel-track">
          ${this.data.map((item, i) => `
            <div class="carousel-card" data-index="${i}" style="background: ${item.gradient}">
              <div class="carousel-title">${this.escapeHtml(item.title)}</div>
              <div class="carousel-subtitle">${this.escapeHtml(item.subtitle)}</div>
              <div class="carousel-meta">
                <span>${Icons.play} ${this.escapeHtml(item.playCount)}</span>
                <span>by ${this.escapeHtml(item.recommender.name)}</span>
              </div>
            </div>
          `).join('')}
        </div>
        <button class="carousel-arrow left" data-dir="prev">${Icons.chevronLeft}</button>
        <button class="carousel-arrow right" data-dir="next">${Icons.chevronRight}</button>
      </div>
      <div class="carousel-dots">
        ${this.data.map((_, i) => `
          <button class="carousel-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></button>
        `).join('')}
      </div>
    `;

    this.cards = this.container.querySelectorAll('.carousel-card');
    this.dots = this.container.querySelectorAll('.carousel-dot');
    this.arrows = this.container.querySelectorAll('.carousel-arrow');
  }

  bindEvents() {
    this.arrows.forEach(btn => {
      btn.addEventListener('click', () => {
        const dir = btn.dataset.dir;
        if (dir === 'next') {
          this.activeIndex = (this.activeIndex + 1) % this.data.length;
        } else {
          this.activeIndex = (this.activeIndex - 1 + this.data.length) % this.data.length;
        }
        this.updatePositions();
      });
    });

    this.dots.forEach(dot => {
      dot.addEventListener('click', () => {
        this.activeIndex = parseInt(dot.dataset.index);
        this.updatePositions();
      });
    });

    this.cards.forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.index);
        if (idx !== this.activeIndex) {
          this.activeIndex = idx;
          this.updatePositions();
        }
      });
    });
  }

  updatePositions() {
    const len = this.data.length;
    this.cards.forEach((card, i) => {
      card.className = 'carousel-card';
      const offset = ((i - this.activeIndex + len) % len);
      let posClass;
      if (offset === 0) posClass = 'is-active';
      else if (offset === 1) posClass = 'is-next';
      else if (offset === len - 1) posClass = 'is-prev';
      else if (offset === 2) posClass = 'is-far-next';
      else if (offset === len - 2) posClass = 'is-far-prev';
      else posClass = 'is-hidden';
      card.classList.add(posClass);
    });

    this.dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === this.activeIndex);
    });
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
}
