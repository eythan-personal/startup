import { AIClient } from './AIClient.js';

const DEFAULT_ROLES = ["Product", "Engineering", "Design", "Marketing", "Operations", "Legal", "Data Science", "Finance"];
const STORAGE_KEY = 'agent-roles';

export class AgentEditModal {
  constructor() {
    this.backdrop = null;
    this.modal = null;
    this._resolve = null;
    this.uploadedFiles = [];
  }

  show(personality) {
    return new Promise((resolve) => {
      this._resolve = resolve;
      this.uploadedFiles = [];
      this._create(personality);
    });
  }

  _loadRoles() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (Array.isArray(stored) && stored.length) return stored;
    } catch {}
    return [...DEFAULT_ROLES];
  }

  _saveRoles(roles) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(roles));
  }

  _create(p) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'agent-edit-backdrop';
    this.backdrop.setAttribute('role', 'presentation');

    const roles = this._loadRoles();

    this.modal = document.createElement('div');
    this.modal.className = 'agent-edit-modal';
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.setAttribute('aria-label', `Edit agent: ${p.name}`);

    const roleOptions = roles.map(r =>
      `<option value="${this._esc(r)}"${r === p.role ? ' selected' : ''}>${this._esc(r)}</option>`
    ).join('');
    // If current role exists but isn't in the list, add it
    const currentInList = roles.includes(p.role);
    const extraOption = (p.role && !currentInList)
      ? `<option value="${this._esc(p.role)}" selected>${this._esc(p.role)}</option>`
      : '';

    this.modal.innerHTML = `
      <label for="agent-edit-name" class="sr-only">Agent name</label>
      <input id="agent-edit-name" type="text" class="agent-edit-name" data-field="name" value="${this._esc(p.name)}" placeholder="Name" style="color: ${p.cssColor}" />
      <label for="agent-edit-role" class="sr-only">Agent role</label>
      <div class="agent-edit-role-wrapper">
        <select id="agent-edit-role" class="agent-edit-role-select" data-field="role">
          ${extraOption}
          ${roleOptions}
          <option value="__add_new__">+ Add role...</option>
        </select>
        <input type="text" class="agent-edit-role-add" placeholder="New role name..." style="display:none" />
      </div>
      <div class="agent-edit-prompt-header">
        <span class="agent-edit-prompt-label">Personality</span>
        <button class="agent-edit-generate" type="button">✦ Generate</button>
      </div>
      <label for="agent-edit-prompt" class="sr-only">Personality and expertise</label>
      <textarea id="agent-edit-prompt" class="agent-edit-prompt" data-field="systemPrompt" rows="4" placeholder="Personality, expertise, speaking style...">${this._esc(p.systemPrompt)}</textarea>
      <div class="agent-edit-footer">
        <input type="file" accept=".md,.txt" multiple class="agent-edit-file-input" style="display:none" aria-label="Upload personality files" />
        <button class="agent-edit-upload" aria-label="Upload .md or .txt files">Upload .md</button>
        <div class="agent-edit-file-list"></div>
        <div class="agent-edit-actions">
          <button class="agent-edit-cancel">Cancel</button>
          <button class="agent-edit-save">Save</button>
        </div>
      </div>
    `;

    this.backdrop.appendChild(this.modal);
    document.getElementById('app').appendChild(this.backdrop);

    // Store previously focused element for focus restoration
    this._previousFocus = document.activeElement;

    requestAnimationFrame(() => {
      this.backdrop.classList.add('visible');
      this.modal.classList.add('visible');
      this.modal.querySelector('.agent-edit-name').focus();
    });

    // --- Role dropdown: add-new flow ---
    const select = this.modal.querySelector('.agent-edit-role-select');
    const addInput = this.modal.querySelector('.agent-edit-role-add');

    select.addEventListener('change', () => {
      if (select.value === '__add_new__') {
        addInput.style.display = '';
        addInput.value = '';
        addInput.focus();
      } else {
        addInput.style.display = 'none';
      }
    });

    const commitNewRole = () => {
      const v = addInput.value.trim();
      if (v) {
        // Add to select before the "Add role..." option
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        select.insertBefore(opt, select.querySelector('option[value="__add_new__"]'));
        select.value = v;
        // Persist
        const updated = this._loadRoles();
        if (!updated.includes(v)) {
          updated.push(v);
          this._saveRoles(updated);
        }
      } else {
        // Revert to first real option
        select.value = select.options[0]?.value || '';
      }
      addInput.style.display = 'none';
    };

    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commitNewRole(); }
      if (e.key === 'Escape') { e.preventDefault(); addInput.style.display = 'none'; select.value = select.options[0]?.value || ''; }
    });
    addInput.addEventListener('blur', commitNewRole);

    // --- Generate personality button ---
    const generateBtn = this.modal.querySelector('.agent-edit-generate');
    generateBtn.addEventListener('click', async () => {
      const name = this.modal.querySelector('[data-field="name"]').value.trim() || p.name;
      const role = select.value === '__add_new__' ? addInput.value.trim() : select.value;
      if (!name && !role) return;

      generateBtn.textContent = 'Generating...';
      generateBtn.disabled = true;

      const result = await AIClient.chat([
        { role: 'system', content: 'Generate a 2-3 sentence personality for a team member. Include their communication style, values, and quirks. Be creative. Output ONLY the personality text.' },
        { role: 'user', content: `Name: ${name}, Role: ${role}` }
      ]);

      if (result) {
        this.modal.querySelector('[data-field="systemPrompt"]').value = result;
      }
      generateBtn.textContent = '✦ Generate';
      generateBtn.disabled = false;
    });

    // Trap focus within modal
    this.modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this._close(null);
        return;
      }
      if (e.key === 'Tab') {
        const focusable = this.modal.querySelectorAll('input:not([style*="display:none"]):not([style*="display: none"]), select, textarea, button');
        const visible = [...focusable].filter(el => el.offsetParent !== null);
        const first = visible[0];
        const last = visible[visible.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    this.modal.querySelector('.agent-edit-cancel').addEventListener('click', () => this._close(null));
    this.modal.querySelector('.agent-edit-save').addEventListener('click', () => this._save(p));
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this._close(null);
    });

    // --- Multi-file upload ---
    const uploadBtn = this.modal.querySelector('.agent-edit-upload');
    const fileInput = this.modal.querySelector('.agent-edit-file-input');
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const files = Array.from(fileInput.files);
      if (!files.length) return;

      let remaining = files.length;
      for (const file of files) {
        const reader = new FileReader();
        reader.onload = () => {
          // Avoid duplicates by name
          if (!this.uploadedFiles.find(f => f.name === file.name)) {
            this.uploadedFiles.push({ name: file.name, content: reader.result });
          }
          remaining--;
          if (remaining === 0) {
            this._syncUploadedFiles();
          }
        };
        reader.readAsText(file);
      }
      // Reset input so re-selecting same file triggers change
      fileInput.value = '';
    });
  }

  _syncUploadedFiles() {
    // Concatenate into textarea
    const textarea = this.modal.querySelector('.agent-edit-prompt');
    if (this.uploadedFiles.length === 0) {
      // Don't clear — user may have typed manually
    } else {
      textarea.value = this.uploadedFiles
        .map(f => `--- ${f.name} ---\n${f.content}`)
        .join('\n\n');
    }

    // Render file tags
    const list = this.modal.querySelector('.agent-edit-file-list');
    list.innerHTML = '';
    for (const f of this.uploadedFiles) {
      const tag = document.createElement('span');
      tag.className = 'agent-edit-file-tag';
      tag.innerHTML = `${this._esc(f.name)}<button type="button" aria-label="Remove ${this._esc(f.name)}">&times;</button>`;
      tag.querySelector('button').addEventListener('click', () => {
        this.uploadedFiles = this.uploadedFiles.filter(u => u.name !== f.name);
        this._syncUploadedFiles();
      });
      list.appendChild(tag);
    }

    // Update upload button label
    const uploadBtn = this.modal.querySelector('.agent-edit-upload');
    if (this.uploadedFiles.length > 0) {
      uploadBtn.textContent = `${this.uploadedFiles.length} file${this.uploadedFiles.length > 1 ? 's' : ''}`;
      uploadBtn.classList.add('has-file');
    } else {
      uploadBtn.textContent = 'Upload .md';
      uploadBtn.classList.remove('has-file');
    }
  }

  _save(original) {
    const select = this.modal.querySelector('.agent-edit-role-select');
    const addInput = this.modal.querySelector('.agent-edit-role-add');
    const name = this.modal.querySelector('[data-field="name"]').value.trim() || original.name;
    let role = select.value;
    if (role === '__add_new__') {
      role = addInput.value.trim();
    }
    role = role || original.role;

    // Persist new role if not already saved
    if (role) {
      const roles = this._loadRoles();
      if (!roles.includes(role)) {
        roles.push(role);
        this._saveRoles(roles);
      }
    }

    const systemPrompt = this.modal.querySelector('[data-field="systemPrompt"]').value.trim();
    this._close({ name, role, systemPrompt });
  }

  _close(result) {
    if (this.backdrop) {
      this.backdrop.classList.remove('visible');
      if (this.modal) this.modal.classList.remove('visible');
      setTimeout(() => {
        this.backdrop.remove();
        this.backdrop = null;
        this.modal = null;
      }, 300);
    }
    // Restore focus to previously focused element
    if (this._previousFocus && this._previousFocus.focus) {
      this._previousFocus.focus();
      this._previousFocus = null;
    }
    if (this._resolve) {
      this._resolve(result);
      this._resolve = null;
    }
  }

  _esc(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
