/** Defence in depth. Text should already be free of secrets. */
const KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g;
const TOKEN = /\b(?:gh[pousr]_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{5,})/g;
const URL_USERINFO = /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/]*@/gi;
const BASE64_LONG = /[A-Za-z0-9+/=]{40,}/g;

export function redact(text: string): string {
    return text
        .replace(/\\n/g, '\n')
        .replace(KEY_BLOCK, '[redacted key]')
        .replace(URL_USERINFO, '$1[redacted]@')
        .replace(TOKEN, '[redacted token]')
        .replace(BASE64_LONG, '[redacted]');
}
