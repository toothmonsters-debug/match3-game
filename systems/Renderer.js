import * as Config from "../data/Config.js";

const SIZE = Config.SIZE;
const COLORS = Config.COLORS || [];
const BLOCK_IMAGES = Config.BLOCK_IMAGES || [];
const SPECIAL_IMAGES = Config.SPECIAL_IMAGES || {};
const ICONS = Config.ICONS || [];

export class Renderer {
    constructor(boardEl) {
        this.boardEl = boardEl;
        this.effectLayer = document.getElementById("effectLayer");
        this._maxFxNodes = 60;
        this._preloadImages();
    }

    _preloadImages() {
        const srcs = [
            ...BLOCK_IMAGES,
            SPECIAL_IMAGES.bomb,
            SPECIAL_IMAGES.cross
        ].filter(Boolean);

        srcs.forEach((src) => {
            const img = new Image();
            img.src = src;
        });
    }

    init(onCellMouseDown) {
        this.boardEl.innerHTML = "";

        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                const d = document.createElement("div");
                d.className = "cell";

                d.addEventListener("pointerdown", (e) => {
                    if (e.cancelable) e.preventDefault();
                    onCellMouseDown(e, r, c);
                }, { passive: false });

                d.addEventListener("dragstart", (e) => e.preventDefault());

                const img = document.createElement("img");
                img.className = "block-image";
                img.alt = "";
                img.draggable = false;
                d.appendChild(img);

                this.boardEl.appendChild(d);
            }
        }
    }

    updateCellDiv(div, cell) {
        div.style.opacity = "1";
        div.classList.remove("bomb", "cross", "explode");

        const img = div.firstElementChild;

        if (!cell) {
            div.style.visibility = "hidden";
            if (img) img.removeAttribute("src");
            return;
        }

        div.style.visibility = "visible";
        div.style.background = COLORS[cell.color] || "transparent";

        if (cell.special === "bomb") {
            div.classList.add("bomb");
            if (img) img.src = SPECIAL_IMAGES.bomb || "";
            return;
        }

        if (cell.special === "cross") {
            div.classList.add("cross");
            if (img) img.src = SPECIAL_IMAGES.cross || "";
            return;
        }

        if (img) {
            const src = BLOCK_IMAGES[cell.color];
            if (src) {
                img.src = src;
            } else {
                img.removeAttribute("src");
                div.textContent = ICONS[cell.color] || "";
            }
        }
    }

    render(board) {
        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                const idx = r * SIZE + c;
                this.updateCellDiv(this.boardEl.children[idx], board[r][c]);
            }
        }
    }

    playExplode(r, c, level = 0, { boost = 1 } = {}) {
        const div = this.boardEl.children[r * SIZE + c];
        if (!div) return;

        const ox = (Math.random() * 2 - 1) * 4;
        const oy = (Math.random() * 2 - 1) * 4;

        div.style.setProperty("--ox", `${ox}px`);
        div.style.setProperty("--oy", `${oy}px`);
        div.classList.remove("selected");
        div.classList.remove("hit-bump");
        div.classList.add("hit-bump");
        setTimeout(() => {
            div.classList.add("explode");
        }, 70);
        setTimeout(() => div.classList.remove("hit-bump"), 180);

        this._spawnHitEffects(div, level, boost);
    }

    _spawnHitEffects(cellDiv, level = 0, boost = 1) {
        const host = this.effectLayer || this.boardEl;
        if (!host || !cellDiv) return;

        const fxCount = host.querySelectorAll(".fx-shard, .fx-wave, .fx-glow").length;
        if (fxCount >= this._maxFxNodes) return;

        const lv = Math.max(0, Number(level) || 0);
        const b = Math.max(1, Number(boost) || 1);

        const hostRect = host.getBoundingClientRect();
        const cellRect = cellDiv.getBoundingClientRect();
        const centerX = cellRect.left + cellRect.width / 2 - hostRect.left;
        const centerY = cellRect.top + cellRect.height / 2 - hostRect.top;

        const glow = document.createElement("div");
        glow.className = "fx-glow";
        glow.style.left = `${centerX}px`;
        glow.style.top = `${centerY}px`;
        glow.style.transform = `translate(-50%, -50%) scale(${(1 * b).toFixed(2)})`;
        host.appendChild(glow);
        setTimeout(() => glow.remove(), Math.round(190 * b));

        const wave = document.createElement("div");
        wave.className = "fx-wave";
        wave.style.left = `${centerX}px`;
        wave.style.top = `${centerY}px`;
        wave.style.transform = `translate(-50%, -50%) scale(${(1 * b).toFixed(2)})`;
        host.appendChild(wave);
        setTimeout(() => wave.remove(), Math.round(260 * b));

        const shardCount = Math.min(12, Math.max(1, Math.round((3 + Math.floor(lv / 2)) * b)));
        for (let i = 0; i < shardCount; i++) {
            const shard = document.createElement("div");
            shard.className = "fx-shard";
            shard.style.left = `${centerX}px`;
            shard.style.top = `${centerY}px`;
            shard.style.transform = `translate(-50%, -50%) scale(${(0.9 + (b - 1) * 0.6).toFixed(2)})`;

            const angle = Math.random() * Math.PI * 2;
            const dist = (16 + Math.random() * (20 + lv * 2)) * (0.9 + (b - 1) * 0.8);
            const dx = Math.cos(angle) * dist;
            const dy = Math.sin(angle) * dist;

            shard.style.setProperty("--dx", `${dx}px`);
            shard.style.setProperty("--dy", `${dy}px`);
            host.appendChild(shard);
            setTimeout(() => shard.remove(), Math.round(320 * b));
        }
    }

    showFloat(r, c, text) {
        const d = document.createElement("div");
        d.className = "floatText";
        d.textContent = text;
        d.style.left = (c * 50 + 10) + "px";
        d.style.top = (r * 50 + 10) + "px";

        this.boardEl.appendChild(d);

        requestAnimationFrame(() => {
            d.style.transform = "translateY(-30px)";
            d.style.opacity = "0";
        });

        setTimeout(() => d.remove(), 800);
    }

    showBigPopup(text) {
        const log = document.getElementById("comboLog");
        if (!log) return;

        log.textContent = text;
        log.style.opacity = "1";
        log.style.transform = "translateY(0)";

        const style = getComputedStyle(document.documentElement);
        const visibleMsStr = style.getPropertyValue("--combo-visible-ms").trim();

        const visibleMs = visibleMsStr.endsWith("ms")
            ? parseFloat(visibleMsStr)
            : parseFloat(visibleMsStr) * 1000;

        clearTimeout(this._comboHideTimer);
        this._comboHideTimer = setTimeout(() => {
            log.style.opacity = "0";
            log.style.transform = "translateY(-6px)";
        }, visibleMs);
    }
}
