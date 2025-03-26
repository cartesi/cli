export const getEnvUrl = () =>
    import.meta.env.MODE === "development"
        ? "http://127.0.0.1:6751/"
        : `${window.location.href}`;
