/**
 * Hud — HUD sobreposto (spec seção 8) no estilo "Console de Comando":
 *   - cabeçalho (canto superior esquerdo): título + chips de leitura
 *     (modo, velocidade, PAUSADO);
 *   - console inferior centralizado: [Pausar] [Reiniciar] | velocidade
 *     [−] presets… [+] | [Visão geral];
 *   - legenda de teclas (canto inferior direito), no lugar da dica corrida.
 * Atalhos: ESPAÇO pausa, R reinicia, +/− velocidade. UI em PT-BR.
 * Lê/escreve o AppState (speedMultiplier, paused).
 *
 * Constrói o DOM via JS e casa com as classes de `styles.css` (.hud-header,
 * .console, .console__*, .legend).
 */

import { AppState } from '../core/AppState.js';

/**
 * @callback ResetCallback
 * @returns {void}
 */

/**
 * @callback OverviewCallback
 * @returns {void}
 */

/**
 * Presets de velocidade orbital (multiplicador). O "1×" é o padrão do AppState.
 * @type {number[]}
 */
const SPEED_PRESETS = [0.25, 0.5, 1, 2, 4, 8];

/** Limites para os botões +/− (evita valores absurdos). */
const SPEED_MIN = 0.1;
const SPEED_MAX = 16;
/** Fator multiplicativo aplicado pelos botões +/−. */
const SPEED_STEP = 2;

/** Tempo (ms) que a legenda de controles fica em destaque no primeiro load. */
const HINT_DURATION_MS = 6000;

/** Ícones inline (stroke SVG) usados pelos botões do console. */
const ICONS = {
  pause:
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="0.5"/><rect x="9.5" y="2" width="3.5" height="12" rx="0.5"/></svg>',
  play:
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg>',
  reset:
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/><path d="M13.5 2v3.5H10"/></svg>',
};

/** Legenda de teclas/gestos (tecla → ação). */
const LEGEND = [
  ['Clique', 'focar'],
  ['Arraste', 'orbitar'],
  ['Scroll', 'zoom'],
  ['Espaço', 'pausar'],
  ['R', 'reiniciar'],
  ['Esc', 'sair do foco'],
];

export class Hud {
  /**
   * @param {object} options
   * @param {HTMLElement} options.root - contêiner da UI (#ui-root)
   * @param {AppState} options.appState
   */
  constructor({ root, appState } = {}) {
    /** @type {HTMLElement} */
    this.root = root;
    /** @type {AppState} */
    this.appState = appState;
    /** @type {HTMLElement|null} cabeçalho */
    this.el = null;
    /** @type {HTMLElement|null} console inferior */
    this._consoleEl = null;
    /** @type {HTMLElement|null} legenda de teclas */
    this._legendEl = null;
    /** @type {Set<ResetCallback>} */
    this._resetCallbacks = new Set();
    /** @type {Set<OverviewCallback>} */
    this._overviewCallbacks = new Set();

    // Elementos internos.
    /** @type {HTMLElement|null} */
    this._speedChip = null;
    /** @type {HTMLElement|null} */
    this._pausedChip = null;
    /** @type {HTMLElement|null} */
    this._speedReadout = null;
    /** @type {HTMLButtonElement|null} */
    this._pauseBtn = null;
    /** @type {Map<number, HTMLButtonElement>} */
    this._presetBtns = new Map();

    // Handlers guardados para remoção no dispose.
    /** @type {((e: KeyboardEvent) => void)|null} */
    this._onKeyDown = null;
    /** @type {(() => void)|null} */
    this._unsubscribe = null;
    /** @type {ReturnType<typeof setTimeout>|null} */
    this._hintTimer = null;
  }

