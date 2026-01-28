export const UNIVERSAL_ABI = [
    // ERC721 Standard Read
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function totalSupply() view returns (uint256)",
    "function maxSupply() view returns (uint256)",
    "function balanceOf(address owner) view returns (uint256)",
    "function ownerOf(uint256 tokenId) view returns (address)",

    // Pricing/State
    "function cost() view returns (uint256)",
    "function price() view returns (uint256)",
    "function mintPrice() view returns (uint256)",
    "function salePrice() view returns (uint256)",
    "function tokenPrice() view returns (uint256)",
    "function MINT_PRICE() view returns (uint256)",
    "function PRICE() view returns (uint256)",
    "function value() view returns (uint256)",
    "function paused() view returns (bool)",
    "function isAllowlistActive() view returns (bool)",
    "function isActive() view returns (bool)",
    "function saleActive() view returns (bool)",
    "function maxPerWallet() view returns (uint256)",
    "function maxMintAmount() view returns (uint256)",
    "function walletLimit() view returns (uint256)",

    // Common Minting Signatures
    "function mint(uint256 amount) payable",
    "function publicMint(uint256 amount) payable",
    "function safeMint(uint256 amount) payable",
    "function mintNFT(uint256 amount) payable",
    "function purchase(uint256 amount) payable",
    "function mint(address to, uint256 amount) payable",
    "function safeMint(address to, uint256 amount) payable",

    // Events
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
];
