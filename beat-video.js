const CLIPS = [
  "./public/videos/clip-01.mp4",
  "./public/videos/clip-02.mp4",
  "./public/videos/clip-03.mp4",
];

const BPM = 120;
const BEAT_SECONDS = 60 / BPM;

const CUT_PROBABILITY = 0.6;
const SEEK_PROBABILITY = 0.4;

const videoA = document.getElementById("videoA");
const videoB = document.getElementById("videoB");

let front = videoA;
let back = videoB;

let currentClipIndex = 0;
let beatStartMs = 0;
let lastBeat = -1;
let started = false;

function swapLayers() {
  const oldFront = front;
  front = back;
  back = oldFront;
}

function setActiveVideo(el) {
  videoA.classList.toggle("active", el === videoA);
  videoB.classList.toggle("active", el === videoB);
}

function randomIndexExcluding(current, length) {
  if (length <= 1) return current;
  let next = current;
  while (next === current) {
    next = Math.floor(Math.random() * length);
  }
  return next;
}

function safeRandomSeekTime(video) {
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0.25) return 0;

  const maxTime = Math.max(0, duration - 0.2);
  return Math.random() * maxTime;
}

async function loadInto(video, src, time = 0) {
  return new Promise((resolve, reject) => {
    const onLoaded = async () => {
      try {
        video.currentTime = time;
      } catch {
        // ignore early seek race
      }

      try {
        await video.play();
        cleanup();
        resolve();
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    const onError = () => {
      cleanup();
      reject(new Error(`Failed to load video: ${src}`));
    };

    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
    };

    video.pause();
    video.src = src;
    video.load();
    video.addEventListener("loadedmetadata", onLoaded, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

async function cutToClip(nextIndex, startTime = 0) {
  const nextSrc = CLIPS[nextIndex];

  await loadInto(back, nextSrc, startTime);

  setActiveVideo(back);
  back.muted = true;
  front.pause();

  currentClipIndex = nextIndex;
  swapLayers();
}

function seekWithinCurrent() {
  if (!Number.isFinite(front.duration) || front.duration <= 0) return;
  front.currentTime = safeRandomSeekTime(front);
}

async function onBeat() {
  const r = Math.random();

  if (r < CUT_PROBABILITY) {
    const nextIndex = randomIndexExcluding(currentClipIndex, CLIPS.length);
    await cutToClip(nextIndex, 0);
    return;
  }

  if (r < CUT_PROBABILITY + SEEK_PROBABILITY) {
    seekWithinCurrent();
  }
}

function tick(nowMs) {
  if (!started) return;

  const elapsedSec = (nowMs - beatStartMs) / 1000;
  const beat = Math.floor(elapsedSec / BEAT_SECONDS);

  if (beat !== lastBeat) {
    lastBeat = beat;
    onBeat().catch((err) => {
      console.error(err);
    });
  }

  requestAnimationFrame(tick);
}

async function start() {
  if (started) return;
  started = true;

  await loadInto(front, CLIPS[currentClipIndex], 0);
  setActiveVideo(front);

  const preloadIndex = randomIndexExcluding(currentClipIndex, CLIPS.length);
  try {
    await loadInto(back, CLIPS[preloadIndex], 0);
    back.pause();
  } catch (err) {
    console.warn("Preload failed:", err);
  }

  beatStartMs = performance.now();
  lastBeat = -1;
  requestAnimationFrame(tick);
}

start().catch((err) => {
  console.warn("Autoplay start failed, waiting for interaction:", err);

  const retry = () => {
    start().catch(console.error);
    window.removeEventListener("pointerdown", retry);
    window.removeEventListener("keydown", retry);
    window.removeEventListener("touchstart", retry);
  };

  window.addEventListener("pointerdown", retry, { once: true });
  window.addEventListener("keydown", retry, { once: true });
  window.addEventListener("touchstart", retry, { once: true });
});