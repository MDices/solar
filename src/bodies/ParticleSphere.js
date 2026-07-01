/**
 * ParticleSphere — a UNIDADE central do projeto (spec seções 3 e 4).
 *
 * Gera N partículas distribuídas numa casca esférica (via fibonacciSphere +
 * jitter radial) e as renderiza como `THREE.Points` com o shader de partícula
 * (particle.vert / particle.frag, importados como string via `?raw`).
 *
 * `Planet` e `Sun` COMPÕEM (não herdam) `ParticleSphere`, adicionando órbita,
 * dados e brilho.
 *
 * Uso:
 *   const sphere = new ParticleSphere({ radius: 2, count: 5000, color: 0xffaa33 });
 *   scene.add(sphere.object3d);
 *   // no loop:
 *   sphere.update(dt, elapsed);
 */

import * as THREE from 'three';
import { fibonacciSphere } from '../util/fibonacciSphere.js';
// Shaders importados como string (recurso nativo do Vite: sufixo `?raw`).
import vertexShader from '../shaders/particle.vert?raw';
import fragmentShader from '../shaders/particle.frag?raw';

/**
 * Níveis de LOD (nível de detalhe). Cada nível define um multiplicador de
 * contagem de partículas e de tamanho (spec seção 5). A troca de nível NÃO
 * regera a geometria: construímos uma única vez com a contagem máxima (FOCUS) e
 * apenas ajustamos o `drawRange` (quantas partículas desenhar) e o `uSize`.
 * Como a ordem fibonacci é aproximadamente uniforme, um prefixo do buffer é uma
 * casca esférica válida de menor densidade — troca O(1), sem realocação de GPU
 * e sem hitch no frame.
 * @readonly
 * @enum {string}
 */
export const LOD = Object.freeze({
  FAR: 'FAR',
  NEAR: 'NEAR',
  FOCUS: 'FOCUS',
});

// Fração da contagem-base usada em cada nível de LOD, e ajuste de tamanho.
const LOD_PROFILE = {
  [LOD.FAR]: { countFactor: 0.35, sizeFactor: 1.15 },
  [LOD.NEAR]: { countFactor: 1.0, sizeFactor: 1.0 },
  [LOD.FOCUS]: { countFactor: 1.0, sizeFactor: 0.85 },
};