  /**
   * Cria os elementos DOM do HUD, insere na raiz e liga os atalhos de teclado.
   * @returns {void}
   */
  mount() {
    if (this.el) return; // idempotente

    this.el = this._buildHeader();
    this._consoleEl = this._buildConsole();
    this._legendEl = this._buildLegend();

    this.root.appendChild(this.el);
    this.root.appendChild(this._consoleEl);
    this.root.appendChild(this._legendEl);

    // Atalhos de teclado (ESPAÇO = pausa, R = reset, +/- = velocidade).
    this._onKeyDown = (e) => this._handleKeyDown(e);
    window.addEventListener('keydown', this._onKeyDown);

    // Mantém o HUD sincronizado quando o estado muda por qualquer via.
    this._unsubscribe = this.appState.subscribe((_value, key) => {
      if (key === 'speedMultiplier' || key === 'paused') this.refresh();
    });

    this.refresh();
  }

  /**
   * Cabeçalho: título + chips de leitura.
   * @private
   * @returns {HTMLElement}
   */
  _buildHeader() {
    const header = document.createElement('header');
    header.className = 'hud-header';

    const titleRow = document.createElement('div');
    titleRow.className = 'hud-header__title-row';
    const dot = document.createElement('span');
    dot.className = 'hud-header__dot';
    const title = document.createElement('h1');
    title.className = 'hud-header__title';
    title.textContent = 'Sistema Solar';
    titleRow.appendChild(dot);
    titleRow.appendChild(title);

    const chips = document.createElement('div');
    chips.className = 'hud-header__chips';
    chips.setAttribute('aria-live', 'polite');

    const modeChip = document.createElement('span');
    modeChip.className = 'chip chip--accent';
    modeChip.textContent = 'MODO · EXPLORAÇÃO';

    this._speedChip = document.createElement('span');
    this._speedChip.className = 'chip';

    this._pausedChip = document.createElement('span');
    this._pausedChip.className = 'chip chip--warn';
    this._pausedChip.textContent = 'PAUSADO';
    this._pausedChip.hidden = true;

    chips.appendChild(modeChip);
    chips.appendChild(this._speedChip);
    chips.appendChild(this._pausedChip);

    header.appendChild(titleRow);
    header.appendChild(chips);
    return header;
  }

  /**
   * Console inferior: pausa/reset | velocidade | visão geral.
   * @private
   * @returns {HTMLElement}
   */
  _buildConsole() {
    const bar = document.createElement('div');
    bar.className = 'console';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Controles de simulação');

    // Grupo 1: pausa (primário) + reset.
    const simGroup = document.createElement('div');
    simGroup.className = 'console__group';
    this._pauseBtn = this._makeIconButton(ICONS.pause, 'Pausar/retomar (Espaço)', () =>
      this._togglePause()
    );
    this._pauseBtn.classList.add('console__btn--primary', 'console__btn--lg');
    simGroup.appendChild(this._pauseBtn);
    simGroup.appendChild(
      this._makeIconButton(ICONS.reset, 'Reiniciar (R)', () => this._emitReset())
    );

    // Grupo 2: velocidade — rótulo + [−] presets [+].
    const speedGroup = document.createElement('div');
    speedGroup.className = 'console__speed';

    const speedHead = document.createElement('div');
    speedHead.className = 'console__speed-head';
    const speedLabel = document.createElement('span');
    speedLabel.textContent = 'VELOCIDADE DA SIMULAÇÃO';
    this._speedReadout = document.createElement('span');
    this._speedReadout.className = 'console__speed-readout';
    speedHead.appendChild(speedLabel);
    speedHead.appendChild(this._speedReadout);

    const speedRow = document.createElement('div');
    speedRow.className = 'console__group';

    const minusBtn = this._makeTextButton('−', 'Diminuir velocidade', () =>
      this._nudgeSpeed(1 / SPEED_STEP)
    );
    minusBtn.classList.add('console__btn--sm');

    const presets = document.createElement('div');
    presets.className = 'console__presets';
    presets.setAttribute('role', 'group');
    presets.setAttribute('aria-label', 'Presets de velocidade');
    for (const preset of SPEED_PRESETS) {
      const label = this._formatSpeed(preset);
      const btn = this._makeTextButton(label, `Velocidade ${label}`, () =>
        this.appState.set('speedMultiplier', preset)
      );
      btn.className = 'console__preset';
      this._presetBtns.set(preset, btn);
      presets.appendChild(btn);
    }

    const plusBtn = this._makeTextButton('+', 'Aumentar velocidade', () =>
      this._nudgeSpeed(SPEED_STEP)
    );
    plusBtn.classList.add('console__btn--sm');

    speedRow.appendChild(minusBtn);
    speedRow.appendChild(presets);
    speedRow.appendChild(plusBtn);
    speedGroup.appendChild(speedHead);
    speedGroup.appendChild(speedRow);

    // Grupo 3: câmera.
    const camGroup = document.createElement('div');
    camGroup.className = 'console__group';
    const overviewBtn = this._makeTextButton('VISÃO GERAL', 'Voltar à visão geral (Esc)', () =>
      this._emitOverview()
    );
    overviewBtn.classList.add('console__btn--label');
    camGroup.appendChild(overviewBtn);

    bar.appendChild(simGroup);
    bar.appendChild(this._makeDivider());
    bar.appendChild(speedGroup);
    bar.appendChild(this._makeDivider());
    bar.appendChild(camGroup);
    return bar;
  }

