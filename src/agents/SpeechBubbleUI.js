import * as THREE from 'three';
import { renderMarkdown } from './markdown.js';

export class SpeechBubbleUI {
  constructor(camera) {
    this.camera = camera;
    this.activeBubbles = new Map(); // agentId -> { element, timer }
    this.chatLog = this._createChatLog();
  }

  _createChatLog() {
    const panel = document.createElement('aside');
    panel.className = 'chat-log';
    panel.setAttribute('aria-label', 'Chat log');
    panel.innerHTML = `
      <h2 class="chat-log-header">Polytope Labs — Water Cooler</h2>
      <div class="chat-log-messages" role="log" aria-live="polite" aria-relevant="additions"></div>
    `;
    document.getElementById('app').appendChild(panel);
    return {
      panel,
      messages: panel.querySelector('.chat-log-messages')
    };
  }

  addToChatLog(agentName, role, text, cssColor, tag = null) {
    const msg = document.createElement('div');
    msg.className = 'chat-log-msg';

    const nameLine = document.createElement('div');
    nameLine.className = 'chat-log-name-line';

    const name = document.createElement('span');
    name.className = 'chat-log-name';
    name.textContent = agentName;
    name.style.color = cssColor;
    nameLine.appendChild(name);

    if (role) {
      const roleEl = document.createElement('span');
      roleEl.className = 'chat-log-role';
      roleEl.textContent = role;
      nameLine.appendChild(roleEl);
    }

    if (tag) {
      const tagEl = document.createElement('span');
      tagEl.className = 'chat-log-tag';
      tagEl.textContent = tag;
      nameLine.appendChild(tagEl);
    }

    const body = document.createElement('div');
    body.className = 'chat-log-text';
    body.innerHTML = renderMarkdown(text);

    msg.appendChild(nameLine);
    msg.appendChild(body);
    this.chatLog.messages.appendChild(msg);

    // Auto-scroll to bottom
    this.chatLog.messages.scrollTop = this.chatLog.messages.scrollHeight;

    // Show panel when messages arrive
    this.chatLog.panel.classList.add('visible');
  }

  addSystemMessage(text) {
    const msg = document.createElement('div');
    msg.className = 'chat-log-system';
    msg.textContent = text;
    this.chatLog.messages.appendChild(msg);
    this.chatLog.messages.scrollTop = this.chatLog.messages.scrollHeight;
    this.chatLog.panel.classList.add('visible');
  }

  addFileNotice(agentName, filePath, cssColor) {
    const notice = document.createElement('div');
    notice.className = 'chat-file-notice';

    const text = document.createElement('span');
    text.style.color = cssColor;
    text.textContent = agentName;

    const desc = document.createElement('span');
    desc.textContent = ` created ${filePath}`;

    notice.appendChild(text);
    notice.appendChild(desc);
    this.chatLog.messages.appendChild(notice);
    this.chatLog.messages.scrollTop = this.chatLog.messages.scrollHeight;
  }

  clearChatLog() {
    this.chatLog.messages.innerHTML = '';
  }

  show(agentId, agentName, text, character, cssColor, duration = 4) {
    this.hide(agentId);

    const container = document.createElement('div');
    container.className = 'speech-bubble agent-bubble';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    container.style.borderLeftColor = cssColor;

    const nameEl = document.createElement('div');
    nameEl.className = 'bubble-agent-name';
    nameEl.textContent = agentName;
    nameEl.style.color = cssColor;
    container.appendChild(nameEl);

    const textEl = document.createElement('div');
    textEl.className = 'bubble-text';
    textEl.textContent = text;
    container.appendChild(textEl);

    document.getElementById('app').appendChild(container);

    this.activeBubbles.set(agentId, {
      element: container,
      character,
      timer: duration
    });

    this.updatePosition(agentId);
  }

  showThought(agentId, agentName, text, character, cssColor, duration = 3.5) {
    this.hide(agentId);

    const container = document.createElement('div');
    container.className = 'speech-bubble agent-bubble thought-bubble';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    container.style.borderLeftColor = cssColor;

    const nameEl = document.createElement('div');
    nameEl.className = 'bubble-agent-name';
    nameEl.textContent = agentName;
    nameEl.style.color = cssColor;
    container.appendChild(nameEl);

    const textEl = document.createElement('div');
    textEl.className = 'bubble-text';
    textEl.textContent = text;
    container.appendChild(textEl);

    document.getElementById('app').appendChild(container);

    this.activeBubbles.set(agentId, {
      element: container,
      character,
      timer: duration
    });

    this.updatePosition(agentId);
  }

  showLoading(agentId, agentName, character, cssColor) {
    this.show(agentId, agentName, '...', character, cssColor, 999);
    const bubble = this.activeBubbles.get(agentId);
    if (bubble) {
      bubble.element.classList.add('loading');
    }
  }

  hide(agentId) {
    const bubble = this.activeBubbles.get(agentId);
    if (bubble) {
      bubble.element.classList.add('speech-bubble-hide');
      const el = bubble.element;
      setTimeout(() => el.remove(), 300);
      this.activeBubbles.delete(agentId);
    }
  }

  updatePosition(agentId) {
    const bubble = this.activeBubbles.get(agentId);
    if (!bubble || !bubble.character) return;

    const headPos = bubble.character.position.clone();
    headPos.y += 3.2;
    headPos.project(this.camera);

    const halfW = window.innerWidth / 2;
    const halfH = window.innerHeight / 2;
    const screenX = (headPos.x * halfW) + halfW;
    const screenY = -(headPos.y * halfH) + halfH;

    bubble.element.style.left = screenX + 'px';
    bubble.element.style.top = screenY + 'px';
  }

  update(delta) {
    for (const [agentId, bubble] of this.activeBubbles) {
      this.updatePosition(agentId);
      bubble.timer -= delta;
      if (bubble.timer <= 0) {
        this.hide(agentId);
      }
    }
  }

  showReaction(agentId, emoji, character, duration = 1.5) {
    const key = agentId + '_reaction';
    // Remove existing reaction for this agent
    const existing = this.activeBubbles.get(key);
    if (existing) {
      existing.element.remove();
      this.activeBubbles.delete(key);
    }

    const container = document.createElement('div');
    container.className = 'reaction-bubble';
    container.textContent = emoji;

    document.getElementById('app').appendChild(container);

    this.activeBubbles.set(key, {
      element: container,
      character,
      timer: duration
    });

    this.updatePosition(key);
  }

  // Create persistent floating name labels
  createNameLabel(agentId, agentName, character, cssColor, role) {
    const label = document.createElement('div');
    label.className = 'agent-name-label';
    label.dataset.agentId = agentId;
    label.style.color = cssColor;
    label.setAttribute('role', 'button');
    label.setAttribute('tabindex', '0');
    label.setAttribute('aria-label', `${agentName}${role ? ', ' + role : ''}. Click to edit`);
    label.innerHTML = `<span class="agent-label-name">${agentName}</span>` +
      (role ? `<span class="agent-label-role">${role}</span>` : '');
    label.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        label.click();
      }
    });
    document.getElementById('app').appendChild(label);
    return label;
  }

  updateNameLabel(label, character) {
    if (!label || !character) return;

    const pos = character.position.clone();
    pos.y += 2.1;
    pos.project(this.camera);

    const halfW = window.innerWidth / 2;
    const halfH = window.innerHeight / 2;
    const screenX = (pos.x * halfW) + halfW;
    const screenY = -(pos.y * halfH) + halfH;

    label.style.left = screenX + 'px';
    label.style.top = screenY + 'px';
  }
}
