import { VirtualFileSystem } from './VirtualFileSystem.js';
import { FloatingWindow } from './FloatingWindow.js';
import { renderMarkdown } from './markdown.js';

const FILE_ICONS = {
  html: '🌐', css: '🎨', javascript: '⚡', json: '📋',
  markdown: '📝', text: '📄', svg: '🖼️', xml: '📰',
};

export class FileActivityPanel {
  constructor() {
    this.vfs = VirtualFileSystem.getInstance();
    this.fileStatuses = new Map(); // path -> { status, agentName, agentColor, description, contributors }
    this.agentStatuses = new Map(); // agentId -> { name, cssColor, status, currentFile, lastFile }
    this.panel = this._create();
    this._unsubscribe = this.vfs.onChange(() => this._render());
  }

  _create() {
    const panel = document.createElement('aside');
    panel.className = 'plan-panel file-activity-panel';
    panel.setAttribute('aria-label', 'File activity');
    panel.innerHTML = `
      <div class="plan-header">
        <h2 class="plan-title">Files</h2>
        <p class="plan-subtitle">Collaborating...</p>
      </div>
      <div class="fa-agent-section" aria-label="Agent statuses"></div>
      <div class="fa-file-list" role="list" aria-label="Active files"></div>
    `;
    document.getElementById('app').appendChild(panel);
    requestAnimationFrame(() => panel.classList.add('visible'));
    return panel;
  }

  /** Initialize all agents as idle when meeting starts */
  setAgents(agents) {
    this.agentStatuses.clear();
    for (const agent of agents) {
      const p = agent.personality;
      this.agentStatuses.set(p.id, { name: p.name, cssColor: p.cssColor, status: 'idle', currentFile: null, lastFile: null });
    }
    this._renderAgentSection();
  }

  /** Update a single agent's status text */
  setAgentStatus(agentId, statusText) {
    const entry = this.agentStatuses.get(agentId);
    if (entry) {
      entry.status = statusText;
      this._renderAgentSection();
    }
  }

  _renderAgentSection() {
    const section = this.panel.querySelector('.fa-agent-section');
    if (!section) return;
    section.innerHTML = '';

    for (const [, agent] of this.agentStatuses) {
      const isWorking = agent.status !== 'idle';
      const row = document.createElement('div');
      row.className = 'fa-agent-row';

      // Build status display with file context
      let statusHtml = '';
      if (agent.currentFile) {
        const fileName = agent.currentFile.split('/').pop();
        const coworkers = this._getCoworkersOnFile(agent.currentFile, agent.name);
        statusHtml = `<span class="fa-agent-status-text working">writing <span class="fa-agent-file">${fileName}</span></span>`;
        if (coworkers.length > 0) {
          statusHtml += `<span class="fa-agent-collab">w/ ${coworkers.map(c => c.name).join(', ')}</span>`;
        }
      } else if (isWorking) {
        statusHtml = `<span class="fa-agent-status-text working">${agent.status}</span>`;
      } else if (agent.lastFile) {
        const fileName = agent.lastFile.split('/').pop();
        const coworkers = this._getCoworkersOnFile(agent.lastFile, agent.name);
        statusHtml = `<span class="fa-agent-status-text"><span class="fa-agent-file">${fileName}</span></span>`;
        if (coworkers.length > 0) {
          statusHtml += `<span class="fa-agent-collab">w/ ${coworkers.map(c => c.name).join(', ')}</span>`;
        }
      } else {
        statusHtml = `<span class="fa-agent-status-text">${agent.status}</span>`;
      }

      row.innerHTML = `
        <div class="fa-agent-row-left">
          <span class="fa-agent-dot${isWorking || agent.currentFile ? ' active' : ''}" style="background:${agent.cssColor}"></span>
          <span class="fa-agent-name" style="color:${agent.cssColor}">${agent.name}</span>
        </div>
        <div class="fa-agent-status-wrap">${statusHtml}</div>
      `;
      section.appendChild(row);
    }
  }

  /** Get other agents who contributed to this file */
  _getCoworkersOnFile(filePath, excludeName) {
    const fileStatus = this.fileStatuses.get(filePath);
    if (!fileStatus || !fileStatus.contributors) return [];
    const coworkers = [];
    for (const [name, color] of fileStatus.contributors) {
      if (name !== excludeName) coworkers.push({ name, color });
    }
    return coworkers;
  }

