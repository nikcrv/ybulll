// Loading flags to prevent duplicate calls
let isLoadingSellerDashboard = false;
let isLoadingMarketplace = false;

// Cache for loaded data
let cachedSellerListings = null;
let cachedMarketplaceListings = null;

// Cache for all blockchain events (shared between marketplace and seller dashboard)
let cachedBlockchainEvents = null;

// Current scan depth (in blocks)
let currentScanDepth = 100000; // Default: 14 days

// Current sort option
let currentSort = 'pricePerVeYB'; // Default: price per veYB

// Display seller's listing dashboard
async function showSellerDashboard(forceReload = false) {
    // If data is cached and not forcing reload, use cached data
    if (cachedSellerListings !== null && !forceReload) {
        console.log('Using cached seller listings');
        displaySellerListings(cachedSellerListings);
        return;
    }

    if (isLoadingSellerDashboard) {
        console.log('Seller dashboard already loading, skipping...');
        return;
    }

    console.log('Checking for listings of:', userAddress);

    if (!ethersProvider || !userAddress) {
        console.log('No provider or address');
        return;
    }

    // Show loading state
    const container = document.getElementById('myListingContainer');
    container.innerHTML = `
        <div class="empty-state">
            <div class="spinner" style="width: 48px; height: 48px; border-width: 4px; margin: 0 auto 20px;"></div>
            <h3>Loading your listings...</h3>
            <p id="sellerProgress">Fetching your active veYB NFT listings...</p>
        </div>
    `;

    isLoadingSellerDashboard = true;

    // Use cached blockchain events if available
    if (!cachedBlockchainEvents || !Array.isArray(cachedBlockchainEvents)) {
        console.log('No cached events available. Showing empty state.');
        isLoadingSellerDashboard = false;
        cachedSellerListings = [];
        displaySellerListings([]);
        return;
    }

    // Filter cached events by user address
    const blockchainOrders = cachedBlockchainEvents.filter(event =>
        event.args.orderParameters.offerer.toLowerCase() === userAddress.toLowerCase()
    );
    console.log(`Found ${blockchainOrders.length} orders for user from cached events`);

    if (blockchainOrders.length === 0) {
        console.log('No active listings found for this address');
        isLoadingSellerDashboard = false;
        cachedSellerListings = [];
        displaySellerListings([]);
        return;
    }

    const seaportContract = new ethers.Contract(MARKETPLACE_ADDRESS, SEAPORT_ABI, ethersProvider);
    const currentCounter = await seaportContract.getCounter(userAddress);
    console.log('Current counter for user:', currentCounter.toString());

    // Helper function to check if order can be fulfilled by validating counter directly
    async function isOrderFulfillable(orderParams, orderHash, currentCounter) {
        try {
            // Use Seaport's getOrderHash to compute hash with current counter
            const getOrderHashABI = [{
                "inputs": [{
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
                        {"internalType": "uint256", "name": "counter", "type": "uint256"}
                    ],
                    "internalType": "struct OrderComponents",
                    "name": "orderComponents",
                    "type": "tuple"
                }],
                "name": "getOrderHash",
                "outputs": [{"internalType": "bytes32", "name": "orderHash", "type": "bytes32"}],
                "stateMutability": "view",
                "type": "function"
            }];

            const hashContract = new ethers.Contract(MARKETPLACE_ADDRESS, getOrderHashABI, ethersProvider);

            // Build OrderComponents with current counter
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
                counter: currentCounter
            };

            // Calculate what the order hash would be with current counter
            const computedHash = await hashContract.getOrderHash(orderComponents);

            // Compare with actual order hash from event
            if (computedHash.toLowerCase() === orderHash.toLowerCase()) {
                console.log(`Order ${orderHash?.slice(0, 10)}... is FULFILLABLE ✓ (counter matches)`);
                return true;
            } else {
                console.log(`Order ${orderHash?.slice(0, 10)}... NOT fulfillable - Counter mismatch (order created with old counter)`);
                console.log(`  Expected hash: ${computedHash.slice(0, 20)}...`);
                console.log(`  Actual hash:   ${orderHash.slice(0, 20)}...`);
                return false;
            }
        } catch (error) {
            console.log(`Order ${orderHash?.slice(0, 10)}... NOT fulfillable - Error:`, error.reason || error.message || error.code);
            return false;
        }
    }

    // Get order status ABI
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

    const statusContract = new ethers.Contract(MARKETPLACE_ADDRESS, getOrderStatusABI, ethersProvider);

    // Cache for seller's own data (only one seller, so simple variable)
    const nftContract = new ethers.Contract(VEYB_NFT_ADDRESS, ERC721_ABI, ethersProvider);
    const lockedData = await nftContract.locked(userAddress);
    const userLockedAmount = lockedData.amount;
    const userLockEnd = lockedData.end;

    // Helper function to process a single seller order
    async function processSellerOrder(event) {
        const orderHash = event.args.orderHash;
        const orderParams = event.args.orderParameters;

        // Filter: Only show orders with YB token payment (not ETH or other tokens)
        if (orderParams.consideration.length === 0 ||
            orderParams.consideration[0].token.toLowerCase() !== YB_TOKEN_ADDRESS.toLowerCase()) {
            const paymentToken = orderParams.consideration.length > 0
                ? orderParams.consideration[0].token
                : 'none';
            console.log(`Order ${orderHash.slice(0, 10)}... - Not YB payment (token: ${paymentToken}), skipping`);
            return null;
        }

        try {
            // Quick checks first using seller's cached data
            const now = Math.floor(Date.now() / 1000);

            // Check if lock is active
            if (userLockEnd.lte(now)) {
                console.log(`Order ${orderHash.slice(0, 10)}... - Lock expired, skipping`);
                return null;
            }

            // Check if locked amount is > 0
            if (userLockedAmount.eq(0)) {
                console.log(`Order ${orderHash.slice(0, 10)}... - No locked amount, skipping`);
                return null;
            }

            // Check order status
            const status = await statusContract.getOrderStatus(orderHash);
            const isCancelled = status.isCancelled;
            const isFilled = status.totalFilled.gte(status.totalSize) && status.totalSize.gt(0);

            // Show all orders that getOrderStatus says are active
            const isActive = status.isValidated && !isCancelled && !isFilled;

            if (!isActive) return null;

            // Check if order can actually be fulfilled (validates counter directly)
            const isFulfillable = await isOrderFulfillable(orderParams, orderHash, currentCounter);

            console.log(`Order ${orderHash.slice(0, 10)}... - Cancelled: ${isCancelled}, Filled: ${isFilled}, Active: ${isActive}, Fulfillable: ${isFulfillable}`);

            if (!isFulfillable) return null;

            // Format locked amount
            const lockedAmount = parseFloat(ethers.utils.formatEther(userLockedAmount.abs())).toFixed(2);

            // Extract price from consideration
            const priceInWei = orderParams.consideration[0].startAmount;
            const price = parseFloat(ethers.utils.formatEther(priceInWei));

            // Get listing start time (convert BigNumber to number)
            let startTime = orderParams.startTime;
            if (startTime && startTime.toNumber) {
                startTime = startTime.toNumber();
            } else if (startTime && startTime._hex) {
                startTime = parseInt(startTime._hex, 16);
            }

            return {
                orderHash: orderHash,
                orderParameters: orderParams,
                price: price,
                seller: orderParams.offerer,
                tokenId: orderParams.offer[0].identifierOrCriteria.toString(),
                lockedAmount: lockedAmount,
                createdAt: startTime,
                txHash: event.transactionHash,
                active: true
            };
        } catch (error) {
            console.error('Error processing order:', error);
            return null;
        }
    }

    // Process all seller orders in parallel batches
    const myListings = [];
    const BATCH_SIZE = 100; // Process 100 seller orders at a time
    const totalBatches = Math.ceil(blockchainOrders.length / BATCH_SIZE);
    const sellerProgressEl = document.getElementById('sellerProgress');

    for (let i = 0; i < blockchainOrders.length; i += BATCH_SIZE) {
        const batch = blockchainOrders.slice(i, i + BATCH_SIZE);
        const currentBatch = Math.floor(i / BATCH_SIZE) + 1;

        if (sellerProgressEl) {
            sellerProgressEl.textContent = `Processing your orders: batch ${currentBatch} / ${totalBatches} (${myListings.length} active listings found)`;
        }

        console.log(`Processing seller batch ${currentBatch}/${totalBatches} (${batch.length} orders)`);

        const results = await Promise.all(batch.map(event => processSellerOrder(event)));

        // Filter out null results and add valid listings
        const validListings = results.filter(listing => listing !== null);
        myListings.push(...validListings);

        console.log(`Seller batch complete: found ${validListings.length} valid listings`);
    }

    // Sort by block number (newest first)
    myListings.sort((a, b) => b.createdAt - a.createdAt);

    console.log('My active listings:', myListings.length);
    console.log('My active listing hashes:', myListings.map(l => l.orderHash));

    // Cache the listings
    cachedSellerListings = myListings;
    isLoadingSellerDashboard = false;

    // Display the listings
    displaySellerListings(myListings);
}

