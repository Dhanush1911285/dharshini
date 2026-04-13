(function () {
    function createFaceTracker(video) {
        const state = {
            results: null,
            busy: false,
            frameSkip: 0
        };

        const faceMesh = new FaceMesh({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        faceMesh.onResults((results) => {
            state.results = results;
        });

        async function process() {
            if (!video.videoWidth || state.busy) {
                return;
            }

            state.frameSkip = (state.frameSkip + 1) % 2;
            if (state.frameSkip !== 0) {
                return;
            }

            state.busy = true;
            try {
                await faceMesh.send({ image: video });
            } catch (error) {
                console.error("[facemesh] send failed", error);
            } finally {
                state.busy = false;
            }
        }

        function getLandmarks() {
            return state.results && state.results.multiFaceLandmarks
                ? state.results.multiFaceLandmarks[0]
                : null;
        }

        return {
            process,
            getLandmarks
        };
    }

    function mapPoint(point, width, height, mirror) {
        return {
            x: mirror ? (1 - point.x) * width : point.x * width,
            y: point.y * height
        };
    }

    function getTrackedFace(landmarks, width, height, mirror) {
        if (!landmarks) {
            return null;
        }

        const leftEye = mapPoint(landmarks[33], width, height, mirror);
        const rightEye = mapPoint(landmarks[263], width, height, mirror);
        const nose = mapPoint(landmarks[1], width, height, mirror);
        const mouthTop = mapPoint(landmarks[13], width, height, mirror);
        const mouthBottom = mapPoint(landmarks[14], width, height, mirror);

        const dx = rightEye.x - leftEye.x;
        const dy = rightEye.y - leftEye.y;
        const eyeDistance = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const eyeCenter = {
            x: (leftEye.x + rightEye.x) / 2,
            y: (leftEye.y + rightEye.y) / 2
        };

        return {
            leftEye,
            rightEye,
            eyeCenter,
            nose,
            mouthTop,
            mouthBottom,
            eyeDistance,
            angle
        };
    }

    window.createFaceTracker = createFaceTracker;
    window.getTrackedFace = getTrackedFace;
})();
