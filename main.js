import { Game } from "./core/Game.js";
import { playSfx } from "./audio/Sfx.js";

// 🔓 첫 입력으로 오디오 컨텍스트 언락
document.addEventListener("mousedown", () => {
   // playSfx("match");   // 아무 짧은 효과음 하나
}, { once: true });

const game = new Game();
window.game = game;

// 최초 로드 시 GameConfig 기반 값으로 UI 덮어쓰기
if (game && typeof game.syncStats === "function") {
    game.syncStats();   // 샵 미리보기·시간·포인트 동기화
    game.updateHUD();   // score/stage/target 동기화
}