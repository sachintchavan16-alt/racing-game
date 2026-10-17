import { BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry } from 'three';
import { part, mergeParts } from '../world/GeoHelpers.js';

export const WHEEL_RADIUS = 0.31;
export const FRONT_AXLE_Z = 0.72;
export const REAR_AXLE_Z = -0.72;

const ENGINE = 0x2b3037;
const SPINE = 0x3a4046;
const ALLOY = 0xa8b0b8;
const FORK_LOWER = 0xd0d6dc;
const TIRE = 0x141518;
const SEAT = 0x1c1f24;
const DARK = 0x22262b;
const DISC = 0xb8bfc6;

/**
 * Five low-poly sportbikes. Every shape parameter feeds the same builder, so
 * each brand gets its own silhouette (nose profile, tail lift, winglets, trellis
 * frame, exhaust layout) without duplicating geometry code.
 */
export const RACER_STYLES = [
  {
    id: 'fireblade',
    brand: 'HONDA',
    model: 'CBR1000RR-R',
    primary: 0xd8202a,
    secondary: 0xf3f6f8,
    tertiary: 0x123a86,
    accent: 0xffd23f,
    rim: 0x1b1d21,
    leathers: { suit: 0xb51722, panel: 0xf3f6f8, trim: 0x123a86 },
    shape: {
      noseLength: 0.58,
      noseWidth: 0.42,
      noseHeight: 0.30,
      noseTaper: 0.58,
      windscreen: 0.28,
      windscreenRake: -0.5,
      fairingWidth: 0.47,
      bellyDepth: 0.22,
      tailLift: 0.14,
      tailLength: 0.46,
      tailTaper: 0.6,
      tankHeight: 0.2,
      winglets: false,
      trellis: false,
      splitSeat: false,
      undertailExhaust: false,
      twinRoundLights: true,
    },
  },
  {
    id: 'r15',
    brand: 'YAMAHA',
    model: 'R15 V4',
    primary: 0x0b3d91,
    secondary: 0x2fd4e8,
    tertiary: 0xf5f7f9,
    accent: 0xe9edf1,
    rim: 0x101216,
    leathers: { suit: 0x0b3d91, panel: 0x2fd4e8, trim: 0xf5f7f9 },
    shape: {
      noseLength: 0.64,
      noseWidth: 0.34,
      noseHeight: 0.28,
      noseTaper: 0.46,
      windscreen: 0.33,
      windscreenRake: -0.56,
      fairingWidth: 0.43,
      bellyDepth: 0.2,
      tailLift: 0.19,
      tailLength: 0.44,
      tailTaper: 0.5,
      tankHeight: 0.19,
      winglets: false,
      trellis: false,
      splitSeat: true,
      undertailExhaust: true,
      twinRoundLights: false,
    },
  },
  {
    id: 'ninja',
    brand: 'KAWASAKI',
    model: 'ZX-10R',
    primary: 0x6cbe2a,
    secondary: 0x14171a,
    tertiary: 0xf2f5f7,
    accent: 0x8ed13a,
    rim: 0x111318,
    leathers: { suit: 0x2f6b18, panel: 0x6cbe2a, trim: 0x14171a },
    shape: {
      noseLength: 0.56,
      noseWidth: 0.46,
      noseHeight: 0.31,
      noseTaper: 0.62,
      windscreen: 0.27,
      windscreenRake: -0.48,
      fairingWidth: 0.51,
      bellyDepth: 0.24,
      tailLift: 0.16,
      tailLength: 0.5,
      tailTaper: 0.66,
      tankHeight: 0.21,
      winglets: true,
      trellis: false,
      splitSeat: false,
      undertailExhaust: true,
      twinRoundLights: false,
    },
  },
  {
    id: 'duke',
    brand: 'KTM',
    model: 'RC 390',
    primary: 0xef6a00,
    secondary: 0x1a1d21,
    tertiary: 0xf5f7f9,
    accent: 0xffd9b0,
    rim: 0x1a1d21,
    leathers: { suit: 0xef6a00, panel: 0x1a1d21, trim: 0xf5f7f9 },
    shape: {
      noseLength: 0.6,
      noseWidth: 0.38,
      noseHeight: 0.32,
      noseTaper: 0.44,
      windscreen: 0.25,
      windscreenRake: -0.62,
      fairingWidth: 0.4,
      bellyDepth: 0.19,
      tailLift: 0.21,
      tailLength: 0.42,
      tailTaper: 0.46,
      tankHeight: 0.22,
      winglets: false,
      trellis: true,
      splitSeat: true,
      undertailExhaust: false,
      twinRoundLights: false,
    },
  },
  {
    id: 'phantom',
    brand: 'APEX',
    model: 'XR-1',
    primary: 0x2b3037,
    secondary: 0x14d1bd,
    tertiary: 0x8d959d,
    accent: 0xd8dee4,
    rim: 0x0f1114,
    leathers: { suit: 0x22262b, panel: 0x14d1bd, trim: 0x3a4046 },
    shape: {
      noseLength: 0.57,
      noseWidth: 0.4,
      noseHeight: 0.29,
      noseTaper: 0.54,
      windscreen: 0.3,
      windscreenRake: -0.52,
      fairingWidth: 0.45,
      bellyDepth: 0.21,
      tailLift: 0.17,
      tailLength: 0.47,
      tailTaper: 0.58,
      tankHeight: 0.2,
      winglets: true,
      trellis: false,
      splitSeat: false,
      undertailExhaust: true,
      twinRoundLights: true,
    },
  },
];

