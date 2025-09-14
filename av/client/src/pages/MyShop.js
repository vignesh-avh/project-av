import React, { useState, useEffect, useMemo } from "react";
import { API_BASE } from "../config";
import Scan from "./Scan";
// ===== ADD THESE IMPORTS =====
import Card from "../components/Card";
import Button from "../components/Button";
import Input from "../components/Input";
import { PlusIcon, PencilIcon, TrashIcon, TagIcon, CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";
// ===== ADD TOAST IMPORT =====
import toast from 'react-hot-toast';


// ===== REPLACE THE EXISTING 'PromotionModal' FUNCTION WITH THIS VERSION =====
function PromotionModal({ product, isOpen, onClose, onPromotionSet }) {
  const [salePrice, setSalePrice] = useState("");
  const [saleDescription, setSaleDescription] = useState("");
  const [durationDays, setDurationDays] = useState(7);

  useEffect(() => {
    if (product) {
      setSalePrice(product.salePrice || "");
      setSaleDescription(product.saleDescription || "");
    }
  }, [product]);

  if (!isOpen || !product) return null;

  const handleSubmit = async () => {
    if (!salePrice || isNaN(parseFloat(salePrice)) || parseFloat(salePrice) <= 0) {
      toast.error("Please enter a valid sale price.");
      return;
    }
    if (parseFloat(salePrice) >= product.price) {
      toast.error("Sale price must be less than the original price.");
      return;
    }
    await onPromotionSet({
      salePrice: parseFloat(salePrice),
      saleDescription,
      durationDays
    });
  };

  const handleRemove = async () => {
    if (window.confirm("Are you sure you want to remove this promotion?")) {
      await onPromotionSet(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <h3 className="text-2xl font-bold mb-2">Manage Promotion</h3>
        <p className="text-neutral-500 mb-6">for <span className="font-semibold">{product.product_name}</span></p>
        <div className="space-y-4">
          <Input type="number" value={salePrice} onChange={e => setSalePrice(e.target.value)} placeholder={`Sale Price (Original: ₹${product.price})`} />
          <Input type="text" value={saleDescription} onChange={e => setSaleDescription(e.target.value)} placeholder="Offer Description (e.g., Weekend Special)" />
          <select value={durationDays} onChange={e => setDurationDays(Number(e.target.value))} className="w-full p-3 border border-neutral-300 rounded-lg bg-white">
            <option value={1}>1 Day</option>
            <option value={3}>3 Days</option>
            <option value={7}>1 Week</option>
            <option value={30}>1 Month</option>
          </select>
        </div>
        <div className="mt-6 space-y-2">
          <Button onClick={handleSubmit} variant="primary">{product.isOnSale ? 'Update Promotion' : 'Start Promotion'}</Button>
          {product.isOnSale && ( <Button onClick={handleRemove} variant="danger">Remove Promotion</Button> )}
          <Button onClick={onClose} variant="secondary">Cancel</Button>
        </div>
      </Card>
    </div>
  );
}
// =========================================================================

export default function MyShop() {
  const [products, setProducts] = useState([]);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editForm, setEditForm] = useState({
    product_name: "",
    price: "",
    unit: "per_kg",
    count: ""
  });
  const [showScanner, setShowScanner] = useState(false);
  const [referralEarnings, setReferralEarnings] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ADDED NEW STATE VARIABLES
  const [productToPromote, setProductToPromote] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const fetchReferralEarnings = async () => {
      const userId = sessionStorage.getItem("userId");
      if (!userId) return;
      
      try {
        const response = await fetch(`${API_BASE}/get-user?user_id=${userId}`);
        const data = await response.json();
        setReferralEarnings(data.referral_earnings || 0);
      } catch (error) {
        console.error("Error fetching referral earnings:", error);
      }
    };
    
    fetchReferralEarnings();
  }, []);

  useEffect(() => {
    async function fetchProducts() {
      const userId = sessionStorage.getItem("userId");
      if (!userId) return;

      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/get-products/?owner_id=${userId}`);
        const data = await res.json();
        
        if (data.products) {
          setProducts(data.products);
        }
        setLoading(false);
      } catch (err) {
        console.error("Failed to fetch products", err);
        setError("Failed to load products. Please try again.");
        setLoading(false);
      }
    }
    
    fetchProducts();
  }, []);

  const [inStockProducts, outOfStockProducts] = useMemo(() => {
    const inStock = products.filter(p => p.inStock);
    const outOfStock = products.filter(p => !p.inStock);
    return [inStock, outOfStock];
  }, [products]);

  // ADDED NEW HANDLER FUNCTIONS
  const handleOpenPromotionModal = (product) => {
    setProductToPromote(product);
    setIsModalOpen(true);
  };

  const handleSetPromotion = async (promotionData) => {
    if (!productToPromote) return;
    const productId = productToPromote._id;
    let updatedProduct;
    try {
      if (promotionData) {
        const response = await fetch(`${API_BASE}/products/${productId}/promotion`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(promotionData)
        });
        if (!response.ok) throw new Error("Failed to set promotion");
        updatedProduct = { ...productToPromote, ...promotionData, isOnSale: true };
      } else {
        const response = await fetch(`${API_BASE}/products/${productId}/promotion`, {
          method: "DELETE"
        });
        if (!response.ok) throw new Error("Failed to remove promotion");
        updatedProduct = { ...productToPromote, isOnSale: false, salePrice: undefined, saleDescription: undefined, saleEndDate: undefined };
      }
      setProducts(products.map(p => p._id === productId ? updatedProduct : p));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsModalOpen(false);
      setProductToPromote(null);
    }
  };

  const handleStockToggle = async (productId, newStatus) => {
    const originalProducts = [...products];
    const updatedProducts = products.map(product => 
      product._id === productId ? {...product, inStock: newStatus} : product
    );
    setProducts(updatedProducts);

    try {
      const response = await fetch(`${API_BASE}/update-product/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          inStock: newStatus,
          lastUpdated: new Date().toISOString() 
        })
      });
      if (!response.ok) {
        setProducts(originalProducts);
        toast.error("Failed to update stock status. Please try again.");
      }
    } catch (error) {
      setProducts(originalProducts);
      console.error("Stock update error:", error);
      toast.error("Failed to update stock status. Please check your connection.");
    }
  };

  const toggleScanner = () => {
    setShowScanner(!showScanner);
  };

  const handleProductSaved = (savedProduct) => {
    if (savedProduct) {
      setProducts(prevProducts => [savedProduct, ...prevProducts]);
    }
    setShowScanner(false);
  };

  const handleDelete = async (productId) => {
    try {
      const response = await fetch(`${API_BASE}/delete-product/${productId}`, {
        method: "DELETE"
      });
      const result = await response.json();
      
      if (response.ok) {
        setProducts(products.filter(product => product._id !== productId));
        toast.success("Product deleted successfully!");
      } else {
        toast.error(`Delete failed: ${result.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete product. Please try again.");
    }
  };

  const handleEditClick = (product) => {
    setEditingProduct(product._id);
    setEditForm({
      product_name: product.product_name,
      price: product.price.toString(),
      unit: product.unit,
      count: product.count.toString()
    });
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setEditForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleEditSubmit = async (productId) => {
    if (!editForm.product_name.trim()) {
      toast.error("Please enter a product name");
      return;
    }
    
    if (!editForm.price || isNaN(parseFloat(editForm.price))) {
      toast.error("Please enter a valid price");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/update-product/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editForm, _id: productId })
      });
      const result = await response.json();
      
      if (response.ok) {
        setProducts(products.map(product => 
          product._id === productId ? {
            ...product,
            product_name: editForm.product_name,
            price: parseFloat(editForm.price),
            unit: editForm.unit,
            count: parseInt(editForm.count, 10)
          } : product
        ));
        
        setEditingProduct(null);
        toast.success("Product updated successfully!");
      } else {
        toast.error(`Update failed: ${result.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Update error:", error);
      toast.error("Failed to update product. Please try again.");
    }
  };

  const handleCancelEdit = () => {
    setEditingProduct(null);
  };

  if (loading) {
    return <div className="p-4 text-center">Loading products...</div>;
  }

  if (error) {
    return <div className="p-4 text-center text-red-500">{error}</div>;
  }

  // ===== REPLACE THE 'return' STATEMENT OF THE 'MyShop' COMPONENT =====
  return (
    <div className="p-4 pb-28">
      <PromotionModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        product={productToPromote}
        onPromotionSet={handleSetPromotion}
      />

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-neutral-800">My Products</h1>
          <p className="text-neutral-500">{products.length} total products listed</p>
        </div>
      </div>
      
      
      {showScanner && (
        <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
          <Scan onClose={() => setShowScanner(false)} onProductSaved={handleProductSaved} />
        </div>
      )}

      {products.length === 0 && !loading ? (
        <div className="text-center py-16">
          <p className="text-neutral-500 mb-4">You haven't added any products yet.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {inStockProducts.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-success mb-3">Stock In ({inStockProducts.length})</h2>
              <div className="space-y-4">
                {inStockProducts.map(p => 
                  <ProductItem 
                    key={p._id} 
                    product={p} 
                    onStockToggle={handleStockToggle}
                    onPromoteClick={() => handleOpenPromotionModal(p)}
                    editingProduct={editingProduct}
                    editForm={editForm}
                    handleEditClick={() => handleEditClick(p)}
                    handleDelete={() => handleDelete(p._id)}
                    handleFormChange={handleFormChange}
                    handleEditSubmit={handleEditSubmit}
                    handleCancelEdit={handleCancelEdit}
                  />
                )}
              </div>
            </div>
          )}
          {outOfStockProducts.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-danger mb-3">Stock Out ({outOfStockProducts.length})</h2>
              <div className="space-y-4">
                {outOfStockProducts.map(p => 
                  <ProductItem 
                    key={p._id} 
                    product={p} 
                    onStockToggle={handleStockToggle}
                    onPromoteClick={() => handleOpenPromotionModal(p)}
                    editingProduct={editingProduct}
                    editForm={editForm}
                    handleEditClick={() => handleEditClick(p)}
                    handleDelete={() => handleDelete(p._id)}
                    handleFormChange={handleFormChange}
                    handleEditSubmit={handleEditSubmit}
                    handleCancelEdit={handleCancelEdit}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <button onClick={() => setShowScanner(true)} className="fixed bottom-24 right-6 bg-primary text-white h-16 w-16 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-all">
        <PlusIcon className="h-8 w-8" />
      </button>
    </div>
  );
  // =================
}

// ===== REPLACE THE EXISTING 'ProductItem' FUNCTION WITH THIS VERSION =====
function ProductItem({
  product, onStockToggle, onPromoteClick,
  editingProduct, editForm, handleEditClick, handleDelete,
  handleFormChange, handleEditSubmit, handleCancelEdit
}) {
  return (
    <Card className="!p-0 overflow-hidden relative">
      {/* --- Sale & Delete Badges --- */}
      {product.isOnSale && (
        <div className="absolute top-0 left-0 bg-yellow-400 text-yellow-900 text-xs font-bold px-3 py-1 rounded-br-lg z-10">
          SALE
        </div>
      )}
      {!editingProduct && (
        <button onClick={() => handleDelete(product._id)} className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/10 hover:bg-danger hover:text-white flex items-center justify-center z-10 transition-colors">
          <TrashIcon className="h-4 w-4" />
        </button>
      )}

      {editingProduct === product._id ? (
        // --- EDITING VIEW (Restored) ---
        <div className="p-4 space-y-3">
          <Input name="product_name" value={editForm.product_name} onChange={handleFormChange} placeholder="Product Name" />
          <div className="grid grid-cols-2 gap-3">
            <Input type="number" name="price" value={editForm.price} onChange={handleFormChange} placeholder="Price" />
            <Input type="number" name="count" value={editForm.count} onChange={handleFormChange} placeholder="Stock Count" />
          </div>
          <select name="unit" value={editForm.unit} onChange={handleFormChange} className="w-full p-3 border border-neutral-300 rounded-lg bg-white focus:ring-2 focus:ring-primary">
            <option value="per_kg">per kg</option>
            <option value="per_100g">per 100g</option>
            <option value="per_piece">per piece</option>
          </select>
          <div className="flex gap-2 pt-2">
            <Button onClick={() => handleEditSubmit(product._id)} className="flex-1">Save</Button>
            <Button onClick={handleCancelEdit} variant="secondary" className="flex-1">Cancel</Button>
          </div>
        </div>
      ) : (
        // --- DISPLAY VIEW (Redesigned) ---
        <>
          <div className="p-4">
            <div className="flex gap-4">
              <img src={product.imageUrl} alt={product.product_name} className="w-24 h-24 rounded-lg object-contain bg-neutral-100 border flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-bold text-lg text-neutral-800 line-clamp-2 pr-8">{product.product_name}</h3>
                <p className="text-neutral-600">
                  {product.isOnSale ? (
                    <>
                      <span className="text-danger font-bold text-lg">₹{product.salePrice}</span>
                      <s className="text-neutral-500 ml-2">₹{product.price}</s>
                    </>
                  ) : ( <span className="font-bold text-lg">₹{product.price}</span> )}
                  <span className="text-sm text-neutral-500"> / {product.unit.replace(/_/g, ' ')}</span>
                </p>
                <p className={`text-sm font-semibold mt-1 ${product.count > 5 ? 'text-primary' : 'text-danger'}`}>
                  {product.count} in stock
                </p>
              </div>
            </div>
          </div>
          <div className="flex gap-2 bg-neutral-50 border-t border-neutral-200 px-4 py-2">
            <button onClick={() => handleEditClick(product)} className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg hover:bg-neutral-200 text-sm font-semibold">
              <PencilIcon className="h-4 w-4" /> Edit
            </button>
            <button onClick={() => onPromoteClick(product)} className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg hover:bg-neutral-200 text-sm font-semibold">
              <TagIcon className="h-4 w-4" /> {product.isOnSale ? 'Edit Sale' : 'Promote'}
            </button>
            <button onClick={() => onStockToggle(product._id, !product.inStock)} className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg hover:bg-neutral-200 text-sm font-semibold">
              {product.inStock ? <XCircleIcon className="h-4 w-4 text-danger" /> : <CheckCircleIcon className="h-4 w-4 text-success" />}
              {product.inStock ? 'Stock Out' : 'Stock In'}
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
// =========================================================================