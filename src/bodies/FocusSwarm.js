/**
 * FocusSwarm — Fase 2: enxame de partículas simulado na GPU
 * (GPUComputationRenderer) que SUBSTITUI a esfera estática de um planeta
 * enquanto ele está em FOCUS. As partículas partem da casca da esfera
 * (posição de "casa") e ganham vida:
 *   - mola para casa → mantém a forma;
 *   - curl-noise tangencial → turbilhão sobre a superfície;
 *   - repulsão do mouse → o cursor "afasta" as partículas, que se reagrupam.
 *
 * A simulação roda em espaço LOCAL da esfera (centro na origem); o `object3d`
 * é adicionado ao Group do planeta (herda a transformação orbital), então o
 * ponto do mouse é convertido para esse espaço local por quem chama.
 */

import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { fibonacciSphere } from '../util/fibonacciSphere.js';
import positionFrag from '../shaders/swarm-position.frag?raw';
import velocityFrag from '../shaders/swarm-velocity.frag?raw';
import renderVert from '../shaders/swarm-render.vert?raw';
import renderFrag from '../shaders/swarm-render.frag?raw';

// Parâmetros de simulação (ajustáveis). Escalados pelo raio em build().
const SIM = Object.freeze({
  spring: 6.0, // força da mola p/ casa (coesão da esfera)
  flow: 2.2, // intensidade do turbilhão (curl)
  noiseScale: 0.18, // escala espacial do ruído (relativo ao raio)
  flowSpeed: 0.5, // evolução temporal do turbilhão
  mouseStrength: 55.0, // intensidade da repulsão do mouse
  damping: 0.9, // atrito (0..1)
});

export class FocusSwarm {
  /**
   * @param {object} options
   * @param {THREE.WebGLRenderer} options.renderer - renderer (necessário ao GPGPU)
   * @param {number} options.radius - raio da esfera
   * @param {number} options.count - nº aproximado de partículas
   * @param {number|THREE.Color|string} options.color - cor base
   * @param {number} [options.size=2.4] - tamanho base dos pontos
   * @param {number} [options.brightness=1.0]
   * @param {() => number} [options.rng=Math.random]
   */
  constructor({ renderer, radius, count, color, size = 2.4, brightness = 1.0, rng = Math.random } = {}) {
    this._renderer = renderer;
    this._radius = radius;
    this._color = new THREE.Color(color);
    this._size = size;
    this._brightness = brightness;
    this._rng = rng;

    // Dimensão da textura GPGPU: menor quadrado que comporta `count`.
    this._texSize = Math.max(2, Math.ceil(Math.sqrt(count)));
    this._total = this._texSize * this._texSize;

    this._gpu = null;
    this._posVar = null;
    this._velVar = null;
    this._points = null;
    this._material = null;

    this._mouseActive = 0;
    this._mouse = new THREE.Vector3();
  }

  /** @returns {THREE.Points} objeto adicionável ao Group do planeta */
  get object3d() {
    return this._points;
  }

