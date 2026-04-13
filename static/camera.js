document.addEventListener("DOMContentLoaded", async () => {
    console.log("[camera] bootstrap");

    const app = document.getElementById("camera-app");
    const video = document.getElementById("video");
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");
    const slider = document.getElementById("filter-slider");
    const title = document.getElementById("filter-title");
    const statusChip = document.getElementById("status-chip");
    const saveBtn = document.getElementById("save-btn");
    const retakeBtn = document.getElementById("retake-btn");
    const captureBtn = document.getElementById("capture-btn");

    let stream = null;
    let usingFront = true;
    let selectedFilterIndex = 0;
    let selectedFilter = window.APP_FILTERS[0];
    let savedFrame = "";
    let faceTracker = null;
    let filterImages = {};
    let latestFace = null;
    let lastTap = 0;
    let animationFrameId = null;

    const smoothFace = {
        eyeCenterX: 0,
        eyeCenterY: 0,
        noseX: 0,
        noseY: 0,
        eyeDistance: 0,
        angle: 0,
        ready: false
    };

    function setStatus(message) {
        statusChip.textContent = message;
    }

    function resizeCanvas() {
        const ratio = window.devicePixelRatio || 1;
        const width = window.innerWidth;
        const height = window.innerHeight;
        canvas.width = Math.floor(width * ratio);
        canvas.height = Math.floor(height * ratio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function buildSlider() {
        slider.innerHTML = "";
        window.APP_FILTERS.forEach((filter, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = `filter-card${index === selectedFilterIndex ? " active" : ""}`;
            button.innerHTML = `
                <div class="filter-swatch" style="background:${filter.swatch};"></div>
                <div class="filter-name">${filter.name}</div>
            `;
            button.addEventListener("click", () => setActiveFilter(index));
            slider.appendChild(button);
        });
        centerActiveCard();
    }

    function centerActiveCard() {
        const card = slider.children[selectedFilterIndex];
        if (!card) {
            return;
        }
        const shell = slider.parentElement;
        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        const shellCenter = shell.clientWidth / 2;
        slider.style.transform = `translateX(${shellCenter - cardCenter}px)`;
    }

    function setActiveFilter(index) {
        selectedFilterIndex = index;
        selectedFilter = window.APP_FILTERS[index];
        title.textContent = selectedFilter.name;
        [...slider.children].forEach((node, nodeIndex) => {
            node.classList.toggle("active", nodeIndex === index);
        });
        centerActiveCard();
        console.log("[camera] active filter", selectedFilter.id);
    }

    async function startCamera() {
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
        }

        try {
            setStatus("Starting camera");
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: usingFront ? "user" : "environment",
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            });

            video.srcObject = stream;
            await video.play();
            faceTracker = window.createFaceTracker(video);
            setStatus(usingFront ? "Front camera live" : "Back camera live");
            console.log("[camera] stream ready");
        } catch (error) {
            console.error("[camera] getUserMedia failed", error);
            setStatus("Camera permission failed");
        }
    }

    function getCoverCrop() {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const sourceWidth = video.videoWidth || viewportWidth;
        const sourceHeight = video.videoHeight || viewportHeight;
        const sourceRatio = sourceWidth / sourceHeight;
        const targetRatio = viewportWidth / viewportHeight;

        if (sourceRatio > targetRatio) {
            const sw = sourceHeight * targetRatio;
            const sx = (sourceWidth - sw) / 2;
            return { sx, sy: 0, sw, sh: sourceHeight };
        }

        const sh = sourceWidth / targetRatio;
        const sy = (sourceHeight - sh) / 2;
        return { sx: 0, sy, sw: sourceWidth, sh };
    }

    function lerp(current, target, amount) {
        return current + (target - current) * amount;
    }

    function updateSmoothFace(face) {
        if (!face) {
            smoothFace.ready = false;
            return;
        }

        if (!smoothFace.ready) {
            smoothFace.eyeCenterX = face.eyeCenter.x;
            smoothFace.eyeCenterY = face.eyeCenter.y;
            smoothFace.noseX = face.nose.x;
            smoothFace.noseY = face.nose.y;
            smoothFace.eyeDistance = face.eyeDistance;
            smoothFace.angle = face.angle;
            smoothFace.ready = true;
            return;
        }

        smoothFace.eyeCenterX = lerp(smoothFace.eyeCenterX, face.eyeCenter.x, 0.22);
        smoothFace.eyeCenterY = lerp(smoothFace.eyeCenterY, face.eyeCenter.y, 0.22);
        smoothFace.noseX = lerp(smoothFace.noseX, face.nose.x, 0.22);
        smoothFace.noseY = lerp(smoothFace.noseY, face.nose.y, 0.22);
        smoothFace.eyeDistance = lerp(smoothFace.eyeDistance, face.eyeDistance, 0.22);
        smoothFace.angle = lerp(smoothFace.angle, face.angle, 0.22);
    }

    function drawBaseFrame() {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const crop = getCoverCrop();

        ctx.clearRect(0, 0, viewportWidth, viewportHeight);
        ctx.save();

        if (usingFront) {
            ctx.translate(viewportWidth, 0);
            ctx.scale(-1, 1);
        }

        ctx.filter = selectedFilter.css || "none";
        ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, viewportWidth, viewportHeight);
        ctx.restore();

        ctx.filter = "none";
    }

    function drawOverlayFilter() {
        if (selectedFilter.type !== "overlay" || !smoothFace.ready) {
            return;
        }

        const image = filterImages[selectedFilter.id];
        if (!image) {
            return;
        }

        const anchorX = selectedFilter.anchor === "nose" ? smoothFace.noseX : smoothFace.eyeCenterX;
        const anchorY = selectedFilter.anchor === "nose" ? smoothFace.noseY : smoothFace.eyeCenterY;
        const width = smoothFace.eyeDistance * selectedFilter.scale;
        const height = width * (image.height / image.width);
        const y = anchorY + smoothFace.eyeDistance * selectedFilter.yOffset;

        ctx.save();
        ctx.translate(anchorX, y);
        ctx.rotate(smoothFace.angle);
        ctx.drawImage(image, -width / 2, -height / 2, width, height);
        ctx.restore();
    }

    async function renderLoop() {
        animationFrameId = requestAnimationFrame(renderLoop);

        if (!video.videoWidth) {
            return;
        }

        if (faceTracker) {
            faceTracker.process();
            const landmarks = faceTracker.getLandmarks();
            latestFace = window.getTrackedFace(
                landmarks,
                window.innerWidth,
                window.innerHeight,
                usingFront
            );
            updateSmoothFace(latestFace);
        }

        drawBaseFrame();
        drawOverlayFilter();
    }

    function captureCurrentFrame() {
        drawBaseFrame();
        drawOverlayFilter();
        savedFrame = canvas.toDataURL("image/png");
        setStatus(`Captured ${selectedFilter.name}`);
    }

    async function saveCurrentFrame() {
        if (!savedFrame) {
            captureCurrentFrame();
        }

        try {
            const response = await fetch("/save", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ image: savedFrame })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Save failed");
            }

            const link = document.createElement("a");
            link.href = savedFrame;
            link.download = data.filename || "delulu-snap.png";
            link.click();
            alert("Image saved successfully 😉");
            setStatus("Saved snap");
        } catch (error) {
            console.error("[camera] save failed", error);
            setStatus("Save failed");
        }
    }

    function retake() {
        savedFrame = "";
        setStatus("Ready to capture");
    }

    async function flipOnDoubleTap() {
        usingFront = !usingFront;
        setStatus("Switching camera");
        await startCamera();
    }

    app.addEventListener("pointerup", async (event) => {
        if (event.target.closest(".filter-card, .capture-btn, .action-btn, .logout-pill")) {
            return;
        }

        const now = Date.now();
        if (now - lastTap < 300) {
            lastTap = 0;
            await flipOnDoubleTap();
            return;
        }
        lastTap = now;
    });

    captureBtn.addEventListener("click", captureCurrentFrame);
    saveBtn.addEventListener("click", saveCurrentFrame);
    retakeBtn.addEventListener("click", retake);
    window.addEventListener("resize", () => {
        resizeCanvas();
        centerActiveCard();
    });

    resizeCanvas();
    buildSlider();
    setActiveFilter(0);

    try {
        filterImages = await window.preloadFilterImages();
        console.log("[camera] assets preloaded", Object.keys(filterImages));
    } catch (error) {
        console.error("[camera] asset preload failed", error);
        setStatus("Filter assets failed to load");
    }

    await startCamera();
    renderLoop();
});
