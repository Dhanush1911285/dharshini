(function () {
    const filters = [
        {
            id: "hdr",
            name: "HDR",
            type: "tone",
            css: "contrast(1.2) brightness(1.1) saturate(1.2)",
            swatch: "linear-gradient(135deg, #fff3da, #7de4ff)"
        },
        {
            id: "vintage",
            name: "Vintage",
            type: "tone",
            css: "sepia(0.5) contrast(1.08) saturate(0.8)",
            swatch: "linear-gradient(135deg, #f0c7a8, #6a4d3f)"
        },
        {
            id: "cool",
            name: "Cool",
            type: "tone",
            css: "contrast(1.06) brightness(1.05) saturate(0.95) hue-rotate(180deg)",
            swatch: "linear-gradient(135deg, #d9f8ff, #3b8de3)"
        },
        {
            id: "warm",
            name: "Warm",
            type: "tone",
            css: "brightness(1.08) saturate(1.12) sepia(0.28) hue-rotate(-18deg)",
            swatch: "linear-gradient(135deg, #ffe1b6, #ff9068)"
        },
        {
            id: "mono",
            name: "Mono",
            type: "tone",
            css: "grayscale(1) contrast(1.55)",
            swatch: "linear-gradient(135deg, #ffffff, #121212)"
        },
        {
            id: "bright",
            name: "Bright",
            type: "tone",
            css: "brightness(1.16) contrast(1.08) saturate(1.05)",
            swatch: "linear-gradient(135deg, #ffffff, #ffd8b5)"
        },
        {
            id: "blur",
            name: "Blur",
            type: "tone",
            css: "blur(1.8px) brightness(1.05)",
            swatch: "linear-gradient(135deg, #e9f1ff, #b2c2e0)"
        },
        {
            id: "dog",
            name: "Dog",
            type: "overlay",
            asset: "dog_ears.png",
            tongueAsset: "tongue.png",
            anchor: "eyes",
            scale: 2.8,
            yOffset: -1.1,
            css: "contrast(1.08) brightness(1.04) saturate(1.06)",
            tongueScale: 0.82,
            swatch: "linear-gradient(135deg, #d6a37c, #70452c)"
        },
        {
            id: "cat",
            name: "Cat",
            type: "overlay",
            asset: "cat_ears.png",
            anchor: "eyes",
            scale: 2.7,
            yOffset: -1.12,
            css: "brightness(1.08) saturate(1.04)",
            swatch: "linear-gradient(135deg, #ffd7db, #a85d75)"
        },
        {
            id: "glasses",
            name: "Glasses",
            type: "overlay",
            asset: "glasses.png",
            anchor: "eyes",
            scale: 1.95,
            yOffset: -0.02,
            css: "contrast(1.12) brightness(1.03)",
            swatch: "linear-gradient(135deg, #161922, #9fa9be)"
        },
        {
            id: "crown",
            name: "Crown",
            type: "overlay",
            asset: "crown.png",
            anchor: "eyes",
            scale: 2.5,
            yOffset: -1.18,
            css: "contrast(1.14) brightness(1.08) saturate(1.12)",
            swatch: "linear-gradient(135deg, #fff3a6, #cb8d15)"
        }
    ];

    function loadImage(src, cacheKey, cache) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
                cache[cacheKey] = image;
                resolve();
            };
            image.onerror = reject;
            image.src = src;
        });
    }

    function preloadFilterImages() {
        const cache = {};
        const baseUrl = window.FILTER_BASE_URL || "/static/filters";
        const tasks = [];

        filters.forEach((filter) => {
            if (filter.asset) {
                tasks.push(loadImage(`${baseUrl}/${filter.asset}`, filter.id, cache));
            }

            if (filter.tongueAsset) {
                tasks.push(loadImage(`${baseUrl}/${filter.tongueAsset}`, `${filter.id}:tongue`, cache));
            }
        });

        return Promise.all(tasks).then(() => cache);
    }

    window.APP_FILTERS = filters;
    window.preloadFilterImages = preloadFilterImages;
})();
