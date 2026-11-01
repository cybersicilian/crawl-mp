/* Serialize into a browser; operations return a small observable checksum. */
module.exports = function pairedTiming(operations, warmup = 20, samples = 16, batch = 20) {
    const values = operations.map(() => []);
    let checksum = 0;
    function run(index, count) {
        const start = performance.now();
        for (let n = 0; n < count; n++) checksum += operations[index](n);
        return (performance.now() - start) / count;
    }
    operations.forEach((_operation, index) => run(index, warmup));
    for (let round = 0; round < samples; round++) {
        const order = operations.map((_operation, index) => index);
        if (round % 2) order.reverse();
        for (const index of order) values[index].push(run(index, batch));
    }
    return {checksum, results: values.map(samplesMs => {
        const sorted = samplesMs.slice().sort((a, b) => a - b);
        return {medianMs: sorted[Math.floor(sorted.length / 2)],
            p90Ms: sorted[Math.floor(sorted.length * .9)], samplesMs};
    })};
};
