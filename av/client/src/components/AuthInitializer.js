import React, { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { jwtDecode } from 'jwt-decode';
import { secureStorage } from "../services/auth";

// Function to update user location via API
const updateUserLocation = async (latitude, longitude) => {
  try {
    const token = secureStorage.getItem("token");
    if (!token) return;

    const response = await fetch('/api/user/location', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ latitude, longitude })
    });

    if (response.ok) {
      console.log("User location updated successfully");
    } else {
      console.error("Failed to update user location");
    }
  } catch (error) {
    console.error("Error updating user location:", error);
  }
};

function AuthInitializer() {
  const navigate = useNavigate();
  const location = useLocation();

  // Add location sync on login
  useEffect(() => {
    const userLocation = JSON.parse(sessionStorage.getItem("userLocation") || "{}");
    if (userLocation.latitude && userLocation.longitude) {
      updateUserLocation(userLocation.latitude, userLocation.longitude);
    }
  }, []);

  useEffect(() => {
    const token = secureStorage.getItem("token");
    const currentPath = location.pathname;
    
    if (token) {
      try {
        const decoded = jwtDecode(token);
        const role = decoded.role || "customer";
        const onboardingDone = decoded.onboardingDone ?? false;
        const hasEnteredReferral = decoded.hasEnteredReferral ?? false;
        
        // Set initial session state
        sessionStorage.setItem("role", role);
        sessionStorage.setItem("onboardingDone", onboardingDone.toString());
        sessionStorage.setItem("hasEnteredReferral", hasEnteredReferral.toString());
        sessionStorage.setItem("userId", decoded.uid || "");

        // NEW: Prevent redirect to onboarding
        if (role === "owner" && !onboardingDone && currentPath === "/onboarding") {
            // Allow staying on onboarding route
            return;
        }

        // NEW: Prevent back navigation to auth pages
        if (["/", "/signup", "/login"].includes(currentPath)) {
          if (role === "owner") {
            navigate(onboardingDone ? "/myshop" : "/onboarding", { replace: true });
          } else {
            navigate("/home", { replace: true });
          }
          return;
        }

        // Redirect logic
        const validPaths = [
          "/home", "/myshop", "/cart", "/shops", "/onboarding",
          "/", "/signup", "/login", "/terms", "/settings",
          "/subscription", "/referral", "/customer-referral"
        ];
        
        const shouldRedirect = !validPaths.includes(currentPath) && 
                              !currentPath.startsWith("/shop/");
        
        if (shouldRedirect) {
          if (role === "owner" && !onboardingDone) {
            navigate("/onboarding", { replace: true });
          } else if (role === "customer" && !hasEnteredReferral) {
            navigate("/home", { state: { showReferral: true }, replace: true });
          } else {
            navigate("/home", { replace: true });
          }
        }
      } catch (error) {
        console.error("Token validation error:", error);
        secureStorage.removeItem("token");
        sessionStorage.clear();
        navigate("/login");
      }
    } else if (!["/", "/signup", "/login"].includes(currentPath)) {
      navigate("/login", { replace: true }); // FIX: Add replace:true
    }
  }, [navigate, location.pathname]);

  return null;
}

export default AuthInitializer;