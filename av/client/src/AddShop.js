import React, { useState } from "react";

export default function AddShop() {
  const [form, setForm] = useState({
    name: "",
    rating: "",
    latitude: "",
    longitude: "",
    products: "",
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      rating: parseFloat(form.rating),
      latitude: parseFloat(form.latitude),
      longitude: parseFloat(form.longitude),
      products: form.products.split(",").map((p) => p.trim()),
    };

    try {
      const res = await fetch("http://localhost:8000/add-shop/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      alert(data.message || "Shop added.");
    } catch (err) {
      console.error("Error adding shop:", err);
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      <h2 className="text-2xl font-bold text-center">Add Shop</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input name="name" onChange={handleChange} value={form.name} className="border p-2 w-full" placeholder="Shop Name" required />
        <input name="rating" onChange={handleChange} value={form.rating} className="border p-2 w-full" placeholder="Rating (0-5)" required />
        <input name="latitude" onChange={handleChange} value={form.latitude} className="border p-2 w-full" placeholder="Latitude" required />
        <input name="longitude" onChange={handleChange} value={form.longitude} className="border p-2 w-full" placeholder="Longitude" required />
        <input name="products" onChange={handleChange} value={form.products} className="border p-2 w-full" placeholder="Products (comma separated)" required />
        <button type="submit" className="bg-blue-600 text-white p-2 rounded w-full">Save Shop</button>
      </form>
    </div>
  );
}
