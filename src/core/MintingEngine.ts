import { ethers, type TransactionRequest } from 'ethers';
import type { ContractInfo } from './ContractAnalyzer';

export class MintingEngine {
    private provider: ethers.Provider;
    private signer: ethers.Signer;
    private preparedTx: TransactionRequest | null = null;

    constructor(provider: ethers.Provider, signer: ethers.Signer) {
        this.provider = provider;
        this.signer = signer;
    }

    async prepareTransaction(contract: ContractInfo, quantity: number, gasSettings: any, priceOverride?: bigint) {
        console.log(`Preparing Tx: Func=${contract.mintFunction}, Qty=${quantity}`);
        const iface = new ethers.Interface(contract.abi);

        // Log ABI to ensure we have the function
        const fragment = iface.getFunction(contract.mintFunction);
        console.log(`Function Fragment: ${fragment ? fragment.format() : 'NOT FOUND'}`);

        const data = iface.encodeFunctionData(contract.mintFunction, [quantity]);
        console.log(`Generated Calldata: ${data}`);

        // Use override if provided, otherwise contract detected price
        const pricePerToken = priceOverride !== undefined ? priceOverride : contract.mintPrice;
        const value = pricePerToken * BigInt(quantity);

        this.preparedTx = {
            to: contract.address,
            data,
            value,
            maxFeePerGas: gasSettings.maxFeePerGas,
            maxPriorityFeePerGas: gasSettings.maxPriorityFeePerGas,
        };

        // --- SIMULATION (User Request) ---
        console.log("🔍 Simulating transaction...");
        try {
            // We use call() or callStatic equivalent in v6
            // We can just use the provider to call it
            await this.provider.call({
                ...this.preparedTx,
                from: await this.signer.getAddress()
            });
            console.log("✅ Simulation Successful");
        } catch (e: any) {
            console.error("❌ Simulation Failed:", e);
            let reason = "Unknown";

            // Check for specific Ethers errors
            if (e.code === 'CALL_EXCEPTION') {
                reason = "Execution Reverted (Possible reasons: Wrong function name, Paused, or Limits)";
                if (e.revert) reason = `Revert: ${e.revert.name} (${e.revert.args})`;
            } else if (e.reason) {
                reason = e.reason;
            }

            // Try parsing custom error data
            if (e.data) {
                try { reason = iface.parseError(e.data)?.name || reason; } catch { }
            }
            throw new Error(`Simulation Failed: ${reason}`);
        }

        // Eliminate gas estimation latency by using fixed high limit if needed
        // But safely we can estimate now
        try {
            const est = await this.provider.estimateGas({
                ...this.preparedTx,
                from: await this.signer.getAddress()
            });
            this.preparedTx.gasLimit = (est * BigInt(120)) / BigInt(100); // 20% buffer
        } catch (e) {
            console.warn("Gas estimation failed, using default high limit");
            this.preparedTx.gasLimit = BigInt(300000);
        }

        return this.preparedTx;
    }

    async execute(): Promise<ethers.TransactionResponse> {
        if (!this.preparedTx) throw new Error("No transaction prepared");
        try {
            console.log("Executing tx:", this.preparedTx);
            return await this.signer.sendTransaction(this.preparedTx);
        } catch (e: any) {
            console.error("Mint execution failed:", e);
            // Throw cleaner error if possible
            if (e.reason) throw new Error(`Revert: ${e.reason}`);
            if (e.code === 'INSUFFICIENT_FUNDS') throw new Error("Insufficient Funds for Gas/Price");
            throw e;
        }
    }

    async startMinting(contract: ContractInfo) {
        // Simple immediate execution for now, to be expanded with monitoring
        // Get standard gas
        const feeData = await this.provider.getFeeData();
        await this.prepareTransaction(contract, 1, {
            maxFeePerGas: feeData.maxFeePerGas,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
        });
        return await this.execute();
    }
}
