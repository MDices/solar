/**
 * Dados dos 8 planetas + configuração do Sol (spec seção 7).
 *
 * Herdado e adaptado do projeto Python legado (`legacy/constants.py` e
 * `legacy/solar_system.py`). Os campos são "relativos" e comprimidos
 * (meio-termo, não escala real) para preservar o "wow" visual.
 *
 * ORDEM DE VELOCIDADE preservada do legado (velocidade angular original):
 *   Mercúrio 0.040 > Vênus 0.015 > Terra 0.010 > Marte 0.008 >
 *   Júpiter 0.004 > Saturno 0.003 > Urano 0.002 > Netuno 0.001
 * Aqui normalizamos por Mercúrio (=1.0) para `velocidadeRel`, mantendo a
 * mesma ORDEM relativa (Mercúrio mais rápido → Netuno mais lento).
 *
 * Campos por planeta:
 *  @typedef {object} PlanetData
 *  @property {string}  id            - identificador estável (inglês, minúsculo)
 *  @property {string}  nomePT        - nome em português para a UI
 *  @property {number}  corBase       - cor base em hex (0xRRGGBB)
 *  @property {number}  raioRel       - raio relativo (unidades de cena)
 *  @property {number}  distanciaRel  - distância orbital relativa ao Sol
 *  @property {number}  velocidadeRel - velocidade orbital relativa (Mercúrio = 1.0)
 *  @property {number}  excentricidade- excentricidade da órbita (pequena, ~elíptica)
 *  @property {number}  inclinacao    - inclinação orbital em graus
 *  @property {boolean} anel          - possui anel de partículas (só Saturno)
 *  @property {string}  fato          - fato curto em PT-BR para o InfoCard
 *  @property {object}  dados         - dados básicos para o InfoCard (PT-BR)
 */

/**
 * Cores base derivadas do legado (constants.py), ajustadas para leitura em
 * partículas luminosas (tons um pouco mais saturados/quentes).
 * @type {PlanetData[]}
 */
