import { FloatingWindow } from './FloatingWindow.js';
import { VirtualFileSystem } from './VirtualFileSystem.js';
import { renderMarkdown } from './markdown.js';

const FILE_ICONS = {
  html: '🌐',
  css: '🎨',
  javascript: '⚡',
  json: '📋',
  markdown: '📝',
  text: '📄',
  svg: '🖼️',
  xml: '📰',
};

export class FileBrowserUI {
  constructor() {
    this.vfs = VirtualFileSystem.getInstance();
    this.win = null;
    this.view = 'list';       // 'list' | 'preview' | 'edit' | 'new'
    this.currentFile = null;
    this._unsubscribe = null;
  }

  open() {
    if (this.win) {
      this.win.bringToFront();
      return;
    }

    this.win = new FloatingWindow({
      title: 'Files',
      width: 520,
      height: 440,
      cssColor: '#aaddff',
      resizable: true,
      onClose: () => {
        if (this._unsubscribe) this._unsubscribe();
        this._unsubscribe = null;
        this.win = null;
        this.view = 'list';
        this.currentFile = null;
      },
    });

    const content = this.win.getContentEl();
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.overflow = 'hidden';

    this._unsubscribe = this.vfs.onChange(() => {
      if (this.view === 'list') this._renderList();
    });

    this.view = 'list';
    this._renderList();
  }

  // ── List View ──

  _renderList() {
    const content = this._content();
    content.innerHTML = '';

    // Toolbar
    const toolbar = this._el('div', 'fb-toolbar');
    const newBtn = this._el('button');
    newBtn.textContent = '+ New File';
    newBtn.addEventListener('click', () => this._showNewFileForm());
    toolbar.appendChild(newBtn);
    content.appendChild(toolbar);

    const files = this.vfs.listFiles();

    if (files.length === 0) {
      const empty = this._el('div', 'fb-empty');
      empty.textContent = 'No files yet';
      content.appendChild(empty);
      return;
    }

    const list = this._el('div', 'fb-file-list');

    for (const file of files) {
      const row = this._el('div', 'fb-file-row');

      const icon = this._el('span', 'fb-file-icon');
      icon.textContent = FILE_ICONS[file.type] || '📄';

      const name = this._el('span', 'fb-file-name');
      name.textContent = file.name;

      const meta = this._el('span', 'fb-file-meta');
      meta.textContent = `${file.createdBy} · ${this._timeAgo(file.updatedAt)}`;

      const actions = this._el('div', 'fb-file-actions');

      const dlBtn = this._el('button');
      dlBtn.textContent = '↓';
      dlBtn.title = 'Download';
      dlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.vfs.downloadFile(file.path);
      });

