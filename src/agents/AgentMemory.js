import { AIClient } from './AIClient.js';

export class AgentMemory {
  constructor() {
    this.memories = {}; // agentId -> { stances, contributions, teammates, mood }
  }

  init(agentId, allAgents) {
    const teammates = {};
    for (const a of allAgents) {
      const p = a.personality;
      if (p.id !== agentId) {
        teammates[p.id] = { name: p.name, role: p.role, impression: '' };
      }
    }

    this.memories[agentId] = {
      stances: [],        // [{ topic, position }] — max 5
      contributions: [],  // ["proposed freemium model"] — max 5, FIFO
      teammates,
      mood: ''
    };
  }

  getPromptBlock(agentId) {
    const mem = this.memories[agentId];
    if (!mem) return '';

    const parts = [];

    if (mem.mood) {
      parts.push(`Your current mood: ${mem.mood}`);
    }

    if (mem.stances.length > 0) {
      const stanceStr = mem.stances.map(s => `- ${s.topic}: ${s.position}`).join('\n');
      parts.push(`Your current stances:\n${stanceStr}`);
    }

    if (mem.contributions.length > 0) {
      parts.push(`You've contributed: ${mem.contributions.join('; ')}`);
    }

    return parts.length > 0
      ? '\n[Your memory]\n' + parts.join('\n') + '\n'
      : '';
  }

  getTeamRoster(agentId) {
    const mem = this.memories[agentId];
    if (!mem) return '';

    const lines = [];
    for (const [, info] of Object.entries(mem.teammates)) {
      let line = `${info.name} (${info.role})`;
      if (info.impression) line += ` — ${info.impression}`;
      lines.push(line);
    }

    return lines.length > 0
      ? `\nYour teammates: ${lines.join('; ')}\n`
      : '';
  }

  getTeammateNote(agentId, otherAgentId) {
    const mem = this.memories[agentId];
    if (!mem || !mem.teammates[otherAgentId]) return '';

    const info = mem.teammates[otherAgentId];
    return info.impression
      ? `Your impression of ${info.name}: ${info.impression}`
      : '';
  }

  updateAfterSpeech(agentId, response, recentHistory) {
    const mem = this.memories[agentId];
    if (!mem) return;

    const historySnippet = recentHistory.slice(-5)
      .map(e => `${e.speakerName}: ${e.text}`)
      .join('\n');

    const teammateNames = Object.values(mem.teammates)
      .map(t => t.name)
      .join(', ');

    const messages = [
      {
        role: 'system',
        content: 'Extract memory updates from an agent\'s latest speech. Return ONLY valid JSON:\n{\n  "stance": { "topic": "...", "position": "..." } or null,\n  "contribution": "short phrase" or null,\n  "mood": "short phrase" or null,\n  "impressions": { "AgentName": "one-line impression" } or null\n}\nKeep everything very brief (under 10 words each). Only include fields that changed.'
      },
      {
        role: 'user',
        content: `Agent just said: "${response}"\n\nRecent context:\n${historySnippet}\n\nTeammates: ${teammateNames}\n\nExtract any memory updates:`
      }
    ];

    // Fire-and-forget — do not await
    AIClient.chat(messages, { max_tokens: 150 }).then(result => {
      if (!result) return;
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return;
        const parsed = JSON.parse(jsonMatch[0]);

        if (parsed.stance && parsed.stance.topic) {
          const idx = mem.stances.findIndex(s => s.topic === parsed.stance.topic);
          if (idx >= 0) {
            mem.stances[idx] = parsed.stance;
          } else {
            mem.stances.push(parsed.stance);
            if (mem.stances.length > 5) mem.stances.shift();
          }
        }

        if (parsed.contribution) {
          mem.contributions.push(parsed.contribution);
          if (mem.contributions.length > 5) mem.contributions.shift();
        }

        if (parsed.mood) {
          mem.mood = parsed.mood;
        }

        if (parsed.impressions) {
          for (const [name, impression] of Object.entries(parsed.impressions)) {
            // Match by name to find teammate id
            for (const [tid, info] of Object.entries(mem.teammates)) {
              if (info.name === name) {
                info.impression = impression;
              }
            }
          }
        }
      } catch {
        // JSON parse failure — no-op
      }
    });
  }
}
