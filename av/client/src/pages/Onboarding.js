import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { secureStorage } from "../services/auth";
import { jwtDecode } from 'jwt-decode';
import LocationPickerMap from '../components/LocationPickerMap';
import { BuildingStorefrontIcon, MapPinIcon, StarIcon } from "@heroicons/react/24/outline";
import Button from "../components/Button";
import Card from "../components/Card";
import Input from "../components/Input";
import toast from 'react-hot-toast';

// Helper function to validate Indian coordinates
function isValidIndianCoordinate(lat, lng) {
  return (
    !isNaN(lat) && !isNaN(lng) &&
    lat >= 6.0 && lat <= 38.0 &&  // Updated to 38.0
    lng >= 68.0 && lng <= 98.0
  );
}

// New precise location function
const getPreciseLocation = () => {
  return new Promise((resolve, reject) => {
    
    const processPosition = (pos) => {
      // ✅ CRITICAL ACCURACY CHECK
      // If the accuracy radius is larger than 150 meters, the location is too vague.
      if (pos.coords.accuracy > 150) {
        reject(new Error(`Location is not accurate enough (Accuracy: ${Math.round(pos.coords.accuracy)}m). Please move to an area with a clearer signal, like near a window.`));
        return;
      }

      const { latitude, longitude } = pos.coords;
      if (isValidIndianCoordinate(latitude, longitude)) {
        resolve({
          latitude: parseFloat(latitude.toFixed(6)),
          longitude: parseFloat(longitude.toFixed(6)),
          accuracy: pos.coords.accuracy
        });
      } else {
        reject(new Error("The captured location is outside of India."));
      }
    };

    // 1. First, try for high-accuracy (GPS)
    navigator.geolocation.getCurrentPosition(
      processPosition,
      (err) => {
        console.warn(`High-accuracy location failed (${err.message}). Falling back to network-based location.`);
        
        // 2. Fallback: Try low-accuracy (Wi-Fi/Network)
        navigator.geolocation.getCurrentPosition(
          processPosition, // Use the same handler with the accuracy check
          (fallbackErr) => {
            // If both attempts fail, reject the promise with a clear message.
            reject(new Error("Could not determine location. Please ensure location services are enabled in your browser and for this site."));
          },
          {
            enableHighAccuracy: false,
            timeout: 15000,
            maximumAge: 0
          }
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
};

export default function Onboarding() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [rating, setRating] = useState(5.0);
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [store, setStore] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    const checkShopExists = async () => {
      try {
        const token = secureStorage.getItem("token");
        if (!token) {
          navigate("/login");
          return;
        }

        const decoded = jwtDecode(token);
        const userId = decoded.uid;
        
        // Check if shop already exists
        const response = await fetch(
          `${process.env.REACT_APP_API_URL}/check-shop-exists?owner_id=${userId}`
        );
        
        if (!response.ok) {
          throw new Error("Failed to check shop existence");
        }
        
        const data = await response.json();
        
        if (data.exists) {
          navigate("/myshop", { replace: true });
        }
      } catch (error) {
        console.error("Shop check error:", error);
        // Proceed to show form if check fails
      }
    };

    checkShopExists();
  }, [navigate]);

  useEffect(() => {
    const token = secureStorage.getItem("token");
    if (token) {
      try {
        const decoded = jwtDecode(token);
        // If the token itself says onboarding is done, redirect immediately.
        if (decoded.onboardingDone) {
          navigate("/myshop", { replace: true });
        }
      } catch (e) {
        // Invalid token, do nothing. The main PrivateRoute will handle it.
        console.error("Invalid token on onboarding page:", e);
      }
    }
  }, [navigate]);
  // ==================== FIXED FUNCTION ====================
  // This function is now robust and ensures an accurate location is fetched.
   const fetchLocation = async () => {
    setLocationError('');
    setShowMap(false);
    setLatitude(null);
    setLongitude(null);

    try {
      const location = await getPreciseLocation();
      setLatitude(location.latitude);
      setLongitude(location.longitude);
      
      const locationData = { latitude: location.latitude, longitude: location.longitude };
      sessionStorage.setItem("userLocation", JSON.stringify(locationData));
      localStorage.setItem("lastKnownLocation", JSON.stringify(locationData));
    } catch (error) {
      // If auto-detection fails, show an error and display the map
      setLocationError(error.message);
      setShowMap(true);
    }
  };

  // NEW FUNCTION: To handle location selected from the map
  const handleManualLocationSelect = (location) => {
    setLatitude(parseFloat(location.lat.toFixed(6)));
    setLongitude(parseFloat(location.lng.toFixed(6)));
    
    // Hide the map and clear the error once location is confirmed
    setShowMap(false);
    setLocationError('');
  };

  // Updated submit handler with precise location
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // If we already have lat/lng, keep them; otherwise try to get a precise fix
    let location = (latitude && longitude) ? { latitude, longitude } : null;

    if (!location) {
      try {
        const precise = await getPreciseLocation();
        location = { latitude: precise.latitude, longitude: precise.longitude };
        // persist for later (as you already do)
        sessionStorage.setItem("userLocation", JSON.stringify(location));
        localStorage.setItem("lastKnownLocation", JSON.stringify(location));
        setLatitude(location.latitude);
        setLongitude(location.longitude);
      } catch (err) {
        toast.error("Failed to get precise location. Please move outdoors and try again.");
        return;
      }
    }

    if (!isValidIndianCoordinate(location.latitude, location.longitude)) {
      toast.error("Invalid location coordinates. Please enable precise location.");
      return;
    }
    
    setIsSubmitting(true);
    // Validate all fields strictly
    if (!name || !store) {
      toast.error("Please fill all fields and capture your current location.");
      setIsSubmitting(false);
      return;
    }

    try {
      const token = secureStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return;
      }

      // Extract user ID from token
      const decoded = jwtDecode(token);
      const userId = decoded.uid;

      const response = await fetch(`${process.env.REACT_APP_API_URL}/add-shop`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name, 
          rating, 
          latitude: location.latitude, // Use existing/fetched coordinates
          longitude: location.longitude, // Use existing/fetched coordinates
          store, 
          owner_id: userId
        })
      });

      if (response.ok) {
        const result = await response.json();
        // Store new token with updated claims
        secureStorage.setItem("token", result.access_token);
        
        sessionStorage.setItem("onboardingDone", "true");
        secureStorage.setItem("onboardingDone", "true");
        sessionStorage.setItem("hasEnteredReferral", "true");
        window.dispatchEvent(new Event("onboardingDone"));
        
        // Redirect to myshop
        navigate("/myshop", { replace: true });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Shop registration failed");
      }
    } catch (err) {
      toast.error(err.message || "Server error while adding shop.");
      console.error("Onboarding error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };
   const defaultMapCenter = { lat: 17.3850, lng: 78.4867 };

   return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-neutral-800">Set Up Your Shop</h1>
          <p className="text-neutral-500 mt-2">Fill in your shop details to get started.</p>
        </div>
        <Card>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="relative">
              <BuildingStorefrontIcon className="h-5 w-5 text-neutral-400 absolute top-3.5 left-3 pointer-events-none" />
              <Input name="name" placeholder="Shop Name" value={name} onChange={(e) => setName(e.target.value)} required className="pl-10" />
            </div>
            <div className="relative">
              <StarIcon className="h-5 w-5 text-neutral-400 absolute top-3.5 left-3 pointer-events-none" />
              <Input type="number" step="0.1" min="0" max="5" name="rating" placeholder="Initial Rating (e.g., 4.5)" value={rating} onChange={(e) => setRating(parseFloat(e.target.value))} required className="pl-10" />
            </div>
            <div className="relative">
              <Input name="store" placeholder="Store Type (e.g., Kirana, Medical)" value={store} onChange={(e) => setStore(e.target.value)} required />
            </div>

            {/* --- Redesigned Location Section --- */}
            <div className="border-t border-neutral-200 pt-6 space-y-4">
              <h3 className="text-lg font-semibold text-center text-neutral-700">Shop Location</h3>
              {locationError && (
                <div className="bg-warning/10 text-amber-800 p-3 rounded-lg text-sm">{locationError}</div>
              )}
              {latitude && longitude && !showMap && (
                <div className="bg-success/10 text-green-800 p-3 rounded-lg text-center font-semibold">✅ Location Captured!</div>
              )}
              <Button type="button" variant="secondary" onClick={fetchLocation}>
                <MapPinIcon className="h-5 w-5 mr-2" />
                Use Current Location
              </Button>
              {showMap && (
                <LocationPickerMap
                  initialPosition={defaultMapCenter}
                  onLocationSelect={handleManualLocationSelect}
                />
              )}
            </div>

            <div className="border-t border-neutral-200 pt-6">
              <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting || (!latitude || !longitude)}>
                Save & Finish Onboarding
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
   );
}