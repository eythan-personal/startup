import { VirtualFileSystem } from './VirtualFileSystem.js';
import { AIClient } from './AIClient.js';

const ROLE_HINTS = {
  engineer: 'JavaScript (.js), JSON (.json), configuration files',
  dev: 'JavaScript (.js), JSON (.json), configuration files',
  developer: 'JavaScript (.js), JSON (.json), configuration files',
  design: 'CSS (.css), HTML (.html), SVG files',
  product: 'Markdown (.md), HTML (.html), specification docs',
  marketing: 'Markdown (.md), HTML (.html), copy documents',
};

function getHintsForRole(role) {
  if (!role) return 'any text files relevant to your expertise';
  const lower = role.toLowerCase();
  for (const [keyword, hint] of Object.entries(ROLE_HINTS)) {
    if (lower.includes(keyword)) return hint;
  }
  return 'any text files relevant to your expertise';
}

export class AgentFileGenerator {
  constructor(activityPanel = null) {
    this.vfs = VirtualFileSystem.getInstance();
    this.activityPanel = activityPanel;
  }

  async maybeGenerate(agent, conversationHistory, latestMessage) {
    const p = agent.personality || agent;
    const name = p.name;
    const role = p.role || '';
    const systemPrompt = p.systemPrompt || '';
    const hints = getHintsForRole(role);

    // Build recent context
    const recent = conversationHistory.slice(-8);
    const transcript = recent.map(e => `${e.speakerName || e.role}: ${e.text || e.content}`).join('\n');

    // Step 1: Classification — should we generate files?
    const classifyMessages = this._buildClassifyPrompt(name, role, hints, transcript, latestMessage);
    const classifyResult = await AIClient.chat(classifyMessages);

    if (!classifyResult) return [];

    let parsed;
    try {
      const jsonMatch = classifyResult.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return [];
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return [];
    }

    if (!parsed.generate || !Array.isArray(parsed.files) || parsed.files.length === 0) {
      return [];
    }

    // Step 2: Generate each file
    const createdFiles = [];

    const cssColor = p.cssColor || '#aaa';
    const agentId = p.id;

    for (const file of parsed.files) {
      if (!file.path || !file.description) continue;

      // Normalize path — ensure it starts with /
      const filePath = file.path.startsWith('/') ? file.path : '/' + file.path;
      const fileName = filePath.split('/').pop();

      // Signal "generating" to the activity panel
      if (this.activityPanel) {
        this.activityPanel.markGenerating(filePath, name, cssColor, file.description);
        this.activityPanel.setAgentStatus(agentId, `writing ${fileName}...`);
      }

      const genMessages = this._buildGeneratePrompt(name, role, systemPrompt, filePath, file.description, transcript);
      const content = await AIClient.chat(genMessages);

      if (!content) continue;

      // Strip markdown fences if the LLM wrapped them
      const cleanContent = this._stripFences(content);

      // Save to VFS
      const existing = this.vfs.getFile(filePath);
      if (existing) {
        this.vfs.updateFile(filePath, cleanContent);
      } else {
        this.vfs.createFile(filePath, cleanContent, name);
      }

      // Signal "done" to the activity panel
      if (this.activityPanel) {
        this.activityPanel.markDone(filePath, name, cssColor);
      }

      createdFiles.push(filePath);
    }

    // Reset agent status after all files generated
    if (this.activityPanel && agentId) {
      this.activityPanel.setAgentStatus(agentId, 'idle');
    }

    return createdFiles;
  }

