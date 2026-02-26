import { FloatingWindow } from './FloatingWindow.js';
import { AIClient } from './AIClient.js';
import { VirtualFileSystem } from './VirtualFileSystem.js';

export class LandingPageGenerator {
  constructor(agents, planUI, speechBubbleUI) {
    this.agents = agents;
    this.planUI = planUI;
    this.speechBubbleUI = speechBubbleUI;
  }

  async generate() {
    const planSummary = this.planUI.getCurrentPlanSummary();

    // Open progress window
    const win = new FloatingWindow({
      title: 'Generating Landing Page',
      width: 500,
      height: 400,
      cssColor: '#ffbb66',
      resizable: true
    });

    const content = win.getContentEl();
    const progress = document.createElement('div');
    progress.className = 'lp-progress';

    const steps = [
      { agent: this._findAgent('coral'), label: 'Coral — Hero copy & value props' },
      { agent: this._findAgent('azure'), label: 'Azure — Technical details' },
      { agent: this._findAgent('sage'), label: 'Sage — Design direction' },
      { agent: null, label: 'Synthesizing final HTML' }
    ];

    const stepEls = steps.map(step => {
      const el = document.createElement('div');
      el.className = 'lp-step';
      el.innerHTML = `<div class="lp-step-dot"></div><span>${step.label}</span>`;
      progress.appendChild(el);
      return el;
    });

    content.appendChild(progress);

    const contributions = {};

    try {
      // Step 1: Coral — copy
      stepEls[0].classList.add('active');
      contributions.copy = await this._getContribution(
        steps[0].agent,
        planSummary,
        'Generate hero copy, value propositions, and CTA text for our landing page. Be compelling and specific. Return just the copy, no HTML.'
      );
      stepEls[0].classList.remove('active');
      stepEls[0].classList.add('done');

      // Step 2: Azure — tech
      stepEls[1].classList.add('active');
      contributions.tech = await this._getContribution(
        steps[1].agent,
        planSummary,
        'Describe technical architecture highlights, API/integration mentions, and tech stack for our landing page. Be specific. Return just the text, no HTML.'
      );
      stepEls[1].classList.remove('active');
      stepEls[1].classList.add('done');

      // Step 3: Sage — design
      stepEls[2].classList.add('active');
      contributions.design = await this._getContribution(
        steps[2].agent,
        planSummary,
        'Suggest a layout direction, color palette (hex codes), visual style notes, and typography for our landing page. Be specific. Return just the notes, no HTML.'
      );
      stepEls[2].classList.remove('active');
      stepEls[2].classList.add('done');

      // Step 4: Synthesize HTML
      stepEls[3].classList.add('active');
      const html = await this._synthesize(planSummary, contributions);
      stepEls[3].classList.remove('active');
      stepEls[3].classList.add('done');

      // Replace progress with iframe
      content.innerHTML = '';
      const iframe = document.createElement('iframe');
      iframe.className = 'lp-iframe';
      iframe.sandbox = 'allow-scripts';
      iframe.srcdoc = html;
      content.appendChild(iframe);

      win.setTitle('Landing Page Preview');

      const vfs = VirtualFileSystem.getInstance();
      vfs.createFile('/index.html', html, 'Team');
    } catch (err) {
      console.error('Landing page generation error:', err);
      progress.innerHTML += `<div style="color: #ff9999; padding: 8px; font-size: 12px;">Error generating landing page. Please try again.</div>`;
    }
  }

  _findAgent(idPrefix) {
    return this.agents.find(a => a.personality.id.toLowerCase().includes(idPrefix)) || this.agents[0];
  }

  async _getContribution(agent, planSummary, task) {
    const p = agent.personality;
    const messages = [
      {
        role: 'system',
        content: p.systemPrompt + '\n\nYou are contributing to a landing page for your project. ' + task
      },
      {
        role: 'user',
        content: `Our project plan:\n${planSummary}\n\nProvide your contribution for the landing page:`
      }
    ];

    const response = await AIClient.chat(messages);
    return response || '';
  }

  async _synthesize(planSummary, contributions) {
    const messages = [
      {
        role: 'system',
        content: 'Generate a modern, responsive landing page as a single HTML file with inline CSS and minimal inline JS. Include: hero section, features/value props, tech highlights, pricing placeholder, and CTA. Make it visually polished and professional. Return ONLY the HTML code, no markdown fences, no explanation.'
      },
      {
        role: 'user',
        content: `Plan:\n${planSummary}\n\nCopy & Value Props (from product lead):\n${contributions.copy}\n\nTechnical Details (from engineering lead):\n${contributions.tech}\n\nDesign Direction (from design lead):\n${contributions.design}\n\nGenerate the complete HTML landing page:`
      }
    ];

    const response = await AIClient.chat(messages, { max_tokens: 2000 });
    if (!response) return '<html><body><h1>Generation failed</h1></body></html>';

    // Clean up any markdown fences
    let html = response;
    html = html.replace(/^```html?\s*/i, '').replace(/```\s*$/, '');

    // Ensure it's valid HTML
    if (!html.includes('<html') && !html.includes('<!DOCTYPE')) {
      html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${html}</body></html>`;
    }

    return html;
  }
}
