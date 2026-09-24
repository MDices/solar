/**
 * InfoCard — painel "Console de Comando" com os dados do corpo focado (spec
 * seção 8): cabeçalho CORPO EM FOCO, avatar na cor do corpo, nome, etiqueta de
 * tipo, fato, grade de dados 2×2 e navegação anterior/próximo entre corpos.
 * Aparece no foco e some ao sair. UI em PT-BR.
 *
 * Constrói o DOM via JS e casa com as classes de `styles.css` (.infocard e
 * .infocard__*; modificador .infocard--visible).
 */

import { PLANETS, SUN } from '../data/planets.js';

/**
 * @callback CloseCallback
 * @returns {void}
 */

/**
 * @callback NavigateCallback
 * @param {string} bodyId - id do corpo a focar
 * @returns {void}
 */

/** Ordem de navegação: Sol e planetas de dentro para fora (circular). */
const BODY_ORDER = [SUN, ...PLANETS];

/** Ícones inline (stroke SVG). */
const ICONS = {
  close:
    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8"/></svg>',
  prev:
    '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M7 1L3 5l4 4"/></svg>',
  next:
    '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 1l4 4-4 4"/></svg>',
};

export class InfoCard {
  /**
   * @param {object} options
   * @param {HTMLElement} options.root - contêiner da UI (#ui-root) onde o card é montado
   */
  constructor({ root } = {}) {
    /** @type {HTMLElement} */
    this.root = root;
    /** @type {HTMLElement|null} */
    this.el = null;
    /** @type {boolean} */
    this.visible = false;
    /** @type {Set<CloseCallback>} */
    this._closeCallbacks = new Set();
    /** @type {Set<NavigateCallback>} */
    this._navigateCallbacks = new Set();

    // Referências internas para os elementos que mudam a cada `show`.
    /** @type {HTMLElement|null} */
    this._indexEl = null;
    /** @type {HTMLElement|null} */
    this._avatarEl = null;
    /** @type {HTMLElement|null} */
    this._nameEl = null;
    /** @type {HTMLElement|null} */
    this._typeEl = null;
    /** @type {HTMLElement|null} */
    this._factEl = null;
    /** @type {HTMLElement|null} */
    this._dataEl = null;
    /** @type {HTMLButtonElement|null} */
    this._prevBtn = null;
    /** @type {HTMLButtonElement|null} */
    this._nextBtn = null;
    /** @type {HTMLButtonElement|null} */
    this._closeBtn = null;
    /** @type {string|null} id do corpo exibido */
    this._currentId = null;
  }

  /**
   * Cria o elemento DOM do card (escondido) e o insere na raiz da UI.
   * @returns {void}
   */
  mount() {
    if (this.el) return; // idempotente

    const card = document.createElement('aside');
    card.className = 'infocard';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Informações do corpo celeste');
    // Escondido do leitor de tela e do foco enquanto invisível.
    card.setAttribute('aria-hidden', 'true');

    // Cantos em colchete (decorativos).
    for (const pos of ['tl', 'tr', 'bl', 'br']) {
      const c = document.createElement('span');
      c.className = `infocard__corner infocard__corner--${pos}`;
      card.appendChild(c);
    }

    // Cabeçalho: rótulo + índice + fechar.
    const head = document.createElement('div');
    head.className = 'infocard__head';
    this._indexEl = document.createElement('span');
    this._indexEl.className = 'infocard__label';
    this._closeBtn = document.createElement('button');
    this._closeBtn.className = 'infocard__close';
    this._closeBtn.type = 'button';
    this._closeBtn.setAttribute('aria-label', 'Fechar');
    this._closeBtn.innerHTML = ICONS.close; // markup constante (ICONS)
    this._closeBtn.addEventListener('click', () => this._emitClose());
    head.appendChild(this._indexEl);
    head.appendChild(this._closeBtn);

    // Identidade: avatar + nome + tipo.
    const identity = document.createElement('div');
    identity.className = 'infocard__identity';
    this._avatarEl = document.createElement('span');
    this._avatarEl.className = 'infocard__avatar';
    const nameCol = document.createElement('div');
    nameCol.className = 'infocard__name-col';
    this._nameEl = document.createElement('h2');
    this._nameEl.className = 'infocard__name';
    this._typeEl = document.createElement('span');
    this._typeEl.className = 'infocard__type';
    nameCol.appendChild(this._nameEl);
    nameCol.appendChild(this._typeEl);
    identity.appendChild(this._avatarEl);
    identity.appendChild(nameCol);

    // Fato curto.
    this._factEl = document.createElement('p');
    this._factEl.className = 'infocard__fact';

    const rule = document.createElement('div');
    rule.className = 'infocard__rule';

    // Grade de dados (rótulo/valor em células).
    this._dataEl = document.createElement('div');
    this._dataEl.className = 'infocard__data';

    // Navegação anterior/próximo.
    const nav = document.createElement('div');
    nav.className = 'infocard__nav';
    this._prevBtn = this._makeNavButton('prev');
    this._nextBtn = this._makeNavButton('next');
    nav.appendChild(this._prevBtn);
    nav.appendChild(this._nextBtn);

    card.appendChild(head);
    card.appendChild(identity);
    card.appendChild(this._factEl);
    card.appendChild(rule);
    card.appendChild(this._dataEl);
    card.appendChild(nav);

    this.el = card;
    this.root.appendChild(card);
  }

