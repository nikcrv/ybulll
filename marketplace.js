// Display seller's listing dashboard
async function showSellerDashboard() {
    console.log('Checking for listings of:', userAddress);

    // Get all listings from localStorage
    const allListings = JSON.parse(localStorage.getItem('veybListings') || '[]');

    // Filter for current user's active listings
    const myListings = allListings.filter(l =>
        l.active && l.seller.toLowerCase() === userAddress.toLowerCase()
    );

    // Sort by createdAt (newest first)
    myListings.sort((a, b) => b.createdAt - a.createdAt);

    console.log('My active listings:', myListings.length);
    console.log('My active listing hashes:', myListings.map(l => l.orderHash));

    if (myListings.length === 0) {
        console.log('No active listings found for this address');
        return;
    }

    const section = document.getElementById('myListingSection');
    const container = document.getElementById('myListingContainer');

    // Display all user's active listings
    container.innerHTML = myListings.map(listing => {
        const createdDate = new Date(listing.createdAt).toLocaleDateString();

        // Handle BigNumber endTime
        let endTimeValue = listing.orderParameters.endTime;
        if (endTimeValue && endTimeValue.hex) {
            endTimeValue = parseInt(endTimeValue.hex, 16);
        } else if (endTimeValue && endTimeValue._hex) {
            endTimeValue = parseInt(endTimeValue._hex, 16);
        }
        const expiryDate = new Date(endTimeValue * 1000).toLocaleDateString();

        const pricePerVeYB = listing.lockedAmount ? (listing.price / parseFloat(listing.lockedAmount)).toFixed(6) : 'N/A';

        return `
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
                    <button class="btn-cancel" onclick='cancelListingByHash(${JSON.stringify(listing).replace(/'/g, "&apos;")})'>Cancel Listing</button>
                    <a href="https://etherscan.io/tx/${listing.txHash}" target="_blank" class="btn-secondary" style="text-decoration: none; display: inline-flex; align-items: center; padding: 12px 24px; background: var(--bg-dark); color: var(--text-primary); border-radius: 10px; font-size: 14px; font-weight: 600;">
                        View on Etherscan
                    </a>
                </div>
            </div>
        `;
    }).join('');

    section.style.display = 'block';
}

// Toggle listing view
async function toggleListingView() {
    await showMarketplace();
}

// Get active orders from blockchain for a specific address
async function getActiveOrdersFromBlockchain(offererAddress) {
    if (!ethersProvider) return [];

    try {
        const orderValidatedEventABI = [{
            "anonymous": false,
            "inputs": [
                {"indexed": false, "internalType": "bytes32", "name": "orderHash", "type": "bytes32"},
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
                    "indexed": false,
                    "internalType": "struct OrderParameters",
                    "name": "orderParameters",
                    "type": "tuple"
                }
            ],
            "name": "OrderValidated",
            "type": "event"
        }];

        const seaportContract = new ethers.Contract(MARKETPLACE_ADDRESS, orderValidatedEventABI, ethersProvider);

        // Get OrderValidated events for this offerer (last 10000 blocks)
        const currentBlock = await ethersProvider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 10000);

        console.log(`Fetching OrderValidated events from block ${fromBlock} to ${currentBlock}`);

        const filter = seaportContract.filters.OrderValidated();
        const events = await seaportContract.queryFilter(filter, fromBlock, currentBlock);

        console.log(`Found ${events.length} OrderValidated events total`);

        // Filter events for this specific offerer
        const offererEvents = events.filter(e =>
            e.args.orderParameters.offerer.toLowerCase() === offererAddress.toLowerCase()
        );

        console.log(`Found ${offererEvents.length} orders for address ${offererAddress}`);

        return offererEvents;
    } catch (error) {
        console.error('Error fetching orders from blockchain:', error);
        return [];
    }
}

