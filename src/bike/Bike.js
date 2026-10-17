import { Group, Mesh, MeshStandardMaterial } from 'three';
import {
  FRONT_AXLE_Z,
  PLAYER_STYLE_ID,
  REAR_AXLE_Z,
  WHEEL_RADIUS,
  getSportbikeGeometry,
  getStyle,
} from './BikeStyles.js';

/**
 * Painted bodywork is glossy and mildly metallic — which only reads correctly
 * once the scene has an environment map to reflect (see render/Environment.js).
 * Flat shading keeps the faceted low-poly panels crisp under those reflections.
 */
const paintMaterial = new MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.3,
  metalness: 0.45,
  envMapIntensity: 1.15,
  flatShading: true,
});

const leatherMaterial = new MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.62,
  metalness: 0.06,
  envMapIntensity: 0.7,
  flatShading: true,
});

const wheelMaterial = new MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.55,
  metalness: 0.3,
  envMapIntensity: 0.9,
  flatShading: true,
});

export function disposeBikeMaterials() {
  paintMaterial.dispose();
  leatherMaterial.dispose();
  wheelMaterial.dispose();
}

export class Bike {
  constructor(styleOrId = PLAYER_STYLE_ID) {
    this.style = typeof styleOrId === 'string' ? getStyle(styleOrId) : styleOrId;

    const geometry = getSportbikeGeometry(this.style);

    this.root = new Group();
    this.root.name = `bike-${this.style.id}`;
    this.yawGroup = new Group();
    this.pitchGroup = new Group();
    this.rollGroup = new Group();

    this.root.add(this.yawGroup);
    this.yawGroup.add(this.pitchGroup);
    this.pitchGroup.add(this.rollGroup);

    const body = new Mesh(geometry.body, paintMaterial);
    body.castShadow = true;
    this.rollGroup.add(body);

    const rider = new Mesh(geometry.rider, leatherMaterial);
    rider.castShadow = true;
    this.rollGroup.add(rider);

    this.frontGroup = new Group();
    this.frontGroup.position.set(0, WHEEL_RADIUS, FRONT_AXLE_Z);
    const steering = new Mesh(geometry.steering, paintMaterial);
    steering.castShadow = true;
    this.frontGroup.add(steering);

    this.frontWheel = new Mesh(geometry.wheel, wheelMaterial);
    this.frontWheel.castShadow = true;
    this.frontGroup.add(this.frontWheel);
    this.rollGroup.add(this.frontGroup);

    this.rearWheel = new Mesh(geometry.wheel, wheelMaterial);
    this.rearWheel.castShadow = true;
    this.rearWheel.position.set(0, WHEEL_RADIUS, REAR_AXLE_Z);
    this.rollGroup.add(this.rearWheel);
  }

  get object3D() {
    return this.root;
  }

  place(position, yaw, bank, lean, pitch) {
    this.root.position.copy(position);
    this.yawGroup.rotation.y = yaw;
    this.pitchGroup.rotation.x = pitch;
    this.rollGroup.rotation.z = bank - lean;
  }

  update(dt, phys) {
    this.frontWheel.rotation.x = phys.wheelSpin;
    this.rearWheel.rotation.x = phys.wheelSpin;
    this.frontGroup.rotation.y = phys.steerVisual * 0.3;

    const bob = phys.airborne ? 0 : Math.sin(phys.wheelSpin * 0.42) * 0.012 * clamp01(phys.speed / 6);
    this.rollGroup.position.y = bob;
  }
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
