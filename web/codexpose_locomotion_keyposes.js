(function (global) {
  "use strict";

  const registry = global.codexPoseMotionKeyposes || {};

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(t) {
    const x = clamp(t, 0, 1);
    return x * x * (3 - x * 2);
  }

  function round(value) {
    return Number(value.toFixed(3));
  }

  function vec(x, y, z) {
    return [round(x), round(y), round(z)];
  }

  function add(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }

  function lerpVec(a, b, t) {
    return vec(
      lerp(a[0], b[0], t),
      lerp(a[1], b[1], t),
      lerp(a[2], b[2], t)
    );
  }

  function blendFoot(a, b, t) {
    return {
      ankle: lerpVec(a.ankle, b.ankle, t),
      toe: lerpVec(a.toe, b.toe, t),
      planted: t < 0.5 ? Boolean(a.planted) : Boolean(b.planted),
      kneeForward: round(lerp(a.kneeForward, b.kneeForward, t)),
      kneeLift: round(lerp(a.kneeLift, b.kneeLift, t))
    };
  }

  function blendKey(a, b, frame, frameCount) {
    const span = Math.max(1, b.frame - a.frame);
    const t = smoothstep((frame - a.frame) / span);
    const leftArmDrive = round(lerp(a.leftArmDrive, b.leftArmDrive, t));
    const rightArmDrive = round(lerp(a.rightArmDrive, b.rightArmDrive, t));

    return {
      frame: frame % frameCount,
      name: t < 0.5 ? a.name : b.name,
      root: lerpVec(a.root, b.root, t),
      forwardLean: round(lerp(a.forwardLean, b.forwardLean, t)),
      hipTwist: round(lerp(a.hipTwist, b.hipTwist, t)),
      chestTwist: round(lerp(a.chestTwist, b.chestTwist, t)),
      hipRoll: round(lerp(a.hipRoll, b.hipRoll, t)),
      leftFoot: blendFoot(a.leftFoot, b.leftFoot, t),
      rightFoot: blendFoot(a.rightFoot, b.rightFoot, t),
      leftArmDrive,
      rightArmDrive
    };
  }

  function sourceAt(keys, frame, frameCount) {
    const wrappedFrame = ((frame % frameCount) + frameCount) % frameCount;
    const extended = keys.concat([{ ...keys[0], frame: frameCount, name: `${keys[0].name}_loop` }]);

    for (let index = 0; index < extended.length - 1; index += 1) {
      const a = extended[index];
      const b = extended[index + 1];
      if (wrappedFrame >= a.frame && wrappedFrame <= b.frame) {
        return blendKey(a, b, wrappedFrame, frameCount);
      }
    }

    return blendKey(extended[extended.length - 2], extended[extended.length - 1], wrappedFrame, frameCount);
  }

  function solveKnee(side, hip, foot) {
    const ankle = foot.ankle;
    const mid = lerpVec(hip, ankle, 0.53);
    return vec(
      mid[0] + side * (1.4 + Math.max(0, foot.kneeLift) * 0.16),
      mid[1] + foot.kneeLift,
      mid[2] + foot.kneeForward
    );
  }

  function buildArm(side, shoulder, drive, fast) {
    const pump = Math.abs(drive);
    const elbowDrop = fast ? 14.5 : 21.0;
    const handDrop = fast ? 12.8 : 17.5;
    const armReach = fast ? 36 : 19;
    const elbow = add(shoulder, vec(
      side * (4.8 + pump * 1.3),
      -elbowDrop + Math.max(0, drive) * (fast ? 4.6 : 3.1),
      drive * armReach * 0.46
    ));
    const hand = add(elbow, vec(
      side * (2.8 + pump * 1.1),
      -handDrop + Math.max(0, drive) * (fast ? 7.8 : 3.5),
      drive * armReach * 0.58
    ));

    return { elbow, hand };
  }

  function buildFrame(source, fast) {
    const pelvis = source.root;
    const spine = add(pelvis, vec(0, 19, source.forwardLean * 0.36));
    const chest = add(spine, vec(0, 25, source.forwardLean));
    const neck = add(chest, vec(0, 15, source.forwardLean * 0.22));
    const head = add(neck, vec(0, 12, source.forwardLean * 0.12));
    const shoulderL = add(chest, vec(22, 1.5, -source.chestTwist));
    const shoulderR = add(chest, vec(-22, 1.5, source.chestTwist));
    const hipL = add(pelvis, vec(10.5, -2.5 - source.hipRoll, -source.hipTwist * 0.34));
    const hipR = add(pelvis, vec(-10.5, -2.5 + source.hipRoll, source.hipTwist * 0.34));
    const leftArm = buildArm(1, shoulderL, source.leftArmDrive, fast);
    const rightArm = buildArm(-1, shoulderR, source.rightArmDrive, fast);
    const kneeL = solveKnee(1, hipL, source.leftFoot);
    const kneeR = solveKnee(-1, hipR, source.rightFoot);

    return {
      frame: source.frame,
      name: source.name,
      contacts: {
        left: source.leftFoot.planted,
        right: source.rightFoot.planted
      },
      points: {
        pelvis,
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
        hip_l: hipL,
        knee_l: kneeL,
        ankle_l: source.leftFoot.ankle,
        toe_l: source.leftFoot.toe,
        hip_r: hipR,
        knee_r: kneeR,
        ankle_r: source.rightFoot.ankle,
        toe_r: source.rightFoot.toe
      }
    };
  }

  function buildMotion(definition) {
    const frames = Array.from({ length: definition.frameCount }, (_, frame) => {
      const source = sourceAt(definition.sourceKeys, frame, definition.frameCount);
      return buildFrame(source, definition.fast);
    });
    const keyposes = definition.sourceKeys.map((source) => buildFrame(source, definition.fast));

    return {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      frameCount: definition.frameCount,
      fps: definition.fps,
      loop: true,
      coordinateSystem: {
        x: "side, positive left",
        y: "up",
        z: "forward"
      },
      units: "centimeters",
      keyposeBased: true,
      sourceKeys: definition.sourceKeys,
      keyposes,
      frames
    };
  }

  function foot(side, ankleY, ankleZ, toeY, toeZ, planted, kneeForward, kneeLift) {
    const x = side * 9.6;
    return {
      ankle: vec(x, ankleY, ankleZ),
      toe: vec(x + side * 0.9, toeY, toeZ),
      planted,
      kneeForward,
      kneeLift
    };
  }

  registry.walk = buildMotion({
    id: "walk",
    name: "Walk Cycle",
    description: "48-frame keypose walk loop",
    frameCount: 48,
    fps: 24,
    fast: false,
    sourceKeys: [
      {
        frame: 0,
        name: "right_contact_left_toe_off",
        root: vec(0, 93.6, 0),
        forwardLean: 3.5,
        hipTwist: 4.8,
        chestTwist: -5.2,
        hipRoll: 1.0,
        leftFoot: foot(1, 9.5, -24, 1.8, -9, true, 7.5, 0),
        rightFoot: foot(-1, 8.0, 27, 1.2, 42, true, 4.2, -1.2),
        leftArmDrive: 1.0,
        rightArmDrive: -1.0
      },
      {
        frame: 6,
        name: "right_loading_left_lift",
        root: vec(1.6, 94.4, 0),
        forwardLean: 3.7,
        hipTwist: 3.0,
        chestTwist: -3.5,
        hipRoll: 0.7,
        leftFoot: foot(1, 13.5, -14, 3.8, 1, false, 10, 3.5),
        rightFoot: foot(-1, 8.2, 15, 1.1, 30, true, 4.8, -1.0),
        leftArmDrive: 0.55,
        rightArmDrive: -0.55
      },
      {
        frame: 12,
        name: "right_mid_stance_left_passing",
        root: vec(0.9, 95.4, 0),
        forwardLean: 3.6,
        hipTwist: -0.6,
        chestTwist: 0.8,
        hipRoll: 0.3,
        leftFoot: foot(1, 18.0, 2, 6.0, 20, false, 12, 6),
        rightFoot: foot(-1, 8.4, 2, 1.1, 17, true, 5.0, -0.8),
        leftArmDrive: -0.1,
        rightArmDrive: 0.1
      },
      {
        frame: 18,
        name: "right_heel_off_left_reach",
        root: vec(-0.7, 94.5, 0),
        forwardLean: 3.7,
        hipTwist: -3.0,
        chestTwist: 3.4,
        hipRoll: -0.6,
        leftFoot: foot(1, 11.0, 24, 2.5, 39, false, 9, 2),
        rightFoot: foot(-1, 8.8, -14, 1.3, 1, true, 6, 0),
        leftArmDrive: -0.65,
        rightArmDrive: 0.65
      },
      {
        frame: 24,
        name: "left_contact_right_toe_off",
        root: vec(0, 93.6, 0),
        forwardLean: 3.5,
        hipTwist: -4.8,
        chestTwist: 5.2,
        hipRoll: -1.0,
        leftFoot: foot(1, 8.0, 27, 1.2, 42, true, 4.2, -1.2),
        rightFoot: foot(-1, 9.5, -24, 1.8, -9, true, 7.5, 0),
        leftArmDrive: -1.0,
        rightArmDrive: 1.0
      },
      {
        frame: 30,
        name: "left_loading_right_lift",
        root: vec(-1.6, 94.4, 0),
        forwardLean: 3.7,
        hipTwist: -3.0,
        chestTwist: 3.5,
        hipRoll: -0.7,
        leftFoot: foot(1, 8.2, 15, 1.1, 30, true, 4.8, -1.0),
        rightFoot: foot(-1, 13.5, -14, 3.8, 1, false, 10, 3.5),
        leftArmDrive: -0.55,
        rightArmDrive: 0.55
      },
      {
        frame: 36,
        name: "left_mid_stance_right_passing",
        root: vec(-0.9, 95.4, 0),
        forwardLean: 3.6,
        hipTwist: 0.6,
        chestTwist: -0.8,
        hipRoll: -0.3,
        leftFoot: foot(1, 8.4, 2, 1.1, 17, true, 5.0, -0.8),
        rightFoot: foot(-1, 18.0, 2, 6.0, 20, false, 12, 6),
        leftArmDrive: 0.1,
        rightArmDrive: -0.1
      },
      {
        frame: 42,
        name: "left_heel_off_right_reach",
        root: vec(0.7, 94.5, 0),
        forwardLean: 3.7,
        hipTwist: 3.0,
        chestTwist: -3.4,
        hipRoll: 0.6,
        leftFoot: foot(1, 8.8, -14, 1.3, 1, true, 6, 0),
        rightFoot: foot(-1, 11.0, 24, 2.5, 39, false, 9, 2),
        leftArmDrive: 0.65,
        rightArmDrive: -0.65
      }
    ]
  });

  registry.run = buildMotion({
    id: "run",
    name: "Run Cycle",
    description: "32-frame keypose run loop with flight",
    frameCount: 32,
    fps: 32,
    fast: true,
    sourceKeys: [
      {
        frame: 0,
        name: "right_strike_load",
        root: vec(0, 93.2, 0),
        forwardLean: 13.0,
        hipTwist: 6.8,
        chestTwist: -8.2,
        hipRoll: 0.7,
        leftFoot: foot(1, 28, -18, 12, -2, false, 24, 16),
        rightFoot: foot(-1, 8.0, 22, 1.2, 38, true, 8, -1.0),
        leftArmDrive: 1.05,
        rightArmDrive: -1.05
      },
      {
        frame: 4,
        name: "right_push_left_recover",
        root: vec(0.8, 96.5, 0),
        forwardLean: 13.5,
        hipTwist: -3.2,
        chestTwist: 4.2,
        hipRoll: 0.4,
        leftFoot: foot(1, 34, 8, 15, 24, false, 26, 17),
        rightFoot: foot(-1, 9.0, -10, 1.8, 5, true, 12, 0),
        leftArmDrive: -0.35,
        rightArmDrive: 0.35
      },
      {
        frame: 8,
        name: "flight_left_knee_drive",
        root: vec(0, 103.0, 0),
        forwardLean: 12.9,
        hipTwist: -2.4,
        chestTwist: 3.0,
        hipRoll: -0.4,
        leftFoot: foot(1, 25, 30, 9, 46, false, 20, 9),
        rightFoot: foot(-1, 33, -22, 14, -7, false, 27, 17),
        leftArmDrive: -0.65,
        rightArmDrive: 0.65
      },
      {
        frame: 12,
        name: "left_pre_strike",
        root: vec(-0.5, 98.5, 0),
        forwardLean: 13.2,
        hipTwist: -5.8,
        chestTwist: 7.0,
        hipRoll: -0.7,
        leftFoot: foot(1, 12, 34, 3.4, 50, false, 12, 2),
        rightFoot: foot(-1, 30, -6, 12, 8, false, 24, 14),
        leftArmDrive: -1.05,
        rightArmDrive: 1.05
      },
      {
        frame: 16,
        name: "left_strike_load",
        root: vec(0, 93.2, 0),
        forwardLean: 13.0,
        hipTwist: -6.8,
        chestTwist: 8.2,
        hipRoll: -0.7,
        leftFoot: foot(1, 8.0, 22, 1.2, 38, true, 8, -1.0),
        rightFoot: foot(-1, 28, -18, 12, -2, false, 24, 16),
        leftArmDrive: -1.05,
        rightArmDrive: 1.05
      },
      {
        frame: 20,
        name: "left_push_right_recover",
        root: vec(-0.8, 96.5, 0),
        forwardLean: 13.5,
        hipTwist: 3.2,
        chestTwist: -4.2,
        hipRoll: -0.4,
        leftFoot: foot(1, 9.0, -10, 1.8, 5, true, 12, 0),
        rightFoot: foot(-1, 34, 8, 15, 24, false, 26, 17),
        leftArmDrive: 0.35,
        rightArmDrive: -0.35
      },
      {
        frame: 24,
        name: "flight_right_knee_drive",
        root: vec(0, 103.0, 0),
        forwardLean: 12.9,
        hipTwist: 2.4,
        chestTwist: -3.0,
        hipRoll: 0.4,
        leftFoot: foot(1, 33, -22, 14, -7, false, 27, 17),
        rightFoot: foot(-1, 25, 30, 9, 46, false, 20, 9),
        leftArmDrive: 0.65,
        rightArmDrive: -0.65
      },
      {
        frame: 28,
        name: "right_pre_strike",
        root: vec(0.5, 98.5, 0),
        forwardLean: 13.2,
        hipTwist: 5.8,
        chestTwist: -7.0,
        hipRoll: 0.7,
        leftFoot: foot(1, 30, -6, 12, 8, false, 24, 14),
        rightFoot: foot(-1, 12, 34, 3.4, 50, false, 12, 2),
        leftArmDrive: 1.05,
        rightArmDrive: -1.05
      }
    ]
  });

  registry.sprint = buildMotion({
    id: "sprint",
    name: "Sprint Cycle",
    description: "32-frame keypose sprint loop",
    frameCount: 32,
    fps: 36,
    fast: true,
    sourceKeys: [
      {
        frame: 0,
        name: "right_strike_under_body",
        root: vec(0, 92.3, 0),
        forwardLean: 19.5,
        hipTwist: 8.0,
        chestTwist: -10.5,
        hipRoll: 0.4,
        leftFoot: foot(1, 35, -18, 15, -2, false, 34, 22),
        rightFoot: foot(-1, 8.0, 18, 1.2, 34, true, 10, -1.2),
        leftArmDrive: 1.18,
        rightArmDrive: -1.18
      },
      {
        frame: 2,
        name: "right_drive_arm_switch",
        root: vec(0.3, 96.6, 0),
        forwardLean: 20.2,
        hipTwist: -1.8,
        chestTwist: 6.4,
        hipRoll: 0.1,
        leftFoot: foot(1, 40, 0, 17, 17, false, 35, 23),
        rightFoot: foot(-1, 9.2, -4, 2.0, 12, true, 15, 0),
        leftArmDrive: -0.95,
        rightArmDrive: 0.95
      },
      {
        frame: 4,
        name: "right_drive_off",
        root: vec(0.6, 100.5, 0),
        forwardLean: 20.5,
        hipTwist: -3.6,
        chestTwist: 4.6,
        hipRoll: 0.2,
        leftFoot: foot(1, 45, 18, 19, 36, false, 36, 24),
        rightFoot: foot(-1, 10.5, -26, 2.5, -10, true, 18, 2),
        leftArmDrive: -1.18,
        rightArmDrive: 1.18
      },
      {
        frame: 8,
        name: "flight_left_knee_high",
        root: vec(0, 106.0, 0),
        forwardLean: 19.0,
        hipTwist: -2.8,
        chestTwist: 3.4,
        hipRoll: -0.3,
        leftFoot: foot(1, 26, 43, 9, 60, false, 23, 10),
        rightFoot: foot(-1, 48, -26, 20, -10, false, 39, 26),
        leftArmDrive: -0.78,
        rightArmDrive: 0.78
      },
      {
        frame: 12,
        name: "left_pre_strike",
        root: vec(-0.4, 99.0, 0),
        forwardLean: 19.8,
        hipTwist: -7.2,
        chestTwist: 9.4,
        hipRoll: -0.4,
        leftFoot: foot(1, 12.5, 31, 3.5, 48, false, 14, 1),
        rightFoot: foot(-1, 39, -8, 16, 8, false, 34, 22),
        leftArmDrive: -1.18,
        rightArmDrive: 1.18
      },
      {
        frame: 16,
        name: "left_strike_under_body",
        root: vec(0, 92.3, 0),
        forwardLean: 19.5,
        hipTwist: -8.0,
        chestTwist: 10.5,
        hipRoll: -0.4,
        leftFoot: foot(1, 8.0, 18, 1.2, 34, true, 10, -1.2),
        rightFoot: foot(-1, 35, -18, 15, -2, false, 34, 22),
        leftArmDrive: -1.18,
        rightArmDrive: 1.18
      },
      {
        frame: 18,
        name: "left_drive_arm_switch",
        root: vec(-0.3, 96.6, 0),
        forwardLean: 20.2,
        hipTwist: 1.8,
        chestTwist: -6.4,
        hipRoll: -0.1,
        leftFoot: foot(1, 9.2, -4, 2.0, 12, true, 15, 0),
        rightFoot: foot(-1, 40, 0, 17, 17, false, 35, 23),
        leftArmDrive: 0.95,
        rightArmDrive: -0.95
      },
      {
        frame: 20,
        name: "left_drive_off",
        root: vec(-0.6, 100.5, 0),
        forwardLean: 20.5,
        hipTwist: 3.6,
        chestTwist: -4.6,
        hipRoll: -0.2,
        leftFoot: foot(1, 10.5, -26, 2.5, -10, true, 18, 2),
        rightFoot: foot(-1, 45, 18, 19, 36, false, 36, 24),
        leftArmDrive: 1.18,
        rightArmDrive: -1.18
      },
      {
        frame: 24,
        name: "flight_right_knee_high",
        root: vec(0, 106.0, 0),
        forwardLean: 19.0,
        hipTwist: 2.8,
        chestTwist: -3.4,
        hipRoll: 0.3,
        leftFoot: foot(1, 48, -26, 20, -10, false, 39, 26),
        rightFoot: foot(-1, 26, 43, 9, 60, false, 23, 10),
        leftArmDrive: 0.78,
        rightArmDrive: -0.78
      },
      {
        frame: 28,
        name: "right_pre_strike",
        root: vec(0.4, 99.0, 0),
        forwardLean: 19.8,
        hipTwist: 7.2,
        chestTwist: -9.4,
        hipRoll: 0.4,
        leftFoot: foot(1, 39, -8, 16, 8, false, 34, 22),
        rightFoot: foot(-1, 12.5, 31, 3.5, 48, false, 14, 1),
        leftArmDrive: 1.18,
        rightArmDrive: -1.18
      }
    ]
  });

  global.codexPoseMotionKeyposes = registry;
})(typeof window !== "undefined" ? window : globalThis);