// Display marketplace listings
async function showMarketplace() {
    let listings = JSON.parse(localStorage.getItem('veybListings') || '[]');

    // Clean up invalid listings (those without orderHash)
    const validListings = listings.filter(l => l.orderHash !== null && l.orderHash !== undefined);
    if (validListings.length !== listings.length) {
        console.log(`Removed ${listings.length - validListings.length} invalid listings without orderHash`);
        listings = validListings;
        localStorage.setItem('veybListings', JSON.stringify(listings));
    }

    console.log('All listings from localStorage:', listings);
    console.log('Current user:', userAddress);

    // Debug: show all orderHashes in localStorage
    console.log('All orderHashes in localStorage:', listings.map(l => ({ hash: l.orderHash, active: l.active, seller: l.seller })));

    // Show only other people's listings (not own)
    let activeListings = listings.filter(l =>
        l.active && l.seller.toLowerCase() !== userAddress.toLowerCase()
    );

    console.log('Active listings for marketplace (excluding own):', activeListings.length);

    // Fetch user's orders from blockchain
    if (ethersProvider && userAddress) {
        console.log('Fetching orders from blockchain for:', userAddress);
        const blockchainOrders = await getActiveOrdersFromBlockchain(userAddress);

        // Check status of blockchain orders and sync with localStorage
        if (blockchainOrders.length > 0) {
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

            for (const event of blockchainOrders) {
                const orderHash = event.args.orderHash;
                const orderParams = event.args.orderParameters;

                try {
                    const status = await seaportContract.getOrderStatus(orderHash);
                    const isCancelled = status.isCancelled;
                    const isFilled = status.totalFilled.gte(status.totalSize) && status.totalSize.gt(0);
                    const isActive = !isCancelled && !isFilled;

                    console.log(`Blockchain order ${orderHash} - Cancelled: ${isCancelled}, Filled: ${isFilled}, Active: ${isActive}`);

                    // Check if this order is in localStorage
                    const existsInDB = listings.find(l => l.orderHash === orderHash);

                    if (isActive) {
                        if (!existsInDB) {
                            console.log('Found active order not in localStorage, adding it');

                            // Get locked amount from veYB contract
                            const nftContract = new ethers.Contract(VEYB_NFT_ADDRESS, ERC721_ABI, ethersProvider);
                            let lockedAmount = 'N/A';
                            try {
                                const lockedData = await nftContract.locked(orderParams.offerer);
                                const amount = lockedData.amount;
                                lockedAmount = parseFloat(ethers.utils.formatEther(amount.abs())).toFixed(2);
                            } catch (error) {
                                console.error('Error getting locked amount:', error);
                            }

                            // Extract price from consideration
                            const priceInWei = orderParams.consideration[0].startAmount;
                            const price = parseFloat(ethers.utils.formatEther(priceInWei));

                            // Get transaction hash from event
                            const txHash = event.transactionHash;

                            // Reconstruct listing data with proper orderParameters object
                            const newListing = {
                                orderHash: orderHash,
                                orderParameters: {
                                    offerer: orderParams.offerer,
                                    zone: orderParams.zone,
                                    offer: orderParams.offer,
                                    consideration: orderParams.consideration,
                                    orderType: orderParams.orderType,
                                    startTime: orderParams.startTime,
                                    endTime: orderParams.endTime,
                                    zoneHash: orderParams.zoneHash,
                                    salt: orderParams.salt,
                                    conduitKey: orderParams.conduitKey,
                                    totalOriginalConsiderationItems: orderParams.totalOriginalConsiderationItems
                                },
                                price: price,
                                seller: orderParams.offerer,
                                tokenId: orderParams.offer[0].identifierOrCriteria.toString(),
                                lockedAmount: lockedAmount,
                                createdAt: Date.now(), // We don't have exact time, use current
                                txHash: txHash,
                                active: true
                            };

                            listings.push(newListing);
                            console.log('Added order to listings:', orderHash.slice(0, 10) + '...');

                            // If this is current user's order, save to myListing
                            if (orderParams.offerer.toLowerCase() === userAddress.toLowerCase()) {
                                localStorage.setItem(`myListing_${userAddress}`, JSON.stringify(newListing));
                            }
                        } else if (!existsInDB.active) {
                            console.log('Order exists in DB but marked inactive, reactivating');
                            existsInDB.active = true;
                        }
                    } else {
                        // Order is not active (cancelled or filled)
                        if (existsInDB && existsInDB.active) {
                            console.log('Order is cancelled/filled on-chain but still active in DB, deactivating');
                            existsInDB.active = false;

                            // Remove from myListing if it's user's listing
                            if (orderParams.offerer.toLowerCase() === userAddress.toLowerCase()) {
                                const myListing = localStorage.getItem(`myListing_${userAddress}`);
                                if (myListing) {
                                    const myListingData = JSON.parse(myListing);
                                    if (myListingData.orderHash === orderHash) {
                                        localStorage.removeItem(`myListing_${userAddress}`);
                                        console.log('Removed cancelled/filled listing from myListing');
                                    }
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error checking order status:', error);
                }
            }

            // Save updated listings to localStorage
            localStorage.setItem('veybListings', JSON.stringify(listings));
            console.log('Updated localStorage with blockchain orders');
        }

        // Also check status of existing listings in localStorage that weren't found in recent events
        const existingUserOrders = listings.filter(l =>
            l.active &&
            l.seller.toLowerCase() === userAddress.toLowerCase() &&
            l.orderHash
        );

        console.log(`Checking status of ${existingUserOrders.length} existing orders in localStorage`);
        console.log('Existing order hashes:', existingUserOrders.map(l => l.orderHash));

        if (existingUserOrders.length > 0) {
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

            for (const listing of existingUserOrders) {
                try {
                    const status = await seaportContract.getOrderStatus(listing.orderHash);
                    const isCancelled = status.isCancelled;
                    const isFilled = status.totalFilled.gte(status.totalSize) && status.totalSize.gt(0);
                    const isActive = !isCancelled && !isFilled;

                    console.log(`Existing order ${listing.orderHash} - Cancelled: ${isCancelled}, Filled: ${isFilled}, Active: ${isActive}`);

                    if (!isActive) {
                        console.log('Deactivating cancelled/filled order from localStorage');
                        listing.active = false;
                    }
                } catch (error) {
                    console.error('Error checking existing order status:', error);
                }
            }

            // Save after checking existing orders
            localStorage.setItem('veybListings', JSON.stringify(listings));
        }

        // Re-filter activeListings after all checks (only other people's listings)
        activeListings = listings.filter(l =>
            l.active && l.seller.toLowerCase() !== userAddress.toLowerCase()
        );
    }

    // Verify order status on-chain for listings from localStorage
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

    // Sort by createdAt (newest first)
    activeListings.sort((a, b) => b.createdAt - a.createdAt);

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

            // Handle BigNumber endTime
            let endTimeValue = listing.orderParameters.endTime;
            if (endTimeValue && endTimeValue.hex) {
                endTimeValue = parseInt(endTimeValue.hex, 16);
            } else if (endTimeValue && endTimeValue._hex) {
                endTimeValue = parseInt(endTimeValue._hex, 16);
            }
            const expiryDate = new Date(endTimeValue * 1000).toLocaleDateString();

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
                                ${listing.seller.slice(0, 6) + '...' + listing.seller.slice(-4)}
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
                        <button class="btn-buy" onclick='buyNFT(${JSON.stringify(listing).replace(/'/g, "&apos;")})'>
                            Buy for ${listing.price} ETH
                        </button>
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

        // Handle orderParameters - convert from array to object if needed
        let orderParams = listing.orderParameters;
        if (Array.isArray(orderParams)) {
            console.log('Converting orderParameters from array to object');
            orderParams = {
                offerer: orderParams[0],
                zone: orderParams[1],
                offer: orderParams[2],
                consideration: orderParams[3],
                orderType: orderParams[4],
                startTime: orderParams[5],
                endTime: orderParams[6],
                zoneHash: orderParams[7],
                salt: orderParams[8],
                conduitKey: orderParams[9],
                totalOriginalConsiderationItems: orderParams[10]
            };
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
            offerer: orderParams.offerer,
            zone: orderParams.zone,
            offer: orderParams.offer,
            consideration: orderParams.consideration,
            orderType: orderParams.orderType,
            startTime: orderParams.startTime,
            endTime: orderParams.endTime,
            zoneHash: orderParams.zoneHash,
            salt: orderParams.salt,
            conduitKey: orderParams.conduitKey,
            totalOriginalConsiderationItems: orderParams.totalOriginalConsiderationItems
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

        // Handle orderParameters - convert from array to object if needed
        let orderParams = listing.orderParameters;
        if (Array.isArray(orderParams)) {
            console.log('Converting orderParameters from array to object');
            orderParams = {
                offerer: orderParams[0],
                zone: orderParams[1],
                offer: orderParams[2],
                consideration: orderParams[3],
                orderType: orderParams[4],
                startTime: orderParams[5],
                endTime: orderParams[6],
                zoneHash: orderParams[7],
                salt: orderParams[8],
                conduitKey: orderParams[9],
                totalOriginalConsiderationItems: orderParams[10]
            };
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
            offerer: orderParams.offerer,
            zone: orderParams.zone,
            offer: orderParams.offer,
            consideration: orderParams.consideration,
            orderType: orderParams.orderType,
            startTime: orderParams.startTime,
            endTime: orderParams.endTime,
            zoneHash: orderParams.zoneHash,
            salt: orderParams.salt,
            conduitKey: orderParams.conduitKey,
            totalOriginalConsiderationItems: orderParams.totalOriginalConsiderationItems
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
    document.addEventListener('walletConnected', async () => {
        await showSellerDashboard();
        await showMarketplace();
    });
}
