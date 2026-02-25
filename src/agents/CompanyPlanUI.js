const PLAN_SECTIONS = [
  { key: 'idea', label: 'The Idea', icon: '?' },
  { key: 'name', label: 'Company Name', icon: '?' },
  { key: 'product', label: 'Product', icon: '?' },
  { key: 'users', label: 'Target Users', icon: '?' },
  { key: 'model', label: 'Business Model', icon: '?' },
  { key: 'roadmap', label: 'V1 Roadmap', icon: '?' },
];

export class CompanyPlanUI {
  constructor() {
    this.plan = {};
    this.panel = this._create();
    this.sections = {};
    this._buildSections();
  }

  _create() {
    const panel = document.createElement('div');
    panel.className = 'plan-panel';
    panel.innerHTML = `
      <div class="plan-header">
        <div class="plan-title">Startup Plan</div>
        <div class="plan-subtitle">Building something together...</div>
      </div>
      <div class="plan-sections"></div>
    `;
    document.getElementById('app').appendChild(panel);

    // Show after a beat
    requestAnimationFrame(() => panel.classList.add('visible'));
    return panel;
  }

  _buildSections() {
    const container = this.panel.querySelector('.plan-sections');
    for (const section of PLAN_SECTIONS) {
      const el = document.createElement('div');
      el.className = 'plan-section pending';
      el.dataset.key = section.key;
      el.innerHTML = `
        <div class="plan-section-header">
          <span class="plan-section-icon">${section.icon}</span>
          <span class="plan-section-label">${section.label}</span>
        </div>
        <div class="plan-section-content"></div>
      `;
      container.appendChild(el);
      this.sections[section.key] = el;
    }
  }

  markActive(key) {
    const el = this.sections[key];
    if (!el) return;
    // Remove active from others
    Object.values(this.sections).forEach(s => s.classList.remove('active'));
    el.classList.remove('pending');
    el.classList.add('active');
    // Scroll into view
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  updateSection(key, text) {
    const el = this.sections[key];
    if (!el) return;
    const content = el.querySelector('.plan-section-content');
    content.textContent = text;
    el.classList.remove('active', 'pending');
    el.classList.add('done');
    this.plan[key] = text;

    // Update subtitle with company name when available
    if (key === 'name' && text) {
      const subtitle = this.panel.querySelector('.plan-subtitle');
      subtitle.textContent = text;
      subtitle.classList.add('highlight');
    }
  }

  getCurrentPlanSummary() {
    let summary = '';
    for (const section of PLAN_SECTIONS) {
      if (this.plan[section.key]) {
        summary += `${section.label}: ${this.plan[section.key]}\n`;
      }
    }
    return summary;
  }
}
