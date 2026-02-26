import { AIClient } from './AIClient.js';
import { CompanyPlanUI } from './CompanyPlanUI.js';
import { SideConversationManager } from './SideConversationManager.js';
import { FileBrowserUI } from './FileBrowserUI.js';
import { AgentFileGenerator } from './AgentFileGenerator.js';
import { FileActivityPanel } from './FileActivityPanel.js';
import { AgentMemory } from './AgentMemory.js';

const LENGTH_HINTS = [
  'Keep it to 1 sentence.',
  'Keep it to 1-2 sentences.',
  'Keep it to 1-2 sentences.',
  'Keep it to 2-3 sentences.',
  'A short response — just a sentence or two.',
  'Be brief.',
];

function pickLengthHint() {
  return LENGTH_HINTS[Math.floor(Math.random() * LENGTH_HINTS.length)];
}

function trimToSentence(text, maxLen = 300) {
  if (!text || text.length <= maxLen) return text;
  const trimmed = text.slice(0, maxLen);
  const lastEnd = Math.max(
    trimmed.lastIndexOf('.'),
    trimmed.lastIndexOf('!'),
    trimmed.lastIndexOf('?')
  );
  return lastEnd > maxLen * 0.3 ? trimmed.slice(0, lastEnd + 1) : trimmed;
}

export class ConversationManager {
  constructor(speechBubbleUI) {
    this.speechBubbleUI = speechBubbleUI;
    this.planUI = new CompanyPlanUI();
    this.fileActivityPanel = new FileActivityPanel();
    this.active = false;
    this.BUBBLE_DURATION = 4;
    this.chatInput = this._createChatInput();
    this._pendingUserMessage = null;
    this._userMessageResolve = null;
    this.paused = false;
    this._pauseResolve = null;
    this.sideConvoManager = null;
    this.fileGenerator = new AgentFileGenerator(this.fileActivityPanel);
    this.agentMemory = new AgentMemory();

    this.workingContext = {
      goal: '',
      status: 'active',       // 'active' | 'building' | 'complete'
      decisions: [],           // [{ topic, decision }] — compressed memory
      currentFocus: '',
      roundCount: 0,
    };
  }

