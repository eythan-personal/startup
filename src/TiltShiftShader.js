import * as THREE from 'three';

export const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null },
    focusPos: { value: 0.5 },      // Vertical position of focus (0-1)
    amount: { value: 0.005 },      // Blur amount
    horizontal: { value: true }    // Blur direction
  },

  vertexShader: `
    varying vec2 vUv;
    
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float focusPos;
    uniform float amount;
    uniform bool horizontal;
    
    varying vec2 vUv;
    
    void main() {
      vec4 color = vec4(0.0);
      
      // Calculate distance from focus line
      float dist = abs(vUv.y - focusPos);
      
      // Smooth falloff for blur intensity
      float blur = smoothstep(0.0, 0.4, dist) * amount;
      
      // Direction of blur
      vec2 dir = horizontal ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      
      // 9-tap gaussian blur
      float weights[9];
      weights[0] = 0.0162162162;
      weights[1] = 0.0540540541;
      weights[2] = 0.1216216216;
      weights[3] = 0.1945945946;
      weights[4] = 0.2270270270;
      weights[5] = 0.1945945946;
      weights[6] = 0.1216216216;
      weights[7] = 0.0540540541;
      weights[8] = 0.0162162162;
      
      float offsets[9];
      offsets[0] = -4.0;
      offsets[1] = -3.0;
      offsets[2] = -2.0;
      offsets[3] = -1.0;
      offsets[4] = 0.0;
      offsets[5] = 1.0;
      offsets[6] = 2.0;
      offsets[7] = 3.0;
      offsets[8] = 4.0;
      
      for (int i = 0; i < 9; i++) {
        vec2 offset = dir * offsets[i] * blur;
        color += texture2D(tDiffuse, vUv + offset) * weights[i];
      }
      
      gl_FragColor = color;
    }
  `
};
