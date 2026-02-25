import { OllamaClient } from './OllamaClient.js';
import { CompanyPlanUI } from './CompanyPlanUI.js';

const PHASES = [
  {
    key: 'idea',
    rounds: 3,
    prompt: 'Your team is meeting to brainstorm a startup idea. Pitch or riff on ideas. Be creative and specific. What problem should we solve?',
    extractPrompt: 'Based on the conversation, summarize the startup idea the team is leaning toward in 1-2 sentences. Just the idea, nothing else.'
  },
  {
    key: 'name',
    rounds: 2,
    prompt: 'The team is picking a company name. Suggest names or react to others\' suggestions. Be opinionated.',
    extractPrompt: 'Based on the conversation, what company name did the team settle on (or lean toward)? Reply with ONLY the company name, nothing else.'
  },
  {
    key: 'product',
    rounds: 3,
    prompt: 'Now define the product. What does it actually do? What are the core features? Think from your role\'s perspective.',
    extractPrompt: 'Based on the conversation, describe the product in 2-3 sentences. What does it do and what are its key features? Be specific.'
  },
  {
    key: 'users',
    rounds: 2,
    prompt: 'Who are the target users? Who would pay for this? Get specific about the audience.',
    extractPrompt: 'Based on the conversation, describe the target users in 1-2 sentences. Be specific about who they are.'
  },
  {
    key: 'model',
    rounds: 2,
    prompt: 'How will this make money? Discuss pricing, revenue model, and go-to-market. Think practically.',
    extractPrompt: 'Based on the conversation, summarize the business model in 1-2 sentences. How does it make money?'
  },
  {
    key: 'roadmap',
    rounds: 2,
    prompt: 'What should V1 look like? What do we build first? Prioritize ruthlessly for a 4-week sprint.',
    extractPrompt: 'Based on the conversation, list the V1 roadmap as 3-5 short bullet points. Format: "- item". Nothing else.'
  }
];

export class ConversationManager {
  constructor(speechBubbleUI) {
    this.speechBubbleUI = speechBubbleUI;
    this.planUI = new CompanyPlanUI();
    this.active = false;
    this.BUBBLE_DURATION = 4;
    this.chatInput = this._createChatInput();
    this._pendingUserMessage = null;
    this._userMessageResolve = null;
    this.paused = false;
    this._pauseResolve = null;
  }