export const PLAYER_STYLE_ID = 'fireblade';
const LIGHT = 0x1a1d22;

export function getStyle(id) {
  return RACER_STYLES.find((s) => s.id === id) || RACER_STYLES[0];
}

export function styleColorCss(style) {
  return `#${style.primary.toString(16).padStart(6, '0')}`;
}

function buildWheel(style) {
  const spokes = [];
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    spokes.push(
      part(new BoxGeometry(0.03, 0.22, 0.022), {
        position: [0, Math.cos(a) * 0.11, Math.sin(a) * 0.11],
        rotation: [a, 0, 0],
        color: style.rim,
      })
    );
  }

  return mergeParts([
    part(new TorusGeometry(WHEEL_RADIUS, 0.075, 7, 18), {
      rotation: [0, Math.PI / 2, 0],
      color: TIRE,
    }),
    part(new CylinderGeometry(0.205, 0.205, 0.05, 18), {
      rotation: [0, 0, Math.PI / 2],
      color: style.rim,
    }),
    part(new CylinderGeometry(0.062, 0.062, 0.125, 10), {
      rotation: [0, 0, Math.PI / 2],
      color: ALLOY,
    }),
    part(new CylinderGeometry(0.155, 0.155, 0.014, 14), {
      position: [0.076, 0, 0],
      rotation: [0, 0, Math.PI / 2],
      color: DISC,
    }),
    part(new CylinderGeometry(0.155, 0.155, 0.014, 14), {
      position: [-0.076, 0, 0],
      rotation: [0, 0, Math.PI / 2],
      color: DISC,
    }),
    ...spokes,
  ]);
}