// Function to display seller listings (uses cached data)
async function displaySellerListings(myListings) {
    const section = document.getElementById('myListingSection');
    const container = document.getElementById('myListingContainer');

    // Check voting power if user has listings
    let hasVotingPower = false;
    let votingPowerWarning = '';

    if (myListings.length > 0 && ethersProvider && userAddress) {
        try {
            const gaugeController = new ethers.Contract(GAUGE_CONTROLLER_ADDRESS, GAUGE_CONTROLLER_ABI, ethersProvider);
            const transferAllowed = await gaugeController.ve_transfer_allowed(userAddress);
            hasVotingPower = !transferAllowed; // If transfer NOT allowed, then has voting power

            if (hasVotingPower) {
                votingPowerWarning = `
                    <div class="info-panel" style="margin-bottom: 24px; background: rgba(255, 193, 7, 0.1); border-color: rgba(255, 193, 7, 0.3);">
                        <div style="padding: 16px;">
                            <h3 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 16px; font-weight: 600;">⚠️ Active Voting Power Detected</h3>
                            <p style="margin: 0 0 12px 0; color: var(--text-secondary); line-height: 1.6;">
                                Your veYB NFT cannot be transferred or sold while it has active voting power. Buyers will not be able to complete the purchase until you reset your votes.
                            </p>
                            <p style="margin: 0 0 16px 0; color: var(--text-secondary); line-height: 1.6; font-size: 13px;">
                                <strong>Note:</strong> You can only update votes on a gauge once every 10 days.
                            </p>
                            <div id="voteResetContainerListings" style="display: flex; gap: 12px;">
                                <div class="spinner" style="width: 24px; height: 24px; border-width: 2px; margin: 0 auto;"></div>
                                <p style="margin: 0; color: var(--text-secondary);">Checking last vote time...</p>
                            </div>
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error checking voting power:', error);
        }
    }

    if (myListings.length === 0) {
        console.log('No active listings found for this address');
        container.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                    <circle cx="32" cy="32" r="30" stroke="currentColor" stroke-width="2"/>
                    <path d="M32 20V32M32 38V40" stroke="currentColor" stroke-width="2"/>
                </svg>
                <h3>No active listings</h3>
                <p>You don't have any active veYB NFT listings. Create one to get started!</p>
            </div>
        `;
        return;
    }

    // Display all user's active listings with voting power warning if applicable
    container.innerHTML = votingPowerWarning + myListings.map(listing => {
        const createdDate = new Date(listing.createdAt * 1000).toLocaleDateString();

        // Handle BigNumber endTime
        let endTimeValue = listing.orderParameters.endTime;
        if (endTimeValue && endTimeValue.hex) {
            endTimeValue = parseInt(endTimeValue.hex, 16);
        } else if (endTimeValue && endTimeValue._hex) {
            endTimeValue = parseInt(endTimeValue._hex, 16);
        }
        const expiryDate = new Date(endTimeValue * 1000).toLocaleDateString();

        const pricePerVeYB = listing.lockedAmount ? (listing.price / parseFloat(listing.lockedAmount)).toFixed(4) : 'N/A';

        return `
            <div class="listing-card">
                <div class="listing-header">
                    <h3 class="listing-title">
                        veYB NFT #<a href="https://etherscan.io/nft/${VEYB_NFT_ADDRESS}/${listing.tokenId}" target="_blank" style="color: var(--primary); text-decoration: none;">${listing.tokenId.slice(0, 10)}...</a>
                    </h3>
                    <span class="listing-status active">Active</span>
                </div>
                <div class="listing-details">
                    <div class="detail-item">
                        <span class="detail-label">Locked Amount</span>
                        <span class="detail-value">${listing.lockedAmount ? parseFloat(listing.lockedAmount).toLocaleString() : 'N/A'} veYB</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Price</span>
                        <span class="detail-value">${listing.price.toFixed(4)} YB</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Price per veYB</span>
                        <span class="detail-value">${pricePerVeYB} YB</span>
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
                        <a href="https://etherscan.io/tx/${listing.txHash}" target="_blank" class="detail-value" style="font-size: 12px; font-family: monospace; color: var(--primary); text-decoration: none;">
                            ${listing.orderHash ? listing.orderHash.slice(0, 16) + '...' : 'N/A'}
                        </a>
                    </div>
                </div>
                <div class="listing-actions">
                    <button class="btn-cancel no-hover-effect" onclick='cancelListingByHash(${JSON.stringify(listing).replace(/'/g, "&apos;")})'>Cancel All Listings</button>
                    <a href="https://etherscan.io/tx/${listing.txHash}" target="_blank" class="btn-secondary no-hover-effect" style="text-decoration: none; display: inline-flex; align-items: center; padding: 12px 24px; background: var(--bg-dark); color: var(--text-primary); border-radius: 10px; font-size: 14px; font-weight: 600;">
                        View on Etherscan
                    </a>
                </div>
            </div>
        `;
    }).join('');

    // Attach event listener for reset votes button if voting power warning is shown
    if (hasVotingPower) {
        setTimeout(async () => {
            const container = document.getElementById('voteResetContainerListings');
            if (!container) return;

            // Check if getLastVoteTimestamp function is available
            if (typeof getLastVoteTimestamp !== 'function') {
                console.error('getLastVoteTimestamp function not found');
                container.innerHTML = `
                    <button id="resetVotesFromListingsBtn" class="btn-primary">
                        Reset All Votes
                    </button>
                    <a href="https://yieldbasis.com/vote" target="_blank" class="btn-secondary no-hover-effect" style="display: inline-flex; align-items: center; text-decoration: none;">
                        Go to Voting Page
                    </a>
                `;
                return;
            }

            const lastVoteTime = await getLastVoteTimestamp(userAddress);
            const now = Math.floor(Date.now() / 1000);
            const tenDaysInSeconds = 10 * 24 * 60 * 60;
            const timeSinceVote = now - lastVoteTime;
            const timeRemaining = tenDaysInSeconds - timeSinceVote;

            if (lastVoteTime === 0 || timeRemaining <= 0) {
                // Can reset now
                container.innerHTML = `
                    <button id="resetVotesFromListingsBtn" class="btn-primary">
                        Reset All Votes
                    </button>
                    <a href="https://yieldbasis.com/vote" target="_blank" class="btn-secondary no-hover-effect" style="display: inline-flex; align-items: center; text-decoration: none;">
                        Go to Voting Page
                    </a>
                `;

                const resetBtn = document.getElementById('resetVotesFromListingsBtn');
                if (resetBtn && typeof resetAllVotes === 'function') {
                    resetBtn.onclick = function(e) {
                        e.preventDefault();
                        resetAllVotes(this);
                    };
                }
            } else {
                // Must wait - show countdown
                const updateCountdown = () => {
                    const now = Math.floor(Date.now() / 1000);
                    const remaining = tenDaysInSeconds - (now - lastVoteTime);

                    if (remaining <= 0) {
                        // Time's up - reload listings
                        if (typeof showSellerDashboard === 'function') {
                            cachedSellerListings = null;
                            showSellerDashboard(true);
                        }
                        return;
                    }

                    const timeStr = typeof formatTimeRemaining === 'function' ? formatTimeRemaining(remaining) : `${Math.floor(remaining / 86400)}d remaining`;
                    container.innerHTML = `
                        <div style="padding: 12px; background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 8px; flex: 1;">
                            <p style="margin: 0 0 4px 0; font-size: 13px; color: var(--text-secondary);">Next vote reset available in:</p>
                            <p style="margin: 0; font-size: 18px; font-weight: 700; color: var(--primary);">${timeStr}</p>
                        </div>
                        <a href="https://yieldbasis.com/vote" target="_blank" class="btn-secondary no-hover-effect" style="display: inline-flex; align-items: center; text-decoration: none; white-space: nowrap;">
                            Go to Voting Page
                        </a>
                    `;
                };

                updateCountdown();
                // Update countdown every minute
                setInterval(updateCountdown, 60000);
            }
        }, 0);
    }

    // Section visibility is controlled by switchTab()
}

// Toggle listing view
async function toggleListingView() {
    await showMarketplace();
}

// Get active orders from blockchain for a specific address
// maxBlocks: number of blocks to scan, or 0 to scan from beginning
async function getActiveOrdersFromBlockchain(offererAddress, maxBlocks = 100000) {
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

        // Get OrderValidated events
        const currentBlock = await ethersProvider.getBlockNumber();
        const fromBlock = maxBlocks === 0 ? 0 : Math.max(0, currentBlock - maxBlocks);

        if (maxBlocks === 0) {
            console.log(`Fetching OrderValidated events from block ${fromBlock} to ${currentBlock} (entire blockchain)`);
        } else {
            console.log(`Fetching OrderValidated events from block ${fromBlock} to ${currentBlock} (${maxBlocks} blocks)`);
        }

        const filter = seaportContract.filters.OrderValidated();
        const events = await seaportContract.queryFilter(filter, fromBlock, currentBlock);

        console.log(`Found ${events.length} OrderValidated events total`);

        // Filter events for this specific offerer and YB token payment only
        const offererEvents = events.filter(e =>
            e.args.orderParameters.offerer.toLowerCase() === offererAddress.toLowerCase() &&
            e.args.orderParameters.consideration.length > 0 &&
            e.args.orderParameters.consideration[0].token.toLowerCase() === YB_TOKEN_ADDRESS.toLowerCase()
        );

        console.log(`Found ${offererEvents.length} YB orders for address ${offererAddress}`);

        return offererEvents;
    } catch (error) {
        console.error('Error fetching orders from blockchain:', error);
        return [];
    }
}

// Display marketplace listings
async function showMarketplace(forceReload = false) {
    // If data is cached and not forcing reload, use cached data
    if (cachedMarketplaceListings !== null && !forceReload) {
        console.log('Using cached marketplace listings');
        displayMarketplaceListings(cachedMarketplaceListings);
        return;
    }

    if (isLoadingMarketplace) {
        console.log('Marketplace already loading, skipping...');
        return;
    }

    console.log('Loading marketplace listings from blockchain...');

    if (!ethersProvider) {
        console.log('No provider available');
        return;
    }

    // Show loading state
    const container = document.getElementById('marketplaceListings');
    container.innerHTML = `
        <div class="empty-state">
            <div class="spinner" style="width: 48px; height: 48px; border-width: 4px; margin: 0 auto 20px;"></div>
            <h3>Loading marketplace...</h3>
            <p id="marketplaceProgress">Preparing to scan blockchain...</p>
        </div>
    `;

    isLoadingMarketplace = true;
    let activeListings = [];

    // Fetch ALL orders from blockchain (last 100000 blocks)
    if (ethersProvider) {
        console.log('Fetching all marketplace orders from blockchain...');

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

            const currentBlock = await ethersProvider.getBlockNumber();
            const totalBlocks = currentScanDepth;
            const fromBlock = Math.max(0, currentBlock - totalBlocks);
            const chunkSize = 50000; // Scan 50k blocks at a time

            console.log(`Fetching OrderValidated events from block ${fromBlock} to ${currentBlock} (${totalBlocks} blocks)`);

            // Get ALL OrderValidated events in chunks to show progress
            const filter = seaportContract.filters.OrderValidated();
            let allEvents = [];

            const progressEl = document.getElementById('marketplaceProgress');

            for (let start = fromBlock; start < currentBlock; start += chunkSize) {
                const end = Math.min(start + chunkSize, currentBlock);
                const scannedBlocks = start - fromBlock;
                const progressPercent = Math.floor((scannedBlocks / totalBlocks) * 100);

                if (progressEl) {
                    progressEl.textContent = `Scanning blocks ${scannedBlocks.toLocaleString()} / ${totalBlocks.toLocaleString()} (${progressPercent}%)`;
                }

                console.log(`Fetching events from block ${start} to ${end}`);
                const chunkEvents = await seaportContract.queryFilter(filter, start, end);
                allEvents = allEvents.concat(chunkEvents);
                console.log(`Found ${chunkEvents.length} events in this chunk (total: ${allEvents.length})`);
            }

            const events = allEvents;

            // Cache all events for reuse in seller dashboard
            cachedBlockchainEvents = events;

            if (progressEl) {
                progressEl.textContent = `Found ${events.length} total events. Processing orders...`;
            }

            console.log(`Found ${events.length} total OrderValidated events`);

            // Process orders
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

            const statusContract = new ethers.Contract(MARKETPLACE_ADDRESS, getOrderStatusABI, ethersProvider);

            // Get counter ABI
            const getCounterABI = [{
                "inputs": [{"internalType": "address", "name": "offerer", "type": "address"}],
                "name": "getCounter",
                "outputs": [{"internalType": "uint256", "name": "counter", "type": "uint256"}],
                "stateMutability": "view",
                "type": "function"
            }];

            // Cache for seller data (counter, balance, locked)
            const sellerDataCache = new Map();

            // Helper function to get seller data (cached)
            async function getSellerData(sellerAddress) {
                if (sellerDataCache.has(sellerAddress)) {
                    return sellerDataCache.get(sellerAddress);
                }

                const getCounterABI = [{
                    "inputs": [{"internalType": "address", "name": "offerer", "type": "address"}],
                    "name": "getCounter",
                    "outputs": [{"internalType": "uint256", "name": "counter", "type": "uint256"}],
                    "stateMutability": "view",
                    "type": "function"
                }];
                const counterContract = new ethers.Contract(MARKETPLACE_ADDRESS, getCounterABI, ethersProvider);
                const nftContract = new ethers.Contract(VEYB_NFT_ADDRESS, ERC721_ABI, ethersProvider);

                const [counter, balance, lockedData] = await Promise.all([
                    counterContract.getCounter(sellerAddress),
                    nftContract.balanceOf(sellerAddress),
                    nftContract.locked(sellerAddress)
                ]);

                const data = {
                    counter,
                    balance,
                    lockedAmount: lockedData.amount,
                    lockEnd: lockedData.end
                };

                sellerDataCache.set(sellerAddress, data);
                return data;
            }

            // Helper function to check if order can be fulfilled (validates counter automatically)
            async function isOrderFulfillableMarketplace(orderParams, orderHash, sellerData) {
                try {
                    const offererCounter = sellerData.counter;

                    // Use Seaport's getOrderHash to compute hash with current counter
                    const getOrderHashABI = [{
                        "inputs": [{
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
                                {"internalType": "uint256", "name": "counter", "type": "uint256"}
                            ],
                            "internalType": "struct OrderComponents",
                            "name": "orderComponents",
                            "type": "tuple"
                        }],
                        "name": "getOrderHash",
                        "outputs": [{"internalType": "bytes32", "name": "orderHash", "type": "bytes32"}],
                        "stateMutability": "view",
                        "type": "function"
                    }];

                    const hashContract = new ethers.Contract(MARKETPLACE_ADDRESS, getOrderHashABI, ethersProvider);

                    // Build OrderComponents with current counter
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
                        counter: offererCounter
                    };

                    // Calculate what the order hash would be with current counter
                    const computedHash = await hashContract.getOrderHash(orderComponents);

                    // Compare with actual order hash from event
                    if (computedHash.toLowerCase() === orderHash.toLowerCase()) {
                        console.log(`Marketplace order ${orderHash?.slice(0, 10)}... is FULFILLABLE ✓ (counter matches)`);
                        return true;
                    } else {
                        console.log(`Marketplace order ${orderHash?.slice(0, 10)}... NOT fulfillable - Counter mismatch`);
                        return false;
                    }
                } catch (error) {
                    console.log(`Marketplace order ${orderHash?.slice(0, 10)}... NOT fulfillable - Error:`, error.reason || error.message || error.code);
                    return false;
                }
            }

            // Helper function to process a single order
            async function processOrder(event) {
                const orderHash = event.args.orderHash;
                const orderParams = event.args.orderParameters;

                // Filter: Only show orders with YB token payment (not ETH or other tokens)
                if (orderParams.consideration.length === 0 ||
                    orderParams.consideration[0].token.toLowerCase() !== YB_TOKEN_ADDRESS.toLowerCase()) {
                    const paymentToken = orderParams.consideration.length > 0
                        ? orderParams.consideration[0].token
                        : 'none';
                    console.log(`Order ${orderHash.slice(0, 10)}... - Not YB payment (token: ${paymentToken}), skipping`);
                    return null;
                }

                // Skip own orders
                if (userAddress && orderParams.offerer.toLowerCase() === userAddress.toLowerCase()) {
                    return null;
                }

                try {
                    // Get seller data (cached if already fetched for this seller)
                    const sellerData = await getSellerData(orderParams.offerer);

                    // Check seller's voting power - skip if they have active voting power
                    try {
                        const gaugeController = new ethers.Contract(GAUGE_CONTROLLER_ADDRESS, GAUGE_CONTROLLER_ABI, ethersProvider);
                        const transferAllowed = await gaugeController.ve_transfer_allowed(orderParams.offerer);

                        if (!transferAllowed) {
                            console.log(`Order ${orderHash.slice(0, 10)}... - Seller has active voting power (transfer not allowed), skipping`);
                            return null;
                        }
                    } catch (error) {
                        console.log(`Order ${orderHash.slice(0, 10)}... - Error checking seller voting power:`, error);
                        // Continue processing if voting power check fails
                    }

                    // Quick checks first using cached data
                    // Check NFT balance
                    if (sellerData.balance.eq(0)) {
                        console.log(`Order ${orderHash.slice(0, 10)}... - Seller has no NFT, skipping`);
                        return null;
                    }

                    // Check if lock is active
                    const now = Math.floor(Date.now() / 1000);
                    if (sellerData.lockEnd.lte(now)) {
                        console.log(`Order ${orderHash.slice(0, 10)}... - Lock expired, skipping`);
                        return null;
                    }

                    // Check if locked amount is > 0
                    if (sellerData.lockedAmount.eq(0)) {
                        console.log(`Order ${orderHash.slice(0, 10)}... - No locked amount, skipping`);
                        return null;
                    }

                    // Now check order status (contract call)
                    const status = await statusContract.getOrderStatus(orderHash);
                    const isCancelled = status.isCancelled;
                    const isFilled = status.totalFilled.gte(status.totalSize) && status.totalSize.gt(0);

                    // Show all orders that getOrderStatus says are active
                    const isActive = status.isValidated && !isCancelled && !isFilled;

                    if (!isActive) return null;

                    // Check if order can actually be fulfilled (validates counter using cached data)
                    const isFulfillable = await isOrderFulfillableMarketplace(orderParams, orderHash, sellerData);

                    if (!isFulfillable) return null;

                    console.log(`Order ${orderHash.slice(0, 10)}... - Active: true`);

                    // Format locked amount
                    const lockedAmount = parseFloat(ethers.utils.formatEther(sellerData.lockedAmount.abs())).toFixed(2);

                    // Extract price from consideration
                    const priceInWei = orderParams.consideration[0].startAmount;
                    const price = parseFloat(ethers.utils.formatEther(priceInWei));

                    // Get listing start time (convert BigNumber to number)
                    let startTime = orderParams.startTime;
                    if (startTime && startTime.toNumber) {
                        startTime = startTime.toNumber();
                    } else if (startTime && startTime._hex) {
                        startTime = parseInt(startTime._hex, 16);
                    }

                    return {
                        orderHash: orderHash,
                        orderParameters: orderParams,
                        price: price,
                        seller: orderParams.offerer,
                        tokenId: orderParams.offer[0].identifierOrCriteria.toString(),
                        lockedAmount: lockedAmount,
                        createdAt: startTime,
                        txHash: event.transactionHash,
                        active: true
                    };
                } catch (error) {
                    console.error('Error processing order:', error);
                    return null;
                }
            }

            // Process all orders in parallel batches
            const BATCH_SIZE = 100; // Process 100 orders at a time
            const totalBatches = Math.ceil(events.length / BATCH_SIZE);

            for (let i = 0; i < events.length; i += BATCH_SIZE) {
                const batch = events.slice(i, i + BATCH_SIZE);
                const currentBatch = Math.floor(i / BATCH_SIZE) + 1;

                if (progressEl) {
                    progressEl.textContent = `Processing orders: batch ${currentBatch} / ${totalBatches} (${activeListings.length} valid listings found)`;
                }

                console.log(`Processing batch ${currentBatch}/${totalBatches} (${batch.length} orders)`);

                const results = await Promise.all(batch.map(event => processOrder(event)));

                // Filter out null results and add valid listings
                const validListings = results.filter(listing => listing !== null);
                activeListings.push(...validListings);

                console.log(`Batch complete: found ${validListings.length} valid listings`);
            }

            console.log(`Found ${activeListings.length} active marketplace listings`);
        } catch (error) {
            console.error('Error fetching marketplace orders:', error);
            isLoadingMarketplace = false;
        }
    }

    console.log('Active listings for marketplace:', activeListings);

    // Cache the listings
    cachedMarketplaceListings = activeListings;
    isLoadingMarketplace = false;

    // Display the listings
    displayMarketplaceListings(activeListings);
}

