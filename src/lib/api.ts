import { supabase } from './supabase';

interface ApiResponse<T> {
    data?: T;
    error?: string;
}

export interface GarageProfile {
    _id: string;
    name: string;
    location: {
        address: string;
        coordinates: [number, number];
    };
    serviceHours: string;
    workingDays: string;
    photoUrl?: string;
    rating?: number;
    totalReviews?: number;
}

export async function discoverGarages(
    lat: number,
    lng: number,
    radius: number = 5000
): Promise<ApiResponse<GarageProfile[]>> {
    // Verified, active garages NEAR the user. We pre-filter with a bounding box
    // (radius in metres → degrees) that fully contains the search circle, so the
    // nearby garages are actually returned instead of an arbitrary limited slice.
    // The caller then does precise haversine distance filtering + sorting.
    // (A PostGIS `earth_distance` query can replace this later for scale.)
    let query = supabase
        .from('garages')
        .select('id,name,address,latitude,longitude,service_hours,working_days,photo_url,rating,total_reviews')
        .eq('is_verified', true)
        .eq('is_offboarded', false);

    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
        const latDelta = radius / 111_320; // ~metres per degree of latitude
        const cosLat = Math.cos((lat * Math.PI) / 180) || 1;
        const lngDelta = radius / (111_320 * cosLat);
        query = query
            .gte('latitude', lat - latDelta)
            .lte('latitude', lat + latDelta)
            .gte('longitude', lng - lngDelta)
            .lte('longitude', lng + lngDelta);
    }

    const { data, error } = await query.limit(200);
    if (error) return { error: error.message };
    const garages: GarageProfile[] = (data ?? []).map((g: any) => ({
        _id: g.id,
        name: g.name,
        location: { address: g.address || '', coordinates: [g.longitude || 0, g.latitude || 0] },
        serviceHours: g.service_hours || '',
        workingDays: Array.isArray(g.working_days) ? g.working_days.join(',') : '',
        photoUrl: g.photo_url || undefined,
        rating: Number(g.rating) || 0,
        totalReviews: g.total_reviews || 0,
    }));
    return { data: garages };
}