function buildBody(style) {
  const { primary, secondary, tertiary } = style;
  const sh = style.shape;
  const parts = [];
  const push = (geo, opts) => parts.push(part(geo, opts));
  const halfFairing = sh.fairingWidth * 0.5;

  push(new BoxGeometry(0.3, 0.3, 0.4), { position: [0, 0.46, 0.02], color: ENGINE });
  push(new BoxGeometry(0.1, 0.12, 0.86), { position: [0, 0.6, -0.1], color: SPINE });
  push(new BoxGeometry(0.24, 0.1, 0.18), { position: [0, 0.44, -0.32], color: DARK });

  for (const side of [-1, 1]) {
    push(new BoxGeometry(0.055, 0.11, 0.46), { position: [side * 0.16, 0.42, -0.48], color: 0x5c636b });
    push(new BoxGeometry(0.09, 0.34, 0.56), {
      position: [side * (halfFairing + 0.06), 0.56, 0.14],
      rotation: [0, side * -0.05, 0],
      color: primary,
    });
    push(new BoxGeometry(0.04, 0.1, 0.44), {
      position: [side * (halfFairing + 0.1), 0.66, 0.1],
      rotation: [0, side * -0.05, 0],
      color: secondary,
    });
    push(new BoxGeometry(0.03, 0.12, 0.16), {
      position: [side * (halfFairing + 0.1), 0.47, 0.32],
      color: tertiary,
    });
  }

  push(new BoxGeometry(sh.fairingWidth * 0.72, sh.bellyDepth, 0.54), {
    position: [0, 0.31, 0.08],
    color: primary,
  });
  push(new BoxGeometry(0.26, 0.18, 0.08), { position: [0, 0.52, 0.4], color: 0x3f454b });

  const noseZ = 0.5;
  const nose = sh.noseLength;
  push(new BoxGeometry(sh.noseWidth, sh.noseHeight, nose * 0.42), {
    position: [0, 0.78, noseZ + nose * 0.18],
    color: primary,
  });
  push(new BoxGeometry(sh.noseWidth * sh.noseTaper, sh.noseHeight * 0.9, nose * 0.34), {
    position: [0, 0.79, noseZ + nose * 0.52],
    color: primary,
  });
  push(new BoxGeometry(sh.noseWidth * sh.noseTaper * 0.62, sh.noseHeight * 0.72, nose * 0.3), {
    position: [0, 0.79, noseZ + nose * 0.82],
    color: secondary,
  });

  const lightZ = noseZ + nose * 0.95;
  for (const side of [-1, 1]) {
    if (sh.twinRoundLights) {
      push(new CylinderGeometry(0.072, 0.072, 0.045, 10), {
        position: [side * 0.1, 0.8, lightZ],
        rotation: [Math.PI / 2, 0, 0],
        color: LIGHT,
      });
    } else {
      push(new BoxGeometry(0.1, 0.055, 0.03), { position: [side * 0.096, 0.82, lightZ], color: LIGHT });
    }
  }

  push(new BoxGeometry(sh.noseWidth * 0.86, 0.028, sh.windscreen), {
    position: [0, 0.9, noseZ + 0.06],
    rotation: [sh.windscreenRake, 0, 0],
    color: 0x1d2127,
  });
  for (const side of [-1, 1]) {
    push(new BoxGeometry(0.1, 0.05, 0.06), { position: [side * 0.24, 0.9, noseZ - 0.12], color: DARK });
  }

  if (sh.winglets) {
    for (const side of [-1, 1]) {
      push(new BoxGeometry(0.17, 0.035, 0.14), {
        position: [side * (halfFairing + 0.17), 0.7, 0.34],
        rotation: [0.18, side * -0.22, side * 0.1],
        color: primary,
      });
    }
  }

  if (sh.trellis) {
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        push(new CylinderGeometry(0.02, 0.02, 0.4, 6), {
          position: [side * (halfFairing + 0.015), 0.5 + i * 0.085, -0.04 + i * 0.05],
          rotation: [0.9, 0, side * 0.34],
          color: 0xff6a00,
        });
      }
    }
  }

  push(new BoxGeometry(0.34, sh.tankHeight, 0.46), { position: [0, 0.85, 0.02], color: primary });
  push(new BoxGeometry(0.26, 0.05, 0.28), { position: [0, 0.95, -0.06], color: secondary });

  if (sh.splitSeat) {
    push(new BoxGeometry(0.24, 0.08, 0.22), { position: [0, 0.88, -0.3], color: SEAT });
    push(new BoxGeometry(0.22, 0.07, 0.16), { position: [0, 0.95, -0.5], color: SEAT });
  } else {
    push(new BoxGeometry(0.25, 0.08, 0.4), { position: [0, 0.88, -0.36], color: SEAT });
  }

  const tailY = 0.94 + sh.tailLift;
  const tailBack = -0.62 - sh.tailLength * 0.52;
  push(new BoxGeometry(0.23, 0.16, sh.tailLength), { position: [0, tailY, -0.62], color: primary });
  push(new BoxGeometry(0.1 + 0.19 * sh.tailTaper, 0.11, 0.16), {
    position: [0, tailY + 0.02, tailBack],
    color: primary,
  });
  push(new BoxGeometry(0.13, 0.05, 0.03), {
    position: [0, tailY, -0.62 - sh.tailLength * 0.6],
    color: 0xc21a1a,
  });

  if (sh.undertailExhaust) {
    push(new CylinderGeometry(0.052, 0.06, 0.3, 8), {
      position: [0.07, tailY - 0.07, -0.64],
      rotation: [Math.PI / 2, 0, 0],
      color: 0x9aa1a8,
    });
    push(new CylinderGeometry(0.064, 0.064, 0.06, 8), {
      position: [0.07, tailY - 0.07, -0.805],
      rotation: [Math.PI / 2, 0, 0],
      color: 0x30353b,
    });
  } else {
    push(new CylinderGeometry(0.052, 0.062, 0.44, 8), {
      position: [-0.19, 0.4, -0.42],
      rotation: [Math.PI / 2, 0, 0.08],
      color: 0x9aa1a8,
    });
    push(new CylinderGeometry(0.068, 0.068, 0.07, 8), {
      position: [-0.2, 0.384, -0.655],
      rotation: [Math.PI / 2, 0, 0.08],
      color: 0x2b3037,
    });
  }

  push(new BoxGeometry(0.15, 0.05, 0.3), { position: [0, 0.74, -0.8], color: DARK });
  push(new BoxGeometry(0.17, 0.12, 0.02), {
    position: [0, 0.7, noseZ + nose * 0.72],
    rotation: [0.12, 0, 0],
    color: style.accent,
  });

  for (const side of [-1, 1]) {
    push(new BoxGeometry(0.11, 0.03, 0.06), { position: [side * 0.2, 0.4, -0.26], color: ALLOY });
  }

  return mergeParts(parts);
}