  /**
   * Constrói o solver GPGPU e a malha de render.
   * @returns {void}
   */
  build() {
    const tex = this._texSize;
    const gpu = new GPUComputationRenderer(tex, tex, this._renderer);

    // Posições de repouso (casa) na casca da esfera.
    const home = fibonacciSphere(this._total, {
      radius: this._radius,
      jitter: 0.04,
      rng: this._rng,
    });

    const posTex = gpu.createTexture();
    const velTex = gpu.createTexture();
    const homeTex = gpu.createTexture();
    const pa = posTex.image.data;
    const va = velTex.image.data;
    const ha = homeTex.image.data;
    for (let i = 0; i < this._total; i++) {
      const i4 = i * 4;
      const i3 = i * 3;
      pa[i4] = home[i3]; pa[i4 + 1] = home[i3 + 1]; pa[i4 + 2] = home[i3 + 2]; pa[i4 + 3] = 1;
      ha[i4] = home[i3]; ha[i4 + 1] = home[i3 + 1]; ha[i4 + 2] = home[i3 + 2]; ha[i4 + 3] = 1;
      va[i4] = 0; va[i4 + 1] = 0; va[i4 + 2] = 0; va[i4 + 3] = 1;
    }

    const posVar = gpu.addVariable('texturePosition', positionFrag, posTex);
    const velVar = gpu.addVariable('textureVelocity', velocityFrag, velTex);
    gpu.setVariableDependencies(posVar, [posVar, velVar]);
    gpu.setVariableDependencies(velVar, [posVar, velVar]);

    posVar.material.uniforms.uDelta = { value: 0 };

    velVar.material.uniforms.uTime = { value: 0 };
    velVar.material.uniforms.uDelta = { value: 0 };
    velVar.material.uniforms.uMouse = { value: new THREE.Vector3() };
    velVar.material.uniforms.uMouseActive = { value: 0 };
    velVar.material.uniforms.uRadius = { value: this._radius };
    velVar.material.uniforms.uSpring = { value: SIM.spring };
    velVar.material.uniforms.uFlow = { value: SIM.flow * this._radius };
    velVar.material.uniforms.uNoiseScale = { value: SIM.noiseScale / this._radius };
    velVar.material.uniforms.uFlowSpeed = { value: SIM.flowSpeed };
    velVar.material.uniforms.uMouseStrength = { value: SIM.mouseStrength };
    velVar.material.uniforms.uMouseRadius = { value: this._radius * 1.3 };
    velVar.material.uniforms.uDamping = { value: SIM.damping };
    velVar.material.uniforms.uHome = { value: homeTex };

    const err = gpu.init();
    if (err !== null) {
      // Falha (ex.: sem suporte a float textures) — sinaliza para o chamador
      // cair de volta na esfera estática.
      throw new Error('GPUComputationRenderer: ' + err);
    }

    this._gpu = gpu;
    this._posVar = posVar;
    this._velVar = velVar;

    // Geometria de render: um vértice por partícula, com `reference` (uv na
    // textura), cor, escala e semente. `position` é dummy (a real vem da textura).
    const positions = new Float32Array(this._total * 3);
    const references = new Float32Array(this._total * 2);
    const colors = new Float32Array(this._total * 3);
    const scales = new Float32Array(this._total);
    const seeds = new Float32Array(this._total);
    for (let i = 0; i < this._total; i++) {
      const x = (i % tex) / tex;
      const y = Math.floor(i / tex) / tex;
      references[i * 2] = x;
      references[i * 2 + 1] = y;
      const v = 0.82 + this._rng() * 0.3;
      colors[i * 3] = this._color.r * v;
      colors[i * 3 + 1] = this._color.g * v;
      colors[i * 3 + 2] = this._color.b * v;
      scales[i] = 0.8 + this._rng() * 0.4;
      seeds[i] = this._rng();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('reference', new THREE.BufferAttribute(references, 2));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    this._material = new THREE.ShaderMaterial({
      vertexShader: renderVert,
      fragmentShader: renderFrag,
      uniforms: {
        uPositionTexture: { value: null },
        uTime: { value: 0 },
        uSize: { value: this._size },
        uPixelRatio: {
          value: typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1,
        },
        uBrightness: { value: this._brightness },
      },
      transparent: false,
      depthWrite: true,
      depthTest: true,
      alphaTest: 0.45,
    });

    this._points = new THREE.Points(geometry, this._material);
    this._points.frustumCulled = false;
  }

  /**
   * Define o ponto de influência do mouse (espaço LOCAL da esfera) ou null.
   * @param {THREE.Vector3|null} localPoint
   * @returns {void}
   */
  setMouse(localPoint) {
    if (localPoint) {
      this._mouse.copy(localPoint);
      this._mouseActive = 1;
    } else {
      this._mouseActive = 0;
    }
  }

  /**
   * Avança a simulação e atualiza a textura de posição do render.
   * @param {number} dt - delta time (s), limitado para estabilidade
   * @param {number} elapsed - tempo total (s)
   * @returns {void}
   */
  update(dt, elapsed) {
    if (!this._gpu) return;
    const d = Math.min(dt, 1 / 30); // clamp p/ estabilidade do integrador

    this._posVar.material.uniforms.uDelta.value = d;
    const vu = this._velVar.material.uniforms;
    vu.uTime.value = elapsed;
    vu.uDelta.value = d;
    vu.uMouse.value.copy(this._mouse);
    vu.uMouseActive.value = this._mouseActive;

    this._gpu.compute();

    this._material.uniforms.uPositionTexture.value =
      this._gpu.getCurrentRenderTarget(this._posVar).texture;
    this._material.uniforms.uTime.value = elapsed;
  }

  /**
   * Libera recursos de GPU.
   * @returns {void}
   */
  dispose() {
    if (this._gpu) this._gpu.dispose();
    if (this._points && this._points.geometry) this._points.geometry.dispose();
    if (this._material) this._material.dispose();
    this._gpu = null;
    this._points = null;
    this._material = null;
  }
}
