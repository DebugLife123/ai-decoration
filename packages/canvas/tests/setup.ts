Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
        clear: () => undefined,
    },
});
