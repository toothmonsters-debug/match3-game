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

// 🔊 상태
let masterVolume = 1.0;
let bgmVolume = 0.7;
let muted = false;

// 내부 계산용
function applyVolumes(fadeMultiplier = 1) {
    Object.entries(SFX).forEach(([key, audio]) => {

        if (key === "bgm") {
            if (!audio) return;

            const finalVol = muted
                ? 0
                : masterVolume * bgmVolume * fadeMultiplier;

            audio.volume = Math.max(0, Math.min(1, finalVol));
        } else {
            const finalVol = muted
                ? 0
                : masterVolume;

            audio.volume = Math.max(0, Math.min(1, finalVol));
        }
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

    function fadeStep() {
        if (!currentBgm) return;

        const elapsed = performance.now() - startTime;
        const ratio = Math.min(elapsed / fadeDuration, 1);

        // 🔥 fadeMultiplier만 줄인다
        applyVolumes(1 - ratio);

        if (ratio < 1) {
            requestAnimationFrame(fadeStep);
        } else {
            currentBgm.pause();
            currentBgm.currentTime = 0;
            currentBgm = null;
            applyVolumes(1);
        }
    }

    requestAnimationFrame(fadeStep);
}

// ==========================
// 🎚 외부 제어 API
// ==========================
export function setMasterVolume(v) {
    masterVolume = Math.max(0, Math.min(1, v));
    applyVolumes();
}

export function setBgmVolume(v) {
    bgmVolume = Math.max(0, Math.min(1, v));
    applyVolumes();
}

export function toggleMute() {
    muted = !muted;
    applyVolumes();
    return muted;
}