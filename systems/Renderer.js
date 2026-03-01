//import { SIZE, COLORS } from "../data/Config.js";
import { SIZE, COLORS, ICONS } from "../data/Config.js";
export class Renderer {
  constructor(boardEl) {
    this.boardEl = boardEl;
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

                this.boardEl.appendChild(d);
            }
        }
    }


    updateCellDiv(div, cell) {
        div.style.opacity = "1";
        div.classList.remove("bomb", "cross", "explode");

        let content = div.firstElementChild;
        if (!content) {
            content = document.createElement("div");
            div.appendChild(content);
        }

        if (!cell) {
            div.style.visibility = "hidden";
            content.className = "";
            content.textContent = "";
            return;
        }

        div.style.visibility = "visible";

        if (cell.special === "bomb") {
            div.style.setProperty("--block-color", "#000");
            div.classList.add("bomb");
            content.className = "icon";
            content.textContent = "💣";
            return;
        }

        if (cell.special === "cross") {
            div.style.setProperty("--block-color", "#000");
            div.classList.add("cross");
            content.className = "icon";
            content.textContent = "➕";
            return;
        }

        div.style.background = COLORS[cell.color];
        content.className = "block-symbol";
        content.textContent = ICONS[cell.color];
    }

  render(board) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const idx = r * SIZE + c;
        this.updateCellDiv(this.boardEl.children[idx], board[r][c]);
      }
    }
  }

    playExplode(r, c) {
        const div = this.boardEl.children[r * SIZE + c];
        if (!div) return;

        // 랜덤 오프셋
        const ox = (Math.random() * 2 - 1) * 4; // -10 ~ +10
        const oy = (Math.random() * 2 - 1) * 4;

        div.style.setProperty("--ox", `${ox}px`);
        div.style.setProperty("--oy", `${oy}px`);

        // selected 상태면 제거
        div.classList.remove("selected");

        // 폭발 애니메이션
        div.classList.add("explode");
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

        // CSS 변수에서 유지시간 읽기
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
