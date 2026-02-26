let instance = null;

export class VirtualFileSystem {
  constructor() {
    this.files = new Map();
    this.listeners = [];
  }

  static getInstance() {
    if (!instance) {
      instance = new VirtualFileSystem();
    }
    return instance;
  }

  static getFileType(path) {
    const ext = path.split('.').pop().toLowerCase();
    const types = {
      html: 'html', htm: 'html',
      css: 'css',
      js: 'javascript', mjs: 'javascript',
      json: 'json',
      md: 'markdown',
      txt: 'text',
      svg: 'svg',
      xml: 'xml',
    };
    return types[ext] || 'text';
  }

  createFile(path, content, createdBy = 'Unknown') {
    const now = Date.now();
    const name = path.split('/').pop();
    this.files.set(path, {
      path,
      name,
      type: VirtualFileSystem.getFileType(path),
      content,
      createdBy,
      createdAt: now,
      updatedAt: now,
    });
    this._notify();
    return this.files.get(path);
  }

  updateFile(path, content) {
    const file = this.files.get(path);
    if (!file) return null;
    file.content = content;
    file.updatedAt = Date.now();
    this._notify();
    return file;
  }

  deleteFile(path) {
    const deleted = this.files.delete(path);
    if (deleted) this._notify();
    return deleted;
  }

  getFile(path) {
    return this.files.get(path) || null;
  }

  listFiles() {
    return Array.from(this.files.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  onChange(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  downloadFile(path) {
    const file = this.files.get(path);
    if (!file) return;
    const blob = new Blob([file.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  _notify() {
    this.listeners.forEach(cb => cb());
  }
}
