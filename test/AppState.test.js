import { describe, it, expect, vi } from 'vitest';
import { AppState } from '../src/core/AppState.js';

describe('AppState', () => {
  it('tem valores padrão', () => {
    const s = new AppState();
    expect(s.get('cameraMode')).toBe('cinematic');
    expect(s.get('focusedPlanetId')).toBeNull();
    expect(s.get('speedMultiplier')).toBe(1.0);
    expect(s.get('paused')).toBe(false);
  });

  it('aceita valores iniciais', () => {
    const s = new AppState({ paused: true, speedMultiplier: 3 });
    expect(s.get('paused')).toBe(true);
    expect(s.get('speedMultiplier')).toBe(3);
  });

  it('set atualiza e notifica assinantes apenas em mudança real', () => {
    const s = new AppState();
    const listener = vi.fn();
    s.subscribe(listener);

    s.set('paused', true);
    expect(s.get('paused')).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(true, 'paused', expect.any(Object));

    // mesmo valor: não notifica
    s.set('paused', true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe para de notificar', () => {
    const s = new AppState();
    const listener = vi.fn();
    const off = s.subscribe(listener);
    off();
    s.set('paused', true);
    expect(listener).not.toHaveBeenCalled();
  });

  it('getState retorna cópia', () => {
    const s = new AppState();
    const snap = s.getState();
    snap.paused = true;
    expect(s.get('paused')).toBe(false);
  });
});
