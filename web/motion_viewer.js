(() => {
  "use strict";

  const canvas = document.getElementById("motionCanvas");
  const fallback = document.getElementById("fallback");
  const modeSelect = document.getElementById("motionMode");
  const motionName = document.getElementById("motionName");
  const motionDescription = document.getElementById("motionDescription");
  const playToggle = document.getElementById("playToggle");
  const resetMotion = document.getElementById("resetMotion");
  const timeline = document.getElementById("timeline");
  const frameReadout = document.getElementById("frameReadout");
  const speedInput = document.getElementById("speed");
  const speedReadout = document.getElementById("speedReadout");
  const gizmoButtons = Array.from(document.querySelectorAll("[data-view]"));

  if (!window.THREE) {
    fallback.style.display = "grid";
    return;
  }

  const THREE = window.THREE;
  const TAU = Math.PI * 2;
  const MOTIONS = {
    walk: {
      name: "Walk Cycle",
      description: "48프레임, 24fps 안정 보행 루프",
      frameCount: 48,
      fps: 24,
      stanceRatio: 0.62,
      baseY: 94,
      bob: 1.75,
      lateralSway: 2.1,
      stepFront: 21,
      stepBack: -19,
      footLift: 10,
      footSpacing: 9.8,
      forwardLean: 3.5,
      chestCounter: 4.8,
      armReach: 17,
      kneeForward: 5.5,
      kneeSwing: 8,
      kneeLift: 2.5
    },
    run: {
      name: "Run Cycle",
      description: "32프레임, 32fps 체공 포함 뛰기 루프",
      frameCount: 32,
      fps: 32,
      stanceRatio: 0.38,
      baseY: 95.5,
      bob: 5.4,
      lateralSway: 1.25,
      stepFront: 34,
      stepBack: -30,
      footLift: 24,
      footSpacing: 9.4,
      forwardLean: 13,
      chestCounter: 7.5,
      armReach: 31,
      kneeForward: 8,
      kneeSwing: 18,
      kneeLift: 8
    }
  };

  const palette = {
    left: 0x23aeea,
    right: 0xf4a12d,
    center: 0x414a57,
    joint: 0x2f3a49,
    contact: 0x1f9d55,
    ground: 0xcdd6df
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf8fafc);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
  renderer.outputEncoding = THREE.sRGBEncoding;

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1200);
  const target = new THREE.Vector3(0, 84, 0);
  const orbit = { theta: -0.92, phi: 1.24, radius: 315 };

  const hemi = new THREE.HemisphereLight(0xffffff, 0xd8e1ea, 1.28);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 1.65);
  key.position.set(100, 180, 130);
  scene.add(key);

  const grid = new THREE.GridHelper(180, 18, palette.ground, 0xe4ebf2);
  scene.add(grid);

  const travelLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.6, -58),
      new THREE.Vector3(0, 0.6, 58)
    ]),
    new THREE.LineBasicMaterial({ color: 0xb7c5d3, transparent: true, opacity: 0.7 })
  );
  scene.add(travelLine);

  const skeleton = new THREE.Group();
  scene.add(skeleton);

  const materials = {
    left: new THREE.MeshStandardMaterial({ color: palette.left, roughness: 0.62 }),
    right: new THREE.MeshStandardMaterial({ color: palette.right, roughness: 0.62 }),
    center: new THREE.MeshStandardMaterial({ color: palette.center, roughness: 0.58 }),
    joint: new THREE.MeshStandardMaterial({ color: palette.joint, roughness: 0.58 }),
    contact: new THREE.MeshStandardMaterial({ color: palette.contact, roughness: 0.5 }),
    footGhost: new THREE.MeshStandardMaterial({
      color: 0x92a4b6,
      roughness: 0.72,
      transparent: true,
      opacity: 0.55
    })
  };

  const joints = {};
  const jointNames = [
    "pelvis", "spine", "chest", "neck", "head",
    "shoulder_l", "elbow_l", "hand_l",
    "shoulder_r", "elbow_r", "hand_r",
    "hip_l", "knee_l", "ankle_l", "toe_l",
    "hip_r", "knee_r", "ankle_r", "toe_r"
  ];

  const jointGeometry = new THREE.SphereGeometry(2.9, 16, 12);
  jointNames.forEach((name) => {
    const material = name.endsWith("_l") ? materials.left : name.endsWith("_r") ? materials.right : materials.joint;
    const mesh = new THREE.Mesh(jointGeometry, material);
    joints[name] = mesh;
    skeleton.add(mesh);
  });

  const connections = [
    ["pelvis", "spine", "center", 2.4],
    ["spine", "chest", "center", 2.4],
    ["chest", "neck", "center", 2.2],
    ["neck", "head", "center", 2.2],
    ["chest", "shoulder_l", "left", 2.1],
    ["shoulder_l", "elbow_l", "left", 2.0],
    ["elbow_l", "hand_l", "left", 1.8],
    ["chest", "shoulder_r", "right", 2.1],
    ["shoulder_r", "elbow_r", "right", 2.0],
    ["elbow_r", "hand_r", "right", 1.8],
    ["pelvis", "hip_l", "left", 2.2],
    ["hip_l", "knee_l", "left", 2.2],
    ["knee_l", "ankle_l", "left", 2.0],
    ["ankle_l", "toe_l", "left", 1.7],
    ["pelvis", "hip_r", "right", 2.2],
    ["hip_r", "knee_r", "right", 2.2],
    ["knee_r", "ankle_r", "right", 2.0],
    ["ankle_r", "toe_r", "right", 1.7]
  ];

  const boneMeshes = connections.map(([from, to, colorKey, radius]) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 14), materials[colorKey]);
    skeleton.add(mesh);
    return { mesh, from, to };
  });

  const footGeometry = new THREE.BoxGeometry(7.4, 2.2, 19);
  const footPads = {
    left: new THREE.Mesh(footGeometry, materials.left.clone()),
    right: new THREE.Mesh(footGeometry, materials.right.clone())
  };
  skeleton.add(footPads.left, footPads.right);

  const contactGeometry = new THREE.TorusGeometry(8.2, 0.55, 8, 32);
  const contactMarkers = {
    left: new THREE.Mesh(contactGeometry, materials.contact),
    right: new THREE.Mesh(contactGeometry, materials.contact)
  };
  contactMarkers.left.rotation.x = Math.PI / 2;
  contactMarkers.right.rotation.x = Math.PI / 2;
  scene.add(contactMarkers.left, contactMarkers.right);

  let currentMode = "walk";
  let frameIndex = 0;
  let frameCursor = 0;
  let playing = true;
  let speed = 1;
  let lastTime = performance.now();

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

  function vec(x, y, z) {
    return new THREE.Vector3(x, y, z);
  }

  function motionPhase(frame, frameCount) {
    return ((frame % frameCount) + frameCount) / frameCount;
  }

  function sampleFoot(phase, side, cfg) {
    const p = ((phase % 1) + 1) % 1;
    const sideX = side * cfg.footSpacing;
    const planted = p < cfg.stanceRatio;
    let t;
    let z;
    let lift;

    if (planted) {
      t = smoothstep(p / cfg.stanceRatio);
      z = lerp(cfg.stepFront, cfg.stepBack, t);
      lift = 0;
    } else {
      t = smoothstep((p - cfg.stanceRatio) / (1 - cfg.stanceRatio));
      z = lerp(cfg.stepBack, cfg.stepFront, t);
      lift = Math.sin(t * Math.PI);
    }

    const ankleY = planted ? 8.0 + Math.sin(t * Math.PI) * 0.45 : 8.0 + lift * cfg.footLift;
    const toeY = planted ? 1.2 : 1.5 + lift * Math.max(3, cfg.footLift * 0.28);
    const toeReach = planted ? lerp(15.8, 13.8, t) : 15.2 + lift * 2.2;
    const sideSweep = planted ? 0 : side * lift * (currentMode === "run" ? 2.1 : 1.1);

    return {
      ankle: vec(sideX + sideSweep, ankleY, z),
      toe: vec(sideX + side * 0.9 + sideSweep * 0.6, toeY, z + toeReach),
      planted,
      lift,
      phase: p
    };
  }

  function solveLeg(side, hip, foot, cfg) {
    const ankle = foot.ankle;
    const toe = foot.toe;
    const mid = hip.clone().lerp(ankle, 0.53);
    const kneeDirection = ankle.z >= hip.z ? 1 : -1;
    const knee = mid.clone();
    knee.x += side * (1.4 + foot.lift * 2.4);
    knee.y += foot.lift * cfg.kneeLift - (foot.planted ? 1.4 : 0);
    knee.z += kneeDirection * (cfg.kneeForward + foot.lift * cfg.kneeSwing);
    return { hip, knee, ankle, toe };
  }

  function buildArm(side, shoulder, drive, cfg) {
    const forward = drive;
    const pump = Math.abs(forward);
    const isRun = currentMode === "run";
    const elbowDrop = isRun ? 14.5 : 21.0;
    const handDrop = isRun ? 12.8 : 17.5;
    const elbowReach = cfg.armReach * (isRun ? 0.46 : 0.52);
    const handReach = cfg.armReach * (isRun ? 0.58 : 0.62);
    const elbow = shoulder.clone().add(vec(
      side * (4.8 + pump * 1.3),
      -elbowDrop + Math.max(0, forward) * 3.2,
      forward * elbowReach
    ));
    const hand = elbow.clone().add(vec(
      side * (2.8 + pump * 1.1),
      -handDrop + Math.max(0, forward) * (isRun ? 7.5 : 3.6),
      forward * handReach
    ));
    return { shoulder, elbow, hand };
  }

  function buildPose(modeKey, frame) {
    const cfg = MOTIONS[modeKey];
    const phase = motionPhase(frame, cfg.frameCount);
    const wave = Math.sin(phase * TAU);
    const doubleWave = Math.sin(phase * TAU * 2);
    const contactCompression = Math.max(0, Math.cos(phase * TAU * 2));
    const runFlight = modeKey === "run" ? Math.max(0, Math.sin(phase * TAU * 2 - 0.18)) : 0;
    const rootX = wave * cfg.lateralSway;
    const rootY = cfg.baseY
      + (1 - Math.cos(phase * TAU * 2)) * 0.5 * cfg.bob
      + runFlight * 1.7
      - contactCompression * (modeKey === "run" ? 2.0 : 0.45);
    const twist = Math.sin(phase * TAU + Math.PI * 0.12);
    const pelvis = vec(rootX, rootY, 0);
    const spine = pelvis.clone().add(vec(0, 19, cfg.forwardLean * 0.36));
    const chest = spine.clone().add(vec(0, 25, cfg.forwardLean));
    const neck = chest.clone().add(vec(0, 15, cfg.forwardLean * 0.22));
    const head = neck.clone().add(vec(0, 12, cfg.forwardLean * 0.12));
    const shoulderTwist = twist * cfg.chestCounter;
    const shoulderL = chest.clone().add(vec(22, 1.5, -shoulderTwist));
    const shoulderR = chest.clone().add(vec(-22, 1.5, shoulderTwist));
    const hipL = pelvis.clone().add(vec(10.5, -2.5 - doubleWave * 0.9, -twist * 2.4));
    const hipR = pelvis.clone().add(vec(-10.5, -2.5 + doubleWave * 0.9, twist * 2.4));
    const leftFoot = sampleFoot(phase + 0.5, 1, cfg);
    const rightFoot = sampleFoot(phase, -1, cfg);
    const leftLeg = solveLeg(1, hipL, leftFoot, cfg);
    const rightLeg = solveLeg(-1, hipR, rightFoot, cfg);
    const leftArmDrive = -Math.cos(phase * TAU);
    const rightArmDrive = Math.cos(phase * TAU);
    const leftArm = buildArm(1, shoulderL, leftArmDrive, cfg);
    const rightArm = buildArm(-1, shoulderR, rightArmDrive, cfg);

    return {
      points: {
        pelvis,
        spine,
        chest,
        neck,
        head,
        shoulder_l: leftArm.shoulder,
        elbow_l: leftArm.elbow,
        hand_l: leftArm.hand,
        shoulder_r: rightArm.shoulder,
        elbow_r: rightArm.elbow,
        hand_r: rightArm.hand,
        hip_l: leftLeg.hip,
        knee_l: leftLeg.knee,
        ankle_l: leftLeg.ankle,
        toe_l: leftLeg.toe,
        hip_r: rightLeg.hip,
        knee_r: rightLeg.knee,
        ankle_r: rightLeg.ankle,
        toe_r: rightLeg.toe
      },
      contacts: {
        left: leftFoot.planted,
        right: rightFoot.planted
      }
    };
  }

  function updateCylinder(mesh, from, to) {
    const direction = new THREE.Vector3().subVectors(to, from);
    const length = Math.max(0.001, direction.length());
    mesh.position.copy(from).addScaledVector(direction, 0.5);
    mesh.scale.set(1, length, 1);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  }

  function updateFootPad(mesh, ankle, toe, planted, color) {
    const center = ankle.clone().lerp(toe, 0.52);
    center.y = Math.max(1.25, center.y - 2.2);
    mesh.position.copy(center);
    mesh.rotation.set(0, Math.atan2(toe.x - ankle.x, toe.z - ankle.z), 0);
    mesh.material.color.setHex(planted ? palette.contact : color);
    mesh.material.opacity = planted ? 0.92 : 0.62;
    mesh.material.transparent = !planted;
  }

  function updateContactMarker(marker, ankle, planted) {
    marker.visible = planted;
    marker.position.set(ankle.x, 0.55, ankle.z);
  }

  function renderFrame() {
    const pose = buildPose(currentMode, frameIndex);
    jointNames.forEach((name) => {
      joints[name].position.copy(pose.points[name]);
    });
    boneMeshes.forEach(({ mesh, from, to }) => {
      updateCylinder(mesh, pose.points[from], pose.points[to]);
    });
    updateFootPad(footPads.left, pose.points.ankle_l, pose.points.toe_l, pose.contacts.left, palette.left);
    updateFootPad(footPads.right, pose.points.ankle_r, pose.points.toe_r, pose.contacts.right, palette.right);
    updateContactMarker(contactMarkers.left, pose.points.ankle_l, pose.contacts.left);
    updateContactMarker(contactMarkers.right, pose.points.ankle_r, pose.contacts.right);
  }

  function setRangeProgress(input) {
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const value = Number(input.value || 0);
    const progress = max > min ? ((value - min) / (max - min)) * 100 : 0;
    input.style.setProperty("--progress", `${progress}%`);
  }

  function refreshUi() {
    const cfg = MOTIONS[currentMode];
    motionName.textContent = cfg.name;
    motionDescription.textContent = cfg.description;
    timeline.max = String(cfg.frameCount - 1);
    timeline.value = String(frameIndex);
    frameReadout.textContent = `프레임 ${frameIndex + 1} / ${cfg.frameCount}`;
    playToggle.textContent = playing ? "일시정지" : "재생";
    speedReadout.textContent = `${speed.toFixed(2)}x`;
    setRangeProgress(timeline);
    setRangeProgress(speedInput);
  }

  function setFrame(nextFrame) {
    const cfg = MOTIONS[currentMode];
    frameIndex = clamp(Math.round(Number(nextFrame) || 0), 0, cfg.frameCount - 1);
    frameCursor = frameIndex;
    renderFrame();
    refreshUi();
  }

  function setMode(modeKey) {
    currentMode = MOTIONS[modeKey] ? modeKey : "walk";
    modeSelect.value = currentMode;
    frameIndex = 0;
    frameCursor = 0;
    renderFrame();
    refreshUi();
  }

  function updateCamera() {
    const sinPhi = Math.sin(orbit.phi);
    camera.position.set(
      target.x + orbit.radius * sinPhi * Math.sin(orbit.theta),
      target.y + orbit.radius * Math.cos(orbit.phi),
      target.z + orbit.radius * sinPhi * Math.cos(orbit.theta)
    );
    camera.lookAt(target);
  }

  function snapCamera(view) {
    const views = {
      front: { theta: 0, phi: 1.35 },
      right: { theta: Math.PI / 2, phi: 1.35 },
      top: { theta: 0, phi: 0.02 }
    };
    const next = views[view];
    if (!next) {
      return;
    }
    orbit.theta = next.theta;
    orbit.phi = next.phi;
    gizmoButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.view === view);
    });
    updateCamera();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  let dragging = false;
  let lastPointer = { x: 0, y: 0 };

  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    canvas.classList.add("dragging");
    canvas.setPointerCapture(event.pointerId);
    lastPointer = { x: event.clientX, y: event.clientY };
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) {
      return;
    }
    const dx = event.clientX - lastPointer.x;
    const dy = event.clientY - lastPointer.y;
    orbit.theta -= dx * 0.008;
    orbit.phi = clamp(orbit.phi + dy * 0.006, 0.18, Math.PI - 0.18);
    lastPointer = { x: event.clientX, y: event.clientY };
    gizmoButtons.forEach((button) => button.classList.remove("active"));
    updateCamera();
  });

  canvas.addEventListener("pointerup", (event) => {
    dragging = false;
    canvas.classList.remove("dragging");
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  });

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    orbit.radius = clamp(orbit.radius + event.deltaY * 0.24, 170, 440);
    updateCamera();
  }, { passive: false });

  modeSelect.addEventListener("change", () => {
    setMode(modeSelect.value);
  });

  playToggle.addEventListener("click", () => {
    playing = !playing;
    lastTime = performance.now();
    refreshUi();
  });

  resetMotion.addEventListener("click", () => {
    playing = false;
    setFrame(0);
  });

  timeline.addEventListener("input", () => {
    setFrame(timeline.value);
  });

  speedInput.addEventListener("input", () => {
    speed = Number(speedInput.value) || 1;
    refreshUi();
  });

  gizmoButtons.forEach((button) => {
    button.addEventListener("click", () => snapCamera(button.dataset.view));
  });

  function animate(now) {
    const cfg = MOTIONS[currentMode];
    if (playing) {
      const deltaSeconds = Math.min(0.1, (now - lastTime) / 1000);
      frameCursor = (frameCursor + deltaSeconds * cfg.fps * speed) % cfg.frameCount;
      const nextFrame = Math.floor(frameCursor);
      if (nextFrame !== frameIndex) {
        frameIndex = nextFrame;
        renderFrame();
        refreshUi();
      }
    }
    lastTime = now;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  window.addEventListener("resize", resize);
  resize();
  updateCamera();
  setMode("walk");
  requestAnimationFrame(animate);
})();