      const delBtn = this._el('button', 'fb-delete-btn');
      delBtn.textContent = '✕';
      delBtn.title = 'Delete';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.vfs.deleteFile(file.path);
      });

      actions.appendChild(dlBtn);
      actions.appendChild(delBtn);

      row.appendChild(icon);
      row.appendChild(name);
      row.appendChild(meta);
      row.appendChild(actions);

      row.addEventListener('click', () => this._showPreview(file.path));
      list.appendChild(row);
    }

    content.appendChild(list);
  }

  // ── Preview View ──

  _showPreview(path) {
    const file = this.vfs.getFile(path);
    if (!file) return;

    this.view = 'preview';
    this.currentFile = path;
    const content = this._content();
    content.innerHTML = '';

    // Toolbar
    const toolbar = this._el('div', 'fb-toolbar');

    const backBtn = this._el('button', 'fb-back-btn');
    backBtn.textContent = '← Back';
    backBtn.addEventListener('click', () => {
      this.view = 'list';
      this.currentFile = null;
      this._renderList();
    });

    const editBtn = this._el('button');
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => this._showEditor(path));

    const dlBtn = this._el('button');
    dlBtn.textContent = 'Download';
    dlBtn.addEventListener('click', () => this.vfs.downloadFile(path));

    toolbar.appendChild(backBtn);
    toolbar.appendChild(editBtn);
    toolbar.appendChild(dlBtn);
    content.appendChild(toolbar);

    this.win.setTitle(`Files — ${file.name}`);

    if (file.type === 'html') {
      const iframe = document.createElement('iframe');
      iframe.className = 'fb-preview-iframe';
      iframe.sandbox = 'allow-scripts';
      iframe.srcdoc = file.content;
      content.appendChild(iframe);
    } else if (file.type === 'markdown') {
      const div = this._el('div', 'md-content');
      div.innerHTML = renderMarkdown(file.content);
      content.appendChild(div);
    } else {
      const pre = this._el('pre', 'fb-preview-code');
      pre.textContent = file.content;
      content.appendChild(pre);
    }
  }

  // ── Edit View ──

  _showEditor(path) {
    const file = this.vfs.getFile(path);
    if (!file) return;

    this.view = 'edit';
    const content = this._content();
    content.innerHTML = '';

    const toolbar = this._el('div', 'fb-toolbar');

    const backBtn = this._el('button', 'fb-back-btn');
    backBtn.textContent = '← Back';
    backBtn.addEventListener('click', () => this._showPreview(path));

    const saveBtn = this._el('button');
    saveBtn.textContent = 'Save';

    const cancelBtn = this._el('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this._showPreview(path));

    toolbar.appendChild(backBtn);
    toolbar.appendChild(saveBtn);
    toolbar.appendChild(cancelBtn);
    content.appendChild(toolbar);

    this.win.setTitle(`Edit — ${file.name}`);

    const textarea = document.createElement('textarea');
    textarea.className = 'fb-editor';
    textarea.value = file.content;
    textarea.spellcheck = false;
    content.appendChild(textarea);

    saveBtn.addEventListener('click', () => {
      this.vfs.updateFile(path, textarea.value);
      this._showPreview(path);
    });

    textarea.focus();
  }

  // ── New File ──

  _showNewFileForm() {
    this.view = 'new';
    const content = this._content();
    content.innerHTML = '';

    const toolbar = this._el('div', 'fb-toolbar');
    const backBtn = this._el('button', 'fb-back-btn');
    backBtn.textContent = '← Back';
    backBtn.addEventListener('click', () => {
      this.view = 'list';
      this._renderList();
    });
    toolbar.appendChild(backBtn);
    content.appendChild(toolbar);

    this.win.setTitle('New File');

    const form = this._el('div', 'fb-new-file-form');

    const input = document.createElement('input');
    input.className = 'fb-filename-input';
    input.type = 'text';
    input.placeholder = 'filename.html';

    const select = document.createElement('select');
    select.className = 'fb-type-select';
    for (const ext of ['html', 'css', 'js', 'json', 'md', 'txt']) {
      const opt = document.createElement('option');
      opt.value = ext;
      opt.textContent = `.${ext}`;
      select.appendChild(opt);
    }

    const createBtn = this._el('button');
    createBtn.textContent = 'Create';
    createBtn.style.cssText = 'padding:4px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);border-radius:6px;color:rgba(255,255,255,0.55);font-family:Inter,sans-serif;font-size:10px;font-weight:500;letter-spacing:0.5px;text-transform:uppercase;cursor:pointer;';

    form.appendChild(input);
    form.appendChild(select);
    form.appendChild(createBtn);
    content.appendChild(form);

    // Sync extension dropdown with filename input
    input.addEventListener('input', () => {
      const ext = input.value.split('.').pop().toLowerCase();
      if ([...select.options].some(o => o.value === ext)) {
        select.value = ext;
      }
    });

    const doCreate = () => {
      let filename = input.value.trim();
      if (!filename) return;
      if (!filename.includes('.')) {
        filename += '.' + select.value;
      }
      const path = filename.startsWith('/') ? filename : '/' + filename;
      this.vfs.createFile(path, '', 'User');
      this._showEditor(path);
    };

    createBtn.addEventListener('click', doCreate);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doCreate();
    });

    input.focus();
  }

  // ── Helpers ──

  _content() {
    return this.win.getContentEl();
  }

  _el(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  }

  _timeAgo(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString();
  }
}
