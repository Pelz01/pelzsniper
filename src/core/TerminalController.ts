import { Terminal } from 'xterm';
import { formatEther, parseEther, formatUnits } from 'viem';
import { CommandParser } from './CommandParser';
import { useWalletStore } from '../store/walletStore';
import { ViemContractAnalyzer, type ContractInfo } from './ViemContractAnalyzer';
import { ViemMintingEngine } from './ViemMintingEngine';
import { NETWORKS, type NetworkConfig } from '../config/networks';
import { getPlatformManager, initializePlatformModules, type PlatformContractInfo } from './platforms';
import { pingMultiple, getLatencyColor } from '../utils/ping';

export class TerminalController {
    private term: Terminal;
    private history: string[] = [];
    private historyIndex: number = -1;
    private currentLine: string = '';
    private promptString: string = '\r\n\x1b[1;32mpelz-sniper\x1b[0m\x1b[1;34m⚡\x1b[0m '; // Bold Green + Blue Bolt

    private parser: CommandParser;
    private analyzer: ViemContractAnalyzer | null = null;
    private engine: ViemMintingEngine | null = null;

    private currentContract: ContractInfo | null = null;
    private platformContract: PlatformContractInfo | null = null; // For marketplace-specific minting
    private disposable: { dispose: () => void } | null = null;

    // Monitor mode state
    private isMonitoring: boolean = false;
    private monitorIntervalId: ReturnType<typeof setInterval> | null = null;

    constructor(term: Terminal) {
        this.term = term;
        this.parser = new CommandParser();
        this.printWelcome();
        this.setupInput();

        // Restore session if available (wallet store handles auto-restore)
        const walletState = useWalletStore.getState();
        if (walletState.walletInfo) {
            this.term.writeln(this.color('  ⚡ Burner Session Active', '90'));
            this.success(`Wallet: ${walletState.walletInfo.address}`);
            // Wrap in async IIFE since constructor can't be async
            (async () => {
                await this.initializeEngines(walletState.walletInfo!.chainId);
            })();
        } else if (sessionStorage.getItem('pelz_burner_key')) {
            this.term.writeln(this.color('  ⚡ Restoring Burner Session...', '90'));
            // Wallet store auto-restores, we just need to wait a tick
            setTimeout(async () => {
                const info = useWalletStore.getState().walletInfo;
                if (info) {
                    this.success(`Restored: ${info.address}`);
                    await this.initializeEngines(info.chainId);
                    this.prompt();
                }
            }, 500);
        }
    }

    private async initializeEngines(chainId: number) {
        const walletState = useWalletStore.getState();

        this.analyzer = new ViemContractAnalyzer(chainId, !walletState.isBurnerMode);
        this.engine = new ViemMintingEngine(chainId);

        if (walletState.isBurnerMode && walletState.burnerWalletClient && walletState.burnerPublicClient) {
            this.engine.initBurnerWallet(walletState.burnerWalletClient, walletState.burnerPublicClient);
            this.analyzer.setPublicClient(walletState.burnerPublicClient);
        } else if (walletState.walletInfo) {
            // Browser wallet mode - must also initialize the engine for browser wallet
            await this.engine.initBrowserWallet(chainId);
        }
    }

    dispose() {
        this.disposable?.dispose();
    }

    // --- Output Helpers ---

    private color(text: string, colorCode: string) {
        return `\x1b[${colorCode}m${text}\x1b[0m`;
    }

    private success(text: string) {
        this.term.writeln(this.color(`✓ ${text}`, '1;32')); // Bold Green
    }

    private error(text: string | any) {
        let message = text;
        if (typeof text === 'object') {
            // Extract detailed RPC error
            message = text.reason || text.shortMessage || text.message || "Unknown Error";
            if (text.code) message += ` (Code: ${text.code})`;
        }
        this.term.writeln(this.color(`✖ ${message}`, '1;31')); // Bold Red
        // Log full object for debugging if it's complex
        if (typeof text === 'object') console.error("Full Error:", text);
    }

    private info(text: string) {
        this.term.writeln(this.color(`ℹ ${text}`, '1;36')); // Bold Cyan
    }

    private warn(text: string) {
        this.term.writeln(this.color(`⚠ ${text}`, '1;33')); // Bold Yellow
    }

    private tableRow(col1: string, col2: string, width1: number = 20) {
        this.term.writeln(`  ${col1.padEnd(width1)} ${this.color(col2, '90')}`); // Grey for value
    }

    private separator() {
        this.term.writeln(this.color('  ────────────────────────────────────────', '90'));
    }

    // --- Input Handling ---

    private setupInput() {
        this.disposable = this.term.onData(e => {
            const printable = !e.match(
                /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g
            );

            if (e === '\r') { // Enter
                this.handleEnter();
            } else if (e === '\u007F') { // Backspace
                this.handleBackspace();
            } else if (e === '\u001b[A') { // Up Arrow
                this.navigateHistory(-1);
            } else if (e === '\u001b[B') { // Down Arrow
                this.navigateHistory(1);
            } else if (printable) {
                this.term.write(e);
                this.currentLine += e;
            }
        });
    }

    private handleBackspace() {
        if (this.currentLine.length > 0) {
            this.term.write('\b \b');
            this.currentLine = this.currentLine.substring(0, this.currentLine.length - 1);
        }
    }

    private navigateHistory(direction: number) {
        if (this.history.length === 0) return;

        const newIndex = this.historyIndex + direction;
        if (newIndex >= -1 && newIndex < this.history.length) {
            this.historyIndex = newIndex;

            // Clear current line
            while (this.currentLine.length > 0) {
                this.handleBackspace();
            }

            if (this.historyIndex === -1) {
                this.currentLine = '';
            } else {
                const cmd = this.history[this.history.length - 1 - this.historyIndex];
                this.term.write(cmd);
                this.currentLine = cmd;
            }
        }
    }

