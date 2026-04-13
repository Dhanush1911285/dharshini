const video = document.getElementById("cameraFeed");
const canvas = document.getElementById("renderCanvas");
const ctx = canvas.getContext("2d", { alpha: false });
const carousel = document.getElementById("filterCarousel");
const filterNameEl = document.getElementById("filterName");
const statusText = document.getElementById("statusText");
const cameraStage = document.getElementById("cameraStage");
const switchBtn = document.getElementById("switchBtn");
const faceBtn = document.getElementById("faceBtn");
const hudBtn = document.getElementById("hudBtn");
const saveBtn = document.getElementById("saveBtn");
const captureBtn = document.getElementById("captureBtn");
const toggleRecordBtn = document.getElementById("toggleRecordBtn");

const offscreen = document.createElement("canvas");
const offCtx = offscreen.getContext("2d");

const state = {
  usingFront: true,
  stream: null,
  width: window.innerWidth,
  height: window.innerHeight,
  dpr: Math.min(window.devicePixelRatio || 1, 2),
  filterIndex: 0,
  status: "Initializing camera",
  faceEnabled: true,
  hudEnabled: true,
  showRecHud: true,
  lastTap: 0,
  pointerStart: null,
  faceResult: null,
  faceState: {
    centerX: 0,
    centerY: 0,
    faceWidth: 0,
    angle: 0,
    mouthOpen: 0,
    ready: false
  },
  lastFrameUrl: "",
  lensShift: 0,
  shiftVelocity: 0,
  previousFilterDirection: 1
};

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const weekdayMood = [
  "Sunday Slow Glow",
  "Monday Mood",
  "Tuesday Softness",
  "Wednesday Aura",
  "Thursday Dreamstate",
  "Friday Main Character",
  "Saturday Afterglow"
];

const filters = [
  { id: "raw", name: "Raw Portrait", icon: "linear-gradient(135deg, #d3ecff, #6f90ff)", css: "none" },
  { id: "grayscale", name: "Silver Fade", icon: "linear-gradient(135deg, #f0f0f0, #5f6675)", css: "grayscale(1)" },
  { id: "sepia", name: "Archive Sepia", icon: "linear-gradient(135deg, #f7d6a8, #8f5f3d)", css: "sepia(0.92) saturate(1.1)" },
  { id: "contrast", name: "Contrast Boost", icon: "linear-gradient(135deg, #ffffff, #101930)", css: "contrast(1.35) saturate(1.12)" },
  { id: "glow", name: "Brightness Glow", icon: "linear-gradient(135deg, #fff4d6, #ffb689)", css: "brightness(1.14) saturate(1.08)" },
  { id: "skin", name: "Soft Skin Glow", icon: "linear-gradient(135deg, #ffe8dd, #ffc8c8)", css: "brightness(1.06) saturate(0.94) blur(0.35px)" },
  { id: "cinematic", name: "Cinema LUT", icon: "linear-gradient(135deg, #7cc0ff, #16213c)", css: "contrast(1.16) saturate(0.92)" },
  { id: "sunset", name: "Warm Sunset", icon: "linear-gradient(135deg, #ffd5a0, #ff6d4d)", css: "saturate(1.2) contrast(1.04)" },
  { id: "cool", name: "Cool Blue Tone", icon: "linear-gradient(135deg, #d9f6ff, #338fd8)", css: "saturate(0.95) brightness(1.04)" },
  { id: "neon", name: "Neon Cyberpunk", icon: "linear-gradient(135deg, #00f5ff, #ff4ddb)", css: "contrast(1.3) saturate(1.4) hue-rotate(14deg)" },
  { id: "grain", name: "Vintage Grain", icon: "linear-gradient(135deg, #ddbe93, #5c4235)", css: "sepia(0.34) contrast(1.08)" },
  { id: "mono", name: "Mono Punch", icon: "linear-gradient(135deg, #ffffff, #000000)", css: "grayscale(1) contrast(1.55)" },
  { id: "focus", name: "Focus Edge", icon: "linear-gradient(135deg, #f0fbff, #89bbd8)", css: "contrast(1.06) brightness(1.03)" },
  { id: "hdr", name: "HDR Lift", icon: "linear-gradient(135deg, #fff8df, #4eb8ff)", css: "contrast(1.16) saturate(1.2) brightness(1.04)" },
  { id: "pastel", name: "Pastel Tone", icon: "linear-gradient(135deg, #ffe6f4, #b9e5ff)", css: "saturate(0.78) brightness(1.08)" },
  { id: "dream", name: "Dream Filter", icon: "linear-gradient(135deg, #f8d3ff, #80dffb)", css: "brightness(1.08) saturate(1.08) blur(0.4px)" },
  { id: "dog", name: "Puppy Charm", icon: "linear-gradient(135deg, #d9b28c, #7a4f32)", css: "brightness(1.05) saturate(1.04)", face: "dog" },
  { id: "cat", name: "Cat Muse", icon: "linear-gradient(135deg, #fce6d9, #bf7d87)", css: "brightness(1.08) saturate(1.02)", face: "cat" },
  { id: "glasses", name: "Night Shades", icon: "linear-gradient(135deg, #1e2331, #8890a3)", css: "contrast(1.15)", face: "glasses" },
  { id: "crown", name: "Royal Halo", icon: "linear-gradient(135deg, #ffef95, #ca8f16)", css: "brightness(1.08) saturate(1.08)", face: "crown" },
  { id: "devil", name: "Inferno Glow", icon: "linear-gradient(135deg, #ff764f, #4a090f)", css: "brightness(1.04) saturate(1.3)", face: "devil" },
  { id: "mask", name: "Phantom Mask", icon: "linear-gradient(135deg, #f0f0f0, #52617f)", css: "contrast(1.1) saturate(0.86)", face: "mask" }
];

