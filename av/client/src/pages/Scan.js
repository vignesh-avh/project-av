import React, { useState, useRef, useEffect } from "react";
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { API_BASE } from "../config";
// ===== First, add these imports at the top of the file =====
import Button from "../components/Button";
import Input from "../components/Input";
import { CameraIcon, ArrowUpOnSquareIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
// ===== ADD THIS IMPORT AT THE TOP =====
import toast from 'react-hot-toast';
// ======================================

export default function Scan({ onClose, onProductSaved }) {
  const [image, setImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [predictedName, setPredictedName] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("per_kg");
  const [count, setCount] = useState(""); // ADDED
  const [isPredicting, setIsPredicting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [, /* isCameraActive not used */ setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const validateProductName = (name) => {
    // Only allow letters, numbers, spaces and basic punctuation
    return /^[a-zA-Z0-9\s.,'-]+$/.test(name);
  };

  const stopCamera = () => {
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach(track => track.stop());
      streamRef.current = null;
      setIsCameraActive(false);
    }
  };

  const startCamera = async () => {
    try {
      stopCamera();
      
      if (!videoRef.current) {
        setCameraError("Video element not found");
        return;
      }
      
      const constraints = {
        video: {
          facingMode: "environment"
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      setIsCameraActive(true);
      setCameraError(null);
      
      videoRef.current.srcObject = stream;
      
      await new Promise((resolve) => {
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play()
            .then(resolve)
            .catch(err => {
              console.error("Play error:", err);
              setCameraError("Failed to start camera: " + err.message);
              resolve();
            });
        };
      });
      
    } catch (err) {
      console.error("Camera error:", err);
      setCameraError("Failed to access camera: " + err.message);
    }
  };

  const capturePhoto = () => {
    try {
      if (!videoRef.current || !canvasRef.current) {
        setCameraError("Camera elements not ready");
        return;
      }
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        setCameraError("Camera feed not available");
        return;
      }
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const context = canvas.getContext("2d");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob((blob) => {
        if (!blob) {
          setCameraError("Failed to capture photo");
          return;
        }
        
        const file = new File([blob], "captured.jpg", { type: "image/jpeg" });
        setImage(file);
        setPreviewUrl(URL.createObjectURL(blob));
        stopCamera();
      }, "image/jpeg");
      
    } catch (err) {
      console.error("Capture error:", err);
      setCameraError("Failed to capture photo: " + err.message);
    }
  };

  const handleUpload = async () => {
    if (!image) return toast.error("Please capture an image first.");
    
    setIsPredicting(true); // Start loading
    const formData = new FormData();
    formData.append("file", image);

    try {
      const res = await fetch(`${API_BASE}/predict/`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Prediction failed");

      const data = await res.json();
      setPredictedName(data.product_name || "Could not predict");
    } catch (err) {
      toast.error("Error contacting backend: " + err.message);
    } finally {
      setIsPredicting(false); // Stop loading
    }
  };

  const handleSubmit = async () => {
    // ... all of your existing validation if-statements go here ...
    if (!validateProductName(predictedName)) {
      toast.error("Invalid product name. Only letters, numbers and basic punctuation are allowed.");
      return;
    }
    if (!count || isNaN(parseInt(count)) || parseInt(count) <= 0) {
      toast.error("Please enter a valid count greater than zero.");
      return;
    }
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      toast.error("Please enter a valid price greater than zero.");
      return;
    }
    if (!image) {
      toast.error("Please capture an image of the product before saving.");
      return;
    }
    const userId = sessionStorage.getItem("userId");
    if (!userId) {
      toast.error("User ID not found. Please log in again.");
      return;
    }

    setIsSaving(true); // Start loading
    const formData = new FormData();
    formData.append("file", image);
    formData.append("product_name", predictedName);
    formData.append("price", price);
    formData.append("unit", unit);
    formData.append("owner_id", userId);
    formData.append("count", count);

    try {
      const res = await fetch(`${API_BASE}/add-product/`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      
      if (data.product_id && data.product) {
        toast.success("Product saved");
        if (onProductSaved) onProductSaved(data.product);
      } else {
        toast.error("Save failed: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      toast.error("Error saving product: " + err.message);
    } finally {
      setIsSaving(false); // Stop loading
    }
  };

  // ===== REPLACE THE ENTIRE 'return' STATEMENT WITH THIS NEW VERSION =====
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-neutral-200 flex justify-between items-center">
        <h2 className="text-xl font-bold">Add New Product</h2>
        <button onClick={onClose} className="text-2xl text-neutral-500 hover:text-neutral-800">×</button>
      </div>
      
      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        {cameraError && (
          <div className="bg-danger/10 text-red-800 p-3 rounded-lg text-sm">{cameraError}</div>
        )}

        {!previewUrl ? (
          <div className="flex flex-col items-center gap-4">
            <video ref={videoRef} className="w-full max-w-sm rounded-xl border-2 border-dashed border-neutral-300 aspect-square object-cover bg-neutral-900" autoPlay playsInline />
            <canvas ref={canvasRef} className="hidden" />
            <div className="flex gap-4 w-full max-w-sm">
              <Button onClick={startCamera} variant="secondary" className="flex-1">Start Camera</Button>
              <Button onClick={capturePhoto} className="flex-1">
                <CameraIcon className="h-5 w-5 mr-2"/> Capture
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <img src={previewUrl} alt="Captured product" className="w-full max-w-sm mx-auto rounded-xl border-2 border-primary" />
            <Button onClick={handleUpload} disabled={isPredicting}>
              {isPredicting ? (
                <>
                  <div className="h-5 w-5 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                  Predicting...
                </>
              ) : (
                <>
                  <ArrowUpOnSquareIcon className="h-5 w-5 mr-2" /> Predict Product
                </>
              )}
            </Button>
          </div>
        )}

        {predictedName && (
          <div className="border-t border-neutral-200 pt-6 space-y-4">
            <h3 className="text-lg font-semibold text-neutral-700">Confirm Details</h3>
            <Input value={predictedName} onChange={(e) => setPredictedName(e.target.value)} placeholder="Product name" />
            <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price" />
            <Input type="number" value={count} onChange={(e) => setCount(e.target.value)} placeholder="Stock Count (e.g., 20)" />
            
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className="w-full p-3 border border-neutral-300 rounded-lg">
              <option value="per_kg">per kg</option>
              <option value="per_100g">per 100g</option>
              <option value="per_piece">per piece</option>
            </select>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? (
                <>
                  <div className="h-5 w-5 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircleIcon className="h-5 w-5 mr-2" /> Save Product
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}