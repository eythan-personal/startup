import { ConversationManager } from './ConversationManager.js';
import { SpeechBubbleUI } from './SpeechBubbleUI.js';

export class AgentManager {
  constructor(camera) {
    this.agents = []; // { controller, personality, nameLabel }
    this.speechBubbleUI = new SpeechBubbleUI(camera);
    this.conversationManager = new ConversationManager(this.speechBubbleUI);
    this.meetingStarted = false;
    this.wanderTimer = 0;
    this.WANDER_BEFORE_MEETING = 6; // seconds of wandering before they meet
  }

  addAgent(controller, personality) {
    const nameLabel = this.speechBubbleUI.createNameLabel(
      personality.id,
      personality.name,
      controller.character,
      personality.cssColor,
      personality.role
    );
    this.agents.push({ controller, personality, nameLabel });
  }

  update(delta) {
    // Update speech bubbles
    this.speechBubbleUI.update(delta);

    // Update name labels
    for (const agent of this.agents) {
      this.speechBubbleUI.updateNameLabel(agent.nameLabel, agent.controller.character);
    }

    // After some wandering, start the group meeting
    if (!this.meetingStarted && this.agents.length === 3) {
      this.wanderTimer += delta;
      if (this.wanderTimer >= this.WANDER_BEFORE_MEETING) {
        this.meetingStarted = true;
        this.conversationManager.startGroupMeeting(this.agents);
      }
    }
  }
}
