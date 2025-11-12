// Update price preview
function updatePricePreview() {
    const priceInput = document.getElementById('priceInput');
    const durationInput = document.getElementById('durationInput');
    const receiveAmount = document.getElementById('receiveAmount');
    const expiryDate = document.getElementById('expiryDate');

    const price = parseFloat(priceInput.value) || 0;
    receiveAmount.textContent = `${price.toFixed(4)} ETH`;

    const days = parseInt(durationInput.value);
    const expiryTimestamp = Math.floor(Date.now() / 1000) + (days * 24 * 60 * 60);
    const expiryDateObj = new Date(expiryTimestamp * 1000);
    expiryDate.textContent = expiryDateObj.toLocaleDateString();
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

    const price = parseFloat(priceInput.value);
    if (!price || price < 0.0001) {
        showToast('Please enter a valid price (minimum 0.0001 ETH)');
        return;
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
        createListingBtn.textContent = 'Creating listing...';

        // Get tokenId (for veYB it's the user's address as uint256)
        // Convert address to BigNumber
        const tokenId = ethers.BigNumber.from(userAddress);

        // Convert price to wei
        const priceInWei = ethers.utils.parseEther(price.toString());

        // Calculate timestamps
        const startTime = Math.floor(Date.now() / 1000);
        const days = parseInt(durationInput.value);
        const endTime = startTime + (days * 24 * 60 * 60);
        const salt = ethers.BigNumber.from(startTime);

        // Build OrderParameters
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
                    itemType: 0, // ETH
                    token: ethers.constants.AddressZero,
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

        // Get locked amount from veYB contract
        const nftContract = new ethers.Contract(VEYB_NFT_ADDRESS, ERC721_ABI, ethersProvider);
        const lockedData = await nftContract.locked(userAddress);
        const lockedAmount = lockedData.amount; // int256
        const formattedLockedAmount = parseFloat(ethers.utils.formatEther(lockedAmount.abs())).toFixed(2);

        // Check if there's an existing listing and cancel it first
        const existingListing = localStorage.getItem(`myListing_${userAddress}`);
        if (existingListing) {
            const oldListing = JSON.parse(existingListing);
            if (oldListing.active && oldListing.orderParameters) {
                try {
                    showToast('Canceling previous listing...', 'info');

                    const cancelABI = [{
                        "inputs": [{
                            "components": [
                                {"internalType": "address", "name": "offerer", "type": "address"},
                                {"internalType": "address", "name": "zone", "type": "address"},
                                {"components": [
                                    {"internalType": "enum ItemType", "name": "itemType", "type": "uint8"},
                                    {"internalType": "address", "name": "token", "type": "address"},
                                    {"internalType": "uint256", "name": "identifierOrCriteria", "type": "uint256"},
                                    {"internalType": "uint256", "name": "startAmount", "type": "uint256"},
                                    {"internalType": "uint256", "name": "endAmount", "type": "uint256"}
                                ], "internalType": "struct OfferItem[]", "name": "offer", "type": "tuple[]"},
                                {"components": [
                                    {"internalType": "enum ItemType", "name": "itemType", "type": "uint8"},
                                    {"internalType": "address", "name": "token", "type": "address"},
                                    {"internalType": "uint256", "name": "identifierOrCriteria", "type": "uint256"},
                                    {"internalType": "uint256", "name": "startAmount", "type": "uint256"},
                                    {"internalType": "uint256", "name": "endAmount", "type": "uint256"},
                                    {"internalType": "address payable", "name": "recipient", "type": "address"}
                                ], "internalType": "struct ConsiderationItem[]", "name": "consideration", "type": "tuple[]"},
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
                        }],
                        "name": "cancel",
                        "outputs": [{"internalType": "bool", "name": "cancelled", "type": "bool"}],
                        "stateMutability": "nonpayable",
                        "type": "function"
                    }];

                    const cancelContract = new ethers.Contract(MARKETPLACE_ADDRESS, cancelABI, signer);
                    const orderComponents = {
                        offerer: oldListing.orderParameters.offerer,
                        zone: oldListing.orderParameters.zone,
                        offer: oldListing.orderParameters.offer,
                        consideration: oldListing.orderParameters.consideration,
                        orderType: oldListing.orderParameters.orderType,
                        startTime: oldListing.orderParameters.startTime,
                        endTime: oldListing.orderParameters.endTime,
                        zoneHash: oldListing.orderParameters.zoneHash,
                        salt: oldListing.orderParameters.salt,
                        conduitKey: oldListing.orderParameters.conduitKey,
                        totalOriginalConsiderationItems: oldListing.orderParameters.totalOriginalConsiderationItems
                    };

                    const cancelTx = await cancelContract.cancel([orderComponents]);
                    await cancelTx.wait();
                    showToast('Previous listing canceled', 'success');
                } catch (error) {
                    console.error('Error canceling old listing:', error);
                    // Continue with new listing even if cancel fails
                }
            }
        }

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

        createListingBtn.classList.remove('btn-loading');
        showToast('Listing created successfully!', 'success');

        // Save listing data
        const listingData = {
            orderHash: orderHash,
            orderParameters,
            price: price,
            seller: userAddress,
            tokenId: tokenId.toString(),
            lockedAmount: formattedLockedAmount,
            createdAt: Date.now(),
            txHash: tx.hash,
            active: true
        };

        // Save to localStorage
        const listings = JSON.parse(localStorage.getItem('veybListings') || '[]');

        // Deactivate all previous listings from this seller (since veYB NFT is unique per address)
        const updatedListings = listings.map(l => {
            if (l.seller.toLowerCase() === userAddress.toLowerCase()) {
                l.active = false;
            }
            return l;
        });

        // Add new listing
        updatedListings.push(listingData);
        localStorage.setItem('veybListings', JSON.stringify(updatedListings));

        // Save seller's own listing
        localStorage.setItem(`myListing_${userAddress}`, JSON.stringify(listingData));

        createListingBtn.disabled = true;
        createListingBtn.textContent = '✓ Listed Successfully';

        // Refresh to show seller dashboard
        setTimeout(() => {
            window.location.reload();
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

    if (priceInput) {
        priceInput.addEventListener('input', updatePricePreview);
    }

    if (durationInput) {
        durationInput.addEventListener('change', updatePricePreview);
    }

    if (createListingBtn) {
        createListingBtn.addEventListener('click', createListing);
    }
});