    private async handleEnter() {
        this.term.write('\r\n');

        const input = this.currentLine.trim();
        if (input) {
            this.history.push(input);
            this.historyIndex = -1;
            await this.executeCommand(input);
        }

        this.currentLine = '';
        this.prompt();
    }

    private async executeCommand(input: string) {
        // Auto-Address Detection (Paste to Load)
        if (input.match(/^0x[a-fA-F0-9]{40}$/)) {
            this.info(`Detected contract address: ${input}`);
            await this.handleContract(['load', input], {});
            return;
        }

        const { command, args, flags } = this.parser.parse(input);

        try {
            switch (command) {
                case 'help':
                case '?':
                    this.printHelp();
                    break;
                case 'clear':
                case 'cls':
                    this.term.clear();
                    break;
                case 'connect':
                case 'c': // Alias
                    await this.handleConnect();
                    break;
                case 'gas':
                case 'g': // Alias
                    await this.handleGas(args, flags);
                    break;
                case 'contract':
                    await this.handleContract(args, flags);
                    break;
                case 'snipe':
                case 's': // Alias
                    await this.handleSnipe(args, flags);
                    break;
                case 'mint':
                case 'm': // Alias
                    const qty = args[0] || '1';
                    await this.handleSnipe(['start'], { qty });
                    break;
                case 'wallet':
                case 'w': // Alias
                    await this.handleWallet(args);
                    break;
                case 'status':
                case 'st': // Alias
                    await this.handleStatus();
                    break;
                case 'network':
                case 'net':
                case 'n': // Alias
                    await this.handleNetwork(args);
                    break;
                case 'man':
                case 'guide':
                    // User Request: "long explanation in simple words and example"
                    this.handleMan(args);
                    break;
                case 'config':
                    await this.handleConfig(args);
                    break;
                case 'ping':
                case 'p': // Alias
                    await this.handlePing(args);
                    break;
                case 'rpc':
                    this.handleRpc();
                    break;
                default:
                    this.error(`Unknown command: ${command}`);
                    this.term.writeln(this.color('  Type "?" for help.', '90'));
            }
        } catch (error: any) {
            this.error(error.message);
        }
    }

    private handleMan(args: string[]) {
        const guides: Record<string, { title: string, desc: string[], example: string }> = {
            'mint': {
                title: "How to Mint (Quickly)",
                desc: [
                    "This is the fastest way to buy NFTs.",
                    "It tells the bot to immediately send a transaction to the contract.",
                    "Use this when the sale is ALREADY active."
                ],
                example: "mint 2"
            },
            'wallet': {
                title: "Burner Wallet (Advanced)",
                desc: [
                    "Usually, you need to approve every transaction in your browser popup.",
                    "This is slow.",
                    "You can 'import' a private key directly into the bot.",
                    "This makes it 'Permissionless' - no popups, instant signing.",
                    "WARNING: Only use a wallet with small amounts for safety."
                ],
                example: "wallet import 0x123abc..."
            },
            'snipe': {
                title: "Sniping (Automated)",
                desc: [
                    "Use this if you want to start the bot BEFORE the sale flips active.",
                    "It will keep checking the contract status.",
                    "Once it detects the sale is live, it will mint automatically."
                ],
                example: "snipe start"
            },
            'network': {
                title: "Switching Chains",
                desc: [
                    "The bot lives on one chain at a time (like Ethereum or Base).",
                    "You must switch the bot to the same chain as the contract.",
                    "You can use the ID or the name."
                ],
                example: "network switch base"
            },
            'connect': {
                title: "Connecting",
                desc: [
                    "Connects your browser wallet (MetaMask, etc).",
                    "Required to start using the bot."
                ],
                example: "connect"
            }
        };

        const topic = args[0] ? args[0].toLowerCase() : 'all';

        this.term.writeln('');
        this.term.writeln(this.color('  📖 PELZNFT USER MANUAL', '1;37'));
        this.separator();

        const printGuide = (key: string) => {
            const guide = guides[key];
            if (!guide) return;
            this.term.writeln('');
            this.term.writeln(this.color(`  📘 ${guide.title.toUpperCase()}`, '1;36')); // Cyan Header
            this.term.writeln(this.color('  ────────────────', '90'));
            guide.desc.forEach(line => this.term.writeln(`  • ${line}`));
            this.term.writeln('');
            this.term.writeln(`    ${this.color('Example:', '1;33')} ${guide.example}`);
            this.term.writeln('');
        };

        if (topic === 'all') {
            Object.keys(guides).forEach(key => printGuide(key));
            this.term.writeln(this.color('  💡 Tip: scroll up to read everything!', '90'));
        } else {
            if (guides[topic]) {
                printGuide(topic);
            } else {
                this.error(`Topic "${topic}" not found.`);
                this.info('Showing all guides instead...');
                Object.keys(guides).forEach(key => printGuide(key));
            }
        }
        this.term.writeln('');
    }

