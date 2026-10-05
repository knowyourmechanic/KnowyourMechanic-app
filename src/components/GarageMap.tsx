import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import GaragePhoto from './GaragePhoto';

interface GarageMapProps {
    garages: {
        id: string;
        name: string;
        lat: number;
        lng: number;
        rating?: number;
        reviews?: number;
        photo?: string;
        address?: string;
        phone?: string;
        color?: string; // optional hex color for marker
    }[];
    userLocation: { lat: number; lng: number };
    onGarageSelect?: (garage: GarageMapProps['garages'][number]) => void;
}

// Custom user location icon (blue pulsing dot)
const userIcon = L.divIcon({
    className: 'user-location-marker',
    html: `
        <div style="
            width: 20px;
            height: 20px;
            background: #3b82f6;
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 0 0 8px rgba(59, 130, 246, 0.3), 0 2px 8px rgba(0,0,0,0.3);
        "></div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
});

// Custom garage marker icon
const garageIcon = L.divIcon({
    className: 'garage-marker',
    html: `
        <div style="
            width: 36px;
            height: 36px;
            background: linear-gradient(135deg, #8b5cf6, #6366f1);
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
        ">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
        </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
});

// Create a dynamically colored garage icon
const createColoredIcon = (color: string) => L.divIcon({
    className: 'garage-marker',
    html: `
        <div style="
            width: 36px;
            height: 36px;
            background: ${color};
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            display: flex;
            align-items: center;
            justify-content: center;
        ">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
        </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
});

// Component to recenter map when location changes
function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
    const map = useMap();
    useEffect(() => {
        map.setView([lat, lng], map.getZoom());
    }, [lat, lng, map]);
    return null;
}

export default function GarageMap({ garages, userLocation, onGarageSelect }: GarageMapProps) {
    return (
        <MapContainer
            center={[userLocation.lat, userLocation.lng]}
            zoom={14}
            style={{ width: '100%', height: '100%', borderRadius: '1rem' }}
            zoomControl={false}
            attributionControl={false}
        >
            <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <RecenterMap lat={userLocation.lat} lng={userLocation.lng} />

            {/* User Location Marker */}
            <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
                <Popup className="custom-popup">
                    <div className="text-center px-2 py-1">
                        <p className="font-bold text-blue-600 text-xs">You are here</p>
                    </div>
                </Popup>
            </Marker>

            {/* Garage Markers */}
            {garages.map((garage) => (
                <Marker
                    key={garage.id}
                    position={[garage.lat, garage.lng]}
                    icon={garage.color ? createColoredIcon(garage.color) : garageIcon}
                    eventHandlers={{
                        click: () => onGarageSelect?.(garage),
                    }}
                >
                    <Popup className="custom-popup" minWidth={200} closeButton={false}>
                        <div className="flex gap-3 p-1 cursor-pointer" onClick={() => onGarageSelect?.(garage)}>
                            <GaragePhoto src={garage.photo} name={garage.name} className="w-12 h-12 rounded-lg flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-slate-900 text-sm truncate mb-0.5">{garage.name}</h3>
                                <div className="flex items-center gap-1 text-xs mb-1">
                                    {garage.reviews ? (
                                        <>
                                            <span className="text-amber-500 font-bold">★ {Number(garage.rating || 0).toFixed(1)}</span>
                                            <span className="text-slate-400">({garage.reviews})</span>
                                        </>
                                    ) : (
                                        <span className="text-emerald-600 font-bold">New on KYM</span>
                                    )}
                                </div>
                                <div className="text-blue-600 text-xs font-bold flex items-center gap-1">
                                    View Details <ArrowRight className="w-3 h-3" />
                                </div>
                            </div>
                        </div>
                    </Popup>
                </Marker>
            ))}
        </MapContainer>
    );
}
