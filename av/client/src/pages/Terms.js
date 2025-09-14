import React from 'react';
import { useNavigate } from 'react-router-dom';
import Button from "../components/Button";
import Card from "../components/Card";

export default function Terms() {
  const navigate = useNavigate();
  
  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-neutral-800">Terms & Conditions</h1>
        <p className="text-neutral-500 mt-2">Last updated: September 11, 2025</p>
      </div>
      <Card className="space-y-4 text-neutral-600">
        <h2 className="text-xl font-semibold text-neutral-800">1. Introduction</h2>
        <p>Welcome to Project AV. These terms and conditions outline the rules and regulations for the use of our application.</p>
        <h2 className="text-xl font-semibold text-neutral-800 pt-4 border-t">2. Intellectual Property Rights</h2>
        <p>Other than the content you own, under these Terms, Project AV and/or its licensors own all the intellectual property rights and materials contained in this App.</p>
        {/* Add more terms content here */}
      </Card>
      <div className="mt-6">
        <Button onClick={() => navigate(-1)} variant="secondary">Go Back</Button>
      </div>
    </div>
  )
}