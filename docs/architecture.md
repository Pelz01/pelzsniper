# Architecture & ADRs

## ADR 001: Terminal-First UI
- **Decision**: Use `xterm.js` as the primary interface.
- **Context**: Users need speed. Mouse navigation is slow.
- **Consequences**:
    - Learning curve for non-technical users.
    - Need robust command parsing and help system.
    - simplified visual styling (focus on text).

## ADR 002: Wallet Management via Injected Provider
- **Decision**: Support only `window.ethereum` (injected wallets) and WalletConnect.
- **Context**: Security is paramount. We do not want to manage keystores.
- **Consequences**:
    - Cannot "auto-sign" without user confirmation unless they use an unlocked local node or specialized wallet settings.
    - Slightly slower than raw private key signing, but significantly safer.

## ADR 003: Client-Side Only
- **Decision**: No backend server. Direct calls to RPCs.
- **Context**: Privacy and simplicity.
- **Consequences**:
    - API Keys for Etherscan/Infura must be handled carefully (user provided or public keys with rate limits).
    - No centralized analytics.

## System Components

### `PelzTerminal`
React component wrapping `xterm.js`. Handles mounting, resizing, and rendering.
Exposes `write()` methods to the controller.

### `TerminalController`
Singleton (or Zustand store) that manages the terminal state and history.
Receives input -> routes to `CommandParser` -> executes Result -> writes Output.

### `CommandParser`
Pure function/class that takes string input `mint --amount 2` and returns structured object `{ command: 'mint', args: { amount: 2 } }`.
Uses a grammar definition.

### `MintingEngine`
The "brain" of the operation.
- Takes a `Strategy` (Contract + Config).
- Polls/Listens to chain.
- Triggers `BlockchainManager.sendTransaction`.