  /**
   * Botão de navegação (anterior/próximo). O rótulo é preenchido em `show`.
   * @private
   * @param {'prev'|'next'} dir
   * @returns {HTMLButtonElement}
   */
  _makeNavButton(dir) {
    const btn = document.createElement('button');
    btn.className = `infocard__navbtn infocard__navbtn--${dir}`;
    btn.type = 'button';
    const icon = document.createElement('span');
    icon.className = 'infocard__navicon';
    icon.innerHTML = ICONS[dir]; // markup constante (ICONS)
    const label = document.createElement('span');
    label.className = 'infocard__navlabel';
    if (dir === 'prev') {
      btn.appendChild(icon);
      btn.appendChild(label);
    } else {
      btn.appendChild(label);
      btn.appendChild(icon);
    }
    btn.addEventListener('click', () => {
      const target = this._neighbor(dir === 'prev' ? -1 : 1);
      if (target) this._emitNavigate(target.id);
    });
    return btn;
  }

  /**
   * Corpo vizinho na ordem de navegação (circular).
   * @private
   * @param {number} delta - -1 anterior, +1 próximo
   * @returns {{id: string, nomePT: string}|null}
   */
  _neighbor(delta) {
    const i = BODY_ORDER.findIndex((b) => b.id === this._currentId);
    if (i < 0) return null;
    const n = BODY_ORDER.length;
    return BODY_ORDER[(i + delta + n) % n];
  }

  /**
   * Preenche e exibe o card com os dados de um corpo.
   * @param {import('../data/planets.js').PlanetData | typeof SUN} data
   * @returns {void}
   */
  show(data) {
    if (!this.el) this.mount();
    if (!data) return;

    this._currentId = data.id ?? null;

    // Índice na ordem (Sol = 00).
    const idx = BODY_ORDER.findIndex((b) => b.id === data.id);
    this._indexEl.textContent = `CORPO EM FOCO · ${idx >= 0 ? String(idx).padStart(2, '0') : '--'}`;

    // Avatar na cor do corpo.
    const color = typeof data.corBase === 'number' ? data.corBase : 0xffffff;
    const hex = `#${color.toString(16).padStart(6, '0')}`;
    this._avatarEl.style.setProperty('--body-color', hex);

    // Nome, tipo e fato (textContent: evita injeção de HTML a partir dos dados).
    this._nameEl.textContent = data.nomePT ?? '';
    const dados = data.dados ?? {};
    this._typeEl.textContent = dados['Tipo'] ?? '';
    this._factEl.textContent = data.fato ?? '';

    // Dados: reconstrói a grade (pula "Tipo", que já aparece como etiqueta).
    this._dataEl.replaceChildren();
    for (const [rotulo, valor] of Object.entries(dados)) {
      if (rotulo === 'Tipo') continue;
      const cell = document.createElement('div');
      cell.className = 'infocard__cell';
      const dt = document.createElement('span');
      dt.className = 'infocard__data-label';
      dt.textContent = rotulo;
      const dd = document.createElement('span');
      dd.className = 'infocard__data-value';
      dd.textContent = String(valor);
      cell.appendChild(dt);
      cell.appendChild(dd);
      this._dataEl.appendChild(cell);
    }

    // Navegação.
    const prev = this._neighbor(-1);
    const next = this._neighbor(1);
    this._setNavLabel(this._prevBtn, prev);
    this._setNavLabel(this._nextBtn, next);

    // Exibe (a transição de opacidade é feita pelo CSS via .infocard--visible).
    this.el.classList.add('infocard--visible');
    this.el.setAttribute('aria-hidden', 'false');
    this.visible = true;
  }

  /**
   * @private
   * @param {HTMLButtonElement} btn
   * @param {{id: string, nomePT: string}|null} body
   */
  _setNavLabel(btn, body) {
    const label = btn.querySelector('.infocard__navlabel');
    if (label) label.textContent = body ? body.nomePT.toUpperCase() : '';
    btn.disabled = !body;
    btn.setAttribute('aria-label', body ? `Focar ${body.nomePT}` : '');
  }

  /**
   * Esconde o card.
   * @returns {void}
   */
  hide() {
    if (!this.el) return;
    this.el.classList.remove('infocard--visible');
    this.el.setAttribute('aria-hidden', 'true');
    this.visible = false;
  }

  /**
   * Registra callback chamado quando o usuário fecha o card (botão X).
   * Retorna função de remoção.
   * @param {CloseCallback} callback
   * @returns {() => void}
   */
  onClose(callback) {
    this._closeCallbacks.add(callback);
    return () => {
      this._closeCallbacks.delete(callback);
    };
  }

  /**
   * Registra callback chamado quando o usuário pede o corpo anterior/próximo.
   * Retorna função de remoção.
   * @param {NavigateCallback} callback
   * @returns {() => void}
   */
  onNavigate(callback) {
    this._navigateCallbacks.add(callback);
    return () => {
      this._navigateCallbacks.delete(callback);
    };
  }

  /** @private */
  _emitClose() {
    for (const cb of this._closeCallbacks) cb();
  }

  /** @private @param {string} bodyId */
  _emitNavigate(bodyId) {
    for (const cb of this._navigateCallbacks) cb(bodyId);
  }

  /**
   * Remove o card do DOM e limpa listeners.
   * @returns {void}
   */
  dispose() {
    this._closeCallbacks.clear();
    this._navigateCallbacks.clear();

    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    this.el = null;
    this._indexEl = null;
    this._avatarEl = null;
    this._nameEl = null;
    this._typeEl = null;
    this._factEl = null;
    this._dataEl = null;
    this._prevBtn = null;
    this._nextBtn = null;
    this._closeBtn = null;
    this._currentId = null;
    this.visible = false;
  }
}
