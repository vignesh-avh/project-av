import React, { useEffect, useState } from "react";
import { FiCopy, FiUsers, FiAward } from "react-icons/fi";
import toast from 'react-hot-toast';

export default function Referral() {
  const [referralCode, setReferralCode] = useState("");
  const [referralEarnings, setReferralEarnings] = useState(0);
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
        const response = await fetch(
          `${process.env.REACT_APP_API_URL}/get-user?user_id=${userId}`
        );
        const data = await response.json();
        setReferralCode(data.referral_code || "NO_CODE");
        setReferralEarnings(data.referral_earnings || 0);
        setReferralCount(data.referral_count || 0);
      } catch (error) {
        toast.error("Error fetching referral data:", error);
        setReferralCode("ERROR");
      } finally {
        setIsLoading(false);
      }
    };

    fetchReferralData();
  }, []);

  const handleCopy = async () => {
    if (!navigator.clipboard) {
      toast.error("Clipboard API not available.");
      return;
    }
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Failed to copy!', err);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 font-sans flex items-center justify-center">
        <div className="w-full max-w-md mx-auto">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">Refer & Earn</h1>
                    <p className="text-gray-500 mt-2">Share your code with customers and earn rewards.</p>
                </div>

                <div className="space-y-6">
                    {/* Your Code Section */}
                    <div>
                        <label className="text-sm font-medium text-gray-500">Your Unique Referral Code</label>
                        <div className="mt-2 flex items-center space-x-2">
                            <p className="flex-grow text-2xl font-mono tracking-widest bg-gray-100 border border-gray-300 text-gray-800 p-3 rounded-lg text-center">
                                {referralCode}
                            </p>
                            <button
                                onClick={handleCopy}
                                className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:scale-95 transition-all"
                                aria-label="Copy Code"
                            >
                                <FiCopy className="h-6 w-6" />
                            </button>
                        </div>
                        {copied && <p className="text-green-600 text-sm mt-2 text-center">Copied to clipboard!</p>}
                    </div>
                    
                    {/* Stats Section */}
                    <div className="border-t border-gray-200 pt-6 grid grid-cols-2 gap-4 text-center">
                        <div>
                            <FiAward className="h-7 w-7 mx-auto text-green-500 mb-2" />
                            <p className="text-3xl font-bold text-gray-800">₹{referralEarnings}</p>
                            <p className="text-sm text-gray-500 font-medium">Total Earnings</p>
                        </div>
                        <div>
                            <FiUsers className="h-7 w-7 mx-auto text-purple-500 mb-2" />
                            <p className="text-3xl font-bold text-gray-800">{referralCount}</p>
                            <p className="text-sm text-gray-500 font-medium">Referrals Joined</p>
                        </div>
                    </div>
                </div>

                <div className="text-center mt-8 bg-blue-50 p-3 rounded-lg">
                    <p className="text-blue-800 text-sm">Your earnings can be used to renew your monthly subscription.</p>
                </div>
            </div>
        </div>
    </div>
  );
}