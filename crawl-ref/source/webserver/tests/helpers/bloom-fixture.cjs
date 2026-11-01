/* Deterministic source pixels independent of the bloom implementation. */
module.exports = function pixels({width, height, seed, mode}) {
    const data = new Uint8ClampedArray(width * height * 4);
    let state = seed;
    for (let n = 0; n < data.length; n++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        data[n] = state >>> 24;
    }
    if (mode === 'transparent') {
        for (let n = 3; n < data.length; n += 4) data[n] = 0;
    } else if (mode === 'impulse') {
        data.fill(0);
        const index = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
        data.set([255, 172, 105, 127], index);
    } else if (mode === 'threshold') {
        for (let n = 0; n < data.length; n += 4) {
            data[n] = 104 + (n / 4 % 3); data[n + 1] = 40; data[n + 2] = 12; data[n + 3] = 255;
        }
    }
    return data;
};