const assets = createAssets();
const grainFrames = createNoiseFrames(5, 220);

let faceMesh = null;
let faceSendInFlight = false;
let faceFrameModulo = 0;

buildCarousel();
resizeCanvas();
boot();

async function boot() {
  bindEvents();
  setStatus("Requesting camera access");
  await startCamera();
  await initFaceMesh();
  requestAnimationFrame(renderLoop);
}

function bindEvents() {
  window.addEventListener("resize", resizeCanvas);
  switchBtn.addEventListener("click", switchCamera);
  faceBtn.addEventListener("click", () => {
    state.faceEnabled = !state.faceEnabled;
    faceBtn.classList.toggle("is-active", state.faceEnabled);
  });
  hudBtn.addEventListener("click", () => {
    state.hudEnabled = !state.hudEnabled;
    hudBtn.classList.toggle("is-active", state.hudEnabled);
  });
  toggleRecordBtn.addEventListener("click", () => {
    state.showRecHud = !state.showRecHud;
    toggleRecordBtn.classList.toggle("is-active", state.showRecHud);
  });
  saveBtn.addEventListener("click", saveFrame);
  captureBtn.addEventListener("click", saveFrame);

  document.addEventListener("pointerdown", onPointerDown, { passive: true });
  document.addEventListener("pointerup", onPointerUp, { passive: true });
}

async function startCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: state.usingFront ? "user" : "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    state.stream = stream;
    video.srcObject = stream;
    await video.play();
    setStatus(state.usingFront ? "Front camera live" : "Back camera live");
  } catch (error) {
    setStatus("Camera access denied");
    console.error(error);
  }
}

async function switchCamera() {
  state.usingFront = !state.usingFront;
  setStatus("Switching camera");
  await startCamera();
}

async function initFaceMesh() {
  if (!window.FaceMesh) {
    setStatus("MediaPipe failed to load");
    return;
  }

  faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
  });

  faceMesh.onResults((results) => {
    const landmarks = results.multiFaceLandmarks && results.multiFaceLandmarks[0];
    state.faceResult = landmarks || null;
  });
}

