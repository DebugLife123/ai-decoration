export function splitSseFrames(buffer: string, chunk: string, flush = false) {
    const frames: string[] = [];
    let remaining = buffer + chunk;

    for (;;) {
        const match = remaining.match(/\r?\n\r?\n/);
        if (!match) break;
        const index = match.index ?? 0;
        frames.push(remaining.slice(0, index));
        remaining = remaining.slice(index + match[0].length);
    }

    if (flush && remaining.trim()) {
        frames.push(remaining);
        remaining = "";
    }

    return { buffer: remaining, frames };
}
