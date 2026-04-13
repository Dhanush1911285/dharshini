(function () {
    const filters = [
        {
            id: "aura",
            name: "Aura Glow",
            type: "tone",
            css: "brightness(1.08) saturate(1.08)",
            swatch: "linear-gradient(135deg, #ffe1c6, #7ddfff)"
        },
        {
            id: "mono",
            name: "Mono Punch",
            type: "tone",
            css: "grayscale(1) contrast(1.55)",
            swatch: "linear-gradient(135deg, #ffffff, #121212)"
        },
        {
            id: "vintage",
            name: "Vintage Dust",
            type: "tone",
            css: "sepia(0.5) contrast(1.08) saturate(0.8)",
            swatch: "linear-gradient(135deg, #f0c7a8, #6a4d3f)"
        },
        {
            id: "dog",
            name: "Dog Ears",
            type: "overlay",
            asset: "dog_ears.png",
            anchor: "eyes",
            scale: 2.8,
            yOffset: -1.1,
            swatch: "linear-gradient(135deg, #d6a37c, #70452c)"
        },
        {
            id: "cat",
            name: "Cat Ears",
            type: "overlay",
            asset: "cat_ears.png",
            anchor: "eyes",
            scale: 2.7,
            yOffset: -1.12,
            swatch: "linear-gradient(135deg, #ffd7db, #a85d75)"
        },
        {
            id: "glasses",
            name: "Shades",
            type: "overlay",
            asset: "glasses.png",
            anchor: "eyes",
            scale: 1.95,
            yOffset: -0.02,
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
            swatch: "linear-gradient(135deg, #fff3a6, #cb8d15)"
        },
        {
            id: "mask",
            name: "Mask",
            type: "overlay",
            asset: "mask.png",
            anchor: "nose",
            scale: 2.1,
            yOffset: 0.65,
            swatch: "linear-gradient(135deg, #f7f8fd, #7f92af)"
        },
        {
            id: "devil",
            name: "Devil",
            type: "overlay",
            asset: "devil_horns.png",
            anchor: "eyes",
            scale: 2.2,
            yOffset: -1.12,
            swatch: "linear-gradient(135deg, #ff8d79, #610d12)"
        },
        {
            id: "bunny",
            name: "Bunny",
            type: "overlay",
            asset: "bunny_ears.png",
            anchor: "eyes",
            scale: 2.5,
            yOffset: -1.44,
            swatch: "linear-gradient(135deg, #fff7fb, #f0b6d7)"
        },
        {
            id: "flower",
            name: "Flower",
            type: "overlay",
            asset: "flower_crown.png",
            anchor: "eyes",
            scale: 2.65,
            yOffset: -1.02,
            swatch: "linear-gradient(135deg, #ffdce8, #f6d567)"
        }
    ];

    function preloadFilterImages() {
        const cache = {};
        const overlayFilters = filters.filter((filter) => filter.asset);
        const baseUrl = window.FILTER_BASE_URL || "/static/filters";
        return Promise.all(
            overlayFilters.map((filter) => new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => {
                    cache[filter.id] = image;
                    resolve();
                };
                image.onerror = reject;
                image.src = `${baseUrl}/${filter.asset}`;
            }))
        ).then(() => cache);
    }

    window.APP_FILTERS = filters;
    window.preloadFilterImages = preloadFilterImages;
})();
