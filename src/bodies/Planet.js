/**
 * Planet — compõe um `ParticleSphere` com órbita, dados e LOD (spec seção 3).
 * Um planeta tem: um corpo de partículas, uma `Orbit` que posiciona o corpo no
 * tempo, uma esfera de colisão invisível (para picking barato — spec seção 8),
 * e opcionalmente um anel de partículas (Saturno).
 *
 * COMPOSIÇÃO, não herança: Planet CONTÉM um ParticleSphere.
 */

import * as THREE from 'three';
import { ParticleSphere, LOD } from './ParticleSphere.js';
import { Orbit } from './Orbit.js';
import { fibonacciSphere } from '../util/fibonacciSphere.js';

// Limiares de distância câmera→planeta (em unidades de cena) para escolher o
// LOD, COM HISTERESE: usamos limiares diferentes ao entrar e sair de cada faixa
// para evitar "piscar" na fronteira (spec seção 5). Os valores são relativos ao
// raio do planeta, calculados no build.
const LOD_HYSTERESIS = 0.15; // 15% de folga entre as bordas de subida/descida

export class Planet {
  /**
   * @param {object} options
   * @param {import('../data/planets.js').PlanetData} options.data - entrada de PLANETS
   * @param {number} [options.sceneScale=1] - fator global de escala da cena
   * @param {() => number} [options.rng=Math.random] - RNG injetável
   */
  constructor({ data, sceneScale = 1, rng = Math.random } = {}) {
    /** @type {import('../data/planets.js').PlanetData} */
    this.data = data;
    /** @type {string} */
    this.id = data ? data.id : '';
    /** @type {number} */
    this.sceneScale = sceneScale;
    /** @type {() => number} */
    this._rng = rng;

    /** @type {THREE.Group} contêiner do planeta (posicionado pela órbita) */
    this.group = new THREE.Group();
    /** @type {ParticleSphere|null} */
    this.sphere = null;
    /** @type {Orbit|null} */
    this.orbit = null;
    /**
     * Esfera de colisão invisível para raycast barato (spec seção 8).
     * @type {THREE.Mesh|null}
     */
    this.hitMesh = null;

    /** @type {THREE.Points|null} anel de partículas (só Saturno) */
    this.ring = null;

    /** @type {number} raio visível do corpo (definido no build) */
    this._radius = 0;

    /**
     * Quando true, o LOD foi fixado externamente (ex.: FocusController pôs
     * FOCUS) e a lógica de distância NÃO deve sobrescrevê-lo. Zerado quando
     * alguém chama setLOD(FAR|NEAR) explicitamente para liberar o foco.
     * @type {boolean}
     */
    this._lodLocked = false;

    /** @type {THREE.Vector3} posição de mundo reutilizável (evita alocação/frame) */
    this._worldPos = new THREE.Vector3();

    /**
     * Bounding sphere em espaço de MUNDO, reusada a cada frame para o teste de
     * frustum culling por corpo (spec seção 5). O centro é atualizado com a
     * posição orbital; o raio é fixado no build.
     * @type {THREE.Sphere}
     * @private
     */
    this._boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);

