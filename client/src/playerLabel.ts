export function playerLabel(name: string, isBot: boolean) {
    if (!isBot) return name;
    const baseName = name.replace(/(?:\s*\(bot\))+$/i, '').trimEnd();
    return `${baseName} (bot)`;
}