  /**
   * Legenda de teclas/gestos (canto inferior direito).
   * @private
   * @returns {HTMLElement}
   */
  _buildLegend() {
    const legend = document.createElement('div');
    legend.className = 'legend';
    for (const [key, action] of LEGEND) {
      const item = document.createElement('span');
      item.className = 'legend__item';
      const kbd = document.createElement('kbd');
      kbd.textContent = key;
      item.appendChild(kbd);
      item.appendChild(document.createTextNode(action));
      legend.appendChild(item);
    }
    return legend;
  }

  /** @private @returns {HTMLElement} */
  _makeDivider() {
    const d = document.createElement('div');
    d.className = 'console__divider';
    return d;
  }

  /**
   * Cria um botão do console com texto.
   * @private
   * @param {string} label
   * @param {string} ariaLabel
   * @param {() => void} onClick
   * @returns {HTMLButtonElement}
   */
  _makeTextButton(label, ariaLabel, onClick) {
    const btn = document.createElement('button');
    btn.className = 'console__btn';
    btn.type = 'button';
    btn.textContent = label;
    btn.setAttribute('aria-label', ariaLabel);
    btn.addEventListener('click', onClick);
    return btn;
  }

  /**
   * Cria um botão do console com ícone SVG (markup estático de ICONS).
   * @private
   * @param {string} svg
   * @param {string} ariaLabel
   * @param {() => void} onClick
   * @returns {HTMLButtonElement}
   */
  _makeIconButton(svg, ariaLabel, onClick) {
    const btn = document.createElement('button');
    btn.className = 'console__btn';
    btn.type = 'button';
    btn.innerHTML = svg; // conteúdo constante e confiável (ICONS)
    btn.setAttribute('aria-label', ariaLabel);
    btn.addEventListener('click', onClick);
    return btn;
  }

  /**
   * Multiplica a velocidade atual, presa aos limites. Usada pelos botões +/−.
   * @private
   * @param {number} factor
   */
  _nudgeSpeed(factor) {
    const current = this.appState.get('speedMultiplier');
    const next = Math.min(SPEED_MAX, Math.max(SPEED_MIN, current * factor));
    // Arredonda para evitar acúmulo de imprecisão de ponto flutuante.
    this.appState.set('speedMultiplier', Math.round(next * 1000) / 1000);
  }

  /**
   * Alterna o estado de pausa.
   * @private
   */
  _togglePause() {
    this.appState.set('paused', !this.appState.get('paused'));
  }

  /**
   * Formata um multiplicador de velocidade para exibição (ex.: "0.5×", "2×").
   * @private
   * @param {number} value
   * @returns {string}
   */
  _formatSpeed(value) {
    // String(value) já produz a forma enxuta desejada: 1 -> "1", 0.25 -> "0.25".
    return `${String(value)}×`;
  }

