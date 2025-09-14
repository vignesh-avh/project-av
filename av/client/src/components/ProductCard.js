import React from 'react';
import { ShoppingBagIcon } from "lucide-react";
import { FiMapPin } from "react-icons/fi";
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';

// FIXED: Format distance display (moved outside component)
const formatDistance = (distance) => {
  if (distance === null || distance === undefined || isNaN(distance)) 
    return "Nearby";
  
  // Handle string inputs
  const distNum = typeof distance === 'string' ? parseFloat(distance) : distance;
  
  // Added validation for parsed number
  if (isNaN(distNum)) return "Nearby";
  if (distNum < 0.1) return "<100m away";
  if (distNum < 1) return `${Math.round(distNum * 1000)}m away`;
  return `${distNum.toFixed(1)}km away`;
};

export default function ProductCard({ product }) {
  const bgColor = `hsl(${product.product_name.length * 30}, 70%, 85%)`;
  
  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-neutral-200 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1 h-full flex flex-col">
      <div className="relative w-full aspect-square bg-neutral-100">
        {product.isOnSale && (
          <div className="absolute top-2 left-2 bg-danger text-white text-xs font-bold px-2 py-1 rounded-md z-10">
            SALE
          </div>
        )}
        {product.imageUrl ? (
          <LazyLoadImage
            alt={product.product_name}
            src={product.imageUrl}
            effect="blur"
            className="w-full h-full object-contain p-2"
            placeholderSrc="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-neutral-200">
            <ShoppingBagIcon className="h-12 w-12 text-neutral-400" />
          </div>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="font-semibold text-neutral-800 text-base line-clamp-1">{product.product_name}</h3>
          {product.isOnSale && (
          <div className="bg-red-100 text-red-700 p-2 rounded-md mt-2 text-xs">
            {product.saleDescription && (
              <p className="font-bold line-clamp-1">{product.saleDescription}</p>
            )}
            {typeof product.saleDaysLeft === 'number' && (
              <p className="font-semibold mt-1">
                {product.saleDaysLeft > 0
                  ? `Sale ends in ${product.saleDaysLeft} day${product.saleDaysLeft > 1 ? 's' : ''}`
                  : `Sale ends today!`
                }
              </p>
            )}
          </div>
        )}
          <p className="text-xs text-neutral-500 line-clamp-1 mt-1">Sold by: {product.shop_name || "Local Store"}</p>
          <div className="flex items-center text-xs text-neutral-500 mt-1">
            <FiMapPin className="mr-1 flex-shrink-0" size={12} />
            <span className="truncate">{formatDistance(product.distance)}</span>
          </div>
        </div>
        <div className="mt-4">
          {/* --- Price Information Row --- */}
          <div className="flex items-baseline gap-2">
            {product.isOnSale ? (
              <>
                <p className="text-xl font-bold text-danger">₹{product.salePrice}</p>
                <s className="text-sm text-neutral-500">₹{product.price}</s>
              </>
            ) : (
              <p className="text-xl font-bold text-neutral-900">₹{product.price}</p>
            )}
          </div>

          {/* --- Unit and Stock Count Row --- */}
          <div className="flex justify-between items-center mt-1">
            <p className="text-xs text-neutral-500 capitalize">{product.unit.replace(/_/g, ' ')}</p>
            {typeof product.count === 'number' && (
              <p className={`text-xs font-semibold ${product.count > 5 ? 'text-primary' : 'text-danger'}`}>
                {product.count} left
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}