  _createChatInput() {
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-input-wrapper';
    wrapper.innerHTML = `
      <div class="chat-input-row">
        <form class="chat-input-form" role="search" aria-label="Team chat">
          <button type="button" class="chat-pause" aria-label="Pause session">
            <span class="pause-icon" aria-hidden="true">&#10074;&#10074;</span>
          </button>
          <label for="chat-main-input" class="sr-only">Message the team</label>
          <input id="chat-main-input" type="text" class="chat-input" placeholder="Waiting for the team to finish planning..." disabled />
          <button type="submit" class="chat-send" disabled aria-label="Send message">Send</button>
        </form>
        <button type="button" class="file-browser-btn" aria-label="Open file browser"><i class="ri-folder-3-line"></i></button>
      </div>
      <div class="chat-input-hint" role="status" aria-live="polite">You'll be able to guide the team once they have a plan</div>
    `;
    document.getElementById('app').appendChild(wrapper);

    const form = wrapper.querySelector('.chat-input-form');
    const input = wrapper.querySelector('.chat-input');
    const button = wrapper.querySelector('.chat-send');
    const pauseBtn = wrapper.querySelector('.chat-pause');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      this._pendingUserMessage = text;
      if (this._userMessageResolve) {
        this._userMessageResolve(text);
        this._userMessageResolve = null;
      }
    });

    pauseBtn.addEventListener('click', () => {
      this._togglePause();
    });

    const filesBtn = wrapper.querySelector('.file-browser-btn');
    filesBtn.addEventListener('click', () => {
      if (!this._fileBrowserUI) this._fileBrowserUI = new FileBrowserUI();
      this._fileBrowserUI.open();
    });

    return { wrapper, input, button, pauseBtn, hint: wrapper.querySelector('.chat-input-hint') };
  }

  _enableInput() {
    this.chatInput.input.disabled = false;
    this.chatInput.input.placeholder = 'Guide the team... (e.g. "pivot to B2B" or "add a mobile app")';
    this.chatInput.button.disabled = false;
    this.chatInput.hint.textContent = 'Type a message to steer the conversation';
    this.chatInput.wrapper.classList.add('active');
    this.chatInput.input.focus();
  }

  _waitForUserMessage() {
    this._pendingUserMessage = null;
    return new Promise((resolve) => {
      // If already have a pending message, resolve immediately
      if (this._pendingUserMessage) {
        resolve(this._pendingUserMessage);
        this._pendingUserMessage = null;
      } else {
        this._userMessageResolve = resolve;
      }
    });
  }

  /** Non-blocking: returns pending user message or null */
  _consumeUserMessage() {
    const msg = this._pendingUserMessage;
    this._pendingUserMessage = null;
    return msg;
  }

  isConversationActive() {
    return this.active;
  }

  async startGroupMeeting(agentEntries) {
    if (this.active) return;
    this.active = true;

    this.agents = agentEntries;
    this.history = [];
    this.fileActivityPanel.setAgents(this.agents);

    // Initialize per-agent memory
    for (const a of this.agents) {
      this.agentMemory.init(a.personality.id, this.agents);
    }

    // Agents keep wandering — wait for user directive before gathering
    this.sideConvoManager = new SideConversationManager(
      this.speechBubbleUI,
      this.agents,
      this.planUI,
      () => this.workingContext,
      this.agentMemory
    );
    this._enableInput();
    this.chatInput.input.placeholder = 'Tell the team what to work on...';
    this.chatInput.hint.textContent = 'Give the team a direction to start planning';

    const firstMessage = await this._waitForUserMessage();
    this.speechBubbleUI.addToChatLog('You', 'Founder', firstMessage, '#ffffff');
    this.history.push({ speakerName: 'Founder', speakerId: 'user', text: firstMessage });

    // Now gather agents into a circle for the meeting
    this._gatherAgents();

    // Initialize working context with the user's goal
    this.workingContext.goal = firstMessage;
    this.workingContext.currentFocus = 'Understanding the goal and brainstorming approach';

    // Enable input so user can intervene anytime
    this._enableInput();
    this.chatInput.input.placeholder = 'Type anytime to redirect the team...';
    this.chatInput.hint.textContent = 'Agents are discussing — type to steer anytime';

    // Enter autonomous loop
    await this._autonomousLoop();

    // After autonomous loop exits (status = 'building'), build then guide
    await this._buildPhase();
    await this._guidanceLoop();
  }

  _gatherAgents() {
    const meetingRadius = 2.5;
    const agentCount = this.agents.length;

    for (let i = 0; i < agentCount; i++) {
      const angle = (2 * Math.PI * i) / agentCount;
      const x = meetingRadius * Math.sin(angle);
      const z = meetingRadius * Math.cos(angle);
      const ctrl = this.agents[i].controller;
      ctrl.pauseWandering();
      if (ctrl.character) {
        ctrl.character.position.set(x, 0, z);
      }
    }

    for (const a of this.agents) {
      a.controller.faceToward({ x: 0, y: 0, z: 0 });
    }
  }

  async _autonomousLoop() {
    const agentCount = this.agents.length;
    let speakerIndex = 0;

    while (this.workingContext.status === 'active') {
      // Non-blocking check for user messages
      const userMsg = this._consumeUserMessage();
      if (userMsg) {
        this.speechBubbleUI.addToChatLog('You', 'Founder', userMsg, '#ffffff');
        this.history.push({ speakerName: 'Founder', speakerId: 'user', text: userMsg });
        // Update working context with user direction
        this.workingContext.currentFocus = userMsg;
      }

      // Pick next speaker — round-robin with 15% skip chance for variation
      if (Math.random() < 0.15 && agentCount > 2) {
        speakerIndex = (speakerIndex + 1) % agentCount;
      }
      const agent = this.agents[speakerIndex];
      speakerIndex = (speakerIndex + 1) % agentCount;

      const speakerP = agent.personality;

      // Face center
      for (const a of this.agents) {
        a.controller.faceToward({ x: 0, y: 0, z: 0 });
      }

      // Show loading
      this.speechBubbleUI.showLoading(
        speakerP.id,
        speakerP.name,
        agent.controller.character,
        speakerP.cssColor
      );

      this.fileActivityPanel.setAgentStatus(speakerP.id, 'thinking...');
      const response = await this._getAgentResponse(agent);
      this.fileActivityPanel.setAgentStatus(speakerP.id, 'idle');
      this.speechBubbleUI.hide(speakerP.id);

      if (response) {
        const cleanResponse = trimToSentence(response);

        this.speechBubbleUI.show(
          speakerP.id,
          speakerP.name,
          cleanResponse,
          agent.controller.character,
          speakerP.cssColor,
          this.BUBBLE_DURATION
        );

        this.speechBubbleUI.addToChatLog(
          speakerP.name,
          speakerP.role,
          cleanResponse,
          speakerP.cssColor
        );

        this.history.push({
          speakerName: speakerP.name,
          speakerId: speakerP.id,
          text: cleanResponse
        });

        // Fire-and-forget memory update
        this.agentMemory.updateAfterSpeech(speakerP.id, cleanResponse, this.history);

        await this._delay(this.BUBBLE_DURATION * 1000);
      }

      this.workingContext.roundCount++;

      // Facilitator check every agents.length * 2 rounds
      if (this.workingContext.roundCount % (agentCount * 2) === 0) {
        await this._runFacilitator();
      }

      // File generation after round 9+ every agents.length rounds
      if (this.workingContext.roundCount >= 9 && this.workingContext.roundCount % agentCount === 0) {
        const createdFiles = await this.fileGenerator.maybeGenerate(agent, this.history, response || '');
        if (createdFiles.length > 0) {
          for (const filePath of createdFiles) {
            this.speechBubbleUI.addFileNotice(speakerP.name, filePath, speakerP.cssColor);
          }
        }
      }

      // Maybe trigger side conversation
      if (this.sideConvoManager) {
        this.sideConvoManager.maybeStartSideChat();
      }
    }
  }

  async _getAgentResponse(agent) {
    const speakerP = agent.personality;
    const ctx = this.workingContext;

    let systemContent = speakerP.systemPrompt + '\n\n';
    systemContent += `You are in a team meeting. Your team's goal: ${ctx.goal}\n`;
    if (ctx.currentFocus) {
      systemContent += `Current focus: ${ctx.currentFocus}\n`;
    }
    if (ctx.decisions.length > 0) {
      const recentDecisions = ctx.decisions.slice(-5);
      systemContent += '\nKey decisions so far:\n';
      for (const d of recentDecisions) {
        systemContent += `- ${d.topic}: ${d.decision}\n`;
      }
    }
    systemContent += this.agentMemory.getTeamRoster(speakerP.id);
    systemContent += this.agentMemory.getPromptBlock(speakerP.id);
    systemContent += `\n${pickLengthHint()} Be specific and opinionated. Stay in character.`;

    const messages = [{ role: 'system', content: systemContent }];

    // Last 10 history entries for token efficiency
    const recent = this.history.slice(-10);
    for (const entry of recent) {
      const isOwn = entry.speakerId === speakerP.id;
      if (entry.speakerId === 'user') {
        messages.push({ role: 'user', content: `Team Lead: ${entry.text}` });
      } else {
        messages.push({
          role: isOwn ? 'assistant' : 'user',
          content: isOwn ? entry.text : `${entry.speakerName}: ${entry.text}`
        });
      }
    }

    return AIClient.chat(messages);
  }

  async _runFacilitator() {
    const ctx = this.workingContext;
    const recent = this.history.slice(-8);
    const transcript = recent.map(e => `${e.speakerName}: ${e.text}`).join('\n');
    const planSummary = this.planUI.getCurrentPlanSummary();

    let nudge = '';
    if (ctx.roundCount >= this.agents.length * 10) {
      nudge = '\nThe team has been discussing for a while. Strongly consider whether they have enough clarity to start building.';
    }

    const messages = [
      {
        role: 'system',
        content: 'You are a meeting facilitator analyzing team progress. Return ONLY valid JSON: { "focus": "what team should discuss next", "decision": { "topic": "...", "decision": "..." } or null, "shouldBuild": true/false, "status": "active" or "building" }\n\nSet shouldBuild=true and status="building" when the team has enough clarity on their goal to start producing deliverables.' + nudge
      },
      {
        role: 'user',
        content: `Goal: ${ctx.goal}\nCurrent focus: ${ctx.currentFocus}\nRound: ${ctx.roundCount}\n${planSummary ? `Plan so far:\n${planSummary}\n` : ''}\nRecent discussion:\n${transcript}\n\nAnalyze progress and return JSON:`
      }
    ];

    const result = await AIClient.chat(messages);
    if (!result) return;

    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return;
      const parsed = JSON.parse(jsonMatch[0]);

      if (parsed.focus) {
        ctx.currentFocus = parsed.focus;
      }
      if (parsed.decision && parsed.decision.topic) {
        ctx.decisions.push(parsed.decision);
        // Also update plan UI with the decision
        const key = parsed.decision.topic.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        if (key) {
          this.planUI.updateSection(key, parsed.decision.decision);
        }
      }
      if (parsed.shouldBuild || parsed.status === 'building') {
        ctx.status = 'building';
      }
    } catch {
      // JSON parse failure = no-op
    }
  }

  async _buildPhase() {
    const planSummary = this.planUI.getCurrentPlanSummary();

    this.speechBubbleUI.addSystemMessage('Discussion complete — team is starting to build');

    // Enable input early so user can redirect
    this._enableInput();
    this.chatInput.input.placeholder = 'Team is building v1 — type to redirect anytime';
    this.chatInput.hint.textContent = 'Team is building v1 — type to redirect anytime';

    for (const agent of this.agents) {
      const speakerP = agent.personality;

      const createdFiles = await this.fileGenerator.generateForPlan(agent, planSummary, this.history);

      for (const filePath of createdFiles) {
        this.speechBubbleUI.addFileNotice(speakerP.name, filePath, speakerP.cssColor);
      }

      // Brief delay between agents for visual pacing
      if (createdFiles.length > 0) {
        await this._delay(800);
      }
    }

    this.speechBubbleUI.addSystemMessage('v1 files ready — guide the team');
  }

  async _guidanceLoop() {
    while (true) {
      const userMessage = await this._waitForUserMessage();

      // Show user message in chat log
      this.speechBubbleUI.addToChatLog('You', 'Founder', userMessage, '#ffffff');

      // Add to history
      this.history.push({
        speakerName: 'Founder',
        speakerId: 'user',
        text: userMessage
      });

      // Each agent responds to the user's guidance
      for (const agent of this.agents) {
        const speakerP = agent.personality;

        for (const a of this.agents) {
          a.controller.faceToward({ x: 0, y: 0, z: 0 });
        }

        this.speechBubbleUI.showLoading(
          speakerP.id,
          speakerP.name,
          agent.controller.character,
          speakerP.cssColor
        );

        this.fileActivityPanel.setAgentStatus(speakerP.id, 'thinking...');
        const messages = this._buildGuidanceMessages(agent, userMessage);
        const response = await AIClient.chat(messages);
        this.fileActivityPanel.setAgentStatus(speakerP.id, 'idle');
        this.speechBubbleUI.hide(speakerP.id);

        if (!response) continue;

        const cleanResponse = trimToSentence(response);

        this.speechBubbleUI.show(
          speakerP.id,
          speakerP.name,
          cleanResponse,
          agent.controller.character,
          speakerP.cssColor,
          this.BUBBLE_DURATION
        );

        this.speechBubbleUI.addToChatLog(
          speakerP.name,
          speakerP.role,
          cleanResponse,
          speakerP.cssColor
        );

        this.history.push({
          speakerName: speakerP.name,
          speakerId: speakerP.id,
          text: cleanResponse
        });

        // Fire-and-forget memory update
        this.agentMemory.updateAfterSpeech(speakerP.id, cleanResponse, this.history);

        await this._delay(this.BUBBLE_DURATION * 1000);

        // Auto-generate files based on agent's expertise
        const createdFiles = await this.fileGenerator.maybeGenerate(agent, this.history, cleanResponse);
        if (createdFiles.length > 0) {
          for (const filePath of createdFiles) {
            this.speechBubbleUI.addFileNotice(speakerP.name, filePath, speakerP.cssColor);
          }
        }
      }

      // After agents respond, check if the plan should be updated
      await this._updatePlanFromGuidance(userMessage);

      // Maybe trigger a side conversation (non-blocking)
      if (this.sideConvoManager) {
        this.sideConvoManager.maybeStartSideChat();
      }
    }
  }


  _buildGuidanceMessages(agent, userMessage) {
    const speakerP = agent.personality;
    const planSoFar = this.planUI.getCurrentPlanSummary();

    let systemContent = speakerP.systemPrompt + '\n\n';
    systemContent += 'You are in a team meeting with your teammates. The team lead is giving direction.\n';
    if (this.workingContext.goal) {
      systemContent += `\nTeam goal: ${this.workingContext.goal}\n`;
    }
    if (planSoFar) {
      systemContent += `\nCurrent plan:\n${planSoFar}\n`;
    }
    systemContent += this.agentMemory.getTeamRoster(speakerP.id);
    systemContent += this.agentMemory.getPromptBlock(speakerP.id);
    systemContent += `\nRespond to the team lead's input from your role's perspective. Be specific and actionable. ${pickLengthHint()} Stay in character.`;

    const messages = [{ role: 'system', content: systemContent }];

    // Recent history (last ~12 entries to keep context manageable)
    const recent = this.history.slice(-12);
    for (const entry of recent) {
      const isOwn = entry.speakerId === speakerP.id;
      if (entry.speakerId === 'user') {
        messages.push({ role: 'user', content: `Team Lead: ${entry.text}` });
      } else {
        messages.push({
          role: isOwn ? 'assistant' : 'user',
          content: isOwn ? entry.text : `${entry.speakerName}: ${entry.text}`
        });
      }
    }

    return messages;
  }

  async _updatePlanFromGuidance(userMessage) {
    const recentHistory = this.history.slice(-6);
    const transcript = recentHistory.map(e => `${e.speakerName}: ${e.text}`).join('\n');
    const currentPlan = this.planUI.getCurrentPlanSummary();

    const messages = [
      {
        role: 'system',
        content: 'You update a project plan based on team discussion. Return ONLY a JSON object with keys to update. Keys can be any relevant topic (e.g. idea, name, product, users, model, roadmap, architecture, tech_stack, design, strategy — or any other relevant key). Only include keys that need to change based on the latest discussion. Values should be short strings (1-3 sentences, or bullet points for lists). If nothing needs to change, return {}.'
      },
      {
        role: 'user',
        content: `Current plan:\n${currentPlan}\n\nLatest discussion:\n${transcript}\n\nReturn JSON with any plan updates:`
      }
    ];

    const result = await AIClient.chat(messages);
    if (!result) return;

    // Try to parse JSON from the response
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return;
      const updates = JSON.parse(jsonMatch[0]);

      for (const [key, value] of Object.entries(updates)) {
        if (value && typeof value === 'string' && value.trim()) {
          this.planUI.updateSection(key, value.trim());
        }
      }
    } catch {
      // LLM didn't return valid JSON — that's fine, skip update
    }
  }

  _togglePause() {
    this.paused = !this.paused;
    const icon = this.chatInput.pauseBtn.querySelector('.pause-icon');
    if (this.paused) {
      icon.innerHTML = '&#9654;'; // play triangle
      this.chatInput.pauseBtn.setAttribute('aria-label', 'Resume session');
      this.chatInput.wrapper.classList.add('paused');
      this.chatInput.hint.textContent = 'Session paused';
    } else {
      icon.innerHTML = '&#10074;&#10074;'; // pause bars
      this.chatInput.pauseBtn.setAttribute('aria-label', 'Pause session');
      this.chatInput.wrapper.classList.remove('paused');
      this.chatInput.hint.textContent = this.chatInput.wrapper.classList.contains('active')
        ? 'Type a message to steer the conversation'
        : 'You\'ll be able to guide the team once they have a plan';
      // Resume if waiting
      if (this._pauseResolve) {
        this._pauseResolve();
        this._pauseResolve = null;
      }
    }
  }

  async _waitIfPaused() {
    if (!this.paused) return;
    return new Promise(resolve => {
      this._pauseResolve = resolve;
    });
  }

  async _delay(ms) {
    await this._waitIfPaused();
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
