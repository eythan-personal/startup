import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CharacterController } from '../CharacterController.js';
import { ConversationManager } from './ConversationManager.js';
import { SpeechBubbleUI } from './SpeechBubbleUI.js';
import { AgentEditModal } from './RoleEditorUI.js';
import { DMWindowUI } from './DMWindowUI.js';
import { CrewHUD } from './CrewHUD.js';
import { AGENT_PERSONALITIES, createBlankPersonality } from './AgentPersonality.js';

export class AgentManager {
  constructor(camera, scene, renderer) {
    this.camera = camera;
    this.scene = scene;
    this.renderer = renderer;
    this.agents = []; // { controller, personality, nameLabel }
    this.speechBubbleUI = new SpeechBubbleUI(camera);
    this.conversationManager = new ConversationManager(this.speechBubbleUI);
    this.dmUI = new DMWindowUI(this.conversationManager.planUI, this.conversationManager.fileActivityPanel);
    this.meetingStarted = false;
    this.agentsCreated = false;
    this.modelData = undefined;
    this.crewHUD = null;
  }

  setModelData(data) {
    this.modelData = data;
  }

  addAgent(controller, personality) {
    const nameLabel = this.speechBubbleUI.createNameLabel(
      personality.id,
      personality.name,
      controller.character,
      personality.cssColor,
      personality.role
    );

    const agent = { controller, personality, nameLabel };
    this.agents.push(agent);

    // Add hover action buttons (edit + remove) for config mode
    if (!this.meetingStarted) {
      this._attachHoverActions(agent);
    }

    // Hover → dance, leave → idle
    nameLabel.addEventListener('mouseenter', () => {
      if (!this.meetingStarted) {
        controller.lockAnimation('dance');
      }
    });
    nameLabel.addEventListener('mouseleave', () => {
      if (!this.meetingStarted) {
        controller.unlockAnimation();
        controller.playAnimation('idle');
      }
    });

    // Click name label → DM
    nameLabel.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dmUI.open(agent);
    });

    // During config, keep agents still and facing camera
    if (!this.meetingStarted) {
      controller.pauseWandering();
      controller.faceToward(this.camera.position);
    }
  }

  _attachHoverActions(agent) {
    const { nameLabel, personality } = agent;

    // Container for action buttons
    const actions = document.createElement('div');
    actions.className = 'agent-hover-actions';

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'agent-action-btn agent-action-edit';
    editBtn.setAttribute('aria-label', `Edit ${personality.name}`);
    editBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._openEditModal(agent);
    });

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'agent-action-btn agent-action-remove';
    removeBtn.setAttribute('aria-label', `Remove ${personality.name}`);
    removeBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._confirmRemove(agent, removeBtn);
    });

    actions.appendChild(editBtn);
    actions.appendChild(removeBtn);
    nameLabel.appendChild(actions);
    agent._hoverActions = actions;
  }

  _attachMeetingActions(agent) {
    const { nameLabel, personality } = agent;

    const actions = document.createElement('div');
    actions.className = 'agent-hover-actions';

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'agent-action-btn agent-action-edit';
    editBtn.setAttribute('aria-label', `Edit ${personality.name}`);
    editBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._openEditModal(agent);
    });

    // DM button
    const dmBtn = document.createElement('button');
    dmBtn.className = 'agent-action-btn agent-action-dm';
    dmBtn.setAttribute('aria-label', `Message ${personality.name}`);
    dmBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2 3h8v5H4l-2 2V3z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
    dmBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dmUI.open(agent);
    });

    actions.appendChild(editBtn);
    actions.appendChild(dmBtn);
    nameLabel.appendChild(actions);
    agent._hoverActions = actions;
  }

  _confirmRemove(agent, removeBtn) {
    // If already confirming, execute the remove
    if (removeBtn.classList.contains('confirming')) {
      this._removeAgent(agent.personality.id);
      return;
    }

    // First click: switch to confirm state
    if (this.agents.length <= 2) return; // minimum 2

    removeBtn.classList.add('confirming');
    removeBtn.setAttribute('aria-label', `Confirm remove ${agent.personality.name}?`);
    removeBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2.5 6.5L5 9l4.5-6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    // Reset after 2s if not confirmed
    const timer = setTimeout(() => {
      removeBtn.classList.remove('confirming');
      removeBtn.setAttribute('aria-label', `Remove ${agent.personality.name}`);
      removeBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;
    }, 2000);
    removeBtn._confirmTimer = timer;
  }

  update(delta) {
    this.speechBubbleUI.update(delta);

    for (const agent of this.agents) {
      this.speechBubbleUI.updateNameLabel(agent.nameLabel, agent.controller.character);
    }

    if (!this.agentsCreated && this.modelData !== undefined) {
      this.agentsCreated = true;
      this._createDefaultAgents();
    }
  }

  _createDefaultAgents() {
    for (const personality of AGENT_PERSONALITIES) {
      this._createAgentFromPersonality(personality);
    }
    this._arrangeInLine();
    this._showCrewHUD();
  }

  _createAgentFromPersonality(personality) {
    let controllerModelData = null;
    if (this.modelData) {
      const clonedScene = SkeletonUtils.clone(this.modelData.baseScene);
      controllerModelData = {
        scene: clonedScene,
        animations: this.modelData.sharedAnimations
      };
    }

    const controller = new CharacterController(this.scene, this.camera, controllerModelData, this.renderer, {
      agentId: personality.id,
      color: personality.color,
      startPosition: new THREE.Vector3(0, 0, 0)
    });

    this.addAgent(controller, personality);
  }

  _arrangeInLine() {
    const total = this.agents.length;
    const spacing = 5;
    const totalWidth = (total - 1) * spacing;
    const startX = -totalWidth / 2;

    for (let i = 0; i < total; i++) {
      const agent = this.agents[i];
      const x = startX + i * spacing;
      if (agent.controller.character) {
        agent.controller.character.position.set(x, 0, 0);
        agent.controller.faceToward(this.camera.position);
      }
    }
  }

  _hideAppUI() {
    document.querySelectorAll('.status-bar, .chat-input-wrapper, .chat-log, .file-activity-panel').forEach(el => {
      el.style.display = 'none';
    });
  }

  _showAppUI() {
    document.querySelectorAll('.status-bar, .chat-input-wrapper, .chat-log, .file-activity-panel').forEach(el => {
      el.style.display = '';
    });
  }

  _showCrewHUD() {
    this._hideAppUI();
    this.crewHUD = new CrewHUD({
      onAddAgent: () => this._addNewAgent(),
      onStartMeeting: () => this._startMeeting()
    });
    this.crewHUD.updateCount(this.agents.length);
  }

  _addNewAgent() {
    const blank = createBlankPersonality(this.agents.length);
    AGENT_PERSONALITIES.push(blank);
    this._createAgentFromPersonality(blank);
    this._arrangeInLine();
    if (this.crewHUD) this.crewHUD.updateCount(this.agents.length);
  }

  _removeAgent(agentId) {
    if (this.agents.length <= 2) return;

    const idx = this.agents.findIndex(a => a.personality.id === agentId);
    if (idx === -1) return;

    const agent = this.agents[idx];

    if (agent.controller.character) {
      this.scene.remove(agent.controller.character);
    }
    if (agent.nameLabel) {
      agent.nameLabel.remove();
    }

    this.agents.splice(idx, 1);

    const pIdx = AGENT_PERSONALITIES.findIndex(p => p.id === agentId);
    if (pIdx !== -1) AGENT_PERSONALITIES.splice(pIdx, 1);

    this._arrangeInLine();

    if (this.crewHUD) this.crewHUD.updateCount(this.agents.length);
  }

  async _openEditModal(agent) {
    const modal = new AgentEditModal();
    const result = await modal.show(agent.personality);

    if (result) {
      agent.personality.name = result.name;
      agent.personality.role = result.role;
      agent.personality.systemPrompt = result.systemPrompt;

      const nameEl = agent.nameLabel.querySelector('.agent-label-name');
      const roleEl = agent.nameLabel.querySelector('.agent-label-role');
      if (nameEl) nameEl.textContent = result.name;
      if (roleEl) roleEl.textContent = result.role;
    }
  }

  _startMeeting() {
    if (this.meetingStarted) return;
    this.meetingStarted = true;

    for (const agent of this.agents) {
      // Swap hover actions: remove config buttons, add meeting buttons
      if (agent._hoverActions) {
        agent._hoverActions.remove();
        agent._hoverActions = null;
      }
      this._attachMeetingActions(agent);
      agent.controller.resumeWandering();
    }

    if (this.crewHUD) {
      this.crewHUD.destroy();
      this.crewHUD = null;
    }
    this._showAppUI();

    this.conversationManager.startGroupMeeting(this.agents);
  }
}
