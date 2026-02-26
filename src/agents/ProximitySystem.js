const PROXIMITY_THRESHOLD = 3.0;
const REACTION_RADIUS = 5.0;
const CHECK_INTERVAL = 0.5;
const PAIR_COOLDOWN = 45;
const TRIGGER_CHANCE = 0.3;
const REACTION_CHANCE = 0.4;
const REACTION_EMOJIS = ['👀', '🤔', '😄', '💡', '👍', '😮'];

export class ProximitySystem {
  constructor(agents, sideConvoManager, speechBubbleUI, autonomyLoop) {
    this.agents = agents;
    this.sideConvoManager = sideConvoManager;
    this.speechBubbleUI = speechBubbleUI;
    this.autonomyLoop = autonomyLoop;

    this._checkAccumulator = 0;
    this._pairCooldowns = new Map(); // pairKey -> timestamp
    this._reacted = new Set(); // "agentId:speakerId"
    this._trackedBubbleKeys = new Set(); // track which bubble keys are active
    this.paused = false;
  }

  update(delta) {
    if (this.paused) return;

    this._checkAccumulator += delta;
    if (this._checkAccumulator < CHECK_INTERVAL) return;
    this._checkAccumulator = 0;

    this._checkProximity();
    this._checkReactions();
  }

  _checkProximity() {
    if (this.sideConvoManager.running) return;

    const now = Date.now();
    const agents = this.agents;

    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const a = agents[i];
        const b = agents[j];

        // Both must be wandering (not paused) and not busy in autonomy loop
        if (a.controller._wanderingPaused || b.controller._wanderingPaused) continue;
        if (this.autonomyLoop._busyAgents.has(a.personality.id)) continue;
        if (this.autonomyLoop._busyAgents.has(b.personality.id)) continue;

        const charA = a.controller.character;
        const charB = b.controller.character;
        if (!charA || !charB) continue;

        const dist = charA.position.distanceTo(charB.position);
        if (dist >= PROXIMITY_THRESHOLD) continue;

        const key = this._pairKey(a.personality.id, b.personality.id);

        // Check cooldown
        const lastChat = this._pairCooldowns.get(key);
        if (lastChat && (now - lastChat) < PAIR_COOLDOWN * 1000) continue;

        // Probability check
        if (Math.random() > TRIGGER_CHANCE) continue;

        // Trigger side chat
        this._pairCooldowns.set(key, now);
        this.sideConvoManager.startDirectedChat(a, b, '');
        return; // Only one trigger per cycle
      }
    }
  }

  _checkReactions() {
    const bubbles = this.speechBubbleUI.activeBubbles;

    // Track current bubble keys to detect removals
    const currentKeys = new Set();

    for (const [bubbleKey, bubble] of bubbles) {
      // Skip reaction bubbles themselves
      if (String(bubbleKey).endsWith('_reaction')) continue;
      currentKeys.add(bubbleKey);

      const speakerChar = bubble.character;
      if (!speakerChar) continue;

      for (const agent of this.agents) {
        if (agent.personality.id === bubbleKey) continue; // skip the speaker

        const char = agent.controller.character;
        if (!char) continue;

        const dist = char.position.distanceTo(speakerChar.position);
        if (dist >= REACTION_RADIUS) continue;

        const reactKey = `${agent.personality.id}:${bubbleKey}`;
        if (this._reacted.has(reactKey)) continue;

        // Mark as processed regardless of roll
        this._reacted.add(reactKey);

        if (Math.random() > REACTION_CHANCE) continue;

        const emoji = REACTION_EMOJIS[Math.floor(Math.random() * REACTION_EMOJIS.length)];
        this.speechBubbleUI.showReaction(agent.personality.id, emoji, char, 1.5);
      }
    }

    // Clean up _reacted entries for bubbles that have disappeared
    const staleKeys = [];
    for (const key of this._trackedBubbleKeys) {
      if (!currentKeys.has(key)) {
        staleKeys.push(key);
      }
    }
    for (const stale of staleKeys) {
      // Remove all reaction records for this bubble
      for (const reactKey of this._reacted) {
        if (reactKey.endsWith(`:${stale}`)) {
          this._reacted.delete(reactKey);
        }
      }
    }
    this._trackedBubbleKeys = currentKeys;
  }

  _pairKey(idA, idB) {
    return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }
}
