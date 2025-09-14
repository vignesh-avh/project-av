import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { secureStorage } from "../services/auth";
import { jwtDecode } from 'jwt-decode';

export default function Welcome() {
  const navigate = useNavigate();

  // This new "auth guard" checks if the user is already logged in.
  // If they are, it redirects them to their main page immediately.
  useEffect(() => {
    const token = secureStorage.getItem("token");
    if (token) {
      try {
        const decoded = jwtDecode(token);
        const role = decoded.role || "customer";
        
        if (role === "owner") {
          const onboardingDone = decoded.onboardingDone ?? false;
          navigate(onboardingDone ? "/myshop" : "/onboarding", { replace: true });
        } else {
          navigate("/home", { replace: true });
        }
      } catch (error) {
        console.error("Invalid token found on Welcome page, allowing navigation.");
      }
    }
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-50 p-6 text-center">
      <div className="max-w-md">
        <h1 className="text-5xl font-extrabold text-neutral-800">
          Welcome to <span className="text-primary">Project AV</span>
        </h1>
        <p className="mt-4 text-lg text-neutral-600">
          Your one-stop platform for connecting local shops with customers.
        </p>
        
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div
            // The `{ replace: true }` option has been removed to allow back navigation here.
            onClick={() => navigate("/signup?role=customer")}
            className="p-6 bg-white border-2 border-transparent rounded-2xl shadow-lg hover:border-primary hover:shadow-xl cursor-pointer transition-all duration-300"
          >
            <h2 className="text-xl font-bold text-neutral-800">I am a Customer</h2>
            <p className="mt-2 text-sm text-neutral-500">Find the best products and deals from shops near you.</p>
          </div>
          <div
            // The `{ replace: true }` option has been removed here as well.
            onClick={() => navigate("/signup?role=owner")}
            className="p-6 bg-white border-2 border-transparent rounded-2xl shadow-lg hover:border-primary hover:shadow-xl cursor-pointer transition-all duration-300"
          >
            <h2 className="text-xl font-bold text-neutral-800">I am a Shop Owner</h2>
            <p className="mt-2 text-sm text-neutral-500">List your products, manage inventory, and grow your business.</p>
          </div>
        </div>
      </div>
    </div>
  );
}