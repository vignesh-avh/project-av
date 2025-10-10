import React, { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { secureStorage } from "../services/auth";
import { API_BASE } from "../config"; // Make sure to import API_BASE

// --- START OF FIX ---
// This new function performs a real-time check against the backend.
const checkLockStatus = async () => {
  const userId = sessionStorage.getItem("userId");
  const role = sessionStorage.getItem("role");

  // This check only applies to customers.
  if (role !== 'customer' || !userId) {
    return null; // Not applicable, so no lock.
  }

  try {
    const response = await fetch(`${API_BASE}/check-subscription-status?user_id=${userId}`);
    if (!response.ok) {
      return null; // If the check fails, don't lock the user out.
    }
    const data = await response.json();
    return data.status; // Returns "active_ok", "grace_period_active", or "expired_locked"
  } catch (error) {
    console.error("Failed to check subscription lock status:", error);
    return null;
  }
};

// --- ADD THIS NEW FUNCTION FOR OWNERS ---
const checkOwnerLockStatus = async () => {
  const userId = sessionStorage.getItem("userId");
  const role = sessionStorage.getItem("role");

  if (role !== 'owner' || !userId) {
    return null; // Not applicable
  }

  try {
    const response = await fetch(`${API_BASE}/owner/check-subscription?owner_id=${userId}`);
    if (!response.ok) {
      return null; // If the check fails, don't lock the user out.
    }
    const data = await response.json();
    return data.status; // Returns "active", "expiring_soon", or "expired"
  } catch (error) {
    console.error("Failed to check owner subscription lock status:", error);
    return null;
  }
};
// --- END OF NEW FUNCTION ---
// --- END OF FIX ---


// The main validation function is now async to await the lock status check.
async function validateToken({ navigate, pathname, setStatus, requiredRole }) {
  console.log(`DEBUG [PrivateRoute]: Validating route for pathname: "${pathname}"`);
  const token = secureStorage.getItem("token");

  if (!token) {
    setStatus("denied");
    return;
  }

  try {
    // --- START OF FIX ---
    // Perform the real-time check first.
    const customerLockStatus = await checkLockStatus(); // For customers
    const ownerLockStatus = await checkOwnerLockStatus(); // For owners

    // If the customer backend says the account is locked, redirect immediately.
    if (customerLockStatus === 'expired_locked' && pathname !== '/subscription') {
      navigate("/subscription", { replace: true });
      setStatus("checking"); // Prevents rendering of the protected component
      return;
    }

    // ===== ADD THIS BLOCK TO HANDLE OWNER LOCKOUT =====
    if (ownerLockStatus === 'expired' && pathname !== '/subscription') {
      navigate("/subscription", { replace: true });
      setStatus("checking");
      return;
    }
    // ==================================================

    // --- END OF FIX ---

    const decoded = jwtDecode(token);
    const role = decoded.role || "customer";
    const onboardingDone = decoded.onboardingDone ?? decoded.onboarding_done ?? false;
    const hasEnteredReferral = decoded.hasEnteredReferral ?? decoded.has_entered_referral ?? false;
    const subscriptionActive = decoded.subscription_active ?? true;

    // This logic still protects pages for users with newly created accounts
    // who haven't subscribed yet.
    if (!subscriptionActive) {
      if (role === "owner" && pathname === "/myshop") {
        navigate("/subscription", { replace: true });
        setStatus("checking");
        return;
      }
      if (role === "customer" && pathname === "/shops") {
        navigate("/subscription", { replace: true });
        setStatus("checking");
        return;
      }
    }

    sessionStorage.setItem("userId", decoded.sub || ""); // The user's database ID
    sessionStorage.setItem("role", role);
    sessionStorage.setItem("onboardingDone", onboardingDone.toString());
    sessionStorage.setItem("hasEnteredReferral", hasEnteredReferral.toString());
    sessionStorage.setItem("subscriptionActive", subscriptionActive.toString());
    // Role-based access control
    if (requiredRole && role !== requiredRole) {
      setStatus("denied");
      return;
    }

    // Onboarding and referral checks
    if (role === "owner" && !onboardingDone && pathname !== "/onboarding") {
      navigate("/onboarding", { replace: true });
    } else if (role === "customer" && !hasEnteredReferral && pathname !== "/home" && !pathname.startsWith('/shop')) {
      navigate("/home", { state: { showReferral: true } });
    } else {
      setStatus("allowed");
    }
  } catch (error) {
    console.error("Token validation error:", error);
    secureStorage.removeItem("token");
    setStatus("denied");
  }
}

export default function PrivateRoute({ children, requiredRole }) {
  const [status, setStatus] = useState("checking");
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;

  useEffect(() => {
    validateToken({ navigate, pathname, setStatus, requiredRole });
  }, [pathname, navigate, requiredRole]);

  // Listen to events that might change user status
  useEffect(() => {
    const handleUpdate = () => {
      validateToken({ navigate, pathname, setStatus, requiredRole });
    };

    window.addEventListener("referralCompleted", handleUpdate);
    window.addEventListener("onboardingDone", handleUpdate);
    window.addEventListener("userChanged", handleUpdate); // Added listener

    return () => {
      window.removeEventListener("referralCompleted", handleUpdate);
      window.removeEventListener("onboardingDone", handleUpdate);
      window.removeEventListener("userChanged", handleUpdate);
    };
  }, [navigate, pathname, requiredRole]);

  if (status === "checking") {
    return <div className="p-4 text-center">Loading...</div>;
  }

  if (status === "denied") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

// The OnboardingCheck component remains unchanged.
export function OnboardingCheck({ children }) {
  const navigate = useNavigate();
  const [onboardingDone, setOnboardingDone] = useState(null);

  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const token = secureStorage.getItem("token");

        if (!token) {
          navigate("/login");
          return;
        }

        const onboardingSession = sessionStorage.getItem("onboardingDone") === "true";
        const onboardingSecure = secureStorage.getItem("onboardingDone") === "true";

        if (!onboardingSession && !onboardingSecure) {
          const decoded = jwtDecode(token);

          if (decoded.onboardingDone) {
            sessionStorage.setItem("onboardingDone", "true");
            secureStorage.setItem("onboardingDone", "true");
            setOnboardingDone(true);
          } else {
            navigate("/onboarding", { replace: true });
          }
        } else {
          setOnboardingDone(true);
        }
      } catch (err) {
        console.error("Onboarding check error:", err);
        navigate("/login", { replace: true });
      }
    };

    checkOnboarding();
  }, [navigate]);

  if (onboardingDone === null) {
    return <div className="p-4 text-center">Checking onboarding status...</div>;
  }

  return children;
}