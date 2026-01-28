import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { TerminalController } from '../../core/TerminalController';

export const PelzTerminal: React.FC = () => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const controllerRef = useRef<TerminalController | null>(null);

    useEffect(() => {
        if (!terminalRef.current) return;

        // Initialize xterm
        const term = new Terminal({
            cursorBlink: true,
            fontFamily: '"Fira Code", monospace',
            fontSize: 14,
            theme: {
                background: '#0c0c0c',
                foreground: '#00ff00',
            }
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        term.open(terminalRef.current);
        fitAddon.fit();

        // Initialize controller
        controllerRef.current = new TerminalController(term);

        // Handle resizing
        const handleResize = () => fitAddon.fit();
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            controllerRef.current?.dispose();
            term.dispose();
        };
    }, []);

    return (
        <div
            ref={terminalRef}
            style={{ width: '100vw', height: '100vh', background: '#000' }}
        />
    );
};
