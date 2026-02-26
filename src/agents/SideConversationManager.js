import * as THREE from 'three';
import { AIClient } from './AIClient.js';

export class SideConversationManager {
  constructor(speechBubbleUI, agents, planUI, getWorkingContext, agentMemory = null) {
    this.speechBubbleUI = speechBubbleUI;
    this.agents = agents;
    this.planUI = planUI;
    this.getWorkingContext = getWorkingContext || null;
    this.agentMemory = agentMemory;
    this.lastSideChat = 0;
    this.COOLDOWN = 30000; // 30 seconds
    this.CHANCE = 0.2; // 20% chance
    this.BUBBLE_DURATION = 4;
    this.running = false;
  }

  async maybeStartSideChat() {
    if (this.running) return;

    const now = Date.now();
    if (now - this.lastSideChat < this.COOLDOWN) return;
    if (Math.random() > this.CHANCE) return;

    this.running = true;
    this.lastSideChat = now;

    try {
      await this._runSideChat();
    } finally {
      this.running = false;
    }
  }

  async _runSideChat() {
    // Pick 2 random agents
    const shuffled = [...this.agents].sort(() => Math.random() - 0.5);
    const [agentA, agentB] = shuffled.slice(0, 2);

    // Walk agents toward each other
    await this._gatherAgents(agentA, agentB);

    const pA = agentA.personality;
    const pB = agentB.personality;

    const planSummary = this.planUI.getCurrentPlanSummary();
    const ctx = this.getWorkingContext ? this.getWorkingContext() : null;

    try {
      // Agent A starts
      const msgA = await this._generateSideMessage(pA, pB, planSummary, ctx, null);
      if (!msgA) return;

      this._showSideMessage(agentA, msgA);
      await this._delay(this.BUBBLE_DURATION * 1000);

      // Agent B responds
      const msgB = await this._generateSideMessage(pB, pA, planSummary, ctx, msgA);
      if (!msgB) return;

      this._showSideMessage(agentB, msgB);
      await this._delay(this.BUBBLE_DURATION * 1000);
    } finally {
      // Resume wandering
      agentA.controller.resumeWandering();
      agentB.controller.resumeWandering();
    }
  }

  /** Walk two agents to a shared midpoint, pause, and face each other. */
  async _gatherAgents(agentA, agentB) {
    const posA = agentA.controller.position;
    const posB = agentB.controller.position;
    const midpoint = new THREE.Vector3().addVectors(posA, posB).multiplyScalar(0.5);

    // Offset so they stand side by side, not on top of each other
    const dir = new THREE.Vector3().subVectors(posB, posA);
    dir.y = 0;
    dir.normalize();
    const offsetA = midpoint.clone().add(dir.clone().multiplyScalar(-1));
    const offsetB = midpoint.clone().add(dir.clone().multiplyScalar(1));

    await Promise.all([
      agentA.controller.walkTo(offsetA),
      agentB.controller.walkTo(offsetB)
    ]);

    // Pause and face each other
    agentA.controller.pauseWandering();
    agentB.controller.pauseWandering();
    agentA.controller.faceToward(agentB.controller.position);
    agentB.controller.faceToward(agentA.controller.position);
  }

  /** Triggered by a DM directive — one agent walks to another and they chat about a topic. */
  async startDirectedChat(fromAgent, toAgent, topic) {
    if (this.running) return;
    this.running = true;

    try {
      // Walk fromAgent to toAgent's position (with a small offset)
      const targetPos = toAgent.controller.position.clone();
      const dir = new THREE.Vector3().subVectors(fromAgent.controller.position, targetPos);
      dir.y = 0;
      dir.normalize();
      const arrivalPos = targetPos.clone().add(dir.multiplyScalar(1.5));

      await fromAgent.controller.walkTo(arrivalPos);

      // Pause both and face each other
      fromAgent.controller.pauseWandering();
      toAgent.controller.pauseWandering();
      fromAgent.controller.faceToward(toAgent.controller.position);
      toAgent.controller.faceToward(fromAgent.controller.position);

      const pFrom = fromAgent.personality;
      const pTo = toAgent.personality;
      const planSummary = this.planUI.getCurrentPlanSummary();
      const ctx = this.getWorkingContext ? this.getWorkingContext() : null;

      // fromAgent initiates
      const topicPrompt = topic ? `Start a brief chat with ${pTo.name} about: ${topic}` : null;
      const msgA = await this._generateSideMessage(pFrom, pTo, planSummary, ctx, null, topicPrompt);
      if (msgA) {
        this._showSideMessage(fromAgent, msgA);
        await this._delay(this.BUBBLE_DURATION * 1000);

        // toAgent responds
        const msgB = await this._generateSideMessage(pTo, pFrom, planSummary, ctx, msgA);
        if (msgB) {
          this._showSideMessage(toAgent, msgB);
          await this._delay(this.BUBBLE_DURATION * 1000);
        }
      }
    } finally {
      fromAgent.controller.resumeWandering();
      toAgent.controller.resumeWandering();
      this.running = false;
    }
  }

  async _generateSideMessage(speaker, other, planSummary, ctx, previousMsg, topicPrompt = null) {
    let systemContent = speaker.systemPrompt + '\n\n' +
      `You're having a quick aside with ${other.name} (${other.role}). ` +
      `Be casual, brief. React to something the team is working on. One sentence max.\n`;

    if (this.agentMemory) {
      const note = this.agentMemory.getTeammateNote(speaker.id, other.id);
      if (note) systemContent += note + '\n';
    }

    if (ctx && ctx.goal) {
      systemContent += `\nTeam goal: ${ctx.goal}\n`;
      if (ctx.currentFocus) {
        systemContent += `Current focus: ${ctx.currentFocus}\n`;
      }
    }

    if (planSummary) {
      systemContent += `\nCurrent plan:\n${planSummary}\n`;
    }

    const messages = [{ role: 'system', content: systemContent }];

    if (previousMsg) {
      messages.push({ role: 'user', content: `${other.name}: ${previousMsg}` });
    } else if (topicPrompt) {
      messages.push({ role: 'user', content: topicPrompt });
    } else {
      messages.push({ role: 'user', content: `Start a brief casual aside with ${other.name} about what the team is working on.` });
    }

    const response = await AIClient.chat(messages);
    if (!response) return null;
    // Trim at sentence boundary
    if (response.length <= 200) return response;
    const lastEnd = Math.max(
      response.lastIndexOf('.', 200),
      response.lastIndexOf('!', 200),
      response.lastIndexOf('?', 200)
    );
    return lastEnd > 60 ? response.slice(0, lastEnd + 1) : response.slice(0, 200);
  }

  _showSideMessage(agent, text) {
    const p = agent.personality;

    this.speechBubbleUI.show(
      p.id,
      p.name,
      text,
      agent.controller.character,
      p.cssColor,
      this.BUBBLE_DURATION
    );

    // Add to chat log with [side chat] tag
    this.speechBubbleUI.addToChatLog(
      p.name,
      p.role,
      text,
      p.cssColor,
      'side chat'
    );
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