function onPointerDown(event) {
  state.pointerStart = {
    x: event.clientX,
    y: event.clientY,
    time: performance.now()
  };
}

function onPointerUp(event) {
  const now = performance.now();
  const start = state.pointerStart;

  if (!start) {
    return;
  }

  const dx = event.clientX - start.x;
  const dy = event.clientY - start.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (absX > 45 && absX > absY) {
    if (dx < 0) {
      nextFilter();
    } else {
      previousFilter();
    }
    state.pointerStart = null;
    return;
  }

  if (now - state.lastTap < 280 && absX < 20 && absY < 20) {
    switchCamera();
    state.lastTap = 0;
  } else {
    state.lastTap = now;
  }

  state.pointerStart = null;
}

function nextFilter() {
  state.previousFilterDirection = 1;
  state.filterIndex = (state.filterIndex + 1) % filters.length;
  updateFilterUi("left");
}

function previousFilter() {
  state.previousFilterDirection = -1;
  state.filterIndex = (state.filterIndex - 1 + filters.length) % filters.length;
  updateFilterUi("right");
}

function updateFilterUi(direction) {
  const active = filters[state.filterIndex];
  filterNameEl.textContent = active.name;
  filterNameEl.classList.remove("is-changing");
  void filterNameEl.offsetWidth;
  filterNameEl.classList.add("is-changing");

  cameraStage.classList.remove("swipe-left", "swipe-right");
  cameraStage.classList.add(direction === "left" ? "swipe-left" : "swipe-right");
  setTimeout(() => cameraStage.classList.remove("swipe-left", "swipe-right"), 280);

  [...carousel.children].forEach((chip, index) => {
    chip.classList.toggle("is-active", index === state.filterIndex);
  });

  const activeChip = carousel.children[state.filterIndex];
  if (activeChip) {
    const x = activeChip.offsetLeft - carousel.parentElement.clientWidth / 2 + activeChip.clientWidth / 2;
    carousel.style.transform = `translateX(${-x}px)`;
  }
}

function buildCarousel() {
  const fragment = document.createDocumentFragment();

  filters.forEach((filter, index) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `filter-chip${index === state.filterIndex ? " is-active" : ""}`;
    chip.innerHTML = `
      <span class="chip-icon" style="background:${filter.icon}"></span>
      <span class="chip-name">${filter.name}</span>
    `;
    chip.addEventListener("click", () => {
      state.previousFilterDirection = index > state.filterIndex ? 1 : -1;
      state.filterIndex = index;
      updateFilterUi(state.previousFilterDirection > 0 ? "left" : "right");
    });
    fragment.appendChild(chip);
  });

  carousel.appendChild(fragment);
  updateFilterUi("left");
  faceBtn.classList.add("is-active");
  hudBtn.classList.add("is-active");
  toggleRecordBtn.classList.add("is-active");
}

function resizeCanvas() {
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.floor(state.width * state.dpr);
  canvas.height = Math.floor(state.height * state.dpr);
  canvas.style.width = `${state.width}px`;
  canvas.style.height = `${state.height}px`;
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
}

function setStatus(message) {
  state.status = message;
  statusText.textContent = message;
}

async function renderLoop(time) {
  requestAnimationFrame(renderLoop);

  if (!video.videoWidth || !video.videoHeight) {
    return;
  }

  if (faceMesh && !faceSendInFlight && state.faceEnabled) {
    faceFrameModulo = (faceFrameModulo + 1) % 2;
    if (faceFrameModulo === 0) {
      faceSendInFlight = true;
      faceMesh.send({ image: video }).catch(() => {}).finally(() => {
        faceSendInFlight = false;
      });
    }
  }

  drawScene(time);
}

