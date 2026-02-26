import { AIClient } from './AIClient.js';

export class AgentAutonomyLoop {
  constructor(speechBubbleUI, agents, sideConvoManager, getWorkingContext, agentMemory) {
    this.speechBubbleUI = speechBubbleUI;
    this.agents = agents;
    this.sideConvoManager = sideConvoManager;
    this.getWorkingContext = getWorkingContext;
    this.agentMemory = agentMemory;
    this._timers = new Map();       // agentId -> timeoutId
    this._busyAgents = new Set();
    this._paused = false;
    this._stopped = false;
  }

  start() {
    this._stopped = false;
    // Stagger agent ticks so they don't all fire at once
    let delay = 0;
    for (const agent of this.agents) {
      const id = agent.personality.id;
      const stagger = delay;
      setTimeout(() => {
        if (!this._stopped) this._scheduleTick(agent);
      }, stagger);
      delay += 3000; // 3s apart
    }
  }

  stop() {
    this._stopped = true;
    for (const [, timerId] of this._timers) {
      clearTimeout(timerId);
    }
    this._timers.clear();
    this._busyAgents.clear();
  }

  pause() {
    this._paused = true;
  }

  resume() {
    this._paused = false;
  }

  _scheduleTick(agent) {
    if (this._stopped) return;
    const id = agent.personality.id;
    const interval = 15000 + Math.random() * 10000; // 15-25s
    const timerId = setTimeout(() => {
      this._tick(agent);
    }, interval);
    this._timers.set(id, timerId);
  }

  async _tick(agent) {
    const id = agent.personality.id;
    this._timers.delete(id);

    // Guard checks
    if (this._stopped || this._paused) {
      this._scheduleTick(agent);
      return;
    }
    if (this._busyAgents.has(id)) {
      this._scheduleTick(agent);
      return;
    }
    if (agent.controller._wanderingPaused) {
      this._scheduleTick(agent);
      return;
    }

    this._busyAgents.add(id);
    try {
      const decision = await this._getDecision(agent);
      if (!decision) {
        this._scheduleTick(agent);
        return;
      }

      switch (decision.action) {
        case 'talk_to':
          await this._handleTalkTo(agent, decision);
          break;
        case 'think':
          await this._handleThink(agent, decision);
          break;
        case 'wander':
        default:
          // No-op
          break;
      }
    } catch (err) {
      console.error(`Autonomy tick error for ${agent.personality.name}:`, err);
    } finally {
      this._busyAgents.delete(id);
      this._scheduleTick(agent);
    }
  }

  async _getDecision(agent) {
    const p = agent.personality;
    const ctx = this.getWorkingContext ? this.getWorkingContext() : null;
    const teammateNames = this.agents
      .filter(a => a.personality.id !== p.id)
      .map(a => a.personality.name);

    let prompt = `You are ${p.name} (${p.role}). You're wandering the office after a meeting.`;
    if (ctx && ctx.goal) prompt += ` Team goal: ${ctx.goal}.`;

    const memBlock = this.agentMemory ? this.agentMemory.getPromptBlock(p.id) : '';
    if (memBlock) prompt += '\n' + memBlock;

    prompt += `\nYour teammates: ${teammateNames.join(', ')}.`;
    prompt += '\nDecide what to do RIGHT NOW. Return ONLY one JSON object:';
    prompt += '\n- {"action":"talk_to","target":"Name","topic":"brief topic"}';
    prompt += '\n- {"action":"think","thought":"a brief internal thought"}';
    prompt += '\n- {"action":"wander"}';

    const messages = [
      { role: 'system', content: prompt },
      { role: 'user', content: 'What do you want to do? Return JSON only.' }
    ];

    const result = await AIClient.chat(messages, { max_tokens: 80 });
    if (!result) return null;

    // Extract JSON with regex
    const match = result.match(/\{[\s\S]*?\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  async _handleTalkTo(agent, decision) {
    if (this.sideConvoManager.running) return;

    const targetName = decision.target;
    const targetAgent = this.agents.find(
      a => a.personality.name.toLowerCase() === targetName.toLowerCase()
    );
    if (!targetAgent) return;
    if (targetAgent.personality.id === agent.personality.id) return;
    if (this._busyAgents.has(targetAgent.personality.id)) return;

    this._busyAgents.add(targetAgent.personality.id);
    try {
      await this.sideConvoManager.startDirectedChat(agent, targetAgent, decision.topic || '');
    } finally {
      this._busyAgents.delete(targetAgent.personality.id);
    }
  }

  async _handleThink(agent, decision) {
    const p = agent.personality;
    const thought = decision.thought || '...';
    this.speechBubbleUI.showThought(
      p.id,
      p.name,
      thought,
      agent.controller.character,
      p.cssColor,
      3.5
    );
  }
}
