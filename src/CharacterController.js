import * as THREE from 'three';

export class CharacterController {
  constructor(scene, camera, gltfModels = null, renderer = null, options = {}) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.mixer = null;
    this.animations = {};
    this.currentAnimation = null;
    this.currentAnimationName = null;

    // Agent identity
    this.agentId = options.agentId || 'default';
    this.agentColor = options.color ? new THREE.Color(options.color) : null;
    this.startPosition = options.startPosition || new THREE.Vector3(0, 0, 0);

    // Movement settings
    this.moveSpeed = 3;
    this.rotationSpeed = 8;
    this.velocity = new THREE.Vector3();
    this.targetRotation = 0;

    // External animation override (e.g. dance on hover)
    this._animationLocked = false;

    // Autonomous wandering
    this.autonomous = true;
    this.wanderTarget = new THREE.Vector3();
    this.wanderPauseTimer = 0;
    this.wanderPauseDuration = 0;
    this.isWanderPaused = true;
    this._wanderingPaused = false; // external pause (conversations)

    // walkTo() promise support
    this._walkToResolve = null;

    // Water cooler break
    this._waterCoolerTimer = 30 + Math.random() * 60; // first break in 30-90s
    this._atWaterCooler = false;

    // Create character mesh
    if (gltfModels) {
      this.setupFromClone(gltfModels);
    } else {
      this.createPlaceholderCharacter();
    }

    // Set start position
    if (this.character) {
      this.character.position.copy(this.startPosition);
    }