function drawScene(time) {
  const filter = filters[state.filterIndex];
  const viewport = { width: state.width, height: state.height };
  const crop = computeCoverCrop(video.videoWidth, video.videoHeight, viewport.width, viewport.height);

  ctx.clearRect(0, 0, viewport.width, viewport.height);
  ctx.save();

  if (state.usingFront) {
    ctx.translate(viewport.width, 0);
    ctx.scale(-1, 1);
  }

  ctx.filter = filter.css;
  ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, viewport.width, viewport.height);
  ctx.restore();
  ctx.filter = "none";

  drawFilterMood(filter, viewport, time);
  updateFaceState(viewport);

  if (state.faceEnabled && filter.face && state.faceState.ready) {
    drawFaceFilter(filter.face, viewport, time);
  }

  if (state.hudEnabled) {
    drawPremiumHud(viewport, time);
  }
}

function computeCoverCrop(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;

  if (sourceRatio > targetRatio) {
    const sw = sourceHeight * targetRatio;
    const sx = (sourceWidth - sw) / 2;
    return { sx, sy: 0, sw, sh: sourceHeight };
  }

  const sh = sourceWidth / targetRatio;
  const sy = (sourceHeight - sh) / 2;
  return { sx: 0, sy, sw: sourceWidth, sh };
}

function drawFilterMood(filter, viewport, time) {
  switch (filter.id) {
    case "cinematic":
      drawColorWash("rgba(16, 34, 58, 0.18)", viewport);
      drawColorWash("rgba(255, 176, 104, 0.1)", viewport, "screen");
      break;
    case "sunset":
      drawVerticalGradient(["rgba(255, 170, 76, 0.20)", "rgba(255, 92, 71, 0.14)"], viewport);
      break;
    case "cool":
      drawVerticalGradient(["rgba(113, 201, 255, 0.16)", "rgba(38, 71, 129, 0.16)"], viewport);
      break;
    case "neon":
      drawDualLight(viewport, time, "rgba(0, 248, 255, 0.16)", "rgba(255, 60, 189, 0.16)");
      break;
    case "grain":
      drawNoise(viewport, time);
      drawColorWash("rgba(112, 72, 48, 0.12)", viewport);
      break;
    case "focus":
      drawEdgeFocus(viewport);
      break;
    case "hdr":
      drawHdrShine(viewport, time);
      break;
    case "pastel":
      drawVerticalGradient(["rgba(255, 205, 226, 0.12)", "rgba(154, 230, 255, 0.16)"], viewport);
      break;
    case "dream":
      drawDreamHaze(viewport, time);
      break;
    case "devil":
      drawColorWash("rgba(255, 48, 32, 0.12)", viewport);
      break;
    case "mask":
      drawColorWash("rgba(214, 218, 238, 0.10)", viewport);
      break;
    default:
      break;
  }
}

function drawColorWash(color, viewport, blendMode = "source-over") {
  ctx.save();
  ctx.globalCompositeOperation = blendMode;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  ctx.restore();
}

