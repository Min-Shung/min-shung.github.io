importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/pose');

let pose = null;
let ready = false;

onmessage = async (e) => {
  const msg = e.data;

  if (msg.type === 'init') {
    if (pose) return;
    pose = new self.Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    pose.setOptions({
      modelComplexity: 2,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.7,
    });

    pose.onResults((results) => {
      // 只傳必要資料（避免 transfer 無法複製）
      const out = {
        type: 'results',
        source: results.source || 'unknown',
        // 深度複製 landmarks（structured clone 支援 Array of {x,y,z,visibility}）
        poseLandmarks: results.poseLandmarks || null,
        // 也傳 poseWorldLandmarks（如果有）
        poseWorldLandmarks: results.poseWorldLandmarks || null,
      };
      self.postMessage(out);
    });

    ready = true;
    self.postMessage({ type: 'ready' });
    return;
  }

  if (msg.type === 'frame') {
    if (!pose || !ready) {
      // 如果尚未啟動，釋放 bitmap
      if (msg.imageBitmap) try { msg.imageBitmap.close(); } catch (e) {}
      return;
    }
    try {
      pose._lastSource = msg.source || 'unknown';
      await pose.send({ image: msg.imageBitmap });
    } catch (err) {
      // 安全釋放
      // console.error('worker frame error', err);
    } finally {
      if (msg.imageBitmap) {
        try { msg.imageBitmap.close(); } catch (e) {}
      }
    }
  }
};
