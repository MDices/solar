import { describe, it, expect } from 'vitest';
import { PLANETS, SUN, getBodyById } from '../src/data/planets.js';

describe('planets data', () => {
  it('tem exatamente 8 planetas na ordem correta', () => {
    expect(PLANETS).toHaveLength(8);
    expect(PLANETS.map((p) => p.id)).toEqual([
      'mercury',
      'venus',
      'earth',
      'mars',
      'jupiter',
      'saturn',
      'uranus',
      'neptune',
    ]);
  });

  it('preserva a ordem de velocidade do legado (Mercúrio mais rápido → Netuno mais lento)', () => {
    for (let i = 1; i < PLANETS.length; i++) {
      expect(PLANETS[i].velocidadeRel).toBeLessThan(PLANETS[i - 1].velocidadeRel);
    }
  });

  it('distâncias crescem do Sol para fora', () => {
    for (let i = 1; i < PLANETS.length; i++) {
      expect(PLANETS[i].distanciaRel).toBeGreaterThan(PLANETS[i - 1].distanciaRel);
    }
  });

  it('apenas Saturno tem anel', () => {
    const comAnel = PLANETS.filter((p) => p.anel).map((p) => p.id);
    expect(comAnel).toEqual(['saturn']);
  });

  it('cada planeta tem os campos obrigatórios', () => {
    for (const p of PLANETS) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.nomePT).toBe('string');
      expect(typeof p.corBase).toBe('number');
      expect(typeof p.raioRel).toBe('number');
      expect(typeof p.distanciaRel).toBe('number');
      expect(typeof p.velocidadeRel).toBe('number');
      expect(typeof p.excentricidade).toBe('number');
      expect(typeof p.inclinacao).toBe('number');
      expect(typeof p.anel).toBe('boolean');
      expect(typeof p.fato).toBe('string');
      expect(typeof p.dados).toBe('object');
    }
  });

  it('SUN está configurado', () => {
    expect(SUN.id).toBe('sun');
    expect(SUN.nomePT).toBe('Sol');
    expect(typeof SUN.corBase).toBe('number');
    expect(SUN.raioRel).toBeGreaterThan(0);
  });

  it('getBodyById encontra planetas e o Sol', () => {
    expect(getBodyById('earth').nomePT).toBe('Terra');
    expect(getBodyById('sun').nomePT).toBe('Sol');
    expect(getBodyById('inexistente')).toBeUndefined();
  });
});
