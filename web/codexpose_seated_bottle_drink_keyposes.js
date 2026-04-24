(function (global) {
  "use strict";

  const registry = global.codexPoseMotionKeyposes || {};
  const frameCount = 72;
  const fps = 24;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function smoothstep(value) {
    const t = clamp(value, 0, 1);
    return t * t * (3 - t * 2);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function round(value) {
    return Number(value.toFixed(3));
  }

  function vec(x, y, z) {
    return [round(x), round(y), round(z)];
  }

  function lerpVec(a, b, t) {
    return vec(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));
  }

  function pointLerp(a, b, alpha) {
    return vec(
      lerp(a[0], b[0], alpha),
      lerp(a[1], b[1], alpha),
      lerp(a[2], b[2], alpha)
    );
  }

  function floorFoot(side) {
    return {
      ankle: vec(side * 13.2, 8.1, 37.0),
      toe: vec(side * 14.0, 1.05, 51.5),
      planted: true
    };
  }

  const chair = {
    seatCenter: vec(0, 47, -12),
    seatSize: vec(52, 6, 44),
    backCenter: vec(0, 79, -35),
    backSize: vec(52, 62, 6),
    legHeight: 47
  };

  const table = {
    topCenter: vec(36, 62, 24),
    topSize: vec(48, 5, 40),
    legHeight: 61
  };

  function armPoints(clavicle, hand, side, elbowLift, elbowForward) {
    const elbowBase = pointLerp(clavicle, hand, 0.35);
    return {
      elbow: vec(elbowBase[0] + side * 4.0, elbowBase[1] + elbowLift, elbowBase[2] + elbowForward),
      hand
    };
  }

  function makePoints(key) {
    const pelvis = key.pelvis.slice(0, 3);
    const forwardLean = key.chest[0] * 0.18;
    const reachSide = key.chest[1] * 0.045;
    const spine = vec(pelvis[0] + reachSide * 0.26, pelvis[1] + 23.5, pelvis[2] + forwardLean * 0.9);
    const chest = vec(pelvis[0] + reachSide * 0.68, pelvis[1] + 55.4, pelvis[2] + forwardLean * 2.2);
    const neck = vec(pelvis[0] + reachSide * 0.72, pelvis[1] + 67.2, pelvis[2] + forwardLean * 2.45);
    const head = vec(pelvis[0] + reachSide * 0.76, pelvis[1] + 83.5, pelvis[2] + forwardLean * 2.7);
    const shoulderL = vec(chest[0] + 17.3, chest[1] + 2.8, chest[2] + 1.3);
    const shoulderR = vec(chest[0] - 17.3, chest[1] + 2.8, chest[2] - 1.3);
    const leftArm = armPoints(shoulderL, key.leftHandTarget, 1, -9.0, 1.0);
    const rightArm = armPoints(shoulderR, key.rightHandTarget, -1, -8.0, 2.0);
    const leftFoot = floorFoot(1);
    const rightFoot = floorFoot(-1);

    return {
      pelvis: vec(pelvis[0], pelvis[1], pelvis[2]),
      spine,
      chest,
      neck,
      head,
      shoulder_l: shoulderL,
      elbow_l: leftArm.elbow,
      hand_l: leftArm.hand,
      shoulder_r: shoulderR,
      elbow_r: rightArm.elbow,
      hand_r: rightArm.hand,
      hip_l: vec(pelvis[0] + 10.2, pelvis[1] - 4.4, pelvis[2] + 1.5),
      knee_l: vec(pelvis[0] + 12.0, 43.0, 23.0),
      ankle_l: leftFoot.ankle,
      toe_l: leftFoot.toe,
      hip_r: vec(pelvis[0] - 10.2, pelvis[1] - 4.4, pelvis[2] + 1.5),
      knee_r: vec(pelvis[0] - 12.0, 43.0, 23.0),
      ankle_r: rightFoot.ankle,
      toe_r: rightFoot.toe
    };
  }

  const sourceKeys = [
    {
      frame: 0,
      name: "seated_idle_bottle_on_table",
      pelvis: vec(0, 58.5, -13).concat([-6, -4, 0]),
      chest: [4, 7, 0],
      leftHandTarget: vec(14, 60, 9),
      rightHandTarget: vec(-14, 60, 10),
      bottle: {
        bottom: vec(36, 65, 24),
        top: vec(36, 97, 24),
        center: vec(36, 81, 24),
        contact: "on_table"
      }
    },
    {
      frame: 10,
      name: "lean_and_reach_to_bottle",
      pelvis: vec(1.2, 58.2, -12.5).concat([-8, 4, -2]),
      chest: [14, 18, -4],
      leftHandTarget: vec(13, 60, 9),
      rightHandTarget: vec(26, 80, 22),
      bottle: {
        bottom: vec(36, 65, 24),
        top: vec(36, 97, 24),
        center: vec(36, 81, 24),
        contact: "on_table"
      }
    },
    {
      frame: 18,
      name: "grip_bottle_on_table",
      pelvis: vec(1.8, 58.0, -12).concat([-9, 9, -3]),
      chest: [16, 28, -5],
      leftHandTarget: vec(12, 60, 9),
      rightHandTarget: vec(35, 80, 24),
      bottle: {
        bottom: vec(36, 65, 24),
        top: vec(36, 97, 24),
        center: vec(36, 81, 24),
        contact: "right_hand_grip"
      }
    },
    {
      frame: 28,
      name: "lift_bottle_clear_of_table",
      pelvis: vec(1.0, 58.2, -12.6).concat([-7, 5, -2]),
      chest: [8, 18, -3],
      leftHandTarget: vec(13, 60, 9),
      rightHandTarget: vec(29, 99, 16),
      bottle: {
        bottom: vec(29, 85, 16),
        top: vec(31, 117, 17),
        center: vec(30, 101, 16.5),
        contact: "in_right_hand"
      }
    },
    {
      frame: 38,
      name: "bring_bottle_to_mouth",
      pelvis: vec(0.3, 58.5, -13).concat([-4, 0, -1]),
      chest: [3, 5, -1],
      leftHandTarget: vec(14, 60, 9),
      rightHandTarget: vec(8, 119, 0),
      bottle: {
        bottom: vec(7, 104, -1),
        top: vec(18, 133, 8),
        center: vec(12.5, 118.5, 3.5),
        contact: "near_mouth"
      }
    },
    {
      frame: 46,
      name: "drink_tilt_hold",
      pelvis: vec(0, 58.5, -13).concat([-3, -1, 0]),
      chest: [0, 2, 0],
      leftHandTarget: vec(14, 60, 9),
      rightHandTarget: vec(7, 121, -1),
      bottle: {
        bottom: vec(6, 107, -2),
        top: vec(23, 132, 8),
        center: vec(14.5, 119.5, 3),
        contact: "drinking"
      }
    },
    {
      frame: 56,
      name: "lower_bottle_from_mouth",
      pelvis: vec(0.7, 58.3, -12.5).concat([-6, 4, -1]),
      chest: [5, 12, -2],
      leftHandTarget: vec(14, 60, 9),
      rightHandTarget: vec(28, 99, 16),
      bottle: {
        bottom: vec(28, 85, 16),
        top: vec(30, 117, 17),
        center: vec(29, 101, 16.5),
        contact: "in_right_hand"
      }
    },
    {
      frame: 66,
      name: "return_bottle_to_table",
      pelvis: vec(1.4, 58.1, -12.3).concat([-8, 7, -2]),
      chest: [13, 22, -4],
      leftHandTarget: vec(13, 60, 9),
      rightHandTarget: vec(35, 80, 24),
      bottle: {
        bottom: vec(36, 65, 24),
        top: vec(36, 97, 24),
        center: vec(36, 81, 24),
        contact: "placing_on_table"
      }
    },
    {
      frame: 71,
      name: "seated_settle_bottle_on_table",
      pelvis: vec(0, 58.5, -13).concat([-6, -4, 0]),
      chest: [4, 7, 0],
      leftHandTarget: vec(14, 60, 9),
      rightHandTarget: vec(-14, 60, 10),
      bottle: {
        bottom: vec(36, 65, 24),
        top: vec(36, 97, 24),
        center: vec(36, 81, 24),
        contact: "on_table"
      }
    }
  ];

  function sampleKey(frame) {
    let previous = sourceKeys[0];
    let next = sourceKeys[sourceKeys.length - 1];
    for (let index = 0; index < sourceKeys.length - 1; index += 1) {
      if (frame >= sourceKeys[index].frame && frame <= sourceKeys[index + 1].frame) {
        previous = sourceKeys[index];
        next = sourceKeys[index + 1];
        break;
      }
    }
    const t = smoothstep((frame - previous.frame) / Math.max(1, next.frame - previous.frame));
    return {
      frame,
      name: frame === previous.frame ? previous.name : "seated_bottle_drink_inbetween",
      pelvis: lerpVec(previous.pelvis, next.pelvis, t).concat(lerpVec(previous.pelvis.slice(3), next.pelvis.slice(3), t)),
      chest: lerpVec(previous.chest, next.chest, t),
      leftHandTarget: lerpVec(previous.leftHandTarget, next.leftHandTarget, t),
      rightHandTarget: lerpVec(previous.rightHandTarget, next.rightHandTarget, t),
      bottle: {
        bottom: lerpVec(previous.bottle.bottom, next.bottle.bottom, t),
        top: lerpVec(previous.bottle.top, next.bottle.top, t),
        center: lerpVec(previous.bottle.center, next.bottle.center, t),
        contact: t < 0.5 ? previous.bottle.contact : next.bottle.contact
      }
    };
  }

  function buildFrame(key) {
    return {
      frame: key.frame,
      name: key.name,
      contacts: {
        left: true,
        right: true
      },
      points: makePoints(key),
      props: {
        bottle: key.bottle
      }
    };
  }

  const frames = Array.from({ length: frameCount }, (_, frame) => buildFrame(sampleKey(frame)));

  registry.seatedBottleDrink = {
    id: "seatedBottleDrink",
    name: "Seated Bottle Drink",
    description: "72프레임, 24fps keypose 기반 앉아서 병음료 마시기",
    frameCount,
    fps,
    loop: true,
    keyposeBased: true,
    coordinateSystem: {
      x: "side, positive left",
      y: "up",
      z: "forward"
    },
    units: "centimeters",
    view: {
      targetY: 74,
      radius: 340
    },
    props: {
      chair,
      table,
      bottle: {
        radius: 3.2,
        height: 32
      }
    },
    source: "D:\\github\\ue5_codex\\CodexPose\\web\\manny_seated_bottle_drink_keyposes.js",
    sourceKeys,
    keyposes: sourceKeys.map((key) => buildFrame(key)),
    frames
  };

  global.codexPoseMotionKeyposes = registry;
})(typeof window !== "undefined" ? window : globalThis);
