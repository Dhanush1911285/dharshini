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
    let capturedImage = "";
    let isCaptured = false;
    let faceTracker = null;
    let filterImages = {};
    let lastTap = 0;
    let animationFrameId = null;
    let currentStreamToken = 0;

    const smoothFace = {
        eyeCenterX: 0,
        eyeCenterY: 0,
        noseX: 0,
        noseY: 0,
        eyeDistance: 0,
        angle: 0,
        mouthOpen: 0,
        ready: false
    };

    function setStatus(message) {
        statusChip.textContent = message;
    }

    function updateUiState() {
        app.classList.toggle("captured", isCaptured);
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
            button.addEventListener("click", () => {
                if (isCaptured) {
                    return;
                }
                setActiveFilter(index);
            });
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
    }

    async function startCamera() {
        currentStreamToken += 1;
        const streamToken = currentStreamToken;
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
        }

        setStatus("Starting camera");

        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: usingFront ? "user" : "environment",
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
            });

            video.srcObject = stream;
            await video.play();
            if (streamToken !== currentStreamToken) {
                return;
            }
            faceTracker = window.createFaceTracker(video);
            setStatus(usingFront ? "Front camera live" : "Back camera live");
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
            smoothFace.mouthOpen = face.mouthOpen;
            smoothFace.ready = true;
            return;
        }

        smoothFace.eyeCenterX = lerp(smoothFace.eyeCenterX, face.eyeCenter.x, 0.22);
        smoothFace.eyeCenterY = lerp(smoothFace.eyeCenterY, face.eyeCenter.y, 0.22);
        smoothFace.noseX = lerp(smoothFace.noseX, face.nose.x, 0.22);
        smoothFace.noseY = lerp(smoothFace.noseY, face.nose.y, 0.22);
        smoothFace.eyeDistance = lerp(smoothFace.eyeDistance, face.eyeDistance, 0.22);
        smoothFace.angle = lerp(smoothFace.angle, face.angle, 0.22);
        smoothFace.mouthOpen = lerp(smoothFace.mouthOpen, face.mouthOpen, 0.22);
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

        if (selectedFilter.tongueAsset && smoothFace.mouthOpen > 0.028) {
            const tongue = filterImages[`${selectedFilter.id}:tongue`];
            if (!tongue) {
                return;
            }

            const tongueWidth = smoothFace.eyeDistance * (selectedFilter.tongueScale || 0.82);
            const tongueHeight = tongueWidth * (tongue.height / tongue.width);
            const openFactor = Math.min(1.25, smoothFace.mouthOpen / 0.06);

            ctx.save();
            ctx.translate(smoothFace.noseX, smoothFace.noseY + smoothFace.eyeDistance * 0.86);
            ctx.rotate(smoothFace.angle);
            ctx.drawImage(
                tongue,
                -tongueWidth / 2,
                -tongueHeight * 0.12,
                tongueWidth,
                tongueHeight * openFactor
            );
            ctx.restore();
        }
    }

    function stepFrame() {
        if (faceTracker) {
            faceTracker.process();
            const landmarks = faceTracker.getLandmarks();
            const face = window.getTrackedFace(
                landmarks,
                window.innerWidth,
                window.innerHeight,
                usingFront
            );
            updateSmoothFace(face);
        }

        drawBaseFrame();
        drawOverlayFilter();
    }

    function renderLoop() {
        animationFrameId = requestAnimationFrame(renderLoop);

        if (!video.videoWidth || isCaptured) {
            return;
        }

        stepFrame();
    }

    function stopRenderLoop() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }

    function startRenderLoop() {
        if (!animationFrameId) {
            renderLoop();
        }
    }

    function captureCurrentFrame() {
        if (isCaptured) {
            return;
        }

        stepFrame();
        capturedImage = canvas.toDataURL("image/png");
        isCaptured = true;
        stopRenderLoop();
        updateUiState();
        setStatus(`Captured ${selectedFilter.name}`);
        uploadCapturedImage().catch((error) => {
            console.error("[camera] auto upload failed", error);
            setStatus("Captured locally");
        });
    }

    async function uploadCapturedImage() {
        const response = await fetch("/upload", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ image: capturedImage })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "Upload failed");
        }

        return data;
    }

    async function saveCurrentFrame() {
        if (!capturedImage) {
            return;
        }

        try {
            const link = document.createElement("a");
            link.href = capturedImage;
            link.download = "snap.png";
            link.click();
            alert("Saved to device ✅");
            setStatus("Saved to device");
        } catch (error) {
            console.error("[camera] save failed", error);
            setStatus("Save failed");
        }
    }

    async function retake() {
        capturedImage = "";
        isCaptured = false;
        updateUiState();
        await startCamera();
        setStatus("Ready to capture");
        startRenderLoop();
    }

    async function flipOnDoubleTap() {
        usingFront = !usingFront;
        if (!isCaptured) {
            await startCamera();
        }
    }

    app.addEventListener("pointerup", async (event) => {
        if (event.target.closest(".filter-card, .capture-btn, .action-btn, .logout-pill")) {
            return;
        }

        const now = Date.now();
        if (now - lastTap < 300) {
            lastTap = 0;
            if (!isCaptured) {
                await flipOnDoubleTap();
            }
            return;
        }
        lastTap = now;
    });

    captureBtn.addEventListener("click", captureCurrentFrame);
    saveBtn.addEventListener("click", saveCurrentFrame);
    retakeBtn.addEventListener("click", () => {
        retake().catch((error) => {
            console.error("[camera] retake failed", error);
            setStatus("Retake failed");
        });
    });

    window.addEventListener("resize", () => {
        resizeCanvas();
        centerActiveCard();
        if (!isCaptured) {
            stepFrame();
        }
    });

    resizeCanvas();
    buildSlider();
    setActiveFilter(0);
    updateUiState();

    try {
        filterImages = await window.preloadFilterImages();
    } catch (error) {
        console.error("[camera] asset preload failed", error);
        setStatus("Filter assets failed to load");
    }

    await startCamera();
    startRenderLoop();
});
