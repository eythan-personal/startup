import { FloatingWindow } from './FloatingWindow.js';
import { AIClient } from './AIClient.js';
import { AgentFileGenerator } from './AgentFileGenerator.js';
import { renderMarkdown } from './markdown.js';

export class DMWindowUI {
  constructor(planUI, fileActivityPanel = null, agentMemory = null, getHistory = null, options = {}) {
    this.planUI = planUI;
    this.openWindows = new Map(); // agentId -> { window, history }
    this.fileGenerator = new AgentFileGenerator(fileActivityPanel);
    this.agentMemory = agentMemory;
    this.getHistory = getHistory;
    this._getAgents = options.getAgents || null;
    this._getSideConvoManager = options.getSideConvoManager || null;
  }

  open(agent) {
    const p = agent.personality;

    // If already open, bring to front
    if (this.openWindows.has(p.id)) {
      this.openWindows.get(p.id).window.bringToFront();
      return;
    }

    const win = new FloatingWindow({
      title: `${p.name} — ${p.role}`,
      width: 360,
      height: 400,
      cssColor: p.cssColor,
      resizable: true,
      onClose: () => this.openWindows.delete(p.id)
    });

    const content = win.getContentEl();
    content.style.display = 'flex';
    content.style.flexDirection = 'column';

    // Messages area
    const messagesEl = document.createElement('div');
    messagesEl.className = 'dm-messages';
    messagesEl.style.flex = '1';
    messagesEl.style.overflowY = 'auto';
    messagesEl.setAttribute('role', 'log');
    messagesEl.setAttribute('aria-live', 'polite');
    messagesEl.setAttribute('aria-relevant', 'additions');
    messagesEl.setAttribute('aria-label', `Conversation with ${p.name}`);

    // Input area
    const inputArea = document.createElement('div');
    inputArea.className = 'dm-input-area';

    const inputId = `dm-input-${p.id}`;
    const label = document.createElement('label');
    label.setAttribute('for', inputId);
    label.className = 'sr-only';
    label.textContent = `Message ${p.name}`;

    const input = document.createElement('input');
    input.className = 'dm-input';
    input.id = inputId;
    input.type = 'text';
    input.placeholder = `Message ${p.name}...`;

    const sendBtn = document.createElement('button');
    sendBtn.className = 'dm-send';
    sendBtn.textContent = 'Send';
    sendBtn.setAttribute('aria-label', `Send message to ${p.name}`);

    inputArea.appendChild(label);
    inputArea.appendChild(input);
    inputArea.appendChild(sendBtn);

    content.appendChild(messagesEl);
    content.appendChild(inputArea);

    const state = {
      window: win,
      history: [],
      messagesEl,
      agent
    };

    this.openWindows.set(p.id, state);

    const sendMessage = async () => {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';

      this._addMessage(state, 'You', '#ffffff', text, true);

      state.history.push({ role: 'user', content: text });

      // Show loading
      const loadingMsg = this._addMessage(state, p.name, p.cssColor, '...', false);
      loadingMsg.style.opacity = '0.5';

      const messages = this._buildMessages(agent, state.history);
      const response = await AIClient.chat(messages);

      loadingMsg.remove();

      let reply = 'Sorry, I couldn\'t respond right now.';
      if (response) {
        reply = response.length <= 500 ? response : response.slice(0, response.lastIndexOf('.', 500) + 1) || response.slice(0, 500);
      }
      this._addMessage(state, p.name, p.cssColor, reply, false);
      state.history.push({ role: 'assistant', content: reply });

      // Auto-generate files based on agent's expertise
      const dmContext = state.history.map(h => ({
        speakerName: h.role === 'user' ? 'Founder' : p.name,
        text: h.content
      }));
      const createdFiles = await this.fileGenerator.maybeGenerate(agent, dmContext, reply);
      if (createdFiles.length > 0) {
        for (const filePath of createdFiles) {
          this._addFileNotice(state, p.name, filePath, p.cssColor);
        }
      }

      // Detect "go talk to X" directives
      this._detectTalkDirective(agent, text, state);
    };

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendMessage();
    });

    input.focus();
  }

  _addMessage(state, name, color, text, isUser) {
    const msg = document.createElement('div');
    msg.className = 'dm-msg' + (isUser ? ' dm-user' : '');

    const nameEl = document.createElement('div');
    nameEl.className = 'dm-msg-name';
    nameEl.textContent = name;
    nameEl.style.color = color;

    const textEl = document.createElement('div');
    textEl.className = 'dm-msg-text';
    textEl.innerHTML = renderMarkdown(text);

    msg.appendChild(nameEl);
    msg.appendChild(textEl);
    state.messagesEl.appendChild(msg);
    state.messagesEl.scrollTop = state.messagesEl.scrollHeight;

    return msg;
  }

  _addFileNotice(state, agentName, filePath, cssColor) {
    const notice = document.createElement('div');
    notice.className = 'dm-msg dm-file-notice';

    const text = document.createElement('div');
    text.className = 'dm-msg-text';
    text.style.color = cssColor;
    text.style.opacity = '0.7';
    text.style.fontSize = '10px';
    text.textContent = `\u{1F4C4} Created ${filePath}`;

    notice.appendChild(text);
    state.messagesEl.appendChild(notice);
    state.messagesEl.scrollTop = state.messagesEl.scrollHeight;
  }

  async _detectTalkDirective(agent, userText, state) {
    if (!this._getAgents || !this._getSideConvoManager) return;

    const agents = this._getAgents();
    const agentNames = agents.map(a => a.personality.name).filter(n => n !== agent.personality.name);
    if (agentNames.length === 0) return;

    try {
      const messages = [
        {
          role: 'system',
          content: `You detect if the user asked this agent to go talk to a teammate. Available teammates: ${agentNames.join(', ')}. Return ONLY valid JSON: { "talkTo": "AgentName" or null, "topic": "brief topic" or null }`
        },
        { role: 'user', content: userText }
      ];

      const result = await AIClient.chat(messages, { max_tokens: 80 });
      if (!result) return;

      const parsed = JSON.parse(result);
      if (!parsed.talkTo) return;

      const targetAgent = agents.find(a =>
        a.personality.name.toLowerCase() === parsed.talkTo.toLowerCase()
      );
      if (!targetAgent || targetAgent.personality.id === agent.personality.id) return;

      const sideConvoManager = this._getSideConvoManager();
      if (!sideConvoManager) return;

      const p = agent.personality;
      this._addMessage(state, p.name, p.cssColor, `On my way to talk to ${targetAgent.personality.name}!`, false);

      sideConvoManager.startDirectedChat(agent, targetAgent, parsed.topic);
    } catch {
      // Silently ignore parse failures
    }
  }

  _buildMessages(agent, dmHistory) {
    const p = agent.personality;
    const planSummary = this.planUI ? this.planUI.getCurrentPlanSummary() : '';

    let systemContent = p.systemPrompt + '\n\n';
    systemContent += 'You\'re in a private DM with the Founder/CEO. Be candid and personal. ';
    systemContent += 'Keep responses to 1-3 sentences.\n';
    if (planSummary) {
      systemContent += `\nCurrent plan:\n${planSummary}\n`;
    }

    if (this.agentMemory) {
      systemContent += this.agentMemory.getTeamRoster(p.id);
      systemContent += this.agentMemory.getPromptBlock(p.id);
    }

    if (this.getHistory) {
      const teamHistory = this.getHistory().slice(-5);
      if (teamHistory.length > 0) {
        systemContent += '\nRecent team discussion:\n';
        systemContent += teamHistory.map(e => `${e.speakerName}: ${e.text}`).join('\n') + '\n';
      }
    }

    const messages = [{ role: 'system', content: systemContent }];

    // Add DM history (last 20 messages)
    const recent = dmHistory.slice(-20);
    for (const entry of recent) {
      messages.push({ role: entry.role, content: entry.content });
    }

    return messages;
  }
}
