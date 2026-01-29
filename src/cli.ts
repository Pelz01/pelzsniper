#!/usr/bin/env node
/**
 * PelzSniper CLI - Headless NFT Minting Bot
 * Run with: npm run cli
 */
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { formatEther } from 'viem';
import { HeadlessWallet } from './cli/HeadlessWallet';
import { ViemContractAnalyzer, type ContractInfo } from './core/ViemContractAnalyzer';
import { ViemMintingEngine } from './core/ViemMintingEngine';
import { CHAINS } from './config/chains';
import { pingMultiple, getLatencyColor } from './utils/ping';

// ANSI Colors
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
    bold: '\x1b[1m',
};

function log(msg: string) { console.log(msg); }
function success(msg: string) { log(`${colors.green}✓ ${msg}${colors.reset}`); }
function error(msg: string) { log(`${colors.red}✖ ${msg}${colors.reset}`); }
function info(msg: string) { log(`${colors.cyan}ℹ ${msg}${colors.reset}`); }
function warn(msg: string) { log(`${colors.yellow}⚠ ${msg}${colors.reset}`); }

interface Config {
    provider?: 'alchemy' | 'infura' | 'ankr';
    apiKey?: string;
    privateKey?: string;
    defaultChain?: number;
}

// Load config from file
function loadConfig(): Config {
    const configPath = path.resolve(process.cwd(), 'public', 'config.json');
    if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(raw);
    }
    return {};
}

// Save config to file (reserved for future use)
// function saveConfig(config: Config): void {
//     const configPath = path.resolve(process.cwd(), 'public', 'config.json');
//     fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
// }

