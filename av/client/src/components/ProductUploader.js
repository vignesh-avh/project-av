import React, { useState } from "react";
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css'; 

function ProductUploader() {
  const [image, setImage] = useState(null);
  const [predictedName, setPredictedName] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("per_kg");

  const validateProductName = (name) => {
    // Only allow letters, numbers, spaces and basic punctuation
    return /^[a-zA-Z0-9\s.,'-]+$/.test(name);
  };

  const handleUpload = async () => {
    if (!validateProductName(predictedName)) {
      alert("Invalid product name. Only letters, numbers and basic punctuation are allowed.");
      return;
    }
    
    const formData = new FormData();
    formData.append("file", image);

    const res = await fetch("http://127.0.0.1:8000/predict/", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    setPredictedName(data.product_name || "Try again");
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col gap-3">
        <label className="bg-blue-500 text-white px-4 py-3 rounded-lg text-center active:scale-95 transition-transform">
          Choose Image
          <input 
            type="file" 
            className="hidden" 
            onChange={(e) => setImage(e.target.files[0])} 
          />
        </label>
        
        <button 
          onClick={handleUpload} 
          className="bg-green-600 text-white px-4 py-3 rounded-lg active:scale-95 transition-transform"
        >
          Predict Product
        </button>
      </div>

      {predictedName && (
        <div className="space-y-4">
          <div className="bg-gray-100 p-4 rounded-lg">
            <p className="font-medium">Predicted: {predictedName}</p>
            
            {image && (
              <LazyLoadImage
                src={URL.createObjectURL(image)}
                alt="Uploaded"
                className="mt-3 rounded-lg border"
                effect="blur"
                placeholderSrc="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkqAcAAIUAgUW0RjgAAAAASUVORK5CYII="
              />
            )}
          </div>
          
          <input
            type="text"
            value={predictedName}
            onChange={(e) => setPredictedName(e.target.value)}
            className="border p-3 w-full rounded-lg"
            placeholder="Edit product name"
          />

          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="border p-3 w-full rounded-lg"
            placeholder="Price"
          />
          
          <select 
            value={unit} 
            onChange={(e) => setUnit(e.target.value)} 
            className="border p-3 w-full rounded-lg"
          >
            <option value="per_kg">per kg</option>
            <option value="per_100g">per 100g</option>
            <option value="per_piece">per piece</option>
          </select>
        </div>
      )}
    </div>
  );
}

export default ProductUploader;