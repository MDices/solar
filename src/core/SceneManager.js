/**
 * SceneManager — dono da cena, do renderer WebGL e do pós-processamento
 * (spec seção 3). Responsável por: criar `THREE.Scene`, `WebGLRenderer`,
 * `EffectComposer` com `UnrealBloomPass`, tratar resize e a perda/restauração
 * de contexto WebGL (spec seção 10).
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * Parâmetros de bloom padrão (spec seção 4). Calibrados na referência
 * (particles.casberry.in: strength 1.8, radius 0.4, threshold 0): o bloom É o
 * efeito — pontos opacos pequenos viram "faíscas" com halo neon. `threshold` 0
 * faz tudo florescer; o ACES no OutputPass segura os núcleos sem clipar.
 */
const DEFAULT_BLOOM = Object.freeze({ strength: 0.85, radius: 0.4, threshold: 0 });

/**
 * Escala de resolução do bloom. Em resolução CHEIA como a referência: os mips
 * do UnrealBloomPass partem da resolução de entrada, então renderizar a meia
 * resolução alarga o halo 2× em pixels de tela (o `radius` só pesa os mips,
 * não encolhe o kernel) — o glow vira névoa em vez de faísca.
 */
const BLOOM_RESOLUTION_SCALE = 1.0;

/**
 * Escala usada na degradação por FPS baixo (ver degradeBloom). Como o bloom é o
 * visual inteiro, NÃO o desligamos — só baixamos a resolução (~4× menos
 * fill-rate; halo um pouco mais largo, aceitável).
 */
const BLOOM_DEGRADED_SCALE = 0.5;

/** Contagem e raio do campo de estrelas de fundo (spec seção 4/8: profundidade). */
const STARFIELD_COUNT = 2500;
const STARFIELD_RADIUS = 900; // dentro do far plane da câmera (2000)

export class SceneManager {
  /**
   * @param {object} options
   * @param {HTMLElement} options.container - elemento onde o <canvas> é injetado (#app)
   * @param {boolean} [options.bloom=true] - habilita UnrealBloomPass
   * @param {object} [options.bloomParams] - { strength, radius, threshold }
   */
  constructor({ container, bloom = true, bloomParams } = {}) {
    /** @type {HTMLElement} */
    this.container = container;
    /** @type {boolean} */
    this.bloomEnabled = bloom;
    /** @type {object} */
    this.bloomParams = { ...DEFAULT_BLOOM, ...(bloomParams || {}) };

    /** @type {THREE.Scene} */
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02030a); // azul quase preto (espaço)

    /** @type {THREE.PerspectiveCamera} */
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
    this.camera.position.set(0, 40, 120);

    /** @type {THREE.WebGLRenderer|null} */
    this.renderer = null;
    /** @type {import('three/addons/postprocessing/EffectComposer.js').EffectComposer|null} */
    this.composer = null;
    /** @type {RenderPass|null} */
    this._renderPass = null;
    /** @type {UnrealBloomPass|null} */
    this._bloomPass = null;

    /** @type {THREE.Points|null} - campo de estrelas de fundo */
    this._starfield = null;

    /** @type {number} escala de resolução atual do bloom @private */
    this._bloomScale = BLOOM_RESOLUTION_SCALE;

    /** @type {boolean} - true entre webglcontextlost e webglcontextrestored */
    this._contextLost = false;

    /** @type {number|null} handle de rAF para coalescer eventos de resize @private */
    this._resizeRaf = null;

