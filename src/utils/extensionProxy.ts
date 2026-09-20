
interface ExtensionResponse<T = unknown> {
    source: string;
    messageId: string;
    success: boolean;
    data?: T;
    error?: string;
}

export const isExtensionAvailable = (): boolean => {
    if (typeof window === 'undefined') return false;
    const w = window as Window & {
        hasOrvixExtension?: boolean;
        hasOrvixExtension?: boolean;
        __ORVIX_EXTENSION_INSTALLED?: boolean;
        __ORVIX_EXTENSION_INSTALLED?: boolean;
        hasOrvixUserscript?: boolean;
        hasOrvixUserscript?: boolean;
    };
    return (
        w.hasOrvixExtension === true ||
        w.hasOrvixExtension === true ||
        w.__ORVIX_EXTENSION_INSTALLED === true ||
        w.__ORVIX_EXTENSION_INSTALLED === true ||
        w.hasOrvixUserscript === true ||
        w.hasOrvixUserscript === true ||
        document.documentElement?.dataset.orvixExtension === 'true' ||
        document.documentElement?.dataset.orvixExtension === 'true'
    );
};

export const fetchFromExtension = <T = unknown>(
    action: string,
    payload: Record<string, unknown> = {}
): Promise<T> => {
    return new Promise((resolve, reject) => {
        if (!isExtensionAvailable()) {
            return reject(new Error("Extension not available"));
        }

        const accessKey = window.localStorage.getItem("access_code");
        const enrichedPayload = payload && typeof payload === "object" && !Array.isArray(payload)
            ? { ...payload, ...(accessKey ? { accessKey } : {}) }
            : payload;

        const messageId = Math.random().toString(36).substring(7);

        const handler = (event: MessageEvent<ExtensionResponse<T>>) => {
            const response = event.data;

            // We accept messages from window, must be from extension content script
            if (
                event.source !== window ||
                !response ||
                (response.source !== "ORVIX_EXTENSION" && response.source !== "ORVIX_EXTENSION")
            ) return;

            if (response.messageId === messageId) {
                window.removeEventListener("message", handler);
                if (response.success) {
                    resolve(response.data as T);
                } else {
                    reject(new Error(response.error || "Unknown extension error"));
                }
            }
        };

        window.addEventListener("message", handler);
        window.postMessage({
            source: "ORVIX_WEB",
            type: "EXTENSION_REQUEST",
            action,
            payload: enrichedPayload,
            messageId
        }, "*");

        // Timeout after 10 seconds
        setTimeout(() => {
            window.removeEventListener("message", handler);
            reject(new Error("Extension request timed out"));
        }, 10000);
    });
};
