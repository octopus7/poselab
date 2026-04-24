(() => {
  "use strict";

  const canvas = document.getElementById("handCanvas");
  const fallback = document.getElementById("fallback");
  const poseName = document.getElementById("poseName");
  const poseMeta = document.getElementById("poseMeta");
  const poseList = document.getElementById("poseList");

  if (!window.THREE) {
    fallback.style.display = "grid";
    return;
  }

  const poses = window.codexPoseHandPoses || [];
  if (!poses.length) {
    fallback.style.display = "grid";
    fallback.querySelector("h2").textContent = "Hand pose data did not load.";
    fallback.querySelector("p").textContent = "hand_pose_data.js must be loaded before hand_pose_viewer.js.";
    return;
  }

  const THREE = window.THREE;
  const DEG = Math.PI / 180;
  const transitionDuration = 0.28;
  const pointNames = [
    "wrist", "palm", "palm_l", "palm_r",
    "thumb_cmc", "thumb_mcp", "thumb_ip", "thumb_tip",
    "index_mcp", "index_pip", "index_dip", "index_tip",
    "middle_mcp", "middle_pip", "middle_dip", "middle_tip",
    "ring_mcp", "ring_pip", "ring_dip", "ring_tip",
    "pinky_mcp", "pinky_pip", "pinky_dip", "pinky_tip"
  ];
  const connections = [
    ["wrist", "palm", "palm", 4.2],
    ["palm", "palm_l", "palm", 4.8],
    ["palm", "palm_r", "palm", 4.8],
    ["palm_r", "thumb_cmc", "thumb", 3.25],
    ["thumb_cmc", "thumb_mcp", "thumb", 3.15],
    ["thumb_mcp", "thumb_ip", "thumb", 2.75],
    ["thumb_ip", "thumb_tip", "thumb", 2.35],
    ["palm", "index_mcp", "finger", 2.9],
    ["index_mcp", "index_pip", "finger", 2.65],
    ["index_pip", "index_dip", "finger", 2.25],
    ["index_dip", "index_tip", "finger", 1.95],
    ["palm", "middle_mcp", "finger", 3.0],
    ["middle_mcp", "middle_pip", "finger", 2.78],
    ["middle_pip", "middle_dip", "finger", 2.35],
    ["middle_dip", "middle_tip", "finger", 2.0],
    ["palm", "ring_mcp", "finger", 2.85],
    ["ring_mcp", "ring_pip", "finger", 2.58],
    ["ring_pip", "ring_dip", "finger", 2.18],
    ["ring_dip", "ring_tip", "finger", 1.9],
    ["palm", "pinky_mcp", "finger", 2.55],
    ["pinky_mcp", "pinky_pip", "finger", 2.28],
    ["pinky_pip", "pinky_dip", "finger", 1.95],
    ["pinky_dip", "pinky_tip", "finger", 1.7]
  ];

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef3f7);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMappingExposure = 0.86;

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 600);
  const target = new THREE.Vector3(0, 8, 0);
  const orbit = { theta: -0.72, phi: 1.12, radius: 86 };

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8e1ea, 0.92));
  const key = new THREE.DirectionalLight(0xffffff, 1.05);
  key.position.set(60, 110, 90);
  scene.add(key);

  const grid = new THREE.GridHelper(90, 9, 0xaebdc9, 0xd6e0e8);
  grid.position.y = -20;
  scene.add(grid);

  const handGroup = new THREE.Group();
  scene.add(handGroup);

  const materials = {
    palm: new THREE.MeshStandardMaterial({ color: 0x9aa5ad, roughness: 0.68 }),
    finger: new THREE.MeshStandardMaterial({ color: 0x9aa5ad, roughness: 0.68 }),
    thumb: new THREE.MeshStandardMaterial({ color: 0x9aa5ad, roughness: 0.68 }),
    joint: new THREE.MeshStandardMaterial({ color: 0x6f7e89, roughness: 0.64 }),
    prop: new THREE.MeshStandardMaterial({ color: 0x6e5d4e, roughness: 0.76 }),
    edge: new THREE.MeshStandardMaterial({ color: 0x718594, roughness: 0.72 }),
    cylinder: new THREE.MeshStandardMaterial({ color: 0x9d6f43, roughness: 0.66 })
  };

  const joints = {};
  const jointGeometry = new THREE.SphereGeometry(2.15, 18, 14);
  pointNames.forEach((name) => {
    const material = name.startsWith("thumb") ? materials.thumb : name.startsWith("palm") || name === "wrist" ? materials.palm : materials.joint;
    const mesh = new THREE.Mesh(jointGeometry, material);
    joints[name] = mesh;
    handGroup.add(mesh);
  });

  const boneMeshes = connections.map(([from, to, materialKey, radius]) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 14), materials[materialKey]);
    handGroup.add(mesh);
    return { mesh, from, to };
  });

  const palmSurface = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xa8b0b6, roughness: 0.7, transparent: true, opacity: 0.96 })
  );
  palmSurface.scale.set(13.8, 13.0, 4.8);
  handGroup.add(palmSurface);

  const propGroup = new THREE.Group();
  handGroup.add(propGroup);
  const stoneMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), materials.prop);
  const edgeMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materials.edge);
  const cylinderMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 22), materials.cylinder);
  propGroup.add(stoneMesh, edgeMesh, cylinderMesh);

  let activeIndex = 0;
  let activePose = clonePose(poses[0]);
  let startPose = clonePose(poses[0]);
  let targetPose = clonePose(poses[0]);
  let transitionStart = performance.now();
  let transitioning = false;
  let dragging = false;
  let lastPointer = { x: 0, y: 0 };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function smoothstep(value) {
    const t = clamp(value, 0, 1);
    return t * t * (3 - t * 2);
  }

  function vecFromArray(value) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }

  function clonePose(pose) {
    const points = {};
    pointNames.forEach((name) => {
      points[name] = pose.points[name].slice();
    });
    return {
      ...pose,
      palmRotation: pose.palmRotation.slice(),
      prop: pose.prop ? JSON.parse(JSON.stringify(pose.prop)) : null,
      points
    };
  }

  function lerpArray(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function mixPose(a, b, t) {
    const points = {};
    pointNames.forEach((name) => {
      points[name] = lerpArray(a.points[name], b.points[name], t);
    });
    return {
      ...b,
      palmRotation: lerpArray(a.palmRotation, b.palmRotation, t),
      prop: t < 0.5 ? a.prop : b.prop,
      points
    };
  }

  function currentPoints(pose) {
    const points = {};
    pointNames.forEach((name) => {
      points[name] = vecFromArray(pose.points[name]);
    });
    return points;
  }

  function updateCylinder(mesh, from, to) {
    const direction = new THREE.Vector3().subVectors(to, from);
    const length = Math.max(0.001, direction.length());
    mesh.position.copy(from).addScaledVector(direction, 0.5);
    mesh.scale.set(1, length, 1);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  }

  function updateProps(pose) {
    stoneMesh.visible = false;
    edgeMesh.visible = false;
    cylinderMesh.visible = false;
    if (!pose.prop) {
      return;
    }
    if (pose.prop.type === "stone") {
      const radius = pose.prop.radius || 5;
      stoneMesh.visible = true;
      stoneMesh.scale.set(radius * 1.08, radius * 0.82, radius * 0.94);
      stoneMesh.position.copy(vecFromArray(pose.prop.position));
      return;
    }
    if (pose.prop.type === "edge") {
      edgeMesh.visible = true;
      edgeMesh.scale.set(pose.prop.size[0], pose.prop.size[1], pose.prop.size[2]);
      edgeMesh.position.copy(vecFromArray(pose.prop.position));
      edgeMesh.rotation.set(0, 0, 0);
      return;
    }
    if (pose.prop.type === "cylinder") {
      cylinderMesh.visible = true;
      cylinderMesh.scale.set(pose.prop.radius, pose.prop.height, pose.prop.radius);
      cylinderMesh.position.copy(vecFromArray(pose.prop.position));
      cylinderMesh.rotation.set(0, 0, Math.PI / 2);
    }
  }

  function renderPose(pose) {
    const points = currentPoints(pose);
    pointNames.forEach((name) => {
      joints[name].position.copy(points[name]);
    });
    boneMeshes.forEach(({ mesh, from, to }) => {
      updateCylinder(mesh, points[from], points[to]);
    });
    palmSurface.position.copy(points.palm);
    palmSurface.rotation.set(0, 0, 0);
    handGroup.rotation.set(pose.palmRotation[0] * DEG, pose.palmRotation[1] * DEG, pose.palmRotation[2] * DEG);
    updateProps(pose);
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

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function refreshUi() {
    poseName.textContent = targetPose.name;
    poseMeta.textContent = `Cell ${targetPose.sourceCell} / ${poses.length}`;
    Array.from(poseList.children).forEach((button, index) => {
      button.classList.toggle("active", index === activeIndex);
      button.setAttribute("aria-selected", index === activeIndex ? "true" : "false");
    });
  }

  function selectPose(index) {
    activeIndex = clamp(index, 0, poses.length - 1);
    startPose = clonePose(activePose);
    targetPose = clonePose(poses[activeIndex]);
    transitionStart = performance.now();
    transitioning = true;
    refreshUi();
  }

  function buildPoseList() {
    poses.forEach((pose, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "hand-pose-item";
      button.setAttribute("role", "option");
      button.innerHTML = `<span>${String(index + 1).padStart(2, "0")}</span><strong>${pose.name}</strong>`;
      button.addEventListener("click", () => selectPose(index));
      poseList.appendChild(button);
    });
  }

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
    orbit.radius = clamp(orbit.radius + event.deltaY * 0.08, 52, 128);
    updateCamera();
  }, { passive: false });

  function animate(now) {
    if (transitioning) {
      const t = smoothstep((now - transitionStart) / (transitionDuration * 1000));
      activePose = mixPose(startPose, targetPose, t);
      if (t >= 1) {
        transitioning = false;
        activePose = clonePose(targetPose);
      }
    }
    renderPose(activePose);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  window.addEventListener("resize", resize);
  buildPoseList();
  refreshUi();
  resize();
  updateCamera();
  renderPose(activePose);
  requestAnimationFrame(animate);
})();
