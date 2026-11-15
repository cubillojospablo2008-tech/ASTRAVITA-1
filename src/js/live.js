/* =====================================================================
   ASTRAVITA.live — capture (camera / video file / demo script), face
   analysis (MediaPipe Face Landmarker, 478 points + blendshapes; same model
   family as tfjs-models face-landmarks-detection, c2), expressions,
   micro-expressions, fatigue cues and the explainable live indices.
   Video frames are processed in memory only and never leave the device.
   ===================================================================== */
ASTRAVITA.live = (() => {
  const U = ASTRAVITA.util, {fin, clamp, mean, std, median, rnd} = U;

  /* ---------- thresholds (see knowledge base reference_ranges) ---------- */
  const T = {
    PERCLOS_CLOSED: 0.8,        // P80: eyelid >= 80 % closed counts as closed
    PERCLOS_WINDOW_MS: 60000,
    BLINK_ON: 0.5, BLINK_OFF: 0.35, BLINK_MAX_MS: 1000,
    MAR_YAWN: 0.7, YAWN_MIN_MS: 1500,
    MICRO_MIN_MS: 40, MICRO_MAX_MS: 500, AU_DELTA: 0.18,
    CAL_SECONDS: 30
  };

  /* ---------- expression mapping: blendshapes -> 7 basic expressions ----------
     Weights follow the FACS action units usually linked to each prototype
     (Ekman & Friesen): happiness AU6+12, sadness AU1+4+15, anger AU4+5+7+23,
     fear AU1+2+4+5+20+26, surprise AU1+2+5+26, disgust AU9+15+16. Neutral is
     the remainder. Scores are baseline-subtracted, smoothed (EMA) and normalized to 100 %. */
  const EMOTION_MAP = {
    happy: {mouthSmileLeft: .3, mouthSmileRight: .3, cheekSquintLeft: .2, cheekSquintRight: .2},
    sad: {browInnerUp: .3, mouthFrownLeft: .25, mouthFrownRight: .25, browDownLeft: .1, browDownRight: .1},
    angry: {browDownLeft: .25, browDownRight: .25, mouthPressLeft: .15, mouthPressRight: .15, eyeSquintLeft: .1, eyeSquintRight: .1},
    fear: {browInnerUp: .25, eyeWideLeft: .2, eyeWideRight: .2, mouthStretchLeft: .15, mouthStretchRight: .15, jawOpen: .05},
    surprise: {browOuterUpLeft: .2, browOuterUpRight: .2, eyeWideLeft: .15, eyeWideRight: .15, jawOpen: .3},
    disgust: {noseSneerLeft: .35, noseSneerRight: .35, mouthUpperUpLeft: .15, mouthUpperUpRight: .15}
  };
  const EMOTIONS = ['neutral', 'happy', 'sad', 'angry', 'fear', 'surprise', 'disgust'];
  const EMO_LABEL = {neutral: 'Neutral', happy: 'Joy', sad: 'Sadness', angry: 'Anger', fear: 'Fear', surprise: 'Surprise', disgust: 'Disgust'};

  /* ---------- action units used for micro-expression onset detection ---------- */
  const AUS = [
    {id: 'au12', code: 'AU6+12', name: 'Smile (zygomaticus)', type: 'joy', keys: ['mouthSmileLeft', 'mouthSmileRight', 'cheekSquintLeft', 'cheekSquintRight']},
    {id: 'au4', code: 'AU4', name: 'Brow lowerer (corrugator)', type: 'anger / effort', keys: ['browDownLeft', 'browDownRight'], neg: true},
    {id: 'au1', code: 'AU1+2', name: 'Brow raiser (frontalis)', type: 'surprise / fear', keys: ['browInnerUp', 'browOuterUpLeft', 'browOuterUpRight']},
    {id: 'au9', code: 'AU9', name: 'Nose wrinkler', type: 'disgust', keys: ['noseSneerLeft', 'noseSneerRight'], neg: true},
    {id: 'au15', code: 'AU15', name: 'Lip corner depressor', type: 'sadness', keys: ['mouthFrownLeft', 'mouthFrownRight'], neg: true},
    {id: 'au24', code: 'AU24', name: 'Lip pressor', type: 'suppression / tension', keys: ['mouthPressLeft', 'mouthPressRight'], neg: true},
    {id: 'au14', code: 'AU14', name: 'Unilateral lip dimpler', type: 'contempt', fn: g => Math.abs(g('mouthSmileLeft') - g('mouthSmileRight')) + Math.abs(g('mouthDimpleLeft') - g('mouthDimpleRight')), neg: true},
    {id: 'au20', code: 'AU20', name: 'Lip stretcher', type: 'fear', keys: ['mouthStretchLeft', 'mouthStretchRight'], neg: true}
  ];

  /* ---------- landmark index sets (FaceMesh topology) ---------- */
  const FH = [10, 109, 67, 103, 338, 297, 332, 108, 151, 337, 9], LC = [117, 118, 101, 36, 205, 187, 123, 50], RC = [346, 347, 330, 266, 425, 411, 352, 280];
  const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
  const EYE_L = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246], EYE_R = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
  const LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
  const BROW_L = [70, 63, 105, 66, 107], BROW_R = [300, 293, 334, 296, 336], NOSE = [168, 6, 197, 195, 5, 4, 1, 19, 94, 2];

  /* ---------- state ---------- */
  let els = {}, hooks = {};
  let lm = null, mpStatus = 'idle', mpDelegate = '';
  let mode = null, running = false, gen = 0, lastTs = 0, rvfcHandle = null;
  let B, O, IDX, EMO, emoBase, AUSTATE, demo, calib, rec, opts = {mesh: true, rois: false, alg: 'auto'};
  const work = document.createElement('canvas'), wctx = work.getContext('2d', {willReadFrequently: true});
  let lastCompute = 0, lastSignal = 0, lastSecond = 0, t0 = 0;

  function reset() {
    B = {t: [], r: [], g: [], b: [], bright: [], ht: [], hy: [], hx: [], hyaw: [], hpitch: [], det: [], closed: [], blinkT: [], closeStart: null, sleepFlag: false, mouthStart: null,
      tens: [], tensT: [], microT: [], yawnT: [], sleepT: [], hrHist: [], pulse: [], resp: [], lastFeat: null, lastFeatT: 0, frames: [], ear: [], emoSeries: []};
    O = {hr: null, hrRaw: null, snr: null, alg: null, rmssd: null, rr: null, conf: 0, blink: null, perclos: null, tension: null, stab: null, angStd: null, pose: null, microRate: 0, microNeg: 0, yawns: 0, sleeps: 0, bright: null, face: false, track: 0, fps: 0, quality: 0, faceFrac: null, center: null, lat: 0};
    IDX = {ready: false, F: 0, S: 0, W: 100, level: 1, tf: [], ts: []};
    EMO = Object.fromEntries(EMOTIONS.map(k => [k, k === 'neutral' ? 100 : 0]));
    AUSTATE = AUS.map(a => ({...a, v: 0, base: 0, active: false, t0: 0, peak: 0, lastT: 0}));
    if (calib) { const c = calib; calib = null; c.reject(Object.assign(new Error('Calibration cancelled.'), {code: 'cancel'})); }   // never leave a calibration promise hanging
    demo = null; rec = null;
  }
  reset();

  /* ---------- MediaPipe loader (lazy: only when a camera/video session starts) ---------- */
  // model status hooks may fire after the user left the monitor view: never let a view error escape as an unhandled rejection
  const modelHook = (...a) => { try { hooks.onModel?.(...a); } catch (e) { console.warn('[ASTRAVITA] onModel hook', e); } };
  async function loadModel() {
    if (lm) return 'ready';
    if (mpStatus === 'loading') { while (mpStatus === 'loading') await new Promise(r => setTimeout(r, 150)); return mpStatus; }
    mpStatus = 'loading'; modelHook('loading');
    const tries = [
      {mod: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs', wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm', model: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'},
      {mod: './mediapipe/vision_bundle.mjs', wasm: './mediapipe/wasm', model: './mediapipe/face_landmarker.task'}   // optional offline copy (requires http serving)
    ];
    for (const s of tries) {
      if (s.mod.startsWith('./') && location.protocol === 'file:') continue;
      try {
        const V = await import(new URL(s.mod, location.href).href);
        const fileset = await V.FilesetResolver.forVisionTasks(new URL(s.wasm, location.href).href);
        const o = d => ({baseOptions: {modelAssetPath: new URL(s.model, location.href).href, delegate: d}, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true});
        try { lm = await V.FaceLandmarker.createFromOptions(fileset, o('GPU')); mpDelegate = 'GPU'; }
        catch { lm = await V.FaceLandmarker.createFromOptions(fileset, o('CPU')); mpDelegate = 'CPU'; }
        mpStatus = 'ready'; modelHook('ready', mpDelegate); return 'ready';
      } catch (e) { console.warn('[ASTRAVITA] face model source failed:', s.mod, e && e.message); }
    }
    mpStatus = 'error'; modelHook('error'); return 'error';
  }

  /* ---------- sources ---------- */
  function attach(elements, callbacks) { els = elements; hooks = callbacks || {}; }
  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) { const e = new Error('This browser cannot access a camera here. Open ASTRAVITA in Chrome, Edge or Safari over https, localhost or as a local file, or use a video file or the demo script.'); e.code = 'nocam-api'; throw e; }
    let st;
    try { st = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'user', width: {ideal: 640}, height: {ideal: 480}, frameRate: {ideal: 30}}, audio: false}); }
    catch (e) {
      const err = new Error(e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in your browser settings, or use a video file or the demo script.' : e.name === 'NotFoundError' || e.name === 'OverconstrainedError' ? 'No camera was found on this device. Connect a camera, or use a video file or the demo script.' : e.name === 'NotReadableError' ? 'The camera is being used by another application. Close it and try again.' : `The camera is not available (${e.name || 'unknown error'}).`);
      err.code = e.name; throw err;
    }
    stop(true); reset();
    const v = els.video; v.srcObject = st; v.muted = true; v.playsInline = true;
    try { await v.play(); }
    catch (e) { st.getTracks().forEach(t => t.stop()); v.srcObject = null; const err = new Error('The camera stream could not be started. Try again, or use a video file or the demo script.'); err.code = e.name || 'play'; throw err; }   // never leave the camera on
    begin('camera'); const g = gen;
    st.getVideoTracks()[0]?.addEventListener('ended', () => { if (mode === 'camera' && g === gen) hooks.onError?.('The camera was disconnected. The session was paused; you can end it or restart.'); }, {once: true});
    loadModel();
  }
  async function startFile(file) {
    if (!file || !/^video\//.test(file.type)) { const e = new Error('Choose a video file (MP4, WebM or MOV).'); e.code = 'badfile'; throw e; }
    stop(true); reset();
    const v = els.video; v.srcObject = null; v.src = URL.createObjectURL(file); v.muted = true; v.loop = false;
    try { await v.play(); } catch (e) { stop(true); const err = new Error('This video could not be played in the browser. Try MP4 (H.264) or WebM.'); err.code = 'play'; throw err; }   // stop() revokes the object URL
    begin('file'); const g = gen;
    // listener is bound to this run only: stale listeners from a cancelled file must not end a later session
    v.addEventListener('ended', () => { if (mode === 'file' && g === gen) hooks.onEnded?.(); }, {once: true});
    loadModel();
  }
  function startDemo() {
    stop(true); reset();
    demo = {k: 0, phase: 0, rphase: 0, nextBlink: 1.2, blinkEnd: -1, blinkStart: 0, blinkDur: .15, micro: [], sleepDone: false, yawnDone: false, cycle: -1, rnd: U.prng(20261115)};
    begin('demo');
  }
  function begin(m) {
    mode = m; running = true; t0 = performance.now(); lastSecond = t0; lastTs = 0;
    gen++; const g = gen;
    const v = els.video;
    if (m !== 'demo' && 'requestVideoFrameCallback' in HTMLVideoElement.prototype) {
      const step = (now) => { if (!running || g !== gen) return; tick(now, true); rvfcHandle = v.requestVideoFrameCallback(step); };
      rvfcHandle = v.requestVideoFrameCallback(step);
      // keep computing even when no new frames arrive (e.g. paused camera)
      const idle = () => { if (!running || g !== gen) return; tick(performance.now(), false); setTimeout(idle, 250); };
      setTimeout(idle, 250);
    } else {
      let lastVT = -1;
      const loop = now => {
        if (!running || g !== gen) return;
        if (m === 'demo') tick(now, true);
        else { const fresh = v.readyState >= 2 && v.currentTime !== lastVT; if (fresh) lastVT = v.currentTime; tick(now, fresh); }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
    hooks.onStart?.(m);
  }
  function stop(silent) {
    running = false; gen++;
    const v = els.video;
    if (v) {
      if (rvfcHandle != null && v.cancelVideoFrameCallback) try { v.cancelVideoFrameCallback(rvfcHandle); } catch { /* ignore */ }
      const s = v.srcObject; if (s) s.getTracks().forEach(t => t.stop());
      v.srcObject = null;
      if (v.src && v.src.startsWith('blob:')) URL.revokeObjectURL(v.src);
      v.removeAttribute('src'); try { v.load(); } catch { /* ignore */ }
    }
    rvfcHandle = null;
    if (els.overlay) { const c = els.overlay.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, els.overlay.width, els.overlay.height); }
    const was = mode; mode = null;
    if (!silent) hooks.onStop?.(was);
  }

  /* ---------- main tick ---------- */
  function tick(now, freshFrame) {
    try {
      if (mode === 'demo') demoStep(now);
      else if (freshFrame) frame(now);
      if (now - lastSignal >= 500) { lastSignal = now; requestSignal(now); }
      if (now - lastCompute >= 250) { lastCompute = now; compute(now); }
      if (now - lastSecond >= 1000) { lastSecond += 1000 * Math.floor((now - lastSecond) / 1000); everySecond(now); }
    } catch (e) { console.error('[ASTRAVITA] live tick', e); }
  }

  /* ---------- camera/video frame ---------- */
  function nbox(pts, L, shrink) {
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    for (const i of pts) { const p = L[i]; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const dx = (x1 - x0) * shrink, dy = (y1 - y0) * shrink;
    return [x0 + dx, y0 + dy, x1 - x0 - 2 * dx, y1 - y0 - 2 * dy];
  }
  function avgRGB(nb) {
    let x = Math.round(nb[0] * work.width), y = Math.round(nb[1] * work.height), w = Math.round(nb[2] * work.width), h = Math.round(nb[3] * work.height);
    x = Math.max(0, x); y = Math.max(0, y); w = Math.min(work.width - x, w); h = Math.min(work.height - y, h);
    if (w < 2 || h < 2) return null;
    const d = wctx.getImageData(x, y, w, h).data; let r = 0, g = 0, b = 0, n = 0, all = 0, na = 0;
    for (let i = 0; i < d.length; i += 4) { const s = d[i] + d[i + 1] + d[i + 2]; all += s; na++; if (s < 60 || s > 720) continue; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    return n ? [r / n, g / n, b / n, n, all / na / 3] : [0, 0, 0, 0, na ? all / na / 3 : 0];
  }
  const ndist = (a, b) => Math.hypot((a.x - b.x) * (work.width || 1), (a.y - b.y) * (work.height || 1));
  const ear = (L, idx) => { const [p1, p2, p3, p4, p5, p6] = idx.map(i => L[i]); return (ndist(p2, p6) + ndist(p3, p5)) / (2 * (ndist(p1, p4) || 1)); };
  const marOf = L => ndist(L[13], L[14]) / (ndist(L[78], L[308]) || 1);

  function frame(now) {
    const v = els.video; const ts = Math.max(now, lastTs + 1); lastTs = ts;
    B.frames.push(now); while (B.frames.length && now - B.frames[0] > 1000) B.frames.shift();
    const vw = v.videoWidth || 640, vh = v.videoHeight || 480;
    const W = 320, H = Math.round(320 * vh / vw) || 240;
    if (work.width !== W || work.height !== H) { work.width = W; work.height = H; }
    wctx.drawImage(v, 0, 0, W, H);
    let res = null;
    if (lm) {
      const t1 = performance.now();
      try { res = lm.detectForVideo(v, ts); } catch (e) { if (!B.mpErr) { B.mpErr = 1; console.warn('[ASTRAVITA] inference', e); } }
      O.lat = O.lat * 0.9 + (performance.now() - t1) * 0.1;
    }
    const L = res?.faceLandmarks?.[0];
    B.det.push([now, L ? 1 : 0]); while (B.det.length && now - B.det[0][0] > 3000) B.det.shift();
    let boxes;
    if (L) {
      boxes = [nbox(FH, L, 0.12), nbox(LC, L, 0.15), nbox(RC, L, 0.15)];
      const f = features(L, res.faceBlendshapes?.[0]?.categories || [], res.facialTransformationMatrixes?.[0]);
      ingest(now, f);
      drawOverlay(L, boxes, vw, vh);
    } else {
      boxes = [[0.38, 0.18, 0.24, 0.12]];   // fixed forehead ROI when no model or no face
      drawOverlay(null, lm ? [] : boxes, vw, vh);
      B.lastFeat = null; B.closeStart = null; B.mouthStart = null;
    }
    let acc = [0, 0, 0], n = 0, br = [];
    for (const bx of boxes) { const c = avgRGB(bx); if (c) { br.push(c[4]); if (c[3]) { acc[0] += c[0] * c[3]; acc[1] += c[1] * c[3]; acc[2] += c[2] * c[3]; n += c[3]; } } }
    if (br.length) { B.bright.push(mean(br)); if (B.bright.length > 90) B.bright.shift(); }
    if (n && !(lm && !L)) pushRGB(now, acc[0] / n, acc[1] / n, acc[2] / n);
  }
  function pushRGB(now, r, g, b) {
    B.t.push(now); B.r.push(r); B.g.push(g); B.b.push(b);
    while (B.t.length && B.t[B.t.length - 1] - B.t[0] > 22000) { B.t.shift(); B.r.shift(); B.g.shift(); B.b.shift(); }
  }
  function features(L, cats, M) {
    const bs = {}; for (const c of cats) bs[c.categoryName] = c.score;
    const has = cats.length > 0;
    const e = (ear(L, [33, 160, 158, 133, 153, 144]) + ear(L, [362, 385, 387, 263, 373, 380])) / 2;
    B.ear.push(e); if (B.ear.length > 300) B.ear.shift();
    let closure;
    if (has) closure = ((bs.eyeBlinkLeft || 0) + (bs.eyeBlinkRight || 0)) / 2;
    else { const open = [...B.ear].sort((a, b) => a - b)[Math.floor(B.ear.length * 0.9)] || e; closure = clamp((open - e) / (open * 0.6), 0, 1); }
    let yaw = 0, pitch = 0, roll = 0;
    if (M?.data) { const m = M.data; yaw = Math.atan2(m[8], m[10]) * 57.3; pitch = Math.asin(clamp(-m[9], -1, 1)) * 57.3; roll = Math.atan2(m[1], m[5]) * 57.3; }
    else { const cx = (L[234].x + L[454].x) / 2, wdt = (L[454].x - L[234].x) || 1; yaw = (L[1].x - cx) / wdt * 90; roll = Math.atan2(L[263].y - L[33].y, L[263].x - L[33].x) * 57.3; }
    const fh = ndist(L[10], L[152]) || 1;
    return {bs, has, closure, ear: e, mar: marOf(L), pose: [yaw, pitch, roll],
      nx: L[1].x * work.width / fh, ny: (L[1].y + L[10].y + L[152].y) / 3 * work.height / fh,
      faceFrac: Math.abs(L[454].x - L[234].x), center: (L[234].x + L[454].x) / 2};
  }

  /* ---------- per-frame feature ingestion (shared by camera, video and demo) ---------- */
  function ingest(now, f) {
    B.lastFeat = f; O.faceFrac = f.faceFrac; O.center = f.center;
    B.ht.push(now); B.hy.push(f.ny); B.hx.push(f.nx); B.hyaw.push(f.pose[0]); B.hpitch.push(f.pose[1]);
    while (B.ht.length && now - B.ht[0] > 32000) { B.ht.shift(); B.hy.shift(); B.hx.shift(); B.hyaw.shift(); B.hpitch.shift(); }
    if (B.lastFeatT && now - B.lastFeatT > 500) { B.closeStart = null; B.mouthStart = null; }
    B.lastFeatT = now;
    // blinks, PERCLOS (P80), prolonged closures
    const c = f.closure;
    if (B.closeStart == null && c > T.BLINK_ON) { B.closeStart = now; B.sleepFlag = false; }
    else if (B.closeStart != null && c >= T.BLINK_OFF && !B.sleepFlag && now - B.closeStart >= T.BLINK_MAX_MS) {
      B.sleepFlag = true; B.sleepT.push(now); O.sleeps++;
      event('closure', 'Eyes closed for 1 s or longer', 'warn');
    }
    if (B.closeStart != null && c < T.BLINK_OFF) { const d = now - B.closeStart; B.closeStart = null; if (d < T.BLINK_MAX_MS) B.blinkT.push(now); }
    B.closed.push([now, c >= T.PERCLOS_CLOSED ? 1 : 0]); while (B.closed.length && now - B.closed[0][0] > T.PERCLOS_WINDOW_MS) B.closed.shift();
    while (B.blinkT.length && now - B.blinkT[0] > 60000) B.blinkT.shift();
    // yawns (mouth aspect ratio sustained)
    const mar = fin(f.mar) ? f.mar : (f.bs.jawOpen || 0);
    if (mar > T.MAR_YAWN) { if (B.mouthStart == null) B.mouthStart = now; }
    else { if (B.mouthStart != null && now - B.mouthStart > T.YAWN_MIN_MS) { B.yawnT.push(now); O.yawns++; event('yawn', 'Yawn detected (sustained mouth opening)', 'info', {duration_ms: Math.round(now - B.mouthStart)}); } B.mouthStart = null; }
    // facial tension: corrugator, orbicularis, lip press, nose, lip roll
    const g = n => f.bs[n] || 0;
    const ten = clamp(((g('browDownLeft') + g('browDownRight')) * 0.9 + (g('eyeSquintLeft') + g('eyeSquintRight')) * 0.6 + (g('mouthPressLeft') + g('mouthPressRight')) * 0.8 + (g('noseSneerLeft') + g('noseSneerRight')) * 0.5 + (g('mouthRollLower') + g('mouthRollUpper')) * 0.4) / 3.2 * 1.8, 0, 1);
    B.tens.push(ten); B.tensT.push(now); while (B.tensT.length && now - B.tensT[0] > 3000) { B.tens.shift(); B.tensT.shift(); }
    if (f.has) { emotions(f.bs); auUpdate(now, f.bs, c); }
    if (calib) { calib.bs.push(f.bs); }
  }
  function rawEmotion(bs) {
    const out = {};
    for (const [k, w] of Object.entries(EMOTION_MAP)) { let s = 0; for (const [n, wt] of Object.entries(w)) s += (bs[n] || 0) * wt; out[k] = s; }
    return out;
  }
  function emotions(bs) {
    const raw = rawEmotion(bs);
    const sc = {}; let tot = 0;
    for (const k in raw) { const v = clamp((raw[k] - (emoBase?.[k] || 0)) * 2.2, 0, 1); sc[k] = v; tot += v; }
    sc.neutral = Math.max(0.15, 1 - Math.max(...Object.values(sc)) * 1.3);
    tot += sc.neutral;
    for (const k of EMOTIONS) { const target = 100 * sc[k] / (tot || 1); EMO[k] += (target - EMO[k]) * 0.15; }
    const s = EMOTIONS.reduce((a, k) => a + EMO[k], 0) || 1; for (const k of EMOTIONS) EMO[k] = EMO[k] * 100 / s;
  }
  function auUpdate(now, bs, closure) {
    const g = n => bs[n] || 0;
    for (const a of AUSTATE) {
      const v = a.fn ? clamp(a.fn(g), 0, 1) : clamp(a.keys.reduce((s, k) => s + g(k), 0) / a.keys.length, 0, 1);
      const dt = a.lastT ? now - a.lastT : 33; a.lastT = now; a.v = v;
      const delta = v - a.base;
      if (!a.active) {
        a.base += (v - a.base) * Math.min(1, dt / 2500);
        if (delta > T.AU_DELTA && closure < 0.4) { a.active = true; a.t0 = now; a.peak = v; }
      } else {
        a.peak = Math.max(a.peak, v);
        if (delta < T.AU_DELTA * 0.5) {
          a.active = false; const d = now - a.t0;
          if (d >= T.MICRO_MIN_MS && d <= T.MICRO_MAX_MS) {
            B.microT.push({t: now, neg: !!a.neg});
            event('micro', `${a.code} ${a.name}`, a.neg ? 'warn' : 'info', {au: a.code, type: a.type, duration_ms: Math.round(d), intensity: rnd(a.peak, 2)});
          }
        } else if (now - a.t0 > 6000) { a.active = false; a.base = v; }
      }
    }
  }

  /* ---------- signal requests (worker) ---------- */
  ASTRAVITA.signal.onResult(out => {
    const fresh = B.t.length && performance.now() - B.t[B.t.length - 1] < 1500;
    if (!fresh) { O.hrRaw = O.snr = O.rmssd = null; B.hrHist.length = 0; return; }
    O.alg = out.alg; O.snr = out.snr; B.pulse = out.pulse || [];
    if (fin(out.hr) && out.snr > -6) { B.hrHist.push(out.hr); if (B.hrHist.length > 9) B.hrHist.shift(); }
    O.hrRaw = B.hrHist.length ? median(B.hrHist) : null;
    if (fin(out.rmssd) && out.snr > 0) O.rmssd = O.rmssd == null ? out.rmssd : O.rmssd * 0.7 + out.rmssd * 0.3;
    if (fin(out.rr)) { O.rr = out.rr; B.resp = out.resp || []; }
  });
  function requestSignal(now) {
    const fresh = B.t.length && now - B.t[B.t.length - 1] < 1500;
    if (!fresh || B.t.length < 60) return;
    const k = Math.max(0, B.t.length - 660);
    const hk = Math.max(0, B.ht.length - 1000);
    ASTRAVITA.signal.request({t: B.t.slice(k), r: B.r.slice(k), g: B.g.slice(k), b: B.b.slice(k), ht: B.ht.slice(hk), hy: B.hy.slice(hk), alg: opts.alg});
  }

  /* ---------- metric computation (every 250 ms) ---------- */
  function compute(now) {
    const fresh = B.t.length && now - B.t[B.t.length - 1] < 1500;
    if (!fresh) { O.hrRaw = null; O.snr = null; }
    O.conf = fin(O.snr) ? clamp((O.snr + 6) * 7, 0, 100) : 0;
    const faceFresh = B.ht.length && now - B.ht[B.ht.length - 1] < 1500;
    if (faceFresh) {
      const i0 = B.ht.findIndex(t => now - t < 5000);
      if (i0 >= 0 && B.ht.length - i0 > 10) {
        const sway = (std(B.hx.slice(i0)) + std(B.hy.slice(i0))) * 100;
        O.angStd = std(B.hyaw.slice(i0)) + std(B.hpitch.slice(i0));
        O.stab = clamp(100 - sway * 12 - O.angStd * 4, 0, 100);
      }
      if (B.closed.length > 30) { const win = Math.min(60, (now - B.closed[0][0]) / 1000); O.blink = B.blinkT.length * 60 / Math.max(win, 10); O.perclos = 100 * mean(B.closed.map(c => c[1])); }
      O.tension = B.tens.length ? mean(B.tens) * 100 : null;
      O.pose = B.lastFeat?.pose || null;
    } else { O.stab = O.blink = O.perclos = O.tension = O.pose = O.angStd = null; }
    if (!faceFresh && !fresh) { O.rr = null; B.resp = []; }
    B.microT = B.microT.filter(m => now - m.t < 60000);
    O.microRate = B.microT.length; O.microNeg = B.microT.filter(m => m.neg).length;
    O.fps = mode === 'demo' ? 30 : B.frames.length;
    O.track = B.det.length ? 100 * mean(B.det.map(d => d[1])) : (mode === 'demo' ? 100 : 0);
    O.face = !!faceFresh;
    O.bright = B.bright.length ? mean(B.bright.slice(-30)) : null;
    const usable = fin(O.hrRaw) && fresh && (mode === 'demo' || ((lm ? O.track >= 60 : true) && O.fps >= 10)) && O.snr >= -3;
    O.hr = usable ? O.hrRaw : null;
    if (!fin(O.hr)) O.rmssd = null;
    const light = !fin(O.bright) ? 0 : O.bright < 35 ? 20 : O.bright < 60 ? 60 : O.bright > 235 ? 50 : 100;
    O.quality = mode === 'demo' ? clamp(70 + O.conf * 0.3, 0, 100) : running ? clamp(0.5 * (usable ? O.conf : O.conf * 0.4) + 0.3 * O.track + 0.2 * light, 0, 100) : 0;
    analyzeIdx();
    if (calib) calibStep(now);
    hooks.onTick?.(snapshot());
  }

  /* ---------- explainable live indices (additive, EBM-style; c1 InterpretML) ---------- */
  const recent = (arr, ms) => arr.filter(t => performance.now() - t < ms).length;
  function analyzeIdx() {
    const o = O, bl = baselineRef();
    const ready = running && (fin(o.hr) || fin(o.perclos) || fin(o.tension));
    const tf = [], ts = [];
    const term = (list, name, val, pts, max) => list.push({name, val, pts: clamp(pts, 0, max), max});
    term(tf, 'PERCLOS', fin(o.perclos) ? U.fmt(o.perclos, 1) + ' %' : '—', fin(o.perclos) ? (o.perclos - 6) / 14 * 40 : 0, 40);
    term(tf, 'Blink rate', fin(o.blink) ? U.fmt(o.blink, 0) + '/min' : '—', fin(o.blink) ? Math.max((10 - o.blink) / 8, (o.blink - 24) / 16) * 15 : 0, 15);
    const sl = recent(B.sleepT, 300000), yw = recent(B.yawnT, 300000);
    term(tf, 'Long eye closures (5 min)', String(sl), sl * 15, 30);
    term(tf, 'Yawns (5 min)', String(yw), yw * 7, 20);
    term(tf, 'Head nodding / sway', fin(o.angStd) ? '±' + U.fmt(o.angStd, 1) + '°' : '—', fin(o.angStd) ? (o.angStd - 1.5) / 4 * 10 : 0, 10);
    const hrRef = fin(bl.hr_bpm) ? bl.hr_bpm : 70;
    term(ts, `Heart rate vs ${fin(bl.hr_bpm) ? 'baseline' : 'reference'}`, fin(o.hr) ? U.sgn(o.hr - hrRef, 0) + ' bpm' : '—', fin(o.hr) ? (o.hr - hrRef - 5) / 25 * 30 : 0, 30);
    term(ts, 'Low HRV (RMSSD)', fin(o.rmssd) ? U.fmt(o.rmssd, 0) + ' ms' : '—', fin(o.rmssd) ? (35 - o.rmssd) / 25 * 20 : 0, 20);
    term(ts, 'Facial tension', fin(o.tension) ? U.fmt(o.tension, 0) + '/100' : '—', fin(o.tension) ? (o.tension - 25) / 45 * 25 : 0, 25);
    term(ts, 'Breathing rate', fin(o.rr) ? U.fmt(o.rr, 0) + ' /min' : '—', fin(o.rr) ? (o.rr - 18) / 8 * 15 : 0, 15);
    term(ts, 'Negative micro-expressions', `${o.microNeg}/min`, o.microNeg / 6 * 10, 10);
    const F = clamp(tf.reduce((s, t) => s + t.pts, 0), 0, 100), Sx = clamp(ts.reduce((s, t) => s + t.pts, 0), 0, 100);
    const neg = EMO.sad + EMO.angry + EMO.fear + EMO.disgust, pos = EMO.happy;
    IDX = {ready, F, S: Sx, W: clamp(100 - 0.5 * F - 0.4 * Sx - 0.4 * Math.max(0, neg - pos), 0, 100), level: clamp(1 + Math.floor(F / 20), 1, 5), tf, ts};
  }

  /* ---------- calibration ---------- */
  let baselineHint = null;
  function setBaseline(b) { baselineHint = b || null; emoBase = b?.emo_base || null; for (const a of AUSTATE) if (b?.au_base?.[a.id] != null) a.base = b.au_base[a.id]; }
  const baselineRef = () => baselineHint || {};
  function startCalibration(seconds = T.CAL_SECONDS) {
    cancelCalibration();
    if (!running) return Promise.reject(Object.assign(new Error('Start the camera, a video or the demo before calibrating.'), {code: 'calib'}));
    return new Promise((resolve, reject) => { calib = {start: performance.now(), dur: seconds * 1000, hr: [], rmssd: [], rr: [], blink: [], perclos: [], tension: [], stab: [], bs: [], resolve, reject}; });
  }
  function calibStep(now) {
    const c = calib, o = O, p = Math.min(1, (now - c.start) / c.dur);
    if (o.face || mode === 'demo') {
      if (fin(o.hr)) c.hr.push(o.hr); if (fin(o.rmssd)) c.rmssd.push(o.rmssd); if (fin(o.rr)) c.rr.push(o.rr);
      if (fin(o.blink)) c.blink.push(o.blink); if (fin(o.perclos)) c.perclos.push(o.perclos); if (fin(o.tension)) c.tension.push(o.tension); if (fin(o.stab)) c.stab.push(o.stab);
    }
    hooks.onCalibration?.(p);
    if (p < 1) return;
    if (mode === 'demo' && !c.hr.length && now - c.start < c.dur + 20000) return;   // demo: wait for pulse lock
    calib = null;
    const enough = c.tension.length >= 20 || c.hr.length >= 10;
    if (!enough) { c.reject(Object.assign(new Error('Not enough face data was captured for a baseline. Improve lighting, face the camera and try again.'), {code: 'calib'})); return; }
    const bsKeys = new Set(); c.bs.forEach(b => Object.keys(b).forEach(k => bsKeys.add(k)));
    const rawE = c.bs.map(rawEmotion);
    const emo_base = Object.fromEntries(Object.keys(EMOTION_MAP).map(k => [k, rnd(median(rawE.map(x => x[k])), 3)]));
    const au_base = Object.fromEntries(AUSTATE.map(a => [a.id, rnd(a.base, 3)]));
    const b = {calibrated_at: new Date().toISOString(), source: mode, hr_bpm: rnd(median(c.hr), 1), rmssd_ms: rnd(median(c.rmssd), 1), rr_rpm: rnd(median(c.rr), 1), blink_rate_min: rnd(median(c.blink), 1), perclos_pct: rnd(median(c.perclos), 1), facial_tension: rnd(median(c.tension), 1), head_stability_pct: rnd(median(c.stab), 1), emo_base, au_base};
    for (const k in b) if (typeof b[k] === 'number' && !Number.isFinite(b[k])) b[k] = null;
    setBaseline({...baselineHint, ...b});
    event('calibration', 'Baseline calibrated', 'info');
    c.resolve(b);
  }
  function cancelCalibration() { if (calib) { const c = calib; calib = null; c.reject(Object.assign(new Error('Calibration cancelled.'), {code: 'cancel'})); } }

  /* ---------- recording (1 sample per second) ---------- */
  const SAMPLE_COLS = ['timestamp', 'session_id', 'subject_id', 'hr_bpm', 'rr_rpm', 'rmssd_ms', 'blink_rate_min', 'perclos_pct', 'yawn_count', 'facial_tension', 'head_stability_pct', 'microexpr_min',
    'emotion_neutral_pct', 'emotion_happy_pct', 'emotion_sad_pct', 'emotion_angry_pct', 'emotion_fear_pct', 'emotion_surprise_pct', 'emotion_disgust_pct',
    'fatigue_level', 'stress_index', 'wellbeing_index', 'signal_quality', 'snr_db', 'rppg_method', 'face_detected', 'source'];
  function startRecording(meta) { rec = {meta, startedAt: new Date().toISOString(), t0: performance.now(), samples: [], events: []}; }
  function everySecond() {
    if (!rec) return;
    const o = O, ix = IDX, s = rec;
    const row = {
      timestamp: new Date().toISOString(), session_id: s.meta.session_id, subject_id: s.meta.subject_id,
      hr_bpm: rnd(o.hr, 1), rr_rpm: rnd(o.rr, 1), rmssd_ms: rnd(o.rmssd, 1), blink_rate_min: rnd(o.blink, 1), perclos_pct: rnd(o.perclos, 1), yawn_count: o.yawns,
      facial_tension: rnd(o.tension, 1), head_stability_pct: rnd(o.stab, 1), microexpr_min: o.microRate,
      ...Object.fromEntries(EMOTIONS.map(k => ['emotion_' + k + '_pct', o.face || mode === 'demo' ? rnd(EMO[k], 1) : null])),
      fatigue_level: ix.ready ? ix.level : null, stress_index: ix.ready ? rnd(ix.S, 1) : null, wellbeing_index: ix.ready ? rnd(ix.W, 1) : null,
      signal_quality: rnd(o.quality, 0), snr_db: rnd(o.snr, 1), rppg_method: o.alg || null, face_detected: o.face ? 1 : 0, source: mode
    };
    s.samples.push(row); if (s.samples.length > 4 * 3600) s.samples.shift();
    // an active recording counts as activity: keep the 30-minute idle lock from expiring mid-session (and losing the data)
    if (s.samples.length % 30 === 0) { try { const A = ASTRAVITA.auth; if (A.current() && !A.expired()) A.touch(); } catch { /* ignore */ } }
    hooks.onSample?.(row);
  }
  function stopRecording() { const r = rec; rec = null; if (r) r.endedAt = new Date().toISOString(); return r; }
  function event(type, detail, severity, data) {
    const ev = {timestamp: new Date().toISOString(), type, detail, severity, ...(data ? {data} : {})};
    if (rec) { rec.events.push(ev); if (rec.events.length > 3000) rec.events.shift(); }
    hooks.onEvent?.(ev);
  }

  /* ---------- pre-check (traffic lights) ---------- */
  function precheck() {
    const o = O;
    const cam = !running ? 'bad' : mode === 'demo' ? 'ok' : o.fps >= 15 ? 'ok' : o.fps >= 8 ? 'warn' : 'bad';
    const light = mode === 'demo' ? 'ok' : !fin(o.bright) ? 'warn' : o.bright < 35 ? 'bad' : o.bright < 60 || o.bright > 235 ? 'warn' : 'ok';
    let frame = 'warn';
    if (mode === 'demo') frame = 'ok';
    else if (lm) frame = !o.face ? 'bad' : (o.faceFrac < 0.18 || o.faceFrac > 0.75 || Math.abs((o.center ?? 0.5) - 0.5) > 0.2) ? 'warn' : 'ok';
    else if (mpStatus === 'error') frame = 'warn';
    const sig = fin(o.hr) ? (o.conf >= 50 ? 'ok' : 'warn') : B.t.length && (B.t[B.t.length - 1] - B.t[0]) > 14000 ? 'bad' : 'warn';
    return {cam, light, frame, sig};
  }
  function snapshot() {
    return {mode, running, model: mpStatus, delegate: mpDelegate, O: {...O}, IDX, EMO: {...EMO}, aus: AUSTATE.map(a => ({id: a.id, code: a.code, name: a.name, v: a.v, active: a.active})), pulse: B.pulse, resp: B.resp, precheck: precheck(), recording: !!rec, elapsed: rec ? (performance.now() - rec.t0) / 1000 : 0, calibrating: !!calib};
  }

  /* ---------- overlay ---------- */
  function sizeCanvas(cv) { const cw = cv.clientWidth, ch = cv.clientHeight, r = devicePixelRatio || 1; if (cv.width !== Math.round(cw * r) || cv.height !== Math.round(ch * r)) { cv.width = Math.round(cw * r); cv.height = Math.round(ch * r); } const c = cv.getContext('2d'); c.setTransform(r, 0, 0, r, 0, 0); c.clearRect(0, 0, cw, ch); return [c, cw, ch]; }
  function drawOverlay(L, boxes, vw, vh) {
    const ov = els.overlay; if (!ov) return;
    const [c, cw, ch] = sizeCanvas(ov);
    const sc = Math.max(cw / vw, ch / vh), ox = (cw - vw * sc) / 2, oy = (ch - vh * sc) / 2;
    const X = p => ox + p.x * vw * sc, Y = p => oy + p.y * vh * sc, AI = '#39A9DB';
    if (opts.rois || !L) for (const b of boxes) { c.strokeStyle = 'rgba(198,161,91,.95)'; c.lineWidth = 1.2; c.setLineDash([3, 3]); c.strokeRect(ox + b[0] * vw * sc, oy + b[1] * vh * sc, b[2] * vw * sc, b[3] * vh * sc); c.setLineDash([]); }
    if (!L || !opts.mesh) return;
    c.fillStyle = 'rgba(57,169,219,.6)';
    for (let i = 0; i < 468; i += 3) c.fillRect(X(L[i]) - 0.9, Y(L[i]) - 0.9, 1.8, 1.8);
    const path = (idx, close, alpha = 0.85, lw = 1.2, dash) => { c.globalAlpha = alpha; c.lineWidth = lw; c.setLineDash(dash || []); c.beginPath(); idx.forEach((i, j) => j ? c.lineTo(X(L[i]), Y(L[i])) : c.moveTo(X(L[i]), Y(L[i]))); if (close) c.closePath(); c.stroke(); c.setLineDash([]); c.globalAlpha = 1; };
    c.strokeStyle = AI;
    path(OVAL, true, 0.45, 1, [2, 3]); path(EYE_L, true); path(EYE_R, true); path(BROW_L, false, 0.75, 1.5); path(BROW_R, false, 0.75, 1.5); path(NOSE, false, 0.6, 1); path(LIPS, true, 0.75);
    if (L.length > 473) { c.fillStyle = AI; for (const i of [468, 473]) { c.beginPath(); c.arc(X(L[i]), Y(L[i]), 3, 0, 7); c.fill(); } }
  }

  /* ---------- demo script: 150 s nominal -> stress -> fatigue -> recovery ---------- */
  function demoProfile(t) {
    const c = t % 150, lerp = (a, b, x) => a + (b - a) * clamp(x, 0, 1);
    let hr = 68, rr = 14, blinkRate = 17, slow = 0, ten = 0.12, sway = 0.25, rsa = 0.05, mood = 'calm';
    if (c >= 45 && c < 85) { const x = (c - 45) / 10; hr = lerp(68, 96, x); rr = lerp(14, 20, x); blinkRate = 25; ten = lerp(0.12, 0.55, x); rsa = lerp(0.05, 0.02, x); mood = 'stress'; }
    else if (c >= 85 && c < 135) { const x = (c - 85) / 15; hr = lerp(96, 63, x); rr = lerp(20, 12, x); blinkRate = lerp(25, 14, x); slow = clamp((c - 88) / 10, 0, 1); ten = lerp(0.55, 0.18, x); sway = lerp(0.25, 0.9, x); rsa = lerp(0.02, 0.045, x); mood = 'fatigue'; }
    else if (c >= 135) { const x = (c - 135) / 15; hr = lerp(63, 68, x); rr = 14; blinkRate = 16; ten = 0.12; sway = lerp(0.9, 0.25, x); mood = 'recovery'; }
    return {c, hr, rr, blinkRate, slow, ten, sway, rsa, mood};
  }
  function demoPhase() { if (mode !== 'demo' || !rec && !running) return null; const t = (performance.now() - t0) / 1000; return demoProfile(t).mood; }
  function demoStep(now) {
    const D = demo, t = (now - t0) / 1000, fs = 30, R = D.rnd;
    B.frames.push(now); while (B.frames.length && now - B.frames[0] > 1000) B.frames.shift();
    const target = Math.floor(t * fs);
    if (D.k < target - 90) D.k = target - 90;
    let last = null;
    while (D.k <= target) {
      const tt = D.k / fs, P = demoProfile(tt);
      const inst = P.hr * (1 + P.rsa * Math.sin(D.rphase)) / 60;
      D.phase += 2 * Math.PI * inst / fs; D.rphase += 2 * Math.PI * (P.rr / 60) / fs;
      const p = Math.sin(D.phase) + 0.35 * Math.sin(2 * D.phase + 1.1);
      const illum = 1 + 0.004 * Math.sin(2 * Math.PI * 0.05 * tt) + 0.002 * Math.sin(2 * Math.PI * 0.8 * tt);
      const noise = () => (R() - 0.5) * 0.0012, amp = 0.0025;
      pushRGB(t0 + tt * 1000, 172 * illum * (1 + amp * 0.33 * p + noise()), 118 * illum * (1 + amp * 0.77 * p + noise()), 96 * illum * (1 + amp * 0.53 * p + noise()));
      if (tt >= D.nextBlink && D.blinkEnd < tt) { D.blinkDur = 0.12 + 0.7 * P.slow + R() * 0.05; D.blinkEnd = tt + D.blinkDur; D.blinkStart = tt; D.nextBlink = tt + Math.max(0.8, 60 / P.blinkRate * (0.6 + R() * 0.8)); }
      if (!D.sleepDone && P.c >= 112 && P.c < 113) { D.blinkStart = tt; D.blinkEnd = tt + 1.6; D.blinkDur = 1.6; D.sleepDone = true; }
      const cyc = Math.floor(tt / 150); if (cyc !== D.cycle) { D.cycle = cyc; D.sleepDone = false; D.yawnDone = false; }
      let closure = 0;
      if (tt <= D.blinkEnd) { const x = (tt - D.blinkStart) / D.blinkDur, rmp = D.blinkDur > 1 ? 0.08 : D.blinkDur > 0.4 ? 0.15 : 0.3; closure = clamp(x < rmp ? x / rmp : x > 1 - rmp ? (1 - x) / rmp : 1, 0, 1); }
      const pStress = P.mood === 'stress' ? 0.004 : 0.0015;
      if (R() < pStress) {
        const pick = P.mood === 'stress' ? ['browDown', 'mouthPress', 'noseSneer', 'mouthFrown', 'mouthStretch'] : P.mood === 'recovery' ? ['mouthSmile', 'mouthSmile', 'browInnerUp'] : ['mouthSmile', 'browInnerUp', 'browDown'];
        D.micro.push({k: pick[R() * pick.length | 0], t0: tt, d: 0.15 + R() * 0.3, a: 0.45 + R() * 0.35});
      }
      D.micro = D.micro.filter(m => tt < m.t0 + m.d + 0.05);
      const yawn = !D.yawnDone && P.c >= 100 && P.c < 103.5 ? Math.sin(Math.PI * (P.c - 100) / 3.5) * 0.9 : 0;
      if (P.c >= 103.5 && P.c < 104 && !D.yawnDone) D.yawnDone = true;
      last = {tt, P, closure, yawn}; D.k++;
    }
    if (!last) return;
    const {tt, P, closure, yawn} = last;
    const micro = k => D.micro.filter(m => m.k === k).reduce((s, m) => s + m.a * Math.sin(Math.PI * clamp((tt - m.t0) / m.d, 0, 1)), 0);
    const tb = P.ten, sad = P.mood === 'fatigue' ? 0.18 : 0, smile = P.mood === 'recovery' ? 0.32 : P.mood === 'calm' ? 0.1 : 0.02;
    const bs = {
      eyeBlinkLeft: closure, eyeBlinkRight: closure,
      browDownLeft: clamp(tb * 0.5 + micro('browDown'), 0, 1), browDownRight: clamp(tb * 0.5 + micro('browDown'), 0, 1),
      eyeSquintLeft: tb * 0.4, eyeSquintRight: tb * 0.4,
      mouthPressLeft: clamp(tb * 0.45 + micro('mouthPress'), 0, 1), mouthPressRight: clamp(tb * 0.45 + micro('mouthPress'), 0, 1),
      noseSneerLeft: micro('noseSneer'), noseSneerRight: micro('noseSneer') * 0.9,
      mouthFrownLeft: clamp(sad + micro('mouthFrown'), 0, 1), mouthFrownRight: clamp(sad + micro('mouthFrown'), 0, 1),
      mouthSmileLeft: smile + micro('mouthSmile'), mouthSmileRight: smile * 0.95 + micro('mouthSmile') * 0.95,
      cheekSquintLeft: (smile + micro('mouthSmile')) * 0.5, cheekSquintRight: (smile + micro('mouthSmile')) * 0.5,
      browInnerUp: clamp(sad * 0.8 + micro('browInnerUp'), 0, 1), browOuterUpLeft: micro('browInnerUp') * 0.6, browOuterUpRight: micro('browInnerUp') * 0.6,
      mouthStretchLeft: micro('mouthStretch'), mouthStretchRight: micro('mouthStretch'), eyeWideLeft: P.mood === 'stress' ? 0.12 : 0.02, eyeWideRight: P.mood === 'stress' ? 0.12 : 0.02,
      jawOpen: 0.04 + yawn, mouthDimpleLeft: 0, mouthDimpleRight: 0, mouthRollLower: 0, mouthRollUpper: 0, noseSneer: 0, mouthUpperUpLeft: micro('noseSneer') * 0.3, mouthUpperUpRight: micro('noseSneer') * 0.3
    };
    const resp = Math.sin(D.rphase), sway = P.sway;
    const pose = [2.5 * Math.sin(tt / 3.1) * sway + (R() - 0.5) * sway, 1.5 * Math.sin(tt / 4.3) * sway + (P.slow > 0.5 ? 4 * Math.max(0, Math.sin(tt / 2.2)) : 0), 0.8 * Math.sin(tt / 5)];
    const f = {bs, has: true, closure, mar: 0.08 + yawn * 0.9, pose, nx: 2.4 + 0.006 * sway * Math.sin(tt * 1.7) + (R() - 0.5) * 0.002 * sway, ny: 1.95 + 0.0035 * resp + 0.004 * sway * Math.sin(tt * 0.4), faceFrac: 0.34, center: 0.5};
    B.det.push([now, 1]); while (B.det.length && now - B.det[0][0] > 3000) B.det.shift();
    ingest(now, f);
    drawDemoFace(f);
  }
  function drawDemoFace(f) {
    const ov = els.overlay; if (!ov) return;
    const [c, cw, ch] = sizeCanvas(ov);
    const AI = '#39A9DB', cx = cw / 2 + f.pose[0] * 2, cy = ch / 2 + f.pose[1] * 1.5, s = ch / 450;
    c.save(); c.translate(cx, cy); c.rotate(f.pose[2] * Math.PI / 180); c.scale(s, s);
    c.strokeStyle = AI; c.fillStyle = AI;
    c.globalAlpha = 0.8; c.setLineDash([4, 4]); c.strokeRect(-140, -170, 280, 340); c.setLineDash([]);
    c.lineWidth = 2; [[-140, -170, 1, 1], [140, -170, -1, 1], [-140, 170, 1, -1], [140, 170, -1, -1]].forEach(([x, y, sx, sy]) => { c.beginPath(); c.moveTo(x, y + 20 * sy); c.lineTo(x, y); c.lineTo(x + 20 * sx, y); c.stroke(); });
    c.lineWidth = 1; c.globalAlpha = 0.45; c.setLineDash([2, 3]); c.beginPath(); c.ellipse(0, 0, 110, 145, 0, 0, 7); c.stroke(); c.setLineDash([]);
    if (opts.mesh) {
      c.globalAlpha = 0.85; c.lineWidth = 1.2;
      const eyeH = 12 * (1 - f.closure * 0.92);
      for (const ex of [-50, 50]) { c.beginPath(); c.ellipse(ex, -30, 28, Math.max(1, eyeH), 0, 0, 7); c.stroke(); if (f.closure < 0.6) { c.beginPath(); c.arc(ex, -30, 4, 0, 7); c.fill(); } }
      const bd = (f.bs.browDownLeft || 0) * 10, bu = (f.bs.browInnerUp || 0) * 10;
      c.lineWidth = 1.5; c.beginPath(); c.moveTo(-80, -50 + bd - bu); c.quadraticCurveTo(-50, -62 + bd - bu, -20, -48 + bd * 1.5 - bu); c.moveTo(20, -48 + bd * 1.5 - bu); c.quadraticCurveTo(50, -62 + bd - bu, 80, -50 + bd - bu); c.stroke();
      c.lineWidth = 1; c.globalAlpha = 0.6; c.beginPath(); c.moveTo(0, -45); c.lineTo(0, 25); c.lineTo(-15, 40); c.lineTo(15, 40); c.lineTo(0, 25); c.stroke();
      const sm = (f.bs.mouthSmileLeft || 0) * 14, jo = (f.bs.jawOpen || 0) * 40, fr = (f.bs.mouthFrownLeft || 0) * 10;
      c.globalAlpha = 0.8; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-45, 75 - sm + fr); c.quadraticCurveTo(0, 65 + sm * 0.3, 45, 75 - sm + fr); c.quadraticCurveTo(0, 100 + jo + sm * 0.5, -45, 75 - sm + fr); c.closePath(); c.stroke();
      c.globalAlpha = 0.7;
      for (let i = 0; i < 70; i++) { const a = i * 2.39996, rr = 135 * Math.sqrt((i + 0.5) / 70); c.fillRect(Math.cos(a) * rr * 0.8 - 1, Math.sin(a) * rr - 1, 2, 2); }
    }
    if (opts.rois) { c.globalAlpha = 0.9; c.strokeStyle = '#C6A15B'; c.setLineDash([3, 3]); c.strokeRect(-55, -120, 110, 50); c.strokeRect(-95, 5, 60, 45); c.strokeRect(35, 5, 60, 45); c.setLineDash([]); }
    c.restore();
  }

  function setOption(k, v) { opts[k] = v; }
  return {attach, loadModel, startCamera, startFile, startDemo, stop, startCalibration, cancelCalibration, setBaseline, startRecording, stopRecording, snapshot, setOption, demoPhase,
    get mode() { return mode; }, get running() { return running; }, get modelStatus() { return mpStatus; },
    EMOTIONS, EMO_LABEL, EMOTION_MAP, AUS, SAMPLE_COLS, T};
})();