function drawVerticalGradient(colors, viewport) {
  ctx.save();
  const grad = ctx.createLinearGradient(0, 0, 0, viewport.height);
  grad.addColorStop(0, colors[0]);
  grad.addColorStop(1, colors[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  ctx.restore();
}

function drawDualLight(viewport, time, leftColor, rightColor) {
  ctx.save();
  const leftX = viewport.width * (0.22 + Math.sin(time * 0.0012) * 0.03);
  const rightX = viewport.width * (0.78 + Math.cos(time * 0.001) * 0.03);
  const left = ctx.createRadialGradient(leftX, viewport.height * 0.46, 10, leftX, viewport.height * 0.46, viewport.width * 0.42);
  left.addColorStop(0, leftColor);
  left.addColorStop(1, "transparent");
  const right = ctx.createRadialGradient(rightX, viewport.height * 0.5, 10, rightX, viewport.height * 0.5, viewport.width * 0.42);
  right.addColorStop(0, rightColor);
  right.addColorStop(1, "transparent");
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  ctx.fillStyle = right;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  ctx.restore();
}

function drawNoise(viewport, time) {
  const frame = grainFrames[Math.floor(time / 70) % grainFrames.length];
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.drawImage(frame, 0, 0, viewport.width, viewport.height);
  ctx.restore();
}

function drawEdgeFocus(viewport) {
  ctx.save();
  const grad = ctx.createRadialGradient(viewport.width / 2, viewport.height / 2, viewport.width * 0.12, viewport.width / 2, viewport.height / 2, viewport.width * 0.65);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(1, "rgba(10,20,30,0.28)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  ctx.restore();
}

function drawHdrShine(viewport, time) {
  ctx.save();
  const x = ((time * 0.12) % (viewport.width + 240)) - 120;
  const grad = ctx.createLinearGradient(x, 0, x + 120, 0);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.10)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  ctx.restore();
}

function drawDreamHaze(viewport, time) {
  ctx.save();
  const grad = ctx.createRadialGradient(
    viewport.width * (0.45 + Math.sin(time * 0.0007) * 0.1),
    viewport.height * 0.36,
    30,
    viewport.width * 0.45,
    viewport.height * 0.36,
    viewport.width * 0.5
  );
  grad.addColorStop(0, "rgba(255,255,255,0.16)");
  grad.addColorStop(0.5, "rgba(255,190,255,0.08)");
  grad.addColorStop(1, "transparent");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  ctx.restore();
}

function updateFaceState(viewport) {
  if (!state.faceResult) {
    state.faceState.ready = false;
    state.faceState.mouthOpen = lerp(state.faceState.mouthOpen, 0, 0.15);
    return;
  }

  const nose = mapLandmark(state.faceResult[1], viewport);
  const forehead = mapLandmark(state.faceResult[10], viewport);
  const leftEye = mapLandmark(state.faceResult[33], viewport);
  const rightEye = mapLandmark(state.faceResult[263], viewport);
  const mouthTop = mapLandmark(state.faceResult[13], viewport);
  const mouthBottom = mapLandmark(state.faceResult[14], viewport);
  const leftFace = mapLandmark(state.faceResult[234], viewport);
  const rightFace = mapLandmark(state.faceResult[454], viewport);

  const faceWidth = dist(leftFace, rightFace);
  const targetCenterX = nose.x;
  const targetCenterY = lerp(forehead.y, nose.y, 0.6);
  const targetAngle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
  const mouthRatio = clamp(dist(mouthTop, mouthBottom) / Math.max(faceWidth, 1) * 7.5, 0, 1.2);

  state.faceState.centerX = lerp(state.faceState.centerX || targetCenterX, targetCenterX, 0.22);
  state.faceState.centerY = lerp(state.faceState.centerY || targetCenterY, targetCenterY, 0.22);
  state.faceState.faceWidth = lerp(state.faceState.faceWidth || faceWidth, faceWidth, 0.22);
  state.faceState.angle = lerp(state.faceState.angle || targetAngle, targetAngle, 0.22);
  state.faceState.mouthOpen = lerp(state.faceState.mouthOpen || mouthRatio, mouthRatio, 0.26);
  state.faceState.ready = true;
}

function mapLandmark(point, viewport) {
  const x = state.usingFront ? (1 - point.x) * viewport.width : point.x * viewport.width;
  return {
    x,
    y: point.y * viewport.height,
    z: point.z || 0
  };
}

function drawFaceFilter(type, viewport, time) {
  const face = state.faceState;
  const centerX = face.centerX;
  const centerY = face.centerY;
  const size = face.faceWidth;
  const angle = face.angle;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(angle);

  if (type === "dog") {
    drawSymmetricAsset(assets.dogEar, -size * 0.34, -size * 0.68, size * 0.42, size * 0.62, -0.12);
    drawSymmetricAsset(assets.dogEar, size * 0.34, -size * 0.68, size * 0.42, size * 0.62, 0.12, true);
    drawAsset(assets.dogNose, 0, size * 0.04, size * 0.34, size * 0.22);
    drawDogTongue(size, time);
  } else if (type === "cat") {
    drawSymmetricAsset(assets.catEar, -size * 0.34, -size * 0.72, size * 0.36, size * 0.56, -0.05);
    drawSymmetricAsset(assets.catEar, size * 0.34, -size * 0.72, size * 0.36, size * 0.56, 0.05, true);
    drawAsset(assets.catNose, 0, size * 0.08, size * 0.18, size * 0.13);
    drawCatWhiskers(size);
  } else if (type === "glasses") {
    drawAsset(assets.glasses, 0, -size * 0.08, size * 0.98, size * 0.34);
  } else if (type === "crown") {
    const bob = Math.sin(time * 0.0032) * size * 0.03;
    drawAsset(assets.crown, 0, -size * 0.92 + bob, size * 0.82, size * 0.48);
  } else if (type === "devil") {
    drawColorWash("rgba(255, 52, 32, 0.08)", viewport);
    drawSymmetricAsset(assets.horn, -size * 0.26, -size * 0.82, size * 0.26, size * 0.44, -0.12);
    drawSymmetricAsset(assets.horn, size * 0.26, -size * 0.82, size * 0.26, size * 0.44, 0.12, true);
  } else if (type === "mask") {
    drawAsset(assets.mask, 0, -size * 0.04, size * 0.98, size * 0.98);
  }

  ctx.restore();
}

function drawAsset(asset, x, y, width, height) {
  ctx.drawImage(asset, x - width / 2, y - height / 2, width, height);
}

function drawSymmetricAsset(asset, x, y, width, height, rotation = 0, mirror = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  if (mirror) {
    ctx.scale(-1, 1);
  }
  ctx.drawImage(asset, -width / 2, -height / 2, width, height);
  ctx.restore();
}

function drawDogTongue(size, time) {
  const open = clamp((state.faceState.mouthOpen - 0.24) / 0.5, 0, 1);
  if (open <= 0.02) {
    return;
  }

  const bounce = 1 + Math.sin(time * 0.015) * 0.05;
  const height = size * (0.18 + open * 0.42) * bounce;
  const y = size * (0.22 + open * 0.28);

  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.drawImage(assets.tongue, -size * 0.12, y - height * 0.12, size * 0.24, height);
  ctx.restore();
}

function drawCatWhiskers(size) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.74)";
  ctx.lineWidth = Math.max(1.6, size * 0.008);
  ctx.lineCap = "round";
  const lines = [-0.06, 0.02, 0.1];
  lines.forEach((offset) => {
    ctx.beginPath();
    ctx.moveTo(-size * 0.12, size * offset);
    ctx.lineTo(-size * 0.44, size * (offset - 0.08));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(size * 0.12, size * offset);
    ctx.lineTo(size * 0.44, size * (offset - 0.08));
    ctx.stroke();
  });
  ctx.restore();
}