// Function to display marketplace listings (uses cached data)
function displayMarketplaceListings(activeListings) {
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
        // Sort listings based on current sort option
        const sortedListings = [...activeListings].sort((a, b) => {
            switch (currentSort) {
                case 'pricePerVeYB':
                    // Price per veYB (ascending - cheapest first)
                    const pricePerA = a.lockedAmount ? (a.price / parseFloat(a.lockedAmount)) : Infinity;
                    const pricePerB = b.lockedAmount ? (b.price / parseFloat(b.lockedAmount)) : Infinity;
                    return pricePerA - pricePerB;

                case 'price':
                    // Total price (ascending - cheapest first)
                    return a.price - b.price;

                case 'amount':
                    // veYB amount (descending - largest first)
                    const amountA = parseFloat(a.lockedAmount) || 0;
                    const amountB = parseFloat(b.lockedAmount) || 0;
                    return amountB - amountA;

                case 'date':
                    // Date listed (descending - newest first)
                    return b.createdAt - a.createdAt;

                default:
                    return 0;
            }
        });
        container.innerHTML = sortedListings.map((listing, index) => {
            const createdDate = new Date(listing.createdAt * 1000).toLocaleDateString();

            // Handle BigNumber endTime
            let endTimeValue = listing.orderParameters.endTime;
            if (endTimeValue && endTimeValue.hex) {
                endTimeValue = parseInt(endTimeValue.hex, 16);
            } else if (endTimeValue && endTimeValue._hex) {
                endTimeValue = parseInt(endTimeValue._hex, 16);
            }
            const expiryDate = new Date(endTimeValue * 1000).toLocaleDateString();

            // Calculate price per veYB
            const pricePerVeYB = listing.lockedAmount ? (listing.price / parseFloat(listing.lockedAmount)).toFixed(4) : 'N/A';

            return `
                <div class="listing-card">
                    <div class="listing-content">
                        <div class="listing-details">
                            <div class="detail-item">
                                <span class="detail-label">Price per veYB</span>
                                <span class="detail-value" style="color: var(--primary); font-size: 18px; font-weight: 700;">${pricePerVeYB} YB</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Amount</span>
                                <span class="detail-value" style="font-weight: 600;">${listing.lockedAmount ? parseFloat(listing.lockedAmount).toLocaleString() : 'N/A'} veYB</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Total Price</span>
                                <span class="detail-value" style="font-weight: 600;">${listing.price.toFixed(4)} YB</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Seller</span>
                                <a href="https://etherscan.io/address/${listing.seller}" target="_blank" class="detail-value" style="font-size: 13px; font-family: monospace; color: var(--primary); text-decoration: none;">
                                    ${listing.seller.slice(0, 6) + '...' + listing.seller.slice(-4)}
                                </a>
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
                    </div>
                    <div class="listing-buy-section">
                        <button class="btn-buy" id="buyBtn-${index}" data-listing-index="${index}" onclick='buyNFT(${JSON.stringify(listing).replace(/'/g, "&apos;")}, ${index})'>
                            Buy for ${listing.price.toFixed(4)} YB
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Check YB allowance for all buy buttons
        updateBuyButtonsText(sortedListings);
    }

    // Section visibility is controlled by switchTab()
}

// Update buy button text based on YB allowance
async function updateBuyButtonsText(listings) {
    if (!userAddress || !ethersProvider) return;

    try {
        // Check YB allowance
        const ybTokenContract = new ethers.Contract(YB_TOKEN_ADDRESS, YB_TOKEN_ABI, ethersProvider);
        const allowance = await ybTokenContract.allowance(userAddress, MARKETPLACE_ADDRESS);

        listings.forEach((listing, index) => {
            const btn = document.getElementById(`buyBtn-${index}`);
            if (!btn) return;

            // Check allowance
            const priceInWei = ethers.utils.parseEther(listing.price.toString());

            if (allowance.lt(priceInWei)) {
                // Need approval
                btn.textContent = `Approve & Buy for ${listing.price.toFixed(4)} YB`;
            } else {
                // Already approved
                btn.textContent = `Buy for ${listing.price.toFixed(4)} YB`;
            }
        });
    } catch (error) {
        console.error('Error checking YB allowance:', error);
    }
}


// Show permalock required modal
function showPermalockModal(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('permalockModal');
        const messageEl = document.getElementById('permalockModalMessage');
        const confirmBtn = document.getElementById('permalockModalConfirm');
        const cancelBtn = document.getElementById('permalockModalCancel');

        messageEl.textContent = message;
        modal.style.display = 'flex';

        function handleConfirm() {
            modal.style.display = 'none';
            cleanup();
            resolve(true);
        }

        function handleCancel() {
            modal.style.display = 'none';
            cleanup();
            resolve(false);
        }

        function cleanup() {
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            modal.removeEventListener('click', handleOverlayClick);
        }

        function handleOverlayClick(e) {
            if (e.target === modal) {
                handleCancel();
            }
        }

        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        modal.addEventListener('click', handleOverlayClick);
    });
}

// Show success modal
function showSuccessModal(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('successModal');
        const messageEl = document.getElementById('successModalMessage');
        const closeBtn = document.getElementById('successModalClose');

        messageEl.textContent = message;
        modal.style.display = 'flex';

        function handleClose() {
            modal.style.display = 'none';
            cleanup();
            resolve();
        }

        function cleanup() {
            closeBtn.removeEventListener('click', handleClose);
            modal.removeEventListener('click', handleOverlayClick);
        }

        function handleOverlayClick(e) {
            if (e.target === modal) {
                handleClose();
            }
        }

        closeBtn.addEventListener('click', handleClose);
        modal.addEventListener('click', handleOverlayClick);

        // Re-init button gradient for the modal button
        if (typeof initButtonGradients === 'function') {
            setTimeout(() => {
                const buttons = modal.querySelectorAll('.btn-primary, .btn-secondary');
                buttons.forEach(button => {
                    button.addEventListener('mousemove', handleButtonHover);
                    button.addEventListener('mouseleave', handleButtonLeave);
                });
            }, 0);
        }
    });
}

// Cancel all listings by incrementing counter (for marketplace listings)
async function cancelListingByHash(listing) {
    if (!confirm('Are you sure you want to cancel ALL your listings? This will send a blockchain transaction.')) return;

    if (!ethersProvider || !signer) {
        showToast('Please connect your wallet');
        return;
    }

    try {
        showToast('Preparing cancellation...');

        console.log('Canceling all listings for user:', userAddress);

        // Verify ownership
        if (listing && listing.seller && listing.seller.toLowerCase() !== userAddress.toLowerCase()) {
            showToast('You can only cancel your own listings');
            return;
        }

        // Use incrementCounter to invalidate all previous orders
        const incrementCounterABI = [{
            "inputs": [],
            "name": "incrementCounter",
            "outputs": [{"internalType": "uint256", "name": "newCounter", "type": "uint256"}],
            "stateMutability": "nonpayable",
            "type": "function"
        }];

        const seaportContract = new ethers.Contract(MARKETPLACE_ADDRESS, incrementCounterABI, signer);

        const tx = await seaportContract.incrementCounter();

        showToast('Transaction submitted...', 'success');

        await tx.wait();

        showToast('All listings cancelled successfully!', 'success');

        // Clear cache and reload data
        cachedSellerListings = null;
        cachedMarketplaceListings = null;
        cachedBlockchainEvents = null;

        setTimeout(() => {
            showMarketplace(true); // Load marketplace first to populate events cache
            showSellerDashboard(true);
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
async function buyNFT(listing, buttonIndex) {
    if (!ethersProvider || !signer) {
        showToast('Please connect your wallet first');
        return;
    }

    // Get button element for loading state
    const buyBtn = buttonIndex !== undefined ? document.getElementById(`buyBtn-${buttonIndex}`) : null;
    const originalBtnText = buyBtn ? buyBtn.innerHTML : '';

    // Helper to set button loading state
    function setBtnLoading(isLoading, text) {
        if (!buyBtn) return;

        if (isLoading) {
            buyBtn.disabled = true;
            buyBtn.classList.add('btn-loading');
            buyBtn.innerHTML = `
                ${text}
                <div class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>
            `;
        } else {
            buyBtn.disabled = false;
            buyBtn.classList.remove('btn-loading');
            buyBtn.innerHTML = originalBtnText;
        }
    }

    try {
        setBtnLoading(true, 'Preparing...');
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

        // Check if buyer has veYB NFT with permalock
        setBtnLoading(true, 'Checking permalock...');
        const nftContract = new ethers.Contract(VEYB_NFT_ADDRESS, ERC721_ABI, ethersProvider);

        // Check if buyer has veYB NFT
        const buyerBalance = await nftContract.balanceOf(userAddress);
        if (buyerBalance.eq(0)) {
            setBtnLoading(false);
            const shouldRedirect = await showPermalockModal(
                'The veYB NFT contract requires both seller and buyer to have permalock for transfers. ' +
                'You need to lock any amount of veYB (even minimal) and apply permalock to be able to purchase. ' +
                'Click "Go to Lock Page" to create your permalock.'
            );
            if (shouldRedirect) {
                window.open('https://yieldbasis.com/lock', '_blank');
            }
            return;
        }

        // Check if buyer has permalock
        const buyerLockedData = await nftContract.locked(userAddress);
        const buyerLockEnd = buyerLockedData.end;
        const now = Math.floor(Date.now() / 1000);
        const tenYearsFromNow = now + (10 * 365 * 24 * 60 * 60);
        const buyerHasPermalock = buyerLockEnd.gt(tenYearsFromNow);

        if (!buyerHasPermalock) {
            setBtnLoading(false);
            const shouldRedirect = await showPermalockModal(
                'The veYB NFT contract requires both seller and buyer to have permalock for transfers. ' +
                'You have veYB locked, but without permalock. Please apply permalock to be able to purchase.'
            );
            if (shouldRedirect) {
                window.open('https://yieldbasis.com/lock', '_blank');
            }
            return;
        }

        // Check YB token balance
        setBtnLoading(true, 'Checking balance...');
        const ybTokenContract = new ethers.Contract(YB_TOKEN_ADDRESS, YB_TOKEN_ABI, signer);
        const ybBalance = await ybTokenContract.balanceOf(userAddress);
        const priceInWei = ethers.utils.parseEther(listing.price.toString());

        if (ybBalance.lt(priceInWei)) {
            const formattedBalance = ethers.utils.formatEther(ybBalance);
            showToast(`Insufficient YB balance. You have ${parseFloat(formattedBalance).toFixed(4)} YB, need ${listing.price.toFixed(4)} YB`);
            setBtnLoading(false);
            return;
        }

        // Check YB token allowance
        setBtnLoading(true, 'Checking approval...');
        const allowance = await ybTokenContract.allowance(userAddress, MARKETPLACE_ADDRESS);

        if (allowance.lt(priceInWei)) {
            setBtnLoading(true, 'Waiting for approval...');
            showToast('Approving YB tokens...', 'info');

            // Approve YB tokens for Seaport
            const approveTx = await ybTokenContract.approve(MARKETPLACE_ADDRESS, ethers.constants.MaxUint256);

            setBtnLoading(true, 'Confirming approval...');
            await approveTx.wait();

            showToast('YB tokens approved successfully', 'success');
        }

        setBtnLoading(true, 'Waiting for signature...');
        showToast('Confirming purchase...', 'info');

        // Call fulfillOrder WITHOUT sending ETH
        const tx = await seaportContract.fulfillOrder(
            order,
            ethers.constants.HashZero
        );

        setBtnLoading(true, 'Processing transaction...');
        showToast('Transaction submitted...', 'success');

        const receipt = await tx.wait();

        setBtnLoading(false);

        // Update wallet veYB info
        if (typeof checkApprovalStatus === 'function') {
            await checkApprovalStatus();
        }

        // Show success modal
        const lockedAmount = listing.lockedAmount ? parseFloat(listing.lockedAmount).toLocaleString() : 'N/A';
        await showSuccessModal(
            `You have successfully purchased ${lockedAmount} veYB NFT for ${listing.price.toFixed(4)} YB!`
        );

        // Clear cache and reload data
        cachedSellerListings = null;
        cachedMarketplaceListings = null;
        cachedBlockchainEvents = null;

        showMarketplace(true);

    } catch (error) {
        console.error('Error buying NFT:', error);

        setBtnLoading(false);

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

// Initialize scan depth and sort selectors
document.addEventListener('DOMContentLoaded', () => {
    const scanDepthSelect = document.getElementById('scanDepthSelect');
    const sortSelect = document.getElementById('sortSelect');

    // Load saved scan depth from localStorage
    const savedDepth = localStorage.getItem('marketplaceScanDepth');
    if (savedDepth) {
        currentScanDepth = parseInt(savedDepth);
        if (scanDepthSelect) {
            scanDepthSelect.value = savedDepth;
        }
    }

    // Load saved sort option from localStorage
    const savedSort = localStorage.getItem('marketplaceSort');
    if (savedSort) {
        currentSort = savedSort;
        if (sortSelect) {
            sortSelect.value = savedSort;
        }
    }

    // Handle scan depth change - automatically reload marketplace
    if (scanDepthSelect) {
        scanDepthSelect.addEventListener('change', async (e) => {
            if (isLoadingMarketplace) {
                showToast('Marketplace is already loading...');
                return;
            }

            currentScanDepth = parseInt(e.target.value);
            localStorage.setItem('marketplaceScanDepth', currentScanDepth.toString());
            console.log('Scan depth changed to:', currentScanDepth, 'blocks');

            const depthText = e.target.options[e.target.selectedIndex].text;
            showToast(`Loading marketplace for ${depthText}...`, 'info');

            // Clear cache and reload
            cachedMarketplaceListings = null;
            cachedBlockchainEvents = null;
            cachedSellerListings = null;

            await showMarketplace(true);
        });
    }

    // Handle sort change - re-display with new sorting
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            currentSort = e.target.value;
            localStorage.setItem('marketplaceSort', currentSort);
            console.log('Sort changed to:', currentSort);

            // Re-display marketplace with new sorting (uses cached data)
            if (cachedMarketplaceListings !== null) {
                displayMarketplaceListings(cachedMarketplaceListings);
            }
        });
    }
});

// Initialize on wallet connection
if (typeof window !== 'undefined') {
    const originalInitializeWallet = window.initializeWallet;
    // This will be called after wallet connects
    document.addEventListener('walletConnected', async () => {
        await showSellerDashboard();
        await showMarketplace();
    });
}
