/* Visible-cell scenarios independent of the lighting implementation. */
function input({cols, rows, seed, mode}) {
    const view = {x: -3, y: -2, cols, rows}, cells = [];
    let state = seed;
    for (let y = view.y; y < view.y + rows; y++) for (let x = view.x; x < view.x + cols; x++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        const noise = state >>> 24, wall = mode !== 'open' && noise % 7 === 0;
        const cell = {x, y, visible: mode !== 'fog' || noise % 9 !== 0,
            solid: wall, transmission: wall ? (noise % 3 === 0 ? .58 : noise % 3 === 1 ? .82 : 0) : 1,
            occupied: noise % 17 === 0, surface: noise % 13 === 0 ? 'water' : null};
        if ((x + 3) % 5 === 2 && (y + 2) % 5 === 2) cell.light = {
            radius: 5.8, colour: [255, 128 + noise % 64, 72], strength: .19, elevation: .75};
        cells.push(cell);
    }
    return {view, cells};
}
function record(field, view) {
    const queries = [];
    for (let y = view.y - 1; y <= view.y + view.rows; y++) {
        for (let x = view.x - 1; x <= view.x + view.cols; x++) {
            queries.push([x, y, field.known(x, y), field.at(x, y)]);
        }
    }
    return JSON.stringify({cells: field.cells, floors: field.floors, lights: field.lights, queries});
}
module.exports = {input, record};
