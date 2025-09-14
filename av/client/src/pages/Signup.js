import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import GoogleButton from '../components/GoogleButton';
import Button from "../components/Button";
import Card from "../components/Card";
import Input from "../components/Input";
import { Link } from "react-router-dom";

import { signup } from "../services/api";
import { secureStorage } from "../services/auth";
import { jwtDecode } from 'jwt-decode';
import toast from 'react-hot-toast';

export default function Signup() {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    city: "",
    password: ""
  });

  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const role = params.get("role");

  const handleSignup = async (e) => {
    e.preventDefault();
    try {
      const response = await signup({ ...formData, role });
      secureStorage.setItem("token", response.access_token);
      
      // Immediately decode and store claims
      const decoded = jwtDecode(response.access_token);
      
      // Store all claims in sessionStorage
      sessionStorage.setItem("userId", decoded.uid || "");
      sessionStorage.setItem("role", decoded.role || "customer");
      sessionStorage.setItem("onboardingDone", decoded.onboardingDone ? "true" : "false");
      
      // Dispatch event to update app state
      window.dispatchEvent(new Event('userChanged'));
      
      // UPDATED: Added referral state for customers
      if (decoded.role === "owner") {
        navigate(decoded.onboardingDone ? "/myshop" : "/onboarding", { replace: true });
      } else if (!decoded.hasEnteredReferral) {
        navigate("/home", { state: { showReferral: true }, replace: true });
      } else {
        // CHANGE MADE HERE: Added noBack state to prevent back navigation
        navigate("/home", { 
          replace: true,
          state: { noBack: true } // NEW: Prevent back navigation
        });
      }
    } catch (error) {
      toast.error("Signup failed: " + error.message);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-50 p-4">
      <div className="w-full max-w-md">
        <Card>
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-neutral-800">
              {role === "owner" ? "Create a Shop Owner Account" : "Create a Customer Account"}
            </h1>
            <p className="text-neutral-500 mt-2">Get started in just a few clicks.</p>
          </div>
          <form onSubmit={handleSignup} className="space-y-4">
            <Input name="fullName" placeholder="Full Name" value={formData.fullName} onChange={handleChange} required />
            <Input type="email" name="email" placeholder="Email Address" value={formData.email} onChange={handleChange} required />
            <Input name="city" placeholder="City" value={formData.city} onChange={handleChange} required />
            <Input type="password" name="password" placeholder="Password" value={formData.password} onChange={handleChange} required />
            <Button type="submit" variant="primary">Create Account</Button>
          </form>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-neutral-300"></span>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-2 text-neutral-500">Or sign up with</span>
            </div>
          </div>
          <GoogleButton role={role} />
        </Card>
        <p className="text-center mt-6 text-sm text-neutral-600">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline">Log In</Link>
        </p>
      </div>
    </div>
  );
}