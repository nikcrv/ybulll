// Web3 Provider
let ethersProvider = null;
let signer = null;
let userAddress = null;
let walletProvider = null;

// Contract Addresses
const VEYB_NFT_ADDRESS = '0x8235c179E9e84688FBd8B12295EfC26834dAC211'; // veYB Token
const MARKETPLACE_ADDRESS = '0x0000000000000068F116a894984e2DB1123eB395'; // Seaport 1.6

// veYB NFT ABI
const ERC721_ABI = [
    "function setApprovalForAll(address operator, bool approved) external",
    "function isApprovedForAll(address owner, address operator) external view returns (bool)",
    "function balanceOf(address owner) external view returns (uint256)",
    "function locked(address owner) external view returns (int256 amount, uint256 end)"
];

// Seaport 1.6 ABI (validate function)
const SEAPORT_ABI = [
    {
        "inputs": [
            {
                "components": [
                    {
                        "components": [
                            {"internalType": "address", "name": "offerer", "type": "address"},
                            {"internalType": "address", "name": "zone", "type": "address"},
                            {
                                "components": [
                                    {"internalType": "enum ItemType", "name": "itemType", "type": "uint8"},
                                    {"internalType": "address", "name": "token", "type": "address"},
                                    {"internalType": "uint256", "name": "identifierOrCriteria", "type": "uint256"},
                                    {"internalType": "uint256", "name": "startAmount", "type": "uint256"},
                                    {"internalType": "uint256", "name": "endAmount", "type": "uint256"}
                                ],
                                "internalType": "struct OfferItem[]",
                                "name": "offer",
                                "type": "tuple[]"
                            },
                            {
                                "components": [
                                    {"internalType": "enum ItemType", "name": "itemType", "type": "uint8"},
                                    {"internalType": "address", "name": "token", "type": "address"},
                                    {"internalType": "uint256", "name": "identifierOrCriteria", "type": "uint256"},
                                    {"internalType": "uint256", "name": "startAmount", "type": "uint256"},
                                    {"internalType": "uint256", "name": "endAmount", "type": "uint256"},
                                    {"internalType": "address payable", "name": "recipient", "type": "address"}
                                ],
                                "internalType": "struct ConsiderationItem[]",
                                "name": "consideration",
                                "type": "tuple[]"
                            },
                            {"internalType": "enum OrderType", "name": "orderType", "type": "uint8"},
                            {"internalType": "uint256", "name": "startTime", "type": "uint256"},
                            {"internalType": "uint256", "name": "endTime", "type": "uint256"},
                            {"internalType": "bytes32", "name": "zoneHash", "type": "bytes32"},
                            {"internalType": "uint256", "name": "salt", "type": "uint256"},
                            {"internalType": "bytes32", "name": "conduitKey", "type": "bytes32"},
                            {"internalType": "uint256", "name": "totalOriginalConsiderationItems", "type": "uint256"}
                        ],
                        "internalType": "struct OrderParameters",
                        "name": "parameters",
                        "type": "tuple"
                    },
                    {"internalType": "bytes", "name": "signature", "type": "bytes"}
                ],
                "internalType": "struct Order[]",
                "name": "orders",
                "type": "tuple[]"
            }
        ],
        "name": "validate",
        "outputs": [{"internalType": "bool", "name": "validated", "type": "bool"}],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

// Get wallet provider (Rabby or MetaMask)
function getWalletProvider() {
    if (window.rabby) return window.rabby;
    if (window.ethereum) return window.ethereum;
    return null;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const connectBtn = document.getElementById('connectWallet');
    const walletAddressBtn = document.getElementById('walletAddressBtn');
    const approveBtn = document.getElementById('approveBtn');

    connectBtn.addEventListener('click', () => {
        document.getElementById('walletModal').style.display = 'flex';
    });

    walletAddressBtn.addEventListener('click', disconnectWallet);

    if (approveBtn) {
        approveBtn.addEventListener('click', approveMarketplace);
    }

    checkPreviousConnection();
});

// Check if wallet was previously connected
async function checkPreviousConnection() {
    walletProvider = getWalletProvider();

    if (walletProvider) {
        try {
            const accounts = await walletProvider.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                await initializeWallet(accounts[0]);
            }
        } catch (error) {
            console.error('Error checking previous connection:', error);
        }
    }
}

// Connect wallet
async function connectWallet() {
    try {
        walletProvider = getWalletProvider();

        if (!walletProvider) {
            showToast('Please install MetaMask, Rabby or another Web3 wallet');
            return;
        }

        const accounts = await walletProvider.request({
            method: 'eth_requestAccounts'
        });

        await initializeWallet(accounts[0]);
        closeModal();
        showToast('Wallet connected successfully', 'success');

        walletProvider.on('accountsChanged', handleAccountsChanged);
        walletProvider.on('chainChanged', () => window.location.reload());

    } catch (error) {
        console.error('Error connecting wallet:', error);
        if (error.code === 4001) {
            showToast('Connection rejected by user');
        } else {
            showToast('Failed to connect wallet');
        }
    }
}