    private printHelp() {
        this.term.writeln('');
        this.term.writeln(this.color('  ⚡ CHEATSHEET', '1;37'));
        this.separator();

        this.term.writeln(this.color('  MAIN', '1;34'));
        this.tableRow('c, connect', 'Connect Wallet');
        this.tableRow('st, status', 'Show Dashboard');
        this.tableRow('w, wallet', 'import [key] | clear');

        this.term.writeln('');
        this.term.writeln(this.color('  ACTIONS', '1;32'));
        this.tableRow('[addr]', 'Paste Contract Address');
        this.tableRow('m, mint [N]', 'Quick Mint (e.g. "m 2")');
        this.tableRow('s, snipe', 'start -q [N] [-p ETH]');
        this.tableRow('g, gas', 'auto');

        this.term.writeln('');
        this.term.writeln(this.color('  NETWORK', '1;33'));
        this.tableRow('n, network', 'list | switch [name/id]');

        this.term.writeln('');
        this.term.writeln(this.color('  NEED MORE HELP?', '1;35'));
        this.term.writeln('  Type ' + this.color('"guide"', '1;37') + ' to read the full manual.');
        this.term.writeln('');
    }

    private async handleNetwork(args: string[]) {
        const subCmd = args[0];
        if (subCmd === 'list' || subCmd === 'ls' || subCmd === 'l') {
            this.term.writeln('');
            this.term.writeln(this.color('  🌐 NETWORKS', '1;37'));
            this.separator();
            Object.entries(NETWORKS).forEach(([key, net]) => {
                this.tableRow(key, `${net.name} (${net.id})`);
            });
            this.term.writeln('');
        } else if ((subCmd === 'switch' || subCmd === 's') && args[1]) {
            const input = args[1].toLowerCase();
            let targetNetwork: any = NETWORKS[input];

            if (!targetNetwork) {
                const found = Object.values(NETWORKS).find(n =>
                    n.id.toString() === input ||
                    n.name.toLowerCase().includes(input)
                );
                if (found) targetNetwork = found;
            }

            if (!targetNetwork) {
                this.error(`Network "${args[1]}" not found.`);
                return;
            }

            this.info(`Switching to ${targetNetwork.name}...`);
            await useWalletStore.getState().switchNetwork(targetNetwork.id);
            await this.initializeEngines(targetNetwork.id);
            this.success(`Connected: ${targetNetwork.name}`);
        } else {
            this.info('Usage: n switch <name|id>');
        }
    }

    private async handleConnect() {
        this.info('Connecting to wallet...');

        try {
            const info = await useWalletStore.getState().connectBrowserWallet();
            await this.initializeEngines(info.chainId);

            this.success(`Connected: ${info.address}`);
            this.info(`Chain ID: ${info.chainId}`);
        } catch (e: any) {
            throw new Error(e.message || 'Failed to connect wallet');
        }
    }

    private async handleContract(args: string[], flags: any) {
        if (args[0] === 'load' && args[1]) {
            const walletInfo = useWalletStore.getState().walletInfo;
            if (!walletInfo) {
                throw new Error("Connect wallet first");
            }

            this.info(`Analyzing contract ${args[1]}...`);

            const funcOverride = flags.func || flags.f;
            const platformOverride = flags.platform || flags.p;

            if (funcOverride) this.info(`Using manual mint function: ${funcOverride}`);
            if (platformOverride) this.info(`Forcing platform: ${platformOverride}`);

            // Initialize platform modules if not already done
            initializePlatformModules(walletInfo.chainId);
            const platformManager = getPlatformManager(walletInfo.chainId);

            // Analyze with platform detection
            const platformInfo = await platformManager.analyze(args[1], platformOverride);
            this.platformContract = platformInfo;

            // Also store as generic contract for backward compatibility
            this.currentContract = {
                address: platformInfo.address,
                abi: [] as readonly string[],
                name: platformInfo.name,
                chainId: platformInfo.chainId,
                mintFunction: platformInfo.mintFunction,
                mintPrice: platformInfo.mintPrice,
                isActive: platformInfo.isActive,
                maxSupply: Number(platformInfo.maxSupply || 0),
                currentSupply: Number(platformInfo.totalSupply || 0),
                requiresAllowlist: false,
                maxPerWallet: platformInfo.maxPerWallet,
            };

            this.term.writeln('');
            this.term.writeln(this.color('  🎯 TARGET ACQUIRED', '1;32'));
            this.separator();
            this.tableRow('Name', platformInfo.name || 'Unknown');
            this.tableRow('Address', platformInfo.address);
            this.tableRow('Platform', platformInfo.platform.toUpperCase());
            this.tableRow('Token', platformInfo.tokenStandard);
            this.tableRow('Chain ID', platformInfo.chainId.toString());
            this.tableRow('Mint Func', platformInfo.mintFunction);

            // Format Price Smartly
            const priceEth = Number(formatEther(platformInfo.mintPrice));
            const priceStr = priceEth < 0.0001 && priceEth > 0
                ? `${formatUnits(platformInfo.mintPrice, 9)} Gwei`
                : `${formatEther(platformInfo.mintPrice)} ETH`;

            this.tableRow('Price', priceStr);

            // Show platform-specific fees
            if (platformInfo.protocolFee > BigInt(0)) {
                const feeStr = formatEther(platformInfo.protocolFee);
                this.tableRow('Protocol Fee', `${feeStr} ETH`);
            }

            // Show total value for 1 token
            const totalFor1 = platformInfo.getTotalValue(1);
            if (totalFor1 !== platformInfo.mintPrice) {
                this.tableRow('Total (1 NFT)', `${formatEther(totalFor1)} ETH`);
            }

            // Show mint status
            this.tableRow('Active', platformInfo.isActive ? '✅ Yes' : '❌ No');

            // Show router contract if using singleton pattern (SeaDrop)
            if (platformInfo.routerContract) {
                this.tableRow('Router', platformInfo.routerContract.slice(0, 12) + '...');
            }

            this.separator();
            this.term.writeln('');

        } else {
            this.info('Usage: contract load [address] (--platform [name]) (--func [name])');
            this.info('Platforms: nfts2me, opensea, magiceden, generic');
        }
    }

