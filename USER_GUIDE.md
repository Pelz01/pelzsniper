# ⚡ PelzSniper: The Ultimate Setup Handbook

**Welcome.** This guide will take you from "Zero" to "Sniping" in 5 minutes, even if you have never used a terminal before.

We will cover everything: Download, Installation, Setup, and your First Mint.

---

## 🛠️ Phase 1: Installing the Tools

Before we start, your computer needs two engines to run this bot.

### 1. Install Node.js
This is the engine that runs the code.
*   **Download Link:** [nodejs.org](https://nodejs.org/en/download/prebuilt-installer)
*   **Which version?** Choose **"LTS"** (Long Term Support).
*   **How to install:** Download the installer (.msi for Windows, .pkg for Mac) and click "Next" until finished.

### 2. Install Git
This tool downloads the code from the internet.
*   **Download Link:** [git-scm.com](https://git-scm.com/downloads)
*   **How to install:** Download and install. You can leave all settings as default.

### 3. Install VS Code (Recommended)
This is the best tool to view the code and run the terminal.
*   **Download Link:** [code.visualstudio.com](https://code.visualstudio.com/)

---

## 📥 Phase 2: Downloading the Bot

Now we will get the PelzSniper code onto your computer.

1.  **Open VS Code.**
2.  Press **`Ctrl + ~`** (Control key + Tilde key). This opens the **Terminal** at the bottom of the screen.
3.  Copy and paste this command into that terminal and press Enter:

    ```bash
    git clone https://github.com/Pelz01/pelzsniper.git
    ```

4.  Now, we need to "enter" the folder we just downloaded. Type this:

    ```bash
    cd pelzsniper
    ```

5.  Finally, install the robot's brain (dependencies). This might take 1 minute:

    ```bash
    npm install
    ```

**🎉 Success!** The bot is now installed.

---

## 🚀 Phase 3: Launching the Bot

You have two ways to run the bot. Choose the one you like best.

### Option A: Browser Mode (Easiest) 🌐
*Best for beginners. It runs in a nice window in Chrome.*

1.  In your VS Code terminal, type:
    ```bash
    npm run dev
    ```
2.  You will see a link like `http://localhost:5173`. **Ctrl + Click** it.
3.  A website opens with a black terminal. **Click anywhere inside the black box** to start typing.

### Option B: CLI Mode (Advanced) 🖥️
*Best for faster typing or running on a server/VPS.*

1.  First, we need to create a config file. Run this:
    ```bash
    cp public/config.json.example public/config.json
    ```
2.  In the VS Code file explorer (left side), find `public/config.json` and click it.
3.  Add your keys (we will explain keys in Phase 4).
4.  Run the bot:
    ```bash
    npm run cli
    ```

---

## 🔑 Phase 4: Keys & Wallets (Crucial)

To use the bot, you need a **Wallet** (to pay) and an **RPC Key** (for speed).

### 1. Create a "Burner Wallet"
**Never use your main vault.** Always use a fresh wallet with only the ETH you plan to spend.

*   **In the Bot:** Type `wallet new`.
*   **Action:** It will show you a **Private Key**. Copy it and save it in a password manager.
*   **Funding:** Send some ETH (e.g., 0.05 ETH) to the **Address** shown.

### 2. Get Super Speed (RPC Keys)
Public connections are slow. To win, you need a fast lane.
1.  Go to [Alchemy.com](https://www.alchemy.com/) (Free).
2.  Sign up and click "Apps" -> "Create App" -> Chain: "Ethereum".
3.  Click "API Key" and copy the key string (e.g., `YjrzaRWO...`).

**How to add it:**
*   **Browser Mode:** Type `config provider alchemy YjrzaRWO...`
*   **CLI Mode:** Paste it into `public/config.json` next to `"apiKey"`.

---

## 🎯 Phase 5: Your First Snipe

Let's practice.

**Scenario:** You dragged a contract address from a Discord announcement.
**Contract:** `0x123456...`

1.  **Check the Target:**
    ```bash
    contract load 0x123456...
    ```
    *The bot tells you: "Price: 0.01 ETH, Supply: 500/1000".*

2.  **Fire!**
    ```bash
    mint 1
    ```
    *(Buys 1 NFT).*

3.  **Emergency (Turbo):**
    If the mint is "hyped" and you need to pay extra gas to be first:
    ```bash
    mint 1 --turbo
    ```

---

## 📡 Special Feature: Latency Test
Want to check your internet connection to the blockchain?

Type:
```bash
ping
```
It will show you the speed in milliseconds (ms).
*   **Green (<100ms):** Excellent.
*   **Yellow (<300ms):** Okay.
*   **Red (>300ms):** Too slow for competitive sniping.

---

## ❓ Troubleshooting

**"Command not found: npm"**
*   You didn't install Node.js correctly (Phase 1). Restart your computer and try again.

**"Transaction Reverted"**
*   The sale might be Over, Paused, or you don't have enough ETH.

**"Ping is all red/failed"**
*   Your API key might be wrong. Check Alchemy dashboard.

---

**Need help inside the bot?**
Just type `help` or `guide` at any time.

**Good luck, Sniper.** 🔫