// Initialize wallet
async function initializeWallet(address) {
    try {
        ethersProvider = new ethers.providers.Web3Provider(walletProvider);
        signer = ethersProvider.getSigner();
        userAddress = address;

        const balance = await ethersProvider.getBalance(address);
        const ethBalance = ethers.utils.formatEther(balance);
        const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

        document.getElementById('walletBalance').textContent = `${parseFloat(ethBalance).toFixed(4)} ETH`;
        document.getElementById('walletAddress').textContent = shortAddress;
        document.getElementById('connectWallet').style.display = 'none';
        document.getElementById('walletConnected').style.display = 'flex';

        // Show seller section and check approval
        document.getElementById('sellerSection').style.display = 'block';
        await checkApprovalStatus();

        // Load dashboard and marketplace
        if (typeof showSellerDashboard === 'function') {
            showSellerDashboard();
        }
        if (typeof showMarketplace === 'function') {
            showMarketplace();
        }

    } catch (error) {
        console.error('Error initializing wallet:', error);
        showToast('Error loading wallet data');
    }
}

// Disconnect wallet
function disconnectWallet() {
    ethersProvider = null;
    signer = null;
    userAddress = null;

    document.getElementById('connectWallet').style.display = 'block';
    document.getElementById('walletConnected').style.display = 'none';
    document.getElementById('sellerSection').style.display = 'none';

    if (walletProvider) {
        walletProvider.removeAllListeners('accountsChanged');
        walletProvider.removeAllListeners('chainChanged');
    }

    showToast('Wallet disconnected');
}

// Handle account changes
async function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
        disconnectWallet();
    } else {
        await initializeWallet(accounts[0]);
    }
}

// Close modal
function closeModal() {
    document.getElementById('walletModal').style.display = 'none';
}

// Show toast notification
function showToast(message, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;

    setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

// Check approval status and locked amount
async function checkApprovalStatus() {
    if (!ethersProvider || !userAddress) return;

    try {
        const nftContract = new ethers.Contract(VEYB_NFT_ADDRESS, ERC721_ABI, ethersProvider);

        // Check NFT balance (should be 0 or 1)
        const balance = await nftContract.balanceOf(userAddress);
        const hasNFT = balance.gt(0);

        // Check locked amount
        const lockedData = await nftContract.locked(userAddress);
        const lockedAmount = lockedData.amount; // int256
        const lockEnd = lockedData.end; // uint256

        // Format locked amount (assuming 18 decimals like YB token)
        const formattedAmount = ethers.utils.formatEther(lockedAmount.abs());

        // Check if lock is active
        const now = Math.floor(Date.now() / 1000);
        const isLockActive = lockEnd.gt(now);

        // Display locked amount
        if (hasNFT && isLockActive) {
            document.getElementById('nftBalance').textContent = `${parseFloat(formattedAmount).toLocaleString()} YB (locked)`;
        } else if (hasNFT) {
            document.getElementById('nftBalance').textContent = `${parseFloat(formattedAmount).toLocaleString()} YB (expired)`;
        } else {
            document.getElementById('nftBalance').textContent = '0 YB (no veYB NFT)';
        }

        // Check if approved
        const isApproved = await nftContract.isApprovedForAll(userAddress, MARKETPLACE_ADDRESS);

        const statusEl = document.getElementById('approvalStatus');
        const approveBtn = document.getElementById('approveBtn');

        if (isApproved) {
            statusEl.innerHTML = `
                <div class="status-approved">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.2"/>
                        <path d="M6 10L9 13L14 7" stroke="currentColor" stroke-width="2" fill="none"/>
                    </svg>
                    <span>✓ Marketplace approved</span>
                </div>
            `;
            approveBtn.disabled = true;
            approveBtn.textContent = '✓ Already Approved';

            // Show Step 2 - Create Listing
            if (hasNFT) {
                document.getElementById('listingCard').style.display = 'block';
            }
        } else {
            statusEl.innerHTML = `
                <div class="status-not-approved">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="2" fill="none"/>
                        <path d="M10 6V10M10 13V14" stroke="currentColor" stroke-width="2"/>
                    </svg>
                    <span>Approval required to list NFTs</span>
                </div>
            `;
            approveBtn.disabled = false;
            document.getElementById('listingCard').style.display = 'none';
        }

    } catch (error) {
        console.error('Error checking approval:', error);
        showToast('Error checking approval status');
    }
}

// Approve marketplace
async function approveMarketplace() {
    if (!ethersProvider || !signer) {
        showToast('Please connect your wallet first');
        return;
    }

    const approveBtn = document.getElementById('approveBtn');
    const originalText = approveBtn.innerHTML;

    try {
        approveBtn.disabled = true;
        approveBtn.classList.add('btn-loading');
        approveBtn.textContent = 'Waiting for confirmation...';

        const nftContract = new ethers.Contract(VEYB_NFT_ADDRESS, ERC721_ABI, signer);
        const tx = await nftContract.setApprovalForAll(MARKETPLACE_ADDRESS, true);

        approveBtn.textContent = 'Transaction pending...';
        showToast('Approval transaction submitted', 'success');

        await tx.wait();

        approveBtn.classList.remove('btn-loading');
        showToast('Marketplace approved successfully!', 'success');
        await checkApprovalStatus();

    } catch (error) {
        console.error('Error approving marketplace:', error);

        if (error.code === 4001) {
            showToast('Transaction rejected by user');
        } else if (error.code === 'ACTION_REJECTED') {
            showToast('Transaction rejected');
        } else {
            showToast('Error approving marketplace');
        }

        approveBtn.disabled = false;
        approveBtn.classList.remove('btn-loading');
        approveBtn.innerHTML = originalText;
    }
}
