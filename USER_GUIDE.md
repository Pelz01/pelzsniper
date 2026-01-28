# ⚡ PelzSniper User Guide

**The Ultimate High-Frequency NFT Minting Terminal**

Welcome to **PelzSniper**. This tool turns your computer into a rapid-fire minting engine. It runs locally on your machine for maximum security and speed.

> **Need Help?**
> If you ever get stuck inside the bot, just type `guide` or `?` to see the built-in manual.

---

## 🚀 Quick Start: Choose Your Mode

| **Browser Mode** 🌐 | **CLI Mode** 🖥️ |
| :--- | :--- |
| **Best for:** Beginners, Visual Users | **Best for:** Advanced, VPS, Termius, SSH |
| Runs in Chrome/Brave | Runs in pure Terminal/Command Prompt |
| [Jump to Browser Setup](#-browser-mode-setup) | [Jump to CLI Setup](#-cli-mode-setup) |

---

## 📦 1. Installation (Required for All)

Do this **once** to set up the software.

### Prerequisites
1.  **Node.js**: Download "LTS" version from [nodejs.org](https://nodejs.org/).
2.  **Git**: Download from [git-scm.com](https://git-scm.com/).

### Install Steps
Open your terminal (Command Prompt / Terminal) and copy-paste these lines one by one:

```bash
# 1. Download the code
git clone https://github.com/Pelz01/pelzsniper.git

# 2. Enter the folder
cd pelzsniper

# 3. Install dependencies (may take 1-2 mins)
npm install
```

---

## 🌐 Browser Mode Setup

**1. Start the App**
Run this command in your terminal:
```bash
npm run dev
```

**2. Open in Browser**
Go to [http://localhost:5173](http://localhost:5173) in Chrome or Brave.
You will see the black terminal window. **Click inside it** to type.

**3. Setup Wallet**
*   Type `wallet new` to create a fresh burner wallet (Recommended).
*   **Save the Private Key immediately.**
*   Send ETH to the address shown.

---

## 🖥️ CLI Mode Setup (Headless)

**1. Create Config File**
```bash
cp public/config.json.example public/config.json
```

**2. Configure Your Keys**
Open `public/config.json` in any text editor (Notepad, VS Code, Nano) and fill it in:

```json
{
  "provider": "alchemy",
  "apiKey": "YOUR_ALCHEMY_API_KEY",
  "privateKey": "0xYOUR_PRIVATE_KEY_HERE",
  "defaultChain": 1
}
```
*   `defaultChain`: `1` (Mainnet), `8453` (Base), `42161` (Arbitrum).

**3. Run the Bot**
```bash
npm run cli
```

---

## ⚡ Speed & RPC Configuration

By default, the bot uses slow public channels. **To win hype mints, you need premium speed.**

1.  Get a free API Key from [Alchemy](https://www.alchemy.com/) or [Infura](https://infura.io/).
2.  **Browser:** Type `config provider alchemy YOUR_KEY`
3.  **CLI:** Paste the key into `public/config.json`

---

## 🎯 Field Manual: How to Snipe

### Scenario A: The "Active Now" Mint
The sale is already live. You want to buy immediately.

1.  **Load Contract:**
    ```bash
    contract load 0x1234567890abcdef...
    ```
    *Check the output: Is Price correct? Is supply available?*

2.  **Mint:**
    ```bash
    mint 1
    ```

3.  **Turbo Mint (Maximum Urgency):**
    If gas is spiking and you need to be first:
    ```bash
    mint 1 --turbo
    ```
    *(Skips safety checks, pays 10x priority fee)*

### Scenario B: The "Upcoming" Mint
The sale starts in 5 minutes. You don't want to spam click.

1.  **Load Contract:**
    ```bash
    contract load 0x...
    ```

2.  **Start Monitor:**
    ```bash
    snipe monitor --qty 2
    ```
    *The bot will check status every 2 seconds. The moment it flips to `Active`, it buys.*

3.  **Stop:** `snipe stop`

---

## 📚 Command Reference

### Wallet Management
| Command | Description |
| :--- | :--- |
| `wallet new` | Generate a new burner wallet |
| `wallet import <key>` | Import existing private key |
| `wallet balance` | Show ETH balance |
| `status` | Show current wallet, chain, and target |

### Configuration
| Command | Description |
| :--- | :--- |
| `config provider <name> <key>` | Set RPC (`alchemy`, `infura`, `ankr`) |
| `config provider clear` | Reset to public RPC |
| `network <id>` | Switch chain (`1`, `8453`, etc.) |
| `networks` | List supported chains |

### Minting Action
| Command | Description |
| :--- | :--- |
| `contract load <address>` | Target a specific smart contract |
| `mint <qty>` | Standard mint |
| `mint <qty> --turbo` | High-priority, skip-simulation mint |
| `snipe monitor --qty <n>` | Auto-buy when sale activates |
| `snipe stop` | Cancel monitoring |

### System
| Command | Description |
| :--- | :--- |
| `clear` | Clear terminal screen |
| `exit` | Close the CLI bot |

---

## 🔧 Troubleshooting

**"Transaction Reverted"**
*   The sale might be paused, sold out, or you hit a wallet limit.
*   Check Etherscan to see the exact error.

**"Gas too low"**
*   Use `--turbo` mode to automatically pay high priority fees.

**"Invalid API Key"**
*   Double check you copied the key correctly from Alchemy/Infura.
*   Browser: Run `config provider clear` and try again.

**"Command not found"**
*   Type `help` to see exact spelling.

---

**Happy Sniping! 🔫**
