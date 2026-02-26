import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AgentManager } from './agents/AgentManager.js';
import { AIClient } from './agents/AIClient.js';
import { createEnvironment } from './environment.js';
import { CharacterController } from './CharacterController.js';

// Scene setup
const canvas = document.getElementById('canvas');
const scene = new THREE.Scene();

// Camera - centered orbit view for multi-agent scene
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 18, 26);
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
const agentManager = new AgentManager(camera, scene, renderer);

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

    const [baseGltf, idleGltf, walkGltf, runGltf, danceGltf, jumpGltf, jumpRunGltf, waterCoolerGltf] = await Promise.all([
      loadGLB('/models/Meshy_AI_Character_output.glb'),
      loadGLB('/models/Meshy_AI_Animation_Idle_3_withSkin.glb'),
      loadGLB('/models/Meshy_AI_Animation_Walking_withSkin.glb'),
      loadGLB('/models/Meshy_AI_Animation_Running_withSkin.glb'),
      loadGLB('/models/Meshy_AI_Animation_Bubble_Dance_withSkin.glb'),
      loadGLB('/models/Meshy_AI_Animation_Jump_with_Arms_Open_withSkin.glb'),
      loadGLB('/models/Meshy_AI_Animation_Jump_Run_withSkin.glb'),
      loadGLB('/models/water_cooler.glb').catch(() => null)
    ]);

    console.log('Models loaded, passing to AgentManager...');

    // Place water cooler in the scene
    if (waterCoolerGltf) {
      const cooler = waterCoolerGltf.scene;

      // Measure the model's natural size
      const box = new THREE.Box3().setFromObject(cooler);
      const size = box.getSize(new THREE.Vector3());
      const modelHeight = size.y;

      // Target height ~1.2 units (roughly waist-height on the agents)
      const targetHeight = 1.2;
      const scaleFactor = targetHeight / modelHeight;
      cooler.scale.set(scaleFactor, scaleFactor, scaleFactor);

      // Recompute bounding box after scaling to place bottom on ground
      box.setFromObject(cooler);
      cooler.position.set(12, -box.min.y, -8);

      cooler.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      scene.add(cooler);

      // Tell CharacterController where the water cooler is
      CharacterController.waterCoolerPosition = new THREE.Vector3(12, 0, -8);
    }

    // Extract shared animation clips
    const sharedAnimations = {
      idle: idleGltf.animations[0] || null,
      walk: walkGltf.animations[0] || null,
      run: runGltf.animations[0] || null,
      dance: danceGltf.animations[0] || null,
      jump: jumpGltf.animations[0] || null,
      jumpRun: jumpRunGltf.animations[0] || null
    };

    // Pass model data to AgentManager — agents will be created after editor
    agentManager.setModelData({ baseScene: baseGltf.scene, sharedAnimations });
  } catch (e) {
    console.warn('Could not load models, using placeholders:', e.message);
    agentManager.setModelData(null);
  }

  // Check AI status
  const aiReady = await AIClient.checkHealth();
  if (statusEl) {
    statusEl.textContent = aiReady ? 'AI Connected' : 'AI Offline';
    statusEl.className = 'ollama-status ' + (aiReady ? 'online' : 'offline');
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
  for (const agent of agentManager.agents) {
    agent.controller.update(delta);
  }

  // Update agent manager (proximity, conversations, UI)
  agentManager.update(delta);

  renderer.render(scene, camera);
}

animate();
