import {
  BackSide,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { damp } from '../core/MathUtils.js';

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uBottom;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  varying vec3 vDir;

  void main() {
    float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uBottom, uTop, smoothstep(0.44, 0.88, h));
    float d = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
    col += uSun * pow(d, 300.0) * 1.6;
    col += uSun * pow(d, 9.0) * 0.14;
    float haze = 1.0 - smoothstep(0.42, 0.52, h);
    col = mix(col, uBottom * 1.06, haze * 0.35);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class Sky {
  constructor(scene, { radius = 900, shadowMapSize = 1024 } = {}) {
    this.scene = scene;

    this.sunDir = new Vector3(-0.42, 0.68, -0.6).normalize();

    this.uniforms = {
      uTop: { value: new Color(0x4a86c4) },
      uBottom: { value: new Color(0xcfe4b8) },
      uSun: { value: new Color(0xfff3d6) },
      uSunDir: { value: this.sunDir.clone() },
    };

    const material = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: BackSide,
      depthWrite: false,
      fog: false,
    });
    this.material = material;

    this.dome = new Mesh(new SphereGeometry(radius, 24, 16), material);
    this.dome.name = 'sky';
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -100;
    this.dome.matrixAutoUpdate = true;
    scene.add(this.dome);

    this.fog = new FogExp2(0x9dc98c, 0.0062);
    scene.fog = this.fog;

    this.hemi = new HemisphereLight(0xbcdcff, 0x3b3a24, 0.85);
    scene.add(this.hemi);

    this.sun = new DirectionalLight(0xfff3d6, 2.35);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 280;
    this.sun.shadow.camera.left = -55;
    this.sun.shadow.camera.right = 55;
    this.sun.shadow.camera.top = 55;
    this.sun.shadow.camera.bottom = -55;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.targetColor = new Color(0x9dc98c);
    this.targetTop = new Color(0x4a86c4);
    this.targetBottom = new Color(0xcfe4b8);
    this.targetSun = new Color(0xfff3d6);
    this.targetDensity = 0.0062;
  }

  /**
   * A second material drawing the same sky with the same live uniforms, for
   * capturing the environment map. Sharing the uniform objects means the captured
   * environment always matches the sky the player can see.
   */
  createEnvMaterial() {
    return new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
  }

  applyZone(zone) {
    this.targetColor.set(zone.fog);
    this.targetTop.set(zone.skyTop);
    this.targetBottom.set(zone.skyBottom);
    this.targetSun.set(zone.sun);
    this.targetDensity = zone.fogDensity;
  }

  /**
   * Image-based lighting already supplies most of the ambient fill, so the
   * hemisphere light steps back to avoid double-lighting the scene.
   */
  setEnvLighting(enabled) {
    this.envLighting = enabled;
    this.hemi.intensity = enabled ? 0.38 : 0.85;
  }

  update(dt, cameraPosition, focus) {
    this.dome.position.copy(cameraPosition);
    this.uniforms.uSunDir.value.copy(this.sunDir);
    this.uniforms.uTop.value.lerp(this.targetTop, 1 - Math.exp(-1.1 * dt));
    this.uniforms.uBottom.value.lerp(this.targetBottom, 1 - Math.exp(-1.1 * dt));
    this.uniforms.uSun.value.lerp(this.targetSun, 1 - Math.exp(-1.1 * dt));

    this.fog.color.lerp(this.targetColor, 1 - Math.exp(-1.4 * dt));
    this.fog.density = damp(this.fog.density, this.targetDensity, 1.4, dt);

    this.sun.position.copy(focus).addScaledVector(this.sunDir, 130);
    this.sun.target.position.copy(focus);
    this.hemi.position.copy(cameraPosition);
  }

  setShadowEnabled(enabled) {
    this.sun.castShadow = enabled;
  }

  setShadowMapSize(size) {
    if (this.sun.shadow.mapSize.x === size) return;
    this.sun.shadow.mapSize.set(size, size);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
  }

  /** Tighter ortho frustums give crisper contact shadows right around the rider. */
  setShadowArea(size) {
    const cam = this.sun.shadow.camera;
    if (cam.right === size) return;
    cam.left = -size;
    cam.right = size;
    cam.top = size;
    cam.bottom = -size;
    cam.far = size * 5.2;
    cam.updateProjectionMatrix();
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
  }

  dispose() {
    this.dome.geometry.dispose();
    this.dome.material.dispose();
    this.scene.remove(this.dome, this.sun, this.sun.target, this.hemi);
  }
}