export class ParticleSphere {
  /**
   * @param {object} options
   * @param {number} [options.radius=1] - raio da casca esférica
   * @param {number} [options.count=5000] - contagem-base de partículas (nível NEAR)
   * @param {number|THREE.Color|string} [options.color=0xffffff] - cor base
   * @param {number} [options.size=6] - tamanho base das partículas (px)
   * @param {number} [options.jitter=0.06] - jitter radial [0..1] (espessura da casca)
   * @param {THREE.Blending} [options.blending=THREE.AdditiveBlending] - modo de blending
   * @param {number} [options.brightness=1.0] - multiplicador de brilho (alimenta bloom)
   * @param {() => number} [options.rng=Math.random] - RNG injetável (jitter/atributos)
   */
  constructor({
    radius = 1,
    count = 5000,
    color = 0xffffff,
    size = 6,
    jitter = 0.06,
    blending = THREE.AdditiveBlending,
    brightness = 1.0,
    facing3D = true,
    rng = Math.random,
  } = {}) {
    this._radius = radius;
    this._baseCount = count;
    this._color = new THREE.Color(color);
    this._baseSize = size;
    this._jitter = jitter;
    this._blending = blending;
    this._brightness = brightness;
    this._facing3D = facing3D;
    this._rng = rng;
    this._lod = LOD.NEAR;

    /**
     * Estado do crossfade de opacidade ao trocar de LOD (spec seção 5). Ao
     * mudar de nível, mergulhamos a opacidade e a restauramos suavemente,
     * suavizando a mudança de densidade em vez de um "pop" instantâneo.
     * @private
     */
    this._fade = { active: false, t: 0, duration: 0.35, from: 1, to: 1 };
    /** @type {number} opacidade-base (alvo estável fora do crossfade) @private */
    this._baseOpacity = 1.0;

    // Estratégia de render conforme o blending:
    //  - AdditiveBlending (Sol): partículas transparentes que somam luz (glow),
    //    sem escrever profundidade — é uma nuvem emissiva.
    //  - NormalBlending (planetas): pontos OPACOS com alphaTest (recorta o
    //    círculo) e depthWrite ON → a face frontal da esfera OCLUI a traseira,
    //    formando uma esfera SÓLIDA texturizada (a "treliça" densa da referência)
    //    em vez de um borrão aditivo lavado.
    const additive = this._blending === THREE.AdditiveBlending;

    // Material compartilhado (uniforms controlam tempo/opacidade/brilho/tamanho).
    this._material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: this._baseSize },
        uPixelRatio: {
          value: typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1,
        },
        uOpacity: { value: 1.0 },
        uBrightness: { value: this._brightness },
        // 1 = sombreamento com borda brilhante (rim/fresnel) para dar volume de
        // planeta; 0 = emissivo uniforme (Sol/estrela, brilha igual em tudo).
        uShade: { value: this._facing3D ? 1.0 : 0.0 },
      },
      transparent: additive,
      depthWrite: !additive,
      depthTest: true,
      alphaTest: additive ? 0.0 : 0.45,
      blending: this._blending,
    });

    // Cache de geometrias por nível de LOD. Cada nível tem sua PRÓPRIA geometria
    // (com a contagem correta e, portanto, distribuição fibonacci uniforme — um
    // simples prefixo do buffer de contagem máxima NÃO seria uniforme, pois a
    // rede de Fibonacci ordena por altura). Construímos sob demanda e
    // CACHEAMOS: a troca de LOD passa a ser só a troca da referência de
    // geometria — sem realocação/hitch por transição (spec seção 5).
    /** @type {Object<string, THREE.BufferGeometry>} @private */
    this._geometryCache = {};

    this._geometry = this._getGeometry(this._lod);

    this._points = new THREE.Points(this._geometry, this._material);
    // Culling é gerenciado em nível de corpo (Planet/Sun testam a bounding
    // sphere contra o frustum e alternam .visible) — spec seção 5.
    this._points.frustumCulled = false;

    // Aplica o uSize do nível inicial.
    this._applyLOD(this._lod);
  }

  /**
   * Retorna (construindo e cacheando na primeira vez) a geometria de um nível.
   * @private
   * @param {string} level
   * @returns {THREE.BufferGeometry}
   */
  _getGeometry(level) {
    let geo = this._geometryCache[level];
    if (!geo) {
      geo = this._buildGeometry(this._effectiveCount(level));
      // Bounding sphere para culling por corpo (spec seção 5); inclui o jitter.
      geo.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(0, 0, 0),
        this._radius * (1 + this._jitter) * 1.05,
      );
      this._geometryCache[level] = geo;
    }
    return geo;
  }

  /**
   * Objeto Three.js adicionável à cena.
   * @returns {THREE.Points}
   */
  get object3d() {
    return this._points;
  }

  /**
   * Contagem de partículas atualmente instanciadas (geometria do LOD atual).
   * @returns {number}
   */
  get count() {
    return this._geometry ? this._geometry.getAttribute('position').count : 0;
  }

  /**
   * Bounding sphere (espaço local) usada para culling por corpo (spec seção 5).
   * @returns {THREE.Sphere|null}
   */
  get boundingSphere() {
    return this._geometry ? this._geometry.boundingSphere : null;
  }

  /**
   * Nível de LOD atual.
   * @returns {string}
   */
  get lod() {
    return this._lod;
  }

  /**
   * Avança a animação. Deve ser chamado a cada frame pelo Loop.
   * @param {number} _dt - delta time em segundos (não usado diretamente; uTime usa elapsed)
   * @param {number} elapsed - tempo total decorrido em segundos
   * @returns {void}
   */
  update(dt, elapsed) {
    this._material.uniforms.uTime.value = elapsed;

    // Avança o crossfade de opacidade em andamento (troca de LOD).
    if (this._fade.active) {
      this._fade.t += (dt > 0 ? dt : 0) / this._fade.duration;
      if (this._fade.t >= 1) {
        this._fade.t = 1;
        this._fade.active = false;
      }
      // Dip-and-restore: cai até ~40% no meio da transição e volta a 100%,
      // dando um crossfade suave entre as densidades sem "pop".
      const k = this._fade.t;
      const dip = 1 - 0.6 * Math.sin(k * Math.PI); // 1 → 0.4 → 1
      this._material.uniforms.uOpacity.value = this._baseOpacity * dip;
    }
  }

  /**
   * Troca a cor base de todas as partículas em tempo real (spec seção 4).
   * @param {number|THREE.Color|string} color
   * @returns {void}
   */
  setColor(color) {
    this._color.set(color);
    // Atualiza TODAS as geometrias já cacheadas (cada nível de LOD tem a sua),
    // para que a nova cor persista ao trocar de nível.
    for (const geo of Object.values(this._geometryCache)) {
      const colorAttr = geo.getAttribute('aColor');
      if (!colorAttr) continue;
      const arr = colorAttr.array;
      for (let i = 0; i < arr.length; i += 3) {
        // Pequena variação por partícula para riqueza visual (±8% de brilho).
        const v = 0.92 + this._rng() * 0.16;
        arr[i] = this._color.r * v;
        arr[i + 1] = this._color.g * v;
        arr[i + 2] = this._color.b * v;
      }
      colorAttr.needsUpdate = true;
    }
  }

  /**
   * Define a opacidade global (usada para crossfade entre níveis de LOD).
   * @param {number} opacity - 0..1
   * @returns {void}
   */
  setOpacity(opacity) {
    this._baseOpacity = opacity;
    // Fora de um crossfade ativo, aplica imediatamente.
    if (!this._fade.active) {
      this._material.uniforms.uOpacity.value = opacity;
    }
  }

  /**
   * Troca o nível de detalhe. Operação O(1): ajusta apenas o drawRange (quantas
   * partículas do buffer desenhar) e o tamanho (uSize). Sem realocação de
   * geometria/GPU — ao contrário de reconstruir, não gera hitch por frame nem
   * "pop" de realocação (spec seção 5).
   * @param {LOD[keyof LOD]} level - um de LOD.FAR | LOD.NEAR | LOD.FOCUS
   * @returns {void}
   */
  setLOD(level) {
    if (!LOD_PROFILE[level]) {
      throw new Error(`ParticleSphere.setLOD: nível de LOD inválido: ${level}`);
    }
    if (level === this._lod) return;
    this._lod = level;
    this._applyLOD(level);
    // Inicia o crossfade de opacidade para suavizar a mudança de densidade.
    this._fade.active = true;
    this._fade.t = 0;
  }

  /**
   * Troca a geometria cacheada do nível e ajusta o uSize. Após o warm-up (todas
   * as geometrias já construídas) é uma simples troca de referência — sem
   * realocação de GPU nem hitch.
   * @private
   * @param {string} level
   * @returns {void}
   */
  _applyLOD(level) {
    const profile = LOD_PROFILE[level] || LOD_PROFILE[LOD.NEAR];
    this._material.uniforms.uSize.value = this._baseSize * profile.sizeFactor;

    const geo = this._getGeometry(level);
    if (geo !== this._geometry) {
      this._geometry = geo;
      this._points.geometry = geo;
    }
  }

  /**
   * Libera recursos de GPU (geometria + material).
   * @returns {void}
   */
  dispose() {
    // Libera todas as geometrias cacheadas (uma por nível de LOD).
    for (const geo of Object.values(this._geometryCache)) {
      geo.dispose();
    }
    this._geometryCache = {};
    this._geometry = null;
    if (this._material) this._material.dispose();
  }

  // ----------------------- internos -----------------------

  /**
   * Contagem efetiva de partículas para um nível de LOD.
   * @private
   * @param {string} level
   * @returns {number}
   */
  _effectiveCount(level) {
    const profile = LOD_PROFILE[level] || LOD_PROFILE[LOD.NEAR];
    return Math.max(1, Math.floor(this._baseCount * profile.countFactor));
  }

  /**
   * Constrói uma BufferGeometry com position (fibonacci) + aColor/aScale/aSeed.
   * @private
   * @param {number} count
   * @returns {THREE.BufferGeometry}
   */
  _buildGeometry(count) {
    const positions = fibonacciSphere(count, {
      radius: this._radius,
      jitter: this._jitter,
      rng: this._rng,
    });

    const colors = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const seeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Variação de brilho SUTIL (0.82 .. 1.12): partículas nítidas e coesas,
      // formando a "treliça" densa da esfera (como a referência), sem virar
      // ruído fofo.
      const v = 0.82 + this._rng() * 0.3;
      colors[i * 3] = this._color.r * v;
      colors[i * 3 + 1] = this._color.g * v;
      colors[i * 3 + 2] = this._color.b * v;

      // Tamanho individual quase uniforme (0.8 .. 1.2) → pontos crisp, não blobs.
      scales[i] = 0.8 + this._rng() * 0.4;

      // Semente para animação de fase no shader.
      seeds[i] = this._rng();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    return geometry;
  }
}
