/**
 * Sun — o Sol: um `ParticleSphere` denso, quente, com blending aditivo forte
 * que alimenta o bloom (spec seções 4 e 7). Fica no centro (sem órbita).
 *
 * COMPOSIÇÃO: Sun CONTÉM um ParticleSphere.
 */

import * as THREE from 'three';
import { ParticleSphere, LOD } from './ParticleSphere.js';

export class Sun {
  /**
   * @param {object} options
   * @param {typeof import('../data/planets.js').SUN} options.data - config do Sol
   * @param {number} [options.sceneScale=1] - fator global de escala da cena
   * @param {() => number} [options.rng=Math.random] - RNG injetável
   */
  constructor({ data, sceneScale = 1, rng = Math.random } = {}) {
    /** @type {typeof import('../data/planets.js').SUN} */
    this.data = data;
    /** @type {string} */
    this.id = data ? data.id : 'sun';
    /** @type {number} */
    this.sceneScale = sceneScale;
    /** @type {() => number} */
    this._rng = rng;

    /** @type {THREE.Group} */
    this.group = new THREE.Group();
    /** @type {ParticleSphere|null} */
    this.sphere = null;
    /** @type {THREE.Mesh|null} esfera de colisão invisível para picking */
    this.hitMesh = null;

    /**
     * Bounding sphere (mundo) para frustum culling por corpo (spec seção 5).
     * O Sol fica no centro; o raio é definido no build.
     * @type {THREE.Sphere}
     * @private
     */
    this._boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1);

    /** @type {boolean} visível no frame atual (frustum culling) */
    this.visible = true;
  }

  /**
   * Objeto Three.js do Sol.
   * @returns {THREE.Group}
   */
  get object3d() {
    return this.group;
  }

  /**
   * Constrói o ParticleSphere denso do Sol e a esfera de colisão.
   * @returns {void}
   */
  build() {
    const radius = (this.data ? this.data.raioRel : 8) * this.sceneScale;

    // Sol: contagem alta, cor quente, blending aditivo forte, brilho elevado
    // para saturar o bloom. Jitter maior dá uma casca "flamejante" e volumosa.
    this.sphere = new ParticleSphere({
      radius,
      count: 22000,
      color: this.data ? this.data.corBase : 0xffd45a,
      // Pontos pequenos e densos; emissivo uniforme (facing3D:false) → estrela
      // brilha igual em toda a superfície, sem "lado escuro". Brilho contido e
      // casca fina p/ o Sol ser um núcleo definido (não uma névoa que ofusca os
      // planetas internos). O halo vem do bloom, calibrado apertado.
      size: 2.2,
      jitter: 0.06,
      blending: THREE.AdditiveBlending,
      // Com o bloom forte (threshold 0) o Sol precisa de bem menos energia
      // para o halo não engolir os planetas internos.
      brightness: 0.06,
      facing3D: false,
      rng: this._rng,
    });
    this.group.add(this.sphere.object3d);

    // Esfera de colisão invisível para picking barato (spec seção 8).
    // Um pouco maior que o raio visível para facilitar o clique.
    const hitGeometry = new THREE.SphereGeometry(radius * 1.15, 16, 12);
    const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
    this.hitMesh = new THREE.Mesh(hitGeometry, hitMaterial);
    // Guarda o id para o Picker (raycast retorna o objeto atingido).
    this.hitMesh.userData.bodyId = this.id;
    this.group.add(this.hitMesh);

    // Raio de culling: engloba a casca do Sol (jitter 0.12 → ~1.12×).
    this._boundingSphere.radius = radius * 1.2;
  }

  /**
   * Define o nível de LOD do Sol (delegado ao ParticleSphere). Permite que o
   * FocusController concentre partículas no Sol ao focá-lo (spec seção 5).
   * @param {LOD[keyof LOD]} level
   * @returns {void}
   */
  setLOD(level) {
    if (this.sphere) this.sphere.setLOD(level);
  }

  /**
   * Posição de mundo do Sol (centro da cena). Espelha a API de Planet para que
   * o FocusController possa tratá-lo uniformemente.
   * @param {THREE.Vector3} [target]
   * @returns {THREE.Vector3}
   */
  getWorldPosition(target = new THREE.Vector3()) {
    return this.group.getWorldPosition(target);
  }

  /**
   * Atualiza a animação do Sol (rotação/pulsação).
   * @param {number} dt - delta time em segundos
   * @param {number} elapsed - tempo total decorrido em segundos
   * @param {THREE.Frustum} [frustum] - frustum da câmera para culling por corpo
   *   (spec seção 5). Fora de vista, o Sol não anima e fica invisível.
   * @returns {void}
   */
  update(dt, elapsed, frustum = null) {
    if (!this.sphere) return;

    // Frustum culling por corpo (spec seção 5).
    if (frustum) {
      this.visible = frustum.intersectsSphere(this._boundingSphere);
      this.group.visible = this.visible;
      if (!this.visible) return;
    } else {
      this.visible = true;
      this.group.visible = true;
    }

    // Anima o shader (respiração/fase via uTime).
    this.sphere.update(dt, elapsed);
    // Rotação lenta da nuvem de partículas para dar vida ao Sol.
    this.sphere.object3d.rotation.y += dt * 0.05;
  }

  /**
   * Libera recursos.
   * @returns {void}
   */
  dispose() {
    if (this.sphere) {
      this.sphere.dispose();
      this.sphere = null;
    }
    if (this.hitMesh) {
      if (this.hitMesh.geometry) this.hitMesh.geometry.dispose();
      if (this.hitMesh.material) this.hitMesh.material.dispose();
      this.hitMesh = null;
    }
  }
}
