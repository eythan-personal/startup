import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CharacterController } from './CharacterController.js';
import { AgentManager } from './agents/AgentManager.js';
import { AGENT_PERSONALITIES } from './agents/AgentPersonality.js';
import { OllamaClient } from './agents/OllamaClient.js';
import { createEnvironment } from './environment.js';

// Scene setup
const canvas = document.getElementById('canvas');
const scene = new THREE.Scene();

// Camera - centered orbit view for multi-agent scene
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 25, 35);
camera.lookAt(0, 0, 0);

// Renderer
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// Create environment
createEnvironment(scene);

// Agent manager
const agentManager = new AgentManager(camera);
const agents = [];

const gltfLoader = new GLTFLoader();

function loadGLB(path) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(path, resolve, undefined, reject);
  });
}

async function initAgents() {
  const statusEl = document.getElementById('ollama-status');

  try {
    console.log('Loading character models...');

    const [idleGltf, walkGltf, runGltf, danceGltf, jumpGltf, jumpRunGltf] = await Promise.all([
      loadGLB('/models/Meshy_AI_Character_output.glb'),
      loadGLB('/models/Meshy_AI_Animation_Walking_withSkin.glb'),
      loadGLB('/models/Meshy_AI_Animation_Running_withSkin.glb'),
      loadGLB('/models/Meshy_AI_Animation_Bubble_Dance_withSkin.glb'),
      loadGLB('/models/Meshy_AI_Animation_Jump_with_Arms_Open_withSkin.glb'),
      loadGLB('/models/Meshy_AI_Animation_Jump_Run_withSkin.glb')
    ]);

    console.log('Models loaded, creating agents...');

    // Extract shared animation clips
    const sharedAnimations = {
      idle: idleGltf.animations[0] || null,
      walk: walkGltf.animations[0] || null,
      run: runGltf.animations[0] || null,
      dance: danceGltf.animations[0] || null,
      jump: jumpGltf.animations[0] || null,
      jumpRun: jumpRunGltf.animations[0] || null
    };

    // Create 3 agents with cloned models
    for (const personality of AGENT_PERSONALITIES) {
      const clonedScene = SkeletonUtils.clone(idleGltf.scene);

      const controller = new CharacterController(scene, camera, {
        scene: clonedScene,
        animations: sharedAnimations
      }, renderer, {
        agentId: personality.id,
        color: personality.color,
        startPosition: new THREE.Vector3(
          personality.startPosition.x,
          personality.startPosition.y,
          personality.startPosition.z
        )
      });

      agentManager.addAgent(controller, personality);
      agents.push(controller);
      console.log(`Agent ${personality.name} created`);
    }
  } catch (e) {
    console.warn('Could not load models, using placeholders:', e.message);

    // Fallback: create placeholder agents
    for (const personality of AGENT_PERSONALITIES) {
      const controller = new CharacterController(scene, camera, null, renderer, {
        agentId: personality.id,
        color: personality.color,
        startPosition: new THREE.Vector3(
          personality.startPosition.x,
          personality.startPosition.y,
          personality.startPosition.z
        )
      });

      agentManager.addAgent(controller, personality);
      agents.push(controller);
      console.log(`Agent ${personality.name} created (placeholder)`);
    }
  }

  // Check Ollama status
  const ollamaReady = await OllamaClient.checkHealth();
  if (statusEl) {
    statusEl.textContent = ollamaReady ? 'AI Connected' : 'AI Offline';
    statusEl.className = 'ollama-status ' + (ollamaReady ? 'online' : 'offline');
  }
}

initAgents();

// Handle resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  // Update all agents
  for (const agent of agents) {
    agent.update(delta);
  }

  // Update agent manager (proximity, conversations, UI)
  agentManager.update(delta);

  renderer.render(scene, camera);
}

animate();