function buildSteering(style) {
  const { primary } = style;
  const parts = [];
  const push = (geo, opts) => parts.push(part(geo, opts));

  for (const side of [-1, 1]) {
    push(new BoxGeometry(0.055, 0.6, 0.055), {
      position: [side * 0.1, 0.28, -0.09],
      rotation: [0.3, 0, 0],
      color: FORK_LOWER,
    });
    push(new BoxGeometry(0.07, 0.24, 0.07), {
      position: [side * 0.1, 0.6, -0.24],
      rotation: [0.3, 0, 0],
      color: DARK,
    });
    push(new BoxGeometry(0.17, 0.032, 0.032), {
      position: [side * 0.17, 0.76, -0.28],
      rotation: [0, 0, side * -0.22],
      color: DARK,
    });
    push(new CylinderGeometry(0.024, 0.024, 0.1, 8), {
      position: [side * 0.27, 0.745, -0.28],
      rotation: [0, 0, Math.PI / 2],
      color: LIGHT,
    });
  }

  push(new BoxGeometry(0.26, 0.05, 0.09), { position: [0, 0.6, -0.22], color: ALLOY });
  push(new BoxGeometry(0.26, 0.05, 0.09), { position: [0, 0.74, -0.3], color: ALLOY });
  push(new BoxGeometry(0.2, 0.035, 0.44), { position: [0, 0.4, 0.02], rotation: [0.08, 0, 0], color: primary });
  push(new CylinderGeometry(0.03, 0.03, 0.22, 8), { rotation: [0, 0, Math.PI / 2], color: ALLOY });
  push(new BoxGeometry(0.05, 0.12, 0.07), { position: [0.12, 0.16, 0.03], color: 0x8f959c });

  return mergeParts(parts);
}

function buildRider(style) {
  const { suit, panel, trim } = style.leathers;
  const parts = [];
  const push = (geo, opts) => parts.push(part(geo, opts));

  push(new BoxGeometry(0.3, 0.24, 0.26), { position: [0, 0.95, -0.3], color: suit });
  push(new BoxGeometry(0.34, 0.34, 0.3), { position: [0, 1.13, 0.02], rotation: [-0.62, 0, 0], color: suit });
  push(new BoxGeometry(0.3, 0.11, 0.24), { position: [0, 1.07, 0.22], rotation: [-0.62, 0, 0], color: panel });
  push(new BoxGeometry(0.12, 0.3, 0.26), { position: [0, 1.09, -0.16], rotation: [-0.62, 0, 0], color: trim });

  push(new SphereGeometry(0.148, 10, 8), { position: [0, 1.3, 0.3], color: panel });
  push(new BoxGeometry(0.22, 0.09, 0.06), { position: [0, 1.29, 0.44], rotation: [-0.12, 0, 0], color: LIGHT });
  push(new BoxGeometry(0.2, 0.05, 0.14), { position: [0, 1.36, 0.2], rotation: [-0.5, 0, 0], color: trim });

  for (const side of [-1, 1]) {
    push(new BoxGeometry(0.1, 0.1, 0.36), {
      position: [side * 0.2, 1.07, 0.2],
      rotation: [0.72, 0, side * -0.1],
      color: suit,
    });
    push(new BoxGeometry(0.1, 0.1, 0.32), {
      position: [side * 0.26, 0.93, 0.44],
      rotation: [0.95, 0, side * -0.08],
      color: suit,
    });
    push(new BoxGeometry(0.09, 0.09, 0.11), { position: [side * 0.27, 0.78, 0.55], color: trim });

    push(new BoxGeometry(0.13, 0.17, 0.34), { position: [side * 0.17, 0.86, -0.16], rotation: [0.5, 0, 0], color: panel });
    push(new BoxGeometry(0.12, 0.32, 0.16), { position: [side * 0.19, 0.56, -0.06], rotation: [0.16, 0, 0], color: suit });
    push(new BoxGeometry(0.13, 0.1, 0.22), { position: [side * 0.19, 0.38, -0.02], color: LIGHT });
  }

  return mergeParts(parts);
}

/** Builds one low-poly sportbike. Geometry is cached per style by BikeFactory. */
export function buildSportbike(style) {
  return {
    body: buildBody(style),
    steering: buildSteering(style),
    rider: buildRider(style),
    wheel: buildWheel(style),
  };
}

const geometryCache = new Map();

export function getSportbikeGeometry(style) {
  let cached = geometryCache.get(style.id);
  if (!cached) {
    cached = buildSportbike(style);
    geometryCache.set(style.id, cached);
  }
  return cached;
}

export function disposeSportbikeGeometry() {
  for (const geo of geometryCache.values()) {
    geo.body.dispose();
    geo.steering.dispose();
    geo.rider.dispose();
    geo.wheel.dispose();
  }
  geometryCache.clear();
}
