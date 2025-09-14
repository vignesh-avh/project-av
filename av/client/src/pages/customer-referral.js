// In pages/customer-referral.js

// ===== REPLACE THE ENTIRE FILE CONTENT WITH THIS NEW VERSION =====
import React, { useEffect, useState } from "react";
import { FiCopy, FiUsers } from "react-icons/fi";
import Card from "../components/Card";
import { API_BASE } from "../config";
import toast from 'react-hot-toast';

export default function CustomerReferral() {
  const [referralCode, setReferralCode] = useState("");
  const [referralCount, setReferralCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchReferralData = async () => {
      const userId = sessionStorage.getItem("userId");
      if (!userId) {
        setIsLoading(false);
        return;
      };

      try {
        const response = await fetch(`${API_BASE}/get-user?user_id=${userId}`);
        const data = await response.json();
        setReferralCode(data.referral_code || "NO_CODE");
        setReferralCount(data.referral_count || 0);
      } catch (error) {
        toast.error("Error fetching referral data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReferralData();
  }, []);

  const handleCopy = async () => {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-neutral-800">Refer & Earn Coins</h1>
            <p className="text-neutral-500 mt-2">Share your code with friends to earn 25 coins each!</p>
          </div>
          <div className="mt-8">
            <label className="text-sm font-medium text-neutral-500">Your Unique Referral Code</label>
            <div className="mt-1 flex items-center gap-2">
              <p className="flex-grow text-2xl font-mono tracking-widest bg-neutral-100 border border-neutral-300 text-neutral-800 p-3 rounded-lg text-center">
                {referralCode}
              </p>
              <button onClick={handleCopy} className="p-3 bg-primary text-white rounded-lg hover:bg-primary-dark active:scale-95 transition-all">
                <FiCopy className="h-6 w-6" />
              </button>
            </div>
            {copied && <p className="text-success text-sm mt-2 text-center">Copied!</p>}
          </div>
          <div className="mt-6 border-t border-neutral-200 pt-6">
            <div className="text-center">
              <FiUsers className="h-8 w-8 mx-auto text-primary mb-2" />
              <p className="text-3xl font-bold text-neutral-800">{referralCount}</p>
              <p className="text-sm text-neutral-500">Friends Joined</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
// =======================================================================