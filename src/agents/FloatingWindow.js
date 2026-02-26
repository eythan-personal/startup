export class FloatingWindow {
  constructor({ title = 'Window', width = 400, height = 300, cssColor = '#99bbff', resizable = false, onClose = null }) {
    this.onClose = onClose;
    this.isDragging = false;
    this.isResizing = false;
    this.dragOffset = { x: 0, y: 0 };

    // Store previous focus for restoration
    this._previousFocus = document.activeElement;

    // Container
    this.el = document.createElement('div');
    this.el.className = 'floating-window';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-labelledby', 'fw-title-' + (FloatingWindow._idCounter = (FloatingWindow._idCounter || 0) + 1));
    this.el.style.width = width + 'px';
    this.el.style.height = height + 'px';
    this.el.style.left = (window.innerWidth / 2 - width / 2) + 'px';
    this.el.style.top = (window.innerHeight / 2 - height / 2) + 'px';

    // Title bar
    this.titleBar = document.createElement('div');
    this.titleBar.className = 'floating-window-titlebar';
    this.titleBar.style.borderTopColor = cssColor;

    const titleText = document.createElement('h2');
    titleText.className = 'floating-window-title';
    titleText.id = 'fw-title-' + FloatingWindow._idCounter;
    titleText.textContent = title;
    this.titleText = titleText;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'floating-window-close';
    closeBtn.setAttribute('aria-label', 'Close window');
    closeBtn.innerHTML = '<span aria-hidden="true">&times;</span>';
    closeBtn.addEventListener('click', () => this.destroy());

    this.titleBar.appendChild(titleText);
    this.titleBar.appendChild(closeBtn);

    // Content area
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'floating-window-content';

    this.el.appendChild(this.titleBar);
    this.el.appendChild(this.contentEl);

    // Resize handle
    if (resizable) {
      const handle = document.createElement('div');
      handle.className = 'floating-window-resize';
      this.el.appendChild(handle);
      this._setupResize(handle);
    }

    // Drag
    this._setupDrag();

    // Bring to front on click
    this.el.addEventListener('mousedown', () => this.bringToFront());

    document.getElementById('app').appendChild(this.el);
    this.bringToFront();
  }

  _setupDrag() {
    // Keyboard support for moving window
    this.titleBar.setAttribute('tabindex', '0');
    this.titleBar.setAttribute('aria-label', 'Drag to move window. Use arrow keys when focused.');
    this.titleBar.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 50 : 10;
      let moved = false;
      if (e.key === 'ArrowLeft')  { this.el.style.left = (this.el.offsetLeft - step) + 'px'; moved = true; }
      if (e.key === 'ArrowRight') { this.el.style.left = (this.el.offsetLeft + step) + 'px'; moved = true; }
      if (e.key === 'ArrowUp')    { this.el.style.top = (this.el.offsetTop - step) + 'px'; moved = true; }
      if (e.key === 'ArrowDown')  { this.el.style.top = (this.el.offsetTop + step) + 'px'; moved = true; }
      if (moved) e.preventDefault();
    });

    this.titleBar.addEventListener('mousedown', (e) => {
      if (e.target.closest('.floating-window-close')) return;
      this.isDragging = true;
      this.dragOffset.x = e.clientX - this.el.offsetLeft;
      this.dragOffset.y = e.clientY - this.el.offsetTop;
      e.preventDefault();
    });

    const onMouseMove = (e) => {
      if (this.isDragging) {
        this.el.style.left = (e.clientX - this.dragOffset.x) + 'px';
        this.el.style.top = (e.clientY - this.dragOffset.y) + 'px';
      }
    };

    const onMouseUp = () => {
      this.isDragging = false;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    this._cleanupDrag = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }

  _setupResize(handle) {
    handle.addEventListener('mousedown', (e) => {
      this.isResizing = true;
      this._resizeStart = { x: e.clientX, y: e.clientY, w: this.el.offsetWidth, h: this.el.offsetHeight };
      e.preventDefault();
      e.stopPropagation();
    });

    const onMouseMove = (e) => {
      if (this.isResizing) {
        const dw = e.clientX - this._resizeStart.x;
        const dh = e.clientY - this._resizeStart.y;
        this.el.style.width = Math.max(280, this._resizeStart.w + dw) + 'px';
        this.el.style.height = Math.max(200, this._resizeStart.h + dh) + 'px';
      }
    };

    const onMouseUp = () => {
      this.isResizing = false;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    this._cleanupResize = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }

  bringToFront() {
    FloatingWindow._zCounter = (FloatingWindow._zCounter || 100) + 1;
    this.el.style.zIndex = FloatingWindow._zCounter;
  }

  getContentEl() {
    return this.contentEl;
  }

  setTitle(title) {
    this.titleText.textContent = title;
  }

  destroy() {
    if (this._cleanupDrag) this._cleanupDrag();
    if (this._cleanupResize) this._cleanupResize();
    this.el.remove();
    // Restore focus to element that opened the window
    if (this._previousFocus && this._previousFocus.focus) {
      this._previousFocus.focus();
    }
    if (this.onClose) this.onClose();
  }
}
