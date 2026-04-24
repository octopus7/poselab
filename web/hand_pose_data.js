(function (global) {
  "use strict";

  const DEG = Math.PI / 180;
  const sourceImage = "../generated-references/hand-poses-20-reference.png";

  function round(value) {
    return Number(value.toFixed(3));
  }

  function vec(x, y, z) {
    return [round(x), round(y), round(z)];
  }

  function clonePoint(point) {
    return [point[0], point[1], point[2]];
  }

  function lerpPoint(a, b, t) {
    return vec(
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t
    );
  }

  const fingerDefs = {
    thumb: { base: [12.8, -4.0, 1.8], lengths: [8.4, 6.8, 5.6], baseAngle: 31, spread: 0 },
    index: { base: [7.6, 4.2, 0.2], lengths: [13.0, 8.0, 6.0], baseAngle: 92, spread: 9 },
    middle: { base: [2.2, 5.2, 0], lengths: [14.4, 8.8, 6.5], baseAngle: 89, spread: 0 },
    ring: { base: [-3.4, 4.6, 0], lengths: [13.5, 8.2, 6.0], baseAngle: 86, spread: -7 },
    pinky: { base: [-8.4, 3.0, 0.1], lengths: [11.2, 6.8, 5.2], baseAngle: 81, spread: -15 }
  };

  const fingerOrder = ["thumb", "index", "middle", "ring", "pinky"];

  function fingerPoints(name, spec) {
    const def = fingerDefs[name];
    const curl = spec.curl || [0, 0, 0];
    const spread = (spec.spread || 0) + def.spread;
    const zLift = spec.z || 0;
    const depth = spec.depth || 0;
    let current = vec(def.base[0] + (spec.offsetX || 0), def.base[1] + (spec.offsetY || 0), def.base[2] + zLift);
    const points = [current];

    if (name !== "thumb") {
      const side = def.base[0] >= 0 ? 1 : -1;
      let curlTotal = 0;
      def.lengths.forEach((length, index) => {
        curlTotal = Math.min(162, curlTotal + curl[index]);
        const curlAngle = curlTotal * DEG;
        const spreadAngle = spread * DEG;
        current = vec(
          current[0] + side * Math.sin(spreadAngle) * length * 0.55,
          current[1] + Math.cos(curlAngle) * length,
          current[2] + Math.sin(curlAngle) * length * 0.72 + depth * (index + 1)
        );
        points.push(current);
      });
      return points;
    }

    let curlTotal = 0;
    def.lengths.forEach((length, index) => {
      curlTotal = Math.min(155, curlTotal + curl[index]);
      const fanAngle = (def.baseAngle + spread) * DEG;
      const curlAngle = curlTotal * DEG;
      current = vec(
        current[0] + Math.cos(fanAngle) * Math.cos(curlAngle) * length,
        current[1] + Math.sin(fanAngle) * Math.cos(curlAngle) * length,
        current[2] + Math.sin(curlAngle) * length * 0.82 + depth * (index + 1)
      );
      points.push(current);
    });

    return points;
  }

  function defaultFingers() {
    return {
      thumb: { curl: [8, 8, 5], spread: 0, depth: 0.2 },
      index: { curl: [6, 8, 4], spread: -2, depth: 0 },
      middle: { curl: [4, 7, 4], spread: 0, depth: 0 },
      ring: { curl: [7, 10, 6], spread: 1, depth: 0 },
      pinky: { curl: [10, 13, 8], spread: 4, depth: 0 }
    };
  }

  function mergeFingers(overrides) {
    const result = defaultFingers();
    Object.keys(overrides || {}).forEach((name) => {
      result[name] = { ...result[name], ...overrides[name] };
    });
    return result;
  }

  function buildPose(definition) {
    const fingers = mergeFingers(definition.fingers);
    const points = {
      wrist: vec(0, -17.2, 0),
      palm: vec(0, -2.8, 0.7),
      palm_l: vec(-11.2, -4.2, 0.4),
      palm_r: vec(10.7, -3.9, 0.2)
    };

    fingerOrder.forEach((name) => {
      const chain = fingerPoints(name, fingers[name]);
      const prefix = name === "thumb" ? "thumb" : name;
      if (name === "thumb") {
        points.thumb_cmc = chain[0];
        points.thumb_mcp = chain[1];
        points.thumb_ip = chain[2];
        points.thumb_tip = chain[3];
      } else {
        points[`${prefix}_mcp`] = chain[0];
        points[`${prefix}_pip`] = chain[1];
        points[`${prefix}_dip`] = chain[2];
        points[`${prefix}_tip`] = chain[3];
      }
    });

    (definition.touches || []).forEach(([a, b, t]) => {
      const blended = lerpPoint(points[a], points[b], t ?? 0.5);
      points[a] = clonePoint(blended);
      points[b] = clonePoint(blended);
    });

    Object.entries(definition.pointOverrides || {}).forEach(([name, point]) => {
      points[name] = point;
    });

    return {
      id: definition.id,
      name: definition.name,
      sourceCell: definition.sourceCell,
      sourceImage,
      palmRotation: definition.palmRotation || [0, 0, 0],
      view: definition.view || { theta: -0.7, phi: 1.18, radius: 78 },
      prop: definition.prop || null,
      points
    };
  }

  const poseDefs = [
    {
      id: "relaxedOpen",
      name: "Relaxed Open",
      sourceCell: 1,
      fingers: {
        thumb: { curl: [8, 7, 5], spread: -4 },
        index: { curl: [6, 8, 4], spread: -9 },
        middle: { curl: [4, 7, 4], spread: 0 },
        ring: { curl: [7, 10, 6], spread: 8 },
        pinky: { curl: [10, 13, 8], spread: 17 }
      }
    },
    {
      id: "flatPalm",
      name: "Flat Palm",
      sourceCell: 2,
      palmRotation: [0, 0, -70],
      fingers: {
        thumb: { curl: [3, 2, 0], spread: -8 },
        index: { curl: [0, 0, 0], spread: -2 },
        middle: { curl: [0, 0, 0], spread: 0 },
        ring: { curl: [0, 0, 0], spread: 2 },
        pinky: { curl: [0, 0, 0], spread: 4 }
      }
    },
    {
      id: "closedFist",
      name: "Closed Fist",
      sourceCell: 3,
      fingers: {
        thumb: { curl: [42, 36, 18], spread: -20, depth: 2.2 },
        index: { curl: [76, 92, 62], spread: -4, depth: 2.5 },
        middle: { curl: [78, 96, 66], depth: 2.7 },
        ring: { curl: [78, 94, 66], spread: 3, depth: 2.8 },
        pinky: { curl: [74, 88, 60], spread: 7, depth: 2.8 }
      },
      pointOverrides: {
        thumb_cmc: vec(12.8, -4.0, 1.8),
        thumb_mcp: vec(9.4, -4.6, 5.4),
        thumb_ip: vec(4.4, -3.2, 7.2),
        thumb_tip: vec(-1.8, -2.2, 7.0),
        index_mcp: vec(7.6, 4.2, 0.8),
        index_pip: vec(7.0, 6.4, 3.8),
        index_dip: vec(5.0, 4.2, 6.2),
        index_tip: vec(2.6, 1.6, 6.0),
        middle_mcp: vec(2.2, 5.2, 0.8),
        middle_pip: vec(2.0, 6.8, 4.2),
        middle_dip: vec(0.6, 4.3, 6.8),
        middle_tip: vec(-0.8, 1.5, 6.6),
        ring_mcp: vec(-3.4, 4.6, 0.8),
        ring_pip: vec(-3.2, 6.2, 3.8),
        ring_dip: vec(-4.4, 3.9, 6.2),
        ring_tip: vec(-4.8, 1.1, 5.9),
        pinky_mcp: vec(-8.4, 3.0, 0.8),
        pinky_pip: vec(-8.0, 5.0, 3.2),
        pinky_dip: vec(-7.8, 2.9, 5.4),
        pinky_tip: vec(-6.8, 0.8, 5.2)
      }
    },
    {
      id: "pointIndex",
      name: "Point Index",
      sourceCell: 4,
      palmRotation: [0, 0, -70],
      fingers: {
        thumb: { curl: [34, 18, 8], spread: -22 },
        index: { curl: [0, 0, 0], spread: -1 },
        middle: { curl: [70, 88, 58], spread: 2, depth: 2.5 },
        ring: { curl: [76, 92, 62], spread: 5, depth: 2.7 },
        pinky: { curl: [78, 88, 60], spread: 9, depth: 2.8 }
      }
    },
    {
      id: "pinch",
      name: "Pinch",
      sourceCell: 5,
      fingers: {
        thumb: { curl: [25, 28, 16], spread: -8, depth: 1.4 },
        index: { curl: [38, 48, 26], spread: -8, depth: 1.2 },
        middle: { curl: [68, 82, 54], spread: 1, depth: 2.4 },
        ring: { curl: [74, 88, 58], spread: 5, depth: 2.7 },
        pinky: { curl: [76, 84, 56], spread: 9, depth: 2.9 }
      },
      touches: [["thumb_tip", "index_tip", 0.5]]
    },
    {
      id: "smallStoneGrip",
      name: "Small Stone Grip",
      sourceCell: 6,
      prop: { type: "stone", position: [1.5, 10.5, 7.5], radius: 8.2 },
      fingers: {
        thumb: { curl: [30, 28, 16], spread: -12, depth: 2.0 },
        index: { curl: [45, 56, 34], spread: -3, depth: 2.1 },
        middle: { curl: [48, 60, 38], depth: 2.2 },
        ring: { curl: [50, 62, 40], spread: 4, depth: 2.3 },
        pinky: { curl: [48, 58, 36], spread: 8, depth: 2.3 }
      }
    },
    {
      id: "throwRelease",
      name: "Throw Release",
      sourceCell: 7,
      prop: { type: "stone", position: [27, 20, 5], radius: 5.2 },
      fingers: {
        thumb: { curl: [4, 4, 2], spread: -10, depth: -0.2 },
        index: { curl: [12, 16, 8], spread: -12, depth: 0.3 },
        middle: { curl: [20, 24, 10], spread: 0, depth: 0.7 },
        ring: { curl: [28, 32, 15], spread: 8, depth: 0.9 },
        pinky: { curl: [34, 38, 18], spread: 16, depth: 1.0 }
      }
    },
    {
      id: "thumbsUp",
      name: "Thumbs Up",
      sourceCell: 8,
      fingers: {
        thumb: { curl: [0, 0, 0], spread: 59, depth: -0.2 },
        index: { curl: [78, 92, 62], spread: -4, depth: 2.5 },
        middle: { curl: [80, 96, 66], depth: 2.6 },
        ring: { curl: [80, 94, 64], spread: 4, depth: 2.7 },
        pinky: { curl: [78, 88, 58], spread: 8, depth: 2.8 }
      }
    },
    {
      id: "okSign",
      name: "OK Sign",
      sourceCell: 9,
      fingers: {
        thumb: { curl: [22, 28, 14], spread: -4, depth: 1.4 },
        index: { curl: [44, 58, 30], spread: -5, depth: 1.3 },
        middle: { curl: [2, 3, 2], spread: 0 },
        ring: { curl: [3, 5, 3], spread: 7 },
        pinky: { curl: [5, 7, 4], spread: 14 }
      },
      touches: [["thumb_tip", "index_tip", 0.5]]
    },
    {
      id: "peaceSign",
      name: "Peace Sign",
      sourceCell: 10,
      fingers: {
        thumb: { curl: [36, 24, 12], spread: -20 },
        index: { curl: [0, 0, 0], spread: -13 },
        middle: { curl: [0, 0, 0], spread: 10 },
        ring: { curl: [72, 90, 60], spread: 4, depth: 2.7 },
        pinky: { curl: [74, 86, 58], spread: 8, depth: 2.9 }
      }
    },
    {
      id: "claw",
      name: "Claw",
      sourceCell: 11,
      fingers: {
        thumb: { curl: [18, 28, 18], spread: -12, depth: 1.4 },
        index: { curl: [36, 46, 32], spread: -15, depth: 1.3 },
        middle: { curl: [34, 48, 34], spread: -2, depth: 1.4 },
        ring: { curl: [38, 50, 34], spread: 9, depth: 1.5 },
        pinky: { curl: [42, 52, 36], spread: 19, depth: 1.6 }
      }
    },
    {
      id: "cuppedPalm",
      name: "Cupped Palm",
      sourceCell: 12,
      palmRotation: [20, 0, -58],
      fingers: {
        thumb: { curl: [12, 18, 10], spread: -8, depth: 1.2 },
        index: { curl: [22, 26, 16], spread: -8, depth: 1.1 },
        middle: { curl: [25, 30, 18], spread: 0, depth: 1.2 },
        ring: { curl: [27, 32, 18], spread: 7, depth: 1.2 },
        pinky: { curl: [30, 34, 20], spread: 13, depth: 1.3 }
      }
    },
    {
      id: "hookFingers",
      name: "Hook Fingers",
      sourceCell: 13,
      palmRotation: [0, 0, -70],
      fingers: {
        thumb: { curl: [16, 20, 8], spread: -15 },
        index: { curl: [8, 72, 56], spread: -8, depth: 2.0 },
        middle: { curl: [8, 76, 58], spread: 0, depth: 2.1 },
        ring: { curl: [10, 74, 56], spread: 6, depth: 2.2 },
        pinky: { curl: [12, 68, 52], spread: 12, depth: 2.3 }
      }
    },
    {
      id: "phoneHand",
      name: "Phone Hand",
      sourceCell: 14,
      fingers: {
        thumb: { curl: [0, 0, 0], spread: -18, depth: -0.2 },
        index: { curl: [78, 92, 62], spread: -3, depth: 2.6 },
        middle: { curl: [80, 96, 66], depth: 2.7 },
        ring: { curl: [76, 92, 62], spread: 4, depth: 2.7 },
        pinky: { curl: [0, 0, 0], spread: 24, depth: -0.1 }
      }
    },
    {
      id: "wideSpread",
      name: "Wide Spread",
      sourceCell: 15,
      fingers: {
        thumb: { curl: [0, 0, 0], spread: -22 },
        index: { curl: [0, 0, 0], spread: -20 },
        middle: { curl: [0, 0, 0], spread: -2 },
        ring: { curl: [0, 0, 0], spread: 16 },
        pinky: { curl: [0, 0, 0], spread: 31 }
      }
    },
    {
      id: "edgeGrab",
      name: "Edge Grab",
      sourceCell: 16,
      prop: { type: "edge", position: [4, 10, 7], size: [30, 5, 5] },
      palmRotation: [0, 0, -72],
      fingers: {
        thumb: { curl: [22, 28, 12], spread: -18, depth: 1.5 },
        index: { curl: [48, 56, 28], spread: -4, depth: 1.9 },
        middle: { curl: [50, 60, 30], depth: 2.0 },
        ring: { curl: [50, 60, 30], spread: 4, depth: 2.0 },
        pinky: { curl: [48, 56, 28], spread: 8, depth: 2.1 }
      }
    },
    {
      id: "triggerFinger",
      name: "Trigger Finger",
      sourceCell: 17,
      fingers: {
        thumb: { curl: [0, 0, 0], spread: -12 },
        index: { curl: [6, 16, 8], spread: -4, depth: 0.4 },
        middle: { curl: [76, 90, 60], depth: 2.6 },
        ring: { curl: [78, 92, 62], spread: 4, depth: 2.7 },
        pinky: { curl: [78, 88, 60], spread: 9, depth: 2.8 }
      }
    },
    {
      id: "cylinderGrip",
      name: "Cylinder Grip",
      sourceCell: 18,
      prop: { type: "cylinder", position: [2, 10, 6], radius: 7, height: 30 },
      fingers: {
        thumb: { curl: [28, 28, 14], spread: -12, depth: 1.7 },
        index: { curl: [52, 58, 36], spread: -2, depth: 2.2 },
        middle: { curl: [55, 62, 38], depth: 2.3 },
        ring: { curl: [55, 62, 38], spread: 4, depth: 2.4 },
        pinky: { curl: [52, 58, 34], spread: 8, depth: 2.5 }
      }
    },
    {
      id: "palmDown",
      name: "Palm Down",
      sourceCell: 19,
      palmRotation: [0, 180, -70],
      fingers: {
        thumb: { curl: [2, 2, 0], spread: -8 },
        index: { curl: [0, 0, 0], spread: -3 },
        middle: { curl: [0, 0, 0], spread: 0 },
        ring: { curl: [0, 0, 0], spread: 3 },
        pinky: { curl: [0, 0, 0], spread: 6 }
      }
    },
    {
      id: "palmUp",
      name: "Palm Up",
      sourceCell: 20,
      palmRotation: [22, 0, -58],
      fingers: {
        thumb: { curl: [3, 4, 2], spread: -11 },
        index: { curl: [3, 4, 2], spread: -3 },
        middle: { curl: [3, 4, 2], spread: 0 },
        ring: { curl: [4, 5, 3], spread: 3 },
        pinky: { curl: [5, 6, 3], spread: 7 }
      }
    }
  ];

  global.codexPoseHandPoses = poseDefs.map(buildPose);
})(typeof window !== "undefined" ? window : globalThis);
