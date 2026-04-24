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

  const KEYPOSE_MOTIONS = window.codexPoseMotionKeyposes || {};
  const motionOrder = ["walk", "run", "sprint", "seatedBottleDrink"].filter((id) => KEYPOSE_MOTIONS[id]);
  if (!motionOrder.length) {
    fallback.style.display = "grid";
    fallback.querySelector("h2").textContent = "Keypose data did not load.";
    fallback.querySelector("p").textContent = "codexpose_locomotion_keyposes.js를 먼저 로드해야 합니다.";
    return;
  }

  const THREE = window.THREE;
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
  const defaultTargetY = 84;
  const defaultRadius = 315;
  const target = new THREE.Vector3(0, 84, 0);
  const orbit = { theta: -0.92, phi: 1.24, radius: defaultRadius };

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
    contact: new THREE.MeshStandardMaterial({ color: palette.contact, roughness: 0.5 })
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

  const propGroup = new THREE.Group();
  const propMaterials = {
    chair: new THREE.MeshStandardMaterial({ color: 0x8ca0b3, roughness: 0.72 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x677482, roughness: 0.48, metalness: 0.12 }),
    table: new THREE.MeshStandardMaterial({ color: 0xb98958, roughness: 0.66 }),
    bottle: new THREE.MeshStandardMaterial({ color: 0xf0b45e, roughness: 0.38, transparent: true, opacity: 0.82 }),
    bottleCap: new THREE.MeshStandardMaterial({ color: 0x2f6fb2, roughness: 0.44 })
  };
  let propMotionId = null;
  let bottleBody = null;
  let bottleCap = null;
  propGroup.visible = false;
  scene.add(propGroup);

  let currentMode = "walk";
  let frameIndex = 0;
  let frameCursor = 0;
  let playing = true;
  let speed = 1;
  let lastTime = performance.now();
  const urlParams = new URLSearchParams(window.location.search);
  const initialMotion = urlParams.get("motion");
  const initialFrame = urlParams.get("frame");

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function vecFromArray(value) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }

  function getMotion(modeKey) {
    return KEYPOSE_MOTIONS[modeKey] || KEYPOSE_MOTIONS[motionOrder[0]];
  }

  function getFrame(modeKey, index) {
    const motion = getMotion(modeKey);
    const frames = Array.isArray(motion.frames) ? motion.frames : [];
    const maxFrame = Math.max(0, frames.length - 1);
    return frames[clamp(Math.round(index), 0, maxFrame)] || motion.keyposes?.[0];
  }

  function buildPoseFromFrame(frame) {
    const points = {};
    jointNames.forEach((name) => {
      points[name] = vecFromArray(frame.points[name]);
    });
    return {
      points,
      contacts: {
        left: Boolean(frame.contacts?.left),
        right: Boolean(frame.contacts?.right)
      }
    };
  }

  function buildPose(modeKey, index) {
    return buildPoseFromFrame(getFrame(modeKey, index));
  }

  function clearPropGroup() {
    while (propGroup.children.length) {
      propGroup.remove(propGroup.children[0]);
    }
    bottleBody = null;
    bottleCap = null;
  }

  function addSceneBox(center, size, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
    mesh.position.copy(vecFromArray(center));
    propGroup.add(mesh);
    return mesh;
  }

  function addSceneLeg(x, z, height, material) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, height, 10), material);
    mesh.position.set(x, height / 2, z);
    propGroup.add(mesh);
    return mesh;
  }

  function buildSceneProps(motion) {
    propMotionId = motion.id;
    clearPropGroup();
    propGroup.visible = Boolean(motion.props);
    if (!motion.props) {
      return;
    }

    const chair = motion.props.chair;
    if (chair) {
      addSceneBox(chair.seatCenter, chair.seatSize, propMaterials.chair);
      addSceneBox(chair.backCenter, chair.backSize, propMaterials.chair);
      [[-22, -30], [22, -30], [-22, 6], [22, 6]].forEach(([x, z]) => {
        addSceneLeg(x, z, chair.legHeight, propMaterials.metal);
      });
    }

    const table = motion.props.table;
    if (table) {
      addSceneBox(table.topCenter, table.topSize, propMaterials.table);
      [[16, 8], [56, 8], [16, 40], [56, 40]].forEach(([x, z]) => {
        addSceneLeg(x, z, table.legHeight, propMaterials.metal);
      });
    }

    const radius = motion.props.bottle?.radius || 3.2;
    bottleBody = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 18), propMaterials.bottle);
    bottleCap = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.72, radius * 0.72, 1, 14), propMaterials.bottleCap);
    propGroup.add(bottleBody, bottleCap);
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

  function updateSceneProps(motion, frame) {
    if (propMotionId !== motion.id) {
      buildSceneProps(motion);
    }
    propGroup.visible = Boolean(motion.props);
    if (!motion.props || !bottleBody || !bottleCap) {
      return;
    }
    const bottle = frame.props?.bottle;
    const visible = Boolean(bottle?.bottom && bottle?.top);
    bottleBody.visible = visible;
    bottleCap.visible = visible;
    if (!visible) {
      return;
    }
    const bottom = vecFromArray(bottle.bottom);
    const top = vecFromArray(bottle.top);
    const capBase = bottom.clone().lerp(top, 0.86);
    updateCylinder(bottleBody, bottom, capBase);
    updateCylinder(bottleCap, capBase, top);
  }

  function renderFrame() {
    const motion = getMotion(currentMode);
    const frame = getFrame(currentMode, frameIndex);
    const pose = buildPoseFromFrame(frame);
    travelLine.visible = !motion.props;
    updateSceneProps(motion, frame);
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
    const motion = getMotion(currentMode);
    motionName.textContent = motion.name;
    motionDescription.textContent = motion.description;
    timeline.max = String(motion.frameCount - 1);
    timeline.value = String(frameIndex);
    frameReadout.textContent = `프레임 ${frameIndex + 1} / ${motion.frameCount}`;
    playToggle.textContent = playing ? "일시정지" : "재생";
    speedReadout.textContent = `${speed.toFixed(2)}x`;
    setRangeProgress(timeline);
    setRangeProgress(speedInput);
  }

  function setFrame(nextFrame) {
    const motion = getMotion(currentMode);
    frameIndex = clamp(Math.round(Number(nextFrame) || 0), 0, motion.frameCount - 1);
    frameCursor = frameIndex;
    renderFrame();
    refreshUi();
  }

  function setMode(modeKey) {
    const motion = KEYPOSE_MOTIONS[modeKey] || KEYPOSE_MOTIONS[motionOrder[0]];
    currentMode = motion.id;
    modeSelect.value = currentMode;
    frameIndex = 0;
    frameCursor = 0;
    target.y = motion.view?.targetY ?? defaultTargetY;
    orbit.radius = motion.view?.radius ?? defaultRadius;
    updateCamera();
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
    const motion = getMotion(currentMode);
    if (playing) {
      const deltaSeconds = Math.min(0.1, (now - lastTime) / 1000);
      const nextCursor = frameCursor + deltaSeconds * motion.fps * speed;
      frameCursor = nextCursor % motion.frameCount;
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
  setMode(KEYPOSE_MOTIONS[initialMotion] ? initialMotion : motionOrder[0]);
  if (initialFrame !== null) {
    playing = false;
    setFrame(initialFrame);
  }
  requestAnimationFrame(animate);
})();