    private async handleSnipe(args: string[], flags: any) {
        if (args[0] === 'start') {
            if (!this.currentContract || !this.engine) throw new Error("No contract loaded or wallet connected");

            const walletInfo = useWalletStore.getState().walletInfo;
            if (walletInfo && walletInfo.chainId !== this.currentContract.chainId) {
                this.error(`Chain Mismatch!`);
                this.term.writeln(`  Target: ${this.currentContract.chainId}`);
                this.term.writeln(`  Wallet: ${walletInfo.chainId}`);
                this.warn(`Switch networks using 'network switch <name>'`);
                return;
            }

            const qty = flags.qty ? Number(flags.qty) : 1;
            const turbo = flags.turbo || flags.t ? true : false;
            const noWait = flags.nowait || flags.nw ? true : false;

            if (turbo) {
                this.term.writeln(this.color('  ⚡ TURBO MODE ENABLED', '1;33'));
                this.term.writeln(this.color('  • Skipping simulation', '90'));
                this.term.writeln(this.color('  • 10x Priority Fee', '90'));
            }

            // Calculate value using platform-specific logic if available
            let priceOverride: bigint | undefined;
            if (flags.price || flags.p) {
                try {
                    priceOverride = parseEther(flags.price || flags.p);
                    this.info(`Overriding price: ${flags.price || flags.p} ETH`);
                } catch {
                    throw new Error("Invalid price format. Use ETH (e.g. 0.05)");
                }
            } else if (this.platformContract) {
                // Use platform-specific value calculation (includes fees)
                const platformValue = this.platformContract.getTotalValue(qty);
                if (platformValue !== this.currentContract.mintPrice * BigInt(qty)) {
                    this.info(`Platform fee detected: Total = ${formatEther(platformValue)} ETH`);
                    priceOverride = platformValue / BigInt(qty);
                }
            }

            this.info(`Preparing snipe for ${qty} tokens...`);

            const gasSettings = await this.engine.getGasPrice(turbo);
            const preparedTx = await this.engine.prepareTransaction(this.currentContract, qty, gasSettings, priceOverride, turbo);

            // DEBUG: Show user what we are sending
            this.term.writeln(this.color('  🔍 DEBUG PAYLOAD:', '90'));
            this.term.writeln(this.color(`  • Platform: ${this.platformContract?.platform || 'generic'}`, '90'));
            this.term.writeln(this.color(`  • Function: ${this.currentContract.mintFunction}`, '90'));
            this.term.writeln(this.color(`  • Data: ${preparedTx.data.substring(0, 50)}...`, '90'));
            this.term.writeln(this.color(`  • Value: ${formatEther(preparedTx.value || BigInt(0))} ETH`, '90'));
            this.term.writeln(this.color(`  • Gas: ${preparedTx.gas?.toString() || 'Auto'}`, '90'));
            this.term.writeln(this.color(`  • Priority: ${formatUnits(gasSettings.maxPriorityFeePerGas, 9)} gwei`, '90'));

            this.term.writeln(this.color(`  ⚡ EXECUTING TRANSACTION...`, '1;33'));
            const txHash = await this.engine.execute();
            this.success(`Transaction Hash: ${txHash}`);

            // Fire-and-forget mode: Don't wait for receipt
            if (noWait || turbo) {
                this.info('Transaction sent! Not waiting for confirmation (speed mode).');
                return;
            }

            // Wait for confirmation to detect reverts
            this.term.writeln(this.color('  ⏳ Waiting for confirmation...', '90'));
            try {
                const receipt = await this.engine.waitForReceipt(txHash);
                if (receipt && receipt.status === 'success') {
                    this.success(`Confirmed! (Block ${receipt.blockNumber})`);
                } else {
                    this.error(`Transaction Reverted On-Chain!`);
                    this.warn(`Check Etherscan: ${txHash}`);
                }
            } catch (e: any) {
                this.error(`Transaction Failed: ${e.message}`);
            }

        } else if (args[0] === 'monitor') {
            await this.handleMonitor(flags);
        } else if (args[0] === 'stop') {
            this.stopMonitor();
        } else {
            this.info('Usage: snipe start --qty [N] [--price 0.01]');
            this.info('       snipe monitor [--qty N] [--interval 2]');
            this.info('       snipe stop');
        }
    }

    private async handleMonitor(flags: any) {
        if (!this.currentContract || !this.engine) {
            throw new Error("No contract loaded or wallet connected");
        }

        if (this.isMonitoring) {
            this.warn('Already monitoring. Use "snipe stop" to cancel.');
            return;
        }

        const walletInfo = useWalletStore.getState().walletInfo;
        if (walletInfo && walletInfo.chainId !== this.currentContract.chainId) {
            this.error(`Chain Mismatch!`);
            this.term.writeln(`  Target: ${this.currentContract.chainId}`);
            this.term.writeln(`  Wallet: ${walletInfo.chainId}`);
            this.warn(`Switch networks using 'network switch <name>'`);
            return;
        }

        const qty = flags.qty ? Number(flags.qty) : 1;
        const intervalSec = flags.interval ? Number(flags.interval) : 2;

        this.isMonitoring = true;
        this.term.writeln('');
        this.term.writeln(this.color('  🕵️  MONITOR MODE ACTIVE', '1;33'));
        this.separator();
        this.term.writeln(`  Target:   ${this.currentContract.address}`);
        this.term.writeln(`  Quantity: ${qty}`);
        this.term.writeln(`  Interval: ${intervalSec}s`);
        this.term.writeln(this.color('  Waiting for sale to go active...', '90'));
        this.term.writeln(this.color('  Type "snipe stop" to cancel.', '90'));
        this.term.writeln('');

        let checkCount = 0;

        this.monitorIntervalId = setInterval(async () => {
            if (!this.isMonitoring) {
                this.stopMonitor();
                return;
            }

            checkCount++;
            this.term.write(`\r  ⏳ Checking... (${checkCount})`);

            try {
                // Re-analyze to get fresh isActive status
                const freshInfo = await this.analyzer!.analyze(this.currentContract!.address);

                if (freshInfo.isActive) {
                    this.stopMonitor();
                    this.term.writeln('');
                    this.success('🚨 SALE IS ACTIVE! Executing snipe...');

                    // Trigger the snipe
                    await this.handleSnipe(['start'], { qty: qty.toString() });
                }
            } catch (e: any) {
                // Don't stop on individual check failures
                this.term.write(`\r  ⚠️ Check failed: ${e.message.substring(0, 30)}...`);
            }
        }, intervalSec * 1000);
    }