  async generateForPlan(agent, planSummary, history) {
    const p = agent.personality || agent;
    const name = p.name;
    const role = p.role || '';
    const systemPrompt = p.systemPrompt || '';
    const cssColor = p.cssColor || '#aaa';
    const agentId = p.id;

    // Step 1: Ask LLM what files this agent should create
    const planMessages = [
      {
        role: 'system',
        content: `You are ${name} (${role}). ${systemPrompt}\nYour team just finished planning a project. Based on the plan and your expertise, decide what 1-3 project files you should create to start building.\nPick files that match YOUR role and skills. Be practical.\nReply with ONLY a JSON array: [{ "path": "/filename.ext", "description": "..." }]`
      },
      {
        role: 'user',
        content: `Plan:\n${planSummary}\n\nWhat files should you create? JSON only.`
      }
    ];

    if (this.activityPanel) {
      this.activityPanel.setAgentStatus(agentId, 'planning files...');
    }

    const planResult = await AIClient.chat(planMessages);
    if (!planResult) {
      if (this.activityPanel) this.activityPanel.setAgentStatus(agentId, 'idle');
      return [];
    }

    let files;
    try {
      const jsonMatch = planResult.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        if (this.activityPanel) this.activityPanel.setAgentStatus(agentId, 'idle');
        return [];
      }
      files = JSON.parse(jsonMatch[0]);
    } catch {
      if (this.activityPanel) this.activityPanel.setAgentStatus(agentId, 'idle');
      return [];
    }

    if (!Array.isArray(files) || files.length === 0) {
      if (this.activityPanel) this.activityPanel.setAgentStatus(agentId, 'idle');
      return [];
    }

    // Step 2: Generate each file
    const recent = history.slice(-12);
    const transcript = recent.map(e => `${e.speakerName || e.role}: ${e.text || e.content}`).join('\n');
    const createdFiles = [];

    for (const file of files.slice(0, 3)) {
      if (!file.path || !file.description) continue;

      const filePath = file.path.startsWith('/') ? file.path : '/' + file.path;
      const fileName = filePath.split('/').pop();

      if (this.activityPanel) {
        this.activityPanel.markGenerating(filePath, name, cssColor, file.description);
        this.activityPanel.setAgentStatus(agentId, `writing ${fileName}...`);
      }

      const genMessages = this._buildGeneratePrompt(name, role, systemPrompt, filePath, file.description, transcript);
      const content = await AIClient.chat(genMessages);

      if (!content) continue;

      const cleanContent = this._stripFences(content);

      const existing = this.vfs.getFile(filePath);
      if (existing) {
        this.vfs.updateFile(filePath, cleanContent);
      } else {
        this.vfs.createFile(filePath, cleanContent, name);
      }

      if (this.activityPanel) {
        this.activityPanel.markDone(filePath, name, cssColor);
      }

      createdFiles.push(filePath);
    }

    if (this.activityPanel) {
      this.activityPanel.setAgentStatus(agentId, 'idle');
    }

    return createdFiles;
  }

  _buildClassifyPrompt(name, role, hints, transcript, latestMessage) {
    return [
      {
        role: 'system',
        content: `You are ${name} (${role}). Based on your expertise, you typically produce files like: ${hints}.\n\nAfter a team discussion, decide if you should create or update any project files. Only suggest files when the conversation clearly calls for building or creating something concrete. Do NOT suggest files for casual discussion or brainstorming.\n\nReply with ONLY a JSON object: { "generate": true, "files": [{ "path": "filename.ext", "description": "what this file contains" }] } or { "generate": false }`
      },
      {
        role: 'user',
        content: `Recent conversation:\n${transcript}\n\nLatest message: "${latestMessage}"\n\nShould you create any files based on this conversation? Reply with JSON only.`
      }
    ];
  }

  _buildGeneratePrompt(name, role, systemPrompt, filePath, description, transcript) {
    return [
      {
        role: 'system',
        content: `${systemPrompt}\n\nYou are ${name} (${role}). Generate the complete content for the file "${filePath}": ${description}.\n\nOutput ONLY the raw file content. No markdown fences, no explanations, no comments about the file — just the file content itself.`
      },
      {
        role: 'user',
        content: `Context from the team discussion:\n${transcript}\n\nGenerate the complete file content for "${filePath}". Output ONLY the file content.`
      }
    ];
  }

  _stripFences(content) {
    // Remove ```language ... ``` wrappers
    const fenced = content.match(/^```[\w]*\n([\s\S]*?)```\s*$/);
    if (fenced) return fenced[1].trim();
    // Remove leading/trailing ``` if present
    return content.replace(/^```[\w]*\n?/, '').replace(/\n?```\s*$/, '').trim();
  }
}
