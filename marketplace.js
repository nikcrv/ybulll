// Display seller's listing dashboard
async function showSellerDashboard() {
    console.log('Checking for listing of:', userAddress);
    const myListing = localStorage.getItem(`myListing_${userAddress}`);
    console.log('My listing data:', myListing);

    if (!myListing) {
        console.log('No listing found for this address');
        return;
    }

    const listing = JSON.parse(myListing);

    if (!listing.active) return;

    // Verify order status on-chain
    if (ethersProvider && listing.orderHash) {
        const getOrderStatusABI = [{
            "inputs": [{"internalType": "bytes32", "name": "orderHash", "type": "bytes32"}],
            "name": "getOrderStatus",
            "outputs": [
                {"internalType": "bool", "name": "isValidated", "type": "bool"},
                {"internalType": "bool", "name": "isCancelled", "type": "bool"},
                {"internalType": "uint256", "name": "totalFilled", "type": "uint256"},
                {"internalType": "uint256", "name": "totalSize", "type": "uint256"}
            ],
            "stateMutability": "view",
            "type": "function"
        }];

        try {
            const seaportContract = new ethers.Contract(MARKETPLACE_ADDRESS, getOrderStatusABI, ethersProvider);
            const status = await seaportContract.getOrderStatus(listing.orderHash);
            const isCancelled = status.isCancelled;
            const isFilled = status.totalFilled.gte(status.totalSize) && status.totalSize.gt(0);

            console.log(`My order status - Cancelled: ${isCancelled}, Filled: ${isFilled}`);

            // If order is cancelled or filled, remove from display
            if (isCancelled || isFilled) {
                localStorage.removeItem(`myListing_${userAddress}`);

                // Update global listings
                const listings = JSON.parse(localStorage.getItem('veybListings') || '[]');
                const updated = listings.map(l => {
                    if (l.orderHash === listing.orderHash) {
                        l.active = false;
                    }
                    return l;
                });
                localStorage.setItem('veybListings', JSON.stringify(updated));

                console.log('Listing is no longer active on-chain');
                return;
            }
        } catch (error) {
            console.error('Error checking order status:', error);
            // Continue showing listing on error
        }
    }

    const section = document.getElementById('myListingSection');
    const container = document.getElementById('myListingContainer');

    const createdDate = new Date(listing.createdAt).toLocaleDateString();
    const expiryDate = new Date(listing.orderParameters.endTime * 1000).toLocaleDateString();
    const pricePerVeYB = listing.lockedAmount ? (listing.price / parseFloat(listing.lockedAmount)).toFixed(6) : 'N/A';

    container.innerHTML = `
        <div class="listing-card">
            <div class="listing-header">
                <h3 class="listing-title">veYB NFT #${listing.tokenId.slice(0, 10)}...</h3>
                <span class="listing-status active">Active</span>
            </div>
            <div class="listing-details">
                <div class="detail-item">
                    <span class="detail-label">Locked Amount</span>
                    <span class="detail-value">${listing.lockedAmount ? parseFloat(listing.lockedAmount).toLocaleString() : 'N/A'} YB</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Price</span>
                    <span class="detail-value">${listing.price} ETH</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Price per veYB</span>
                    <span class="detail-value">${pricePerVeYB} ETH</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Listed On</span>
                    <span class="detail-value">${createdDate}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Expires</span>
                    <span class="detail-value">${expiryDate}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Order Hash</span>
                    <span class="detail-value" style="font-size: 12px; font-family: monospace;">${listing.orderHash ? listing.orderHash.slice(0, 16) + '...' : 'N/A'}</span>
                </div>
            </div>
            <div class="listing-actions">
                <button class="btn-cancel" onclick="cancelListing()">Cancel Listing</button>
                <a href="https://etherscan.io/tx/${listing.txHash}" target="_blank" class="btn-secondary" style="text-decoration: none; display: inline-flex; align-items: center; padding: 12px 24px; background: var(--bg-dark); color: var(--text-primary); border-radius: 10px; font-size: 14px; font-weight: 600;">
                    View on Etherscan
                </a>
            </div>
        </div>
    `;

    section.style.display = 'block';
}

// Toggle listing view
function toggleListingView() {
    showMarketplace();
}

