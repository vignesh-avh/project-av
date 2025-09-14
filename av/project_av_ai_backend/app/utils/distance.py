from math import radians, sin, cos, sqrt, asin

def haversine(lat1, lon1, lat2, lon2):
    """Calculate distance between two points using Haversine formula"""
    # Convert to radians
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    
    # Haversine formula
    dlat = lat2 - lat1 
    dlon = lon2 - lon1 
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a)) 
    return c * 6371  # Earth radius in km

def isValidIndianCoordinate(lat, lng):
    """Validate if coordinates are within India"""
    return (
        isinstance(lat, (int, float)) and 
        isinstance(lng, (int, float)) and
        6.0 <= lat <= 36.0 and  # India lat range
        68.0 <= lng <= 98.0     # India lng range
    )