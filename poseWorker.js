// poseWorker.js
importScripts("https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/pose.js");

let pose = null;
let ready = false;

// 初始化 Pose
async function initPose() {
  pose = new self.Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${file}`,
  });

  pose.setOptions({
    modelComplexity: 2,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.7,
  });

  pose.onResults((results) => {
    self.postMessage({ type: "results", results });
  });

  ready = true;
  self.postMessage({ type: "ready" });
}

onmessage = async (e) => {
  const { type, imageBitmap } = e.data;

  if (type === "init") {
    await initPose();
  } else if (type === "frame" && ready && pose) {
    try {
      await pose.send({ image: imageBitmap });
    } catch (err) {
      console.error("Pose processing failed:", err);
    } finally {
      imageBitmap.close();
    }
  }
};