    /** @type {boolean} corpo visível no frame atual (frustum culling) */
    this.visible = true;
  }

  /**
   * Objeto Three.js do planeta (o Group posicionado pela órbita).
   * @returns {THREE.Group}
   */
  get object3d() {
    return this.group;
  }

  /**
   * Constrói o ParticleSphere, a órbita e a esfera de colisão.
   * @returns {void}
   */
  build() {
    const d = this.data;
    const radius = (d ? d.raioRel : 1) * this.sceneScale;
    this._radius = radius;

    // Contagem-base (nível NEAR) proporcional ao tamanho: nuvem MUITO densa
    // (treliça geodésica como a referência). Gigantes ficam ainda mais densos.
    const baseCount = Math.round(20000 + radius * 12000);

    this.sphere = new ParticleSphere({
      radius,
      count: baseCount,
      color: d ? d.corBase : 0xffffff,
      // Pontos pequenos e nítidos → treliça densa. NormalBlending + depthWrite
      // (ver ParticleSphere): a face frontal oclui a traseira → esfera SÓLIDA
      // texturizada com a cor do planeta, não um borrão aditivo lavado. O rim
      // (fresnel) fica mais claro e o bloom o transforma no glow da borda.
      size: 2.0,
      jitter: 0.05, // casca fina p/ a esfera ler bem definida
      blending: THREE.NormalBlending,
      brightness: 1.0,
      rng: this._rng,
    });
    // Começa em FAR (vista geral do sistema) — barato.
    this.sphere.setLOD(LOD.FAR);
    this.group.add(this.sphere.object3d);

    // Órbita (elipse leve) a partir dos dados do planeta.
    this.orbit = new Orbit({
      distance: (d ? d.distanciaRel : 10) * this.sceneScale,
      eccentricity: d ? d.excentricidade : 0,
      inclination: d ? d.inclinacao : 0,
      speed: d ? d.velocidadeRel : 1,
      // Fase inicial aleatória para espalhar os planetas pela órbita.
      phase: this._rng() * Math.PI * 2,
      showTrail: true,
    });
    if (this.orbit.showTrail) {
      this.orbit.buildTrail(160);
    }

    // Esfera de colisão invisível para picking (um pouco maior que o visível).
    const hitGeometry = new THREE.SphereGeometry(radius * 1.25, 16, 12);
    const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
    this.hitMesh = new THREE.Mesh(hitGeometry, hitMaterial);
    this.hitMesh.userData.bodyId = this.id;
    this.group.add(this.hitMesh);

    // Anel de partículas achatado (só Saturno).
    if (d && d.anel) {
      this._buildRing();
    }

    // Limiares de LOD por distância, derivados do raio do corpo.
    // FOCUS é acionado externamente pelo FocusController; aqui só decidimos
    // entre FAR (longe) e NEAR (perto).
    this._farToNear = radius * 22; // aproximando: entra em NEAR
    this._nearToFar = this._farToNear * (1 + LOD_HYSTERESIS); // afastando: volta a FAR

    // Raio da bounding sphere de culling: engloba o corpo (com jitter) e, se
    // houver, o anel de Saturno (que se estende até ~2.3× o raio).
    this._boundingSphere.radius = radius * (d && d.anel ? 2.5 : 1.2);
  }

  /**
   * Constrói o anel de partículas de Saturno (disco achatado no plano XZ).
   * @private
   * @returns {void}
   */
  _buildRing() {
    const inner = this._radius * 1.4;
    const outer = this._radius * 2.3;
    const count = 6000;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const seeds = new Float32Array(count);

    const baseColor = new THREE.Color(this.data.corBase);

    for (let i = 0; i < count; i++) {
      const angle = this._rng() * Math.PI * 2;
      // Distribuição radial com leve concentração; espessura fina em Y.
      const r = inner + this._rng() * (outer - inner);
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const y = (this._rng() * 2 - 1) * this._radius * 0.04; // disco fino

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const v = 0.85 + this._rng() * 0.3;
      colors[i * 3] = baseColor.r * v;
      colors[i * 3 + 1] = baseColor.g * v;
      colors[i * 3 + 2] = baseColor.b * v;

      scales[i] = 0.5 + this._rng() * 0.7;
      seeds[i] = this._rng();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    // Reaproveita o material do corpo (mesmo shader/uniforms) para o anel
    // participar da mesma animação e do bloom.
    const material = this.sphere._material;
    this.ring = new THREE.Points(geometry, material);
    this.ring.frustumCulled = false;
    // Leve inclinação do anel para dar personalidade (como Saturno real).
    this.ring.rotation.x = THREE.MathUtils.degToRad(18);
    this.group.add(this.ring);
  }

  /**
   * Atualiza posição orbital e a animação do corpo.
   * @param {number} dt - delta time em segundos
   * @param {number} elapsed - tempo total decorrido em segundos
   * @param {number} [speedMultiplier=1] - multiplicador global de velocidade
   * @param {THREE.Vector3} [cameraPosition] - posição da câmera (mundo) para LOD
   *   por distância com histerese. Opcional: sem ela, o LOD só muda por chamadas
   *   explícitas a setLOD (ex.: FocusController).
   * @param {THREE.Frustum} [frustum] - frustum da câmera (mundo) para culling por
   *   corpo (spec seção 5). Se fornecido, corpos fora de vista não animam nem
   *   recalculam LOD e são marcados como invisíveis (.visible = false).
   * @returns {void}
   */
  update(dt, elapsed, speedMultiplier = 1, cameraPosition = null, frustum = null) {
    // A órbita SEMPRE atualiza (mesmo fora de vista): posiciona o Group, e o
    // corpo pode reentrar no frustum a qualquer momento. É barato.
    if (this.orbit) {
      // A órbita posiciona o Group inteiro (corpo + anel + colisão).
      this.orbit.update(dt, speedMultiplier, this.group.position);
    }

    // Frustum culling por corpo (spec seção 5): se o corpo está fora de vista,
    // ocultamos o Group e PULAMOS a animação do shader e o recálculo de LOD —
    // trabalho que não contribui com nenhum pixel.
    if (frustum) {
      this._boundingSphere.center.copy(this.group.position);
      this.visible = frustum.intersectsSphere(this._boundingSphere);
      this.group.visible = this.visible;
      if (!this.visible) return;
    } else {
      this.visible = true;
      this.group.visible = true;
    }

    if (this.sphere) {
      this.sphere.update(dt, elapsed);
      // Rotação própria lenta da nuvem.
      this.sphere.object3d.rotation.y += dt * 0.15;
    }

    // Seleção de LOD por distância (com histerese), se houver câmera e o LOD
    // não estiver travado em FOCUS pelo FocusController.
    if (cameraPosition && !this._lodLocked) {
      this._updateLODByDistance(cameraPosition);
    }
  }

  /**
   * Escolhe entre FAR e NEAR conforme a distância câmera→planeta, aplicando
   * histerese para evitar oscilação na fronteira.
   * @private
   * @param {THREE.Vector3} cameraPosition
   * @returns {void}
   */
  _updateLODByDistance(cameraPosition) {
    if (!this.sphere) return;
    const dist = this.getWorldPosition(this._worldPos).distanceTo(cameraPosition);
    const current = this.sphere.lod;

    if (current === LOD.FAR) {
      // Só sobe para NEAR quando cruza o limiar "de perto".
      if (dist < this._farToNear) this.sphere.setLOD(LOD.NEAR);
    } else if (current === LOD.NEAR) {
      // Só volta para FAR quando ultrapassa o limiar (maior) "de longe".
      if (dist > this._nearToFar) this.sphere.setLOD(LOD.FAR);
    }
    // Se estiver em FOCUS sem trava (defensivo), a distância não o rebaixa aqui.
  }

  /**
   * Define o nível de LOD do corpo de partículas.
   * FOCUS trava a seleção por distância; FAR/NEAR a liberam.
   * @param {LOD[keyof LOD]} level
   * @returns {void}
   */
  setLOD(level) {
    if (!this.sphere) return;
    this._lodLocked = level === LOD.FOCUS;
    this.sphere.setLOD(level);
  }

  /**
   * Mostra/esconde a esfera estática (e o anel). Usado na Fase 2: ao focar, o
   * FocusSwarm (GPGPU) assume o lugar da esfera estática; ao sair, ela volta.
   * @param {boolean} visible
   * @returns {void}
   */
  setStaticVisible(visible) {
    if (this.sphere) this.sphere.object3d.visible = visible;
    if (this.ring) this.ring.visible = visible;
  }

  /**
   * Posição atual no espaço de mundo (para foco/câmera).
   * @param {THREE.Vector3} [target] - vetor de saída opcional
   * @returns {THREE.Vector3}
   */
  getWorldPosition(target = new THREE.Vector3()) {
    return this.group.getWorldPosition(target);
  }

  /**
   * Libera recursos (partículas, órbita, colisão, anel).
   * @returns {void}
   */
  dispose() {
    if (this.sphere) {
      this.sphere.dispose();
      this.sphere = null;
    }
    if (this.orbit) {
      this.orbit.dispose();
      this.orbit = null;
    }
    if (this.ring) {
      if (this.ring.geometry) this.ring.geometry.dispose();
      // O material é compartilhado com a sphere (já disposto acima); não o
      // disposamos duas vezes.
      this.ring = null;
    }
    if (this.hitMesh) {
      if (this.hitMesh.geometry) this.hitMesh.geometry.dispose();
      if (this.hitMesh.material) this.hitMesh.material.dispose();
      this.hitMesh = null;
    }
  }
}
