import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom"; 
import { redeemSubscription } from "../services/rewardService";
import { secureStorage } from "../services/auth";
import { API_BASE } from "../config";
import { StarIcon } from "@heroicons/react/24/solid";
import Card from "../components/Card";
import Button from "../components/Button";

export default function Subscription() {
  const navigate = useNavigate();
  const [subscriptionData, setSubscriptionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isReferralLoading, setIsReferralLoading] = useState(false);
  const [isRazorpayLoading, setIsRazorpayLoading] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [userCoins, setUserCoins] = useState({ total_coins: 0, active_coins: 0 });

  const [referralEarnings, setReferralEarnings] = useState(0);
  const SUBSCRIPTION_COST_INR = 99;
  
  const SUBSCRIPTION_COST = 450;

  const fetchSubscriptionData = useCallback(async () => {
    const role = sessionStorage.getItem("role");
    setUserRole(role);

    setSubscriptionData(null);
    setUserCoins({ total_coins: 0, active_coins: 0 });
    setError("");
    setLoading(true);

    try {
      const userId = sessionStorage.getItem("userId");
      if (!userId) {
        setLoading(false);
        return;
      };

      const response = await fetch(
        `${API_BASE}/get-subscription-details?user_id=${userId}`
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      setSubscriptionData(data);
      if (data.coins) {
        setUserCoins(data.coins);
      }
      
      if (role === "owner") {
        setReferralEarnings(data.referral_earnings || 0);
      }
      
    } catch (error) {
      setError(error.message || "Failed to load subscription data");
      console.error("Subscription fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscriptionData();

    const handleUserChange = () => {
        fetchSubscriptionData();
    };
    
    window.addEventListener('userChanged', handleUserChange);

    return () => {
      window.removeEventListener('userChanged', handleUserChange);
    };
  }, [fetchSubscriptionData]);

  const handleRenewWithReferral = async () => {
      if (referralEarnings < SUBSCRIPTION_COST_INR) {
          alert("You do not have enough referral earnings to renew.");
          return;
      }
      setIsReferralLoading(true);
      setError("");
      const userId = sessionStorage.getItem("userId");
      try {
          const response = await fetch(`${API_BASE}/renew-with-referral`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ user_id: userId }),
          });

          if (!response.ok) {
              const errData = await response.json();
              throw new Error(errData.detail || "Renewal failed due to a server error.");
          }

          const data = await response.json();
          
          secureStorage.setItem("token", data.access_token);
          window.dispatchEvent(new Event('userChanged')); 
          
          alert("Subscription renewed successfully!");
          
          navigate('/myshop', { replace: true });

      } catch (err) {
          setError(err.message);
          alert(`Error: ${err.message}`);
      } finally {
          setIsReferralLoading(false);
      }
  };

  const updateSubscriptionStatus = async (method = "coins") => {
    const userId = sessionStorage.getItem("userId");
    await fetch(`${process.env.REACT_APP_API_URL}/update-subscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        method: method
      })
    });
  };

  const initiatePayment = async (amount) => {
    setIsRazorpayLoading(true);
    try {
      const keyResponse = await fetch(`${API_BASE}/get-razorpay-key`);
      const keyData = await keyResponse.json();
      const key = keyData.key;
      
      if (!key) {
        throw new Error("Payment gateway configuration missing");
      }
      
      const orderResponse = await fetch(`${API_BASE}/create-razorpay-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amount * 100 })
      });
      if (!orderResponse.ok) {
        throw new Error("Failed to create payment order");
      }
      
      const orderData = await orderResponse.json();
      const options = {
        key,
        amount: orderData.amount,
        currency: "INR",
        order_id: orderData.id,
        name: "Project AV",
        description: "Subscription Renewal",
        handler: async (response) => {
            if (response.razorpay_payment_id) {
              await fetch(`${process.env.REACT_APP_API_URL}/verify-razorpay-payment`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  payment_id: response.razorpay_payment_id,
                  order_id: response.razorpay_order_id,
                  signature: response.razorpay_signature,
                  amount: SUBSCRIPTION_COST_INR, 
                  user_id: sessionStorage.getItem("userId")
                })
              });

              const updateResponse = await fetch(`${process.env.REACT_APP_API_URL}/update-subscription`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                      user_id: sessionStorage.getItem("userId"),
                      method: "razorpay"
                  }),
              });

              if (!updateResponse.ok) {
                  throw new Error("Failed to update subscription status after payment.");
              }

              const data = await updateResponse.json();

              secureStorage.setItem("token", data.access_token);
              window.dispatchEvent(new Event('userChanged'));
              alert("Subscription renewed successfully!");
              navigate('/myshop', { replace: true });
            }
        },
        prefill: {
          name: secureStorage.getItem("userName") || "Customer",
          email: secureStorage.getItem("userEmail") || "customer@example.com"
        },
        theme: { color: "#2563eb" },
        modal: {
          ondismiss: () => setIsRazorpayLoading(false)
        }
      };
      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (response) => {
        setError(`Payment failed: ${response.error.description}`);
        setIsRazorpayLoading(false);
      });
      rzp.open();
      
    } catch (error) {
      setError(error.message || "Payment initialization failed");
      setIsRazorpayLoading(false);
    }
  };

  const handleBuyCoins = async (amountInr, coinsToAdd) => {
    setIsRazorpayLoading(true);
    const userId = sessionStorage.getItem("userId");
    try {
      // --- START OF FIX: Securely fetch the Razorpay key from the backend ---
      const keyResponse = await fetch(`${API_BASE}/get-razorpay-key`);
      if (!keyResponse.ok) throw new Error("Could not retrieve payment key.");
      const keyData = await keyResponse.json();
      const razorpayKey = keyData.key;
      if (!razorpayKey) throw new Error("Payment gateway key is missing.");
      // --- END OF FIX ---

      // 1. Create a Razorpay order for the coin package
      const orderResponse = await fetch(`${API_BASE}/create-coin-purchase-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountInr })
      });
      if (!orderResponse.ok) throw new Error("Failed to create payment order.");
      const orderData = await orderResponse.json();

      // 2. Configure and open the Razorpay payment modal
      const options = {
        key: razorpayKey, // Use the fetched key here
        amount: orderData.amount,
        currency: "INR",
        order_id: orderData.id,
        name: "Project AV - Buy Coins",
        description: `Purchase ${coinsToAdd} coins`,
        handler: async (response) => {
          // 3. On successful payment, verify it on the backend
          const verifyResponse = await fetch(`${API_BASE}/verify-coin-purchase`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
              user_id: userId,
              coins_to_add: coinsToAdd,
              amount_paid: amountInr
            }),
          });

          if (!verifyResponse.ok) {
            throw new Error('Payment verification failed. Please contact support.');
          }
          
          alert(`${coinsToAdd} coins added successfully! You can now renew your subscription.`);
          
          // 4. Reload the page to show the updated coin balance and the renew option
          window.location.reload();
        },
        modal: { ondismiss: () => setIsRazorpayLoading(false) }
      };

      const rzp = new window.Razorpay(options);
      rzp.open();

    } catch (error) {
      alert(error.message || "Payment initialization failed");
      setIsRazorpayLoading(false);
    }
  };

  const handlePayWithCoins = async () => {
    const userId = sessionStorage.getItem("userId");
    if (!userId) {
      alert("Login required");
      return;
    }

    if (userCoins.active_coins < SUBSCRIPTION_COST) {
      alert("Not enough active coins to renew.");
      return;
    }

    setIsReferralLoading(true);
    try {
      const result = await redeemSubscription(userId, SUBSCRIPTION_COST);

      if (result.success) {
        await updateSubscriptionStatus();

        const tokenResponse = await fetch(`${API_BASE}/auth/issue-new-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId }),
        });

        if (!tokenResponse.ok) {
            throw new Error('Failed to refresh session after renewal.');
        }

        const tokenData = await tokenResponse.json();
        
        secureStorage.setItem("token", tokenData.access_token);

        window.dispatchEvent(new Event('rewardPointsUpdated'));
        
        alert("Subscription renewed successfully!");
        navigate('/home', { replace: true });
      } else {
        alert(result.error || "Failed to renew with coins");
      }
    } catch (error) {
       alert(error.message || "An error occurred during renewal.");
    } finally {
      setIsReferralLoading(false);
    }
};

  // ===== REPLACE EVERYTHING FROM THIS POINT TO THE END OF THE FILE =====
  if (loading) {
    // A centered, more professional loader for the whole page
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !subscriptionData) {
    return <div className="p-4 text-center text-danger">{`Error: ${error || 'Failed to load data'}`}</div>;
  }
  
  if (userRole === "owner") {
    const isSubscribed = subscriptionData?.next_payment_date && new Date(subscriptionData.next_payment_date) > new Date();
    const renewalDate = isSubscribed ? new Date(subscriptionData.next_payment_date).toLocaleDateString("en-IN", { day: 'numeric', month: 'long', year: 'numeric' }) : null;
    const canAffordWithReferral = referralEarnings >= SUBSCRIPTION_COST_INR;

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <Card>
            <div className="text-center">
              <h1 className="text-3xl font-bold text-neutral-800">Shop Owner Pro</h1>
              <p className="text-neutral-500 mt-2">{isSubscribed ? "Your plan is active and running." : "Renew your plan to keep your shop active."}</p>
            </div>

            {isSubscribed ? (
              <div className="mt-8 text-center bg-success/10 p-6 rounded-xl">
                <p className="text-sm font-semibold text-green-800 tracking-wider uppercase">Renews On</p>
                <p className="text-4xl font-extrabold text-green-900 mt-2">{renewalDate}</p>
              </div>
            ) : (
              <div className="mt-8 space-y-4">
                <div className="border-2 p-4 rounded-lg bg-neutral-50 border-neutral-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-bold text-lg text-neutral-800">Referral Balance</p>
                      <p className="text-sm text-neutral-500 mt-1">Available: <span className="font-bold">₹{referralEarnings}</span></p>
                    </div>
                    <Button onClick={handleRenewWithReferral} disabled={!canAffordWithReferral || isReferralLoading || isRazorpayLoading} isLoading={isReferralLoading} className="w-auto !py-2">Renew</Button>
                  </div>
                </div>
                <div className="border-2 p-4 rounded-lg bg-neutral-50 border-neutral-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-bold text-lg text-neutral-800">Online Payment</p>
                      <p className="text-sm text-neutral-500 mt-1">Use UPI, Cards, etc.</p>
                    </div>
                    <Button onClick={() => initiatePayment(SUBSCRIPTION_COST_INR)} disabled={isReferralLoading || isRazorpayLoading} isLoading={isRazorpayLoading} className="w-auto !py-2">Pay ₹{SUBSCRIPTION_COST_INR}</Button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    );
  }

  const renewalDate = new Date(subscriptionData.next_payment_date);
  const today = new Date();
  const hasEnoughCoins = userCoins.active_coins >= SUBSCRIPTION_COST;
  const isExpired = renewalDate < today;

  if (!hasEnoughCoins && isExpired) {
    const coinPackages = [
      { price: 1, coins: 10 }, { price: 5, coins: 80 }, { price: 10, coins: 130 },
      { price: 20, coins: 230 }, { price: 30, coins: 400 }, 
      { price: 35, coins: 500, isFeatured: true }
    ];
    coinPackages.sort((a, b) => (b.isFeatured || false) - (a.isFeatured || false));

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <Card>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-extrabold text-neutral-800">Subscription Expired</h2>
              <p className="text-neutral-500 mt-3">You need <span className="font-bold text-primary">{SUBSCRIPTION_COST} coins</span> to renew. Purchase a pack to continue.</p>
            </div>
            <div className="space-y-4">
              {coinPackages.map((pkg) => (
                // This is the premium "Buy Coins" UI from our previous discussion
                <div key={pkg.price} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg bg-gray-50">
                  <div>
                    <p className="font-bold text-lg text-gray-800">🪙 {pkg.coins} Coins</p>
                    <p className="text-sm text-gray-500">for ₹{pkg.price}</p>
                  </div>
                  <button
                    onClick={() => handleBuyCoins(pkg.price, pkg.coins)}
                    disabled={isRazorpayLoading}
                    className="bg-blue-600 text-white font-semibold px-6 py-2 rounded-lg hover:bg-blue-700 active:scale-95 transition-transform disabled:bg-blue-300 disabled:cursor-not-allowed"
                  >
                    {isRazorpayLoading ? '...' : 'Buy Now'}
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-neutral-800">{isExpired ? "Renew Subscription" : "Subscription Active"}</h1>
            <p className="text-neutral-500 mt-2">{isExpired ? "Use your coins to renew your access." : `Your next renewal is on ${renewalDate.toLocaleDateString()}.`}</p>
          </div>
          <div className="bg-neutral-50 border border-neutral-200 p-6 rounded-xl mt-8 space-y-4">
            <div className="flex justify-between items-center text-lg"><p className="font-medium text-neutral-600">Cost</p><p className="font-bold text-neutral-800">🪙 {SUBSCRIPTION_COST}</p></div>
            <div className="flex justify-between items-center text-lg"><p className="font-medium text-neutral-600">Your Balance</p><p className="font-bold text-success">🪙 {userCoins.active_coins}</p></div>
          </div>
          <div className="mt-6">
            <Button onClick={handlePayWithCoins} disabled={!isExpired || !hasEnoughCoins || isReferralLoading} isLoading={isReferralLoading}>
              {isExpired ? `Renew for ${SUBSCRIPTION_COST} Coins` : 'Plan is Active'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}