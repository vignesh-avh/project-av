import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { secureStorage } from "../services/auth";
import { googleLogin } from "../services/api";
import { jwtDecode } from 'jwt-decode';

export default function GoogleButton({ role: propRole }) {
  const navigate = useNavigate();

  // Load Google SDK
  useEffect(() => {
    const loadGoogleSDK = () => {
      if (!window.google) {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
    };

    loadGoogleSDK();
  }, []);

  const handleGoogleSignup = async () => {
    try {
      if (!window.google || !window.google.accounts) {
        throw new Error("Google SDK not loaded. Please refresh the page.");
      }

      

      window.google.accounts.oauth2.initTokenClient({
        client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID,
        scope: 'profile email',
        callback: async (response) => {
          if (response.access_token) {
            try {
              
              // Get JWT from backend
              const { access_token } = await googleLogin({
                access_token: response.access_token,
                role: propRole
              });
              
              // FIX 1: Use 'sub' claim instead of 'uid'
              const decoded = jwtDecode(access_token);
              const userId = decoded.sub; // ✅ CORRECTED
              
              // FIX 2: Store with consistent key
              sessionStorage.setItem("userId", userId);
              
              // Store token and decode claims
              secureStorage.setItem("token", access_token);
              
              // Store ALL claims in sessionStorage
              sessionStorage.setItem("role", decoded.role);
              sessionStorage.setItem("onboardingDone", decoded.onboarding_done.toString());
              // REMOVED: Old hasEnteredReferral storage
              
              // ADDED: Store reward points from token
              sessionStorage.setItem("rewardPoints", decoded.coins.toString());
              
              // Handle both camelCase and snake_case claims for navigation
              const userRole = decoded.role;
              const onboardingDone = decoded.onboardingDone || decoded.onboarding_done;
              // FIX 2: Proper boolean conversion for referral flag
              const hasEnteredReferral = Boolean(
                decoded.has_entered_referral || 
                decoded.hasEnteredReferral || 
                false
              );
              
              // Validate role consistency
              if (propRole && userRole !== propRole) {
                throw new Error("Role mismatch detected");
              }
              
              // Store critical claims in secure storage
              secureStorage.setItem("role", userRole);
              secureStorage.setItem("onboardingDone", onboardingDone.toString());
              
              
              // Dispatch event to update all components
              window.dispatchEvent(new Event('userChanged'));
              
              // FIXED: Proper navigation for both roles with referral state
              if (userRole === "owner") {
                // Owners go to onboarding if not completed
                navigate(onboardingDone ? "/myshop" : "/onboarding", { 
                  replace: true,
                  state: { noBack: true } // NEW: Prevent back navigation
                });
              } else if (userRole === "customer") {
                // Customers: navigate with referral state and back prevention
                navigate("/home", { 
                  replace: true,
                  state: { 
                    showReferral: !hasEnteredReferral,
                    noBack: true // NEW: Prevent back navigation
                  }
                });
              } else {
                // For any other role, navigate to home without state
                navigate("/home", { replace: true });
              }
            } catch (error) {
              console.error("Google login failed:", error);
              secureStorage.removeItem("token");
              sessionStorage.clear();
            }
          }
        }
      }).requestAccessToken();
    } catch (error) {
      console.error("Google auth error:", error);
    }
  };

  // In client/src/components/googlebutton.js

// ===== REPLACE THE ENTIRE 'return' STATEMENT WITH THIS NEW VERSION =====
  return (
    <button
      onClick={handleGoogleSignup}
      className="w-full py-3 px-4 rounded-lg font-semibold text-neutral-700 bg-white border border-neutral-300 hover:bg-neutral-50 active:scale-95 transition-all flex items-center justify-center gap-3 shadow-sm"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Sign in with Google
    </button>
  );
// =======================================================================
}