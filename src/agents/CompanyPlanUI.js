import { renderMarkdown } from './markdown.js';

const DEFAULT_ICONS = {
  idea: '?', name: '?', product: '?', users: '?', model: '?', roadmap: '?',
  architecture: '?', tech_stack: '?', design: '?', strategy: '?',
};

function labelFromKey(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export class CompanyPlanUI {
  constructor() {
    this.plan = {};
    this.panel = this._create();
    this.sections = {};
  }

  _create() {
    const panel = document.createElement('aside');
    panel.className = 'plan-panel';
    panel.setAttribute('aria-label', 'Project plan');
    panel.innerHTML = `
      <div class="plan-header">
        <h2 class="plan-title">Project Plan</h2>
        <p class="plan-subtitle" aria-live="polite">Building something together...</p>
      </div>
      <div class="plan-sections" role="list" aria-label="Plan sections"></div>
    `;
    // Hidden — plan data is tracked internally for agent context,
    // but the FileActivityPanel is the visible left panel now.
    panel.style.display = 'none';
    document.getElementById('app').appendChild(panel);
    return panel;
  }

  _ensureSection(key) {
    if (this.sections[key]) return this.sections[key];

    const container = this.panel.querySelector('.plan-sections');
    const icon = DEFAULT_ICONS[key] || '?';
    const label = labelFromKey(key);

    const el = document.createElement('div');
    el.className = 'plan-section pending';
    el.dataset.key = key;
    el.setAttribute('role', 'listitem');
    el.innerHTML = `
      <div class="plan-section-header">
        <span class="plan-section-icon" aria-hidden="true">${icon}</span>
        <h3 class="plan-section-label">${label}</h3>
      </div>
      <div class="plan-section-content" aria-live="polite"></div>
    `;
    container.appendChild(el);
    this.sections[key] = el;
    return el;
  }

  markActive(key) {
    const el = this._ensureSection(key);
    // Remove active from others
    Object.values(this.sections).forEach(s => s.classList.remove('active'));
    el.classList.remove('pending');
    el.classList.add('active');
    // Scroll into view
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  updateSection(key, text) {
    const el = this._ensureSection(key);
    const content = el.querySelector('.plan-section-content');
    content.innerHTML = renderMarkdown(text);
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
    for (const [key, value] of Object.entries(this.plan)) {
      if (value) {
        summary += `${labelFromKey(key)}: ${value}\n`;
      }
    }
    return summary;
  }
}
