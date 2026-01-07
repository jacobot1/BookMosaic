document.addEventListener('DOMContentLoaded', () => {

    const $ = id => document.getElementById(id);

    // ----------------- helpers -----------------
    function parseGrid(s) {
    const [w,h] = s.toLowerCase().split("x");
    return [w==="auto"?null:parseInt(w), h==="auto"?null:parseInt(h)];
    }
    function pickSubdivision(bright, steps, exponential){
    let idx = Math.floor((1 - bright) * steps);
    idx = Math.max(0, Math.min(steps - 1, idx));
    return exponential ? (1 << idx) : (idx + 1);
    }
    async function fileToArrayBuffer(file){
    return new Promise(res=>{
        const reader = new FileReader();
        reader.onload = e=>res(e.target.result);
        reader.readAsArrayBuffer(file);
    });
    }
    async function getImageSize(file){
    const bitmap = await createImageBitmap(file);
    const w = bitmap.width;
    const h = bitmap.height;
    bitmap.close();
    return {w, h};
    }

    // ----------------- Main -----------------
    $("run").onclick = async ()=>{
        const targetFile = $("target").files[0];
        const tileFiles = [...$("tiles").files];
        if(!targetFile || tileFiles.length===0) return alert("Select target and tile images.");

        $("download").disabled = true;
        $("progress").value = 0;
        $("status").textContent = "Initializing";

        const [gridW0,gridH0] = parseGrid($("grid").value);
        const cellH = +$("cellH").value;
        const steps = +$("steps").value;
        const minTile = +$("minTile").value;
        const border = +$("border").value;
        const expo = $("expo").checked;
        const invert = $("invert").checked;

        const targetSize = await getImageSize(targetFile);
        const tileSize   = await getImageSize(tileFiles[0]);

        const tAspect = targetSize.w / targetSize.h;
        const iAspect = tileSize.w / tileSize.h;

        let gridW=gridW0, gridH=gridH0;
        if(gridW==null && gridH==null) return alert("At least one grid dimension must be specified");
        if(gridW==null) gridW = Math.round(gridH * (tAspect / iAspect));
        if(gridH==null) gridH = Math.round(gridW * (iAspect / tAspect));

        const cellW = Math.floor(cellH * iAspect);
        const outW = gridW * cellW;
        const outH = gridH * cellH;

        if(!confirm(`Mosaic dimensions ${outW} x ${outH} px. Continue?`)) return;

        const worker = new Worker("./worker.js");
        worker.onmessage = e=>{
            if(e.data.phase){
            $("status").textContent = e.data.phase;
            }

            if(e.data.progress !== undefined){
            $("progress").value = e.data.progress;
            }

            if(e.data.done){
            const blob = new Blob([e.data.buffer], { type: "image/png" });
            const url = URL.createObjectURL(blob);

            $("preview").src = url;
            $("download").disabled = false;
            $("status").textContent = "Done";

            $("download").onclick = ()=>{
                const a = document.createElement("a");
                a.href = url;
                a.download = "mosaic.png";
                a.click();
            };
            }
        };

        const targetBuf = await fileToArrayBuffer(targetFile);
        const tileBufs  = await Promise.all(tileFiles.map(fileToArrayBuffer));

        worker.postMessage(
        {
            targetBuffer: targetBuf,
            tileBuffers: tileBufs,
            params
        },
        [
            targetBuf,
            ...tileBufs   // ✅ THIS is the critical part
        ]
        );
    };
});