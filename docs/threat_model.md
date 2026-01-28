# PelzNFT Sniper Bot - Threat Model

## 1. Trust Boundaries
- **User/Browser**: The execution environment. Trusted to hold session wallet connection.
- **RPC Provider**: Full nodes (Alchemy/Infura/Flashbots). Trusted to broadcast transactions and provide state.
- **Etherum Network**: The ultimate arbiter of state.
- **Target Contract**: Untrusted/Semi-trusted. We interact with it but must handle malicious or unexpected responses.

## 2. Critical Assets
- **Wallet Connection**: We utilize `window.ethereum`.
    - *Risk*: Malicious site trying to hijack the connection.
    - *Mitigation*: We are a local/client-side app. No server-side relay of keys.
- **Private Keys**:
    - *Risk*: Exposure.
    - *Mitigation*: **WE NEVER TOUCH PRIVATE KEYS.** Use provider/signer pattern only.
- **User Funds (ETH)**:
    - *Risk*: Accidentally sending too much ETH or gas.
    - *Mitigation*: Show confirmation prompts for high values. Simulate transactions if possible.
- **Strategy Data**:
    - *Risk*: Leaking user's snipe target to others.
    - *Mitigation*: All checks are client-side. No backend server logging user targets.

## 3. Threat Scenarios
### A. Malicious Extension
- **Attack**: A compromised browser extension intercepts the transaction request.
- **Mitigation**: User must verify transaction in their wallet popup (MetaMask) before signing. We cannot bypass this.

### B. Front-Running / Sandwich Attacks
- **Attack**: MEV bots see our pending tx and sandwich it.
- **Mitigation**: Use Flashbots Protect RPC to route via private mempool.

### C. Fake Contract
- **Attack**: User inputs wrong contract address (honeypot).
- **Mitigation**: Contract analysis step to show "Verified" status (via Etherscan API check) and display contract name/ticker clearly.

### D. Gas Spike
- **Attack**: Network congestion spikes gas during mint, draining user funds if not capped.
- **Mitigation**: User defines `maxFeePerGas`. We respect it strictly.

## 4. Security Checklist
- [ ] No `privateKey` variable ever defined in code.
- [ ] Dependencies audited (`npm audit`).
- [ ] Content Security Policy (CSP) headers (if web deploy).
- [ ] Clear UI warnings before "Start Snipe".
