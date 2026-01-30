# ⚡ PelzSniper User Guide

Welcome to **PelzSniper**! This is a tool that helps you mint NFTs extremely fast. It works directly in a special "terminal" window on your computer.

Follow this guide to get started.

---

## 1. Installation (First Time Only)

Before you can run the bot, you need two things installed on your computer: **Node.js** and **Git**.

1.  **Download Node.js**: Go to [nodejs.org](https://nodejs.org/) and download the "LTS" version.
2.  **Download Git**: Go to [git-scm.com](https://git-scm.com/).
3.  **Clone the Repo**:
    *   Open your terminal (Command Prompt or Terminal).
    *   Run this command:
        ```bash
        git clone https://github.com/Pelz01/pelzsniper.git
        ```
    *   Enter the folder:
        ```bash
        cd pelzsniper
        ```
4.  **Install Dependencies**:
    *   Type this command and hit Enter:
        ```bash
        npm install
        ```
    *   Wait for it to finish.

---

## 2. Starting the Bot

Every time you want to use the bot, do this:

1.  Open the folder in your terminal.
2.  Run this command:
    ```bash
    npm run dev
    ```
3.  A website will open (usually `http://localhost:5173`).
4.  You will see a black **Terminal** window on the screen. **Click inside it** to start typing.

---

## 3. Creating a "Burner Wallet" (Recommended)

For safety and speed, you should use a separate wallet just for this bot. This is called a "Burner Wallet".

1.  Type this cmd:
    ```bash
    wallet new
    ```
2.  The bot will generate a **new address** and a **Private Key**.
3.  **🔴 IMPORTANT:** Copy that Private Key and save it somewhere safe! The bot will not show it again.
4.  **Send ETH** (or Base ETH, etc.) to the new "Address" shown on the screen. This is the money the bot will use to mint.

> If you already have a private key you want to use, type: `wallet import YOUR_PRIVATE_KEY`

---

## 4. Making it FAST (RPC Providers) ⚡

By default, the bot uses free "public" connections, which can be slow. To make it super fast, get a free API key from a major provider.

**Supported Providers:**
*   **Alchemy** (Best for speed/websockets)
*   **QuickNode** (Excellent global coverage)
*   **Infura** (Reliable backup)
*   **Ankr** (Good alternative)

### ⚡ Managing Providers (New!)

You can now save multiple providers and switch between them instantly.

**1. Add a Provider:**

*   **Alchemy:**
    ```bash
    config add alchemy YOUR_API_KEY
    ```

*   **QuickNode:**
    ```bash
    config add quicknode YOUR_ENDPOINT_NAME YOUR_TOKEN
    ```
    *(Example: `config add quicknode twilight-smart-owl 73b...`)*

*   **Infura / Ankr:**
    ```bash
    config add infura YOUR_KEY
    ```

**2. Switch Active Provider:**
```bash
config use quicknode
```

**3. List Saved Providers:**
```bash
config list
```
*(Shows all saved providers and which one is active)*

### 📊 Latency Benchmark

Not sure which provider is fastest for you? Run a benchmark!

```bash
ping benchmark
```
*   This tests ALL your saved providers across Ethereum, Base, Optimism, Arbitrum, and Polygon.
*   It highlights the fastest provider for each chain.

---

## 5. How to Snipe (Minting)

### Step 1: Find the Contract
Find the contract address of the NFT you want (from OpenSea, Etherscan, Discord, etc.). It looks like `0x123...`.

### Step 2: Load the Contract
Type this in the bot:
```bash
contract load 0x123...
```
(Replace `0x123...` with the real address).
*   The bot will tell you the **Price**, **Supply**, and if it is **Active**.

### Step 3: MINT!
When you are ready to buy, type:
```bash
mint 1
```
(Replace `1` with how many you want to buy).

---

## 🚀 Advanced Tricks

### Monitor Mode (Auto-Mint)
If a sale is not live yet, you can tell the bot to watch it and buy instantly when it opens:
```bash
snipe monitor --qty 2
```
*   The bot will check every 2 seconds.
*   As soon as it opens, it buys 2.

### Turbo Mode (Maximum Speed)
If you are fighting for a "hype" mint and need to be the fastest:
```bash
mint 1 --turbo
```
*   This skips safety checks.
*   It pays 10x gas fee to jump the line.
*   **Warning:** Only use this if you are sure!

---

---

## 6. Getting Help

If you ever get stuck or forget a command, you don't need to leave the terminal.

*   **Quick Cheatsheet**: Type `help` or `?` to see a list of all commands.
*   **Full Manual**: Type `guide` or `man` to read detailed explanations of every feature directly inside the bot.
    *   Example: `guide mint` (Explains how minting works)
    *   Example: `guide wallet` (Explains burner wallets)

---

## Common Commands Cheat Sheet

| Command | What it does |
| :--- | :--- |
| `help` / `?` | Show list of commands. |
| `guide` | Read the detailed user manual. |
| `wallet new` | Create a new sniping wallet. |
| `wallet balance` | See how much money is in the wallet. |
| `config provider [name] [key]` | Set up a high-speed connection. |
| `contract load [address]` | Prepare a contract for minting. |
| `mint [N]` | Buy N tokens immediately. |
| `mint [N] --turbo` | Buy N tokens **instantly** (unsafe mode). |
| `snipe monitor` | Wait for sale to start, then buy. |
| `snipe stop` | Stop monitoring. |
| `clear` | Clear the screen. |