    private stopMonitor() {
        if (this.monitorIntervalId) {
            clearInterval(this.monitorIntervalId);
            this.monitorIntervalId = null;
        }
        if (this.isMonitoring) {
            this.isMonitoring = false;
            this.term.writeln('');
            this.info('Monitor stopped.');
        }
    }

    private async handleGas(args: string[], _flags: any) {
        if (args[0] === 'auto') {
            if (!this.engine) throw new Error("Connect wallet first");
            const prices = await this.engine.getGasPrice();
            this.term.writeln('');
            this.term.writeln(this.color('  ⛽ GAS STATION', '1;37'));
            this.separator();
            this.tableRow('Strategy', 'AUTO (EIP-1559)');
            this.tableRow('Max Fee', `${formatUnits(prices.maxFeePerGas || BigInt(0), 9)} gwei`);
            this.tableRow('Priority', `${formatUnits(prices.maxPriorityFeePerGas || BigInt(0), 9)} gwei`);
            this.term.writeln('');
        } else {
            this.info('Usage: gas auto');
        }
    }

    private async handleStatus() {
        const wallet = useWalletStore.getState().walletInfo;

        this.term.writeln('');
        this.term.writeln(this.color('  🖥️  SYSTEM STATUS', '1;37'));
        this.separator();
        this.tableRow('System', 'ONLINE');

        if (wallet) {
            this.tableRow('Wallet', wallet.address.substring(0, 10) + '...');
            this.tableRow('Chain ID', wallet.chainId.toString());
            this.tableRow('Balance', `${Number(wallet.balance).toFixed(4)} ETH`);
            if (wallet.isBurner) {
                this.tableRow('Mode', this.color('BURNER (FAST)', '1;31'));
            } else {
                this.tableRow('Mode', 'Browser (Safe)');
            }
        } else {
            this.tableRow('Wallet', this.color('DISCONNECTED', '31'));
        }

        if (this.currentContract) {
            this.separator();
            this.tableRow('Target', this.currentContract.address.substring(0, 10) + '...');
            this.tableRow('Func', this.currentContract.mintFunction);
        } else {
            this.separator();
            this.tableRow('Target', this.color('NONE', '90'));
        }
        this.term.writeln('');
    }

    printWelcome() {
        this.term.writeln(this.color('  ____       _       _   _ ______ _______ ', '1;32'));
        this.term.writeln(this.color(' |  _ \\     | |     | \\ | |  ____|__   __|', '1;32'));
        this.term.writeln(this.color(' | |_) | ___| | __ _|  \\| | |__     | |   ', '1;32'));
        this.term.writeln(this.color(' |  __/ / _ \\ |/_  /| . ` |  __|    | |   ', '1;32'));
        this.term.writeln(this.color(' | |   |  __/ | / / | |\\  | |       | |   ', '1;32'));
        this.term.writeln(this.color(' |_|    \\___|_|/___| |_| \\_|_|       |_|   ', '1;32'));
        this.term.writeln('');
        this.term.writeln('  v1.2.0 | High-Frequency Minting Engine');
        this.term.writeln('  Prepared for: ' + this.color('User', '1;37'));
        this.term.writeln('');
        this.term.writeln('  Type ' + this.color('help', '1;36') + ' to initialize.');
        this.prompt();
    }

    prompt() {
        this.term.write(this.promptString);
    }

    write(text: string) {
        this.term.write(text);
    }

    writeln(text: string) {
        this.term.writeln(text);
    }
    private async handleWallet(args: string[]) {
        const subCmd = args[0];
        const walletStore = useWalletStore.getState();

        if (subCmd === 'import' && args[1]) {
            this.warn('Importing PRIVATE KEY... (Ensure you trust this device)');
            try {
                const info = await walletStore.importBurnerWallet(args[1]);
                await this.initializeEngines(info.chainId);
                this.success(`Burner Wallet Active: ${info.address}`);
                this.info("Mode: Permissionless (No Popups)");
            } catch (e: any) {
                this.error(e.message);
            }
        } else if (subCmd === 'new' || subCmd === 'create') {
            this.warn('Generating NEW Burner Wallet...');
            try {
                // Determine current chain ID or default to 1 (Mainnet)
                const currentChainId = walletStore.walletInfo?.chainId || 1;

                const { address, privateKey, info } = await walletStore.generateBurnerWallet(currentChainId);
                await this.initializeEngines(info.chainId);

                this.term.writeln('');
                this.term.writeln(this.color('  🔐 SECRET GENERATED', '1;33'));
                this.separator();
                this.term.writeln('  Address:     ' + this.color(address, '1;32'));
                this.term.writeln('  Private Key: ' + this.color(privateKey, '1;31'));
                this.term.writeln('');
                this.warn('  ⚠️  SAVE THIS PRIVATE KEY NOW! IT WILL NOT BE SHOWN AGAIN.');
                this.warn('  ⚠️  YOU MUST FUND THIS WALLET WITH ETH TO USE IT.');
                this.term.writeln('');
                this.success(`Burner Session Active: ${address}`);

            } catch (e: any) {
                this.error("Failed to generate wallet: " + e.message);
            }
        } else if (subCmd === 'clear') {
            walletStore.disconnect();
            this.analyzer = null;
            this.engine = null;
            this.success('Wallet cleared. Returning to Browser Mode.');
        } else {
            this.info('Usage: wallet [new | import <key> | clear]');
        }
    }

