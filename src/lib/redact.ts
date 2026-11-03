const KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g;
const TOKEN = /\b(?:gh[pousr]_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{5,})/g;
const URL_USERINFO = /(?<![a-z0-9+.-])([a-z][a-z0-9+.-]{0,31}:\/\/)[^\s/]{0,512}@/gi;
const BASE64_LONG = /[A-Za-z0-9+/=]{40,}/g;

export interface RedactOptions {
    /** Leave long base64 like runs alone, for fields that hold digests or versions. */
    keepLongRuns?: boolean;
}

/** Defence in depth. Text should already be free of secrets. */
export function redact(text: string, options: RedactOptions = {}): string {
    const cleaned = text
        .replace(KEY_BLOCK, '[redacted key]')
        .replace(URL_USERINFO, '$1[redacted]@')
        .replace(TOKEN, '[redacted token]');
    return options.keepLongRuns ? cleaned : cleaned.replace(BASE64_LONG, '[redacted]');
}