// Display marketplace listings
async function showMarketplace() {
    const listings = JSON.parse(localStorage.getItem('veybListings') || '[]');
    console.log('All listings:', listings);
    console.log('Current user:', userAddress);

    const showAll = document.getElementById('showAllListings')?.checked || false;

    let activeListings;
    if (showAll) {
        // Show all active listings including own
        activeListings = listings.filter(l => l.active);
    } else {
        // Show only other people's listings
        activeListings = listings.filter(l => l.active && l.seller.toLowerCase() !== userAddress.toLowerCase());
    }

    // Verify order status on-chain
    if (ethersProvider && activeListings.length > 0) {
        const getOrderStatusABI = [{
            "inputs": [{"internalType": "bytes32", "name": "orderHash", "type": "bytes32"}],
            "name": "getOrderStatus",
            "outputs": [
                {"internalType": "bool", "name": "isValidated", "type": "bool"},
                {"internalType": "bool", "name": "isCancelled", "type": "bool"},
                {"internalType": "uint256", "name": "totalFilled", "type": "uint256"},
                {"internalType": "uint256", "name": "totalSize", "type": "uint256"}
            ],
            "stateMutability": "view",
            "type": "function"
        }];

        const seaportContract = new ethers.Contract(MARKETPLACE_ADDRESS, getOrderStatusABI, ethersProvider);

        // Check status for all listings
        const statusChecks = await Promise.all(
            activeListings.map(async (listing) => {
                if (!listing.orderHash) return { listing, valid: true }; // Keep if no orderHash

                try {
                    const status = await seaportContract.getOrderStatus(listing.orderHash);
                    const isCancelled = status.isCancelled;
                    const isFilled = status.totalFilled.gte(status.totalSize) && status.totalSize.gt(0);
                    const isValid = !isCancelled && !isFilled;

                    console.log(`Order ${listing.orderHash.slice(0, 10)}... - Cancelled: ${isCancelled}, Filled: ${isFilled}, Valid: ${isValid}`);

                    return { listing, valid: isValid };
                } catch (error) {
                    console.error('Error checking order status:', error);
                    return { listing, valid: true }; // Keep on error
                }
            })
        );

        // Filter only valid orders
        activeListings = statusChecks.filter(s => s.valid).map(s => s.listing);

        // Update localStorage - mark invalid orders as inactive
        const updatedListings = listings.map(l => {
            const statusCheck = statusChecks.find(s => s.listing.orderHash === l.orderHash);
            if (statusCheck && !statusCheck.valid) {
                l.active = false;
            }
            return l;
        });
        localStorage.setItem('veybListings', JSON.stringify(updatedListings));
    }

    console.log('Active listings for marketplace:', activeListings);

    const section = document.getElementById('marketplaceSection');
    const container = document.getElementById('marketplaceListings');

    if (activeListings.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                    <circle cx="32" cy="32" r="30" stroke="currentColor" stroke-width="2"/>
                    <path d="M32 20V32M32 38V40" stroke="currentColor" stroke-width="2"/>
                </svg>
                <h3>No listings available</h3>
                <p>There are currently no veYB NFTs listed for sale.</p>
            </div>
        `;
    } else {
        container.innerHTML = activeListings.map(listing => {
            const createdDate = new Date(listing.createdAt).toLocaleDateString();
            const expiryDate = new Date(listing.orderParameters.endTime * 1000).toLocaleDateString();
            const isOwnListing = listing.seller.toLowerCase() === userAddress.toLowerCase();

            // Calculate price per veYB
            const pricePerVeYB = listing.lockedAmount ? (listing.price / parseFloat(listing.lockedAmount)).toFixed(6) : 'N/A';

            return `
                <div class="listing-card">
                    <div class="listing-header">
                        <div>
                            <h3 class="listing-title">veYB NFT</h3>
                            <p style="color: var(--text-secondary); font-size: 13px; margin-top: 4px;">Token ID: ${listing.tokenId.slice(0, 10)}...${listing.tokenId.slice(-6)}</p>
                        </div>
                        <span class="listing-status active">For Sale</span>
                    </div>
                    <div class="listing-details">
                        <div class="detail-item">
                            <span class="detail-label">Locked Amount</span>
                            <span class="detail-value" style="font-weight: 600;">${listing.lockedAmount ? parseFloat(listing.lockedAmount).toLocaleString() : 'N/A'} YB</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Price</span>
                            <span class="detail-value" style="color: var(--primary); font-size: 18px; font-weight: 600;">${listing.price} ETH</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Price per veYB</span>
                            <span class="detail-value" style="color: var(--text-secondary);">${pricePerVeYB} ETH</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Seller</span>
                            <span class="detail-value" style="font-size: 14px; font-family: monospace;">
                                ${isOwnListing ? 'You' : listing.seller.slice(0, 6) + '...' + listing.seller.slice(-4)}
                            </span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Listed</span>
                            <span class="detail-value">${createdDate}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Expires</span>
                            <span class="detail-value">${expiryDate}</span>
                        </div>
                    </div>
                    <div style="background: var(--bg-dark); padding: 12px; border-radius: 10px; margin: 16px 0; font-size: 13px; color: var(--text-secondary);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span>Contract:</span>
                            <a href="https://etherscan.io/address/0x8235c179E9e84688FBd8B12295EfC26834dAC211" target="_blank" style="color: var(--primary); text-decoration: none;">
                                veYB Token
                            </a>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Order Hash:</span>
                            <span style="font-family: monospace; font-size: 11px;">${listing.orderHash ? listing.orderHash.slice(0, 12) + '...' : 'N/A'}</span>
                        </div>
                    </div>
                    <div class="listing-actions">
                        ${isOwnListing ?
                            `<button class="btn-cancel" onclick='cancelListingByHash(${JSON.stringify(listing).replace(/'/g, "&apos;")})'>Cancel Listing</button>` :
                            `<button class="btn-buy" onclick='buyNFT(${JSON.stringify(listing).replace(/'/g, "&apos;")})'>
                                Buy for ${listing.price} ETH
                            </button>`
                        }
                        <a href="https://etherscan.io/tx/${listing.txHash}" target="_blank" style="text-decoration: none; display: inline-flex; align-items: center; padding: 12px 20px; background: var(--bg-dark); color: var(--text-primary); border-radius: 10px; font-size: 14px; font-weight: 600; border: 1px solid var(--border);">
                            View on Etherscan
                        </a>
                    </div>
                </div>
            `;
        }).join('');
    }

    section.style.display = 'block';
}

// Cancel listing (on-chain)
async function cancelListing() {
    if (!confirm('Are you sure you want to cancel this listing? This will send a blockchain transaction.')) return;

    if (!ethersProvider || !signer) {
        showToast('Please connect your wallet');
        return;
    }

    try {
        showToast('Preparing cancellation...');

        const myListing = localStorage.getItem(`myListing_${userAddress}`);
        if (!myListing) {
            showToast('No listing found');
            return;
        }

        const listing = JSON.parse(myListing);

        // Seaport cancel ABI
        const cancelABI = [
            {
                "inputs": [
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
                        "internalType": "struct OrderComponents[]",
                        "name": "orders",
                        "type": "tuple[]"
                    }
                ],
                "name": "cancel",
                "outputs": [{"internalType": "bool", "name": "cancelled", "type": "bool"}],
                "stateMutability": "nonpayable",
                "type": "function"
            }
        ];

        const seaportContract = new ethers.Contract(MARKETPLACE_ADDRESS, cancelABI, signer);

        // Build OrderComponents for cancel
        const orderComponents = {
            offerer: listing.orderParameters.offerer,
            zone: listing.orderParameters.zone,
            offer: listing.orderParameters.offer,
            consideration: listing.orderParameters.consideration,
            orderType: listing.orderParameters.orderType,
            startTime: listing.orderParameters.startTime,
            endTime: listing.orderParameters.endTime,
            zoneHash: listing.orderParameters.zoneHash,
            salt: listing.orderParameters.salt,
            conduitKey: listing.orderParameters.conduitKey,
            totalOriginalConsiderationItems: listing.orderParameters.totalOriginalConsiderationItems
        };

        const tx = await seaportContract.cancel([orderComponents]);

        showToast('Transaction submitted...', 'success');

        await tx.wait();

        // Remove from localStorage after blockchain confirmation
        localStorage.removeItem(`myListing_${userAddress}`);

        // Update global listings
        const listings = JSON.parse(localStorage.getItem('veybListings') || '[]');
        const updated = listings.map(l => {
            if (l.seller.toLowerCase() === userAddress.toLowerCase()) {
                l.active = false;
            }
            return l;
        });
        localStorage.setItem('veybListings', JSON.stringify(updated));

        showToast('Listing canceled successfully!', 'success');

        setTimeout(() => {
            window.location.reload();
        }, 2000);

    } catch (error) {
        console.error('Error canceling listing:', error);

        if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
            showToast('Cancellation rejected');
        } else {
            showToast('Error: ' + (error.reason || error.message));
        }
    }
}

// Cancel listing by order hash (for marketplace listings)
async function cancelListingByHash(listing) {
    if (!confirm('Are you sure you want to cancel this listing? This will send a blockchain transaction.')) return;

    if (!ethersProvider || !signer) {
        showToast('Please connect your wallet');
        return;
    }

    try {
        showToast('Preparing cancellation...');

        console.log('Canceling listing:', listing);

        if (!listing || !listing.orderParameters) {
            showToast('Invalid listing data');
            return;
        }

        // Verify ownership
        if (listing.seller.toLowerCase() !== userAddress.toLowerCase()) {
            showToast('You can only cancel your own listings');
            return;
        }

        // Seaport cancel ABI
        const cancelABI = [
            {
                "inputs": [
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
                        "internalType": "struct OrderComponents[]",
                        "name": "orders",
                        "type": "tuple[]"
                    }
                ],
                "name": "cancel",
                "outputs": [{"internalType": "bool", "name": "cancelled", "type": "bool"}],
                "stateMutability": "nonpayable",
                "type": "function"
            }
        ];

        const seaportContract = new ethers.Contract(MARKETPLACE_ADDRESS, cancelABI, signer);

        // Build OrderComponents for cancel
        const orderComponents = {
            offerer: listing.orderParameters.offerer,
            zone: listing.orderParameters.zone,
            offer: listing.orderParameters.offer,
            consideration: listing.orderParameters.consideration,
            orderType: listing.orderParameters.orderType,
            startTime: listing.orderParameters.startTime,
            endTime: listing.orderParameters.endTime,
            zoneHash: listing.orderParameters.zoneHash,
            salt: listing.orderParameters.salt,
            conduitKey: listing.orderParameters.conduitKey,
            totalOriginalConsiderationItems: listing.orderParameters.totalOriginalConsiderationItems
        };

        const tx = await seaportContract.cancel([orderComponents]);

        showToast('Transaction submitted...', 'success');

        await tx.wait();

        // Update global listings
        const listings = JSON.parse(localStorage.getItem('veybListings') || '[]');
        const updated = listings.map(l => {
            if (l.orderHash === listing.orderHash) {
                l.active = false;
            }
            return l;
        });
        localStorage.setItem('veybListings', JSON.stringify(updated));

        // Also remove from myListing if it matches
        const myListing = localStorage.getItem(`myListing_${userAddress}`);
        if (myListing) {
            const myListingData = JSON.parse(myListing);
            if (myListingData.orderHash === listing.orderHash) {
                localStorage.removeItem(`myListing_${userAddress}`);
            }
        }

        showToast('Listing canceled successfully!', 'success');

        setTimeout(() => {
            window.location.reload();
        }, 2000);

    } catch (error) {
        console.error('Error canceling listing:', error);

        if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
            showToast('Cancellation rejected');
        } else {
            showToast('Error: ' + (error.reason || error.message));
        }
    }
}

// Buy NFT
async function buyNFT(listing) {
    if (!ethersProvider || !signer) {
        showToast('Please connect your wallet first');
        return;
    }

    try {
        showToast('Preparing purchase...');

        // Build the order for fulfillOrder
        const order = {
            parameters: listing.orderParameters,
            signature: "0x"
        };

        // Seaport fulfillOrder ABI
        const fulfillOrderABI = [
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
                                    {"internalType": "uint8", "name": "orderType", "type": "uint8"},
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
                        "internalType": "struct Order",
                        "name": "order",
                        "type": "tuple"
                    },
                    {"internalType": "bytes32", "name": "fulfillerConduitKey", "type": "bytes32"}
                ],
                "name": "fulfillOrder",
                "outputs": [{"internalType": "bool", "name": "fulfilled", "type": "bool"}],
                "stateMutability": "payable",
                "type": "function"
            }
        ];

        const seaportContract = new ethers.Contract(MARKETPLACE_ADDRESS, fulfillOrderABI, signer);

        const priceInWei = ethers.utils.parseEther(listing.price.toString());

        const tx = await seaportContract.fulfillOrder(
            order,
            ethers.constants.HashZero,
            { value: priceInWei }
        );

        showToast('Transaction submitted...', 'success');

        await tx.wait();

        showToast('Purchase successful!', 'success');

        // Mark as sold
        const listings = JSON.parse(localStorage.getItem('veybListings') || '[]');
        const updated = listings.map(l => {
            if (l.orderHash === listing.orderHash) {
                l.active = false;
            }
            return l;
        });
        localStorage.setItem('veybListings', JSON.stringify(updated));

        setTimeout(() => {
            window.location.reload();
        }, 2000);

    } catch (error) {
        console.error('Error buying NFT:', error);

        if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
            showToast('Purchase canceled');
        } else if (error.reason && error.reason.includes('Need max veLock')) {
            showToast('You need a maximum veYB lock to purchase this NFT');
        } else if (error.message && error.message.includes('Need max veLock')) {
            showToast('You need a maximum veYB lock to purchase this NFT');
        } else {
            showToast('Error: ' + (error.reason || error.message));
        }
    }
}

// Initialize on wallet connection
if (typeof window !== 'undefined') {
    const originalInitializeWallet = window.initializeWallet;
    // This will be called after wallet connects
    document.addEventListener('walletConnected', () => {
        showSellerDashboard();
        showMarketplace();
    });
}
