export const SIZE = 8;
export const CELL = 50;
export const GAP = 4;
export const STEP = CELL + GAP;

export const COLORS = [
    "#e0565b",
    "#e0b437",
    "#6fb33f",
    "#2f7bbd",
    "#5b3f8f",
    "#e26a8d"
];

const asset = (name) => new URL(`../assets/blocks/${name}`, import.meta.url).href;

export const BLOCK_IMAGES = [
    asset("red.png"),
    asset("yellow.png"),
    asset("green.png"),
    asset("blue.png"),
    asset("purple.png"),
    asset("pink.png")
];

export const SPECIAL_IMAGES = {
    bomb: asset("bomb.png"),
    cross: asset("cross.png")
};