  _createChatInput() {
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-input-wrapper';
    wrapper.innerHTML = `
      <form class="chat-input-form">
        <button type="button" class="chat-pause" title="Pause session">
          <span class="pause-icon">&#10074;&#10074;</span>
        </button>
        <input type="text" class="chat-input" placeholder="Waiting for the team to finish planning..." disabled />
        <button type="submit" class="chat-send" disabled>Send</button>
      </form>
      <div class="chat-input-hint">You'll be able to guide the team once they have a plan</div>
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

  isConversationActive() {
    return this.active;
  }

  async startGroupMeeting(agentEntries) {
    if (this.active) return;
    this.active = true;

    this.agents = agentEntries;
    this.history = [];

    // Gather all agents to center
    const positions = [
      { x: -2, z: -1 },
      { x: 2, z: -1 },
      { x: 0, z: 2 }
    ];

    for (let i = 0; i < this.agents.length; i++) {
      const ctrl = this.agents[i].controller;
      ctrl.pauseWandering();
      if (ctrl.character) {
        ctrl.character.position.set(positions[i].x, 0, positions[i].z);
      }
    }

    for (const a of this.agents) {
      a.controller.faceToward({ x: 0, y: 0, z: 0 });
    }

    await this._delay(1000);

    // Run through each planning phase
    for (const phase of PHASES) {
      this.planUI.markActive(phase.key);
      await this._runPhase(phase);

      const summary = await this._extractPlanUpdate(phase);
      if (summary) {
        this.planUI.updateSection(phase.key, summary);
      }

      await this._delay(1000);
    }

    // Planning done — enter guidance mode
    this._enableInput();
    await this._guidanceLoop();
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

        const messages = this._buildGuidanceMessages(agent, userMessage);
        const response = await OllamaClient.chat(messages);
        this.speechBubbleUI.hide(speakerP.id);

        if (!response) continue;

        const cleanResponse = response.slice(0, 250);

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

        await this._delay(this.BUBBLE_DURATION * 1000);
      }

      // After agents respond, check if the plan should be updated
      await this._updatePlanFromGuidance(userMessage);
    }
  }

  _buildGuidanceMessages(agent, userMessage) {
    const speakerP = agent.personality;
    const planSoFar = this.planUI.getCurrentPlanSummary();

    let systemContent = speakerP.systemPrompt + '\n\n';
    systemContent += 'You are in a team meeting with your cofounders. The founder/CEO is giving direction.\n';
    if (planSoFar) {
      systemContent += `\nCurrent plan:\n${planSoFar}\n`;
    }
    systemContent += '\nRespond to the founder\'s input from your role\'s perspective. Be specific and actionable. Keep responses to 1-2 sentences. Stay in character.';

    const messages = [{ role: 'system', content: systemContent }];

    // Recent history (last ~12 entries to keep context manageable)
    const recent = this.history.slice(-12);
    for (const entry of recent) {
      const isOwn = entry.speakerId === speakerP.id;
      if (entry.speakerId === 'user') {
        messages.push({ role: 'user', content: `Founder: ${entry.text}` });
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
        content: 'You update a startup plan based on team discussion. Return ONLY a JSON object with keys to update. Valid keys: idea, name, product, users, model, roadmap. Only include keys that need to change based on the latest discussion. Values should be short strings (1-3 sentences, or bullet points for roadmap). If nothing needs to change, return {}.'
      },
      {
        role: 'user',
        content: `Current plan:\n${currentPlan}\n\nLatest discussion:\n${transcript}\n\nReturn JSON with any plan updates:`
      }
    ];

    const result = await OllamaClient.chat(messages);
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

  async _runPhase(phase) {
    const agentCount = this.agents.length;

    for (let round = 0; round < phase.rounds; round++) {
      for (let i = 0; i < agentCount; i++) {
        const speaker = this.agents[i];
        const speakerP = speaker.personality;

        for (const a of this.agents) {
          a.controller.faceToward({ x: 0, y: 0, z: 0 });
        }

        this.speechBubbleUI.showLoading(
          speakerP.id,
          speakerP.name,
          speaker.controller.character,
          speakerP.cssColor
        );

        const messages = this._buildMessages(speaker, phase);
        const response = await OllamaClient.chat(messages);
        this.speechBubbleUI.hide(speakerP.id);

        if (!response) continue;

        const cleanResponse = response.slice(0, 250);

        this.speechBubbleUI.show(
          speakerP.id,
          speakerP.name,
          cleanResponse,
          speaker.controller.character,
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

        await this._delay(this.BUBBLE_DURATION * 1000);
      }
    }
  }

  _buildMessages(speaker, phase) {
    const speakerP = speaker.personality;
    const planSoFar = this.planUI.getCurrentPlanSummary();

    let systemContent = speakerP.systemPrompt + '\n\n';
    systemContent += `You are in a team meeting with your cofounders. ${phase.prompt}`;
    if (planSoFar) {
      systemContent += `\n\nDecisions made so far:\n${planSoFar}`;
    }
    systemContent += '\n\nKeep your response to 1-2 sentences. Be specific and opinionated. Stay in character.';

    const messages = [{ role: 'system', content: systemContent }];

    for (const entry of this.history) {
      const isOwn = entry.speakerId === speakerP.id;
      messages.push({
        role: isOwn ? 'assistant' : 'user',
        content: isOwn ? entry.text : `${entry.speakerName}: ${entry.text}`
      });
    }

    return messages;
  }

  async _extractPlanUpdate(phase) {
    const recentHistory = this.history.slice(-phase.rounds * 3);
    const transcript = recentHistory.map(e => `${e.speakerName}: ${e.text}`).join('\n');

    const messages = [
      {
        role: 'system',
        content: 'You are a concise note-taker. Extract the key decision from a meeting transcript. Be brief and direct.'
      },
      {
        role: 'user',
        content: `${phase.extractPrompt}\n\nTranscript:\n${transcript}`
      }
    ];

    const result = await OllamaClient.chat(messages);
    return result ? result.slice(0, 300) : null;
  }

  _togglePause() {
    this.paused = !this.paused;
    const icon = this.chatInput.pauseBtn.querySelector('.pause-icon');
    if (this.paused) {
      icon.innerHTML = '&#9654;'; // play triangle
      this.chatInput.pauseBtn.title = 'Resume session';
      this.chatInput.wrapper.classList.add('paused');
      this.chatInput.hint.textContent = 'Session paused';
    } else {
      icon.innerHTML = '&#10074;&#10074;'; // pause bars
      this.chatInput.pauseBtn.title = 'Pause session';
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
