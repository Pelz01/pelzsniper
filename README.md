# ⚡ PelzSniper

**High-Frequency NFT Minting Terminal**

PelzSniper is a powerful, terminal-based NFT minting bot that runs directly in your browser. It effectively turns your browser into a command-line interface for interacting with EVM blockchains (Mainnet, Base, Arbitrum, Optimism, etc.) with ultra-low latency.

## 🚀 Features

*   **Burner Wallet Support**: Import private keys for instant, popup-free signing.
*   **Multi-Provider RPC**: Support for Alchemy, Infura, and Ankr (HTTP & WebSocket).
*   **Monitor Mode**: Auto-snipe sales the moment they flip active.
*   **Turbo Mode**: Skip safety checks and use high-priority gas for hype drops.
*   **Platform Detection**: Automatically handles mints for OpenSea, MagicEden, Manifold, NFTs2Me, and many others.
*   **Multi-Chain**: Seamlessly switch between Mainnet, Base, Sepolia, Arbitrum, etc.

## 📦 Installation

To execute the project locally, you need [Node.js](https://nodejs.org/) installed.

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/Pelz01/pelzsniper.git
    cd pelzsniper
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Start the Bot**
    ```bash
    npm run dev
    ```

4.  **Open in Browser**
    Visit `http://localhost:5173`. You will see the terminal interface.

## 📖 Usage

### Quick Start
1.  **Generate Wallet**: Type `wallet new` to create a burner wallet.
2.  **Config Provider**: Type `config provider alchemy YOUR_KEY` for speed.
3.  **Load Contract**: Type `contract load 0x...` to target an NFT.
4.  **Mint**: Type `mint 1` to buy.

For a full guide, check out the [User Guide](USER_GUIDE.md) or type `guide` inside the terminal.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## ⚠️ Disclaimer

This tool is for educational purposes. Use at your own risk. Private keys are stored in `sessionStorage` and are cleared when the tab is closed. Always use a burner wallet with only the funds you are willing to risk.
