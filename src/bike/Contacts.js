import { BIKE } from './Physics.js';

export const CONTACT_LONG = 2.35;
export const CONTACT_LAT = 1.15;

/**
 * Resolves body-to-body contact between riders and collisions with on-track
 * hazards. Contacts are soft: nobody is teleported, riders are nudged apart
 * laterally and the rider behind concedes a little speed.
 *
 * @param {Array} racers     entries exposing `{ physics, hitFlash }`
 * @param {object} obstacles an Obstacles instance (may be null)
 * @param {number} dt        seconds
 * @param {Function} [onHazard] called as `(racer, hazard)` on a fresh impact
 */
export function resolveContacts(racers, obstacles, dt, onHazard) {
  for (let i = 0; i < racers.length; i++) {
    for (let j = i + 1; j < racers.length; j++) {
      const a = racers[i].physics;
      const b = racers[j].physics;
      const ds = b.s - a.s;
      if (Math.abs(ds) > CONTACT_LONG) continue;
      const dl = b.lateral - a.lateral;
      if (Math.abs(dl) > CONTACT_LAT) continue;

      const dir = dl >= 0 ? 1 : -1;
      const push = (CONTACT_LAT - Math.abs(dl)) * 0.5 + 0.015;
      a.lateral -= dir * push;
      b.lateral += dir * push;
      a.latVelocity -= dir * push * 4;
      b.latVelocity += dir * push * 4;

      // the rider behind concedes a little speed instead of passing through
      if (ds > 0) a.speed *= 0.985;
      else b.speed *= 0.985;

      for (const body of [a, b]) {
        const limit = body.surface.zone.halfWidth + BIKE.LATERAL_MARGIN;
        if (Math.abs(body.lateral) > limit) body.lateral = Math.sign(body.lateral) * limit;
      }
    }
  }

  if (obstacles) {
    for (const racer of racers) {
      const body = racer.physics;
      const wasClear = racer.hitFlash <= 0.05;
      racer.hitFlash = Math.max(0, racer.hitFlash - dt * 1.6);

      const hazard = obstacles.hit(body);
      if (!hazard) continue;

      const away = body.lateral >= hazard.lateral ? 1 : -1;
      body.lateral = hazard.lateral + away * (hazard.halfLat + 0.06);
      body.latVelocity = away * 1.8;
      body.speed *= 0.9;
      racer.hitFlash = 1;
      racer.hazardHits = (racer.hazardHits || 0) + 1;

      const limit = body.surface.zone.halfWidth + BIKE.LATERAL_MARGIN;
      if (Math.abs(body.lateral) > limit) body.lateral = Math.sign(body.lateral) * limit;

      if (wasClear && onHazard) onHazard(racer, hazard);
    }
  }

  for (const racer of racers) racer.physics.syncTransform();
}
