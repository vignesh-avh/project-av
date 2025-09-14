import { API_BASE } from './config';

export const recordCoinTransaction = async (userId, coins, type) => {
    try {
        await fetch(`${API_BASE}/record-coin-transaction`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                user_id: userId, 
                coins: coins,
                type: type,
                timestamp: new Date().toISOString()
            })
        });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

export const addReward = async (userId, coins, type) => {
    try {
        const fixedCoins = type === "checkout" ? 3 : coins;
        
        const response = await fetch(`${API_BASE}/add-reward`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                user_id: userId, 
                coins: fixedCoins, 
                type 
            }),
        });

        if (!response.ok) throw new Error("Failed to add reward");

        // FIX: Get updated coins from backend response
        const responseData = await response.json();
        const updatedCoins = Number(responseData.updated_coins) || 0;

        // Update user document in database
        await fetch(`${API_BASE}/update-user-coins`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                user_id: userId,
                coins: updatedCoins
            })
        });
        
        return { success: true, updated_coins: updatedCoins };
    } catch (error) {
        console.error("Error adding reward:", error);
        return { success: false, error: error.message };
    }
};

export const getUserCoins = async (userId) => {
    try {
        const response = await fetch(`${API_BASE}/get-user-coins?user_id=${userId}`);
        if (!response.ok) throw new Error("Failed to fetch coin data");
        return await response.json();
    } catch (error) {
        console.error("Error getting coins:", error);
        return { total_coins: 0, expiring_coins: 0 };
    }
};

export const getUserSubscriptionPhase = async (userId) => {
    try {
        const response = await fetch(`${API_BASE}/get-user-subscription-phase?user_id=${userId}`);
        if (!response.ok) throw new Error("Failed to fetch subscription phase");
        return await response.json();
    } catch (error) {
        console.error("Error getting subscription phase:", error);
        return { phase: 1, months_since_start: 0 };
    }
};

export const redeemSubscription = async (userId, coinsToUse) => {
    try {
        const role = sessionStorage.getItem("role");
        if (role !== "customer") {
            return { 
                success: false, 
                error: "Subscription only available for customers" 
            };
        }

        // FIX: Changed to a POST request to match the backend endpoint
        const response = await fetch(`${API_BASE}/redeem-subscription`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                user_id: userId, 
                coins_to_use: coinsToUse // Send the cost in the body
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Failed to redeem subscription");
        }
        
        const result = await response.json();

        // This event will trigger other components (like the navbar) to refresh the coin display
        window.dispatchEvent(new Event('rewardPointsUpdated'));
        
        return result;
    } catch (error) {
        console.error("Error redeeming subscription:", error);
        return { 
            success: false, 
            error: error.message || "Network error",
            coins_used: 0
        };
    }
};

export const fetchUserDetails = async (userId) => {
    try {
        const response = await fetch(`${API_BASE}/get-user?user_id=${userId}`);
        return response.json();
    } catch (error) {
        console.error("Error fetching user details:", error);
        return { created_at: new Date().toISOString() };
    }
};