export interface ParsedCommand {
    command: string;
    args: string[];
    flags: Record<string, string | boolean>;
}

export class CommandParser {
    parse(input: string): ParsedCommand {
        const tokens = input.trim().split(/\s+/);
        if (!tokens.length || tokens[0] === '') {
            return { command: '', args: [], flags: {} };
        }

        const command = tokens[0];
        const args: string[] = [];
        const flags: Record<string, string | boolean> = {};

        for (let i = 1; i < tokens.length; i++) {
            const token = tokens[i];

            if (token.startsWith('--')) {
                const parts = token.slice(2).split('=');
                if (parts.length > 1) {
                    flags[parts[0]] = parts[1];
                } else {
                    // Check if next token is a value
                    if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
                        flags[parts[0]] = tokens[i + 1];
                        i++;
                    } else {
                        flags[parts[0]] = true;
                    }
                }
            } else if (token.startsWith('-')) {
                const flagName = token.slice(1);
                // Check if next token is a value (like long flags do)
                if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
                    flags[flagName] = tokens[i + 1];
                    i++;
                } else {
                    flags[flagName] = true;
                }
            } else {
                args.push(token);
            }
        }

        return { command, args, flags };
    }
}
