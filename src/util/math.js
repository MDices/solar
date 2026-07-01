/**
 * Funções matemáticas puras usadas em toda a aplicação
 * (interpolação, clamp, easing, remapeamento de faixas).
 *
 * Todas são puras e sem dependências — testáveis com Vitest.
 */

/**
 * Interpolação linear entre `a` e `b` pelo fator `t`.
 * @param {number} a - valor inicial
 * @param {number} b - valor final
 * @param {number} t - fator de interpolação (0..1, não é feito clamp)
 * @returns {number}
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Restringe `value` ao intervalo [min, max].
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Clamp de `value` em [0, 1]. Atalho comum.
 * @param {number} value
 * @returns {number}
 */
export function clamp01(value) {
  return clamp(value, 0, 1);
}

/**
 * Interpolação suave (Hermite) equivalente à `smoothstep` do GLSL.
 * Retorna 0 abaixo de `edge0`, 1 acima de `edge1`, com transição suave entre eles.
 * @param {number} edge0
 * @param {number} edge1
 * @param {number} x
 * @returns {number}
 */
export function smoothstep(edge0, edge1, x) {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Easing cúbico "ease-in-out" (aceleração e desaceleração suaves).
 * @param {number} t - progresso normalizado (0..1)
 * @returns {number}
 */
export function easeInOutCubic(t) {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * Easing "ease-out" cúbico (desacelera no fim). Útil para tweens de câmera.
 * @param {number} t
 * @returns {number}
 */
export function easeOutCubic(t) {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

/**
 * Remapeia `value` da faixa [inMin, inMax] para [outMin, outMax].
 * @param {number} value
 * @param {number} inMin
 * @param {number} inMax
 * @param {number} outMin
 * @param {number} outMax
 * @param {boolean} [doClamp=false] - se true, restringe o resultado à faixa de saída
 * @returns {number}
 */
export function mapRange(value, inMin, inMax, outMin, outMax, doClamp = false) {
  if (inMin === inMax) return outMin;
  const t = (value - inMin) / (inMax - inMin);
  const result = outMin + (outMax - outMin) * t;
  if (!doClamp) return result;
  const lo = Math.min(outMin, outMax);
  const hi = Math.max(outMin, outMax);
  return clamp(result, lo, hi);
}

/**
 * Converte graus para radianos.
 * @param {number} degrees
 * @returns {number}
 */
export function degToRad(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Converte radianos para graus.
 * @param {number} radians
 * @returns {number}
 */
export function radToDeg(radians) {
  return (radians * 180) / Math.PI;
}

/**
 * Fator de suavização exponencial independente de framerate.
 * Use para lerp por frame: `x = lerp(x, alvo, damp(lambda, dt))`.
 * @param {number} lambda - taxa de decaimento (maior = mais rápido)
 * @param {number} dt - delta time em segundos
 * @returns {number} fator em [0, 1)
 */
export function damp(lambda, dt) {
  return 1 - Math.exp(-lambda * dt);
}
