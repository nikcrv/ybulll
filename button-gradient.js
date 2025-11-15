// Interactive gradient effect for buttons
// Adds a beige (#E8D5B7) color that follows cursor on hover

function initButtonGradients() {
    // Add event listeners to all interactive buttons
    const buttons = document.querySelectorAll('.btn-primary, .btn-buy, .btn-connect, .tab-btn, .wallet-option, .btn-secondary');

    buttons.forEach(button => {
        button.addEventListener('mousemove', handleButtonHover);
        button.addEventListener('mouseleave', handleButtonLeave);
    });
}

function handleButtonHover(e) {
    if (this.disabled || this.classList.contains('no-hover-effect')) return;

    const rect = this.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Calculate percentage position
    const xPercent = (x / rect.width) * 100;
    const yPercent = (y / rect.height) * 100;

    // Determine gradient based on button type
    let gradient;

    if (this.classList.contains('tab-btn') && this.classList.contains('active')) {
        // For active tabs - keep the original gradient, add beige overlay
        gradient = `
            radial-gradient(circle 120px at ${xPercent}% ${yPercent}%,
                rgba(232, 213, 183, 0.6) 0%,
                transparent 40%),
            linear-gradient(135deg, #f8fafc 0%, #cbd5e1 100%)
        `;
    } else if (this.classList.contains('tab-btn')) {
        // For inactive tabs - use transparent to light gradient with beige highlight
        gradient = `
            radial-gradient(circle 120px at ${xPercent}% ${yPercent}%,
                #E8D5B7 0%,
                rgba(248, 250, 252, 0.7) 40%,
                rgba(226, 232, 240, 0.7) 100%)
        `;
    } else if (this.classList.contains('wallet-option')) {
        // For wallet options - dark background with beige highlight
        gradient = `
            radial-gradient(circle 120px at ${xPercent}% ${yPercent}%,
                #E8D5B7 0%,
                rgba(30, 41, 59, 0.8) 40%,
                #1e293b 100%)
        `;
    } else if (this.classList.contains('btn-secondary')) {
        // For secondary buttons - card background with beige highlight
        gradient = `
            radial-gradient(circle 120px at ${xPercent}% ${yPercent}%,
                #E8D5B7 0%,
                rgba(30, 41, 59, 0.6) 40%,
                #1e293b 100%)
        `;
    } else {
        // For primary buttons - light gradient with beige highlight
        gradient = `
            radial-gradient(circle 120px at ${xPercent}% ${yPercent}%,
                #E8D5B7 0%,
                #f8fafc 40%,
                #cbd5e1 100%)
        `;
    }

    this.style.background = gradient;
}

function handleButtonLeave() {
    // Reset to original gradient/background based on button type
    if (this.classList.contains('tab-btn')) {
        if (this.classList.contains('active')) {
            this.style.background = 'linear-gradient(135deg, #f8fafc 0%, #cbd5e1 100%)';
        } else {
            this.style.background = 'transparent';
        }
    } else if (this.classList.contains('wallet-option')) {
        this.style.background = 'var(--bg-dark)';
    } else if (this.classList.contains('btn-secondary')) {
        this.style.background = 'var(--card-bg)';
    } else {
        this.style.background = 'linear-gradient(135deg, #f8fafc 0%, #cbd5e1 100%)';
    }
}

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initButtonGradients);
} else {
    initButtonGradients();
}

// Re-initialize when new buttons are added dynamically (for marketplace listings)
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) { // Element node
                const newButtons = node.querySelectorAll ? node.querySelectorAll('.btn-primary, .btn-buy, .btn-connect, .tab-btn, .wallet-option, .btn-secondary') : [];
                newButtons.forEach(button => {
                    button.addEventListener('mousemove', handleButtonHover);
                    button.addEventListener('mouseleave', handleButtonLeave);
                });
            }
        });
    });
});

// Observe the document for new buttons
observer.observe(document.body, {
    childList: true,
    subtree: true
});
