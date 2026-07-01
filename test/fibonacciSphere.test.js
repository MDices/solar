import { describe, it, expect } from 'vitest';
import { fibonacciSphere } from '../src/util/fibonacciSphere.js';

describe('fibonacciSphere', () => {
  it('retorna Float32Array de tamanho count*3', () => {
    const pts = fibonacciSphere(100);
    expect(pts).toBeInstanceOf(Float32Array);
    expect(pts.length).toBe(300);
  });

  it('todos os pontos ficam na casca (raio ~ radius) sem jitter', () => {
    const radius = 3;
    const pts = fibonacciSphere(500, { radius });
    for (let i = 0; i < pts.length; i += 3) {
      const r = Math.hypot(pts[i], pts[i + 1], pts[i + 2]);
      expect(r).toBeCloseTo(radius, 4);
    }
  });

  it('jitter mantém o raio dentro do envelope esperado', () => {
    const radius = 2;
    const jitter = 0.1;
    const pts = fibonacciSphere(500, { radius, jitter });
    for (let i = 0; i < pts.length; i += 3) {
      const r = Math.hypot(pts[i], pts[i + 1], pts[i + 2]);
      expect(r).toBeGreaterThanOrEqual(radius * (1 - jitter) - 1e-4);
      expect(r).toBeLessThanOrEqual(radius * (1 + jitter) + 1e-4);
    }
  });

  it('distribuição é aproximadamente uniforme (média ~ centro)', () => {
    const pts = fibonacciSphere(2000, { radius: 1 });
    let sx = 0;
    let sy = 0;
    let sz = 0;
    const n = pts.length / 3;
    for (let i = 0; i < pts.length; i += 3) {
      sx += pts[i];
      sy += pts[i + 1];
      sz += pts[i + 2];
    }
    // O centroide de uma esfera uniformemente amostrada é ~0.
    expect(Math.abs(sx / n)).toBeLessThan(0.05);
    expect(Math.abs(sy / n)).toBeLessThan(0.05);
    expect(Math.abs(sz / n)).toBeLessThan(0.05);
  });

  it('count inválido retorna array vazio', () => {
    expect(fibonacciSphere(0).length).toBe(0);
    expect(fibonacciSphere(-5).length).toBe(0);
  });
});
