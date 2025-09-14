from pydantic import BaseModel

class ShopCreate(BaseModel):
    name: str
    rating: float
    latitude: float
    longitude: float
    store: str
    owner_id: str