  /** Called by AgentFileGenerator before starting generation */
  markGenerating(filePath, agentName, agentColor, description) {
    const existing = this.fileStatuses.get(filePath);
    const contributors = existing ? new Map(existing.contributors) : new Map();
    contributors.set(agentName, agentColor);

    this.fileStatuses.set(filePath, {
      status: 'generating',
      agentName,
      agentColor,
      description: description || filePath,
      contributors,
    });

    // Track current file on agent
    const agentEntry = this._findAgentByName(agentName);
    if (agentEntry) {
      agentEntry.currentFile = filePath;
    }

    this._render();
  }

  /** Called by AgentFileGenerator after file is saved */
  markDone(filePath, agentName, agentColor) {
    const existing = this.fileStatuses.get(filePath);
    const contributors = existing ? new Map(existing.contributors) : new Map();
    contributors.set(agentName || (existing && existing.agentName) || 'Agent', agentColor || (existing && existing.agentColor) || '#aaa');

    this.fileStatuses.set(filePath, {
      status: 'done',
      agentName: agentName || (existing && existing.agentName) || 'Agent',
      agentColor: agentColor || (existing && existing.agentColor) || '#aaa',
      description: existing ? existing.description : filePath,
      contributors,
    });

    // Update agent's last file, clear current
    const agentEntry = this._findAgentByName(agentName);
    if (agentEntry) {
      agentEntry.currentFile = null;
      agentEntry.lastFile = filePath;
    }

    this._render();
  }

  _findAgentByName(name) {
    for (const [, entry] of this.agentStatuses) {
      if (entry.name === name) return entry;
    }
    return null;
  }

  _render() {
    const list = this.panel.querySelector('.fa-file-list');
    list.innerHTML = '';

    const subtitle = this.panel.querySelector('.plan-subtitle');

    // Merge VFS files with any in-flight statuses
    const allPaths = new Set([
      ...this.fileStatuses.keys(),
      ...this.vfs.listFiles().map(f => f.path),
    ]);

    if (allPaths.size === 0) {
      subtitle.textContent = 'Waiting for files...';
      subtitle.classList.remove('highlight');
      const empty = document.createElement('div');
      empty.className = 'fa-empty';
      empty.textContent = 'No files yet';
      list.appendChild(empty);
      return;
    }

    const count = allPaths.size;
    subtitle.textContent = `${count} file${count !== 1 ? 's' : ''}`;
    subtitle.classList.add('highlight');

    // Sort: generating first, then by most recent
    const sorted = [...allPaths].sort((a, b) => {
      const sa = this.fileStatuses.get(a);
      const sb = this.fileStatuses.get(b);
      if (sa && sa.status === 'generating' && (!sb || sb.status !== 'generating')) return -1;
      if (sb && sb.status === 'generating' && (!sa || sa.status !== 'generating')) return 1;
      const fa = this.vfs.getFile(a);
      const fb = this.vfs.getFile(b);
      return ((fb && fb.updatedAt) || 0) - ((fa && fa.updatedAt) || 0);
    });

    for (const path of sorted) {
      const status = this.fileStatuses.get(path);
      const file = this.vfs.getFile(path);
      const name = file ? file.name : path.split('/').pop();
      const type = file ? file.type : VirtualFileSystem.getFileType(path);
      const icon = FILE_ICONS[type] || '📄';
      const isGenerating = status && status.status === 'generating';
      const agentName = status ? status.agentName : (file ? file.createdBy : '');
      const agentColor = status ? status.agentColor : 'rgba(255,255,255,0.5)';
      const contributors = status && status.contributors ? status.contributors : new Map();

      const row = document.createElement('div');
      row.className = 'fa-file-row' + (isGenerating ? ' generating' : ' done');
      row.setAttribute('role', 'listitem');
      row.style.cursor = file ? 'pointer' : 'default';

      // Build contributor display
      let agentHtml = '';
      if (contributors.size > 1) {
        const names = [];
        for (const [cName, cColor] of contributors) {
          names.push(`<span style="color:${cColor}">${cName}</span>`);
        }
        agentHtml = names.join(' <span class="fa-file-collab-sep">&</span> ');
        if (isGenerating) agentHtml += ' — writing...';
      } else {
        agentHtml = `<span style="color:${agentColor}">${agentName}</span>${isGenerating ? ' — writing...' : ''}`;
      }

      row.innerHTML = `
        <span class="fa-file-icon">${icon}</span>
        <div class="fa-file-info">
          <span class="fa-file-name">${name}</span>
          <span class="fa-file-agent">${agentHtml}</span>
        </div>
        <span class="fa-file-status">${isGenerating ? '<span class="fa-spinner"></span>' : contributors.size > 1 ? '<span class="fa-collab-badge" title="Collaboration">&</span>' : '✓'}</span>
      `;

      if (file) {
        row.addEventListener('click', () => this._openFilePreview(path));
      }

      list.appendChild(row);
    }
  }