    // Handlers ligados (bound) para permitir remoção posterior em dispose().
    // Coalescemos rajadas de 'resize' (arrasto da borda da janela dispara
    // dezenas por segundo) num único resize por frame de animação, evitando
    // realocar render targets repetidamente.
    this._onResize = () => {
      if (this._resizeRaf !== null) return;
      this._resizeRaf = requestAnimationFrame(() => {
        this._resizeRaf = null;
        this.resize();
      });
    };
    this._onContextLost = (event) => this._handleContextLost(event);
    this._onContextRestored = () => this._handleContextRestored();
  }

  /**
   * Inicializa renderer, composer e listeners (resize / contexto WebGL).
   * @returns {void}
   */
  init() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // Renderer WebGL. antialias ajuda nas bordas; alpha off (fundo opaco).
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(0x02030a, 1);

    // Tone mapping fílmico (ACES): comprime os realces HDR das partículas
    // aditivas + Sol num rolloff suave em vez de clipar tudo para branco/amarelo.
    // Aplicado de fato pelo OutputPass no fim do composer (ver _buildComposer).
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // Exposição contida: com bloom forte, cores claras (Saturno, Vênus) tendem
    // ao branco; um pouco menos de exposição preserva a saturação do halo.
    this.renderer.toneMappingExposure = 0.75;

    this.container.appendChild(this.renderer.domElement);

    // Ajusta o aspect inicial da câmera.
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    // Campo de estrelas de fundo (adicionado direto à cena).
    this._starfield = this._buildStarfield();
    this.scene.add(this._starfield);

    // Pós-processamento: EffectComposer + RenderPass + UnrealBloomPass.
    this._buildComposer(width, height);

    // Listeners de resize e de contexto WebGL (spec seção 10).
    window.addEventListener('resize', this._onResize);
    const canvas = this.renderer.domElement;
    canvas.addEventListener('webglcontextlost', this._onContextLost, false);
    canvas.addEventListener('webglcontextrestored', this._onContextRestored, false);
  }

  /**
   * Adiciona um objeto (ou `object3d` de um corpo) à cena.
   * @param {THREE.Object3D} object3d
   * @returns {void}
   */
  add(object3d) {
    if (object3d) this.scene.add(object3d);
  }

  /**
   * Remove um objeto da cena.
   * @param {THREE.Object3D} object3d
   * @returns {void}
   */
  remove(object3d) {
    if (object3d) this.scene.remove(object3d);
  }

  /**
   * Renderiza um frame (via composer se bloom estiver ativo, senão renderer).
   * Não faz nada enquanto o contexto WebGL estiver perdido (spec seção 10).
   * @returns {void}
   */
  render() {
    if (this._contextLost || !this.renderer) return;

    if (this.bloomEnabled && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * Ajusta renderer/câmera/composer ao tamanho do container.
   * @param {number} [width]
   * @param {number} [height]
   * @returns {void}
   */
  resize(width, height) {
    if (!this.renderer) return;

    const w = width || this.container.clientWidth || window.innerWidth;
    const h = height || this.container.clientHeight || window.innerHeight;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);

    if (this.composer) this.composer.setSize(w, h);
    // O bloom roda em resolução reduzida (ver _buildComposer).
    if (this._bloomPass) {
      this._bloomPass.setSize(
        Math.max(1, Math.round(w * this._bloomScale)),
        Math.max(1, Math.round(h * this._bloomScale)),
      );
    }
  }

  /**
   * Degradação graciosa por FPS baixo (spec seção 10): reduz a resolução do
   * bloom em vez de desligá-lo — sem bloom os corpos perdem o glow que define
   * o visual. Idempotente.
   * @returns {void}
   */
  degradeBloom() {
    if (this._bloomScale === BLOOM_DEGRADED_SCALE) return;
    this._bloomScale = BLOOM_DEGRADED_SCALE;
    this.resize();
  }

  /**
   * Ativa/desativa o bloom (degradação graciosa de performance — spec seção 10).
   * @param {boolean} enabled
   * @returns {void}
   */
  setBloomEnabled(enabled) {
    this.bloomEnabled = !!enabled;
    // O RenderPass já mantém a cena; alternar o flag muda apenas o caminho de
    // render() (composer vs renderer direto). Nada mais a fazer aqui.
  }

  /**
   * Libera recursos e remove listeners.
   * @returns {void}
   */
  dispose() {
    window.removeEventListener('resize', this._onResize);
    if (this._resizeRaf !== null) {
      cancelAnimationFrame(this._resizeRaf);
      this._resizeRaf = null;
    }

    if (this.renderer) {
      const canvas = this.renderer.domElement;
      canvas.removeEventListener('webglcontextlost', this._onContextLost, false);
      canvas.removeEventListener('webglcontextrestored', this._onContextRestored, false);
    }

    if (this._starfield) {
      this.scene.remove(this._starfield);
      this._starfield.geometry.dispose();
      this._starfield.material.dispose();
      this._starfield = null;
    }

    if (this._bloomPass) this._bloomPass.dispose();
    if (this._outputPass) this._outputPass.dispose();
    if (this.composer) this.composer.dispose();

    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }

    this.composer = null;
    this._renderPass = null;
    this._bloomPass = null;
    this._outputPass = null;
    this.renderer = null;
  }

  // ----------------------- internos -----------------------

  /**
   * Monta o EffectComposer com RenderPass + UnrealBloomPass.
   * @private
   * @param {number} width
   * @param {number} height
   */
  _buildComposer(width, height) {
    this.composer = new EffectComposer(this.renderer);
    this.composer.setSize(width, height);

    this._renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this._renderPass);

    // Bloom em resolução reduzida (ver BLOOM_RESOLUTION_SCALE): grande economia
    // de fill-rate com perda visual desprezível.
    const bw = Math.max(1, Math.round(width * this._bloomScale));
    const bh = Math.max(1, Math.round(height * this._bloomScale));
    this._bloomPass = new UnrealBloomPass(
      new THREE.Vector2(bw, bh),
      this.bloomParams.strength,
      this.bloomParams.radius,
      this.bloomParams.threshold,
    );
    this.composer.addPass(this._bloomPass);

    // OutputPass: passe final que aplica o tone mapping (ACES, definido no
    // renderer) + conversão de espaço de cor (sRGB). Sem ele a saída do composer
    // fica em espaço linear e os realces estouram.
    this._outputPass = new OutputPass();
    this.composer.addPass(this._outputPass);
  }

  /**
   * Constrói o campo de estrelas de fundo como um THREE.Points estático,
   * distribuído numa casca esférica ampla ao redor da cena.
   * @private
   * @returns {THREE.Points}
   */
  _buildStarfield() {
    const positions = new Float32Array(STARFIELD_COUNT * 3);
    const colors = new Float32Array(STARFIELD_COUNT * 3);

    const color = new THREE.Color();
    for (let i = 0; i < STARFIELD_COUNT; i++) {
      // Distribuição uniforme numa casca esférica (amostragem por direção).
      const u = Math.random() * 2 - 1; // cos(theta)
      const phi = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      // Raio com leve variação para dar profundidade ao campo estelar.
      const r = STARFIELD_RADIUS * (0.85 + Math.random() * 0.15);

      positions[i * 3] = r * s * Math.cos(phi);
      positions[i * 3 + 1] = r * u;
      positions[i * 3 + 2] = r * s * Math.sin(phi);

      // Estrelas majoritariamente brancas/azuladas, brilho variado. Contidas:
      // com bloom threshold 0 elas também florescem, e não podem competir
      // com os corpos.
      const b = 0.3 + Math.random() * 0.35;
      color.setRGB(b, b, b + Math.random() * 0.1);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 1.5,
      sizeAttenuation: false, // tamanho em pixels: estrelas distantes não somem
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });

    const stars = new THREE.Points(geometry, material);
    stars.frustumCulled = false;
    stars.renderOrder = -1; // desenha antes de tudo (fundo)
    return stars;
  }

  /**
   * Trata a perda de contexto WebGL: previne o default (permite restauração)
   * e marca o estado como perdido para pausar o render (spec seção 10).
   * @private
   * @param {Event} event
   */
  _handleContextLost(event) {
    event.preventDefault();
    this._contextLost = true;
    // eslint-disable-next-line no-console
    console.warn('[SceneManager] Contexto WebGL perdido — render pausado até restauração.');
  }

  /**
   * Trata a restauração de contexto WebGL: reconstrói o composer (cujos
   * render targets foram invalidados) e retoma o render (spec seção 10).
   * @private
   */
  _handleContextRestored() {
    // eslint-disable-next-line no-console
    console.warn('[SceneManager] Contexto WebGL restaurado — reinicializando composer.');

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // Reseta o estado interno do renderer após a restauração do contexto. O
    // three.js reenvia geometrias/atributos/texturas sob demanda no próximo
    // render (via WebGLObjects), mas o estado de GL em cache precisa ser
    // invalidado para não referenciar recursos do contexto perdido.
    if (this.renderer && typeof this.renderer.resetState === 'function') {
      this.renderer.resetState();
    }
    // Reaplica pixelRatio/size (a restauração pode ter zerado os buffers).
    if (this.renderer) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(width, height);
    }

    // Descarta o composer antigo (render targets perdidos) e reconstrói.
    if (this._bloomPass) this._bloomPass.dispose();
    if (this._outputPass) this._outputPass.dispose();
    if (this.composer) this.composer.dispose();
    this._buildComposer(width, height);

    this._contextLost = false;
  }
}
