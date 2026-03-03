const SFX = {
    swap: new Audio("swap.wav"),
    match: new Audio("match.wav"),
    combo: new Audio("combo.wav"),
    bomb: new Audio("bomb.wav"),
    gameover: new Audio("gameover.wav"),
    stage: new Audio("stage.wav"),
    tick: new Audio("tick.wav"),
    bgm: new Audio("bgm.mp3"),
    coin: new Audio("coin.wav"),
};

let currentBgm = null;
let bgmVolumeMultiplier = 1;
let _bgmFadeRaf = null;

// 🔊 상태
let masterVolume = 1.0;
let muted = false;

// 내부 계산용
function applyVolumes(fadeMultiplier = 1) {
    Object.entries(SFX).forEach(([key, audio]) => {
        if (!audio) return;

        const finalVol = muted
            ? 0
            : key === "bgm"
                ? masterVolume * bgmVolumeMultiplier * fadeMultiplier
                : masterVolume;

        audio.volume = Math.max(0, Math.min(1, finalVol));
    });
}

// ==========================
// 🔊 효과음
// ==========================
export function playSfx(name) {
    const a = SFX[name];
    if (!a) return;

    applyVolumes();
    a.currentTime = 0;
    a.play().catch(() => { });
}

// ==========================
// 🎵 BGM
// ==========================
export function playBgm() {
    const a = SFX.bgm;
    if (!a) return;

    currentBgm = a;
    bgmVolumeMultiplier = 1;
    a.loop = true;
    a.currentTime = 0;

    applyVolumes();
    a.play().catch(() => { });
}

export function stopBgm(fade = true) {
    if (!currentBgm) return;

    if (!fade) {
        currentBgm.pause();
        currentBgm.currentTime = 0;
        currentBgm = null;
        return;
    }

    const fadeDuration = 1000;
    const startTime = performance.now();

    if (_bgmFadeRaf) {
        cancelAnimationFrame(_bgmFadeRaf);
        _bgmFadeRaf = null;
    }

    function fadeStep() {
        if (!currentBgm) return;

        const elapsed = performance.now() - startTime;
        const ratio = Math.min(elapsed / fadeDuration, 1);

        applyVolumes(1 - ratio);

        if (ratio < 1) {
            _bgmFadeRaf = requestAnimationFrame(fadeStep);
        } else {
            currentBgm.pause();
            currentBgm.currentTime = 0;
            currentBgm = null;
            bgmVolumeMultiplier = 1;
            applyVolumes(1);
        }
    }

    _bgmFadeRaf = requestAnimationFrame(fadeStep);
}

export function fadeBgmTo(multiplier = 1, durationMs = 300) {
    const target = Math.max(0, Math.min(1, Number(multiplier) || 1));
    const duration = Math.max(1, Number(durationMs) || 1);

    if (_bgmFadeRaf) {
        cancelAnimationFrame(_bgmFadeRaf);
        _bgmFadeRaf = null;
    }

    const from = bgmVolumeMultiplier;
    const start = performance.now();

    const step = () => {
        const t = Math.min((performance.now() - start) / duration, 1);
        bgmVolumeMultiplier = from + (target - from) * t;
        applyVolumes(1);
        if (t < 1) {
            _bgmFadeRaf = requestAnimationFrame(step);
        } else {
            _bgmFadeRaf = null;
        }
    };

    _bgmFadeRaf = requestAnimationFrame(step);
}

// ==========================
// 🎚 외부 제어 API
// ==========================
export function setMasterVolume(v) {
    masterVolume = Math.max(0, Math.min(1, v));
    applyVolumes();
}

export function toggleMute() {
    muted = !muted;
    applyVolumes();
    return muted;
}