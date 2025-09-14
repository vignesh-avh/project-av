import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { secureStorage } from '../services/auth';
import { jwtDecode } from 'jwt-decode';

export default function PublicRouteOnly({ children }) {
  const [status, setStatus] = useState('checking');
  const navigate = useNavigate();

  useEffect(() => {
    const token = secureStorage.getItem("token");

    if (token) {
      try {
        const decoded = jwtDecode(token);
        const role = decoded.role || "customer";
        const onboardingDone = decoded.onboardingDone ?? false;

        // User IS logged in, so redirect them away from this public page.
        if (role === "owner") {
          navigate(onboardingDone ? "/myshop" : "/onboarding", { replace: true });
        } else {
          navigate("/home", { replace: true });
        }
      } catch (error) {
        // Token is invalid, so treat user as logged out.
        secureStorage.removeItem("token");
        setStatus('allowed');
      }
    } else {
      // No token, user is logged out, allow them to see the public page.
      setStatus('allowed');
    }
  }, [navigate]);

  // While checking, show a blank screen to prevent any flicker
  if (status === 'checking') {
    return <div className="min-h-screen w-full bg-neutral-50" />;
  }

  // If check is complete and user is logged out, show the page (e.g., Welcome, Login).
  return children;
}