    private async handleConfig(args: string[]) {
        const subCmd = args[0];

        // Import provider storage functions
        const {
            addProvider, removeProvider, setActiveProvider, getActiveProvider,
            getStoredProviders, getSupportedProviders
        } = await import('../config/providerStorage');

        // === CONFIG ADD ===
        if (subCmd === 'add') {
            const providerName = args[1]?.toLowerCase();

            if (!providerName || !getSupportedProviders().includes(providerName)) {
                this.info('Usage: config add <provider> <key>');
                this.info('       config add quicknode <endpoint> <token>');
                this.info('');
                this.info('Providers: alchemy, infura, ankr, quicknode');
                return;
            }

            if (providerName === 'quicknode') {
                const endpoint = args[2];
                const token = args[3];
                if (!endpoint || !token) {
                    this.error('Usage: config add quicknode <endpoint> <token>');
                    this.info('Example: config add quicknode twilight-smart-owl 365b3c...');
                    return;
                }
                addProvider('quicknode', { endpoint, token });
                this.success(`QuickNode added! ⚡`);
                this.info(`Endpoint: ${endpoint}.quiknode.pro`);
            } else {
                const key = args[2];
                if (!key) {
                    this.error(`Usage: config add ${providerName} <key>`);
                    return;
                }
                addProvider(providerName, { key });
                this.success(`${providerName.toUpperCase()} added! ⚡`);
            }

            // Auto-activate if first provider
            if (!getActiveProvider()) {
                setActiveProvider(providerName);
                this.info(`Set as active provider.`);
            } else {
                this.info(`Use "config use ${providerName}" to activate.`);
            }
            return;
        }

        // === CONFIG USE ===
        if (subCmd === 'use') {
            const providerName = args[1]?.toLowerCase();

            if (!providerName) {
                this.info('Usage: config use <provider>');
                this.info(`Active: ${getActiveProvider() || 'none'}`);
                return;
            }

            if (providerName === 'public' || providerName === 'none') {
                setActiveProvider('');
                this.success('Switched to public RPCs.');
                const { walletInfo } = useWalletStore.getState();
                if (walletInfo) await this.initializeEngines(walletInfo.chainId);
                return;
            }

            if (setActiveProvider(providerName)) {
                this.success(`Switched to ${providerName.toUpperCase()}! ⚡`);
                this.info('Re-connecting to apply changes...');
                const { walletInfo } = useWalletStore.getState();
                if (walletInfo) await this.initializeEngines(walletInfo.chainId);
            } else {
                this.error(`Provider "${providerName}" not found.`);
                this.info('Use "config list" to see stored providers.');
            }
            return;
        }

        // === CONFIG LIST ===
        if (subCmd === 'list') {
            const providers = getStoredProviders();
            const active = getActiveProvider();
            const providerNames = Object.keys(providers);

            this.term.writeln('');
            this.term.writeln(this.color('  STORED PROVIDERS', '1;36'));
            this.separator();

            if (providerNames.length === 0) {
                this.term.writeln('  No providers stored.');
                this.info('Use "config add <provider> <key>" to add one.');
            } else {
                for (const name of providerNames) {
                    const config = providers[name as keyof typeof providers];
                    const isActive = name === active;
                    const marker = isActive ? this.color('*', '32') : ' ';

                    let display = '';
                    if (name === 'quicknode' && config?.endpoint) {
                        display = config.endpoint;
                    } else if (config?.key) {
                        display = `${config.key.substring(0, 6)}...${config.key.slice(-4)}`;
                    }

                    const line = `  ${marker} ${name.padEnd(12)} ${display}`;
                    this.term.writeln(isActive ? this.color(line, '32') : line);
                }
            }

            this.term.writeln('');
            if (active) {
                this.info(`Active: ${active.toUpperCase()}`);
            } else {
                this.info('Active: Public RPCs');
            }
            this.term.writeln('');
            return;
        }

        // === CONFIG REMOVE ===
        if (subCmd === 'remove') {
            const providerName = args[1]?.toLowerCase();

            if (!providerName) {
                this.info('Usage: config remove <provider>');
                return;
            }

            if (removeProvider(providerName)) {
                this.success(`${providerName.toUpperCase()} removed.`);
            } else {
                this.error(`Provider "${providerName}" not found.`);
            }
            return;
        }

        // === CONFIG PROVIDER (legacy) ===
        if (subCmd === 'provider') {
            const providerName = args[1]?.toLowerCase();
            const key = args[2];

            if (!providerName) {
                this.info('Legacy command. Use new syntax:');
                this.info('  config add <provider> <key>');
                this.info('  config use <provider>');
                this.info('  config list');
                return;
            }

            if (providerName === 'clear') {
                setActiveProvider('');
                this.success('Switched to public RPCs.');
                return;
            }

            // Handle as add + use
            if (providerName === 'quicknode') {
                const endpoint = args[2];
                const token = args[3];
                if (endpoint && token) {
                    addProvider('quicknode', { endpoint, token });
                    setActiveProvider('quicknode');
                    this.success('QuickNode configured! ⚡');
                    const { walletInfo } = useWalletStore.getState();
                    if (walletInfo) await this.initializeEngines(walletInfo.chainId);
                    return;
                }
            } else if (key) {
                addProvider(providerName, { key });
                setActiveProvider(providerName);
                this.success(`${providerName.toUpperCase()} configured! ⚡`);
                const { walletInfo } = useWalletStore.getState();
                if (walletInfo) await this.initializeEngines(walletInfo.chainId);
                return;
            }

            this.error('Missing credentials.');
            return;
        }

        // === CONFIG ALCHEMY (legacy shortcut) ===
        if (subCmd === 'alchemy') {
            await this.handleConfig(['provider', 'alchemy', args[1] || '']);
            return;
        }

        // === CONFIG RPC (custom per-chain) ===
        if (subCmd === 'rpc') {
            const url = args[1];
            const { walletInfo } = useWalletStore.getState();
            const currentChainId = walletInfo?.chainId || 1;

            if (!url) {
                const customRpc = localStorage.getItem(`pelz_custom_rpc_${currentChainId}`);
                this.info('Usage: config rpc <url>     Set custom RPC for current chain');
                this.info('       config rpc clear     Remove custom RPC');
                this.term.writeln('');
                if (customRpc) {
                    this.tableRow('Chain ID', currentChainId.toString(), 15);
                    this.tableRow('Custom RPC', customRpc.length > 40 ? customRpc.substring(0, 40) + '...' : customRpc, 15);
                } else {
                    this.term.writeln('  No custom RPC set for this chain.');
                }
                this.term.writeln('');
                return;
            }

            if (url === 'clear') {
                localStorage.removeItem(`pelz_custom_rpc_${currentChainId}`);
                this.success(`Custom RPC cleared for chain ${currentChainId}. Using default provider.`);
            } else {
                if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('wss://')) {
                    this.error('Invalid URL. Must start with http://, https://, or wss://');
                    return;
                }

                localStorage.setItem(`pelz_custom_rpc_${currentChainId}`, url);
                this.success(`Custom RPC saved for chain ${currentChainId}! ⚡`);
                this.info(`Endpoint: ${url.length > 50 ? url.substring(0, 50) + '...' : url}`);
                this.info('Re-connecting to apply changes...');

                if (walletInfo) {
                    await this.initializeEngines(currentChainId);
                }
            }
            return;
        }

