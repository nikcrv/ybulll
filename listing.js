// Global variable to store user's veYB amount
let userVeYBAmount = 0;

// Update price preview
function updatePricePreview() {
    const priceInput = document.getElementById('priceInput');
    const durationInput = document.getElementById('durationInput');
    const totalPricePreview = document.getElementById('totalPricePreview');
    const pricePerVeYBPreview = document.getElementById('pricePerVeYBPreview');
    const expiryDate = document.getElementById('expiryDate');
    const pricingModeTotal = document.getElementById('pricingModeTotal');

    const inputValue = parseFloat(priceInput.value) || 0;

    let totalPrice, pricePerVeYB;

    if (pricingModeTotal.checked) {
        // Input is total price
        totalPrice = inputValue;
        pricePerVeYB = userVeYBAmount > 0 ? totalPrice / userVeYBAmount : 0;
    } else {
        // Input is price per veYB
        pricePerVeYB = inputValue;
        totalPrice = pricePerVeYB * userVeYBAmount;
    }

    totalPricePreview.textContent = `${totalPrice.toFixed(4)} YB`;
    pricePerVeYBPreview.textContent = `${pricePerVeYB.toFixed(4)} YB`;

    const durationValue = durationInput.value;

    // Handle indefinite listing
    if (durationValue === 'indefinite') {
        expiryDate.textContent = 'Never expires';
    } else {
        const days = parseFloat(durationValue);
        const expiryTimestamp = Math.floor(Date.now() / 1000) + (days * 24 * 60 * 60);
        const expiryDateObj = new Date(expiryTimestamp * 1000);

        // Format expiry date and time
        if (days < 1) {
            // For durations less than 1 day, show time as well
            expiryDate.textContent = expiryDateObj.toLocaleString();
        } else {
            expiryDate.textContent = expiryDateObj.toLocaleDateString();
        }
    }
}

// Update pricing mode (label and placeholder)
function updatePricingMode() {
    const pricingModeTotal = document.getElementById('pricingModeTotal');
    const priceInputLabel = document.getElementById('priceInputLabel');
    const priceInput = document.getElementById('priceInput');

    if (pricingModeTotal.checked) {
        priceInputLabel.textContent = 'Total Price (YB)';
        // Dynamic placeholder: 0.9 * veYB amount
        const totalPlaceholder = userVeYBAmount > 0 ? (userVeYBAmount * 0.9).toFixed(2) : '0.9';
        priceInput.placeholder = totalPlaceholder;
    } else {
        priceInputLabel.textContent = 'Price per veYB (YB)';
        priceInput.placeholder = '0.9';
    }

    // Clear input when switching modes
    priceInput.value = '';
    updatePricePreview();
}

// Update selling amount display
function updateSellingAmount(amount) {
    userVeYBAmount = amount;
    const sellingAmount = document.getElementById('sellingAmount');
    if (sellingAmount) {
        sellingAmount.textContent = `${amount.toLocaleString()} veYB`;
    }

    // Update placeholder for Total Price mode
    const pricingModeTotal = document.getElementById('pricingModeTotal');
    const priceInput = document.getElementById('priceInput');
    if (pricingModeTotal && pricingModeTotal.checked && priceInput) {
        const totalPlaceholder = amount > 0 ? (amount * 0.9).toFixed(2) : '0.9';
        priceInput.placeholder = totalPlaceholder;
    }

    updatePricePreview();
}

