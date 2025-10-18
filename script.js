// === IndexedDB 初始化 ===
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("videoDB", 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("videos")) {
        db.createObjectStore("videos");
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e);
  });
}

async function saveVideoToDB(key, blob) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("videos", "readwrite");
    tx.objectStore("videos").put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

async function loadVideoFromDB(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("videos", "readonly");
    const request = tx.objectStore("videos").get(key);
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e);
  });
}

// === 影片快取工具 ===
async function cacheDemoVideo(videoElement, key = "demoVideo") {
  const response = await fetch(videoElement.src);
  const blob = await response.blob();
  await saveVideoToDB(key, blob);
  console.log("影片已存入 IndexedDB");
}

async function loadDemoVideo(videoElement, key = "demoVideo") {
  const blob = await loadVideoFromDB(key);
  if (blob) {
    const url = URL.createObjectURL(blob);
    videoElement.src = url;
    videoElement.load();
    console.log("影片從 IndexedDB 載入");
    return true;
  }
  return false;
}

function setupPose(videoElement, canvasElement, poseInstance, pressPathName, pressTimestampsName, pressStartTimeName) {
  const ctx = canvasElement.getContext("2d");

  if (!window.frameTimes) window.frameTimes = [];

  function resizeCanvas() {
    if (videoElement.videoWidth && videoElement.videoHeight) {
      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;
    }
  }

  videoElement.addEventListener("loadedmetadata", resizeCanvas);
  window.addEventListener("resize", resizeCanvas);

  function getBoxDimensions() {
    const boxMarginRatio = 0.2;
    const width = canvasElement.width;
    const height = canvasElement.height;
    const boxX = width * boxMarginRatio;
    const boxY = height * boxMarginRatio;
    const boxWidth = width * (1 - 2 * boxMarginRatio);
    const boxHeight = height * (1 - 2 * boxMarginRatio);
    return { boxX, boxY, boxWidth, boxHeight };
  }

  function midpoint(p1, p2) {
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  }

  function calcAngle(a, b, c) {
    const ab = [b.x - a.x, b.y - a.y];
    const cb = [b.x - c.x, b.y - c.y];
    const dot = ab[0] * cb[0] + ab[1] * cb[1];
    const magAB = Math.hypot(ab[0], ab[1]);
    const magCB = Math.hypot(cb[0], cb[1]);
    return (Math.acos(dot / (magAB * magCB)) * 180) / Math.PI;
  }

  function isArmVertical(shoulder, wrist) {
    const dx = shoulder.x - wrist.x;
    const dy = shoulder.y - wrist.y;
    const angle = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
    return angle > 70 && angle < 110;
  }

  function areElbowsTogether(le, re, threshold = 0.2) {
    const dx = le.x - re.x;
    const dy = le.y - re.y;
    return Math.hypot(dx, dy) < threshold;
  }

  function smoothPath(path, k = 5) {
    const smoothed = [];
    for (let i = 0; i < path.length; i++) {
      let xSum = 0, ySum = 0, count = 0;
      for (let j = i - Math.floor(k / 2); j <= i + Math.floor(k / 2); j++) {
        if (path[j]) {
          xSum += path[j].x;
          ySum += path[j].y;
          count++;
        }
      }
      smoothed.push({ x: xSum / count, y: ySum / count });
    }
    return smoothed;
  }

  function findExtrema(yVals) {
    const peaks = [];
    for (let i = 1; i < yVals.length - 1; i++) {
      if (yVals[i] > yVals[i - 1] && yVals[i] > yVals[i + 1])
        peaks.push({ type: "max", y: yVals[i], index: i });
      if (yVals[i] < yVals[i - 1] && yVals[i] < yVals[i + 1])
        peaks.push({ type: "min", y: yVals[i], index: i });
    }
    return peaks;
  }

function onResults(results) {
  resizeCanvas();
  ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  const { boxX, boxY, boxWidth, boxHeight } = getBoxDimensions();
  ctx.strokeStyle = "green";
  ctx.lineWidth = 6;
  ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

  if (!results.poseLandmarks) return;

  const now = performance.now();
  window.frameTimes.push(now);
  if (window.frameTimes.length > 60) window.frameTimes.shift();

  let textLine = 60;
  const drawLine = (text, color = "white") => {
    ctx.fillStyle = color;
    ctx.font = `${canvasElement.height * 0.04}px Arial`;
    ctx.fillText(text, 20, textLine);
    textLine += canvasElement.height * 0.05;
  };

  const lm = results.poseLandmarks;
  const ls = lm[11], rs = lm[12];
  const le = lm[13], re = lm[14];
  const lw = lm[15], rw = lm[16];

  ctx.strokeStyle = "lime";
  ctx.lineWidth = 6;

  const drawArm = (s, e, w) => {
    ctx.beginPath();
    ctx.moveTo(s.x * canvasElement.width, s.y * canvasElement.height);
    ctx.lineTo(e.x * canvasElement.width, e.y * canvasElement.height);
    ctx.lineTo(w.x * canvasElement.width, w.y * canvasElement.height);
    ctx.stroke();
  };

  drawArm(ls, le, lw);
  drawArm(rs, re, rw);

  const leftAngle = calcAngle(ls, le, lw);
  const rightAngle = calcAngle(rs, re, rw);
  drawLine("左肘角度: " + leftAngle.toFixed(1));
  drawLine("右肘角度: " + rightAngle.toFixed(1));

  if (leftAngle < 160 || rightAngle < 160) {
    drawLine("⚠️ 手肘未打直", "yellow");
    playVoiceAlert("elbow");
  }

  // === 手腕位置警告 ===
  if (!window.wristNotUnderShoulderStart) window.wristNotUnderShoulderStart = null;
  const wristNotUnderShoulder = !isArmVertical(ls, lw) || !isArmVertical(rs, rw);
  if (wristNotUnderShoulder) {
    if (!window.wristNotUnderShoulderStart) window.wristNotUnderShoulderStart = now;
    const duration = now - window.wristNotUnderShoulderStart;
    if (duration >= 5000) drawLine("⚠️ 手腕未在肩膀正下方（超過5秒）", "yellow");
  } else {
    window.wristNotUnderShoulderStart = null;
  }

  // === 壓胸路徑分析 ===
  if (!window[pressPathName]) window[pressPathName] = [];
  const pressPoint = midpoint(lw, rw);
  const px = pressPoint.x * canvasElement.width;
  const py = pressPoint.y * canvasElement.height;
  window[pressPathName].push({ x: px, y: py });
  if (window[pressPathName].length > 60) window[pressPathName].shift();

  // 強化平滑化（k=11）
  const smoothedPath = smoothPath(window[pressPathName], 11);
  const yValues = smoothedPath.map((p) => p.y);

// === 靜止偵測（肩膀起伏判斷是否有在按壓） ===
const lsY = lm[11].y * canvasElement.height;
const rsY = lm[12].y * canvasElement.height;
const avgShoulderY = (lsY + rsY) / 2;

if (!window.shoulderHistory) window.shoulderHistory = [];
window.shoulderHistory.push(avgShoulderY);
if (window.shoulderHistory.length > 60) window.shoulderHistory.shift();

const shoulderRange = Math.max(...window.shoulderHistory) - Math.min(...window.shoulderHistory);
const smallMotionThreshold = Math.max(3, boxHeight * 0.01);

if (shoulderRange < smallMotionThreshold) {
  drawLine("⚠️未偵測到壓胸動作", "gray");
  return;
}


  const extrema = findExtrema(yValues);
  const depths = [];

  // === 增加深度閾值過濾（>10 像素） ===
  for (let i = 1; i < extrema.length - 1; i++) {
    const prev = extrema[i - 1], curr = extrema[i], next = extrema[i + 1];
    if (prev.type === "max" && curr.type === "min" && next.type === "max") {
      const depth = Math.max(prev.y - curr.y, next.y - curr.y);
      if (depth > 10) depths.push(depth);
    }
  }

  if (depths.length > 0) {
    const avgDepth = depths.reduce((a, b) => a + b, 0) / depths.length;
    const stdDepth = Math.sqrt(
      depths.reduce((sum, d) => sum + Math.pow(d - avgDepth, 2), 0) / depths.length
    );
    if (stdDepth > 15) {
      drawLine("⚠️ 壓胸深度不穩定", "yellow");
      playVoiceAlert("deep");
    }
  }

  // === 雙手交疊與壓胸頻率 ===
  const elbowsTogether = areElbowsTogether(le, re);
  if (elbowsTogether) {
    if (!window[pressTimestampsName]) window[pressTimestampsName] = [];
    if (!window[pressStartTimeName]) window[pressStartTimeName] = now;

    for (let i = 1; i < extrema.length - 1; i++) {
      const prev = extrema[i - 1];
      const curr = extrema[i];
      const next = extrema[i + 1];
      if (prev.type === "max" && curr.type === "min" && next.type === "max") {
        const timePrev = window.frameTimes[prev.index];
        const timeNext = window.frameTimes[next.index];
        if (!timePrev || !timeNext) continue;

        const avgTime = (timePrev + timeNext) / 2;
        const last = window[pressTimestampsName][window[pressTimestampsName].length - 1] || 0;
        if (avgTime - last > 400) window[pressTimestampsName].push(avgTime);
      }
    }

    if (window[pressTimestampsName].length > 20) {
      window[pressTimestampsName] = window[pressTimestampsName].slice(-20);
    }

    if (now - window[pressStartTimeName] < 5000) {
      drawLine("壓胸頻率: 計算中...", "white");
    } else if (window[pressTimestampsName].length >= 5) {
      const intervals = [];
      for (let i = 1; i < window[pressTimestampsName].length; i++) {
        intervals.push(window[pressTimestampsName][i] - window[pressTimestampsName][i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const frequency = 60000 / avgInterval;

      drawLine(
        `壓胸頻率: ${frequency.toFixed(1)} 下/分`,
        frequency >= 100 && frequency <= 120 ? "lime" : "yellow"
      );

      if (frequency < 100 || frequency > 120) {
        drawLine("⚠️ 壓胸頻率不正確 (建議 100~120)", "yellow");
        if (frequency < 100) playVoiceAlert("slow");
        if (frequency > 120) playVoiceAlert("quick");
      }
    }
  } else {
    window[pressTimestampsName] = [];
    window[pressStartTimeName] = null;
    drawLine("⚠️ 雙手未交疊，壓胸頻率清空", "yellow");
  }
}


  poseInstance.onResults(onResults);
}

// === 聲音提示 ===
let voiceEnabled = false;
let lastVoiceTime = 0;
const VOICE_COOLDOWN = 2600;
const sounds = {
  elbow: new Audio("radio/elbow.mp3"),
  hands: new Audio("radio/hands.mp3"),
  wrist: new Audio("radio/wrist.mp3"),
  slow: new Audio("radio/slow.mp3"),
  quick: new Audio("radio/quick.mp3"),
  deep: new Audio("radio/deep.mp3")
};

const toggleVoiceBtn = document.getElementById("toggleVoice");
const voiceIcon = document.getElementById("voiceIcon");
voiceIcon.classList.add("muted");

toggleVoiceBtn.addEventListener("click", () => {
  voiceEnabled = !voiceEnabled;
  voiceIcon.classList.toggle("muted", !voiceEnabled);
});

function playVoiceAlert(type) {
  if (!voiceEnabled) return;
  const now = Date.now();
  if (now - lastVoiceTime < VOICE_COOLDOWN) return;
  if (sounds[type]) {
    sounds[type].currentTime = 0;
    sounds[type].play();
    lastVoiceTime = now;
  }
}

// === 鏡頭設定 ===
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const pose = new Pose({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
});
pose.setOptions({
  modelComplexity: 2,
  smoothLandmarks: true,
  enableSegmentation: false,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.7,
});
setupPose(video, canvas, pose, "pressPath", "pressTimestamps", "pressStartTime");

let currentFacingMode = "user";
let camera;
let currentQuality = "low";

async function startCamera(facingMode) {
  if (camera) await camera.stop();
  const resolution = currentQuality === "low"
    ? { width: 320, height: 240 }
    : { width: 640, height: 480 };

  camera = new Camera(video, {
    onFrame: async () => await pose.send({ image: video }),
    width: 640,
    height: 480,
    facingMode: facingMode
  });
  camera.start();
}

document.getElementById("switchCamera").addEventListener("click", () => {
  currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
  startCamera(currentFacingMode);
});

startCamera(currentFacingMode);

// === 示範影片 ===
const demoVideo = document.getElementById("demoVideo");
const demoCanvas = document.getElementById("demoCanvas");

async function initDemoVideo() {
  // 初始化 MediaPipe
  const pose2 = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
  });
  pose2.setOptions({
    modelComplexity: 2,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.7,
  });
    await pose2.initialize();
  // 嘗試從 IndexedDB 載入影片
  const loaded = await loadDemoVideo(demoVideo);
  if (!loaded) demoVideo.src = "CPR_demonstration.mov";

   demoVideo.onloadeddata = async () => {
    // 如果影片不是快取版本，順便 cache
    if (!loaded) await cacheDemoVideo(demoVideo);

    setupPose(demoVideo, demoCanvas, pose2, "pressPath2", "pressTimestamps2", "pressStartTime2");
    demoVideo.playbackRate = 0.86;
    // === 無縫循環 ===
    demoVideo.addEventListener("timeupdate", () => {
    if (demoVideo.duration && demoVideo.currentTime >= demoVideo.duration - 0.08) {
        demoVideo.pause();
        demoVideo.currentTime = 0;
        demoVideo.play();
    }
    });

    demoVideo.addEventListener("seeked", () => {
    if (demoVideo.paused) demoVideo.play();
    });

    // === Pose 偵測循環 ===
    async function loopDetection() {
    if (!demoVideo.paused && !demoVideo.ended) {
        await pose2.send({ image: demoVideo });
    }
    requestAnimationFrame(loopDetection);
    }

    loopDetection();
  };
}


initDemoVideo();