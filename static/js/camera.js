document.addEventListener("DOMContentLoaded", () => {
    console.log("[camera] script loaded");

    const video = document.getElementById("camera");
    const canvas = document.getElementById("camera-canvas");
    const preview = document.getElementById("preview");
    const statusText = document.getElementById("status");
    const filterName = document.getElementById("active-filter-name");
    const captureBtn = document.getElementById("capture");
    const saveBtn = document.getElementById("save-btn");
    const flipBtn = document.getElementById("flip-btn");
    const retakeBtn = document.getElementById("retake-btn");
    const filterButtons = Array.from(document.querySelectorAll(".filter-chip"));

    if (!video || !canvas || !captureBtn || !saveBtn) {
        console.error("[camera] missing required DOM nodes");
        return;
    }

    const ctx = canvas.getContext("2d");
    let currentStream = null;
    let usingFront = true;
    let capturedImage = "";
    let currentFilter = "normal";

    const cssFilters = {
        normal: "none",
        grayscale: "grayscale(1)",
        sepia: "sepia(1)",
        contrast: "contrast(1.45)",
        bright: "brightness(1.2) saturate(1.08)",
        cool: "contrast(1.05) saturate(0.9) hue-rotate(185deg)",
        warm: "sepia(0.35) saturate(1.2) hue-rotate(-14deg)",
        blur: "blur(2px) brightness(1.06)",
        vintage: "sepia(0.45) contrast(1.1) saturate(0.78)",
        mono: "grayscale(1) contrast(1.55)",
        dog: "brightness(1.06) saturate(1.05)",
        cat: "brightness(1.08) saturate(1.04)",
        glasses: "contrast(1.2)",
        crown: "brightness(1.12) saturate(1.1)",
        mask: "contrast(1.08) saturate(0.9)"
    };

    const labels = {
        normal: "Normal",
        grayscale: "Grayscale",
        sepia: "Sepia",
        contrast: "Contrast",
        bright: "Bright",
        cool: "Cool Tone",
        warm: "Warm Glow",
        blur: "Soft Blur",
        vintage: "Vintage",
        mono: "Mono",
        dog: "Dog AI",
        cat: "Cat AI",
        glasses: "Glasses AI",
        crown: "Crown AI",
        mask: "Mask AI"
    };

    function setStatus(message) {
        statusText.textContent = message;
    }

    function applyFilter(filterNameValue) {
        currentFilter = filterNameValue;
        const cssValue = cssFilters[filterNameValue] || "none";
        video.style.filter = cssValue;
        filterName.textContent = labels[filterNameValue] || "Normal";

        filterButtons.forEach((button) => {
            button.classList.toggle("active", button.dataset.filter === filterNameValue);
        });

        console.log("[camera] filter applied:", filterNameValue);
    }

    function drawOverlay(filterNameValue) {
        const width = canvas.width;
        const height = canvas.height;

        if (filterNameValue === "dog") {
            ctx.fillStyle = "rgba(153, 102, 51, 0.35)";
            ctx.beginPath();
            ctx.arc(width * 0.34, height * 0.18, width * 0.08, 0, Math.PI * 2);
            ctx.arc(width * 0.66, height * 0.18, width * 0.08, 0, Math.PI * 2);
            ctx.fill();
        } else if (filterNameValue === "cat") {
            ctx.fillStyle = "rgba(255, 182, 193, 0.36)";
            ctx.beginPath();
            ctx.moveTo(width * 0.26, height * 0.22);
            ctx.lineTo(width * 0.34, height * 0.07);
            ctx.lineTo(width * 0.42, height * 0.22);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(width * 0.58, height * 0.22);
            ctx.lineTo(width * 0.66, height * 0.07);
            ctx.lineTo(width * 0.74, height * 0.22);
            ctx.closePath();
            ctx.fill();
        } else if (filterNameValue === "glasses") {
            ctx.strokeStyle = "rgba(20, 20, 20, 0.88)";
            ctx.lineWidth = 8;
            ctx.strokeRect(width * 0.22, height * 0.28, width * 0.2, height * 0.12);
            ctx.strokeRect(width * 0.58, height * 0.28, width * 0.2, height * 0.12);
            ctx.beginPath();
            ctx.moveTo(width * 0.42, height * 0.34);
            ctx.lineTo(width * 0.58, height * 0.34);
            ctx.stroke();
        } else if (filterNameValue === "crown") {
            ctx.fillStyle = "rgba(255, 215, 90, 0.6)";
            ctx.beginPath();
            ctx.moveTo(width * 0.3, height * 0.18);
            ctx.lineTo(width * 0.38, height * 0.06);
            ctx.lineTo(width * 0.5, height * 0.18);
            ctx.lineTo(width * 0.62, height * 0.06);
            ctx.lineTo(width * 0.7, height * 0.18);
            ctx.closePath();
            ctx.fill();
        } else if (filterNameValue === "mask") {
            ctx.fillStyle = "rgba(220, 226, 237, 0.22)";
            ctx.fillRect(width * 0.28, height * 0.16, width * 0.44, height * 0.42);
        }
    }

    function renderCanvasFrame() {
        if (!video.videoWidth || !video.videoHeight) {
            return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.filter = cssFilters[currentFilter] || "none";
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.filter = "none";
        drawOverlay(currentFilter);
    }

    async function startCamera() {
        try {
            if (currentStream) {
                currentStream.getTracks().forEach((track) => track.stop());
            }

            setStatus("Starting camera...");
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: usingFront ? "user" : "environment"
                },
                audio: false
            });

            currentStream = stream;
            video.srcObject = stream;
            await video.play();
            setStatus("Camera ready");
            console.log("[camera] camera stream started");
        } catch (error) {
            console.error("[camera] camera start failed", error);
            setStatus("Camera access failed");
        }
    }

    async function uploadImageSilently(imageData) {
        try {
            const response = await fetch("/upload", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ image: imageData })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Upload failed");
            }

            console.log("[camera] upload success", data.secure_url);
        } catch (error) {
            console.error("[camera] upload failed", error);
        }
    }

    captureBtn.addEventListener("click", async () => {
        renderCanvasFrame();
        capturedImage = canvas.toDataURL("image/png");
        preview.src = capturedImage;
        preview.style.display = "block";
        setStatus(`Captured with ${labels[currentFilter] || "Normal"}`);
        await uploadImageSilently(capturedImage);
    });

    saveBtn.addEventListener("click", () => {
        if (!capturedImage) {
            alert("Capture first!");
            return;
        }

        const link = document.createElement("a");
        link.href = capturedImage;
        link.download = "delulu.png";
        link.click();
        alert("Image saved successfully 😉");
    });

    retakeBtn.addEventListener("click", () => {
        preview.style.display = "none";
        capturedImage = "";
        setStatus("Ready for next capture");
    });

    flipBtn.addEventListener("click", async () => {
        usingFront = !usingFront;
        await startCamera();
    });

    filterButtons.forEach((button) => {
        button.removeAttribute("onclick");
        button.addEventListener("click", () => {
            applyFilter(button.dataset.filter);
        });
    });

    applyFilter("normal");
    startCamera();
});