  _openFilePreview(path) {
    const file = this.vfs.getFile(path);
    if (!file) return;

    const win = new FloatingWindow({
      title: file.name,
      width: 520,
      height: 440,
      cssColor: '#aaddff',
      resizable: true,
    });

    const content = win.getContentEl();
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.overflow = 'hidden';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'fb-toolbar';

    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => {
      this._showEditor(win, path);
    });

    const dlBtn = document.createElement('button');
    dlBtn.textContent = 'Download';
    dlBtn.addEventListener('click', () => this.vfs.downloadFile(path));

    toolbar.appendChild(editBtn);
    toolbar.appendChild(dlBtn);
    content.appendChild(toolbar);

    if (file.type === 'html') {
      const iframe = document.createElement('iframe');
      iframe.className = 'fb-preview-iframe';
      iframe.sandbox = 'allow-scripts';
      iframe.srcdoc = file.content;
      content.appendChild(iframe);
    } else if (file.type === 'markdown') {
      const div = document.createElement('div');
      div.className = 'md-content';
      div.innerHTML = renderMarkdown(file.content);
      content.appendChild(div);
    } else {
      const pre = document.createElement('pre');
      pre.className = 'fb-preview-code';
      pre.textContent = file.content;
      content.appendChild(pre);
    }
  }

  _showEditor(win, path) {
    const file = this.vfs.getFile(path);
    if (!file) return;

    const content = win.getContentEl();
    content.innerHTML = '';

    const toolbar = document.createElement('div');
    toolbar.className = 'fb-toolbar';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      content.innerHTML = '';
      this._openFilePreviewInto(win, path);
    });

    toolbar.appendChild(saveBtn);
    toolbar.appendChild(cancelBtn);
    content.appendChild(toolbar);

    win.setTitle(`Edit — ${file.name}`);

    const textarea = document.createElement('textarea');
    textarea.className = 'fb-editor';
    textarea.value = file.content;
    textarea.spellcheck = false;
    content.appendChild(textarea);

    saveBtn.addEventListener('click', () => {
      this.vfs.updateFile(path, textarea.value);
      content.innerHTML = '';
      this._openFilePreviewInto(win, path);
    });

    textarea.focus();
  }

  _openFilePreviewInto(win, path) {
    const file = this.vfs.getFile(path);
    if (!file) return;

    const content = win.getContentEl();
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.overflow = 'hidden';

    win.setTitle(file.name);

    const toolbar = document.createElement('div');
    toolbar.className = 'fb-toolbar';

    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => this._showEditor(win, path));

    const dlBtn = document.createElement('button');
    dlBtn.textContent = 'Download';
    dlBtn.addEventListener('click', () => this.vfs.downloadFile(path));

    toolbar.appendChild(editBtn);
    toolbar.appendChild(dlBtn);
    content.appendChild(toolbar);

    if (file.type === 'html') {
      const iframe = document.createElement('iframe');
      iframe.className = 'fb-preview-iframe';
      iframe.sandbox = 'allow-scripts';
      iframe.srcdoc = file.content;
      content.appendChild(iframe);
    } else if (file.type === 'markdown') {
      const div = document.createElement('div');
      div.className = 'md-content';
      div.innerHTML = renderMarkdown(file.content);
      content.appendChild(div);
    } else {
      const pre = document.createElement('pre');
      pre.className = 'fb-preview-code';
      pre.textContent = file.content;
      content.appendChild(pre);
    }
  }

  destroy() {
    if (this._unsubscribe) this._unsubscribe();
    this.panel.remove();
  }
}
