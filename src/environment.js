import * as THREE from 'three';

export function createEnvironment(scene) {
  // Set a visible background color
  scene.background = new THREE.Color(0x252535);
  
  // Ground plane
  const groundGeometry = new THREE.CircleGeometry(150, 64);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a3a4a,
    roughness: 0.8,
    metalness: 0.2
  });
  
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Subtle grid
  const gridHelper = new THREE.GridHelper(100, 40, 0x4a4a5a, 0x4a4a5a);
  gridHelper.position.y = 0.01;
  gridHelper.material.opacity = 0.3;
  gridHelper.material.transparent = true;
  scene.add(gridHelper);

  // Strong ambient light so we can see
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  // Main directional light
  const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
  mainLight.position.set(10, 30, 20);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.width = 2048;
  mainLight.shadow.mapSize.height = 2048;
  mainLight.shadow.camera.near = 0.5;
  mainLight.shadow.camera.far = 150;
  mainLight.shadow.camera.left = -50;
  mainLight.shadow.camera.right = 50;
  mainLight.shadow.camera.top = 50;
  mainLight.shadow.camera.bottom = -50;
  mainLight.shadow.bias = -0.0005;
  scene.add(mainLight);

  // Fill light
  const fillLight = new THREE.DirectionalLight(0x8888ff, 0.5);
  fillLight.position.set(-20, 15, -10);
  scene.add(fillLight);

  // Hemisphere light
  const hemiLight = new THREE.HemisphereLight(0x606080, 0x404050, 0.5);
  scene.add(hemiLight);
}