        // === DEFAULT HELP ===
        this.info('Config commands:');
        this.info('  config add <provider> <key>    Add a provider');
        this.info('  config use <provider>          Set active provider');
        this.info('  config list                    Show stored providers');
        this.info('  config remove <provider>       Remove a provider');
        this.info('  config rpc <url>               Set custom RPC for chain');
    }

    private async handleRpc() {
        const { getActiveProvider, getProviderConfig } = await import('../config/providerStorage');
        const { buildProviderUrls } = await import('../config/transport');

        const { walletInfo } = useWalletStore.getState();
        const currentChainId = walletInfo?.chainId || 1;
        const customRpc = localStorage.getItem(`pelz_custom_rpc_${currentChainId}`);
        const activeProvider = getActiveProvider();

        this.term.writeln('');
        this.term.writeln(this.color('  ⚡ RPC STATUS', '1;36'));
        this.separator();

        // Check custom RPC first
        if (customRpc) {
            this.tableRow('Provider', 'Custom RPC', 15);
            this.tableRow('Mode', 'Custom', 15);
            const hostname = customRpc.replace(/^(wss?|https?):\/\//, '').split('/')[0];
            this.tableRow('Endpoint', hostname.length > 30 ? hostname.substring(0, 30) + '...' : hostname, 15);
        } else if (activeProvider) {
            const config = getProviderConfig(activeProvider);
            this.tableRow('Provider', activeProvider.toUpperCase(), 15);

            if (activeProvider === 'quicknode' && config?.endpoint) {
                this.tableRow('Endpoint', config.endpoint, 15);
            } else if (config?.key) {
                this.tableRow('API Key', `${config.key.substring(0, 6)}...${config.key.slice(-4)}`, 15);
            }

            this.tableRow('Mode', 'Premium (Fast)', 15);

            // Show URL for current chain
            const urls = buildProviderUrls(activeProvider, currentChainId);
            if (urls.http) {
                const hostname = urls.http.replace(/^https?:\/\//, '').split('/')[0];
                this.tableRow('URL', hostname.length > 30 ? hostname.substring(0, 30) + '...' : hostname, 15);
            } else {
                this.tableRow('URL', '(chain not supported)', 15);
            }
        } else {
            this.tableRow('Provider', 'Public RPC', 15);
            this.tableRow('Mode', 'Free (Slower)', 15);

            const networks = Object.values(NETWORKS);
            const network = networks.find((n: NetworkConfig) => n.id === currentChainId);
            if (network) {
                this.tableRow('Endpoint', new URL(network.rpc).hostname, 15);
            }
        }

        this.tableRow('Chain ID', currentChainId.toString(), 15);
        this.term.writeln('');
        this.term.writeln(this.color('  Tip: "config list" to see providers, "ping benchmark" for latency.', '90'));
        this.term.writeln('');
    }

    private async handlePing(args: string[]) {
        const { getActiveProvider } = await import('../config/providerStorage');
        const { buildProviderUrls } = await import('../config/transport');

        const { walletInfo } = useWalletStore.getState();
        const currentChainId = walletInfo?.chainId || 1;

        // === PING BENCHMARK ===
        if (args[0] === 'benchmark' || args[0] === 'matrix') {
            await this.handlePingBenchmark();
            return;
        }

        // Determine URL to test
        let testUrl: string | undefined;

        if (args[0] && args[0].startsWith('http')) {
            // Direct URL provided
            testUrl = args[0];
        } else {
            // Check custom RPC first
            const customRpc = localStorage.getItem(`pelz_custom_rpc_${currentChainId}`);
            if (customRpc) {
                testUrl = customRpc.startsWith('wss://') ? customRpc.replace('wss://', 'https://') : customRpc;
            } else {
                // Use active provider
                const activeProvider = getActiveProvider();
                if (activeProvider) {
                    const urls = buildProviderUrls(activeProvider, currentChainId);
                    testUrl = urls.http;
                }
            }

            // Fallback to public RPC
            if (!testUrl) {
                const networks = Object.values(NETWORKS);
                const network = networks.find((n: NetworkConfig) => n.id === currentChainId);
                testUrl = network?.rpc;
            }
        }

        if (!testUrl) {
            this.error('No RPC URL available to test.');
            this.info('Use "config add <provider> <key>" to add one.');
            return;
        }

        this.info(`Testing latency to: ${testUrl.split('/')[2]}...`);
        this.term.writeln('');

        try {
            const stats = await pingMultiple(testUrl, 5);

            if (stats.failures === stats.total) {
                this.error('All pings failed. Check your connection or API key.');
                return;
            }

            const color = getLatencyColor(stats.avg);
            const colorCode = color === 'green' ? '32' : color === 'yellow' ? '33' : '31';

            this.term.writeln(this.color('  LATENCY TEST RESULTS', '1;36'));
            this.separator();
            this.tableRow('Average', `${stats.avg}ms`, 15);
            this.tableRow('Min', `${stats.min}ms`, 15);
            this.tableRow('Max', `${stats.max}ms`, 15);
            this.tableRow('Successful', `${stats.total - stats.failures}/${stats.total}`, 15);
            this.term.writeln('');
            this.term.writeln(this.color(`  Status: ${color === 'green' ? '🟢 Excellent' : color === 'yellow' ? '🟡 Acceptable' : '🔴 Slow'}`, colorCode));
            this.term.writeln('');
        } catch (e: any) {
            this.error(`Ping failed: ${e.message}`);
        }
    }

    private async handlePingBenchmark() {
        const { getStoredProviders } = await import('../config/providerStorage');
        const { buildProviderUrls } = await import('../config/transport');

        const providers = getStoredProviders();
        const providerNames = Object.keys(providers);

        if (providerNames.length === 0) {
            this.error('No providers stored.');
            this.info('Use "config add <provider> <key>" to add providers first.');
            return;
        }

        // Import NETWORKS
        const { NETWORKS } = await import('../config/networks');

        // Test all configured networks (excluding testnets)
        const testChains = Object.values(NETWORKS).filter(n => !n.name.toLowerCase().includes('sepolia'));

        this.term.writeln('');
        this.term.writeln(this.color('  LATENCY BENCHMARK', '1;36'));
        this.info(`Testing ${providerNames.length} provider(s) across ${testChains.length} chains...`);
        this.term.writeln('');

        // Build header
        const colWidth = 12;
        let header = '  Chain'.padEnd(14);
        for (const name of providerNames) {
            header += name.substring(0, colWidth - 1).padEnd(colWidth);
        }
        this.term.writeln(this.color(header, '1;37'));
        this.separator();

        // Results matrix
        const results: Record<string, Record<number, number | null>> = {};
        for (const name of providerNames) {
            results[name] = {};
        }

        // Test each chain
        for (const chain of testChains) {
            // Clean up name
            let displayName = chain.name
                .replace(' Mainnet', '')
                .replace(' One', '')
                .replace(' EVM', '');

            // Prepare promises
            const tests = providerNames.map(async (name) => {
                const urls = buildProviderUrls(name, chain.id);
                if (!urls.http) return { name, latency: null, status: 'N/A' };

                try {
                    const start = performance.now();
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

                    const response = await fetch(urls.http, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        return { name, latency: null, status: `${response.status}` };
                    }

                    const latency = Math.round(performance.now() - start);
                    return { name, latency, status: `${latency}ms` };
                } catch (e: any) {
                    const isDns = e.message.includes('Failed to fetch') || e.cause?.code === 'ENOTFOUND';
                    return { name, latency: null, status: isDns ? 'DNS' : 'ERR' };
                }
            });

            const currentChainResults = await Promise.all(tests);

            // Find fastest (valid latency only)
            const validResults = currentChainResults.filter(r => r.latency !== null) as { name: string, latency: number }[];
            const fastest = validResults.sort((a, b) => a.latency - b.latency)[0];

            // Build Row
            let row = `  ${displayName}`.padEnd(14);

            for (const result of currentChainResults) {
                // Update the outer results matrix
                results[result.name][chain.id] = result.latency;

                const isFastest = fastest && result.name === fastest.name;
                const cellText = result.status;
                let coloredCell = cellText;

                if (result.latency !== null) {
                    // Latency colors
                    const color = result.latency < 100 ? '32' : result.latency < 250 ? '33' : '31';
                    coloredCell = this.color(cellText.padEnd(colWidth), color);
                } else {
                    // Error colors
                    coloredCell = this.color(cellText.padEnd(colWidth), result.status === 'N/A' ? '90' : '31');
                }

                // Add bolt if fastest
                if (isFastest) {
                    coloredCell = this.color(`${cellText} ⚡`.padEnd(colWidth), '32');
                }

                row += coloredCell;
            }

            this.term.writeln(row);
        }

        this.term.writeln('');
        this.term.writeln(this.color('  ⚡ = Fastest   🟢 <100ms   🟡 100-250ms   🔴 >250ms', '90'));
        this.term.writeln('');
    }
}