  /**
   * Trata os atalhos de teclado globais do HUD.
   * @private
   * @param {KeyboardEvent} e
   */
  _handleKeyDown(e) {
    // Ignora quando o usuário está digitando em um campo editável.
    const target = /** @type {HTMLElement} */ (e.target);
    if (
      target &&
      (target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT')
    ) {
      return;
    }

    switch (e.code) {
      case 'Space':
        e.preventDefault(); // evita rolagem/ativação de botão focado
        this._togglePause();
        break;
      case 'KeyR':
        this._emitReset();
        break;
      case 'Equal': // '=' / '+'
      case 'NumpadAdd':
        this._nudgeSpeed(SPEED_STEP);
        break;
      case 'Minus': // '-'
      case 'NumpadSubtract':
        this._nudgeSpeed(1 / SPEED_STEP);
        break;
      default:
        break;
    }
  }

  /**
   * Atualiza chips/leituras a partir do AppState e destaca o preset ativo.
   * @returns {void}
   */
  refresh() {
    if (!this.el) return;

    const speed = this.appState.get('speedMultiplier');
    const paused = this.appState.get('paused');
    const speedTxt = this._formatSpeed(speed);

    if (this._speedChip) this._speedChip.textContent = `VEL ${speedTxt}`;
    if (this._pausedChip) this._pausedChip.hidden = !paused;
    if (this._speedReadout) this._speedReadout.textContent = speedTxt;

    // Ícone/estado do botão de pausa.
    if (this._pauseBtn) {
      this._pauseBtn.innerHTML = paused ? ICONS.play : ICONS.pause;
      this._pauseBtn.setAttribute('aria-label', paused ? 'Retomar (Espaço)' : 'Pausar (Espaço)');
      this._pauseBtn.setAttribute('aria-pressed', String(paused));
    }

    // Destaca o preset ativo (classe --active; combina com valores aproximados).
    for (const [preset, btn] of this._presetBtns) {
      const active = Math.abs(preset - speed) < 1e-6;
      btn.classList.toggle('console__preset--active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
  }

  /**
   * Destaca a legenda de controles no primeiro load; volta ao discreto
   * após alguns segundos.
   * @returns {void}
   */
  showHint() {
    if (!this._legendEl) return;
    if (this._hintTimer) clearTimeout(this._hintTimer);
    this._legendEl.classList.add('legend--highlight');
    this._hintTimer = setTimeout(() => {
      if (this._legendEl) this._legendEl.classList.remove('legend--highlight');
      this._hintTimer = null;
    }, HINT_DURATION_MS);
  }

  /**
   * Registra callback para o botão/atalho de reset (R).
   * Retorna função de remoção.
   * @param {ResetCallback} callback
   * @returns {() => void}
   */
  onReset(callback) {
    this._resetCallbacks.add(callback);
    return () => {
      this._resetCallbacks.delete(callback);
    };
  }

  /**
   * Registra callback para o botão "Visão geral" (sair do foco).
   * Retorna função de remoção.
   * @param {OverviewCallback} callback
   * @returns {() => void}
   */
  onOverview(callback) {
    this._overviewCallbacks.add(callback);
    return () => {
      this._overviewCallbacks.delete(callback);
    };
  }

  /** @private */
  _emitReset() {
    for (const cb of this._resetCallbacks) cb();
  }

  /** @private */
  _emitOverview() {
    for (const cb of this._overviewCallbacks) cb();
  }

  /**
   * Remove o HUD do DOM e limpa listeners.
   * @returns {void}
   */
  dispose() {
    if (this._onKeyDown) {
      window.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    if (this._hintTimer) {
      clearTimeout(this._hintTimer);
      this._hintTimer = null;
    }
    this._resetCallbacks.clear();
    this._overviewCallbacks.clear();
    this._presetBtns.clear();

    for (const el of [this.el, this._consoleEl, this._legendEl]) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }
    this.el = null;
    this._consoleEl = null;
    this._legendEl = null;
    this._speedChip = null;
    this._pausedChip = null;
    this._speedReadout = null;
    this._pauseBtn = null;
  }
}
