import { sceneLightingContract } from './sceneLightingContract';

describe('sceneLighting', () => {
  it('defines a studio-style board rig with soft readable shadows', () => {
    expect(sceneLightingContract.rigId).toBe('studio-warm-key');
    expect(sceneLightingContract.shadowStyle).toBe('soft-readable');
    expect(sceneLightingContract.playability).toBe(
      'default-overhead-readable',
    );
    expect(sceneLightingContract.backgroundColor).toBe('#151d26');
    expect(sceneLightingContract.fog.color).toBe('#111922');
    expect(sceneLightingContract.backdrop.floorColor).toBe('#16202b');
    expect(sceneLightingContract.backdrop.treatment).toBe('floor-only');
    expect(sceneLightingContract.backdrop.boardOccluderPolicy).toBe('none');
    expect('wallColor' in sceneLightingContract.backdrop).toBe(false);

    expect(sceneLightingContract.keyLight.role).toBe('key');
    expect(sceneLightingContract.keyLight.intensity).toBeGreaterThan(
      sceneLightingContract.fillLight.intensity,
    );
    expect(sceneLightingContract.keyLight.intensity).toBeGreaterThan(
      sceneLightingContract.rimLight.intensity,
    );
    expect(sceneLightingContract.keyLight.castShadow).toBe(true);
    expect(sceneLightingContract.keyLight.shadow.mapSize).toBeGreaterThanOrEqual(
      1024,
    );
    expect(sceneLightingContract.keyLight.shadow.radius).toBeGreaterThanOrEqual(
      2.5,
    );
    expect(sceneLightingContract.keyLight.shadow.far).toBeGreaterThan(18);
    expect(sceneLightingContract.keyLight.shadow.bounds).toBeGreaterThan(5.5);

    expect(sceneLightingContract.fillLight.role).toBe('fill');
    expect(sceneLightingContract.fillLight.intensity).toBeGreaterThanOrEqual(0.55);
    expect(sceneLightingContract.rimLight.role).toBe('rim');
    expect(sceneLightingContract.rimLight.intensity).toBeGreaterThanOrEqual(0.4);
  });
});
