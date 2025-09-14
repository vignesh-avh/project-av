import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { secureStorage } from "../services/auth";
import { jwtDecode } from 'jwt-decode';

export default function ReferralPopup({ onClose }) {
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleApply = async () => {
        const userId = sessionStorage.getItem("userId");
        if (!userId) {
            setError("User session expired. Please login again.");
            return;
        }

        // FIX 1: Use boolean conversion for referral flag
        const hasEntered = sessionStorage.getItem("hasEnteredReferral") === "true";
        if (hasEntered) {
            setError("Referral already applied");
            return;
        }

        if (!code.trim()) {
            setError("Please enter a referral code");
            return;
        }

        console.log("Applying referral for user:", userId);
        
        setLoading(true);
        setError("");

        try {
            const response = await fetch(
                `${process.env.REACT_APP_API_URL}/referral/apply-referral`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        customer_id: userId,
                        referral_code: code.trim().toUpperCase(),
                    }),
                }
            );

            const responseData = await response.json();
            
            if (!response.ok) {
                throw new Error(responseData.detail || "Failed to apply referral code");
            }
            
            // This one line saves the new token AND updates all necessary
            // items in sessionStorage, including `hasEnteredReferral`.
            secureStorage.setItem("token", responseData.access_token);

            // Notify the app that user status and points have changed.
            window.dispatchEvent(new Event("rewardPointsUpdated"));
            window.dispatchEvent(new Event("referralCompleted"));

            // Simply close the popup. No navigation is needed.
            onClose();
        } catch (err) {
            setError(err.message || "Failed to apply referral code");
        } finally {
            setLoading(false);
        }
    };

    const handleSkip = async () => {
        const userId = sessionStorage.getItem("userId");
        if (!userId) {
            setError("User session expired. Please login again.");
            return;
        }

        // FIX 1: Use boolean conversion for referral flag
        const hasEntered = sessionStorage.getItem("hasEnteredReferral") === "true";
        if (hasEntered) {
            setError("Referral already applied");
            return;
        }
        
        console.log("Skipping referral for user:", userId);
        
        try {
            setLoading(true);
            setError("");
            
            const response = await fetch(
                `${process.env.REACT_APP_API_URL}/referral/skip-referral`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        user_id: userId
                    }), 
                }
            );

            const responseData = await response.json();
            
            if (!response.ok) {
                throw new Error(responseData.detail || "Failed to skip referral");
            }

            // This one line saves the new token and updates sessionStorage.
            secureStorage.setItem("token", responseData.access_token);

            // Notify the app that the user's status has changed.
            window.dispatchEvent(new Event("referralCompleted"));

            // Simply close the popup.
            onClose();
        } catch (error) {
            setError(error.message || "Failed to skip referral");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg w-80">
                <h2 className="text-xl font-bold mb-4">Referral Code</h2>
                <p className="mb-4">Enter a referral code to earn 25 coins!</p>

                <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="border p-2 w-full mb-2"
                    placeholder="Enter code"
                    maxLength={6}
                    style={{ textTransform: "uppercase" }}
                />

                {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

                <div className="flex space-x-2">
                    <button
                        onClick={handleApply}
                        disabled={loading}
                        className={`bg-blue-600 text-white px-4 py-2 rounded flex-1 ${
                            loading ? "opacity-50" : ""
                        }`}
                    >
                        {loading ? "Applying..." : "Apply"}
                    </button>
                    <button
                        onClick={handleSkip}
                        disabled={loading}
                        className="bg-gray-600 text-white px-4 py-2 rounded flex-1"
                    >
                        {loading ? "Skipping..." : "Skip"}
                    </button>
                </div>
            </div>
        </div>
    );
}