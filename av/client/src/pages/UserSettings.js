import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
// FIXED: Removed the incorrect import of sessionStorage from './services/auth'
import LocationPickerMap from "../components/LocationPickerMap"; // FIXED: Corrected filename case
import { API_BASE } from "../config";

export default function UserSettings() {
  const [userData, setUserData] = useState({ fullName: "", email: "", city: "" });
  const [initialData, setInitialData] = useState({ fullName: "", city: "" });
  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const navigate = useNavigate();

  // State for owner location feature
  const [role, setRole] = useState("");
  const [showMap, setShowMap] = useState(false);
  const defaultMapCenter = { lat: 17.3850, lng: 78.4867 };

  useEffect(() => {
    const fetchUserData = async () => {
      // FIXED: Directly use the global sessionStorage object
      const userId = sessionStorage.getItem("userId");
      const userRole = sessionStorage.getItem("role");
      setRole(userRole);

      if (!userId) {
        navigate("/login");
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/get-user?user_id=${userId}`);
        const data = await response.json();
        const profile = {
          fullName: data.fullName || "",
          email: data.email || "",
          city: data.city || ""
        };
        setUserData(profile);
        setInitialData({ fullName: profile.fullName, city: profile.city });
      } catch (error) {
        setMessage({ type: 'error', text: 'Failed to load user data.' });
      } finally {
        setLoading(false);
      }
    };
    fetchUserData();
  }, [navigate]);

  const handleProfileUpdate = async () => {
    if (!userData.fullName.trim()) {
      setMessage({ type: 'error', text: 'Full name cannot be empty.' });
      return;
    }
    setSaveLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const userId = sessionStorage.getItem("userId");
      const response = await fetch(`${API_BASE}/update-user-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, fullName: userData.fullName.trim(), city: userData.city.trim() })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Update failed.");
      }
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
      setInitialData({ fullName: userData.fullName, city: userData.city });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaveLoading(false);
    }
  };
  
  const handleLocationSelect = async (location) => {
      setSaveLoading(true);
      setShowMap(false);
      try {
        const ownerId = sessionStorage.getItem("userId");
        const response = await fetch(`${API_BASE}/owner/update-shop-location`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owner_id: ownerId, latitude: location.lat, longitude: location.lng })
        });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.detail || "Failed to update location.");
        }
        setMessage({ type: 'success', text: 'Shop location updated successfully!' });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      } catch (error) {
        setMessage({ type: 'error', text: error.message });
      } finally {
        setSaveLoading(false);
      }
  };

  const isProfileChanged = userData.fullName !== initialData.fullName || userData.city !== initialData.city;

  if (loading) {
    return <div className="p-4 text-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 font-sans">
      <div className="max-w-xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-800">Settings</h1>
          <p className="text-neutral-500 mt-2">Manage your profile and shop details.</p>
        </div>
        
        {message.text && (
          <div className={`p-4 rounded-lg text-center font-medium ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {message.text}
          </div>
        )}

        {/* --- PROFILE INFORMATION CARD --- */}
        <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200 space-y-6">
          <h2 className="text-2xl font-semibold text-gray-700">Profile Information</h2>
          <div>
            <label className="block mb-1 font-medium text-gray-600">Full Name</label>
            <input type="text" value={userData.fullName} onChange={(e) => setUserData({...userData, fullName: e.target.value})} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <div>
            <label className="block mb-1 font-medium text-gray-600">Email</label>
            <input type="email" value={userData.email} readOnly className="w-full p-3 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed" />
          </div>
          <div>
            <label className="block mb-1 font-medium text-gray-600">City</label>
            <input type="text" value={userData.city} onChange={(e) => setUserData({...userData, city: e.target.value})} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <button onClick={handleProfileUpdate} disabled={saveLoading || !isProfileChanged} className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            {saveLoading ? 'Saving...' : 'Save Profile Changes'}
          </button>
        </div>

        {/* --- OWNER-ONLY LOCATION SETTINGS CARD --- */}
        {role === 'owner' && (
          <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-200 space-y-4">
            <h2 className="text-2xl font-semibold text-gray-700">Shop Location</h2>
            {showMap ? (
              <div>
                <p className="text-center text-neutral-600 mb-4">Click a point on the map, then confirm.</p>
                <LocationPickerMap
                  initialPosition={defaultMapCenter}
                  onLocationSelect={handleLocationSelect}
                />
                <button onClick={() => setShowMap(false)} className="w-full bg-gray-200 text-gray-700 py-2.5 rounded-lg mt-4 text-sm font-medium">
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setShowMap(true)} className="w-full bg-gray-200 text-gray-700 py-2.5 rounded-lg text-sm font-medium">
                Update Shop Location on Map
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}