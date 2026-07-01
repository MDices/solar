import { describe, it, expect } from 'vitest';
import {
  lerp,
  clamp,
  clamp01,
  smoothstep,
  easeInOutCubic,
  easeOutCubic,
  mapRange,
  degToRad,
  radToDeg,
} from '../src/util/math.js';

describe('math', () => {
  it('lerp interpola linearmente', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });

  it('clamp restringe à faixa', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('clamp01 restringe a [0,1]', () => {
    expect(clamp01(-2)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.3)).toBe(0.3);
  });

  it('smoothstep é 0/1 nas bordas e ~0.5 no meio', () => {
    expect(smoothstep(0, 1, 0)).toBe(0);
    expect(smoothstep(0, 1, 1)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 5);
    expect(smoothstep(0, 1, -5)).toBe(0);
  });

  it('easeInOutCubic começa em 0 e termina em 1', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 5);
  });

  it('easeOutCubic começa em 0 e termina em 1', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it('mapRange remapeia faixas', () => {
    expect(mapRange(5, 0, 10, 0, 100)).toBe(50);
    expect(mapRange(0, 0, 10, 20, 40)).toBe(20);
    // com clamp
    expect(mapRange(20, 0, 10, 0, 100, true)).toBe(100);
    expect(mapRange(-5, 0, 10, 0, 100, true)).toBe(0);
  });

  it('conversões grau/radiano são inversas', () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI, 5);
    expect(radToDeg(Math.PI)).toBeCloseTo(180, 5);
  });
});
