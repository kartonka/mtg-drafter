/** navigator.clipboard is unavailable on plain-HTTP LAN addresses, so fall back to execCommand. */
export async function copyText(text: string) {
    if (navigator.clipboard) return navigator.clipboard.writeText(text);
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
}
