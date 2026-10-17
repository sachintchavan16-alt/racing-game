import { Mesh, PMREMGenerator, Scene, SphereGeometry } from 'three';

/**
 * Image-based lighting for the whole scene.
 *
 * Pre-filtered environment maps are what make metallic paint read as paint instead
 * of black: with no `scene.environment`, a material with metalness > 0 has nothing
 * to reflect and renders almost dark. The environment is generated from the very
 * same procedural sky shader the player sees, sharing its uniforms, so reflections
 * track the fog, sun tint and horizon colour as the rider moves between biomes.
 *
 * Rebuilt only when the zone changes — six times over a whole race — because a
 * PMREM pass is far too expensive to run per frame on mobile.
 */
export class Environment {
  constructor(renderer, { intensity = 0.62 } = {}) {
    this.renderer = renderer;
    this.intensity = intensity;
    this.available = false;
    this.scene = new Scene();
    this.mesh = null;
    this.target = null;
    this.texture = null;
    this.zoneId = null;

    try {
      this.pmrem = new PMREMGenerator(renderer);
      this.geometry = new SphereGeometry(50, 32, 16);
      this.available = true;
    } catch {
      this.pmrem = null;
      this.geometry = null;
    }
  }

  /**
   * @param {THREE.ShaderMaterial} skyMaterial a material that shares the live sky
   *   uniforms, so the captured environment matches what is on screen.
   */
  build(skyMaterial) {
    if (!this.available || !skyMaterial) return null;

    try {
      if (!this.mesh) {
        this.mesh = new Mesh(this.geometry, skyMaterial);
        this.mesh.frustumCulled = false;
        this.scene.add(this.mesh);
      } else {
        this.mesh.material = skyMaterial;
      }

      const next = this.pmrem.fromScene(this.scene, 0.03, 1, 120);
      if (this.target && this.target !== next) this.target.dispose();
      this.target = next;
      this.texture = next.texture;
      return this.texture;
    } catch {
      // Never take the whole game down over an environment map.
      this.available = false;
      return null;
    }
  }

  /** Rebuilds only when the biome actually changed. */
  refresh(skyMaterial, zone) {
    if (!this.available) return false;
    if (this.zoneId === zone.id) return false;
    this.zoneId = zone.id;
    return Boolean(this.build(skyMaterial));
  }

  applyTo(scene) {
    if (!this.texture) return;
    scene.environment = this.texture;
    if ('environmentIntensity' in scene) scene.environmentIntensity = this.intensity;
  }

  dispose() {
    if (this.target) this.target.dispose();
    if (this.geometry) this.geometry.dispose();
    if (this.pmrem) this.pmrem.dispose();
    this.scene.clear();
    this.texture = null;
    this.target = null;
  }
}