// Create Seaport listing
async function createListing() {
    if (!ethersProvider || !signer || !userAddress) {
        showToast('Please connect your wallet first');
        return;
    }

    const priceInput = document.getElementById('priceInput');
    const durationInput = document.getElementById('durationInput');
    const createListingBtn = document.getElementById('createListingBtn');
    const pricingModeTotal = document.getElementById('pricingModeTotal');

    const inputValue = parseFloat(priceInput.value);
    if (!inputValue || inputValue <= 0) {
        showToast('Please enter a valid price');
        return;
    }

    // Calculate final total price and price per veYB based on pricing mode
    let finalPrice, pricePerVeYB;
    if (pricingModeTotal.checked) {
        // Input is total price
        finalPrice = inputValue;
        pricePerVeYB = userVeYBAmount > 0 ? finalPrice / userVeYBAmount : 0;
    } else {
        // Input is price per veYB - calculate total
        pricePerVeYB = inputValue;
        finalPrice = pricePerVeYB * userVeYBAmount;
    }

    // Validate minimum total price
    if (finalPrice < 0.1) {
        showToast('Total price must be at least 0.1 YB');
        return;
    }

    // Warning if price per veYB is less than 0.3
    if (pricePerVeYB < 0.3) {
        const confirmed = confirm(
            `⚠️ Warning: Low Price Alert!\n\n` +
            `You are selling at ${pricePerVeYB.toFixed(4)} YB per veYB.\n` +
            `This is less than 0.3 YB per veYB.\n\n` +
            `Total you will receive: ${finalPrice.toFixed(4)} YB\n` +
            `For ${userVeYBAmount.toLocaleString()} veYB\n\n` +
            `Are you sure you want to continue with this low price?`
        );

        if (!confirmed) {
            return;
        }
    }

    // Check if approved first
    try {
        const nftContract = new ethers.Contract(VEYB_NFT_ADDRESS, ERC721_ABI, ethersProvider);
        const isApproved = await nftContract.isApprovedForAll(userAddress, MARKETPLACE_ADDRESS);

        if (!isApproved) {
            showToast('Please approve the marketplace first (Step 1)');
            return;
        }

        // Check if user has NFT
        const balance = await nftContract.balanceOf(userAddress);
        if (balance.eq(0)) {
            showToast('You do not have a veYB NFT to sell');
            return;
        }
    } catch (error) {
        console.error('Error checking prerequisites:', error);
        showToast('Error checking NFT status');
        return;
    }

    const originalText = createListingBtn.innerHTML;

    try {
        createListingBtn.disabled = true;
        createListingBtn.classList.add('btn-loading');
        createListingBtn.textContent = 'Checking for active listings...';

        // Get current counter first
        const getCounterABI = [{
            "inputs": [{"internalType": "address", "name": "offerer", "type": "address"}],
            "name": "getCounter",
            "outputs": [{"internalType": "uint256", "name": "counter", "type": "uint256"}],
            "stateMutability": "view",
            "type": "function"
        }];
        const counterContract = new ethers.Contract(MARKETPLACE_ADDRESS, getCounterABI, ethersProvider);
        const currentCounter = await counterContract.getCounter(userAddress);
        console.log('Current counter for user:', currentCounter.toString());

        // Check if user has any active listings from blockchain (scan entire blockchain)
        const blockchainOrders = await getActiveOrdersFromBlockchain(userAddress, 0);
        console.log(`Found ${blockchainOrders.length} OrderValidated events for user`);

        // Filter only orders that match current counter (truly active)
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

        // Check which orders match current counter (same logic as My Active Listings)
        const activeOrders = [];

        // Get order status checker
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

        for (const event of blockchainOrders) {
            const orderHash = event.args.orderHash;
            const orderHashLower = orderHash.toLowerCase();
            const orderParams = event.args.orderParameters;

            try {
                // Check order status first
                const status = await statusContract.getOrderStatus(orderHash);
                const isCancelled = status.isCancelled;
                const isFilled = status.totalFilled.gte(status.totalSize) && status.totalSize.gt(0);
                const isActive = status.isValidated && !isCancelled && !isFilled;

                if (!isActive) {
                    console.log(`Order ${orderHash.slice(0, 10)}... is cancelled or filled via getOrderStatus, skipping`);
                    continue;
                }

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

                // If hashes match, order is still active
                if (computedHash.toLowerCase() === orderHashLower) {
                    activeOrders.push(event);
                    console.log(`Order ${orderHash.slice(0, 10)}... is truly active with current counter`);
                } else {
                    console.log(`Order ${orderHash.slice(0, 10)}... counter mismatch (invalidated), skipping`);
                }
            } catch (error) {
                console.error('Error checking order counter:', error);
            }
        }

        console.log(`Found ${blockchainOrders.length} total events, ${activeOrders.length} truly active with current counter`);

        // If user has active listings, cancel them by incrementing counter
        if (activeOrders.length > 0) {
            try {
                showToast('Canceling previous listings...', 'info');
                createListingBtn.textContent = 'Canceling previous listings...';

                const incrementCounterABI = [{
                    "inputs": [],
                    "name": "incrementCounter",
                    "outputs": [{"internalType": "uint256", "name": "newCounter", "type": "uint256"}],
                    "stateMutability": "nonpayable",
                    "type": "function"
                }];

                const incrementContract = new ethers.Contract(MARKETPLACE_ADDRESS, incrementCounterABI, signer);
                const incrementTx = await incrementContract.incrementCounter();
                await incrementTx.wait();

                showToast('Previous listings cancelled', 'success');
            } catch (error) {
                console.error('Error incrementing counter:', error);
                showToast('Error canceling previous listings', 'error');
                throw error; // Stop listing creation if cancellation fails
            }
        }

        createListingBtn.textContent = 'Creating listing...';

        // Get tokenId (for veYB it's the user's address as uint256)
        // Convert address to BigNumber
        const tokenId = ethers.BigNumber.from(userAddress);

        // Convert final price to wei
        const priceInWei = ethers.utils.parseEther(finalPrice.toString());

        // Calculate timestamps
        const startTime = Math.floor(Date.now() / 1000);
        const durationValue = durationInput.value;

        let endTime;
        if (durationValue === 'indefinite') {
            // Set endTime to year 2100 (Jan 1, 2100 00:00:00 UTC)
            endTime = 4102444800;
        } else {
            const days = parseFloat(durationValue);
            endTime = startTime + Math.floor(days * 24 * 60 * 60);
        }

        const salt = ethers.BigNumber.from(startTime);

        // Build OrderParameters (AFTER incrementCounter to use new counter)
        const orderParameters = {
            offerer: userAddress,
            zone: ethers.constants.AddressZero,
            offer: [
                {
                    itemType: 2, // ERC721
                    token: VEYB_NFT_ADDRESS,
                    identifierOrCriteria: tokenId,
                    startAmount: ethers.BigNumber.from(1),
                    endAmount: ethers.BigNumber.from(1)
                }
            ],
            consideration: [
                {
                    itemType: 1, // ERC20 (YB Token)
                    token: YB_TOKEN_ADDRESS,
                    identifierOrCriteria: ethers.BigNumber.from(0),
                    startAmount: priceInWei,
                    endAmount: priceInWei,
                    recipient: userAddress
                }
            ],
            orderType: 0, // FULL_OPEN
            startTime: startTime,
            endTime: endTime,
            zoneHash: ethers.constants.HashZero,
            salt: salt,
            conduitKey: ethers.constants.HashZero,
            totalOriginalConsiderationItems: 1
        };

        createListingBtn.textContent = 'Waiting for confirmation...';

        // Call validate on Seaport contract
        const seaportContract = new ethers.Contract(MARKETPLACE_ADDRESS, SEAPORT_ABI, signer);

        // Format order for Seaport validate call
        const order = {
            parameters: orderParameters,
            signature: "0x"
        };

        console.log('Order to validate:', JSON.stringify(order, null, 2));
        console.log('Seaport contract address:', MARKETPLACE_ADDRESS);

        const tx = await seaportContract.validate([order]);

        createListingBtn.textContent = 'Transaction pending...';
        showToast('Listing transaction submitted', 'success');

        const receipt = await tx.wait();

        // Extract order hash from OrderValidated event
        let orderHash = null;
        for (const log of receipt.logs) {
            try {
                const parsed = seaportContract.interface.parseLog(log);
                if (parsed.name === 'OrderValidated') {
                    orderHash = parsed.args.orderHash;
                    console.log('Order Hash:', orderHash);
                    break;
                }
            } catch (e) {
                // Not a Seaport event, skip
            }
        }

        // Get updated counter after transaction
        const updatedCounter = await counterContract.getCounter(userAddress);
        console.log('Updated counter after listing creation:', updatedCounter.toString());

        createListingBtn.classList.remove('btn-loading');
        showToast('Listing created successfully!', 'success');

        createListingBtn.disabled = true;
        createListingBtn.textContent = '✓ Listed Successfully';

        console.log('Listing created successfully:', orderHash);

        // Clear cache and switch to My Listings tab
        if (typeof cachedSellerListings !== 'undefined') {
            cachedSellerListings = null;
        }
        if (typeof cachedMarketplaceListings !== 'undefined') {
            cachedMarketplaceListings = null;
        }
        if (typeof cachedBlockchainEvents !== 'undefined') {
            cachedBlockchainEvents = null;
        }

        setTimeout(() => {
            if (typeof switchTab === 'function') {
                switchTab('mylistings');
            }
        }, 2000);

    } catch (error) {
        console.error('Error creating listing:', error);

        if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
            showToast('Transaction rejected by user');
        } else {
            showToast('Error creating listing: ' + (error.reason || error.message));
        }

        createListingBtn.disabled = false;
        createListingBtn.classList.remove('btn-loading');
        createListingBtn.innerHTML = originalText;
    }
}

// Initialize price preview listeners
document.addEventListener('DOMContentLoaded', () => {
    const priceInput = document.getElementById('priceInput');
    const durationInput = document.getElementById('durationInput');
    const createListingBtn = document.getElementById('createListingBtn');
    const pricingModeTotal = document.getElementById('pricingModeTotal');
    const pricingModePerVeYB = document.getElementById('pricingModePerVeYB');

    if (priceInput) {
        priceInput.addEventListener('input', updatePricePreview);
    }

    if (durationInput) {
        durationInput.addEventListener('change', updatePricePreview);
    }

    if (createListingBtn) {
        createListingBtn.addEventListener('click', createListing);
    }

    if (pricingModeTotal) {
        pricingModeTotal.addEventListener('change', updatePricingMode);
    }

    if (pricingModePerVeYB) {
        pricingModePerVeYB.addEventListener('change', updatePricingMode);
    }
});
