import React, { useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

// Fix for default marker icon issue with webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

function LocationMarker({ position, setPosition }) {
  // This component will handle map events
  const map = useMapEvents({
    click(e) {
      // When map is clicked, update the marker's position
      setPosition(e.latlng);
      // Fly to the new position
      map.flyTo(e.latlng, map.getZoom());
    },
  });

  // This is the draggable marker (the pin)
  const markerEventHandlers = useMemo(
    () => ({
      dragend(e) {
        // When dragging ends, update the position
        setPosition(e.target.getLatLng());
      },
    }),
    [setPosition],
  );

  return (
    <Marker
      draggable={true}
      eventHandlers={markerEventHandlers}
      position={position}
    />
  );
}

export default function LocationPickerMap({ initialPosition, onLocationSelect }) {
  // The state for the marker's position
  const [position, setPosition] = useState(initialPosition);

  return (
    <div className="space-y-4">
      <div className="h-80 w-full rounded-lg overflow-hidden border-2 border-gray-300">
        <MapContainer
          center={initialPosition}
          zoom={13}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <LocationMarker position={position} setPosition={setPosition} />
        </MapContainer>
      </div>
      <button
        type="button"
        onClick={() => onLocationSelect(position)}
        className="bg-green-600 text-white py-3 px-4 rounded-lg w-full active:scale-95 transition-transform"
      >
        Confirm This Location
      </button>
    </div>
  );
}