    // Start wandering after a short random delay
    this.wanderPauseDuration = 1 + Math.random() * 2;
    this.wanderPauseTimer = 0;
  }

  pickNewWanderTarget() {
    // Check if it's time for a water cooler break
    if (this._waterCoolerTimer <= 0 && CharacterController.waterCoolerPosition) {
      // Head to the water cooler — offset slightly so agents don't all stand on the same spot
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        0,
        (Math.random() - 0.5) * 2
      );
      this.wanderTarget.copy(CharacterController.waterCoolerPosition).add(offset);
      this._atWaterCooler = true;
      this.wanderPauseDuration = 5 + Math.random() * 6; // linger 5-11s at cooler
      this.wanderPauseTimer = 0;
      this.isWanderPaused = false;
      // Reset timer for next break (45-120s)
      this._waterCoolerTimer = 45 + Math.random() * 75;
      return;
    }

    const range = 20;
    this.wanderTarget.set(
      (Math.random() - 0.5) * range * 2,
      0,
      (Math.random() - 0.5) * range * 2
    );
    this._atWaterCooler = false;
    this.wanderPauseDuration = 2 + Math.random() * 4;
    this.wanderPauseTimer = 0;
    this.isWanderPaused = false;
  }

  /** Walk to a world position. Returns a Promise that resolves when the agent arrives. */
  walkTo(position) {
    return new Promise((resolve) => {
      this.wanderTarget.copy(position);
      this.wanderTarget.y = 0;
      this.isWanderPaused = false;
      this._wanderingPaused = false;
      this._walkToResolve = resolve;
    });
  }

  pauseWandering() {
    this._wanderingPaused = true;
  }

  resumeWandering() {
    this._wanderingPaused = false;
    this.isWanderPaused = true;
    this.wanderPauseTimer = 0;
    this.wanderPauseDuration = 1 + Math.random() * 2;
  }

  faceToward(targetPosition) {
    if (!this.character) return;
    const dir = new THREE.Vector3().subVectors(targetPosition, this.character.position);
    dir.y = 0;
    if (dir.length() > 0.01) {
      this.targetRotation = Math.atan2(dir.x, dir.z);
    }
  }

  get position() {
    return this.character ? this.character.position : new THREE.Vector3();
  }

  setupFromClone(gltfModels) {
    // gltfModels here is { scene: clonedScene, animations: {...} }
    // The scene is already a cloned group, animations is the shared animation data
    this.character = gltfModels.scene;
    this.character.scale.set(1, 1, 1);

    // Enable shadows and apply color tint
    this.character.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (this.agentColor) {
          child.material = child.material.clone();
          child.material.color.multiply(this.agentColor);
        }
      }
    });

    // Setup animation mixer
    this.mixer = new THREE.AnimationMixer(this.character);

    const animKeys = ['idle', 'walk', 'run', 'dance', 'jump', 'jumpRun', 'waveHelp', 'wave', 'backflip'];
    const loopOnce = ['jump', 'jumpRun', 'waveHelp', 'wave', 'backflip'];

    animKeys.forEach((key) => {
      const clip = gltfModels.animations[key];
      if (clip) {
        const action = this.mixer.clipAction(clip);
        if (loopOnce.includes(key)) {
          action.setLoop(THREE.LoopOnce);
          action.clampWhenFinished = true;
        }
        this.animations[key] = action;
      }
    });

    this.playAnimation('idle');
    this.scene.add(this.character);
  }

  createPlaceholderCharacter() {
    this.character = new THREE.Group();

    const color = this.agentColor ? this.agentColor.getHex() : 0xff6b6b;
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.4,
      metalness: 0.1
    });

    const bodyGeometry = new THREE.CapsuleGeometry(0.4, 0.8, 8, 16);
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 1;
    body.castShadow = true;
    this.character.add(body);

    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x2d2d2d, roughness: 0.3 });
    const eyeGeometry = new THREE.SphereGeometry(0.08, 16, 16);

    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.15, 1.2, 0.35);
    this.character.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.15, 1.2, 0.35);
    this.character.add(rightEye);

    const antennaMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
    const antennaGeometry = new THREE.CapsuleGeometry(0.05, 0.3, 4, 8);
    const antenna = new THREE.Mesh(antennaGeometry, antennaMaterial);
    antenna.position.set(0, 1.7, 0);
    antenna.rotation.z = 0.3;
    this.character.add(antenna);

    this.bodyMesh = body;
    this.bobTime = 0;

    this.scene.add(this.character);
  }

  playAnimation(name, force = false) {
    const action = this.animations[name];
    if (!action) return;
    if (this.currentAnimation === action && !force) return;

    if (this.currentAnimation) {
      this.currentAnimation.fadeOut(0.2);
    }

    action.reset();
    action.fadeIn(0.2);
    action.play();

    this.currentAnimation = action;
    this.currentAnimationName = name;
  }

  /** Lock animation so update() won't override it (e.g. dance on hover) */
  lockAnimation(name) {
    this.playAnimation(name, true);
    this._animationLocked = true;
  }

  /** Unlock and return to normal update-driven animations */
  unlockAnimation() {
    this._animationLocked = false;
  }

  update(delta) {
    if (!this.character) return;

    const moveDirection = new THREE.Vector3();

    // Count down water cooler break timer while wandering
    if (this.autonomous && !this._wanderingPaused) {
      this._waterCoolerTimer -= delta;
    }

    if (this.autonomous && !this._wanderingPaused) {
      if (this.isWanderPaused) {
        this.wanderPauseTimer += delta;
        if (this.wanderPauseTimer >= this.wanderPauseDuration) {
          this.pickNewWanderTarget();
        }
      } else {
        const toTarget = this.wanderTarget.clone().sub(this.character.position);
        toTarget.y = 0;
        const dist = toTarget.length();

        if (dist < 1.0) {
          this.isWanderPaused = true;
          this.wanderPauseTimer = 0;
          this.wanderPauseDuration = 2 + Math.random() * 4;

          // Resolve walkTo() promise if pending
          if (this._walkToResolve) {
            const resolve = this._walkToResolve;
            this._walkToResolve = null;
            resolve();
          }
        } else {
          toTarget.normalize();
          moveDirection.copy(toTarget);
        }
      }
    }

    const isMoving = moveDirection.length() > 0;

    if (isMoving) {
      moveDirection.normalize();
      this.targetRotation = Math.atan2(moveDirection.x, moveDirection.z);

      // Smooth rotation
      const currentRotation = this.character.rotation.y;
      let rotationDiff = this.targetRotation - currentRotation;
      while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
      while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;
      this.character.rotation.y += rotationDiff * this.rotationSpeed * delta;

      this.character.position.x += moveDirection.x * this.moveSpeed * delta;
      this.character.position.z += moveDirection.z * this.moveSpeed * delta;

      // Boundary check
      const boundary = 25;
      this.character.position.x = Math.max(-boundary, Math.min(boundary, this.character.position.x));
      this.character.position.z = Math.max(-boundary, Math.min(boundary, this.character.position.z));

      if (this.mixer && !this._animationLocked) {
        this.playAnimation('walk');
      }
    } else {
      // Snap rotation toward target when paused (for faceToward)
      if (this._wanderingPaused) {
        const currentRotation = this.character.rotation.y;
        let rotationDiff = this.targetRotation - currentRotation;
        while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
        while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;
        this.character.rotation.y += rotationDiff * this.rotationSpeed * delta;
      }

      if (this.mixer && !this._animationLocked) {
        this.playAnimation('idle');
      }
    }

    // Bobbing for placeholder
    if (this.bodyMesh) {
      if (isMoving) {
        this.bobTime += delta * 12;
        this.bodyMesh.position.y = 1 + Math.abs(Math.sin(this.bobTime)) * 0.15;
      } else {
        this.bobTime += delta * 2;
        this.bodyMesh.position.y = 1 + Math.sin(this.bobTime) * 0.05;
      }
    }

    if (this.mixer) {
      this.mixer.update(delta);
    }
  }
}

// Set by main.js after loading the water cooler model
CharacterController.waterCoolerPosition = null;
