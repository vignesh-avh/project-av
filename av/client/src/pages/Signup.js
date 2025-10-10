import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import GoogleButton from '../components/GoogleButton';
import Button from "../components/Button";
import Card from "../components/Card";
import Input from "../components/Input";
import { Link } from "react-router-dom";
import { signup, verifyOtp } from "../services/api"; // <-- Import verifyOtp
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
  
  // --- NEW STATE MANAGEMENT FOR OTP FLOW ---
  const [step, setStep] = useState('signup'); // 'signup' or 'verify'
  const [otp, setOtp] = useState('');
  // -----------------------------------------

  const location = useLocation(); 
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const role = params.get("role");

  // Step 1: Handle the initial signup form submission
  const handleSignup = async (e) => {
    e.preventDefault();
    try {
      // This now only sends the OTP and doesn't return a token
      await signup({ ...formData, role });
      toast.success("OTP sent to your email!");
      setStep('verify'); // Move to the OTP verification step
    } catch (error) {
      toast.error("Signup failed: " + (error.response?.data?.detail || error.message));
    }
  };

  // Step 2: Handle the OTP verification
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    try {
      // Call the new verification endpoint
      const response = await verifyOtp(formData.email, otp);
      
      // If successful, we get the token and log the user in
      secureStorage.setItem("token", response.access_token);
      
      const decoded = jwtDecode(response.access_token); 
      sessionStorage.setItem("userId", decoded.uid || "");
      sessionStorage.setItem("role", decoded.role || "customer");
      sessionStorage.setItem("onboardingDone", decoded.onboardingDone ? "true" : "false"); 
      
      window.dispatchEvent(new Event('userChanged'));
      toast.success("Account verified successfully!");
      
      if (decoded.role === "owner") {
        navigate(decoded.onboardingDone ? "/myshop" : "/onboarding", { replace: true });
      } else {
        navigate("/home", { state: { showReferral: true }, replace: true }); 
      }
    } catch (error) {
      toast.error("Verification failed: " + (error.response?.data?.detail || error.message));
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
          {step === 'signup' ? (
            // --- SIGNUP FORM (Step 1) ---
            <>
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
            </>
          ) : (
            // --- OTP VERIFICATION FORM (Step 2) ---
            <>
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-neutral-800">Verify Your Email</h1>
                <p className="text-neutral-500 mt-2">
                  An OTP has been sent to <strong>{formData.email}</strong>. Please enter it below.
                </p>
              </div>
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <Input 
                  name="otp" 
                  placeholder="6-Digit OTP" 
                  value={otp} 
                  onChange={(e) => setOtp(e.target.value)} 
                  required 
                  maxLength="6"
                />
                <Button type="submit" variant="primary">Verify Account</Button>
              </form>
            </>
          )}
        </Card>
        <p className="text-center mt-6 text-sm text-neutral-600">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline">Log In</Link> 
        </p>
      </div>
    </div>
  );
}