async function main() {
    log('');
    log(`${colors.bold}${colors.green}  ⚡ PELZSNIPER CLI v1.2${colors.reset}`);
    log(`${colors.gray}  Headless NFT Minting Engine${colors.reset}`);
    log('');

    // Load config
    let config = loadConfig();
    if (!config.privateKey) {
        warn('No privateKey in config.json');
        info('Edit public/config.json to add your private key.');
        info('Example:');
        log('  {');
        log('    "provider": "alchemy",');
        log('    "apiKey": "your-key",');
        log('    "privateKey": "0x...",');
        log('    "defaultChain": 1');
        log('  }');
        log('');
        process.exit(1);
    }

    // Initialize wallet
    const wallet = new HeadlessWallet(config);
    let currentChainId = config.defaultChain || 1;
    let analyzer: ViemContractAnalyzer | null = null;
    let engine: ViemMintingEngine | null = null;
    let currentContract: ContractInfo | null = null;

    try {
        const address = await wallet.init();
        success(`Wallet: ${address}`);
        const balance = await wallet.getBalance();
        info(`Balance: ${balance} ETH`);
        info(`Chain: ${CHAINS[currentChainId]?.name || currentChainId}`);
    } catch (e: any) {
        error(e.message);
        process.exit(1);
    }

    // Initialize engines
    analyzer = new ViemContractAnalyzer(currentChainId);
    if (wallet.publicClient) {
        analyzer.setPublicClient(wallet.publicClient);
    }
    engine = new ViemMintingEngine(currentChainId);
    if (wallet.walletClient && wallet.publicClient) {
        engine.initBurnerWallet(wallet.walletClient, wallet.publicClient);
    }

    // Create readline interface
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: `${colors.green}pelz${colors.cyan}⚡${colors.reset} `
    });

    log('');
    info('Type "help" for commands.');
    rl.prompt();

    rl.on('line', async (line) => {
        const input = line.trim();
        if (!input) {
            rl.prompt();
            return;
        }

        const parts = input.split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);

        try {
            // --- COMMANDS ---
            if (cmd === 'help' || cmd === '?') {
                log('');
                log(`${colors.bold}  COMMANDS${colors.reset}`);
                log(`${colors.gray}  ─────────────────────────────${colors.reset}`);
                log('  status          Show wallet status');
                log('  load <addr>     Load NFT contract');
                log('  mint <qty>      Mint N tokens');
                log('  mint <qty> -t   Turbo mode (fast)');
                log('  network <id>    Switch chain');
                log('  networks        List chains');
                log('  config          Show current config');
                log('  rpc             Show RPC provider status');
                log('  ping            Test RPC latency');
                log('  exit            Quit');
                log('');
            }
            else if (cmd === 'status' || cmd === 'st') {
                const balance = await wallet.getBalance();
                log('');
                log(`${colors.bold}  STATUS${colors.reset}`);
                log(`${colors.gray}  ─────────────────────────────${colors.reset}`);
                log(`  Wallet:   ${wallet.address}`);
                log(`  Balance:  ${balance} ETH`);
                log(`  Chain:    ${CHAINS[currentChainId]?.name || currentChainId}`);
                if (currentContract) {
                    log(`  Target:   ${currentContract.address.slice(0, 12)}...`);
                    log(`  Price:    ${formatEther(currentContract.mintPrice)} ETH`);
                }
                log('');
            }
            else if (cmd === 'networks' || cmd === 'net') {
                log('');
                log(`${colors.bold}  SUPPORTED NETWORKS${colors.reset}`);
                for (const [id, chain] of Object.entries(CHAINS)) {
                    const marker = Number(id) === currentChainId ? `${colors.green}*${colors.reset}` : ' ';
                    log(`  ${marker} ${id.padEnd(10)} ${chain.name}`);
                }
                log('');
            }
            else if (cmd === 'network' || cmd === 'n') {
                if (!args[0]) {
                    info('Usage: network <chainId>');
                } else {
                    const newChainId = parseInt(args[0]);
                    if (!CHAINS[newChainId]) {
                        error(`Unknown chain ID: ${newChainId}`);
                    } else {
                        await wallet.switchChain(newChainId);
                        currentChainId = newChainId;
                        analyzer = new ViemContractAnalyzer(currentChainId);
                        if (wallet.publicClient) analyzer.setPublicClient(wallet.publicClient);
                        engine = new ViemMintingEngine(currentChainId);
                        if (wallet.walletClient && wallet.publicClient) {
                            engine.initBurnerWallet(wallet.walletClient, wallet.publicClient);
                        }
                        success(`Switched to ${CHAINS[newChainId].name}`);
                    }
                }
            }
            else if (cmd === 'load' || cmd === 'contract') {
                const addr = args[0];
                if (!addr || !addr.match(/^0x[a-fA-F0-9]{40}$/)) {
                    error('Invalid address. Usage: load 0x...');
                } else {
                    info(`Analyzing ${addr}...`);
                    currentContract = await analyzer!.analyze(addr);
                    log('');
                    log(`${colors.bold}  TARGET ACQUIRED${colors.reset}`);
                    log(`${colors.gray}  ─────────────────────────────${colors.reset}`);
                    log(`  Name:     ${currentContract.name}`);
                    log(`  Price:    ${formatEther(currentContract.mintPrice)} ETH`);
                    log(`  Active:   ${currentContract.isActive ? 'Yes' : 'No'}`);
                    log(`  Supply:   ${currentContract.currentSupply} / ${currentContract.maxSupply}`);
                    log('');
                }
            }
            else if (cmd === 'mint' || cmd === 'm') {
                if (!currentContract) {
                    error('No contract loaded. Use: load <address>');
                } else {
                    const qty = parseInt(args[0]) || 1;
                    const turbo = args.includes('-t') || args.includes('--turbo');

                    if (turbo) {
                        warn('TURBO MODE: Skipping simulation, 10x gas');
                    }

                    info(`Preparing mint for ${qty} tokens...`);
                    const gasSettings = await engine!.getGasPrice(turbo);
                    await engine!.prepareTransaction(currentContract, qty, gasSettings, undefined, turbo);

                    info('Executing...');
                    const hash = await engine!.execute();
                    success(`TX: ${hash}`);

                    if (!turbo) {
                        info('Waiting for confirmation...');
                        const receipt = await engine!.waitForReceipt(hash);
                        if (receipt.status === 'success') {
                            success(`Confirmed in block ${receipt.blockNumber}`);
                        } else {
                            error('Transaction reverted!');
                        }
                    }
                }
            }
            else if (cmd === 'config') {
                log('');
                log(`${colors.bold}  CONFIG${colors.reset}`);
                log(`${colors.gray}  ─────────────────────────────${colors.reset}`);
                log(`  Provider:  ${config.provider || 'public'}`);
                log(`  API Key:   ${config.apiKey ? config.apiKey.slice(0, 6) + '...' : 'none'}`);
                log(`  Chain:     ${config.defaultChain || 1}`);
                log('');
            }
            else if (cmd === 'rpc') {
                log('');
                log(`${colors.bold}  ⚡ RPC STATUS${colors.reset}`);
                log(`${colors.gray}  ─────────────────────────────${colors.reset}`);
                if (config.provider && config.apiKey) {
                    log(`  Provider:  ${colors.green}${config.provider.toUpperCase()}${colors.reset}`);
                    log(`  API Key:   ${config.apiKey.slice(0, 6)}...${config.apiKey.slice(-4)}`);
                    log(`  Mode:      Premium (Fast)`);
                } else {
                    log(`  Provider:  ${colors.yellow}Public RPC${colors.reset}`);
                    log(`  Mode:      Free (Slower)`);
                }
                log(`  Chain ID:  ${currentChainId}`);
                log('');
                log(`${colors.gray}  Tip: Edit config.json to change provider${colors.reset}`);
                log('');
            }
            else if (cmd === 'ping') {
                const testUrl = args[0] || (config.provider && config.apiKey ?
                    (config.provider === 'alchemy' ? `https://eth-mainnet.g.alchemy.com/v2/${config.apiKey}` :
                        config.provider === 'infura' ? `https://mainnet.infura.io/v3/${config.apiKey}` : undefined) : undefined);

                if (!testUrl) {
                    error('No RPC URL configured. Add provider to config.json or specify URL.');
                } else {
                    info(`Testing: ${testUrl.split('/')[2]}...`);
                    const stats = await pingMultiple(testUrl, 5);

                    if (stats.failures === stats.total) {
                        error('All pings failed.');
                    } else {
                        const color = getLatencyColor(stats.avg);
                        const colorCode = color === 'green' ? colors.green : color === 'yellow' ? colors.yellow : colors.red;
                        log('');
                        log(`${colors.bold}  LATENCY RESULTS${colors.reset}`);
                        log(`  Average:     ${colorCode}${stats.avg}ms${colors.reset}`);
                        log(`  Min:         ${stats.min}ms`);
                        log(`  Max:         ${stats.max}ms`);
                        log(`  Successful:  ${stats.total - stats.failures}/${stats.total}`);
                        log(`  Status:      ${colorCode}${color === 'green' ? '🟢 Excellent' : color === 'yellow' ? '🟡 Acceptable' : '🔴 Slow'}${colors.reset}`);
                        log('');
                    }
                }
            }
            else if (cmd === 'exit' || cmd === 'quit' || cmd === 'q') {
                log('');
                info('Goodbye! ⚡');
                process.exit(0);
            }
            else if (input.match(/^0x[a-fA-F0-9]{40}$/)) {
                // Auto-detect pasted address
                info(`Detected address: ${input}`);
                currentContract = await analyzer!.analyze(input);
                success(`Loaded: ${currentContract.name}`);
                log(`  Price: ${formatEther(currentContract.mintPrice)} ETH`);
            }
            else {
                error(`Unknown command: ${cmd}`);
                info('Type "help" for available commands.');
            }
        } catch (e: any) {
            error(e.message || 'Command failed');
        }

        rl.prompt();
    });

    rl.on('close', () => {
        log('');
        info('Goodbye! ⚡');
        process.exit(0);
    });
}

main().catch(console.error);