function drawPremiumHud(viewport, time) {
  const now = new Date();
  const dateText = now.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const timeText = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const mood = `${weekdayMood[now.getDay()]} ${now.getDay() % 2 === 0 ? "🌙" : "☀"}`;
  const blink = Math.sin(time * 0.012) > 0 ? 1 : 0.36;

  ctx.save();

  ctx.fillStyle = "rgba(0,0,0,0.34)";
  ctx.fillRect(0, 0, viewport.width, viewport.height * 0.06);
  ctx.fillRect(0, viewport.height * 0.94, viewport.width, viewport.height * 0.06);

  const vignette = ctx.createRadialGradient(
    viewport.width / 2,
    viewport.height / 2,
    viewport.width * 0.2,
    viewport.width / 2,
    viewport.height / 2,
    viewport.width * 0.78
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "600 18px 'Trebuchet MS'";
  ctx.fillText(`${dateText}  ${timeText}`, 24, 38);

  ctx.font = "italic 30px Georgia";
  ctx.fillText(mood, 24, viewport.height - 92);

  ctx.font = "700 18px 'Trebuchet MS'";
  ctx.fillStyle = "rgba(255,255,255,0.86)";
  ctx.fillText("@hubby", viewport.width - 98, viewport.height - 38);

  if (state.showRecHud) {
    ctx.fillStyle = `rgba(255, 74, 74, ${blink})`;
    ctx.beginPath();
    ctx.arc(viewport.width - 122, 36, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "700 15px 'Trebuchet MS'";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText("REC", viewport.width - 106, 41);
  }

  ctx.restore();
}

function saveFrame() {
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `snap-aura-${Date.now()}.png`;
  link.click();
  setStatus("Frame saved");
}

function createAssets() {
  return {
    dogEar: makeDogEar(),
    dogNose: makeDogNose(),
    tongue: makeTongue(),
    catEar: makeCatEar(),
    catNose: makeCatNose(),
    glasses: makeGlasses(),
    crown: makeCrown(),
    horn: makeHorn(),
    mask: makeMask()
  };
}

function makeCanvas(width, height) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

function makeDogEar() {
  const c = makeCanvas(220, 300);
  const g = c.getContext("2d");
  g.translate(110, 150);
  const outer = g.createLinearGradient(0, -120, 0, 120);
  outer.addColorStop(0, "#a46d44");
  outer.addColorStop(1, "#5f3e27");
  g.fillStyle = outer;
  g.beginPath();
  g.moveTo(0, -128);
  g.bezierCurveTo(78, -52, 76, 118, 0, 130);
  g.bezierCurveTo(-72, 118, -80, -52, 0, -128);
  g.closePath();
  g.fill();
  const inner = g.createLinearGradient(0, -84, 0, 70);
  inner.addColorStop(0, "#e8b38f");
  inner.addColorStop(1, "#bb7f5b");
  g.fillStyle = inner;
  g.beginPath();
  g.moveTo(0, -82);
  g.bezierCurveTo(42, -36, 42, 70, 0, 92);
  g.bezierCurveTo(-40, 70, -42, -36, 0, -82);
  g.closePath();
  g.fill();
  return c;
}

function makeDogNose() {
  const c = makeCanvas(180, 110);
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 110);
  grad.addColorStop(0, "#3d352e");
  grad.addColorStop(1, "#13110f");
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(90, 20);
  g.bezierCurveTo(140, 20, 164, 44, 150, 76);
  g.bezierCurveTo(132, 102, 48, 102, 30, 76);
  g.bezierCurveTo(16, 44, 40, 20, 90, 20);
  g.closePath();
  g.fill();
  return c;
}

function makeTongue() {
  const c = makeCanvas(120, 220);
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 220);
  grad.addColorStop(0, "#ffd2e1");
  grad.addColorStop(1, "#ff6f9d");
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(60, 16);
  g.bezierCurveTo(102, 22, 108, 126, 84, 196);
  g.bezierCurveTo(78, 214, 42, 214, 36, 196);
  g.bezierCurveTo(12, 126, 18, 22, 60, 16);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(255,255,255,0.28)";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(60, 42);
  g.lineTo(60, 186);
  g.stroke();
  return c;
}

