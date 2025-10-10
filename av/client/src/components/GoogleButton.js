import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { secureStorage } from "../services/auth";
import { googleLogin } from "../services/api";
import { jwtDecode } from 'jwt-decode';

export default function GoogleButton({ role: propRole }) {
  const navigate = useNavigate();

  // This is the new callback function that will be triggered by Google's popup
  const handleGoogleCallback = async (response) => {
    try {
      const idToken = response.credential;
      if (!idToken) return;

      const { access_token: appToken } = await googleLogin({
        access_token: idToken,
        role: propRole,
      });

      const decoded = jwtDecode(appToken);
      const userId = decoded.sub;

      sessionStorage.setItem("userId", userId);
      secureStorage.setItem("token", appToken);
      // ... (all your other sessionStorage logic is correct)
      sessionStorage.setItem("role", decoded.role);
      sessionStorage.setItem("onboardingDone", decoded.onboarding_done.toString());
      sessionStorage.setItem("rewardPoints", decoded.coins.toString());

      const userRole = decoded.role;
      const onboardingDone = decoded.onboardingDone || decoded.onboarding_done;
      const hasEnteredReferral = Boolean(
        decoded.has_entered_referral || decoded.hasEnteredReferral || false
      );

      window.dispatchEvent(new Event('userChanged'));

      if (userRole === "owner") {
        navigate(onboardingDone ? "/myshop" : "/onboarding", { replace: true, state: { noBack: true } });
      } else if (userRole === "customer") {
        navigate("/home", { replace: true, state: { showReferral: !hasEnteredReferral, noBack: true } });
      } else {
        navigate("/home", { replace: true });
      }
    } catch (error) {
      console.error("Google login failed:", error);
      secureStorage.removeItem("token");
      sessionStorage.clear();
    }
  };

  // This useEffect hook now just loads and initializes the Google client
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    script.onload = () => {
      window.google.accounts.id.initialize({
        client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID,
        callback: handleGoogleCallback,
      });
    };
  }, []);

  // This new function will be called when your custom button is clicked
  const handleGoogleSignup = () => {
    if (window.google) {
      window.google.accounts.id.prompt(); // This triggers the Google sign-in popup
    } else {
      console.error("Google SDK not loaded yet.");
    }
  };

  // Your original, custom button is back, now calling the correct function
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
      Sign up with Google
    </button>
  );
}