export const PLANETS = [
  {
    id: 'mercury',
    nomePT: 'Mercúrio',
    corBase: 0xc8c8dc, // cinza claro (GRAY no legado)
    raioRel: 0.9,
    distanciaRel: 14,
    velocidadeRel: 1.0, // 0.040 / 0.040
    excentricidade: 0.08,
    inclinacao: 7.0,
    anel: false,
    fato: 'É o planeta mais próximo do Sol e o menor do Sistema Solar.',
    dados: {
      'Tipo': 'Planeta rochoso',
      'Distância do Sol': '58 milhões de km',
      'Duração do ano': '88 dias',
      'Luas': '0',
    },
  },
  {
    id: 'venus',
    nomePT: 'Vênus',
    corBase: 0xffb02e, // laranja (ORANGE)
    raioRel: 1.4,
    distanciaRel: 20,
    velocidadeRel: 0.375, // 0.015 / 0.040
    excentricidade: 0.05,
    inclinacao: 3.4,
    anel: false,
    fato: 'É o planeta mais quente, com atmosfera densa de dióxido de carbono.',
    dados: {
      'Tipo': 'Planeta rochoso',
      'Distância do Sol': '108 milhões de km',
      'Duração do ano': '225 dias',
      'Luas': '0',
    },
  },
  {
    id: 'earth',
    nomePT: 'Terra',
    corBase: 0x3d8dff, // azul (BLUE)
    raioRel: 1.5,
    distanciaRel: 26,
    velocidadeRel: 0.25, // 0.010 / 0.040
    excentricidade: 0.04,
    inclinacao: 0.0,
    anel: false,
    fato: 'É o único planeta conhecido a abrigar vida, coberto por 71% de água.',
    dados: {
      'Tipo': 'Planeta rochoso',
      'Distância do Sol': '150 milhões de km',
      'Duração do ano': '365 dias',
      'Luas': '1',
    },
  },
  {
    id: 'mars',
    nomePT: 'Marte',
    corBase: 0xff5a2a, // vermelho (RED)
    raioRel: 1.1,
    distanciaRel: 32,
    velocidadeRel: 0.2, // 0.008 / 0.040
    excentricidade: 0.09,
    inclinacao: 1.9,
    anel: false,
    fato: 'É conhecido como o Planeta Vermelho por causa do óxido de ferro no solo.',
    dados: {
      'Tipo': 'Planeta rochoso',
      'Distância do Sol': '228 milhões de km',
      'Duração do ano': '687 dias',
      'Luas': '2',
    },
  },
  {
    id: 'jupiter',
    nomePT: 'Júpiter',
    corBase: 0xf5b070, // laranja/bege
    raioRel: 4.0,
    distanciaRel: 44,
    velocidadeRel: 0.1, // 0.004 / 0.040
    excentricidade: 0.05,
    inclinacao: 1.3,
    anel: false,
    fato: 'É o maior planeta do Sistema Solar, com a Grande Mancha Vermelha.',
    dados: {
      'Tipo': 'Gigante gasoso',
      'Distância do Sol': '778 milhões de km',
      'Duração do ano': '12 anos',
      'Luas': '95+',
    },
  },
  {
    id: 'saturn',
    nomePT: 'Saturno',
    corBase: 0xffe08a, // amarelo (YELLOW)
    raioRel: 3.5,
    distanciaRel: 56,
    velocidadeRel: 0.075, // 0.003 / 0.040
    excentricidade: 0.06,
    inclinacao: 2.5,
    anel: true, // único com anel (herdado do legado)
    fato: 'É famoso por seus anéis brilhantes feitos de gelo e rocha.',
    dados: {
      'Tipo': 'Gigante gasoso',
      'Distância do Sol': '1,4 bilhão de km',
      'Duração do ano': '29 anos',
      'Luas': '146+',
    },
  },
  {
    id: 'uranus',
    nomePT: 'Urano',
    corBase: 0x8ae8ff, // azul claro/ciano (DARK_BLUE clareado p/ leitura)
    raioRel: 2.4,
    distanciaRel: 68,
    velocidadeRel: 0.05, // 0.002 / 0.040
    excentricidade: 0.05,
    inclinacao: 0.8,
    anel: false,
    fato: 'Gira "deitado", com o eixo de rotação quase paralelo ao plano orbital.',
    dados: {
      'Tipo': 'Gigante de gelo',
      'Distância do Sol': '2,9 bilhões de km',
      'Duração do ano': '84 anos',
      'Luas': '28',
    },
  },
  {
    id: 'neptune',
    nomePT: 'Netuno',
    corBase: 0x4a6cff, // azul (BLUE)
    raioRel: 2.3,
    distanciaRel: 80,
    velocidadeRel: 0.025, // 0.001 / 0.040
    excentricidade: 0.01,
    inclinacao: 1.8,
    anel: false,
    fato: 'É o planeta mais distante e tem os ventos mais rápidos do Sistema Solar.',
    dados: {
      'Tipo': 'Gigante de gelo',
      'Distância do Sol': '4,5 bilhões de km',
      'Duração do ano': '165 anos',
      'Luas': '16',
    },
  },
];

/**
 * Configuração do Sol (spec seções 4 e 7). Fica no centro (distância 0),
 * com contagem alta de partículas, cor quente e blending aditivo forte
 * (alimenta o bloom).
 * @type {{ id: string, nomePT: string, corBase: number, raioRel: number, fato: string, dados: object }}
 */
export const SUN = {
  id: 'sun',
  nomePT: 'Sol',
  corBase: 0xffd45a, // amarelo quente (YELLOW no legado)
  raioRel: 8.0, // grande, denso; ver PLANET_SIZES['sun'] = 80 no legado
  fato: 'É a estrela no centro do Sistema Solar e contém 99,8% de toda a sua massa.',
  dados: {
    'Tipo': 'Estrela anã amarela',
    'Diâmetro': '1,4 milhão de km',
    'Temperatura na superfície': '~5.500 °C',
    'Idade': '~4,6 bilhões de anos',
  },
};

/**
 * Busca os dados de um corpo (planeta ou Sol) pelo id.
 * @param {string} id
 * @returns {PlanetData | typeof SUN | undefined}
 */
export function getBodyById(id) {
  if (id === SUN.id) return SUN;
  return PLANETS.find((p) => p.id === id);
}