function makeCatEar() {
  const c = makeCanvas(200, 280);
  const g = c.getContext("2d");
  g.translate(100, 140);
  const outer = g.createLinearGradient(0, -120, 0, 120);
  outer.addColorStop(0, "#f6d0c8");
  outer.addColorStop(1, "#7d4f5e");
  g.fillStyle = outer;
  g.beginPath();
  g.moveTo(0, -126);
  g.lineTo(92, 104);
  g.quadraticCurveTo(0, 70, -92, 104);
  g.closePath();
  g.fill();
  const inner = g.createLinearGradient(0, -80, 0, 70);
  inner.addColorStop(0, "#ffb3c1");
  inner.addColorStop(1, "#f27b96");
  g.fillStyle = inner;
  g.beginPath();
  g.moveTo(0, -78);
  g.lineTo(52, 66);
  g.quadraticCurveTo(0, 46, -52, 66);
  g.closePath();
  g.fill();
  return c;
}

function makeCatNose() {
  const c = makeCanvas(100, 80);
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 80);
  grad.addColorStop(0, "#ffb3c1");
  grad.addColorStop(1, "#ff7697");
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(50, 16);
  g.lineTo(82, 48);
  g.quadraticCurveTo(50, 74, 18, 48);
  g.closePath();
  g.fill();
  return c;
}

