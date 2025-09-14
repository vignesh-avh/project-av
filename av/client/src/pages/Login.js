import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { secureStorage } from "../services/auth";
import { login } from "../services/api";
import GoogleButton from "../components/GoogleButton";
import { jwtDecode } from 'jwt-decode';
import Button from "../components/Button";
import Card from "../components/Card";
import Input from "../components/Input";
import { Link } from "react-router-dom";
import toast from 'react-hot-toast';

export default function Login() {
  const [credentials, setCredentials] = useState({ 
    email: "", 
    password: "" 
  });
  const navigate = useNavigate();

  useEffect(() => {
    const userId = sessionStorage.getItem("userId");
    if (userId) {
      navigate("/home", { 
        replace: true,
        state: { 
          fromAuth: true,
          timestamp: Date.now()
        }
      });
    }
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const { access_token } = await login(credentials.email, credentials.password);
      secureStorage.setItem("token", access_token);
      
      const decoded = jwtDecode(access_token);
      
      sessionStorage.setItem("userId", decoded.uid);
      sessionStorage.setItem("role", decoded.role);
      sessionStorage.setItem("onboardingDone", decoded.onboardingDone.toString());
      sessionStorage.setItem("hasEnteredReferral", decoded.hasEnteredReferral.toString());
      
      const event = new Event('userChanged');
      window.dispatchEvent(event);
      
      navigate("/home", { 
        replace: true,
        state: { noBack: true }
      });
    } catch (error) {
      toast.error("Login failed: " + error.message);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-50 p-4">
      <div className="w-full max-w-md">
        <Card>
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-neutral-800">Welcome Back</h1>
            <p className="text-neutral-500 mt-2">Please enter your details to login.</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              type="email"
              placeholder="Email Address"
              value={credentials.email}
              onChange={(e) => setCredentials({...credentials, email: e.target.value})}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={credentials.password}
              onChange={(e) => setCredentials({...credentials, password: e.target.value})}
              required
            />
            <Button type="submit">Login</Button>
          </form>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-neutral-300"></span>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-2 text-neutral-500">Or continue with</span>
            </div>
          </div>
          <GoogleButton />
        </Card>
        <p className="text-center mt-6 text-sm text-neutral-600">
          Don't have an account?{" "}
          <Link to="/" className="font-semibold text-primary hover:underline">Sign Up</Link>
        </p>
      </div>
    </div>
  );
}