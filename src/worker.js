self.importScripts('jimp.min.js');

function pickSubdivision(bright, steps, exponential){
    let idx = Math.floor((1 - bright) * steps);
    idx = Math.max(0, Math.min(steps - 1, idx));
    return exponential ? (1 << idx) : (idx + 1);
}

async function jimpResizeToCanvas(jimpImg, w, h) {
    const resized = jimpImg.clone().resize(w, h, Jimp.RESIZE_LANCZOS);
    const { data, width, height } = resized.bitmap;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const imgData = new ImageData(
    new Uint8ClampedArray(data),
    width,
    height
    );
    ctx.putImageData(imgData, 0, 0);
    return canvas;
}

self.onmessage = async e => {
    self.postMessage({ phase: "Initializing" });

    const { targetBuffer, tileBuffers, params } = e.data;
    const {
    gridW, gridH, cellW, cellH,
    steps, expo, minTile, border, invert
    } = params;

    /* ---------------- Load images ---------------- */
    const targetJimp = await Jimp.read(targetBuffer);
    const tileJimps  = await Promise.all(tileBuffers.map(b => Jimp.read(b)));

    /* ---------------- Output canvas ---------------- */
    const out = new OffscreenCanvas(gridW * cellW, gridH * cellH);
    const outCtx = out.getContext('2d');

    /* ---------------- Target brightness map ---------------- */
    const tSmall = new OffscreenCanvas(gridW, gridH);
    const tCtx = tSmall.getContext('2d');

    const tResized = await jimpResizeToCanvas(targetJimp, gridW, gridH);
    tCtx.drawImage(tResized, 0, 0);

    const tData = tCtx.getImageData(0, 0, gridW, gridH).data;

    /* ---------------- Tile selection ---------------- */
    const resizeCache = new Map();
    let unused = tileJimps.slice().sort(() => Math.random() - 0.5);
    const getTile = () =>
    unused.length ? unused.pop() : tileJimps[Math.random() * tileJimps.length | 0];

    const HALF = Math.floor(border / 2);

    self.postMessage({ phase: "Running" });

    /* ---------------- Main mosaic loop ---------------- */
    for (let gy = 0; gy < gridH; gy++) {
    let baseY = gy * cellH + HALF - (gy === 0 ? HALF : 0);

    for (let gx = 0; gx < gridW; gx++) {
        let baseX = gx * cellW + HALF - (gx === 0 ? HALF : 0);

        let bright = tData[(gy * gridW + gx) * 4] / 255;
        if (invert) bright = 1 - bright;

        const subdiv = pickSubdivision(bright, steps, expo);

        const usableW = cellW - border;
        const usableH = cellH - border;
        const drawableW = usableW - (subdiv - 1) * border;
        const drawableH = usableH - (subdiv - 1) * border;
        if (drawableW <= 0 || drawableH <= 0) continue;

        const baseW = Math.floor(drawableW / subdiv);
        const baseH = Math.floor(drawableH / subdiv);
        if (baseW < minTile || baseH < minTile) continue;

        const extraW = drawableW - baseW * subdiv;
        const extraH = drawableH - baseH * subdiv;

        const widths  = Array.from({ length: subdiv }, (_, i) => baseW + (i < extraW));
        const heights = Array.from({ length: subdiv }, (_, i) => baseH + (i < extraH));

        let y = baseY;
        for (let sy = 0; sy < subdiv; sy++) {
        let x = baseX;
        for (let sx = 0; sx < subdiv; sx++) {
            const w = widths[sx];
            const h = heights[sy];

            const tile = getTile();
            const key = tile._id + "|" + w + "x" + h;

            if (!resizeCache.has(key)) {
            resizeCache.set(key, await jimpResizeToCanvas(tile, w, h));
            }

            outCtx.drawImage(resizeCache.get(key), x, y);
            x += w + border;
        }
        y += heights[sy] + border;
        }
    }

    self.postMessage({ progress: (gy + 1) / gridH });
    }

    self.postMessage({ phase: "Finishing" });

    const blob = await out.convertToBlob({ type: "image/png" });
    const buffer = await blob.arrayBuffer();

    self.postMessage(
    { done: true, buffer },
    [buffer] // ✅ transfer ownership
    );
};