function makeGlasses() {
  const c = makeCanvas(360, 130);
  const g = c.getContext("2d");
  g.strokeStyle = "#11131c";
  g.lineWidth = 14;
  g.lineJoin = "round";
  g.fillStyle = "rgba(30,37,52,0.30)";
  g.fillRect(42, 28, 110, 72);
  g.fillRect(208, 28, 110, 72);
  g.strokeRect(42, 28, 110, 72);
  g.strokeRect(208, 28, 110, 72);
  g.beginPath();
  g.moveTo(152, 60);
  g.lineTo(208, 60);
  g.stroke();
  g.beginPath();
  g.moveTo(42, 60);
  g.lineTo(0, 50);
  g.moveTo(318, 60);
  g.lineTo(360, 50);
  g.stroke();
  return c;
}

function makeCrown() {
  const c = makeCanvas(320, 180);
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 180);
  grad.addColorStop(0, "#fff3aa");
  grad.addColorStop(0.5, "#ffd75f");
  grad.addColorStop(1, "#c98d15");
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(20, 150);
  g.lineTo(50, 44);
  g.lineTo(112, 110);
  g.lineTo(160, 18);
  g.lineTo(208, 110);
  g.lineTo(270, 44);
  g.lineTo(300, 150);
  g.closePath();
  g.fill();
  g.fillRect(32, 136, 256, 24);
  ["#fff6cc", "#ffef95", "#fff6cc"].forEach((color, index) => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(80 + index * 80, 124, 14, 0, Math.PI * 2);
    g.fill();
  });
  return c;
}

function makeHorn() {
  const c = makeCanvas(120, 220);
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 220);
  grad.addColorStop(0, "#ff8f7a");
  grad.addColorStop(0.35, "#ff4040");
  grad.addColorStop(1, "#611012");
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(28, 200);
  g.bezierCurveTo(10, 110, 48, 20, 100, 10);
  g.bezierCurveTo(84, 60, 76, 118, 66, 210);
  g.closePath();
  g.fill();
  return c;
}

function makeMask() {
  const c = makeCanvas(320, 360);
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 360);
  grad.addColorStop(0, "rgba(250,252,255,0.78)");
  grad.addColorStop(1, "rgba(136,150,178,0.54)");
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(160, 20);
  g.bezierCurveTo(266, 40, 306, 144, 280, 234);
  g.bezierCurveTo(258, 314, 196, 350, 160, 350);
  g.bezierCurveTo(124, 350, 62, 314, 40, 234);
  g.bezierCurveTo(14, 144, 54, 40, 160, 20);
  g.closePath();
  g.fill();
  g.clearRect(72, 124, 62, 34);
  g.clearRect(186, 124, 62, 34);
  return c;
}

function createNoiseFrames(count, size) {
  return Array.from({ length: count }, () => {
    const c = makeCanvas(size, size);
    const g = c.getContext("2d");
    const image = g.createImageData(size, size);
    for (let i = 0; i < image.data.length; i += 4) {
      const value = Math.random() * 255;
      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
      image.data[i + 3] = 32 + Math.random() * 48;
    }
    g.putImageData(image, 0, 0);
    return c;
  });
}
