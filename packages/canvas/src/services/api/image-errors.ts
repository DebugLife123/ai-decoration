import axios from "axios";
import i18n from "../../i18n";

const apiText = (key: string, options?: Record<string, unknown>) => i18n.t(`apiErrors.${key}`, options);

function readApiErrorMessage(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            const inner = readApiErrorMessage(parsed) || value;
            if (inner === value && typeof parsed === "object" && Object.keys(parsed).length === 0) return "";
            return inner;
        } catch {
            if (/<[a-z][\s\S]*>/i.test(value)) return apiText("htmlError", { preview: `${value.slice(0, 80)}...` });
            return value;
        }
    }
    if (typeof value !== "object") return "";
    const payload = value as { msg?: unknown; message?: unknown; error?: unknown; detail?: unknown };
    const errorMsg = typeof payload.error === "string" ? payload.error : (payload.error as { message?: unknown })?.message;
    return readApiErrorMessage(payload.msg) || readApiErrorMessage(payload.message) || readApiErrorMessage(errorMsg) || readApiErrorMessage(payload.detail) || "";
}

function readStatusError(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return apiText("authenticationFailed");
    if (status === 429) return apiText("rateLimited");
    if (status === 404) return apiText("notFound");
    if (status === 502) return apiText("badGateway");
    if (status === 503) return apiText("serviceBusy");
    return status ? apiText("httpFailed", { status }) : fallback;
}

export function readImageProviderError(error: unknown, fallback: string) {
    if (axios.isCancel(error)) return apiText("requestCanceled");
    if (axios.isAxiosError(error)) {
        if (!error.response && error.code === "ERR_NETWORK") return apiText("requestFailed");
        return readApiErrorMessage(error.response?.data) || readStatusError(error.response?.status, fallback) || error.message || fallback;
    }
    if (error instanceof DOMException && error.name === "AbortError") return apiText("requestCanceled");
    return error instanceof Error ? readApiErrorMessage(error.message) || error.message : fallback;
}

export function readImageProviderFetchError(status: number, text: string, fallback: string) {
    if (!text) return readStatusError(status, fallback);
    try {
        const payload = JSON.parse(text) as { msg?: unknown; message?: unknown; error?: unknown; response?: unknown };
        const error = payload.error && typeof payload.error === "object" ? (payload.error as { message?: unknown }).message : payload.error;
        const responseError = payload.response && typeof payload.response === "object" ? (payload.response as { error?: { message?: unknown } }).error?.message : undefined;
        return readApiErrorMessage(payload.msg) || readApiErrorMessage(payload.message) || readApiErrorMessage(error) || readApiErrorMessage(responseError) || readStatusError(status, fallback);
    } catch {
        return text.slice(0, 300) || readStatusError(status, fallback);
    }
}
