export class CrewHUD {
  constructor({ onAddAgent, onStartMeeting }) {
    this.onAddAgent = onAddAgent;
    this.onStartMeeting = onStartMeeting;
    this.overlay = null;
    this.countBadge = null;
    this._create();
  }

  _create() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'crew-overlay';
    this.overlay.setAttribute('role', 'region');
    this.overlay.setAttribute('aria-label', 'Team assembly');

    this.overlay.innerHTML = `
      <header class="crew-overlay-header">
        <h1 class="crew-overlay-title">Build Your Team</h1>
        <p class="crew-overlay-sub">Hand-picked from the finest GPUs money can rent</p>
      </header>
      <div class="crew-overlay-spacer"></div>
      <div class="crew-overlay-actions" role="toolbar" aria-label="Team actions">
        <button class="crew-overlay-btn crew-overlay-add" aria-label="Add new agent">+ Add Agent</button>
        <span class="crew-overlay-count" role="status" aria-live="polite">3 agents</span>
        <button class="crew-overlay-btn crew-overlay-start">Start Meeting</button>
      </div>
    `;

    this.countBadge = this.overlay.querySelector('.crew-overlay-count');

    this.overlay.querySelector('.crew-overlay-add').addEventListener('click', () => {
      this.onAddAgent();
    });

    this.overlay.querySelector('.crew-overlay-start').addEventListener('click', () => {
      this.onStartMeeting();
    });

    document.getElementById('app').appendChild(this.overlay);
    requestAnimationFrame(() => this.overlay.classList.add('visible'));
  }

  updateCount(n) {
    if (this.countBadge) {
      this.countBadge.textContent = `${n} agent${n !== 1 ? 's' : ''}`;
    }
  }

  destroy() {
    if (this.overlay) {
      this.overlay.classList.remove('visible');
      setTimeout(() => {
        this.overlay.remove();
        this.overlay = null;
      }, 500);
    }
  }
}
