import { AIClient } from './AIClient.js';

export class SideConversationManager {
  constructor(speechBubbleUI, agents, planUI, getWorkingContext) {
    this.speechBubbleUI = speechBubbleUI;
    this.agents = agents;
    this.planUI = planUI;
    this.getWorkingContext = getWorkingContext || null;
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
    const pA = agentA.personality;
    const pB = agentB.personality;

    const planSummary = this.planUI.getCurrentPlanSummary();
    const ctx = this.getWorkingContext ? this.getWorkingContext() : null;

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
  }

  async _generateSideMessage(speaker, other, planSummary, ctx, previousMsg) {
    let systemContent = speaker.systemPrompt + '\n\n' +
      `You're having a quick aside with ${other.name} (${other.role}). ` +
      `Be casual, brief. React to something the team is working on. One sentence max.\n`;

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
